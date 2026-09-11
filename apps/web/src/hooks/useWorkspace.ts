import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardState } from "@mindcanvas/shared";
import { blankBoard } from "../lib/board";
import { normalizeEditor } from "../lib/editorCommands";
import { updateProject, type ProjectPatch } from "../lib/projectStore";
import { acknowledge, addFolder, cacheProject, createProjectVersion, deleteFolder, fetchBoard, fetchFolders, fetchProjectSnapshot, fetchProjects, fetchProjectVersions, mergeProjects, persistProject, ProjectConflictError, readCache, sameBoardContent, SaveQueue, updateFolder, type CachedProject, type Project, type ProjectFolder, type ProjectVersion } from "../lib/projectStore";

export type SaveStatus = "localSaved" | "saved" | "saving" | "pending" | "offline" | "saveError";
export type WorkspaceConflict = { projectId: string; local: CachedProject; remote: CachedProject };
export type ConflictResolution = "cloud" | "overwrite" | "copy";
// Mount once per account (App keys this component by user.id).
export function useWorkspace(owner: string | null) {
  const [board, setBoard] = useState<BoardState | null>(null);
  const current = useRef<BoardState | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]), [versionLoading, setVersionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<WorkspaceConflict | null>(null);
  const [status, setStatus] = useState<SaveStatus>(owner ? "saved" : "localSaved");
  const [past, setPast] = useState<BoardState[]>([]), [future, setFuture] = useState<BoardState[]>([]);
  const folderId = useRef<string | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true), queue = useRef(new SaveQueue()), dirty = useRef(false), cacheFailed = useRef(false);
  const conflictRef = useRef<WorkspaceConflict | null>(null);
  const navigation = useRef(0);
  const report = useCallback((err: unknown) => { if (alive.current) setError(err instanceof Error ? err.message : String(err)); }, []);
  const refresh = useCallback(async () => {
    try {
      const cache = readCache(owner);
      dirty.current = cache.some(p => p.pending);
      if (alive.current) { setProjects(cache); if (dirty.current) setStatus(navigator.onLine ? "pending" : "offline"); }
      const [remote, fs] = await Promise.all([owner ? fetchProjects(owner) : Promise.resolve([]), fetchFolders(owner)]);
      if (alive.current) { setProjects(mergeProjects(remote, readCache(owner), owner)); setFolders(fs); }
    } catch (err) { report(err); } finally { if (alive.current) setLoading(false); }
  }, [owner, report]);
  const upsertSummary = (p: Project) => { if (alive.current) setProjects(items => [p, ...items.filter(i => i.id !== p.id)]); };

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    return queue.current.run(async () => {
      if (!alive.current) return false;
      if (conflictRef.current) { setStatus("saveError"); return false; }
      try {
        if (cacheFailed.current && current.current) {
          const b = current.current;
          const existing = readCache(owner).find(item => item.id === b.id);
          cacheProject(owner, { id: b.id, title: b.title, updatedAt: b.updatedAt, board: b, folderId: folderId.current, pending: !!owner, revision: existing?.revision });
          cacheFailed.current = false;
        }
        const pending = readCache(owner).filter(p => p.pending);
        if (!owner) { setStatus("localSaved"); return true; }
        if (!navigator.onLine) { setStatus("offline"); return false; }
        if (pending.length) setStatus("saving");
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
        if (alive.current) {
          dirty.current = readCache(owner).some(p => p.pending);
          setStatus(dirty.current ? "pending" : "saved");
        }
        return true;
      } catch (err) { if (alive.current) setStatus(navigator.onLine ? "saveError" : "offline"); report(err); return false; }
    });
  }, [owner, report]);

  useEffect(() => {
    alive.current = true; void refresh();
    const online = () => { void flush(); };
    const offline = () => setStatus(cacheFailed.current ? "saveError" : "offline");
    const beforeUnload = (e: BeforeUnloadEvent) => { if ((owner && dirty.current) || cacheFailed.current) { e.preventDefault(); e.returnValue = ""; } };
    const hidden = () => { if (document.visibilityState === "hidden") void flush(); };
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("visibilitychange", hidden);
    return () => { alive.current = false; clearTimeout(timer.current); window.removeEventListener("online", online); window.removeEventListener("offline", offline); window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("visibilitychange", hidden); };
  }, [refresh, flush, owner]);

  const stage = (next: BoardState, delay = 750) => {
    next = normalizeEditor(next, current.current ?? undefined);
    dirty.current = !!owner;
    current.current = next; setBoard(next);
    try {
      // The cache is authoritative for the latest acknowledged revision. React
      // state can still contain the revision from the previous render.
      const existing = readCache(owner).find(p => p.id === next.id) ?? projects.find(p => p.id === next.id);
      const p: CachedProject = { favorite: existing?.favorite, deletedAt: existing?.deletedAt, revision: existing?.revision, id: next.id, title: next.title, updatedAt: next.updatedAt, board: next, folderId: folderId.current, pending: !!owner };
      cacheProject(owner, p); cacheFailed.current = false; upsertSummary(p); dirty.current = !!owner;
      const activeConflict = conflictRef.current?.projectId === next.id ? { ...conflictRef.current, local: p } : null;
      if (activeConflict) { conflictRef.current = activeConflict; setConflict(activeConflict); }
      setStatus(activeConflict ? "saveError" : !navigator.onLine ? "offline" : owner ? "pending" : "localSaved");
      clearTimeout(timer.current); if (owner && !activeConflict) timer.current = setTimeout(() => void flush(), delay);
    } catch (err) { cacheFailed.current = true; setStatus("saveError"); report(err); }
  };
  const change = (next: BoardState) => {
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
  const undo = () => { const previous = past.at(-1), now = current.current; if (!previous || !now) return; setPast(p => p.slice(0, -1)); setFuture(f => [now, ...f]); stage({ ...previous, viewport: now.viewport, updatedAt: new Date().toISOString() }); };
  const redo = () => { const next = future[0], now = current.current; if (!next || !now) return; setFuture(f => f.slice(1)); setPast(p => [...p, now]); stage({ ...next, viewport: now.viewport, updatedAt: new Date().toISOString() }); };
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
    if (!await flush()) throw new Error("Please save your pending changes and reconnect first.");
    const version = await createProjectVersion(owner, snapshot, label);
    if (alive.current && current.current?.id === snapshot.id) setVersions(items => [version, ...items.filter(item => item.id !== version.id)].sort((a, b) => b.version - a.version).slice(0, 30));
    return version;
  };
  const restoreVersion = async (version: ProjectVersion) => {
    const snapshot = current.current;
    if (!snapshot || snapshot.id !== version.projectId) throw new Error("This version belongs to another project.");
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
      const next = cached && (!owner || cached.pending || !navigator.onLine) ? cached.board : owner ? await fetchBoard(owner, p.id) : cached?.board;
      if (!next) throw new Error("Project unavailable");
      if (!alive.current || ticket !== navigation.current) return;
      current.current = normalizeEditor(next); folderId.current = p.folderId; setBoard(current.current); setPast([]); setFuture([]); setVersions([]);
      if (!cached?.pending) cacheProject(owner, { ...p, board: next, pending: false });
      const history = await fetchProjectVersions(owner, next.id);
      if (alive.current && ticket === navigation.current && current.current?.id === next.id) setVersions(history);
    } catch (err) { report(err); }
  };
  const create = async (title: string, imported?: BoardState, targetFolderId: string | null = null) => {
    const ticket = ++navigation.current;
    await flush(); if (!alive.current || cacheFailed.current || ticket !== navigation.current) return;
    folderId.current = targetFolderId; setPast([]); setFuture([]); setVersions([]);
    stage(imported ?? blankBoard(title));
  };
  const home = async () => { const ticket = ++navigation.current; await flush(); if (!alive.current || cacheFailed.current || ticket !== navigation.current) return; current.current = null; setBoard(null); setPast([]); setFuture([]); setVersions([]); await refresh(); };
  const newFolder = async (name: string) => { try { const f = await addFolder(owner, name); if (alive.current) setFolders(fs => [...fs, f]); } catch (err) { report(err); } };
  const renameFolder = async (folder: ProjectFolder, name: string) => { try { await updateFolder(owner, folder, name); if (alive.current) setFolders(fs => fs.map(f => f.id === folder.id ? { ...f, name } : f)); } catch (err) { report(err); throw err; } };
  const removeFolder = async (folder: ProjectFolder) => { try { await deleteFolder(owner, folder); if (alive.current) { setFolders(fs => fs.filter(f => f.id !== folder.id)); setProjects(ps => ps.map(p => p.folderId === folder.id ? { ...p, folderId: null } : p)); } } catch (err) { report(err); throw err; } };
  const move = (id: string | null) => { if (!current.current) return; folderId.current = id; stage({ ...current.current, updatedAt: new Date().toISOString() }); };
  const manageProject = async (project: Project, patch: ProjectPatch) => {
    try { if (!await flush()) throw new Error("Please save your pending changes and reconnect first."); await updateProject(owner, project, patch); await refresh(); }
    catch (err) { report(err); throw err; }
  };
  const duplicateProject = async (project: Project, title: string, targetFolderId = project.folderId) => {
    try {
      if (!await flush()) throw new Error("Please save your pending changes and reconnect first.");
      const cached = readCache(owner).find(p => p.id === project.id);
      const source = owner ? await fetchBoard(owner, project.id) : cached?.board;
      if (!source) throw new Error("Project unavailable");
      const copy = { ...structuredClone(source), id: crypto.randomUUID(), title, updatedAt: new Date().toISOString() };
      cacheProject(owner, { id: copy.id, title, updatedAt: copy.updatedAt, folderId: targetFolderId, board: copy, pending: !!owner, favorite: false, deletedAt: null });
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
        await createProjectVersion(owner, latestLocal.board, "Local conflict backup");
        selected = latestRemote;
        cacheProject(owner, selected);
      } else if (resolution === "overwrite") {
        await createProjectVersion(owner, latestRemote.board, "Before conflict overwrite");
        const candidate = { ...latestLocal, revision: latestRemote.revision, pending: true };
        cacheProject(owner, candidate);
        const saved = await persistProject(owner, candidate);
        acknowledge(owner, candidate, saved.revision);
        selected = readCache(owner).find(item => item.id === candidate.id) ?? { ...candidate, revision: saved.revision, pending: false };
      } else {
        const timestamp = new Date().toISOString();
        const copyBoard = { ...structuredClone(latestLocal.board), id: crypto.randomUUID(), title: `${latestLocal.board.title} — ${copySuffix}`, updatedAt: timestamp };
        const candidate: CachedProject = { ...latestLocal, id: copyBoard.id, title: copyBoard.title, updatedAt: timestamp, board: copyBoard, revision: undefined, pending: true };
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
  return { board, projects, folders, versions, versionLoading, loading, error, setError, status, conflict, resolveConflict, change, undo, redo, canUndo: !!past.length, canRedo: !!future.length, flush, refresh, loadVersions, saveCheckpoint, restoreVersion, open, create, home, newFolder, renameFolder, removeFolder, move, manageProject, duplicateProject };
}
