// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "../lib/i18n";
import type { OnlineRoom, RoomSnapshot } from "../lib/onlineRooms";
import OnlineRoomsPage from "./OnlineRoomsPage";
import ClassOnlineRoomCard from "./ClassOnlineRoomCard";
import { OnlineRoomSessionHost, OnlineRoomSessionProvider, ROOM_ROUTE_CHANGED } from "./OnlineRoomSession";
import { LearningNavigationProvider, LearningToolScope, useLearningNavigation } from "../lib/learningNavigation";
import { onlineRoomUrl } from "../lib/onlineRoomRoutes";

const mock = vi.hoisted(() => ({
  list: vi.fn(), lookup: vi.fn(), deleteRoom: vi.fn(), join: vi.fn(), read: vi.fn(), chat: vi.fn(), leave: vi.fn(), act: vi.fn(), watch: vi.fn(), create: vi.fn(), token: vi.fn(), manage: vi.fn(), canvas: vi.fn(), upload: vi.fn(), download: vi.fn(), classRoom: vi.fn(), rtcConnect: vi.fn(), rtcDisconnect: vi.fn(), videoAttach: vi.fn(), videoDetach: vi.fn(),
}));
vi.mock("../lib/onlineRooms", async actual => ({
  ...await actual<typeof import("../lib/onlineRooms")>(),
  classroomOnlineRoom: mock.classRoom, requestRoomCanvas: mock.canvas, sendMeetingFile: mock.upload, loadMeetingFile: mock.download,
  createOnlineRoom: mock.create, fetchMeetingToken: mock.token, controlOnlineMeeting: mock.manage,
  listOnlineRooms: mock.list, lookupOnlineRoomCode: mock.lookup, deleteOnlineRoom: mock.deleteRoom, joinOnlineRoom: mock.join, readOnlineRoom: mock.read, readOnlineRoomChat: mock.chat,
  pingOnlineRoom: mock.leave, actOnlineRoom: mock.act, watchOnlineRoom: mock.watch, loadRoomAvatars: vi.fn(async () => new Map()),
}));
vi.mock("livekit-client", async imported => {
  const rtc = await imported<typeof import("livekit-client")>();
  const track = { attach: mock.videoAttach, detach: mock.videoDetach };
  class FakeRoom {
    state: string = rtc.ConnectionState.Disconnected;
    activeSpeakers: unknown[] = [];
    canPlaybackAudio = true;
    screen = { identity: "remote", isSpeaking: true, getTrackPublication: (kind: string) => kind === rtc.Track.Source.ScreenShare ? { track, isMuted: false } : undefined };
    remoteParticipants = new Map([["remote", this.screen]]);
    localParticipant = {
      isMicrophoneEnabled: false, isCameraEnabled: false, isScreenShareEnabled: false,
      trackPublications: new Map(),
      setMicrophoneEnabled: async (enabled: boolean) => { this.localParticipant.isMicrophoneEnabled = enabled; this.update?.(); },
      getTrackPublication: () => undefined,
    };
    update: (() => void) | undefined;
    on(_event: string, handler: () => void) { this.update ??= handler; }
    removeAllListeners() { this.update = undefined; }
    async connect(...args: unknown[]) { mock.rtcConnect(...args); this.state = rtc.ConnectionState.Connected; }
    async disconnect(stopTracks: boolean) { mock.rtcDisconnect(stopTracks); }
    async startAudio() {}
  }
  return { ...rtc, Room: FakeRoom };
});
vi.mock("./OnlineRoomYouTube", () => ({ default: ({ volume }: { volume: number }) => <div data-test-player data-volume={volume}/> }));
const owner = "90000000-0000-4000-8000-000000000001";
const room: OnlineRoom = {
  id: "60000000-0000-4000-8000-000000000001", kind: "music", official: true, name: "Góc nhạc tập trung", topic: "Học cùng nhau",
  visibility: "public", layout: "classroom", music_enabled: true, requires_approval: false, host_id: null,
  host_name: "MindCanvas", occupancy: 1, capacity: 20,
};
const fixture = (seat = 3): RoomSnapshot => ({
  state: "active", room, can_manage: false, suggestions: false, server_time: "2026-11-24T07:00:00Z",
  playback: { video_id: "QhYS_p4m09A", title: "Piano", attribution: null, playing: true, loop: true, offset: 0, at: "2026-11-24T06:55:00Z", revision: 1 },
  members: [{ id: owner, seat, name: "Test learner" }], queue: [], waiting: [],
});
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal ??= function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function () { this.removeAttribute("open"); };
  window.history.replaceState({}, "", "/?learn=rooms");
  vi.clearAllMocks();
  mock.list.mockResolvedValue({ rooms: [room], can_create_public: false });
  mock.join.mockResolvedValue({ state: "active", name: room.name });
  mock.read.mockResolvedValue(fixture());
  mock.chat.mockResolvedValue({ state: "active", messages: [] });
  mock.leave.mockResolvedValue("left");
  mock.watch.mockImplementation(() => () => {});
  mock.act.mockImplementation(async (_id, _client, action) => {
    if (action.name === "seat") mock.read.mockResolvedValue(fixture(action.seat));
    return { state: "active" };
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); localStorage.clear(); sessionStorage.clear();
});
const tick = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 135)); });
const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === name || item.getAttribute("aria-label") === name)!;
it("enters an official room and changes the seat without tying it to a layout", async () => {
  await act(async () => root.render(<LanguageProvider><OnlineRoomsPage owner={owner}/></LanguageProvider>));
  await act(async () => button("Vào Góc nhạc tập trung").click());
  for (let n = 0; n < 8 && !host.querySelector(".online-room-seat"); n++) await tick();
  expect(host.querySelectorAll(".online-room-seat")).toHaveLength(20);
  expect(host.querySelector('[data-self="true"]')?.getAttribute("title")).toContain("Ghế 3");
  expect(host.querySelector("[data-test-player]")).toBeTruthy();
  await act(async () => button("Chuyển tới ghế 7").click());
  await tick();
  expect(host.querySelector('[data-self="true"]')?.getAttribute("title")).toContain("Ghế 7");
  const player = host.querySelector("[data-test-player]");
  await act(async () => button("Gọn").click());
  expect(host.querySelector(".online-room-compact-seats [data-self=true]")?.textContent).toContain("7");
  expect(host.querySelector("[data-test-player]")).toBe(player);
  await act(async () => button("Rời phòng").click());
  expect(mock.leave).toHaveBeenCalledWith(room.id, expect.any(String), true);
  expect(host.querySelector("[data-test-player]")).toBeNull();
});

