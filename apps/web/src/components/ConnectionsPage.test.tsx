// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { sendDirectMessage, onOpenShared } = vi.hoisted(() => ({ sendDirectMessage: vi.fn(async () => undefined), onOpenShared: vi.fn() }));
vi.mock("../lib/connections", () => ({
  listConnections: vi.fn(async () => [
    { peer_id: "peer-1", display_name: "Bạn học", unread_count: 1, connected_at: "2026-10-08T00:00:00Z", lastMessage: { at: "2026-10-08T00:00:00Z", body: "", kind: "document", title: "Ghi chú Toán", outgoing: false } },
    { peer_id: "peer-2", display_name: "Bạn thứ hai", unread_count: 0, connected_at: "2026-09-07T00:00:00Z" },
  ]),
  listConnectionInvitations: vi.fn(async () => []),
  listBlockedConnections: vi.fn(async () => []),
  listDirectMessages: vi.fn(async () => [{ id: "message-1", sender_id: "peer-1", recipient_id: "me", body: "Xem tài liệu này", resource_kind: "document", resource_id: "doc-1", resource_title: "Ghi chú Toán", created_at: "2026-10-08T00:00:00Z" }]),
  markDirectMessagesRead: vi.fn(async () => undefined),
  sendDirectMessage,
  createConnectionInvitation: vi.fn(), respondConnectionInvitation: vi.fn(), cancelConnectionInvitation: vi.fn(),
  removeConnection: vi.fn(), blockConnection: vi.fn(), unblockConnection: vi.fn(), reportConnection: vi.fn(),
}));
import ConnectionsPage from "./ConnectionsPage";
import { listDirectMessages, markDirectMessagesRead, type DirectMessage } from "../lib/connections";
let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sendDirectMessage.mockClear(); onOpenShared.mockClear(); vi.mocked(markDirectMessagesRead).mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<ConnectionsPage owner="me" onOpenShared={onOpenShared}/>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it("opens a private conversation, shows the shared material, and sends a text message", async () => {
  expect(host.querySelector(".connections-person .connection-summary")?.textContent).toContain("Ghi chú Toán");
  expect(host.querySelector('[aria-label="1 tin chưa đọc"]')).toBeTruthy();
  await act(async () => (host.querySelector(".connections-people > button") as HTMLButtonElement).click());
  expect(host.querySelector(".connections-resource")?.textContent).toContain("Ghi chú Toán");
  await act(async () => (host.querySelector(".connections-resource") as HTMLButtonElement).click());
  expect(onOpenShared).toHaveBeenCalledOnce();
  const field = host.querySelector("#connection-message") as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Cảm ơn bạn!");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => (host.querySelector(".connections-composer button") as HTMLButtonElement).click());
  expect(sendDirectMessage).toHaveBeenCalledWith("peer-1", "Cảm ơn bạn!");
});

it("keeps late history out of the open conversation and returns to the inbox", async () => {
  let resolveFirst!: (history: DirectMessage[]) => void;
  vi.mocked(listDirectMessages).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
  vi.mocked(listDirectMessages).mockResolvedValueOnce([{ id: "new", sender_id: "peer-2", recipient_id: "me", body: "Tin bạn thứ hai", resource_kind: null, resource_id: null, resource_title: null, created_at: "2026-10-08T01:00:00Z" }]);
  const contacts = host.querySelectorAll<HTMLButtonElement>(".connections-person");
  await act(async () => contacts[0].click());
  await act(async () => contacts[1].click());
  await act(async () => resolveFirst([{ id: "old", sender_id: "peer-1", recipient_id: "me", body: "Tin tải trễ", resource_kind: null, resource_id: null, resource_title: null, created_at: "2026-10-08T00:00:00Z" }]));
  expect(host.querySelector(".connections-messages")?.textContent).toContain("Tin bạn thứ hai");
  expect(host.querySelector(".connections-messages")?.textContent).not.toContain("Tin tải trễ");
  expect(markDirectMessagesRead).toHaveBeenCalledTimes(1);
  expect(markDirectMessagesRead).toHaveBeenCalledWith("peer-2");
  await act(async () => host.querySelector<HTMLButtonElement>(".connections-thread-back")!.click());
  expect(host.querySelector(".connections-layout")?.getAttribute("data-thread-open")).toBe("false");
  expect(host.querySelector(".connections-composer")).toBeNull();
});
