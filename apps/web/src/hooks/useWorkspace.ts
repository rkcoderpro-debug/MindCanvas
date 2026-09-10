import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardState } from "@mindcanvas/shared";
import { blankBoard } from "../lib/board";
import { acknowledge, addFolder, cacheProject, fetchBoard, fetchFolders, fetchProjects, mergeProjects, persistProject, readCache, SaveQueue, type CachedProject, type Project, type ProjectFolder } from "../lib/projectStore";

export type SaveStatus = "localSaved" | "saved" | "saving" | "pending" | "offline" | "saveError";
// Mount once per account (App keys this component by user.id).
export function useWorkspace(owner: string | null) {
  const [board, setBoard] = useState<BoardState | null>(null);
  const current = useRef<BoardState | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<SaveStatus>(owner ? "saved" : "localSaved");
  const [past, setPast] = useState<BoardState[]>([]), [future, setFuture] = useState<BoardState[]>([]);
  const folderId = useRef<string | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true), queue = useRef(new SaveQueue()), dirty = useRef(false), cacheFailed = useRef(false);
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
      try {
        if (cacheFailed.current && current.current) {
          const b = current.current;
          cacheProject(owner, { id: b.id, title: b.title, updatedAt: b.updatedAt, board: b, folderId: folderId.current, pending: !!owner });
          cacheFailed.current = false;
        }
        const pending = readCache(owner).filter(p => p.pending);
        if (!owner) { setStatus("localSaved"); return true; }
        if (!navigator.onLine) { setStatus("offline"); return false; }
        if (pending.length) setStatus("saving");
        for (const snapshot of pending) {
          if (!alive.current) return false;
          await persistProject(owner, snapshot);
          acknowledge(owner, snapshot);
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
    dirty.current = !!owner;
    current.current = next; setBoard(next);
    const p: CachedProject = { id: next.id, title: next.title, updatedAt: next.updatedAt, board: next, folderId: folderId.current, pending: !!owner };
    try {
      cacheProject(owner, p); cacheFailed.current = false; upsertSummary(p); dirty.current = !!owner;
      setStatus(!navigator.onLine ? "offline" : owner ? "pending" : "localSaved");
      clearTimeout(timer.current); if (owner) timer.current = setTimeout(() => void flush(), delay);
    } catch (err) { cacheFailed.current = true; setStatus("saveError"); report(err); }
  };
  const change = (next: BoardState) => {
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
  const open = async (p: Project) => {
    const ticket = ++navigation.current;
    await flush();
    if (cacheFailed.current || ticket !== navigation.current) return;
    try {
      const cached = readCache(owner).find(c => c.id === p.id);
      const next = cached && (!owner || cached.pending || !navigator.onLine) ? cached.board : owner ? await fetchBoard(owner, p.id) : cached?.board;
      if (!next) throw new Error("Project unavailable");
      if (!alive.current || ticket !== navigation.current) return;
      current.current = next; folderId.current = p.folderId; setBoard(next); setPast([]); setFuture([]);
      if (!cached?.pending) cacheProject(owner, { ...p, board: next, pending: false });
    } catch (err) { report(err); }
  };
  const create = async (title: string, imported?: BoardState) => {
    const ticket = ++navigation.current;
    await flush(); if (!alive.current || cacheFailed.current || ticket !== navigation.current) return;
    folderId.current = null; setPast([]); setFuture([]);
    stage(imported ?? blankBoard(title));
  };
  const home = async () => { const ticket = ++navigation.current; await flush(); if (!alive.current || cacheFailed.current || ticket !== navigation.current) return; current.current = null; setBoard(null); setPast([]); setFuture([]); await refresh(); };
  const newFolder = async (name: string) => { try { const f = await addFolder(owner, name); if (alive.current) setFolders(fs => [...fs, f]); } catch (err) { report(err); } };
  const move = (id: string | null) => { if (!current.current) return; folderId.current = id; stage({ ...current.current, updatedAt: new Date().toISOString() }); };
  return { board, projects, folders, loading, error, setError, status, change, undo, redo, canUndo: !!past.length, canRedo: !!future.length, flush, refresh, open, create, home, newFolder, move };
}
