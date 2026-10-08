// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { sendDirectMessage, onOpenShared } = vi.hoisted(() => ({ sendDirectMessage: vi.fn(async () => undefined), onOpenShared: vi.fn() }));
vi.mock("../lib/connections", () => ({
  listConnections: vi.fn(async () => [{ peer_id: "peer-1", display_name: "Bạn học", unread_count: 1, connected_at: "2026-10-08T00:00:00Z" }]),
  listConnectionInvitations: vi.fn(async () => []),
  listBlockedConnections: vi.fn(async () => []),
  listDirectMessages: vi.fn(async () => [{ id: "message-1", sender_id: "peer-1", recipient_id: "me", body: "Xem tài liệu này", resource_kind: "document", resource_id: "doc-1", resource_title: "Ghi chú Toán", created_at: "2026-10-08T00:00:00Z" }]),
  markDirectMessagesRead: vi.fn(async () => undefined),
  sendDirectMessage,
  createConnectionInvitation: vi.fn(), respondConnectionInvitation: vi.fn(), cancelConnectionInvitation: vi.fn(),
  removeConnection: vi.fn(), blockConnection: vi.fn(), unblockConnection: vi.fn(), reportConnection: vi.fn(),
}));
import ConnectionsPage from "./ConnectionsPage";
let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sendDirectMessage.mockClear(); onOpenShared.mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<ConnectionsPage owner="me" onOpenShared={onOpenShared}/>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it("opens a private conversation, shows the shared material, and sends a text message", async () => {
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
