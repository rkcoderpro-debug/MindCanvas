// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { blankBoard } from "./board";
import { acknowledge, cacheProject, createProjectVersion, fetchProjectVersions, mergeProjects, readCache, readFlashcards, sameBoardContent, SaveQueue, upsertFlashcards, type CachedProject } from "./projectStore";
import { createFlashcard } from "./flashcards";
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
  it("keeps a newer edit pending while advancing its saved base revision", () => { const old = { ...cached(), revision: 3 }; cacheProject("A", old); cacheProject("A", { ...old, board: { ...old.board, title: "Changed while saving" } }); acknowledge("A", old, 4); expect(readCache("A")[0].pending).toBe(true); expect(readCache("A")[0].revision).toBe(4); });
  it("acknowledges only the exact saved snapshot", () => { const p = cached(); cacheProject("A", p); acknowledge("A", p); expect(readCache("A")[0].pending).toBe(false); });
  it("keeps pending drafts when a remote list is empty", () => { const p = cached(); expect(mergeProjects([], [p], "A")).toEqual([p]); expect(mergeProjects([], [{ ...p, pending: false }], "A")).toEqual([]); });
  it("serializes requests and recovers after a failure", async () => {
    const queue = new SaveQueue(), order: number[] = [];
    const first = queue.run(async () => { order.push(1); await Promise.resolve(); order.push(2); throw new Error("Offline"); });
    const second = queue.run(async () => { order.push(3); return "ok"; });
    await expect(first).rejects.toThrow("Offline"); await expect(second).resolves.toBe("ok"); expect(order).toEqual([1, 2, 3]);
  });
  it("stores bounded local checkpoints in newest-first order", async () => {
    const first = blankBoard("First"), second = { ...first, title: "Second", updatedAt: new Date(Date.now() + 1000).toISOString() };
    const one = await createProjectVersion(null, first, "Initial"), two = await createProjectVersion(null, second, "Edited");
    expect(one.version).toBe(1); expect(two.version).toBe(2);
    const history = await fetchProjectVersions(null, first.id);
    expect(history.map(item => item.version)).toEqual([2, 1]); expect(history[0].board.title).toBe("Second"); expect(history.every(item => item.source === "local")).toBe(true);
  });
  it("treats viewport-only differences as the same document content", () => {
    const board = blankBoard("Same");
    expect(sameBoardContent(board, { ...board, viewport: { x: 400, y: -20, scale: 1.8 }, updatedAt: "2099-01-01T00:00:00.000Z" })).toBe(true);
    expect(sameBoardContent(board, { ...board, title: "Changed" })).toBe(false);
  });
  it("applies an AI flashcard preview as one complete local batch", async () => {
    const cards = [createFlashcard("deck", "Question 1", "Answer 1"), createFlashcard("deck", "Question 2", "Answer 2")];
    await expect(upsertFlashcards(null, cards)).resolves.toBe("local");
    expect(readFlashcards(null, "deck").map(card => card.front)).toEqual(["Question 1", "Question 2"]);
  });
});