it("does not open room media or join the live channel while approval is pending", async () => {
  mock.join.mockResolvedValue({ state: "waiting", name: "Phòng riêng" });
  window.history.replaceState({}, "", `/?learn=rooms&room=${room.id}&room_invite=${"a".repeat(64)}`);
  await act(async () => root.render(<LanguageProvider><OnlineRoomsPage owner={owner}/></LanguageProvider>));
  await tick();
  expect(host.textContent).toContain("Đang chờ chủ phòng duyệt");
  expect(mock.watch).not.toHaveBeenCalled();
  expect(mock.read).not.toHaveBeenCalled();
  expect(window.location.search).not.toContain("room_invite");
  await act(async () => button("Về sảnh").click());
  expect(mock.leave).toHaveBeenCalledWith(room.id, expect.any(String), true);
});


it("mutes the official piano locally without stopping the room or replacing the player", async () => {
  mock.read.mockResolvedValue({ ...fixture(), playback: { ...fixture().playback, video_id: "3Lfr3BhvkQY" } });
  await act(async () => root.render(<LanguageProvider><OnlineRoomsPage owner={owner}/></LanguageProvider>));
  await act(async () => button("Vào Góc nhạc tập trung").click());
  await tick();
  const player = host.querySelector("[data-test-player]")!;
  expect(player.getAttribute("data-volume")).toBe("0.65");
  await act(async () => button("Tắt tiếng").click());
  expect(host.querySelector("[data-test-player]")).toBe(player);
  expect(player.getAttribute("data-volume")).toBe("0");
  expect(mock.act).not.toHaveBeenCalled();
  await act(async () => button("Bật tiếng").click());
  expect(player.getAttribute("data-volume")).toBe("0.65");
});

