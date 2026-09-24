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
  await expect(persistProject("editor", project)).resolves.toEqual({ revision: 0 });
  expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "editor", revision: 0 }));
  expect(chain.select).toBeUndefined();
});
it("updates an editor's snapshot with a revision guard, without changing owner", async () => {
  const project = { ...draft(), revision: 3 };
  const chain: any = {};
  for (const name of ["update", "eq", "select", "abortSignal"]) chain[name] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { revision: 4 }, error: null });
  mocks.from.mockReturnValueOnce(chain).mockReturnValueOnce(readback(project, 4)).mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "editor" }, error: null }) }) }) }) });
  await expect(persistProject("editor", project)).resolves.toEqual({ revision: 4 });
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
  await expect(persistProject("editor", project)).rejects.toThrow("Cloud chưa xác nhận");
});
it("blocks viewer writes before issuing a request", async () => {
  await expect(persistProject("editor", { ...draft(), accessRole: "viewer", revision: 3 })).rejects.toThrow("quyền xem");
  expect(mocks.from).not.toHaveBeenCalled();
});
