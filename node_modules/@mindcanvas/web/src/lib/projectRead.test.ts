import { beforeEach, describe, expect, it, vi } from "vitest";
import { blankBoard } from "./board";
import { createCanvasThumbnail } from "./canvasThumbnail";
import { fetchProjects, fetchProjectThumbnails, revalidateOwnedProject, type CachedProject } from "./projectStore";

const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("./supabase", () => ({
  supabase: { from: mock.from },
  getCurrentSession: async () => ({ user: { id: "owner" } }),
  requestTimeoutSignal: () => new AbortController().signal,
}));
const owner = "owner";
const local = (): CachedProject => {
  const board = blankBoard("Saved canvas");
  return { id: board.id, board, title: board.title, updatedAt: board.updatedAt, folderId: null, pending: false, revision: 5, ownerId: owner };
};
const rowFor = (project: CachedProject) => ({
  id: project.id, user_id: owner, title: project.title, updated_at: project.updatedAt, folder_id: null, deleted_at: null, revision: project.revision, is_favorite: false,
});
const api = (...rows: unknown[]) => {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(),
    then: (callback: (result: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: rows.shift(), error: null }).then(callback),
    maybeSingle: vi.fn(async () => ({ data: rows.shift(), error: null })),
    single: vi.fn(async () => ({ data: rows.shift(), error: null })),
  };
  mock.from.mockReturnValue(query);
  return query;
};
beforeEach(() => mock.from.mockReset());

describe("Lightweight Workspace reads", () => {
  it("lists projects using metadata and no membership round trip for an owned-only list", async () => {
    const project = local();
    const query = api([rowFor(project)]);
    expect(await fetchProjects(owner)).toMatchObject([{ id: project.id, revision: 5, accessRole: "owner" }]);
    expect(query.select.mock.calls[0][0]).not.toMatch(/thumbnail|content/);
    expect(mock.from.mock.calls).toEqual([["notes"]]);
  });
  it("loads only previews for the requested cards", async () => {
    const project = local(), thumbnail = createCanvasThumbnail(project.board);
    const query = api([{ id: project.id, thumbnail }, { id: "missing-thumbnail", thumbnail: null }]);
    const result = await fetchProjectThumbnails(owner, [project.id, "missing-thumbnail"]);
    expect(query.select).toHaveBeenCalledWith("id,thumbnail");
    expect(query.in).toHaveBeenCalledWith("id", [project.id, "missing-thumbnail"]);
    expect([...result.entries()]).toEqual([[project.id, thumbnail]]);
  });
  it("does not read canvas content if the confirmed version still matches", async () => {
    const project = local();
    const query = api(rowFor(project));
    await expect(revalidateOwnedProject(owner, project)).resolves.toBeNull();
    expect(query.eq.mock.calls).toEqual([["id", project.id], ["user_id", owner]]);
    expect(query.select).toHaveBeenCalledTimes(1);
    expect(query.select.mock.calls[0][0]).not.toMatch(/thumbnail|content/);
  });
  it("reads full content when a newer cloud revision is confirmed", async () => {
    const project = local(), board = { ...project.board, title: "Another device" };
    const row = { ...rowFor(project), revision: 6, title: board.title };
    const query = api(row, { ...row, content: { board } });
    await expect(revalidateOwnedProject(owner, project)).resolves.toMatchObject({ revision: 6, board: { title: board.title } });
    expect(query.select.mock.calls.map(([columns]) => columns.includes("content"))).toEqual([false, true]);
  });
});