it.each([
  { link: "https://music.youtube.com/playlist?list=PLExampleRoom", list: "PLExampleRoom", video: null },
  { link: "https://music.youtube.com/watch?v=5qap5aO4i8I", list: null, video: "5qap5aO4i8I" },
  { link: "", list: null, video: null },
  { link: "https://example.com/invalid", list: null, video: null },
])("validates and saves opening music when creating a room ($link)", async ({ link, list, video }) => {
  mock.create.mockResolvedValue(room.id);
  await act(async () => root.render(<LanguageProvider><OnlineRoomsPage owner={owner}/></LanguageProvider>));
  await act(async () => button("Tạo phòng").click());
  const form = host.querySelector<HTMLFormElement>(".online-room-create-form")!;
  const open = form.querySelector<HTMLInputElement>('input[type=url]')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  const write = (input: HTMLInputElement, value: string) => {
    setValue.call(input,value); input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  await act(async () => {
    write(form.querySelector("input")!, "Nhạc chung");
    if (link) write(open,link);
  });
  if (video) await act(async () => write(form.querySelector("input[maxlength='96']")!, "Bản mở đầu"));
  await act(async () => button("Tạo và vào phòng").click());
  if (link.includes("example.com")) {
    expect(mock.create).not.toHaveBeenCalled();
    expect(form.textContent).toContain("hợp lệ");
  } else if (list || video) {
    expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({
      openingTrack: { video_id: video, playlist_id: list, title: video ? "Bản mở đầu" : "Danh sách YouTube Music" },
    }));
  } else {
    expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Nhạc chung" }));
    expect(mock.create.mock.calls[0][0].openingTrack).toBeUndefined();
  }
});

it("creates a meeting with a table and lets people interact before connecting media", async () => {
  const meeting: OnlineRoom = { ...room, id: "7a000000-0000-4000-8000-000000000001", kind: "meeting", name: "Họp nhóm", layout: "table",
    official: false, music_enabled: false, visibility: "private", host_id: owner, requires_approval: true };
  const guest = "8a000000-0000-4000-8000-000000000001";
  mock.create.mockResolvedValue(meeting.id);
  mock.read.mockResolvedValue({ ...fixture(), room: meeting, can_manage: true, presenter_id: owner,
    members: [...fixture().members, { id: guest, name: "Bạn học", seat: 11 }] });
  mock.token.mockRejectedValue(new Error("Offline"));
  mock.manage.mockResolvedValue({ state: "active" });
  await act(async () => root.render(<LanguageProvider><OnlineRoomsPage owner={owner}/></LanguageProvider>));
  await act(async () => button("Tạo phòng").click());
  const select = host.querySelector<HTMLSelectElement>(".online-room-create-form select")!;
  expect(select).toBeTruthy();
  await act(async () => { select.value = "meeting"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  const name = host.querySelector<HTMLInputElement>(".online-room-create-form input")!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setValue.call(name, meeting.name); name.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => button("Tạo và vào phòng").click());
  for (let n = 0; n < 8 && !host.querySelector(".online-meeting-table"); n++) await tick();
  expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({ kind: "meeting", layout: "table", name: meeting.name }));
  expect(host.querySelectorAll(".online-meeting-seat")).toHaveLength(20);
  expect(host.querySelector(".online-meeting-seat[data-self=true]")?.getAttribute("title")).toContain("Ghế 3");
  expect(host.querySelector("[data-test-player]")).toBeNull();
  expect(mock.token).not.toHaveBeenCalled();
  await act(async () => button("Giơ tay").click());
  expect(mock.act).toHaveBeenCalledWith(meeting.id, expect.any(String), { name: "hand", raised: true });
  await act(async () => button("Vỗ tay").click());
  expect(mock.act).toHaveBeenCalledWith(meeting.id, expect.any(String), { name: "reaction", reaction: "clap" });
  await act(async () => button("Mọi người").click());
  await act(async () => button("Cho trình chiếu: Bạn học").click());
  expect(mock.manage).toHaveBeenCalledWith(meeting.id, expect.any(String), { name: "presenter", target: guest }, expect.any(AbortSignal));
  await act(async () => button("Kết nối cuộc gọi").click());
  expect(mock.token).toHaveBeenCalledWith(meeting.id, expect.any(String), expect.any(AbortSignal));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Không kết nối được cuộc gọi");
});

