// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SharedLearningPage from "./SharedLearningPage";

const api = vi.hoisted(() => ({ shares: vi.fn(), invites: vi.fn(), copies: vi.fn(), content: vi.fn(), start: vi.fn(), cards: vi.fn(), rate: vi.fn() }));
vi.mock("../lib/learningShare", async importOriginal => ({ ...await importOriginal<typeof import("../lib/learningShare")>(),
  listLearningShares: api.shares, listPendingLearningInvites: api.invites, listMyLearningCopySources: api.copies, getSharedContent: api.content,
  startSharedQuiz: api.start, getSharedCards: api.cards, rateSharedCard: api.rate,
}));
let host: HTMLDivElement, root: Root;
const valid = { kind: "lab", resource_id: "lab-1", title: "Working Lab", owner_name: "Owner", updated_at: "2026-10-13T00:00:00Z", status: "active" };
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  api.shares.mockReset().mockResolvedValue([valid]); api.invites.mockReset().mockResolvedValue([]); api.copies.mockReset().mockResolvedValue([]);
  api.content.mockReset().mockResolvedValue({ program_html: "<p>Simulation</p>" });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
async function mount(owner = "recipient") { await act(async () => root.render(<SharedLearningPage owner={owner}/>)); }
it("keeps removed resources with null titles/dates visible and sortable", async () => {
  api.shares.mockResolvedValue([valid, { ...valid, resource_id: "removed", title: null, owner_name: null, updated_at: null, status: "removed" }]);
  await mount();
  expect(host.querySelectorAll(".shared-learning-item")).toHaveLength(2);
  const sort = host.querySelector(".shared-learning-sort select") as HTMLSelectElement;
  await act(async () => { sort.value = "title"; sort.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(host.textContent).toContain("Học liệu đã xóa");
});
it("keeps successful lists when the saved-copy request fails", async () => {
  api.copies.mockRejectedValue(new Error("Failed to fetch"));
  await mount();
  expect(host.textContent).toContain("Working Lab");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Không thể kết nối");
});
it("retains the previous list on a failed refresh and clears the error on retry", async () => {
  await mount();
  api.shares.mockRejectedValue(new Error("Failed to fetch"));
  await act(async () => (host.querySelector("header button") as HTMLButtonElement).click());
  expect(host.textContent).toContain("Working Lab");
  expect(host.querySelector(".shared-learning-empty")).toBeNull();
  api.shares.mockResolvedValue([{ ...valid, title: "Recovered Lab" }]);
  await act(async () => (host.querySelector('[role="alert"] button') as HTMLButtonElement).click());
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.textContent).toContain("Recovered Lab");
});
it("rejects malformed rows with a retry prompt instead of an empty success", async () => {
  api.shares.mockResolvedValue([null]); await mount();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Dữ liệu chia sẻ không hợp lệ");
  expect(host.querySelector(".shared-learning-empty")).toBeNull();
});
it("ignores a previous account's late response", async () => {
  let finishOld!: (value: unknown) => void;
  api.shares.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  await mount("old-account");
  api.shares.mockResolvedValue([{ ...valid, title: "New account" }]); await mount("new-account");
  await act(async () => finishOld([{ ...valid, title: "Private old account" }]));
  expect(host.textContent).toContain("New account"); expect(host.textContent).not.toContain("Private old account");
});
it("ends a stalled request with a timeout error and offers retry", async () => {
  vi.useFakeTimers(); api.shares.mockImplementation(() => new Promise(() => {}));
  await mount(); expect(host.querySelector('[role="status"]')?.textContent).toContain("Đang tải");
  await act(async () => vi.advanceTimersByTimeAsync(15001));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Kết nối quá lâu");
  expect(host.querySelector('[role="alert"] button')).not.toBeNull();
});
it("shows an expired-session message rather than empty success", async () => {
  api.shares.mockRejectedValue(new Error("Đăng nhập để dùng học liệu được chia sẻ."));
  await mount(); expect(host.querySelector('[role="alert"]')?.textContent).toContain("Đăng nhập");
  expect(host.querySelector(".shared-learning-empty")).toBeNull();
});
it("keeps the list and reports revoked access when opening a resource", async () => {
  api.content.mockRejectedValue(new Error("ACCESS_REVOKED")); await mount();
  await act(async () => (host.querySelector(".shared-learning-item .primary-button") as HTMLButtonElement).click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("thu hồi");
  expect(host.textContent).toContain("Working Lab");
});
it("validates a malformed quiz session before storing it in render state", async () => {
  api.shares.mockResolvedValue([{ ...valid, kind: "quiz" }]); api.start.mockResolvedValue({ id: "attempt", questions: null });
  await mount(); await act(async () => (host.querySelector(".shared-learning-item .primary-button") as HTMLButtonElement).click());
  await act(async () => (host.querySelector(".shared-learning-launch .primary-button") as HTMLButtonElement).click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Dữ liệu Quiz không hợp lệ");
  expect(host.querySelector(".shared-learning-launch")).not.toBeNull();
});
it("grades one shared card once on rapid taps", async () => {
  api.shares.mockResolvedValue([{ ...valid, kind: "flashcard" }]);
  api.cards.mockResolvedValue({ cards: [{ id: "card", front: "Front", back: "Back", content_version: 1 }], progress: [] });
  let finish!: () => void; api.rate.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await mount(); await act(async () => (host.querySelector(".shared-learning-item .primary-button") as HTMLButtonElement).click());
  await act(async () => (host.querySelector(".shared-flip") as HTMLButtonElement).click());
  const good = host.querySelectorAll(".shared-ratings button")[2] as HTMLButtonElement;
  await act(async () => { good.click(); good.click(); });
  expect(api.rate).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(host.querySelector(".shared-flip")?.textContent).toContain("Front");
});
it("handles null empty lists without crashing", async () => {
  api.shares.mockResolvedValue(null); api.invites.mockResolvedValue(null); api.copies.mockResolvedValue(null);
  await mount();
  expect(host.querySelector(".shared-learning-empty")).not.toBeNull();
});
