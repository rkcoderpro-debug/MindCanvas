// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceShareButton } from "./WorkspaceShareDialog";
import { FREE_ACCOUNT_PLAN } from "../lib/account";
import { LanguageProvider } from "../lib/i18n";
import type { ShareGrant, ShareItem, ShareRole } from "../lib/workspaceSharing";

const mock = vi.hoisted(() => ({
  connections: vi.fn(), direct: vi.fn(), history: vi.fn(), removeMember: vi.fn(), revoke: vi.fn(),
  manage: vi.fn(), invite: vi.fn(), copy: vi.fn(), fileFriends: vi.fn(),
}));
vi.mock("../lib/connections", () => ({ listConnections: mock.connections, sendDirectMessage: mock.direct }));
vi.mock("../lib/learningShare", async imported => ({ ...await imported<typeof import("../lib/learningShare")>(),
  listLearningInvites: mock.history, removeLearningMember: mock.removeMember, revokeLearning: mock.revoke }));
vi.mock("../lib/workspaceSharing", async imported => ({ ...await imported<typeof import("../lib/workspaceSharing")>(),
  shareManage: mock.manage, shareInvite: mock.invite }));
vi.mock("../lib/workspaceFileFriends", () => ({ manageWorkspaceFileFriends: mock.fileFriends }));
vi.mock("../lib/share", () => ({ copyTextWithFallback: mock.copy }));

const quiz: ShareItem = { kind: "quiz", id: "quiz-1", title: "Ôn tập" };
let host: HTMLDivElement, root: Root, grants: ShareGrant[];
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  localStorage.setItem("mindcanvas:language", "vi");
  HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
  HTMLDialogElement.prototype.close ??= function () { this.open = false; };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  grants = [];
  mock.manage.mockImplementation(async (_item: ShareItem, action: string, email: string, role: ShareRole) => {
    if (action === "set") grants = [...grants.filter(row => row.email !== email), { email, role, token: (email ? "a" : "b").repeat(48) }];
    if (action === "remove") grants = grants.filter(row => row.email !== email);
    return grants;
  });
  mock.connections.mockResolvedValue([{ peer_id: "peer-1", display_name: "Minh" }]);
  mock.history.mockResolvedValue({ members: [], invites: [] });
  mock.direct.mockResolvedValue(undefined);
  mock.invite.mockResolvedValue(undefined);
  mock.copy.mockResolvedValue(true);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); });
const button = (selector: string) => host.querySelector<HTMLButtonElement>(selector)!;
const choose = (select: HTMLSelectElement, value: string) => act(async () => {
  select.value = value; select.dispatchEvent(new Event("change", { bubbles: true }));
});
async function open(plus = true, item = quiz) {
  const plan = { ...FREE_ACCOUNT_PLAN, effectivePlanId: plus ? "plus" as const : "free" as const };
  await act(async () => root.render(<LanguageProvider><WorkspaceShareButton item={item} friends={{ plan }}/></LanguageProvider>));
  await act(async () => button("button").click());
}

