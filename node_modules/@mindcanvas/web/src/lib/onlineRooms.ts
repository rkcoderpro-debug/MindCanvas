import { supabase } from "./supabase";
import { signProfileAvatars } from "./accountProfile";

export type RoomLayout = "classroom" | "compact";
export type RoomVisibility = "public" | "private";
export type RoomStatus = "active" | "waiting" | "waiting_full" | "full" | "closed" | "removed" | "expired" | "other_tab" | "invite_required" | "left";
export type OnlineRoom = {
  id: string; kind: "music"; name: string; topic: string; visibility: RoomVisibility; layout: RoomLayout;
  official: boolean; music_enabled: boolean; requires_approval: boolean; host_id: string | null;
  host_name: string; occupancy: number; capacity: number;
};
export type RoomPlaylistTrack = { id: string; video_id: string; title: string; status: "queued" | "pending"; requested_by: string | null; name: string };
export type RoomAttendee = { id: string; name: string; seat: number; avatar_url?: string | null; avatar_slot?: number | null; avatar_revision?: string | null };
export type RoomPlayback = { video_id: string | null; title: string | null; attribution: string | null; playing: boolean; loop: boolean; offset: number; at: string; revision: number };
export type RoomMessage = { id: string; author_id: string | null; name: string; body: string; created_at: string };
export type RoomSnapshot = {
  state: "active"; room: OnlineRoom; server_time: string; can_manage: boolean; suggestions: boolean;
  playback: RoomPlayback; members: RoomAttendee[]; waiting: Pick<RoomAttendee, "id" | "name">[]; queue: RoomPlaylistTrack[];
};
export type RoomUnavailable = { state: Exclude<RoomStatus, "active"> };
export type RoomCreate = { name: string; topic: string; visibility: RoomVisibility; layout: RoomLayout; approve: boolean; suggestions: boolean };

type RoomAction =
  | { name: "seat"; seat: number }
  | { name: "chat"; body: string; key: string }
  | { name: "chat_delete"; id: string }
  | { name: "track"; video_id: string; title: string }
  | { name: "track_decision"; id: string; decision: "approve" | "remove" }
  | { name: "queue_move"; id: string; direction: "up" | "down" }
  | { name: "play" | "pause" | "next"; revision: number }
  | { name: "suggestions"; enabled: boolean }
  | { name: "admit" | "deny" | "remove_member" | "transfer"; id: string }
  | { name: "close" | "invite" };
export type { RoomAction };

export class OnlineRoomError extends Error {
  constructor(readonly issue: string) { super(issue); }
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new OnlineRoomError("ONLINE_UNAVAILABLE");
  const request = new AbortController();
  const cancel = () => request.abort();
  const timer = setTimeout(cancel, 10000);
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  try {
    const { data, error } = await supabase.rpc(name, args).abortSignal(request.signal);
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") throw new OnlineRoomError("ONLINE_UNAVAILABLE");
      const recognized = /^ONLINE_[A-Z_]+$/.test(error.message) ? error.message : "ONLINE_NETWORK";
      throw new OnlineRoomError(recognized);
    }
    if (data === null) throw new OnlineRoomError("ONLINE_NETWORK");
    return data as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

const sessionArgs = (id: string, client: string) => ({ p_room: id, p_client: client });
export const listOnlineRooms = (signal?: AbortSignal) => rpc<{ rooms: OnlineRoom[]; can_create_public: boolean }>("list_online_rooms", {}, signal);
export const createOnlineRoom = (room: RoomCreate) => rpc<string>("create_online_music_room", {
  p_name: room.name, p_topic: room.topic, p_visibility: room.visibility, p_layout: room.layout, p_approval: room.approve, p_suggestions: room.suggestions,
});
export const joinOnlineRoom = (id: string, client: string, invite?: string) => rpc<{ state: RoomStatus; name?: string }>("join_online_room", { ...sessionArgs(id, client), p_invite: invite ?? null });
export const pingOnlineRoom = (id: string, client: string, leave = false) => rpc<RoomStatus>("ping_online_room", { ...sessionArgs(id, client), p_leave: leave });
export const readOnlineRoom = (id: string, client: string, signal?: AbortSignal) => rpc<RoomSnapshot | RoomUnavailable>("read_online_room", sessionArgs(id, client), signal);
export const readOnlineRoomChat = (id: string, client: string, signal?: AbortSignal) => rpc<{ state: "active"; messages: RoomMessage[] } | RoomUnavailable>("read_online_room_chat", sessionArgs(id, client), signal);
export const actOnlineRoom = (id: string, client: string, { name, ...payload }: RoomAction) => rpc<{ state: RoomStatus; invite?: string }>("act_online_room", { ...sessionArgs(id, client), p_action: name, p_payload: payload });

export function watchOnlineRoom(id: string, onChange: (area: "room" | "chat") => void, onStatus: (live: boolean) => void) {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client.channel(`mindcanvas-online-room:${id}`, { config: { private: true } });
  channel.on("broadcast", { event: "changed" }, event => {
    onChange(event.payload?.area === "chat" ? "chat" : "room");
  }).subscribe(status => onStatus(status === "SUBSCRIBED"));
  return () => { void client.removeChannel(channel); };
}

export async function loadRoomAvatars(members: readonly RoomAttendee[], owner: string, signal: AbortSignal) {
  return signProfileAvatars(members.map(member => {
    let avatar_url: string | undefined;
    try {
      const url = new URL(member.avatar_url ?? "");
      if (url.protocol === "https:" && /^lh[3-6]\.googleusercontent\.com$/.test(url.hostname) && !url.username && !url.password) avatar_url = url.href;
    } catch { /* use the member's initials */ }
    return { id: member.id, avatar_url, avatar_slot: member.avatar_slot, avatar_revision: member.avatar_revision };
  }), owner, signal);
}

export function youtubeRoomVideo(raw: string) {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.replace(/^www\./,"");
  const id = host === "youtu.be" ? url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1]
    : ["youtube.com","music.youtube.com","m.youtube.com"].includes(host) && url.pathname === "/watch" ? url.searchParams.get("v")
    : null;
  return id && /^[0-9A-Za-z_-]{11}$/.test(id) ? id : null;
}

