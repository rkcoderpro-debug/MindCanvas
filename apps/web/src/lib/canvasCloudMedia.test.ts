import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blankBoard, importBoard } from "./board";
import { clearCanvasCloudMediaCache, unpackCloudCanvas } from "./canvasCloudMedia";
import { fetchProjectSnapshot, persistProject, type CachedProject } from "./projectStore";

const supa = vi.hoisted(() => ({ from: vi.fn(), storage: { from: vi.fn() }, rpc: vi.fn() }));
vi.mock("./supabase", () => ({
  supabase: supa, getCurrentSession: async () => ({ user: { id: "owner" } }),
  requestTimeoutSignal: () => new AbortController().signal,
}));
const fixture = (): CachedProject => {
  const base = blankBoard("Heavy canvas");
  const data = (value: string) => "data:image/png;base64," + value.repeat(5_990_000);
  const board = { ...base, background: { kind: "image" as const, src: data("A") },
    media: [{ id: "picture", name: "Image", kind: "image" as const, src: data("B"), x: 0, y: 0, width: 40, height: 40 }] };
  return { id: board.id, title: board.title, board, updatedAt: board.updatedAt, folderId: null, revision: 21, ownerId: "owner", accessRole: "owner", pending: true };
};
function setup(project: CachedProject, { failUpload = false, conflict = false } = {}) {
  const objects = new Map<string, Blob>();
  const files = {
    exists: vi.fn(async (path: string) => ({ data: objects.has(path), error: null })),
    upload: vi.fn(async (path: string, body: Blob) => {
      if (failUpload) return { error: new Error("Storage disconnected") };
      objects.set(path, body);
      return { error: null };
    }),
    download: vi.fn(async (path: string) => ({ data: objects.get(path), error: null })),
  };
  let row = { id: project.id, user_id: "owner", title: project.title, folder_id: null,
    revision: project.revision, updated_at: project.board.updatedAt, content: { type: "mindcanvas-board", version: 1, board: project.board } };
  let next: typeof row;
  const q = {
    update: vi.fn(patch => { next = { ...row, ...patch }; return q; }),
    eq: vi.fn(() => q), select: vi.fn(() => q), abortSignal: vi.fn(() => q),
    maybeSingle: vi.fn(async () => {
      if (conflict) return { data: null, error: null };
      row = next;
      return { data: { id: row.id, revision: row.revision, updated_at: row.updated_at }, error: null };
    }),
    single: vi.fn(async () => ({ data: row, error: null })),
  };
  supa.from.mockReturnValue(q);
  supa.storage.from.mockReturnValue(files);
  supa.rpc.mockReturnValue({ abortSignal: async () => ({ data: true, error: null }) });
  vi.stubEnv("VITE_CANVAS_MEDIA_PILOT_IDS", project.id);
  return { q, files, objects, stored: () => row };
}
beforeEach(() => {
  vi.resetAllMocks(); clearCanvasCloudMediaCache();
  vi.stubEnv("VITE_CANVAS_MEDIA_STORAGE", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("Pilot canvas saves backed by private media", () => {
  it("reduces the heavy payload by over 95%, reuses both files for later strokes, and restores the media in a fresh session", async () => {
    const project = fixture(), { q, files, stored } = setup(project);
    const initialJsonBytes = new Blob([JSON.stringify(project.board)]).size;
    const confirmed = await persistProject("owner", project);
    expect(confirmed).toMatchObject({ revision: 22, assetFormat: 2 });
    expect(files.upload).toHaveBeenCalledTimes(2);
    const later = { ...project, ...confirmed, board: { ...project.board, drawings: [{ id: "stroke", points: [{ x: 0, y: 1 }], color: "#112233", width: 3, opacity: 1 }] } };
    // Disabling conversion does not downgrade a migrated note.
    vi.stubEnv("VITE_CANVAS_MEDIA_STORAGE", "false");
    await expect(persistProject("owner", later)).resolves.toMatchObject({ revision: 23, assetFormat: 2 });
    const patch = q.update.mock.calls[1][0];
    const patchBytes = new Blob([JSON.stringify(patch)]).size;
    expect(patchBytes).toBeLessThan(initialJsonBytes * 0.05);
    expect(patchBytes).toBeLessThan(2500);
    expect(JSON.stringify(patch)).not.toContain("data:image/");
    expect(files.upload).toHaveBeenCalledTimes(2);
    expect(q.single).not.toHaveBeenCalled();
    clearCanvasCloudMediaCache();
    const opened = await fetchProjectSnapshot("owner", project.id);
    expect(opened.board).toEqual(later.board);
    expect(opened).toMatchObject({ assetFormat: 2, revision: 23 });
    const portable = new File([JSON.stringify({ format: "mindcanvas", version: 1, board: opened.board })], "canvas.mindcanvas.json");
    const imported = await importBoard(portable);
    expect(imported.media[0].src).toBe(project.board.media[0].src);
    expect(imported.background).toEqual(project.board.background);
    expect(stored().revision).toBe(23);
  });

  it("does not publish a reference, or PATCH the original large JSON, if upload fails", async () => {
    const project = fixture(), { q, stored } = setup(project, { failUpload: true });
    await expect(persistProject("owner", project)).rejects.toThrow("Storage disconnected");
    expect(q.update).not.toHaveBeenCalled();
    expect(stored().revision).toBe(21);
    expect(project.pending).toBe(true);
  });

  it("keeps the previous cloud canvas when another revision wins and reuses staged assets on retry", async () => {
    const project = fixture(), { q, files, stored } = setup(project, { conflict: true });
    await expect(persistProject("owner", project)).rejects.toMatchObject({ code: "PROJECT_CONFLICT" });
    expect(stored().content.version).toBe(1);
    q.maybeSingle.mockResolvedValueOnce({ data: { id: project.id, updated_at: project.updatedAt, revision: 22 }, error: null } as never);
    await expect(persistProject("owner", project)).resolves.toMatchObject({ revision: 22 });
    expect(files.upload).toHaveBeenCalledTimes(2);
  });

  it("does not send storage requests or a pilot check for an unlisted canvas", async () => {
    const base = blankBoard("Unlisted canvas");
    const project = { ...fixture(), id: base.id, board: base, title: base.title, updatedAt: base.updatedAt };
    const { q, files } = setup(project);
    vi.stubEnv("VITE_CANVAS_MEDIA_PILOT_IDS", crypto.randomUUID());
    await expect(persistProject("owner", project)).resolves.toMatchObject({ revision: 22 });
    expect(supa.rpc).not.toHaveBeenCalled();
    expect(files.upload).not.toHaveBeenCalled();
    expect(q.update.mock.calls[0][0].content.version).toBe(1);
  });

  it("rejects a missing or corrupted file without replacing the canvas with a partial board", async () => {
    const project = fixture(), { objects, stored } = setup(project);
    await persistProject("owner", project);
    clearCanvasCloudMediaCache();
    const key = [...objects.keys()][0];
    objects.set(key, new Blob(["data:image/png;base64,V3Jvbmc="]));
    await expect(fetchProjectSnapshot("owner", project.id)).rejects.toThrow("không khớp");
    await expect(unpackCloudCanvas("other-user", crypto.randomUUID(), undefined, stored().content, {
      exists: async () => true, put: async () => undefined, get: async () => { throw new Error("must not request arbitrary object"); },
    })).rejects.toThrow("không hợp lệ");
  });
});
