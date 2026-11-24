import type { BoardState } from "@mindcanvas/shared";
import { getCurrentSession, supabase } from "./supabase";
import { signProfileAvatars } from "./accountProfile";

export type RoomLayout = "classroom" | "compact" | "table";
export type RoomReaction = "clap" | "heart" | "like";
export const OFFICIAL_PIANO_VIDEO = "3Lfr3BhvkQY";
export type RoomVisibility = "public" | "private";
export type RoomStatus = "active" | "waiting" | "waiting_full" | "full" | "closed" | "removed" | "expired" | "other_tab" | "invite_required" | "class_required" | "password_required" | "password_invalid" | "password_rate" | "left";
export type OnlineRoom = {
  id: string; kind: "music" | "meeting"; name: string; topic: string; visibility: RoomVisibility; layout: RoomLayout;
  official: boolean; music_enabled: boolean; requires_approval: boolean; host_id: string | null;
  host_name: string; occupancy: number; capacity: number; classroom_id?: string | null; chat_locked?: boolean;
  code?: string | null; entry_mode?: "link" | "approval" | "password" | "classroom" | "open";
};
export type RoomPlaylistTrack = { id: string; video_id: string; title: string; status: "queued" | "pending"; requested_by: string | null; name: string };
export type RoomAttendee = { id: string; name: string; seat: number; avatar_url?: string | null; avatar_slot?: number | null; avatar_revision?: string | null; hand_raised_at?: string | null; reaction?: RoomReaction | null; reaction_at?: string | null };
export type RoomPlayback = { video_id: string | null; title: string | null; attribution: string | null; playing: boolean; loop: boolean; offset: number; at: string; revision: number };
export type RoomMessage = { id: string; author_id: string | null; name: string; body: string; created_at: string; file?: MeetingRoomFile };
export type MeetingRoomFile = { id: string; name: string; mime: string; size: number };
export const MEETING_FILE_LIMIT = 8 * 1024 * 1024;
export const MEETING_FILE_ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg,.webp,.txt";
export type RoomCanvasSummary = { revision: number; title: string; on_stage: boolean; allow_edit: boolean; can_edit: boolean; board?: unknown };
export type RoomCanvasResult = RoomUnavailable | { state: "active"; canvas?: RoomCanvasSummary | null; conflict?: boolean };
export type RoomCanvasAction =
  | { op: "read"; revision?: number }
  | { op: "start"; board: BoardState }
  | { op: "save"; revision: number; board: BoardState }
  | { op: "permission" | "stage"; flag: boolean };
export type RoomSnapshot = {
  state: "active"; room: OnlineRoom; server_time: string; can_manage: boolean; suggestions: boolean; presenter_id?: string | null;
  playback: RoomPlayback; members: RoomAttendee[]; waiting: Pick<RoomAttendee, "id" | "name">[]; queue: RoomPlaylistTrack[];
};
export type RoomUnavailable = { state: Exclude<RoomStatus, "active"> };
export type RoomCreate = { kind: OnlineRoom["kind"]; name: string; topic: string; visibility: RoomVisibility; layout: RoomLayout; entryMode: "approval" | "password"; password?: string; suggestions: boolean };

export type RoomReportReason = "spam" | "harassment" | "inappropriate" | "other";

type RoomAction =
  | { name: "seat"; seat: number }
  | { name: "chat"; body: string; key: string }
  | { name: "chat_delete"; id: string }
  | { name: "chat_lock"; locked: boolean }
  | { name: "report"; id?: string; reason: RoomReportReason; detail: string }
  | { name: "track"; video_id: string; title: string }
  | { name: "track_decision"; id: string; decision: "approve" | "remove" }
  | { name: "queue_move"; id: string; direction: "up" | "down" }
  | { name: "play" | "pause" | "next"; revision: number }
  | { name: "suggestions"; enabled: boolean }
  | { name: "admit" | "deny" | "remove_member" | "transfer"; id: string }
  | { name: "hand"; raised: boolean }
  | { name: "reaction"; reaction: RoomReaction }
  | { name: "close" | "invite" };
