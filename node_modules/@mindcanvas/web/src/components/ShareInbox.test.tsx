// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "../lib/i18n";
import type { IncomingProjectInvitation } from "../lib/collaboration";
import ShareInbox from "./ShareInbox";

const { list, accept } = vi.hoisted(() => ({ list: vi.fn(), accept: vi.fn() }));
vi.mock("../lib/collaboration", () => ({
  listMyPendingProjectInvitations: list, acceptProjectInvitationById: accept, declineProjectInvitation: vi.fn(),
}));

const invite: IncomingProjectInvitation = {
  id: "invite-1", projectId: "project-1", projectTitle: "Ôn tập mạng", inviterId: "peer-1", inviterName: "Bạn học",
  email: "p@example.invalid", role: "editor", status: "pending", createdAt: "2026-11-10T09:00:00Z", expiresAt: "2026-12-10T09:00:00Z",
};
let root: Root;
let host: HTMLDivElement;
const onAccepted = vi.fn();
const render = () => root.render(<LanguageProvider><ShareInbox owner="me" onAccepted={onAccepted}/></LanguageProvider>);
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  list.mockReset().mockResolvedValue([invite]); accept.mockReset(); onAccepted.mockReset();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });

it("never shows an invitation card on a first-load network failure", async () => {
  list.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await act(async () => render());
  expect(list).toHaveBeenCalledTimes(1);
  expect(host.querySelector(".share-inbox")).toBeNull();
  expect(host.textContent).not.toContain("Failed to fetch");
});

it("keeps a real invitation visible through a failed refresh and still accepts it", async () => {
  vi.useFakeTimers();
  list.mockResolvedValueOnce([invite]).mockRejectedValueOnce(new TypeError("Failed to fetch"));
  accept.mockResolvedValue({ projectId: invite.projectId, title: invite.projectTitle, role: "editor" });
  await act(async () => render());
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); window.dispatchEvent(new Event("focus")); });
  expect(list).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain(invite.projectTitle);
  expect(host.textContent).not.toContain("Failed to fetch");
  await act(async () => (host.querySelector(".share-inbox-actions .primary-button") as HTMLButtonElement).click());
  expect(onAccepted).toHaveBeenCalledWith(invite.projectId, invite.projectTitle, "editor");
  expect(host.querySelector(".share-inbox")).toBeNull();
});
