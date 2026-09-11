// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace } from "./useWorkspace";
import * as store from "../lib/projectStore";
let root: Root, api: ReturnType<typeof useWorkspace>, host: HTMLDivElement;
function Harness({ owner = null }: { owner?: string | null }) { api = useWorkspace(owner); return <span>{api.board?.title ?? "Workspace"}</span>; }
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
describe("Workspace lifecycle", () => {
  it("pan/zoom persists but does not add undo steps or destroy redo", async () => {
    await act(async () => root.render(<Harness/>));
    await act(async () => api.create("Map"));
    await act(async () => api.change({ ...api.board!, texts: [{ id: "t", text: "edit", x: 0, y: 0, width: 200 }] }));
    const editTime = api.board!.updatedAt;
    for (let i = 0; i < 20; i++) await act(async () => api.change({ ...api.board!, viewport: { x: i * 10, y: 30, scale: 1.5 } }));
    const view = api.board!.viewport;
    expect(api.board!.updatedAt).toBe(editTime);
    expect(store.readCache(null)[0].board.viewport).toEqual(view);
    await act(async () => api.undo());
    expect(api.board!.texts).toHaveLength(0); expect(api.canUndo).toBe(false); expect(api.board!.viewport).toEqual(view);
    await act(async () => api.change({ ...api.board!, viewport: { ...view, x: 999 } }));
    expect(api.canRedo).toBe(true);
    await act(async () => api.redo());
    expect(api.board!.texts[0].text).toBe("edit"); expect(api.board!.viewport.x).toBe(999);
  });
  it("navigation on a blank canvas creates no undo entry", async () => {
    await act(async () => root.render(<Harness/>)); await act(async () => api.create("Blank"));
    await act(async () => api.change({ ...api.board!, viewport: { x: 100, y: 100, scale: 2 } }));
    expect(api.canUndo).toBe(false);
  });
  it("opens on dashboard without creating a blank saved record", async () => { await act(async () => root.render(<Harness/>)); expect(api.board).toBeNull(); expect(api.projects).toEqual([]); });
  it("preserves the last edit when going home, opening, and undoing", async () => {
    await act(async () => root.render(<Harness/>));
    await act(async () => api.create("A"));
    const id = api.board!.id;
    await act(async () => api.change({ ...api.board!, texts: [{ id: "text", text: "saved", x: 20, y: 20, width: 200 }] }));
    await act(async () => api.undo()); expect(api.board!.texts).toHaveLength(0);
    await act(async () => api.redo()); expect(api.board!.texts[0].text).toBe("saved");
    await act(async () => api.home()); expect(api.board).toBeNull();
    await act(async () => api.open(api.projects.find(p => p.id === id)!)); expect(api.board!.texts[0].text).toBe("saved");
  });
  it("flushes before switching projects without mixing ids", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]); vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    const save = vi.spyOn(store, "persistProject").mockResolvedValue({});
    await act(async () => root.render(<Harness owner="A"/>));
    await act(async () => api.create("One")); const first = api.board!.id;
    await act(async () => api.change({ ...api.board!, title: "One edited" }));
    await act(async () => api.create("Two")); const second = api.board!.id;
    await act(async () => api.flush());
    expect(save.mock.calls.map(c => [c[1].id, c[1].board.title])).toEqual([[first, "One edited"], [second, "Two"]]);
  });
  it("retains local drafts after cloud errors and reports retry success truthfully", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]); vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    const save = vi.spyOn(store, "persistProject").mockRejectedValue(new Error("Network failure"));
    await act(async () => root.render(<Harness owner="A"/>));
    await act(async () => api.create("Draft"));
    await act(async () => api.flush()); expect(api.status).toBe("saveError"); expect(store.readCache("A")[0].pending).toBe(true);
    save.mockResolvedValue({}); await act(async () => api.flush()); expect(api.status).toBe("saved"); expect(store.readCache("A")[0].pending).toBe(false);
  });
  it("creates a checkpoint and restores it as one undoable canvas change", async () => {
    await act(async () => root.render(<Harness/>)); await act(async () => api.create("History"));
    await act(async () => api.change({ ...api.board!, texts: [{ id: "t", text: "before", x: 0, y: 0, width: 200 }] }));
    await act(async () => api.saveCheckpoint("Before next edit"));
    expect(api.versions).toHaveLength(1); expect(api.versions[0].board.texts[0].text).toBe("before");
    await act(async () => api.change({ ...api.board!, texts: [{ id: "t", text: "after", x: 0, y: 0, width: 200 }] }));
    await act(async () => api.restoreVersion(api.versions[0]));
    expect(api.board!.texts[0].text).toBe("before"); expect(api.canUndo).toBe(true);
  });
});