export type MeetingCommand = { name: "close" } | { name: "mute" | "remove" | "transfer"; target: string } | { name: "presenter"; target: string | null };
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
export const classroomOnlineRoom = (classId: string, open = false, signal?: AbortSignal) =>
  rpc<{ room: OnlineRoom | null }>("online_classroom_room",{ p_class:classId,p_open:open },signal);
export const createOnlineRoom = (room: RoomCreate) => rpc<string>("create_online_room_v640", {
  p_kind: room.kind, p_name: room.name, p_topic: room.topic, p_visibility: room.visibility, p_layout: room.layout,
  p_suggestions: room.suggestions, p_mode: room.visibility === "private" ? room.entryMode : "approval",
  p_password: room.visibility === "private" && room.entryMode === "password" ? room.password ?? null : null,
});
export const lookupOnlineRoomCode = (code: string) =>
  rpc<{ state: "found"; id: string } | { state: "not_found" | "rate" }>("lookup_online_room_code", { p_code: code });
export const joinOnlineRoom = (id: string, client: string, invite?: string, access?: { code?: string; password?: string }) => rpc<{ state: RoomStatus; name?: string }>("join_online_room_v640", {
  ...sessionArgs(id, client), p_invite: invite ?? null, p_code: access?.code ?? null, p_password: access?.password ?? null,
});
export const pingOnlineRoom = (id: string, client: string, leave = false) => rpc<RoomStatus>("ping_online_room", { ...sessionArgs(id, client), p_leave: leave });
export const readOnlineRoom = (id: string, client: string, signal?: AbortSignal) => rpc<RoomSnapshot | RoomUnavailable>("read_online_room", sessionArgs(id, client), signal);
export const readOnlineRoomChat = (id: string, client: string, signal?: AbortSignal) => rpc<{ state: "active"; messages: RoomMessage[] } | RoomUnavailable>("read_online_room_chat", sessionArgs(id, client), signal);
export const actOnlineRoom = (id: string, client: string, { name, ...payload }: RoomAction) => rpc<{ state: RoomStatus; invite?: string }>("act_online_room", { ...sessionArgs(id, client), p_action: name, p_payload: payload });

