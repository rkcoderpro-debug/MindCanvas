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
import ChatBubble from "./ChatBubble";
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

it("opens a received Workspace file directly from the chat card", async () => {
  const token = "af".repeat(24);
  vi.mocked(listDirectMessages).mockResolvedValueOnce([{
    id: "workspace-card", sender_id: "peer-1", recipient_id: "me", body: "",
    resource_kind: "document", resource_id: "file-1", resource_title: "Công thức.html",
    workspace_file_token: token, created_at: "2026-10-08T00:00:00Z",
  }]);
  await act(async () => host.querySelector<HTMLButtonElement>(".connections-person")!.click());
  const link = host.querySelector<HTMLAnchorElement>("a.connections-resource")!;
  expect(link.textContent).toContain("Công thức.html");
  expect(link.hash).toBe(`#share=${token}`);
  expect(link.target).toBe("");
  expect(link.search).toBe("?view=shared");
  expect(host.querySelector(".connections-messages")?.textContent).not.toContain(token);
  expect(onOpenShared).not.toHaveBeenCalled();
});

it("opens a folder card in the compact chat and keeps the conversation minimized", async () => {
  const token = "cd".repeat(24);
  vi.mocked(listDirectMessages).mockResolvedValue([{
    id: "folder-card", sender_id: "peer-1", recipient_id: "me", body: "",
    resource_kind: "document", resource_id: "folder-1", resource_title: "DSA",
    workspace_file_token: token, workspace_folder_card: true, created_at: "2026-10-08T00:00:00Z",
  }]);
  await act(async () => root.render(<ChatBubble owner="me" request={null} onOpenShared={onOpenShared}/>));
  const launcher = host.querySelector<HTMLButtonElement>(".chat-bubble-toggle")!;
  expect(launcher.textContent).toBe("1");
  expect(markDirectMessagesRead).not.toHaveBeenCalled();
  await act(async () => launcher.click());
  await act(async () => host.querySelector<HTMLButtonElement>(".connections-person")!.click());
  const link = host.querySelector<HTMLAnchorElement>("a.connections-resource")!;
  expect(link.textContent).toContain("Mở thư mục");
  expect(link.hash).toBe(`#share=${token}`);
  await act(async () => host.querySelector<HTMLButtonElement>(".chat-thread-minimize")!.click());
  expect(host.querySelector(".chat-bubble-panel")?.hasAttribute("hidden")).toBe(true);
  await act(async () => host.querySelector<HTMLButtonElement>(".chat-bubble-toggle")!.click());
  expect(host.querySelector(".connection-profile-heading h3")?.textContent).toBe("Bạn học");
});

it("opens the matching conversation when a message notification arrives", async () => {
  await act(async () => root.render(<ChatBubble owner="me" request={{ peerId: "peer-2", version: 1 }} onOpenShared={onOpenShared}/>));
  expect(host.querySelector(".chat-bubble-panel")?.hasAttribute("hidden")).toBe(false);
  expect(host.querySelector(".connection-profile-heading h3")?.textContent).toBe("Bạn thứ hai");
});

it("keeps the thread, its scroll position, and the draft when returning from a chat attachment", async () => {
  const token = "de".repeat(24);
  vi.mocked(listDirectMessages).mockResolvedValue([{
    id: "document-card", sender_id: "peer-1", recipient_id: "me", body: "",
    resource_kind: "document", resource_id: "file-1", resource_title: "Bài tập.pdf",
    workspace_file_token: token, created_at: "2026-10-08T00:00:00Z",
  }]);
  const onOpenLink = vi.fn();
  const render = (suspended: boolean) => root.render(<ChatBubble owner="me" request={null} onOpenShared={onOpenShared}
    onOpenLink={onOpenLink} suspended={suspended}/>);
  await act(async () => render(false));
  await act(async () => host.querySelector<HTMLButtonElement>(".chat-bubble-toggle")!.click());
  await act(async () => host.querySelector<HTMLButtonElement>(".connections-person")!.click());
  const input = host.querySelector<HTMLTextAreaElement>(".connections-composer textarea")!;
  const messages = host.querySelector<HTMLElement>(".connections-messages")!;
  const card = host.querySelector<HTMLAnchorElement>(".connections-resource")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Nháp đang viết");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    messages.scrollTop = 135;
    card.click();
  });
  expect(onOpenLink).toHaveBeenCalledWith(token);
  await act(async () => render(true));
  expect(host.querySelector(".chat-bubble")?.hasAttribute("hidden")).toBe(true);
  messages.scrollTop = 0;
  await act(async () => render(false));
  expect(messages.scrollTop).toBe(135);
  expect(host.querySelector(".connection-profile-heading h3")?.textContent).toBe("Bạn học");
  expect(input.value).toBe("Nháp đang viết");
  expect(host.querySelector(".chat-bubble-panel")?.hasAttribute("hidden")).toBe(false);
});
