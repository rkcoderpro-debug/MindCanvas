// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace } from "./useWorkspace";
import * as store from "../lib/projectStore";
import { arrangeMindMapMultiSided } from "../lib/board";
import { rotateMindMapSubtree } from "../lib/editorCommands";
import CanvasBoard from "../components/CanvasBoard";
const collaborationHarness = vi.hoisted(() => ({ callback: null as ((update: any) => void) | null }));
vi.mock("../lib/collaboration", () => ({
  subscribeToProject: vi.fn((_projectId: string, callback: (update: any) => void) => {
    collaborationHarness.callback = callback;
    return () => { if (collaborationHarness.callback === callback) collaborationHarness.callback = null; };
  }),
}));
let root: Root, api: ReturnType<typeof useWorkspace>, host: HTMLDivElement;
const persisted = (snapshot: store.CachedProject, revision?: number) => ({ revision, updatedAt: snapshot.board.updatedAt });
function Harness({ owner = null }: { owner?: string | null }) { api = useWorkspace(owner); return <span>{api.board?.title ?? "Workspace"}</span>; }
function CanvasHarness() {
  api = useWorkspace(null);
  return api.board
    ? <CanvasBoard board={api.board} onChange={api.change} onViewportChange={api.navigate} onUndo={api.undo} onRedo={api.redo} canUndo={api.canUndo} canRedo={api.canRedo} onSave={() => undefined}/>
    : <span>Workspace</span>;
}
function pointer(target: Element, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  target.dispatchEvent(event);
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  SVGElement.prototype.setPointerCapture = () => {};
  SVGElement.prototype.hasPointerCapture = () => false;
  SVGElement.prototype.releasePointerCapture = () => {};
  localStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); collaborationHarness.callback = null; vi.restoreAllMocks(); });