const meetingApiBase = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8787").replace(/\/$/, "");
async function meetingRequest<T>(id: string, path: "token" | "manage" | null, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const access = (await getCurrentSession())?.access_token;
  if (!access) throw new OnlineRoomError("ONLINE_MEDIA_DENIED");
  const request = new AbortController();
  const cancel = () => request.abort();
  const timer = setTimeout(cancel, 18000);
  if (signal?.aborted) cancel(); else signal?.addEventListener("abort", cancel, { once: true });
  try {
    const response = await fetch(`${meetingApiBase}/api/online-meetings/${encodeURIComponent(id)}${path ? `/${path}` : ""}`, {
      method: path ? "POST" : "DELETE", headers: { Authorization: `Bearer ${access}`, ...(body && { "Content-Type": "application/json" }) },
      signal: request.signal, body: body && JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new OnlineRoomError(typeof result?.code === "string" ? result.code : "ONLINE_MEDIA_PROVIDER");
    return result as T;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
}
export const deleteOnlineRoom = (id: string) => meetingRequest<{ deleted: true }>(id, null);
export type MeetingConnection = { url: string; token: string };
export const fetchMeetingToken = (id: string, client: string, signal?: AbortSignal) =>
  meetingRequest<MeetingConnection>(id, "token", { client }, signal);
export const controlOnlineMeeting = (id: string, client: string, action: MeetingCommand, signal?: AbortSignal) =>
  meetingRequest<{ state: "active" | "closed" }>(id, "manage", { client, ...action }, signal);

export const requestRoomCanvas = (id: string, client: string, action: RoomCanvasAction, signal?: AbortSignal) =>
  rpc<RoomCanvasResult>("online_meeting_canvas", { ...sessionArgs(id, client), p_op: action.op,
    ...("revision" in action ? { p_revision: action.revision } : {}),
    ...("flag" in action ? { p_flag: action.flag } : {}), ...("board" in action ? { p_board: action.board } : {}) }, signal);

async function meetingFileRequest(id: string, suffix: string, body: BodyInit, signal?: AbortSignal) {
  const access = (await getCurrentSession())?.access_token;
  if (!access) throw new OnlineRoomError("ONLINE_MEDIA_DENIED");
  const request = new AbortController(), cancel = () => request.abort();
  const timer = setTimeout(cancel, 65000);
  if (signal?.aborted) cancel(); else signal?.addEventListener("abort", cancel, { once: true });
  try {
    const response = await fetch(`${meetingApiBase}/api/online-meetings/${encodeURIComponent(id)}/files${suffix}`, {
      method: "POST", headers: { Authorization: `Bearer ${access}`, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) },
      cache: "no-store", signal: request.signal, body,
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      throw new OnlineRoomError(failure?.code ?? "ONLINE_FILE_SERVICE");
    }
    return await response.blob();
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
}
export async function sendMeetingFile(room: string, client: string, file: File, key: string, signal?: AbortSignal) {
  if (!file.size || file.size > MEETING_FILE_LIMIT) throw new OnlineRoomError("ONLINE_FILE_SIZE");
  const form = new FormData();
  form.set("client", client); form.set("id", key); form.set("file", file);
  await meetingFileRequest(room, "", form, signal);
}
export const loadMeetingFile = (room: string, client: string, id: string, signal?: AbortSignal) =>
  meetingFileRequest(room, `/${encodeURIComponent(id)}/content`, JSON.stringify({ client }), signal);

export function watchOnlineRoom(id: string, onChange: (area: "room" | "chat" | "canvas") => void, onStatus: (live: boolean) => void) {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client.channel(`mindcanvas-online-room:${id}`, { config: { private: true } });
  channel.on("broadcast", { event: "changed" }, event => {
    const area = event.payload?.area;
    onChange(area === "chat" || area === "canvas" ? area : "room");
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
    ONLINE_CLASS_DENIED: ["Chỉ giáo viên và thành viên đang học trong lớp mới có quyền vào.", "Only the teacher and enrolled members can access this room."],
    ONLINE_CLASS_HOST: ["Giáo viên là chủ phòng học của lớp.", "The teacher stays the host of this classroom room."],
    ONLINE_CHAT_LOCKED: ["Chủ phòng đã khóa gửi tin nhắn và tệp.", "Posting and attachments are locked by the host."],
    ONLINE_MESSAGE_GONE: ["Tin nhắn không còn trong phòng.", "This message is no longer available."],
    ONLINE_REPORT_LIMIT: ["Bạn đã gửi đủ 5 báo cáo trong 24 giờ.", "You have reached the five-report limit for 24 hours."],
    ONLINE_REPORT_GONE: ["Báo cáo này đã được xử lý.", "This report has already been reviewed."],
    ONLINE_OPEN_LIMIT: ["Đã đạt giới hạn số phòng đang mở. Hãy thử lại khi có phòng đóng.", "The concurrent room limit is reached. Try again when a room closes."],
    ONLINE_PUBLIC_LIMIT: ["Đã đạt giới hạn phòng công khai đang mở.", "The concurrent public room limit is reached."],
    ONLINE_PILOT_OFF: ["Chưa mở thử nghiệm phòng công khai mới.", "The public room pilot is not accepting new rooms."],
    ONLINE_PILOT_METRICS_REQUIRED: ["Cần một phiên LiveKit hoàn tất trong 7 ngày qua và số liệu Usage/Billing đã đối chiếu trong tháng này.", "A completed LiveKit session within 7 days and this month’s reviewed Usage/Billing figures are required."],
    ONLINE_ROLLOUT_UNAVAILABLE: ["Chưa tải được phần quản trị Phòng Online.", "Online Rooms administration is unavailable."],
    ONLINE_UNAVAILABLE: ["Phòng Online chưa được bật trên máy chủ này.", "Online Rooms are not set up on this server yet."],
    ONLINE_PUBLIC_DENIED: ["Tài khoản này chưa được quyền mở phòng công khai.", "This account cannot open public rooms yet."],
    ONLINE_PASSWORD_FORMAT: ["Mật khẩu cần từ 6 đến 64 ký tự và tối đa 72 byte. Hãy rút ngắn nếu dùng nhiều ký tự có dấu hoặc emoji.", "Use 6–64 characters and at most 72 bytes. Shorten the password if it contains many accented characters or emoji."],
    ONLINE_ROOM_GONE: ["Phòng này không còn tồn tại.", "This room is no longer available."],
    ONLINE_ROOM_LIMIT: ["Bạn đã có một phòng đang mở. Xóa phòng cũ trong sảnh để tạo phòng mới.", "You already have an open room. Delete it in the lobby to create another."],
    ONLINE_HOST_ONLY: ["Thao tác này dành cho chủ phòng.", "Only the room host can do this."],
    ONLINE_INPUT: ["Nội dung chưa hợp lệ. Hãy kiểm tra lại.", "Check the information and try again."],
    ONLINE_SEAT_TAKEN: ["Ghế này vừa có người ngồi. Chọn ghế trống khác nhé.", "Someone just took this seat. Choose another empty one."],
    ONLINE_RATE: ["Bạn gửi hơi nhanh. Chờ vài giây rồi gửi tiếp.", "You are sending too quickly. Wait a few seconds."],
    ONLINE_SUGGESTIONS_OFF: ["Chủ phòng đã tắt đề xuất bài.", "The host has turned off track suggestions."],
    ONLINE_DUPLICATE_TRACK: ["Bài này đang phát hoặc đã có trong hàng đợi.", "This track is already playing or in the queue."],
    ONLINE_QUEUE_FULL: ["Hàng đợi hoặc lượt đề xuất của bạn đã đầy.", "The queue or your suggestion allowance is full."],
    ONLINE_PLAYBACK_CHANGED: ["Bài đang phát đã thay đổi. Hãy thử lại sau khi cập nhật.", "Playback has changed. Try again after the room updates."],
    ONLINE_MEMBER_GONE: ["Người này vừa rời phòng.", "This participant has left the room."],
    ONLINE_MEDIA_DISABLED: ["Máy chủ chưa cấu hình cuộc gọi. Bạn vẫn có thể dùng chat.", "Calls are not configured on this server. You can still use chat."],
    ONLINE_MEDIA_DATABASE: ["Dịch vụ cấp quyền cuộc gọi chưa sẵn sàng.", "The call authorization service is unavailable."],
    ONLINE_MEDIA_DENIED: ["Phiên này chưa có quyền kết nối cuộc gọi. Hãy vào lại phòng.", "This session cannot join the call. Re-enter the room."],
    ONLINE_MEDIA_PROVIDER: ["Dịch vụ cuộc gọi chưa phản hồi. Hãy thử lại.", "The call service did not respond. Try again."],
    ONLINE_CANVAS_TOO_BIG: ["Canvas đã vượt giới hạn 1 MB. Hãy tải bản nháp về hoặc bớt nội dung.", "This Canvas exceeds the 1 MB limit. Download your draft or reduce its size."],
    ONLINE_CANVAS_READ_ONLY: ["Canvas đã chuyển sang chế độ chỉ xem.", "The Canvas is now view-only."],
    ONLINE_CANVAS_EXISTS: ["Phòng đã có Canvas. Dùng lại bản đã lưu.", "This room already has a Canvas. Resume the saved copy."],
    ONLINE_FILE_GONE: ["Tệp này không còn trong chat của phòng.", "This file is no longer in the room chat."],
    ONLINE_FILE_SIZE: ["Mỗi tệp phải có nội dung và tối đa 8 MB.", "Each file must have content and be at most 8 MB."],
    ONLINE_FILE_TYPE: ["Chỉ hỗ trợ tệp PDF, Word (.docx), PNG, JPG, WebP hoặc TXT hợp lệ.", "Use a valid PDF, Word (.docx), PNG, JPG, WebP, or TXT file."],
    ONLINE_FILE_QUOTA: ["Phòng đã đạt giới hạn 20 tệp hoặc 40 MB.", "The room has reached its 20-file or 40 MB limit."],
    ONLINE_FILE_PENDING: ["Tệp đang được xử lý. Chờ một lúc rồi thử lại.", "The file is being processed. Wait a moment and try again."],
    ONLINE_FILE_SERVICE: ["Không kết nối được kho tệp của phòng.", "Could not reach the room file storage."],
    ONLINE_MUSIC_LOCKED: ["Nhạc của phòng này đã được thiết lập sẵn.", "Music in this room is preset."],
  };
  return messages[key]?.[vi ? 0 : 1] ?? (vi ? "Không kết nối được với phòng. Hãy thử lại." : "Could not reach the room. Try again.");
}
