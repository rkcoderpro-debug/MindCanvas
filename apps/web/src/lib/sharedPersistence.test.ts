// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { blankBoard } from "./board";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("./supabase", () => ({ getCurrentSession: async () => ({ user: { id: "editor" } }), requestTimeoutSignal: () => new AbortController().signal, supabase: { from: mocks.from } }));
import { persistProject, ProjectConflictError, type CachedProject } from "./projectStore";
const draft = (): CachedProject => {
  const board = blankBoard("Shared");
  return { id: board.id, title: board.title, board, updatedAt: board.updatedAt, folderId: null, pending: true, shared: true, ownerId: "owner", accessRole: "editor" };
};
beforeEach(() => vi.clearAllMocks());
function readback(project: CachedProject, revision: number | undefined, board = project.board) {
  const chain: any = {};
  for (const name of ["select", "eq", "abortSignal"]) chain[name] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: { id: project.id, user_id: project.ownerId, title: board.title, folder_id: project.folderId, updated_at: board.updatedAt, revision, content: { board } }, error: null });
  return chain;
}
it("does not insert a shared draft with no base revision", async () => {
  await expect(persistProject("editor", draft())).rejects.toBeInstanceOf(ProjectConflictError);
  expect(mocks.from).not.toHaveBeenCalled();
});
it("inserts a new owned project without a RETURNING select", async () => {
  const board = blankBoard("New project");
  const project: CachedProject = { id: board.id, title: board.title, board, updatedAt: board.updatedAt, folderId: null, pending: true, ownerId: "editor", accessRole: "owner", shared: false };
  const chain: any = { insert: vi.fn(() => chain), abortSignal: vi.fn().mockResolvedValue({ data: null, error: null }) };
  mocks.from.mockReturnValueOnce(chain).mockReturnValueOnce(readback(project, 0));
  await expect(persistProject("editor", project)).resolves.toEqual({ revision: 0, updatedAt: project.board.updatedAt });
  expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "editor", revision: 0 }));
  expect(chain.select).toBeUndefined();
});
it("updates an editor's snapshot with a revision guard, without changing owner", async () => {
  const project = { ...draft(), revision: 3 };
  const chain: any = {};
  for (const name of ["update", "eq", "select", "abortSignal"]) chain[name] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { revision: 4 }, error: null });
  mocks.from.mockReturnValueOnce(chain).mockReturnValueOnce(readback(project, 4)).mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "editor" }, error: null }) }) }) }) });
  await expect(persistProject("editor", project)).resolves.toEqual({ revision: 4, updatedAt: project.board.updatedAt });
  expect(chain.update.mock.calls[0][0]).not.toHaveProperty("user_id");
  expect(chain.eq).toHaveBeenCalledWith("revision", 3);
  expect(chain.eq).not.toHaveBeenCalledWith("user_id", "editor");
});
it("does not acknowledge a write when cloud readback contains an older canvas", async () => {
  const project = { ...draft(), revision: 3 };
  const chain: any = {};
  for (const name of ["update", "eq", "select", "abortSignal"]) chain[name] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { revision: 4 }, error: null });
  mocks.from.mockReturnValueOnce(chain).mockReturnValueOnce(readback(project, 4, { ...project.board, title: "Older canvas" }));
  await expect(persistProject("editor", project)).rejects.toMatchObject({ code: "PROJECT_CONFLICT", message: expect.stringContaining("Cloud chưa xác nhận") });
});
it("updates a revisionless existing project with an updated_at compare-and-swap", async () => {
  const cloudUpdatedAt = "2026-09-25T02:00:00.000Z";
  const baseBoard = { ...blankBoard("Shared"), updatedAt: cloudUpdatedAt };
  const localBoard = { ...baseBoard, title: "Shared with a new stroke", updatedAt: "2026-09-25T02:00:01.000Z" };
  const cloud: CachedProject = { id: baseBoard.id, title: baseBoard.title, board: baseBoard, folderId: null, updatedAt: cloudUpdatedAt, baseUpdatedAt: cloudUpdatedAt, pending: false, ownerId: "editor", accessRole: "owner" };
  const project: CachedProject = { ...cloud, title: localBoard.title, board: localBoard, updatedAt: localBoard.updatedAt, pending: true };
  const update: any = {};
  for (const name of ["update", "eq", "select", "abortSignal"]) update[name] = vi.fn(() => update);
  update.maybeSingle = vi.fn().mockResolvedValue({ data: { id: project.id }, error: null });
  mocks.from
    .mockReturnValueOnce(readback(cloud, undefined, baseBoard))
    .mockReturnValueOnce(update)
    .mockReturnValueOnce(readback(project, undefined, localBoard));

  await expect(persistProject("editor", project)).resolves.toEqual({ revision: undefined, updatedAt: localBoard.updatedAt });
  expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ content: expect.any(Object), updated_at: localBoard.updatedAt }));
  expect(update.update.mock.calls[0][0]).not.toHaveProperty("revision");
  expect(update.update.mock.calls[0][0]).not.toHaveProperty("user_id");
  expect(update.eq).toHaveBeenCalledWith("id", project.id);
  expect(update.eq).toHaveBeenCalledWith("updated_at", cloudUpdatedAt);
});
it("keeps the local revisionless draft pending when the cloud timestamp changed", async () => {
  const cloudUpdatedAt = "2026-09-25T02:00:02.000Z";
  const baseBoard = { ...blankBoard("Cloud edit"), updatedAt: cloudUpdatedAt };
  const cachedBoard = { ...blankBoard("Device edit"), updatedAt: "2026-09-25T02:00:01.000Z" };
  const cloud: CachedProject = { id: baseBoard.id, title: baseBoard.title, board: baseBoard, folderId: null, updatedAt: cloudUpdatedAt, baseUpdatedAt: cloudUpdatedAt, pending: false, ownerId: "editor", accessRole: "owner" };
  const project: CachedProject = { ...cloud, title: cachedBoard.title, board: cachedBoard, updatedAt: cachedBoard.updatedAt, baseUpdatedAt: "2026-09-25T02:00:00.000Z", pending: true };
  mocks.from.mockReturnValueOnce(readback(cloud, undefined, baseBoard));

  await expect(persistProject("editor", project)).rejects.toBeInstanceOf(ProjectConflictError);
  expect(mocks.from).toHaveBeenCalledTimes(1);
});
it("blocks viewer writes before issuing a request", async () => {
  await expect(persistProject("editor", { ...draft(), accessRole: "viewer", revision: 3 })).rejects.toThrow("quyền xem");
  expect(mocks.from).not.toHaveBeenCalled();
});