it("opens one dialog for direct delivery, the general link, and an email invite with independent roles", async () => {
  await open();
  expect(host.querySelectorAll("dialog[open]")).toHaveLength(1);
  expect(host.querySelector("dialog")?.textContent).toContain("Gửi cho bạn bè");
  expect(host.querySelector("dialog")?.textContent).toContain("Quyền truy cập qua link");
  expect(host.querySelector("dialog")?.textContent).toContain("Mời qua email");

  await choose(host.querySelector(".workspace-share-friend-form select")!, "peer-1");
  await act(async () => button(".workspace-share-friend-form button").click());
  expect(mock.direct).toHaveBeenCalledExactlyOnceWith("peer-1", "", "quiz", quiz.id);
  expect(mock.manage.mock.calls.every(call => call[1] === "list")).toBe(true);
  expect(mock.invite).not.toHaveBeenCalled();
  expect(host.querySelector(".workspace-share-friends [role=status]")?.textContent).toContain("Đã gửi cho Minh");

  await choose(host.querySelector(".workspace-share-settings > div select")!, "viewer");
  const publicLink = host.querySelector<HTMLInputElement>('[aria-label="Link chia sẻ chung"]')!;
  await act(async () => button(".workspace-share-link-field button").click());
  expect(mock.copy).toHaveBeenCalledWith(publicLink.value, publicLink);
  expect(publicLink.value).toContain("b".repeat(48));

  const emailForm = host.querySelector<HTMLFormElement>(".workspace-share-settings > form")!;
  const email = emailForm.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(email, "MINH@EXAMPLE.COM");
    email.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await choose(emailForm.querySelector("select")!, "editor");
  await act(async () => emailForm.querySelector("button")!.click());
  expect(mock.manage).toHaveBeenLastCalledWith(quiz, "set", "minh@example.com", "editor");
  expect(mock.invite).toHaveBeenCalledExactlyOnceWith("a".repeat(48));
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Link mời riêng"]')?.value).toContain("a".repeat(48));
  expect(publicLink.value).toContain("b".repeat(48));
});

it("keeps previous grants manageable and does not gate new link or email sharing on the friends plan", async () => {
  const deck: ShareItem = { kind: "flashcard", id: "deck-1", title: "Từ vựng" };
  mock.history.mockResolvedValue({
    invites: [{ id: "invitation-1", email: "other@example.com", status: "pending", expires_at: "2099-01-01", recipient_id: null }],
    members: [{ user_id: "known-member" }],
  });
  await open(false, deck);
  expect(mock.connections).not.toHaveBeenCalled();
  expect(host.querySelector(".workspace-share-friend-form")).toBeNull();
  expect(host.querySelector<HTMLSelectElement>(".workspace-share-settings > div select")?.disabled).toBe(false);
  expect(button(".workspace-share-settings > form button").disabled).toBe(false);

  const details = host.querySelector<HTMLDetailsElement>(".workspace-share-prior")!;
  await act(async () => { details.open = true; });
  const actions = details.querySelectorAll<HTMLButtonElement>("button");
  await act(async () => actions[0].click());
  expect(mock.removeMember).toHaveBeenCalledExactlyOnceWith("flashcard", deck.id, "known-member");
  await act(async () => actions[1].click());
  expect(mock.revoke).toHaveBeenCalledExactlyOnceWith("invitation-1");
});

it("sends a Workspace file to a connected account without changing the link or email settings", async () => {
  const file: ShareItem = { kind: "file", id: "file-1", title: "Công thức.html" };
  mock.fileFriends.mockResolvedValueOnce([]).mockResolvedValueOnce([{ user_id: "peer-1", display_name: "Minh" }]).mockResolvedValueOnce([]);
  const plan = { ...FREE_ACCOUNT_PLAN, effectivePlanId: "pro" as const };
  await act(async () => root.render(<LanguageProvider><WorkspaceShareButton item={file} friends={{ plan }}/></LanguageProvider>));
  await act(async () => button("button").click());
  await choose(host.querySelector(".workspace-share-friend-form select")!, "peer-1");
  await act(async () => button(".workspace-share-friend-form button").click());
  expect(mock.fileFriends).toHaveBeenLastCalledWith(file.id, "send", "peer-1");
  expect(mock.direct).not.toHaveBeenCalled();
  expect(mock.manage.mock.calls.every(call => call[1] === "list")).toBe(true);
  expect(mock.invite).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLSelectElement>(".workspace-share-settings > div select")?.value).toBe("private");
  const details = host.querySelector<HTMLDetailsElement>(".workspace-share-prior")!;
  await act(async () => { details.open = true; });
  await act(async () => details.querySelector<HTMLButtonElement>('button[aria-label="Thu hồi quyền của Minh"]')!.click());
  expect(mock.fileFriends).toHaveBeenLastCalledWith(file.id, "remove", "peer-1");
  expect(host.querySelector(".workspace-share-prior")).toBeNull();
});