/** Share the scheduled playback clock, not the audio/video stream. */
export function onlinePlaybackTime(playback: RoomPlayback, serverNow: number, duration = 0) {
  const elapsed = playback.playing ? Math.max(0, (serverNow - Date.parse(playback.at)) / 1000 || 0) : 0;
  const position = Math.max(0, Number(playback.offset) || 0) + elapsed;
  if (duration > 0 && Number.isFinite(duration)) return playback.loop ? position % duration : Math.min(position, Math.max(0, duration - 0.15));
  return playback.loop ? 0 : position;
}

export function roomIssue(error: unknown, vi: boolean) {
  const key = error instanceof OnlineRoomError ? error.issue : "";
  const messages: Record<string, [string,string]> = {
    ONLINE_UNAVAILABLE: ["Phòng Online chưa được bật trên máy chủ này.", "Online Rooms are not set up on this server yet."],
    ONLINE_PUBLIC_DENIED: ["Tài khoản này chưa được quyền mở phòng công khai.", "This account cannot open public rooms yet."],
    ONLINE_ROOM_LIMIT: ["Bạn đã có một phòng đang mở. Vào sảnh để quay lại phòng đó.", "You already have an open room. Return to it from the lobby."],
    ONLINE_HOST_ONLY: ["Thao tác này dành cho chủ phòng.", "Only the room host can do this."],
    ONLINE_INPUT: ["Nội dung chưa hợp lệ. Hãy kiểm tra lại.", "Check the information and try again."],
    ONLINE_SEAT_TAKEN: ["Ghế này vừa có người ngồi. Chọn ghế trống khác nhé.", "Someone just took this seat. Choose another empty one."],
    ONLINE_RATE: ["Bạn gửi hơi nhanh. Chờ vài giây rồi gửi tiếp.", "You are sending too quickly. Wait a few seconds."],
    ONLINE_SUGGESTIONS_OFF: ["Chủ phòng đã tắt đề xuất bài.", "The host has turned off track suggestions."],
    ONLINE_DUPLICATE_TRACK: ["Bài này đang phát hoặc đã có trong hàng đợi.", "This track is already playing or in the queue."],
    ONLINE_QUEUE_FULL: ["Hàng đợi hoặc lượt đề xuất của bạn đã đầy.", "The queue or your suggestion allowance is full."],
    ONLINE_PLAYBACK_CHANGED: ["Bài đang phát đã thay đổi. Hãy thử lại sau khi cập nhật.", "Playback has changed. Try again after the room updates."],
    ONLINE_MEMBER_GONE: ["Người này vừa rời phòng.", "This participant has left the room."],
    ONLINE_MUSIC_LOCKED: ["Nhạc của phòng này đã được thiết lập sẵn.", "Music in this room is preset."],
  };
  return messages[key]?.[vi ? 0 : 1] ?? (vi ? "Không kết nối được với phòng. Hãy thử lại." : "Could not reach the room. Try again.");
}