it("lets the host attach an independent Canvas and send a chat file without entering a call", async () => {
  const meeting: OnlineRoom = { ...room, id:"7a000000-0000-4000-8000-000000000011", name:"Họp nhóm", kind:"meeting", host_id:owner,
    official:false,music_enabled:false,layout:"table",visibility:"private" };
  let canvas: Record<string,unknown>|null = null;
  mock.read.mockResolvedValue({ ...fixture(),room:meeting,can_manage:true });
  mock.canvas.mockImplementation(async (_room,_client,action) => {
    if (action.op === "start") canvas = { revision:1,title:action.board.title,on_stage:true,allow_edit:false,can_edit:true,board:action.board };
    if (action.op === "permission") canvas = { ...canvas,revision:2,allow_edit:action.flag };
    return { state:"active",canvas };
  });
  const file = new File(["Xin chào"],"ghichu.txt",{ type:"text/plain" });
  mock.upload.mockImplementation(async (_room,_client,_file,id) => {
    mock.chat.mockResolvedValue({ state:"active",messages:[{ id:"7",author_id:owner,name:"Tester",body:file.name,created_at:new Date().toISOString(),
      file:{ id,name:file.name,mime:file.type,size:file.size } }] });
  });
  window.history.replaceState({}, "", `/?learn=rooms&room=${meeting.id}`);
  await act(async () => root.render(<LanguageProvider><OnlineRoomsPage owner={owner}/></LanguageProvider>));
  for (let attempt=0;attempt<8 && !button("Canvas");attempt++) await tick();
  await act(async () => { await import("./MeetingCanvasPanel"); button("Canvas").click(); });
  for (let attempt=0;attempt<12 && !button("Canvas trống");attempt++) await tick();
  expect(button("Canvas trống"),host.textContent ?? "").toBeTruthy();
  await act(async () => button("Canvas trống").click());
  expect(host.querySelector(".meeting-canvas-editor [aria-readonly=false]")).toBeTruthy();
  await act(async () => button("Cho thành viên sửa").click());
  expect(button("Khóa quyền sửa")).toBeTruthy();
  expect(mock.canvas).toHaveBeenCalledWith(meeting.id,expect.any(String),{ op:"permission",flag:true },expect.any(AbortSignal));
  const input = host.querySelector<HTMLInputElement>(".meeting-file-input")!;
  Object.defineProperty(input,"files",{ configurable:true,value:[file] });
  await act(async () => input.dispatchEvent(new Event("change",{ bubbles:true })));
  await act(async () => button("Gửi tệp").click());
  await tick();
  expect(mock.upload).toHaveBeenCalledWith(meeting.id,expect.any(String),file,expect.any(String),expect.any(AbortSignal));
  expect(host.querySelector(".meeting-chat-file")?.textContent).toContain("ghichu.txt");
  expect(button("Xem")).toBeTruthy();
  expect(button("Tải")).toBeTruthy();
  expect(mock.token).not.toHaveBeenCalled();
});


it("keeps reports available when the host has locked chat", async () => {
  mock.read.mockResolvedValue({ ...fixture(),room:{ ...room,chat_locked:true } });
  mock.chat.mockResolvedValue({ state:"active",messages:[{ id:"123",author_id:"peer",name:"Bạn học",body:"Nội dung cần kiểm tra",created_at:new Date().toISOString() }] });
  await act(async () => root.render(<LanguageProvider><OnlineRoomsPage owner={owner}/></LanguageProvider>));
  await act(async () => button("Vào Góc nhạc tập trung").click());
  await tick();
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Nội dung tin nhắn"]')?.disabled).toBe(true);
  expect(host.textContent).toContain("Chat đang khóa");
  await act(async () => button("Báo cáo tin nhắn").click());
  expect(host.querySelector("dialog")?.textContent).toContain("Nội dung cần kiểm tra");
  await act(async () => button("Gửi báo cáo").click());
  expect(mock.act).toHaveBeenCalledWith(room.id,expect.any(String),{ name:"report",id:"123",reason:"spam",detail:"" });
  expect(host.querySelector("dialog")).toBeNull();
  expect(host.textContent).toContain("Đã gửi báo cáo cho quản trị viên");
});

