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
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });

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


it("coalesces background triggers, aborts stalled reads, and backs off while retaining the last unread count", async () => {
  vi.useFakeTimers();
  let stalledSignal: AbortSignal | undefined;
  list.mockResolvedValueOnce([message]).mockImplementationOnce((signal: AbortSignal) => {
    stalledSignal = signal;
    return new Promise<never>(() => {});
  });
  await act(async () => root.render(<NotificationBell owner="me" onNavigate={navigate}/>));
  await act(async () => vi.advanceTimersByTimeAsync(45_000));
  const focus = () => window.dispatchEvent(new Event("focus"));
  await act(async () => { focus(); focus(); window.dispatchEvent(new Event("mindcanvas:activity-updated")); });
  expect(list).toHaveBeenCalledTimes(2);
  expect(stalledSignal?.aborted).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(8_000));
  expect(stalledSignal?.aborted).toBe(true);
  await act(async () => { focus(); await vi.advanceTimersByTimeAsync(45_000); });
  expect(list).toHaveBeenCalledTimes(2);
  expect(host.querySelector(".notification-trigger")?.getAttribute("aria-label")).toContain("1 chưa đọc");
  expect(host.textContent).not.toContain("Chưa tải được thông báo");
  await act(async () => vi.advanceTimersByTimeAsync(15_000));
  expect(list).toHaveBeenCalledTimes(3);
});

it("only shows a simple retry notice inside the bell panel when the first read fails", async () => {
  list.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await act(async () => root.render(<NotificationBell owner="me" onNavigate={navigate}/>));
  expect(host.textContent).not.toContain("Chưa tải được thông báo");
  await act(async () => (host.querySelector(".notification-trigger") as HTMLButtonElement).click());
  expect(host.textContent).toContain("Chưa tải được thông báo");
  expect(host.textContent).not.toContain("Failed to fetch");
  const retry = host.querySelector('[aria-label="Tải lại thông báo"]') as HTMLButtonElement;
  await act(async () => retry.click());
  expect(host.textContent).toContain("Tin nhắn mới");
  expect(host.textContent).not.toContain("Chưa tải được thông báo");
});
