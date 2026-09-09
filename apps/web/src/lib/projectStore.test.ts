// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { blankBoard } from "./board";
import { acknowledge, cacheProject, mergeProjects, readCache, SaveQueue, type CachedProject } from "./projectStore";
const cached = (): CachedProject => { const board = blankBoard("Project"); return { id: board.id, title: board.title, updatedAt: board.updatedAt, folderId: null, board, pending: true }; };
beforeEach(() => localStorage.clear());
describe("Project isolation and save queue", () => {
  it("keeps guest and every account separate", () => { cacheProject("A", cached()); cacheProject(null, cached()); expect(readCache("A")).toHaveLength(1); expect(readCache(null)).toHaveLength(1); expect(readCache("B")).toEqual([]); });
  it("never restores the shared v1 demo or replays mismatched v2 ids to cloud", () => {
    localStorage.setItem("mindcanvas:board:v1", JSON.stringify(blankBoard("DEMO"))); expect(readCache(null)).toEqual([]);
    localStorage.setItem("mindcanvas:board:v2:A", JSON.stringify({ ...blankBoard("Old"), id: "demo-board" }));
    expect(readCache("A")[0].pending).toBe(false);
    expect(mergeProjects([], readCache("A"), "A")).toEqual([]);
    expect(localStorage.getItem("mindcanvas:board:v2:A")).not.toBeNull();
  });
  it("does not acknowledge a newer unsaved revision", () => { const old = cached(); cacheProject("A", old); cacheProject("A", { ...old, board: { ...old.board, title: "Changed while saving" } }); acknowledge("A", old); expect(readCache("A")[0].pending).toBe(true); });
  it("acknowledges only the exact saved snapshot", () => { const p = cached(); cacheProject("A", p); acknowledge("A", p); expect(readCache("A")[0].pending).toBe(false); });
  it("keeps pending drafts when a remote list is empty", () => { const p = cached(); expect(mergeProjects([], [p], "A")).toEqual([p]); expect(mergeProjects([], [{ ...p, pending: false }], "A")).toEqual([]); });
  it("serializes requests and recovers after a failure", async () => {
    const queue = new SaveQueue(), order: number[] = [];
    const first = queue.run(async () => { order.push(1); await Promise.resolve(); order.push(2); throw new Error("Offline"); });
    const second = queue.run(async () => { order.push(3); return "ok"; });
    await expect(first).rejects.toThrow("Offline"); await expect(second).resolves.toBe("ok"); expect(order).toEqual([1, 2, 3]);
  });
});