it("lets teachers open the class room and offers students entry only after it exists", async () => {
  const classId="60000000-0000-4000-8000-000000000010", onEnter=vi.fn();
  mock.classRoom.mockResolvedValue({ room:null });
  await act(async () => root.render(<LanguageProvider><ClassOnlineRoomCard key="student" classId={classId} teacher={false} onEnter={onEnter}/></LanguageProvider>));
  expect(button("Mở phòng cho lớp")).toBeUndefined();
  expect(host.textContent).toContain("Giáo viên chưa mở phòng");
  await act(async () => root.render(<LanguageProvider><ClassOnlineRoomCard key="teacher" classId={classId} teacher onEnter={onEnter}/></LanguageProvider>));
  mock.classRoom.mockResolvedValue({ room:{ ...room,classroom_id:classId } });
  await act(async () => button("Mở phòng cho lớp").click());
  expect(mock.classRoom).toHaveBeenCalledWith(classId,true);
  expect(onEnter).toHaveBeenCalledWith(room.id);
});

it("keeps leading zeros, asks for the password after lookup, and never adds the password to the link", async () => {
  mock.lookup.mockResolvedValue({ state: "found", id: room.id });
  mock.join.mockResolvedValueOnce({ state: "password_required" }).mockResolvedValueOnce({ state: "password_invalid" });
  await act(async () => root.render(<LanguageProvider><OnlineRoomsPage owner={owner}/></LanguageProvider>));
  const enterText = (input: HTMLInputElement, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await enterText(host.querySelector(".online-room-code-lookup input")!, "001247");
  await act(async () => button("Tìm theo mã").click());
  await tick();
  expect(mock.lookup).toHaveBeenCalledWith("001247");
  expect(mock.join).toHaveBeenCalledWith(room.id, expect.any(String), undefined, { code: "001247" });
  const password = host.querySelector<HTMLInputElement>(".online-room-password input")!;
  expect(password.type).toBe("password");
  await enterText(password, "notsame1");
  await act(async () => button("Vào phòng").click());
  expect(host.textContent).toContain("Sai mật khẩu phòng");
  expect(mock.join).toHaveBeenLastCalledWith(room.id, expect.any(String), undefined, { code: "001247", password: "notsame1" });
  expect(window.location.search).toContain("room_code=001247");
  expect(window.location.search).not.toContain("notsame1");
  expect(password.value).toBe("");
});

it("lets the host confirm deletion in the lobby, without a delete button for an official room", async () => {
  const owned = { ...room, id: "60000000-0000-4000-8000-000000000099", name: "Phòng của mình", code: "003000", host_id: owner, official: false };
  mock.list.mockResolvedValue({ rooms: [owned, room], can_create_public: false });
  mock.deleteRoom.mockImplementation(async () => {
    mock.list.mockResolvedValue({ rooms: [room], can_create_public: false });
    return { deleted: true };
  });
  await act(async () => root.render(<LanguageProvider><OnlineRoomsPage owner={owner}/></LanguageProvider>));
  expect(button("Xóa phòng: Góc nhạc tập trung")).toBeUndefined();
  expect(host.textContent).toContain("003000");
  await act(async () => button("Xóa phòng: Phòng của mình").click());
  expect(host.querySelector("dialog[open]")?.textContent).toContain("Mã phòng, liên kết mời");
  expect(mock.deleteRoom).not.toHaveBeenCalled();
  await act(async () => button("Xóa phòng").click());
  expect(mock.deleteRoom).toHaveBeenCalledWith(owned.id);
  expect(button("Vào Phòng của mình")).toBeUndefined();
  expect(button("Tạo phòng")).toBeTruthy();
});

function WorkspacePages() {
  const navigation = useLearningNavigation();
  return <OnlineRoomSessionProvider owner={owner} onRestore={id => {
    navigation.go("rooms");
    window.history.replaceState({}, "", onlineRoomUrl(id));
    window.dispatchEvent(new Event(ROOM_ROUTE_CHANGED));
  }}>
    <button onClick={() => navigation.go("quiz")}>Mở Quiz</button>
    <button onClick={() => navigation.go("rooms")}>Mở sảnh</button>
    {navigation.route.tab === "quiz" && <input aria-label="Đáp án Quiz" defaultValue="Đang làm bài"/>}
    <LearningToolScope tab="rooms" active={navigation.route.tab === "rooms"}><OnlineRoomsPage owner={owner}/></LearningToolScope>
    <OnlineRoomSessionHost owner={owner}/>
  </OnlineRoomSessionProvider>;
}
const workspacePages = () => <LanguageProvider><LearningNavigationProvider owner={owner}><WorkspacePages/></LearningNavigationProvider></LanguageProvider>;
const island = () => document.querySelector<HTMLElement>(".room-island")!;
const expandIsland = () => act(async () => island().querySelector<HTMLButtonElement>(".music-island-open")!.click());
const islandButton = (name: string) => [...island().querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === name)!;
it("retains the joined room and its player while opening Quiz and only releases the seat on Leave", async () => {
  await act(async () => root.render(workspacePages()));
  await act(async () => button("Vào Góc nhạc tập trung").click());
  for (let n = 0; n < 8 && !host.querySelector("[data-test-player]"); n++) await tick();
  const player = host.querySelector("[data-test-player]");
  const client = mock.join.mock.calls[0][1];
  await act(async () => button("Mở Quiz").click());
  expect(host.querySelector('[aria-label="Đáp án Quiz"]')).toBeTruthy();
  expect(island().querySelector(".room-youtube-slot")).toBeNull();
  expect(host.querySelector("[data-test-player]")).toBe(player);
  expect(mock.leave).not.toHaveBeenCalled();
  await expandIsland();
  expect(island().querySelector(".room-youtube-slot")).toBeTruthy();
  await act(async () => islandButton("Quay lại phòng").click());
  expect(host.querySelector(".online-room-session")?.hasAttribute("hidden")).toBe(false);
  expect(host.querySelector("[data-test-player]")).toBe(player);
  expect(mock.join).toHaveBeenCalledTimes(1);
  await act(async () => button("Mở Quiz").click());
  await expandIsland();
  await act(async () => islandButton("Rời phòng").click());
  expect(mock.leave).toHaveBeenCalledWith(room.id, client, true);
  expect(island()).toBeNull();
  expect(host.querySelector('[aria-label="Đáp án Quiz"]')).toBeTruthy();
});

it("keeps a single LiveKit connection and screen preview in the island, then closes on Leave", async () => {
  const meeting: OnlineRoom = { ...room, id: "7a000000-0000-4000-8000-000000000012", name: "Họp nhóm", kind: "meeting", layout: "table" };
  window.history.replaceState({}, "", onlineRoomUrl(meeting.id));
  mock.read.mockResolvedValue({ ...fixture(), room: meeting, presenter_id: "remote", members: [...fixture().members, { id: "remote", seat: 9, name: "Bạn học" }] });
  mock.token.mockResolvedValue({ url: "wss://rtc.example.test", token: "token" });
  await act(async () => root.render(workspacePages()));
  for (let n = 0; n < 8 && !button("Kết nối cuộc gọi"); n++) await tick();
  await act(async () => button("Kết nối cuộc gọi").click());
  expect(mock.rtcConnect).toHaveBeenCalledTimes(1);
  const devices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia() {}, getDisplayMedia() {} } });
  try {
    await act(async () => button("Mở Quiz").click());
    expect(mock.rtcDisconnect).not.toHaveBeenCalled();
    expect(mock.leave).not.toHaveBeenCalled();
    expect(island().querySelector("video")).toBeTruthy();
    expect(mock.videoAttach).toHaveBeenLastCalledWith(island().querySelector("video"));
    await act(async () => islandButton("Bật mic").click());
    expect(island().querySelector('[aria-label="Mic đang bật"]')).toBeTruthy();
    await act(async () => (island().querySelector(".music-island-open") as HTMLButtonElement).click());
    expect(island().querySelector("video")).toBeNull();
    expect(island().querySelector('[aria-label="Mic đang bật"]')).toBeTruthy();
    await act(async () => (island().querySelector(".music-island-open") as HTMLButtonElement).click());
    await act(async () => islandButton("Rời phòng").click());
    expect(mock.rtcDisconnect).toHaveBeenCalledTimes(1);
    expect(mock.rtcDisconnect).toHaveBeenCalledWith(true);
    expect(island()).toBeNull();
  } finally {
    if (devices) Object.defineProperty(navigator, "mediaDevices", devices);
    else Reflect.deleteProperty(navigator, "mediaDevices");
  }
});

