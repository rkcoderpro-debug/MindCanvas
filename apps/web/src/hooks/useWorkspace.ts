import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardState } from "@mindcanvas/shared";
import { blankBoard } from "../lib/board";
import { normalizeEditor } from "../lib/editorCommands";
import { errorMessage } from "../lib/errors";
import { updateProject, type ProjectPatch } from "../lib/projectStore";
import { subscribeToProject } from "../lib/collaboration";
import { acknowledge, addFolder, cacheProject, createProjectVersion, deleteFolder, fetchBoard, fetchFolders, fetchProjectSnapshot, fetchProjects, fetchProjectVersions, hydrateProjectCache, mergeProjects, persistProject, ProjectConflictError, readCache, sameBoardContent, SaveQueue, updateFolder, updateProjectThumbnail, waitForProjectCache, type CachedProject, type Project, type ProjectFolder, type ProjectVersion } from "../lib/projectStore";
import { createCanvasThumbnail } from "../lib/canvasThumbnail";

export type SaveStatus = "localSaved" | "saved" | "saving" | "pending" | "offline" | "saveError";
export type WorkspaceConflict = { projectId: string; local: CachedProject; remote: CachedProject };
export type ConflictResolution = "cloud" | "overwrite" | "copy";
const CONFLICT_CHECKPOINT_WAIT_MS = 4000;
const LOCAL_SAVE_MATCH_WINDOW_MS = 120_000;
type LocalSaveMarker = { projectId: string; snapshot: CachedProject; expectedRevision?: number; createdAt: number };
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
  // Keep the history stack in refs as well as state. Applying a layout can
  // update the board and request Undo in the same React batch; refs make the
  // transaction boundary synchronous instead of waiting for a re-render.
  const pastRef = useRef<BoardState[]>([]), futureRef = useRef<BoardState[]>([]);
  const folderId = useRef<string | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true), queue = useRef(new SaveQueue()), dirty = useRef(false), cacheFailed = useRef(false);
  const conflictRef = useRef<WorkspaceConflict | null>(null);
  const navigation = useRef(0), thumbnailRequests = useRef(new Set<string>());
  // Realtime UPDATE events do not carry the originating browser/session. Keep
  // the short-lived save snapshots so the echo of this device's own save is
  // not mistaken for a collaborator edit that should reset Undo/Redo.
  const localSaveMarkers = useRef<LocalSaveMarker[]>([]);
  // A realtime event can arrive after the save queue has already consumed its
  // marker. Keep acknowledged snapshots separately so a server-normalized
  // echo (same revision, slightly different payload) still cannot clear the
  // local transaction history.
  const acknowledgedSaveMarkers = useRef<LocalSaveMarker[]>([]);
  const rememberAcknowledged = (marker: LocalSaveMarker) => {
    const cutoff = Date.now() - LOCAL_SAVE_MATCH_WINDOW_MS;
    acknowledgedSaveMarkers.current = [
      ...acknowledgedSaveMarkers.current.filter(item => item.createdAt >= cutoff && item !== marker),
      marker,
    ].slice(-64);
  };
  const clearHistory = () => {
    pastRef.current = [];
    futureRef.current = [];
    setPast([]);
    setFuture([]);
  };
  const recordHistory = (snapshot: BoardState) => {
    const nextPast = [...pastRef.current, snapshot].slice(-50);
    pastRef.current = nextPast;
    futureRef.current = [];
    setPast(nextPast);
    setFuture([]);
  };
  const report = useCallback((err: unknown) => { if (alive.current) setError(errorMessage(err, "Could not save this project.")); }, []);
  const refresh = useCallback(async () => {
    try {
      // Show an already available device draft immediately; an IndexedDB
      // transaction can finish after React's first paint.
      const immediate = readCache(owner);
      if (alive.current) {
        setProjects(immediate);
        if (immediate.length) setLoading(false);
      }
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
  const checkpointCurrent = useCallback(() => {
    const active = current.current;
    if (!active) return;
    try {
      const existing = readCache(owner).find(project => project.id === active.id);
      // CanvasBoard can checkpoint an in-progress pen/eraser gesture directly
      // into the durable cache. Never replace that newer draft with the last
      // React-committed board while leaving the canvas or hiding the page.
      if (existing?.pending && existing.board.updatedAt >= active.updatedAt && JSON.stringify(existing.board) !== JSON.stringify(active)) {
        dirty.current = dirty.current || !!existing.pending;
        return;
      }
      const accessRole = existing?.accessRole ?? (owner ? "owner" : undefined);
      const shared = existing?.shared ?? (!!existing?.ownerId && existing.ownerId !== owner);
      const changed = !existing?.board || JSON.stringify(existing.board) !== JSON.stringify(active);
      const pending = !!owner && accessRole !== "viewer" && !existing?.cloudOffline && (existing?.pending === true || changed);
      const snapshot: CachedProject = {
        ...existing,
        id: active.id,
        title: active.title,
        updatedAt: active.updatedAt,
        board: active,
        thumbnail: changed ? createCanvasThumbnail(active) : existing?.thumbnail ?? createCanvasThumbnail(active),
        folderId: folderId.current,
        pending,
        revision: existing?.revision,
        ownerId: existing?.ownerId ?? owner ?? undefined,
        accessRole,
        shared,
        cloudOffline: existing?.cloudOffline,
      };
      cacheProject(owner, snapshot);
      cacheFailed.current = false;
      dirty.current = readCache(owner).some(project => project.pending);
    } catch (err) {
      cacheFailed.current = true;
      report(err);
    }
  }, [owner, report]);

  const checkpointDraft = useCallback((next: BoardState) => {
    const active = current.current;
    if (!active || active.id !== next.id) return;
    try {
      const normalized = normalizeEditor(next, active);
      const existing = readCache(owner).find(project => project.id === next.id);
      if (existing?.accessRole === "viewer" || existing?.cloudOffline) return;
      const timestamp = new Date().toISOString();
      const draft = { ...normalized, updatedAt: timestamp };
      const ownerId = existing?.ownerId ?? owner ?? undefined;
      const shared = existing?.shared ?? (!!ownerId && ownerId !== owner);
      const accessRole = existing?.accessRole ?? (shared ? "viewer" : owner ? "owner" : undefined);
      const snapshot: CachedProject = {
        ...existing,
        id: draft.id,
        title: draft.title,
        updatedAt: draft.updatedAt,
        board: draft,
        thumbnail: createCanvasThumbnail(draft),
        folderId: folderId.current,
        pending: !!owner && accessRole !== "viewer",
        revision: existing?.revision,
        ownerId,
        accessRole,
        shared,
        cloudOffline: existing?.cloudOffline,
      };
      cacheProject(owner, snapshot);
      cacheFailed.current = false;
      void waitForProjectCache(owner).catch(err => { cacheFailed.current = true; if (alive.current) setStatus("saveError"); report(err); });
      dirty.current = !!owner || dirty.current;
      if (alive.current) {
        upsertSummary(snapshot);
        setStatus(!owner ? "localSaved" : navigator.onLine ? "pending" : "offline");
      }
    } catch (err) {
      cacheFailed.current = true;
      if (alive.current) setStatus("saveError");
      report(err);
    }
  }, [owner, report]);

  const loadThumbnail = useCallback(async (projectId: string) => {
    if (thumbnailRequests.current.has(projectId)) return;
    const cached = readCache(owner).find(project => project.id === projectId);
    if (cached?.thumbnail) return;
    if (cached?.board) {
      const thumbnail = createCanvasThumbnail(cached.board);
      cacheProject(owner, { ...cached, thumbnail });
      if (alive.current) setProjects(items => items.map(item => item.id === projectId ? { ...item, thumbnail } : item));
      if (owner) await updateProjectThumbnail(owner, projectId, thumbnail).catch(() => undefined);
      return;
    }
    if (!owner) {
      return;
    }
    thumbnailRequests.current.add(projectId);
    try {
      const snapshot = await fetchProjectSnapshot(owner, projectId);
      const thumbnail = snapshot.thumbnail ?? createCanvasThumbnail(snapshot.board);
      const current = readCache(owner).find(project => project.id === projectId);
      if (current) cacheProject(owner, { ...current, thumbnail, board: current.board ?? snapshot.board });
      if (alive.current) setProjects(items => items.map(item => item.id === projectId ? { ...item, thumbnail } : item));
      if (!snapshot.thumbnail) await updateProjectThumbnail(owner, projectId, thumbnail).catch(() => undefined);
    } catch {
      // A missing V4.6 migration or an offline card keeps its skeleton/fallback;
      // opening the project still uses the existing snapshot path.
    } finally { thumbnailRequests.current.delete(projectId); }
  }, [owner]);

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
      if (!owner) {
        void waitForProjectCache(owner).catch(err => { cacheFailed.current = true; if (alive.current) setStatus("saveError"); report(err); });
        if (alive.current) setStatus("localSaved");
        return true;
      }
      try { await waitForProjectCache(owner); }
      catch (err) { cacheFailed.current = true; if (alive.current) setStatus("saveError"); report(err); return false; }
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
      cacheProject(owner, { ...existing, id: b.id, title: b.title, updatedAt: b.updatedAt, board: b, thumbnail: createCanvasThumbnail(b), folderId: folderId.current, pending: !!owner, revision: existing?.revision, ownerId: existing?.ownerId ?? owner ?? undefined, accessRole: existing?.accessRole ?? (owner ? "owner" : undefined), shared: existing?.shared ?? false });
          cacheFailed.current = false;
        }
        await waitForProjectCache(owner);
        let heldSharedDraft = false;
        const pending = readCache(owner).filter(p => {
          if (p.id !== targetId) return false;
          if (!p.pending) return false;
          const shared = p.shared || (!!p.ownerId && p.ownerId !== owner);
          // A shared cache entry from an earlier session is never allowed to
          // upload itself before this session has fetched its cloud revision.
          // The active project may still flush a legitimate editor change.
          if (shared && p.id !== current.current?.id) {
            heldSharedDraft = true;
            return false;
          }
          return true;
        });
        if (heldSharedDraft) {
          setError("Có bản nháp project chia sẻ chưa đối chiếu với cloud. Hãy mở project để xem và chọn cách khôi phục.");
          return false;
        }
        if (!owner) { if (current.current?.id === targetId) setStatus("localSaved"); return true; }
        if (!navigator.onLine) { if (current.current?.id === targetId) setStatus("offline"); return false; }
        if (pending.length && current.current?.id === targetId) setStatus("saving");
        for (const snapshot of pending) {
          if (!alive.current) return false;
          const save = async (candidate: CachedProject) => {
            const now = Date.now();
            localSaveMarkers.current = localSaveMarkers.current.filter(marker => now - marker.createdAt < LOCAL_SAVE_MATCH_WINDOW_MS);
            const marker: LocalSaveMarker = { projectId: candidate.id, snapshot: candidate, createdAt: now };
            localSaveMarkers.current.push(marker);
            try {
              const saved = await persistProject(owner, candidate);
              marker.expectedRevision = saved?.revision;
              acknowledge(owner, candidate, saved?.revision);
              await waitForProjectCache(owner);
              rememberAcknowledged(marker);
              const cached = readCache(owner).find(item => item.id === candidate.id);
              if (alive.current && cached) setProjects(items => [cached, ...items.filter(item => item.id !== cached.id)]);
            } catch (err) {
              localSaveMarkers.current = localSaveMarkers.current.filter(item => item !== marker);
              throw err;
            }
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
              // The previous write may have succeeded but its response or
              // readback timed out. Confirm its content instead of resending.
              acknowledge(owner, local, remote.revision);
              await waitForProjectCache(owner);
              const confirmed = readCache(owner).find(item => item.id === local.id);
              if (confirmed && alive.current) setProjects(items => [confirmed, ...items.filter(item => item.id !== confirmed.id)]);
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
    const allSaved = outcomes.every(([, saved]) => saved) && !readCache(owner).some(p => p.pending);
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
    const beforeUnload = (e: BeforeUnloadEvent) => { checkpointCurrent(); if ((owner && dirty.current) || cacheFailed.current) { e.preventDefault(); e.returnValue = ""; } };
    const hidden = () => { if (document.visibilityState === "hidden") { checkpointCurrent(); void flush(); } };
    const pageHide = () => { checkpointCurrent(); void flush(); };
    window.addEventListener("online", cameOnline); window.addEventListener("offline", wentOffline);
    window.addEventListener("beforeunload", beforeUnload); window.addEventListener("pagehide", pageHide); document.addEventListener("visibilitychange", hidden);
    return () => { checkpointCurrent(); alive.current = false; clearTimeout(timer.current); clearTimeout(viewportTimer.current); window.removeEventListener("online", cameOnline); window.removeEventListener("offline", wentOffline); window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("pagehide", pageHide); document.removeEventListener("visibilitychange", hidden); };
  }, [refresh, flush, owner, checkpointCurrent]);

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
      const now = Date.now();
      localSaveMarkers.current = localSaveMarkers.current.filter(marker => now - marker.createdAt < LOCAL_SAVE_MATCH_WINDOW_MS);
      acknowledgedSaveMarkers.current = acknowledgedSaveMarkers.current.filter(marker => now - marker.createdAt < LOCAL_SAVE_MATCH_WINDOW_MS);
      const markerIndex = localSaveMarkers.current.findIndex(marker => {
        if (marker.projectId !== projectId || !sameBoardContent(marker.snapshot.board, update.board)) return false;
        if (marker.expectedRevision !== undefined) return update.revision === undefined || update.revision === marker.expectedRevision;
        if (marker.snapshot.revision === undefined) return true;
        return update.revision === undefined || update.revision === marker.snapshot.revision + 1;
      });
      if (markerIndex >= 0) {
        // A realtime echo alone is not a verified cloud readback. The save
        // request is still responsible for clearing pending after verification.
        return;
      }
      // The save response may have already removed the in-flight marker before
      // Postgres Changes delivers the echo. Revision is the server's durable
      // identity for that write, so it is safe to acknowledge the event even
      // when the server canonicalized timestamps or other metadata. Preserve
      // the current board and both history stacks in this branch.
      const acknowledged = acknowledgedSaveMarkers.current.find(marker => {
        if (marker.projectId !== projectId) return false;
        if (marker.expectedRevision !== undefined && update.revision !== undefined) return update.revision === marker.expectedRevision;
        return marker.expectedRevision === undefined && sameBoardContent(marker.snapshot.board, update.board);
      });
      if (acknowledged) {
        acknowledge(owner, acknowledged.snapshot, update.revision ?? acknowledged.expectedRevision);
        const cached = readCache(owner).find(item => item.id === projectId);
        if (cached && update.revision !== undefined) cacheProject(owner, { ...cached, revision: update.revision, pending: cached.pending });
        const latest = readCache(owner).find(item => item.id === projectId);
        if (alive.current && latest) {
          setProjects(items => [latest, ...items.filter(item => item.id !== latest.id)]);
          if (!latest.pending) setStatus("saved");
        }
        return;
      }
      // A cloud echo can differ in viewport or timestamps even when it is
      // the same document. Those fields must never erase local history.
      if (sameBoardContent(local, update.board)) {
        const cached = readCache(owner).find(item => item.id === projectId);
        if (cached && !cached.pending && update.revision !== undefined) cacheProject(owner, { ...cached, revision: update.revision });
        return;
      }
      // A pending edit in a different project should not pause this project's
      // collaboration stream. The cache entry is the per-project dirty flag.
      if (cacheFailed.current || readCache(owner).some(item => item.id === projectId && item.pending)) return;
      const next = normalizeEditor({ ...update.board, viewport: local.viewport });
      current.current = next;
      setBoard(next);
      clearHistory();
      const cached = readCache(owner).find(item => item.id === projectId);
      const thumbnail = createCanvasThumbnail(next);
      if (cached) cacheProject(owner, { ...cached, title: next.title, updatedAt: next.updatedAt, board: next, thumbnail, revision: update.revision ?? cached.revision, pending: false });
      setProjects(items => items.map(item => item.id === projectId ? { ...item, title: next.title, updatedAt: update.updatedAt ?? next.updatedAt, revision: update.revision ?? item.revision, board: next, thumbnail, pending: false } : item));
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
      const p: CachedProject = { favorite: existing?.favorite, deletedAt: existing?.deletedAt, revision: existing?.revision, ownerId, accessRole, shared, cloudOffline: existing?.cloudOffline, id: next.id, title: next.title, updatedAt: next.updatedAt, board: next, thumbnail: createCanvasThumbnail(next), folderId: folderId.current, pending: !!owner };
      cacheProject(owner, p); cacheFailed.current = false; upsertSummary(p); dirty.current = !!owner;
      void waitForProjectCache(owner).catch(err => { cacheFailed.current = true; if (alive.current) setStatus("saveError"); report(err); });
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
    if (previous) recordHistory(previous);
    stage({ ...next, updatedAt: new Date().toISOString() });
  };
  const undo = () => {
    const previous = pastRef.current.at(-1), now = current.current, active = now && readCache(owner).find(item => item.id === now.id);
    if (!previous || !now || active?.accessRole === "viewer" || active?.cloudOffline) return;
    const nextPast = pastRef.current.slice(0, -1), nextFuture = [now, ...futureRef.current].slice(0, 50);
    pastRef.current = nextPast;
    futureRef.current = nextFuture;
    setPast(nextPast);
    setFuture(nextFuture);
    stage({ ...previous, viewport: now.viewport, updatedAt: new Date().toISOString() });
  };
  const redo = () => {
    const next = futureRef.current[0], now = current.current, active = now && readCache(owner).find(item => item.id === now.id);
    if (!next || !now || active?.accessRole === "viewer" || active?.cloudOffline) return;
    const nextPast = [...pastRef.current, now].slice(-50), nextFuture = futureRef.current.slice(1);
    pastRef.current = nextPast;
    futureRef.current = nextFuture;
    setPast(nextPast);
    setFuture(nextFuture);
    stage({ ...next, viewport: now.viewport, updatedAt: new Date().toISOString() });
  };
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
    if (owner) await flush();
    else void flush();
    if ((owner && cacheFailed.current) || ticket !== navigation.current) return;
    try {
      let cached = readCache(owner).find(c => c.id === p.id);
      const shared = !!owner && !!(p.shared || (p.ownerId && p.ownerId !== owner) || cached?.shared || (cached?.ownerId && cached.ownerId !== owner));
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      // Shared projects are cloud-authoritative. A pending device cache can
      // only be used for offline viewing; it must not win an online open.
      let local = !!cached && (!owner || (!shared && (cached.pending || offline)) || (shared && offline));
      const snapshot = !local && owner ? await fetchProjectSnapshot(owner, p.id) : undefined;
      if (shared && cached?.pending && snapshot && cached.folderId === snapshot.folderId && sameBoardContent(cached.board, snapshot.board)) {
        acknowledge(owner, cached, snapshot.revision);
        await waitForProjectCache(owner);
        cached = readCache(owner).find(c => c.id === p.id);
      }
      if (cached && snapshot && (
        (cached.pending && !sameBoardContent(cached.board, snapshot.board)) ||
        (cached.revision !== undefined && snapshot.revision !== undefined && snapshot.revision <= cached.revision && !sameBoardContent(cached.board, snapshot.board)) ||
        (cached.revision !== undefined && snapshot.revision !== undefined && snapshot.revision < cached.revision)
      )) {
        // Do not silently replace a device draft or a confirmed newer cache
        // with an older/inconsistent cloud read. Require a recovery choice.
        const nextConflict = { projectId: p.id, local: cached, remote: snapshot };
        conflictRef.current = nextConflict; setConflict(nextConflict); setStatus("saveError");
        local = true;
      }
      const metadata = local && cached ? cached : snapshot ?? cached ?? p;
      const next = local && cached ? cached.board : snapshot?.board ?? cached?.board;
      if (!next) throw new Error("Project unavailable");
      if (!alive.current || ticket !== navigation.current) return;
      current.current = normalizeEditor(next); folderId.current = metadata.folderId; setBoard(current.current); clearHistory(); setVersions([]);
      cacheProject(owner, { ...metadata, board: next, thumbnail: metadata.thumbnail ?? createCanvasThumbnail(next), pending: !!cached?.pending || !!(local && snapshot), cloudOffline: shared && offline });
      // Publish the access metadata immediately so a newly accepted viewer
      // cannot get one editable render while the background refresh completes.
      upsertSummary({ ...metadata, title: next.title, updatedAt: next.updatedAt, board: next, thumbnail: metadata.thumbnail ?? createCanvasThumbnail(next), pending: !!cached?.pending || !!(local && snapshot), cloudOffline: shared && offline });
      const history = await fetchProjectVersions(owner, next.id);
      if (alive.current && ticket === navigation.current && current.current?.id === next.id) setVersions(history);
    } catch (err) { report(err); }
  };
  const create = async (title: string, imported?: BoardState, targetFolderId: string | null = null): Promise<BoardState> => {
    ++navigation.current;
    // Creating a new canvas is still a valid local action when a previous
    // cloud save is offline or waiting for conflict resolution. The old
    // project's pending snapshot remains isolated in its own cache entry and
    // can be retried later; it must not block a new canvas.
    const next = imported ?? blankBoard(title);
    const previousProjectId = current.current?.id;
    if (!alive.current) return next;
    folderId.current = targetFolderId; clearHistory(); setVersions([]);
    stage(next);
    // Save only the project that was open before this action. This keeps a
    // stalled cloud request from blocking the new canvas, while preserving
    // ordering through SaveQueue and leaving the new draft on its normal
    // debounce timer.
    if (previousProjectId) void flush(previousProjectId);
    return next;
  };
  const home = async () => {
    const ticket = ++navigation.current;
    checkpointCurrent();
    // A failed cloud flush is kept as a pending local snapshot and reported
    // to the user, but it must not trap navigation in the current canvas. The
    // guide (and the Workspace button) must still be able to advance while a
    // retry remains available.
    if (owner) await flush();
    else void flush();
    if (!alive.current || ticket !== navigation.current) return;
    current.current = null;
    setBoard(null);
    clearHistory();
    setVersions([]);
    await refresh();
  };
  const newFolder = async (name: string): Promise<ProjectFolder> => {
    try {
      const f = await addFolder(owner, name);
      if (alive.current) setFolders(fs => [...fs, f]);
      return f;
    } catch (err) {
      report(err);
      throw err;
    }
  };
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
      if (cached) cacheProject(owner, { ...cached, board: sameBoardContent(cached.board, active) ? active : { ...cached.board, viewport: active.viewport } });
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
      const duplicate: CachedProject = { id: copy.id, title, updatedAt: copy.updatedAt, folderId: targetFolderId, board: copy, thumbnail: createCanvasThumbnail(copy), pending: !!owner, favorite: false, deletedAt: null, ownerId: owner ?? undefined, accessRole: owner ? "owner" : undefined, shared: false };
      cacheProject(owner, duplicate);
      upsertSummary(duplicate);
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
        setBoard(current.current); clearHistory(); setVersions([]);
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
  // The refs are updated before the React render that follows a canvas commit.
  // Reading them here keeps the toolbar state aligned with the transaction
  // that was just created, including a create-text/shape commit followed
  // immediately by Undo while a cloud save is still settling.
  return { board, projects, folders, versions, versionLoading, loading, error, setError, status, online, pendingCount: projects.filter(project => project.pending).length, conflict, resolveConflict, change, checkpointDraft, navigate, undo, redo, canUndo: !!pastRef.current.length, canRedo: !!futureRef.current.length, flush, refresh, loadVersions, saveCheckpoint, restoreVersion, open, create, home, newFolder, renameFolder, removeFolder, move, manageProject, duplicateProject, loadThumbnail };
}
