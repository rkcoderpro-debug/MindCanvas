import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardState } from "@mindcanvas/shared";
import { blankBoard } from "../lib/board";
import { normalizeEditor } from "../lib/editorCommands";
import { errorMessage } from "../lib/errors";
import { updateProject, type ProjectPatch } from "../lib/projectStore";
import { subscribeToProject } from "../lib/collaboration";
import { acknowledge, addFolder, cacheProject, createProjectVersion, deleteFolder, fetchBoard, fetchFolders, fetchProjectSnapshot, fetchProjects, fetchProjectVersions, hydrateProjectCache, mergeProjects, persistProject, ProjectConflictError, readCache, sameBoardContent, SaveQueue, updateFolder, type CachedProject, type Project, type ProjectFolder, type ProjectVersion } from "../lib/projectStore";

export type SaveStatus = "localSaved" | "saved" | "saving" | "pending" | "offline" | "saveError";
export type WorkspaceConflict = { projectId: string; local: CachedProject; remote: CachedProject };
export type ConflictResolution = "cloud" | "overwrite" | "copy";
const CONFLICT_CHECKPOINT_WAIT_MS = 4000;
function createRecoveryCheckpoint(owner: string, board: BoardState, label: string) {
  return new Promise<void>(resolve => {
    const timeout = window.setTimeout(resolve, CONFLICT_CHECKPOINT_WAIT_MS);
    void createProjectVersion(owner, board, label).catch(() => undefined).finally(() => { window.clearTimeout(timeout); resolve(); });
  });
}
// Mount once per account (App keys this component by user.id).
export function useWorkspace(owner: string | null) {
  const [board, setBoard] = useState<BoardState | null>(null);
  const current = useRef<BoardState | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]), [versionLoading, setVersionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<WorkspaceConflict | null>(null);
  const [status, setStatus] = useState<SaveStatus>(owner ? "saved" : "localSaved");
  const [past, setPast] = useState<BoardState[]>([]), [future, setFuture] = useState<BoardState[]>([]);
  const folderId = useRef<string | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true), queue = useRef(new SaveQueue()), dirty = useRef(false), cacheFailed = useRef(false);
  const conflictRef = useRef<WorkspaceConflict | null>(null);
  const navigation = useRef(0);
  const report = useCallback((err: unknown) => { if (alive.current) setError(errorMessage(err, "Could not save this project.")); }, []);
  const refresh = useCallback(async () => {
    try {
      await hydrateProjectCache(owner);
      const cache = readCache(owner);
      dirty.current = cache.some(p => p.pending);
      if (alive.current) { setProjects(cache); if (dirty.current) setStatus(navigator.onLine ? "pending" : "offline"); }
      try {
        const [remote, fs] = await Promise.all([owner ? fetchProjects(owner) : Promise.resolve([]), fetchFolders(owner)]);
        if (alive.current) {
          const merged = mergeProjects(remote, readCache(owner), owner);
          dirty.current = merged.some(p => p.pending);
          setProjects(merged);
          setFolders(fs);
          if (!dirty.current) setStatus(owner ? "saved" : "localSaved");
        }
      } catch (err) {
        // Opening a cached workspace must remain possible without a network.
        // Online failures are still reported so credentials/RLS issues remain visible.
        if (alive.current && !navigator.onLine) setStatus("offline");
        else throw err;
      }
    } catch (err) { report(err); } finally { if (alive.current) setLoading(false); }
  }, [owner, report]);
  const upsertSummary = (p: Project) => { if (alive.current) setProjects(items => [p, ...items.filter(i => i.id !== p.id)]); };

  const flush = useCallback(async (projectId?: string): Promise<boolean> => {
    // An explicit flush for an older project must not cancel the debounce for
    // the canvas that is currently open.
    if (!projectId || projectId === current.current?.id) clearTimeout(timer.current);
    const cached = readCache(owner);
    const targetIds = projectId
      ? [projectId]
      : [...new Set(cached.filter(project => project.pending).map(project => project.id))];
    if (cacheFailed.current && current.current && !targetIds.includes(current.current.id)) targetIds.push(current.current.id);
    if (!targetIds.length) {
      if (alive.current) setStatus(owner ? "saved" : "localSaved");
      return true;
    }

    const flushProject = async (targetId: string) => queue.current.run(async () => {
      if (!alive.current) return false;
      if (conflictRef.current?.projectId === targetId) {
        if (alive.current && current.current?.id === targetId) setStatus("saveError");
        return false;
      }
      try {
        if (cacheFailed.current && current.current?.id === targetId) {
          const b = current.current;
          const existing = readCache(owner).find(item => item.id === b.id);
          cacheProject(owner, { ...existing, id: b.id, title: b.title, updatedAt: b.updatedAt, board: b, folderId: folderId.current, pending: !!owner, revision: existing?.revision, ownerId: existing?.ownerId ?? owner ?? undefined, accessRole: existing?.accessRole ?? (owner ? "owner" : undefined), shared: existing?.shared ?? false });
          cacheFailed.current = false;
        }
        const pending = readCache(owner).filter(p => {
          if (p.id !== targetId) return false;
          if (!p.pending) return false;
          const shared = p.shared || (!!p.ownerId && p.ownerId !== owner);
          // A shared cache entry from an earlier session is never allowed to
          // upload itself before this session has fetched its cloud revision.
          // The active project may still flush a legitimate editor change.
          if (shared && p.id !== current.current?.id) {
            cacheProject(owner, { ...p, pending: false, cloudOffline: false });
            return false;
          }
          return true;
        });
        if (!owner) { if (current.current?.id === targetId) setStatus("localSaved"); return true; }
        if (!navigator.onLine) { if (current.current?.id === targetId) setStatus("offline"); return false; }
        if (pending.length && current.current?.id === targetId) setStatus("saving");
        for (const snapshot of pending) {
          if (!alive.current) return false;
          const save = async (candidate: CachedProject) => {
            const saved = await persistProject(owner, candidate);
            acknowledge(owner, candidate, saved?.revision);
            const cached = readCache(owner).find(item => item.id === candidate.id);
            if (alive.current && cached) setProjects(items => [cached, ...items.filter(item => item.id !== cached.id)]);
          };
          try {
            await save(snapshot);
          } catch (err) {
            if (!(err instanceof ProjectConflictError)) throw err;
            const remote = await fetchProjectSnapshot(owner, snapshot.id);
            const local = readCache(owner).find(item => item.id === snapshot.id) ?? snapshot;
            // Viewport-only saves from another device are safe to rebase. Real
            // content/folder differences require an explicit user decision.
            if (remote.revision !== undefined && local.folderId === remote.folderId && sameBoardContent(local.board, remote.board)) {
              const rebased = { ...local, revision: remote.revision, pending: true };
              cacheProject(owner, rebased);
              await save(rebased);
              continue;
            }
            const next = { projectId: snapshot.id, local, remote };
            conflictRef.current = next; setConflict(next); setError(""); setStatus("saveError");
            return false;
          }
        }
        return true;
      } catch (err) { if (alive.current) setStatus(navigator.onLine ? "saveError" : "offline"); report(err); return false; }
    }, targetId);

    const outcomes = await Promise.all(targetIds.map(async id => [id, await flushProject(id)] as const));
    const resultById = new Map(outcomes);
    const allSaved = outcomes.every(([, saved]) => saved);
    if (alive.current) {
      dirty.current = readCache(owner).some(p => p.pending);
      const activeId = current.current?.id;
      const activePending = !!activeId && readCache(owner).some(p => p.id === activeId && p.pending);
      const activeConflict = !!activeId && conflictRef.current?.projectId === activeId;
      const activeResult = activeId ? resultById.get(activeId) : undefined;
      if (activeConflict) setStatus("saveError");
      else if (activeResult === false) setStatus(navigator.onLine ? "saveError" : "offline");
      else if (activePending) setStatus(navigator.onLine ? "pending" : "offline");
      else if (!allSaved) setStatus("saveError");
      else setStatus(owner ? "saved" : "localSaved");
    }
    return allSaved;
  }, [owner, report]);

  useEffect(() => {
    alive.current = true; void refresh();
    const cameOnline = () => { setOnline(true); void flush(); };
    const wentOffline = () => { setOnline(false); setStatus(cacheFailed.current ? "saveError" : "offline"); };
    const beforeUnload = (e: BeforeUnloadEvent) => { if ((owner && dirty.current) || cacheFailed.current) { e.preventDefault(); e.returnValue = ""; } };
    const hidden = () => { if (document.visibilityState === "hidden") void flush(); };
    window.addEventListener("online", cameOnline); window.addEventListener("offline", wentOffline);
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("visibilitychange", hidden);
    return () => { alive.current = false; clearTimeout(timer.current); clearTimeout(viewportTimer.current); window.removeEventListener("online", cameOnline); window.removeEventListener("offline", wentOffline); window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("visibilitychange", hidden); };
  }, [refresh, flush, owner]);

  // A shared project receives durable Postgres Changes while it is open. The
  // current viewport remains local; a remote content update is applied only
  // when this device has no pending edit, so an in-flight local edit can still
  // be resolved through the existing conflict dialog.
  useEffect(() => {
    const projectId = board?.id;
    if (!owner || !projectId) return;
    return subscribeToProject(projectId, update => {
      if (!alive.current || current.current?.id !== update.projectId) return;
      const local = current.current;
      if (!local) return;
      if (JSON.stringify(local) === JSON.stringify(update.board)) {
        const cached = readCache(owner).find(item => item.id === projectId);
        if (cached && update.revision !== undefined) cacheProject(owner, { ...cached, revision: update.revision, pending: cached.pending });
        return;
      }
      // A pending edit in a different project should not pause this project's
      // collaboration stream. The cache entry is the per-project dirty flag.
      if (cacheFailed.current || readCache(owner).some(item => item.id === projectId && item.pending)) return;
      const next = normalizeEditor({ ...update.board, viewport: local.viewport });
      current.current = next;
      setBoard(next);
      setPast([]);
      setFuture([]);
      const cached = readCache(owner).find(item => item.id === projectId);
      if (cached) cacheProject(owner, { ...cached, title: next.title, updatedAt: next.updatedAt, board: next, revision: update.revision ?? cached.revision, pending: false });
      setProjects(items => items.map(item => item.id === projectId ? { ...item, title: next.title, updatedAt: update.updatedAt ?? next.updatedAt, revision: update.revision ?? item.revision, board: next, pending: false } : item));
      setStatus("saved");
    });
  }, [owner, board?.id]);

  const stage = (next: BoardState, delay = 750) => {
    clearTimeout(viewportTimer.current);
    next = normalizeEditor(next, current.current ?? undefined);
    dirty.current = !!owner;
    current.current = next; setBoard(next);
    try {
      // The cache is authoritative for the latest acknowledged revision. React
      // state can still contain the revision from the previous render.
      const existing = readCache(owner).find(p => p.id === next.id) ?? projects.find(p => p.id === next.id);
      // Keep the access metadata from a shared project when an editor saves a
      // board. `owner` is the signed-in user, so it cannot by itself mean that
      // this user owns the note.
      const ownerId = existing?.ownerId ?? owner ?? undefined;
      const shared = existing?.shared ?? (!!ownerId && ownerId !== owner);
      const accessRole = existing?.accessRole ?? (shared ? "viewer" : owner ? "owner" : undefined);
      const p: CachedProject = { favorite: existing?.favorite, deletedAt: existing?.deletedAt, revision: existing?.revision, ownerId, accessRole, shared, cloudOffline: existing?.cloudOffline, id: next.id, title: next.title, updatedAt: next.updatedAt, board: next, folderId: folderId.current, pending: !!owner };
      cacheProject(owner, p); cacheFailed.current = false; upsertSummary(p); dirty.current = !!owner;
      const activeConflict = conflictRef.current?.projectId === next.id ? { ...conflictRef.current, local: p } : null;
      if (activeConflict) { conflictRef.current = activeConflict; setConflict(activeConflict); }
      setStatus(activeConflict ? "saveError" : !navigator.onLine ? "offline" : owner ? "pending" : "localSaved");
      clearTimeout(timer.current); if (owner && !activeConflict) timer.current = setTimeout(() => void flush(next.id), delay);
    } catch (err) { cacheFailed.current = true; setStatus("saveError"); report(err); }
  };
  const change = (next: BoardState) => {
    const activeProject = current.current && readCache(owner).find(item => item.id === current.current?.id);
    if (activeProject?.accessRole === "viewer" || activeProject?.cloudOffline) return;
    next = normalizeEditor(next, current.current ?? undefined);
    if (current.current && current.current.id !== next.id) return;
    if (current.current && JSON.stringify(current.current) === JSON.stringify(next)) return;
    const previous = current.current;
    // Navigation is persisted, but is not a document edit or an undo entry.
    if (previous) {
      const { viewport: _oldView, updatedAt: _oldTime, ...oldContent } = previous;
      const { viewport: _newView, updatedAt: _newTime, ...newContent } = next;
      if (JSON.stringify(oldContent) === JSON.stringify(newContent)) {
        stage({ ...next, updatedAt: previous.updatedAt }, 2000);
        return;
      }
    }
    setPast(p => previous ? [...p.slice(-49), previous] : p); setFuture([]);
    stage({ ...next, updatedAt: new Date().toISOString() });
  };
  const undo = () => { const previous = past.at(-1), now = current.current, active = now && readCache(owner).find(item => item.id === now.id); if (!previous || !now || active?.accessRole === "viewer" || active?.cloudOffline) return; setPast(p => p.slice(0, -1)); setFuture(f => [now, ...f]); stage({ ...previous, viewport: now.viewport, updatedAt: new Date().toISOString() }); };
  const redo = () => { const next = future[0], now = current.current, active = now && readCache(owner).find(item => item.id === now.id); if (!next || !now || active?.accessRole === "viewer" || active?.cloudOffline) return; setFuture(f => f.slice(1)); setPast(p => [...p, now]); stage({ ...next, viewport: now.viewport, updatedAt: new Date().toISOString() }); };
  const loadVersions = async () => {
    const projectId = current.current?.id;
    if (!projectId) { setVersions([]); return []; }
    setVersionLoading(true);
    try {
      const result = await fetchProjectVersions(owner, projectId);
      if (alive.current && current.current?.id === projectId) setVersions(result);
      return result;
    } catch (err) { report(err); return []; }
    finally { if (alive.current) setVersionLoading(false); }
  };
  const saveCheckpoint = async (label?: string) => {
    const snapshot = current.current;
    if (!snapshot) return null;
    if (readCache(owner).find(item => item.id === snapshot.id)?.accessRole === "viewer" || readCache(owner).find(item => item.id === snapshot.id)?.cloudOffline) throw new Error("Bạn chỉ có quyền xem project này.");
    if (!await flush()) throw new Error("Please save your pending changes and reconnect first.");
    const version = await createProjectVersion(owner, snapshot, label);
    if (alive.current && current.current?.id === snapshot.id) setVersions(items => [version, ...items.filter(item => item.id !== version.id)].sort((a, b) => b.version - a.version).slice(0, 30));
    return version;
  };
  const restoreVersion = async (version: ProjectVersion) => {
    const snapshot = current.current;
    if (!snapshot || snapshot.id !== version.projectId) throw new Error("This version belongs to another project.");
    if (readCache(owner).find(item => item.id === snapshot.id)?.accessRole === "viewer" || readCache(owner).find(item => item.id === snapshot.id)?.cloudOffline) throw new Error("Bạn chỉ có quyền xem project này.");
    if (!await flush()) throw new Error("Please save your pending changes and reconnect first.");
    await createProjectVersion(owner, snapshot, "Before restore");
    change({ ...version.board, id: snapshot.id, updatedAt: new Date().toISOString() });
    await loadVersions();
  };
  const open = async (p: Project) => {
    if (p.deletedAt) return;
    const ticket = ++navigation.current;
    await flush();
    if (cacheFailed.current || ticket !== navigation.current) return;
    try {
      const cached = readCache(owner).find(c => c.id === p.id);
      const shared = !!owner && !!(p.shared || (p.ownerId && p.ownerId !== owner) || cached?.shared || (cached?.ownerId && cached.ownerId !== owner));
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      // Shared projects are cloud-authoritative. A pending device cache can
      // only be used for offline viewing; it must not win an online open.
      const local = cached && (!owner || (!shared && (cached.pending || offline)) || (shared && offline));
      const snapshot = !local && owner ? await fetchProjectSnapshot(owner, p.id) : undefined;
      const metadata = snapshot ?? cached ?? p;
      const next = local ? cached.board : snapshot?.board ?? cached?.board;
      if (!next) throw new Error("Project unavailable");
      if (!alive.current || ticket !== navigation.current) return;
      current.current = normalizeEditor(next); folderId.current = metadata.folderId; setBoard(current.current); setPast([]); setFuture([]); setVersions([]);
      cacheProject(owner, { ...metadata, board: next, pending: shared ? false : !!cached?.pending, cloudOffline: shared && offline });
      // Publish the access metadata immediately so a newly accepted viewer
      // cannot get one editable render while the background refresh completes.
      upsertSummary({ ...metadata, title: next.title, updatedAt: next.updatedAt, board: next, pending: shared ? false : !!cached?.pending, cloudOffline: shared && offline });
      const history = await fetchProjectVersions(owner, next.id);
      if (alive.current && ticket === navigation.current && current.current?.id === next.id) setVersions(history);
    } catch (err) { report(err); }
  };
  const create = async (title: string, imported?: BoardState, targetFolderId: string | null = null) => {
    ++navigation.current;
    // Creating a new canvas is still a valid local action when a previous
    // cloud save is offline or waiting for conflict resolution. The old
    // project's pending snapshot remains isolated in its own cache entry and
    // can be retried later; it must not block a new canvas.
    const previousProjectId = current.current?.id;
    if (!alive.current) return;
    folderId.current = targetFolderId; setPast([]); setFuture([]); setVersions([]);
    stage(imported ?? blankBoard(title));
    // Save only the project that was open before this action. This keeps a
    // stalled cloud request from blocking the new canvas, while preserving
    // ordering through SaveQueue and leaving the new draft on its normal
    // debounce timer.
    if (previousProjectId) void flush(previousProjectId);
  };
  const home = async () => { const ticket = ++navigation.current; await flush(); if (!alive.current || cacheFailed.current || ticket !== navigation.current) return; current.current = null; setBoard(null); setPast([]); setFuture([]); setVersions([]); await refresh(); };
  const newFolder = async (name: string) => { try { const f = await addFolder(owner, name); if (alive.current) setFolders(fs => [...fs, f]); } catch (err) { report(err); } };
  const renameFolder = async (folder: ProjectFolder, name: string) => { try { await updateFolder(owner, folder, name); if (alive.current) setFolders(fs => fs.map(f => f.id === folder.id ? { ...f, name } : f)); } catch (err) { report(err); throw err; } };
  const removeFolder = async (folder: ProjectFolder) => { try { await deleteFolder(owner, folder); if (alive.current) { setFolders(fs => fs.filter(f => f.id !== folder.id)); setProjects(ps => ps.map(p => p.folderId === folder.id ? { ...p, folderId: null } : p)); } } catch (err) { report(err); throw err; } };
  const move = (id: string | null) => {
    if (!current.current) return;
    const project = readCache(owner).find(item => item.id === current.current?.id);
    if (project?.accessRole === "viewer" || project?.cloudOffline) return;
    folderId.current = id;
    stage({ ...current.current, updatedAt: new Date().toISOString() });
  };
  const navigate = (next: BoardState) => {
    const currentBoard = current.current;
    if (!currentBoard || currentBoard.id !== next.id) return;
    current.current = next;
    setBoard(next);
    // A media-heavy board can contain multi-megabyte data URLs. Persist the
    // viewport only after navigation settles instead of serializing the whole
    // project on every pan/zoom commit.
    clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      const active = current.current;
      if (!active || active.id !== next.id) return;
      const cached = readCache(owner).find(item => item.id === active.id);
      if (cached) cacheProject(owner, { ...cached, board: active });
    }, 500);
  };
  const manageProject = async (project: Project, patch: ProjectPatch) => {
    if ((project.shared && project.accessRole === "viewer") || project.cloudOffline) throw new Error("Bạn chỉ có quyền xem project này.");
    try { if (!await flush()) throw new Error("Please save your pending changes and reconnect first."); await updateProject(owner, project, patch); await refresh(); }
    catch (err) { report(err); throw err; }
  };
  const duplicateProject = async (project: Project, title: string, targetFolderId = project.shared ? null : project.folderId) => {
    try {
      if (!await flush()) throw new Error("Please save your pending changes and reconnect first.");
      const cached = readCache(owner).find(p => p.id === project.id);
      const source = owner ? await fetchBoard(owner, project.id) : cached?.board;
      if (!source) throw new Error("Project unavailable");
      const copy = { ...structuredClone(source), id: crypto.randomUUID(), title, updatedAt: new Date().toISOString() };
      cacheProject(owner, { id: copy.id, title, updatedAt: copy.updatedAt, folderId: targetFolderId, board: copy, pending: !!owner, favorite: false, deletedAt: null, ownerId: owner ?? undefined, accessRole: owner ? "owner" : undefined, shared: false });
      if (!await flush()) throw new Error("Copy is kept locally; retry saving to finish cloud sync.");
      await refresh();
    } catch (err) { report(err); throw err; }
  };
  const resolveConflict = async (resolution: ConflictResolution, copySuffix = "copy") => queue.current.run(async () => {
    const active = conflictRef.current;
    if (!owner || !active) return false;
    setStatus("saving"); setError("");
    try {
      const latestRemote = await fetchProjectSnapshot(owner, active.projectId);
      const latestLocal = readCache(owner).find(item => item.id === active.projectId) ?? active.local;
      let selected: CachedProject;
      if (resolution === "cloud") {
        await createRecoveryCheckpoint(owner, latestLocal.board, "Local conflict backup");
        selected = latestRemote;
        cacheProject(owner, selected);
      } else if (resolution === "overwrite") {
        await createRecoveryCheckpoint(owner, latestRemote.board, "Before conflict overwrite");
        const candidate = { ...latestLocal, revision: latestRemote.revision, pending: true };
        cacheProject(owner, candidate);
        const saved = await persistProject(owner, candidate);
        acknowledge(owner, candidate, saved.revision);
        selected = readCache(owner).find(item => item.id === candidate.id) ?? { ...candidate, revision: saved.revision, pending: false };
      } else {
        const timestamp = new Date().toISOString();
        const copyBoard = { ...structuredClone(latestLocal.board), id: crypto.randomUUID(), title: `${latestLocal.board.title} — ${copySuffix}`, updatedAt: timestamp };
        const candidate: CachedProject = { ...latestLocal, id: copyBoard.id, title: copyBoard.title, updatedAt: timestamp, board: copyBoard, revision: undefined, pending: true,
          ownerId: owner, accessRole: "owner", shared: false, cloudOffline: false, folderId: null };
        cacheProject(owner, candidate);
        const saved = await persistProject(owner, candidate);
        acknowledge(owner, candidate, saved.revision);
        cacheProject(owner, latestRemote);
        selected = readCache(owner).find(item => item.id === candidate.id) ?? { ...candidate, revision: saved.revision, pending: false };
      }
      conflictRef.current = null; setConflict(null); cacheFailed.current = false;
      dirty.current = readCache(owner).some(item => item.pending);
      if (current.current?.id === active.projectId) {
        current.current = normalizeEditor(selected.board); folderId.current = selected.folderId;
        setBoard(current.current); setPast([]); setFuture([]); setVersions([]);
      }
      setProjects(items => resolution === "copy"
        ? [selected, latestRemote, ...items.filter(item => item.id !== selected.id && item.id !== latestRemote.id)]
        : [selected, ...items.filter(item => item.id !== selected.id)]);
      setStatus(dirty.current ? "pending" : "saved");
      return true;
    } catch (err) {
      setStatus(navigator.onLine ? "saveError" : "offline"); report(err); return false;
    }
  });
  return { board, projects, folders, versions, versionLoading, loading, error, setError, status, online, pendingCount: projects.filter(project => project.pending).length, conflict, resolveConflict, change, navigate, undo, redo, canUndo: !!past.length, canRedo: !!future.length, flush, refresh, loadVersions, saveCheckpoint, restoreVersion, open, create, home, newFolder, renameFolder, removeFolder, move, manageProject, duplicateProject };
}