it("plays the separate official audio source without a player frame or interruption on Quiz", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  try {
    mock.read.mockResolvedValue({ ...fixture(), playback: { ...fixture().playback, video_id: "3Lfr3BhvkQY" } });
    await act(async () => root.render(workspacePages()));
    await act(async () => button("Vào Góc nhạc tập trung").click());
    for (let n = 0; n < 8 && !button("Nghe piano nền"); n++) await tick();
    await act(async () => button("Nghe piano nền").click());
    const audio = host.querySelector("audio")!;
    expect(audio.getAttribute("src")).toContain("mindcanvas-focus-piano.mp3");
    expect(play).toHaveBeenCalled();
    await act(async () => button("Mở Quiz").click());
    expect(host.querySelector("audio")).toBe(audio);
    expect(host.querySelector("[data-test-player]")).toBeNull();
    expect(pause).not.toHaveBeenCalled();
    expect(mock.leave).not.toHaveBeenCalled();
    await act(async () => (island().querySelector(".music-island-open") as HTMLButtonElement).click());
    await act(async () => islandButton("Rời phòng").click());
    expect(pause).toHaveBeenCalledTimes(1);
    expect(host.querySelector("audio")).toBeNull();
  } finally { play.mockRestore(); pause.mockRestore(); }
});

