// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { blankBoard } from "./board";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("./supabase", () => ({ getCurrentSession: async () => ({ user: { id: "editor" } }), supabase: { from: mocks.from } }));
import { persistProject, ProjectConflictError, type CachedProject } from "./projectStore";
const draft = (): CachedProject => {
  const board = blankBoard("Shared");
  return { id: board.id, title: board.title, board, updatedAt: board.updatedAt, folderId: null, pending: true, shared: true, ownerId: "owner", accessRole: "editor" };
};
beforeEach(() => vi.clearAllMocks());
it("does not insert a shared draft with no base revision", async () => {
  await expect(persistProject("editor", draft())).rejects.toBeInstanceOf(ProjectConflictError);
  expect(mocks.from).not.toHaveBeenCalled();
});
it("updates an editor's snapshot with a revision guard, without changing owner", async () => {
  const chain: any = {};
  for (const name of ["update", "eq", "select", "abortSignal"]) chain[name] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { revision: 4 }, error: null });
  mocks.from.mockReturnValue(chain);
  await expect(persistProject("editor", { ...draft(), revision: 3 })).resolves.toEqual({ revision: 4 });
  expect(chain.update.mock.calls[0][0]).not.toHaveProperty("user_id");
  expect(chain.eq).toHaveBeenCalledWith("revision", 3);
  expect(chain.eq).not.toHaveBeenCalledWith("user_id", "editor");
});
it("blocks viewer writes before issuing a request", async () => {
  await expect(persistProject("editor", { ...draft(), accessRole: "viewer", revision: 3 })).rejects.toThrow("quyền xem");
  expect(mocks.from).not.toHaveBeenCalled();
});
