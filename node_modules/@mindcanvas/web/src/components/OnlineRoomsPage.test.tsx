// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "../lib/i18n";
import type { OnlineRoom, RoomSnapshot } from "../lib/onlineRooms";
import OnlineRoomsPage from "./OnlineRoomsPage";
import ClassOnlineRoomCard from "./ClassOnlineRoomCard";

const mock = vi.hoisted(() => ({
  list: vi.fn(), lookup: vi.fn(), deleteRoom: vi.fn(), join: vi.fn(), read: vi.fn(), chat: vi.fn(), leave: vi.fn(), act: vi.fn(), watch: vi.fn(), create: vi.fn(), token: vi.fn(), manage: vi.fn(), canvas: vi.fn(), upload: vi.fn(), download: vi.fn(), classRoom: vi.fn(),
}));
vi.mock("../lib/onlineRooms", async actual => ({
  ...await actual<typeof import("../lib/onlineRooms")>(),
  classroomOnlineRoom: mock.classRoom, requestRoomCanvas: mock.canvas, sendMeetingFile: mock.upload, loadMeetingFile: mock.download,
  createOnlineRoom: mock.create, fetchMeetingToken: mock.token, controlOnlineMeeting: mock.manage,
  listOnlineRooms: mock.list, lookupOnlineRoomCode: mock.lookup, deleteOnlineRoom: mock.deleteRoom, joinOnlineRoom: mock.join, readOnlineRoom: mock.read, readOnlineRoomChat: mock.chat,
  pingOnlineRoom: mock.leave, actOnlineRoom: mock.act, watchOnlineRoom: mock.watch, loadRoomAvatars: vi.fn(async () => new Map()),
}));
vi.mock("./OnlineRoomYouTube", () => ({ default: () => <div data-test-player/> }));
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
it("enters an official room, keeps playback opt-in and changes the seat without tying it to a layout", async () => {
  await act(async () => root.render(<LanguageProvider><OnlineRoomsPage owner={owner}/></LanguageProvider>));
  await act(async () => button("Vào Góc nhạc tập trung").click());
  await tick();
  expect(host.querySelectorAll(".online-room-seat")).toHaveLength(20);
  expect(host.querySelector('[data-self="true"]')?.getAttribute("title")).toContain("Ghế 3");
  expect(host.querySelector("[data-test-player]")).toBeNull();
  await act(async () => button("Nghe cùng phòng").click());
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


it("starts the new official piano player on entry and can stop listening locally", async () => {
  mock.read.mockResolvedValue({ ...fixture(), playback: { ...fixture().playback, video_id: "3Lfr3BhvkQY" } });
  await act(async () => root.render(<LanguageProvider><OnlineRoomsPage owner={owner}/></LanguageProvider>));
  await act(async () => button("Vào Góc nhạc tập trung").click());
  await tick();
  expect(host.querySelector("[data-test-player]")).toBeTruthy();
  await act(async () => button("Dừng nghe trên máy này").click());
  expect(host.querySelector("[data-test-player]")).toBeNull();
  expect(button("Nghe cùng phòng")).toBeTruthy();
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
