// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "../lib/i18n";
import type { OnlineRoom, RoomSnapshot } from "../lib/onlineRooms";
import OnlineRoomsPage from "./OnlineRoomsPage";

const mock = vi.hoisted(() => ({
  list: vi.fn(), join: vi.fn(), read: vi.fn(), chat: vi.fn(), leave: vi.fn(), act: vi.fn(), watch: vi.fn(),
}));
vi.mock("../lib/onlineRooms", async actual => ({
  ...await actual<typeof import("../lib/onlineRooms")>(),
  listOnlineRooms: mock.list, joinOnlineRoom: mock.join, readOnlineRoom: mock.read, readOnlineRoomChat: mock.chat,
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
