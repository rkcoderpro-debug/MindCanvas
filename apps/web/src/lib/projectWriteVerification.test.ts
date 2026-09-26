import { beforeEach, describe, expect, it, vi } from "vitest";
import { blankBoard } from "./board";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("./supabase", () => ({ getCurrentSession: async () => ({ user: { id: "owner-a" } }), requestTimeoutSignal: () => new AbortController().signal, supabase: { from: mocks.from } }));
import { ProjectConflictError, ProjectVerificationError, verifyProjectWrite, type CachedProject } from "./projectStore";

const project = (): CachedProject => {
  const board = blankBoard("Verification target");
  return { id: board.id, title: board.title, board, updatedAt: board.updatedAt, folderId: null, pending: true, revision: 4, ownerId: "owner-a", accessRole: "owner" };
};
const snapshot = (draft: CachedProject, overrides: Partial<CachedProject> = {}): CachedProject => ({ ...draft, pending: false, ...overrides });
beforeEach(() => vi.clearAllMocks());

describe("verifyProjectWrite", () => {
  it("confirms by revision and canvas content, not by matching timestamps", async () => {
    const draft = project();
    const remote = snapshot(draft, { revision: 5, updatedAt: "2026-09-26T10:00:00.000Z", board: { ...draft.board, updatedAt: "2026-09-26T10:00:00.000Z" } });
    await expect(verifyProjectWrite("owner-a", draft, 5, { maxWaitMs: 20, fetchSnapshot: async () => remote })).resolves.toEqual({ revision: 5, updatedAt: remote.updatedAt });
  });

  it("retries a stale same-revision read and confirms the matching cloud snapshot", async () => {
    const draft = project();
    let now = 0;
    let reads = 0;
    const onChecking = vi.fn();
    const verified = await verifyProjectWrite("owner-a", draft, 5, {
      maxWaitMs: 5000,
      retryDelaysMs: [1000],
      now: () => now,
      sleep: async milliseconds => { now += milliseconds; },
      onChecking,
      fetchSnapshot: async () => {
        reads++;
        return reads === 1 ? snapshot(draft, { revision: 4, board: { ...draft.board, title: "Previous read" } }) : snapshot(draft, { revision: 5 });
      },
    });
    expect(verified.revision).toBe(5);
    expect(reads).toBe(2);
    expect(now).toBe(1000);
    expect(onChecking).toHaveBeenCalledTimes(1);
  });

  it("reports a real newer cloud edit as a conflict instead of replacing it", async () => {
    const draft = project();
    const fetchSnapshot = vi.fn(async () => snapshot(draft, { revision: 6, board: { ...draft.board, title: "Concurrent cloud edit" } }));
    await expect(verifyProjectWrite("owner-a", draft, 5, { fetchSnapshot })).rejects.toBeInstanceOf(ProjectConflictError);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it("stops at the 15-second limit while keeping a retryable local draft", async () => {
    const draft = project();
    let now = 0;
    let reads = 0;
    const stale = snapshot(draft, { revision: 4, board: { ...draft.board, title: "Stale cloud read" } });
    await expect(verifyProjectWrite("owner-a", draft, 5, {
      now: () => now,
      sleep: async milliseconds => { now += milliseconds; },
      fetchSnapshot: async () => { reads++; return stale; },
    })).rejects.toBeInstanceOf(ProjectVerificationError);
    expect(reads).toBe(6);
    expect(now).toBe(15_000);
    expect(draft.pending).toBe(true);
    expect(draft.board.title).toBe("Verification target");
  });

  it("does not spend the retry window on an authorization failure", async () => {
    const draft = project();
    const forbidden = Object.assign(new Error("row-level security rejected read"), { status: 403 });
    const fetchSnapshot = vi.fn(async () => { throw forbidden; });
    await expect(verifyProjectWrite("owner-a", draft, 5, { fetchSnapshot })).rejects.toBe(forbidden);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });
});
