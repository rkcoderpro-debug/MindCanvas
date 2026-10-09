// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ActivityNotification } from "../lib/activityNotifications";

const { list, mark, accept, respond } = vi.hoisted(() => ({
  list: vi.fn(), mark: vi.fn(async () => undefined), accept: vi.fn(async () => undefined), respond: vi.fn(async () => undefined),
}));
vi.mock("../lib/activityNotifications", () => ({
  listActivityNotifications: list, markActivityNotificationRead: mark,
  acceptLearningNotification: accept, respondConnectionNotification: respond,
}));
vi.mock("../lib/connections", () => ({ markDirectMessagesRead: vi.fn(async () => undefined) }));
import NotificationBell from "./NotificationBell";

const message: ActivityNotification = { kind: "message", source_id: "msg-1", actor_id: "peer-1", title: "Tin nhắn mới", preview: "Chào bạn", created_at: "2026-10-09T09:00:00Z", target: "connections", target_id: "peer-1", read_at: null };
const invitation: ActivityNotification = { kind: "learning_invite", source_id: "inv-1", actor_id: "peer-2", title: "Lời mời chia sẻ học liệu", preview: "Quiz được chia sẻ", created_at: "2026-10-09T08:00:00Z", target: "shared", target_id: "quiz-1", read_at: null };
let host: HTMLDivElement;
let root: Root;
const navigate = vi.fn();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  list.mockReset().mockResolvedValue([message, invitation]); mark.mockClear(); accept.mockClear(); respond.mockClear(); navigate.mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it("shows unread count and opens the selected message after marking only that event read", async () => {
  await act(async () => root.render(<NotificationBell owner="me" onNavigate={navigate}/>));
  expect(host.querySelector(".notification-trigger")?.getAttribute("aria-label")).toContain("2 chưa đọc");
  await act(async () => (host.querySelector(".notification-trigger") as HTMLButtonElement).click());
  const button = Array.from(host.querySelectorAll(".notification-item-link")).find(item => item.textContent?.includes("Tin nhắn mới")) as HTMLButtonElement;
  await act(async () => button.click());
  expect(mark).toHaveBeenCalledWith(message);
  expect(navigate).toHaveBeenCalledWith(message);
});

it("accepts a private learning invitation by its id", async () => {
  await act(async () => root.render(<NotificationBell owner="me" onNavigate={navigate}/>));
  await act(async () => (host.querySelector(".notification-trigger") as HTMLButtonElement).click());
  await act(async () => (host.querySelector(".notification-invite-actions button") as HTMLButtonElement).click());
  expect(accept).toHaveBeenCalledWith("inv-1");
  expect(navigate).toHaveBeenCalledWith(invitation);
});