describe("Workspace lifecycle", () => {
  it("keeps the remote revision and owner when opening an invitation", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]);
    vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    vi.spyOn(store, "fetchProjectVersions").mockResolvedValue([]);
    const board = (await import("../lib/board")).blankBoard("Shared");
    const snapshot: store.CachedProject = { id: board.id, title: board.title, board, folderId: null, updatedAt: board.updatedAt, pending: false, revision: 7, ownerId: "original-owner", shared: true, accessRole: "editor" };
    vi.spyOn(store, "fetchProjectSnapshot").mockResolvedValue(snapshot);
    const save = vi.spyOn(store, "persistProject").mockResolvedValue({ revision: 8 });
    await act(async () => root.render(<Harness owner="editor"/>));
    await act(async () => api.open({ id: board.id, title: board.title, folderId: null, updatedAt: board.updatedAt, shared: true, accessRole: "editor" }));
    expect(store.readCache("editor")[0].revision).toBe(7);
    await act(async () => api.change({ ...api.board!, title: "Editor change" }));
    await act(async () => api.flush());
    expect(save.mock.calls[0][1]).toMatchObject({ revision: 7, ownerId: "original-owner", accessRole: "editor" });
  });
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
  it("makes each applied mind-map layout or rotation one undoable transaction", async () => {
    await act(async () => root.render(<Harness/>)); await act(async () => api.create("Mind map"));
    const map = { ...api.board!, nodes: [
      { id: "root", label: "Root", x: 0, y: 0, width: 190, height: 76 },
      { id: "left", label: "Left", parentId: "root", x: 0, y: 0, width: 190, height: 76 },
      { id: "right", label: "Right", parentId: "root", x: 0, y: 0, width: 190, height: 76 },
    ], edges: [{ id: "root-left", source: "root", target: "left", kind: "branch" as const }, { id: "root-right", source: "root", target: "right", kind: "branch" as const }] };
    await act(async () => api.change(map));
    const beforeLayout = api.board!;
    const laidOut = arrangeMindMapMultiSided(beforeLayout, "root", 4, "radial").board;
    await act(async () => api.change(laidOut));
    expect(api.canUndo).toBe(true);
    await act(async () => api.undo());
    expect(api.board!.nodes).toEqual(beforeLayout.nodes);
    await act(async () => api.redo());
    expect(api.board!.nodes).toEqual(laidOut.nodes);

    const beforeRotation = api.board!;
    const rotated = rotateMindMapSubtree(beforeRotation, "root", 45);
    await act(async () => api.change(rotated));
    await act(async () => api.undo());
    expect(api.board!.nodes).toEqual(beforeRotation.nodes);
    await act(async () => api.redo());
    expect(api.board!.nodes).toEqual(rotated.nodes);
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
  it("persists an in-progress drawing draft before leaving the canvas", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]); vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    const save = vi.spyOn(store, "persistProject").mockImplementation(async (_owner, snapshot) => ({ revision: snapshot.revision === undefined ? 0 : snapshot.revision + 1 }));
    await act(async () => root.render(<Harness owner="A"/>));
    await act(async () => api.create("Draft stroke"));
    await act(async () => api.flush());
    const draft = { ...api.board!, drawings: [{ id: "draft", points: [{ x: 10, y: 10 }, { x: 80, y: 60 }], color: "#123456", width: 4, opacity: 1 }] };
    await act(async () => api.checkpointDraft(draft));
    expect(store.readCache("A")[0].board.drawings).toHaveLength(1);
    expect(store.readCache("A")[0].pending).toBe(true);
    await act(async () => api.home());
    expect(save.mock.calls.at(-1)?.[1].board.drawings).toHaveLength(1);
  });
  it("checkpoints the latest canvas state on pagehide before delayed persistence runs", async () => {
    await act(async () => root.render(<Harness/>));
    await act(async () => api.create("Pagehide recovery"));
    const id = api.board!.id;
    await act(async () => api.navigate({ ...api.board!, viewport: { x: 321, y: -144, scale: 1.42 } }));
    // navigate() normally defers the cache write; pagehide must checkpoint the
    // in-memory canvas immediately so reopening cannot fall back to stale data.
    await act(async () => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    expect(store.readCache(null).find(project => project.id === id)?.board.viewport).toEqual({ x: 321, y: -144, scale: 1.42 });
  });
  it("records newly created canvas text and shapes as undoable edits", async () => {
    await act(async () => root.render(<CanvasHarness/>));
    await act(async () => api.create("Canvas history"));
    const svg = host.querySelector("svg.canvas-svg")!;
    await act(async () => (host.querySelector('[aria-label="Chữ"]') as HTMLButtonElement).click());
    await act(async () => pointer(svg, "pointerdown", 120, 140));
    const editor = host.querySelector<HTMLTextAreaElement>("textarea")!;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    valueSetter.call(editor, "Undoable text");
    await act(async () => editor.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })));
    expect(api.board?.texts).toHaveLength(1);
    expect(api.canUndo).toBe(true);
    await act(async () => api.undo());
    expect(api.board?.texts).toHaveLength(0);

    await act(async () => (host.querySelector('[aria-label="Chữ nhật"]') as HTMLButtonElement).click());
    await act(async () => { pointer(svg, "pointerdown", 40, 50); pointer(svg, "pointermove", 180, 150); pointer(svg, "pointerup", 180, 150); });
    expect(api.board?.shapes).toHaveLength(1);
    expect(api.canUndo).toBe(true);
    await act(async () => api.undo());
    expect(api.board?.shapes).toHaveLength(0);
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
  it("still returns to Workspace after a save timeout while retaining the pending draft", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]); vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    vi.spyOn(store, "persistProject").mockRejectedValue(new Error("TimeoutError: signal timed out"));
    await act(async () => root.render(<Harness owner="A"/>));
    await act(async () => api.create("Timeout draft"));
    await act(async () => api.flush());
    expect(api.status).toBe("saveError");
    const id = api.board!.id;
    await act(async () => api.home());
    expect(api.board).toBeNull();
    expect(store.readCache("A").find(project => project.id === id)?.pending).toBe(true);
  });
  it("opens a new canvas while the previous cloud save is still stalled", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]); vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    let stalledId = "";
    const save = vi.spyOn(store, "persistProject").mockImplementation(async (_owner, snapshot) => snapshot.id === stalledId ? new Promise(() => undefined) : {});
    await act(async () => root.render(<Harness owner="A"/>));
    await act(async () => api.create("Stalled"));
    await act(async () => api.change({ ...api.board!, title: "Stalled edit" }));
    const previousId = api.board!.id;
    stalledId = previousId;
    await act(async () => api.create("Next canvas"));
    const nextId = api.board!.id;
    expect(api.board?.title).toBe("Next canvas");
    await act(async () => api.flush(nextId));
    expect(save.mock.calls.some(call => call[1].id === previousId)).toBe(true);
    expect(save.mock.calls.some(call => call[1].id === nextId)).toBe(true);
    expect(store.readCache("A").find(project => project.board.title === "Next canvas")?.pending).toBe(false);
  });
  it("uses the acknowledged revision for consecutive cloud saves", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]); vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    const save = vi.spyOn(store, "persistProject").mockImplementation(async (_owner, snapshot) => ({ revision: (snapshot.revision ?? -1) + 1 }));
    await act(async () => root.render(<Harness owner="A"/>));
    await act(async () => api.create("Mobile")); await act(async () => api.flush());
    await act(async () => api.change({ ...api.board!, title: "Mobile 2" })); await act(async () => api.flush());
    await act(async () => api.change({ ...api.board!, title: "Mobile 3" })); await act(async () => api.flush());
    expect(save.mock.calls.map(call => call[1].revision)).toEqual([undefined, 0, 1]);
    expect(store.readCache("A")[0].revision).toBe(2); expect(api.status).toBe("saved");
  });
  it("does not clear a pending stroke from an unverified realtime echo", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]); vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    vi.spyOn(store, "persistProject").mockImplementation(async (_owner, snapshot) => {
      collaborationHarness.callback?.({ projectId: snapshot.id, board: snapshot.board, revision: 0, updatedAt: snapshot.updatedAt });
      throw new Error("Cloud readback failed");
    });
    await act(async () => root.render(<Harness owner="A"/>));
    await act(async () => api.create("New stroke"));
    await act(async () => api.flush());
    expect(store.readCache("A")[0].pending).toBe(true);
    expect(api.status).toBe("saveError");
  });
  it("keeps Undo after the cloud echo changes status from saving to saved", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]); vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    const save = vi.spyOn(store, "persistProject").mockImplementation(async (_owner, snapshot) => ({ revision: (snapshot.revision ?? -1) + 1 }));
    await act(async () => root.render(<Harness owner="A"/>));
    await act(async () => api.create("Cloud history")); await act(async () => api.flush());
    const before = api.board!;
    await act(async () => api.change({ ...before, texts: [{ id: "t", text: "cloud edit", x: 40, y: 40, width: 180 }] }));
    expect(api.canUndo).toBe(true);
    await act(async () => api.flush());
    expect(api.status).toBe("saved"); expect(api.canUndo).toBe(true); expect(save).toHaveBeenCalledTimes(2);
    expect(collaborationHarness.callback).toBeTypeOf("function");
    const echoed = { ...api.board!, viewport: { x: 240, y: -80, scale: 1.27 }, updatedAt: "2099-01-01T00:00:00.000Z" };
    await act(async () => collaborationHarness.callback?.({ projectId: echoed.id, board: echoed, revision: 1, updatedAt: echoed.updatedAt }));
    expect(api.status).toBe("saved"); expect(api.canUndo).toBe(true);
    const serverCanonicalized = { ...api.board!, title: "cloud edit (canonical)", updatedAt: "2099-01-01T00:00:01.000Z" };
    await act(async () => collaborationHarness.callback?.({ projectId: serverCanonicalized.id, board: serverCanonicalized, revision: 1, updatedAt: serverCanonicalized.updatedAt }));
    expect(api.board!.title).toBe("Cloud history"); expect(api.canUndo).toBe(true);
    await act(async () => api.undo());
    expect(api.board!.texts).toHaveLength(0); expect(api.canRedo).toBe(true);
  });
  it("pauses a real cross-device conflict and overwrites only after an explicit choice", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]); vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    const save = vi.spyOn(store, "persistProject").mockResolvedValueOnce({ revision: 0 });
    await act(async () => root.render(<Harness owner="A"/>));
    await act(async () => api.create("Phone")); await act(async () => api.flush());
    const local = { ...api.board!, title: "Phone edit", updatedAt: "2026-09-11T02:00:00.000Z" };
    const remoteBoard = { ...api.board!, title: "Desktop edit", updatedAt: "2026-09-11T02:01:00.000Z" };
    const remote = { id: remoteBoard.id, title: remoteBoard.title, board: remoteBoard, folderId: null, updatedAt: remoteBoard.updatedAt, pending: false, revision: 1 };
    vi.spyOn(store, "fetchProjectSnapshot").mockResolvedValue(remote);
    save.mockRejectedValueOnce(new store.ProjectConflictError(remote.id)).mockResolvedValueOnce({ revision: 2 });
    // A recovery checkpoint can exceed localStorage for media-heavy projects;
    // the explicit conflict choice must still complete.
    vi.spyOn(store, "createProjectVersion").mockRejectedValue(new Error("Version cache quota exceeded"));
    await act(async () => api.change(local)); await act(async () => api.flush());
    expect(api.conflict?.remote.board.title).toBe("Desktop edit"); expect(api.status).toBe("saveError");
    await act(async () => api.resolveConflict("overwrite", "copy"));
    expect(save.mock.calls.at(-1)?.[1].revision).toBe(1); expect(api.conflict).toBeNull(); expect(api.status).toBe("saved"); expect(api.board?.title).toBe("Phone edit");
  });
  it("uses the latest cloud version after preserving the device draft as a recovery checkpoint", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]); vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    const save = vi.spyOn(store, "persistProject").mockImplementation(async (_owner, snapshot) => persisted(snapshot, 0));
    await act(async () => root.render(<Harness owner="A"/>));
    await act(async () => api.create("Phone")); await act(async () => api.flush());
    const local = { ...api.board!, title: "Phone edit", updatedAt: "2026-09-25T02:00:00.000Z" };
    const remoteBoard = { ...api.board!, title: "Desktop edit", updatedAt: "2026-09-25T02:01:00.000Z" };
    const remote = { id: remoteBoard.id, title: remoteBoard.title, board: remoteBoard, folderId: null, updatedAt: remoteBoard.updatedAt, pending: false, revision: 1 };
    vi.spyOn(store, "fetchProjectSnapshot").mockResolvedValue(remote);
    vi.spyOn(store, "createProjectVersion").mockRejectedValue(new Error("Recovery checkpoint unavailable"));
    save.mockRejectedValueOnce(new store.ProjectConflictError(remote.id));

    await act(async () => api.change(local)); await act(async () => api.flush());
    expect(api.conflict?.local.board.title).toBe("Phone edit");
    const saveCountBeforeCloudChoice = save.mock.calls.length;
    let resolved = false;
    await act(async () => { resolved = await api.resolveConflict("cloud"); });

    expect(resolved).toBe(true);
    expect(api.conflict).toBeNull();
    expect(api.board?.title).toBe("Desktop edit");
    expect(store.readCache("A").find(project => project.id === remote.id)).toMatchObject({ board: { title: "Desktop edit" }, pending: false });
    expect(save).toHaveBeenCalledTimes(saveCountBeforeCloudChoice);
  });
  it("keeps the local edit and exposes the write error when overwrite fails, then allows retry", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]); vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    const save = vi.spyOn(store, "persistProject").mockImplementationOnce(async (_owner, snapshot) => persisted(snapshot, 0));
    await act(async () => root.render(<Harness owner="A"/>));
    await act(async () => api.create("Phone")); await act(async () => api.flush());
    const local = { ...api.board!, title: "Phone edit", updatedAt: "2026-09-25T02:00:00.000Z" };
    const remoteBoard = { ...api.board!, title: "Desktop edit", updatedAt: "2026-09-25T02:01:00.000Z" };
    const remote = { id: remoteBoard.id, title: remoteBoard.title, board: remoteBoard, folderId: null, updatedAt: remoteBoard.updatedAt, pending: false, revision: 1 };
    vi.spyOn(store, "fetchProjectSnapshot").mockResolvedValue(remote);
    save.mockRejectedValueOnce(new store.ProjectConflictError(remote.id));
    vi.spyOn(store, "createProjectVersion").mockRejectedValue(new Error("Checkpoint storage unavailable"));
    await act(async () => api.change(local)); await act(async () => api.flush());
    save.mockRejectedValueOnce(new Error("42501: update rejected by row-level security"));

    let resolved = true;
    await act(async () => { resolved = await api.resolveConflict("overwrite"); });
    expect(resolved).toBe(false);
    expect(api.conflict?.error).toContain("42501");
    expect(api.board?.title).toBe("Phone edit");
    expect(store.readCache("A").find(project => project.id === remote.id)).toMatchObject({ board: { title: "Phone edit" }, pending: true });

    save.mockImplementationOnce(async (_owner, snapshot) => persisted(snapshot, 2));
    await act(async () => { resolved = await api.resolveConflict("overwrite"); });
    expect(resolved).toBe(true);
    expect(api.conflict).toBeNull();
    expect(api.status).toBe("saved");
    expect(api.board?.title).toBe("Phone edit");
  });
  it("saves the device version as a separate cloud project without changing the remote version", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]); vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    const save = vi.spyOn(store, "persistProject").mockImplementationOnce(async (_owner, snapshot) => persisted(snapshot, 0));
    await act(async () => root.render(<Harness owner="A"/>));
    await act(async () => api.create("Phone")); await act(async () => api.flush());
    const local = { ...api.board!, title: "Phone edit", updatedAt: "2026-09-25T02:00:00.000Z" };
    const remoteBoard = { ...api.board!, title: "Desktop edit", updatedAt: "2026-09-25T02:01:00.000Z" };
    const remote = { id: remoteBoard.id, title: remoteBoard.title, board: remoteBoard, folderId: null, updatedAt: remoteBoard.updatedAt, pending: false, revision: 1 };
    vi.spyOn(store, "fetchProjectSnapshot").mockResolvedValue(remote);
    save.mockRejectedValueOnce(new store.ProjectConflictError(remote.id));
    await act(async () => api.change(local)); await act(async () => api.flush());
    save.mockImplementationOnce(async (_owner, snapshot) => persisted(snapshot, 0));

    let resolved = false;
    await act(async () => { resolved = await api.resolveConflict("copy", "copy"); });
    expect(resolved).toBe(true);
    expect(api.conflict).toBeNull();
    expect(api.board?.title).toBe("Phone edit — copy");
    expect(api.board?.id).not.toBe(remote.id);
    expect(api.projects.find(project => project.id === remote.id)?.board?.title).toBe("Desktop edit");
    expect(api.projects.find(project => project.id === api.board?.id)).toMatchObject({ pending: false, board: { title: "Phone edit — copy" } });
  });
  it("refreshes the cloud side and asks again if another save wins during overwrite", async () => {
    vi.spyOn(store, "fetchProjects").mockResolvedValue([]); vi.spyOn(store, "fetchFolders").mockResolvedValue([]);
    const save = vi.spyOn(store, "persistProject").mockImplementationOnce(async (_owner, snapshot) => persisted(snapshot, 0));
    await act(async () => root.render(<Harness owner="A"/>));
    await act(async () => api.create("Phone")); await act(async () => api.flush());
    const local = { ...api.board!, title: "Phone edit", updatedAt: "2026-09-25T02:00:00.000Z" };
    const remoteBoard = { ...api.board!, title: "Desktop edit", updatedAt: "2026-09-25T02:01:00.000Z" };
    const newerBoard = { ...api.board!, title: "Desktop edit again", updatedAt: "2026-09-25T02:02:00.000Z" };
    const remote = { id: remoteBoard.id, title: remoteBoard.title, board: remoteBoard, folderId: null, updatedAt: remoteBoard.updatedAt, pending: false, revision: 1 };
    const newerRemote = { ...remote, title: newerBoard.title, board: newerBoard, updatedAt: newerBoard.updatedAt, revision: 2 };
    vi.spyOn(store, "fetchProjectSnapshot").mockResolvedValueOnce(remote).mockResolvedValueOnce(remote).mockResolvedValueOnce(newerRemote);
    save.mockRejectedValueOnce(new store.ProjectConflictError(remote.id));
    await act(async () => api.change(local)); await act(async () => api.flush());
    save.mockRejectedValueOnce(new store.ProjectConflictError(remote.id));

    let resolved = true;
    await act(async () => { resolved = await api.resolveConflict("overwrite"); });
    expect(resolved).toBe(false);
    expect(api.conflict?.remote.board.title).toBe("Desktop edit again");
    expect(api.conflict?.error).toContain("Cloud vừa thay đổi");
    expect(api.board?.title).toBe("Phone edit");
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