it("asks before changing rooms and preserves the current seat if the user cancels", async () => {
  const second = { ...room, id: "7a000000-0000-4000-8000-000000000031", name: "Phòng thứ hai" };
  mock.list.mockResolvedValue({ rooms: [room, second], can_create_public: false });
  mock.read.mockImplementation(async (id: string) => ({ ...fixture(), room: id === second.id ? second : room }));
  await act(async () => root.render(workspacePages()));
  await act(async () => button("Vào Góc nhạc tập trung").click());
  for (let n = 0; n < 8 && !button("Thu nhỏ phòng"); n++) await tick();
  await act(async () => button("Thu nhỏ phòng").click());
  for (let n = 0; n < 8 && !button("Vào Phòng thứ hai"); n++) await tick();
  await act(async () => button("Vào Phòng thứ hai").click());
  const dialogButton = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("dialog[open] button")].find(b => b.textContent === name)!;
  expect(dialogButton("Rời phòng và chuyển")).toBeTruthy();
  expect(mock.join).toHaveBeenCalledTimes(1);
  await act(async () => dialogButton("Ở lại phòng cũ").click());
  expect(mock.leave).not.toHaveBeenCalled();
  await act(async () => button("Vào Phòng thứ hai").click());
  await act(async () => dialogButton("Rời phòng và chuyển").click());
  for (let n = 0; n < 8 && mock.join.mock.calls.length < 2; n++) await tick();
  expect(mock.leave).toHaveBeenCalledTimes(1);
  expect(mock.leave.mock.calls[0][0]).toBe(room.id);
  expect(mock.join.mock.calls[1][0]).toBe(second.id);
});

it("stops a room player when the host closes the room while the learner is on Quiz", async () => {
  const refresh = vi.fn();
  mock.watch.mockImplementation((_id, listener) => { refresh.mockImplementation(listener); return () => {}; });
  await act(async () => root.render(workspacePages()));
  await act(async () => button("Vào Góc nhạc tập trung").click());
  for (let n = 0; n < 8 && !host.querySelector("[data-test-player]"); n++) await tick();
  await act(async () => button("Mở Quiz").click());
  mock.read.mockResolvedValue({ state: "closed" });
  await act(async () => refresh("room"));
  for (let n = 0; n < 8 && host.querySelector("[data-test-player]"); n++) await tick();
  expect(host.querySelector("[data-test-player]")).toBeNull();
  expect(island().querySelector('[aria-label="Phòng đã đóng"]')).toBeTruthy();
  expect(host.querySelector('[aria-label="Đáp án Quiz"]')).toBeTruthy();
});
