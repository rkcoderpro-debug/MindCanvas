import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardState, CanvasThumbnail } from "@mindcanvas/shared";
import { blankBoard } from "../lib/board";
import { normalizeEditor } from "../lib/editorCommands";
import { errorMessage } from "../lib/errors";
import { updateProject, type ProjectPatch } from "../lib/projectStore";
import { subscribeToProject } from "../lib/collaboration";
import { acknowledge, addFolder, cacheProject, CloudVerificationPendingError, createProjectVersion, deleteFolder, fetchBoard, fetchFolders, fetchProjectSnapshot, fetchProjects, fetchProjectThumbnails, fetchProjectVersions, hydrateProjectCache, mergeProjects, mergeProjectVersions, OwnedProjectUnavailableError, persistProject, ProjectConflictError, PROJECT_THUMBNAIL_BATCH_SIZE, readCache, readProjectVersions, revalidateOwnedProject, sameBoardContent, SaveQueue, updateFolder, waitForProjectCache, type CachedProject, type Project, type ProjectFolder, type ProjectVersion } from "../lib/projectStore";
import { createCanvasThumbnail } from "../lib/canvasThumbnail";

export type SaveStatus = "localSaved" | "saved" | "saving" | "pending" | "offline" | "saveError";
export type WorkspaceConflict = { projectId: string; local: CachedProject; remote: CachedProject; error?: string };
export type ConflictResolution = "cloud" | "overwrite" | "copy";
const LOCAL_SAVE_MATCH_WINDOW_MS = 120_000;
type LocalSaveMarker = { projectId: string; snapshot: CachedProject; expectedRevision?: number; createdAt: number };
function isTemporaryCanvasReadFailure(error: unknown) {
  const value = error as { code?: string; name?: string; message?: string; status?: number } | null;
  if (value?.code === "57014" || value?.name === "TimeoutError" || [408, 500, 502, 503, 504, 520, 522, 524].includes(value?.status ?? 0)) return true;
  // PostgREST can return transport failures as an object with an empty code.
  return !value?.code && /timeout|timed out|failed to fetch|networkerror|network request failed/i.test(value?.message ?? "");
}
const thumbnailVersion = (project: Project) => `${project.revision ?? ""}:${project.updatedAt}`;
async function createRecoveryCheckpoint(owner: string | null, board: BoardState, label: string) {
  const version = await createProjectVersion(owner, board, label, "local");
  // Re-read the durable copy before replacing an editable canvas.
  if (version.source === "cloud") return version;
  const stored = (await readProjectVersions(owner, board.id)).find(item => item.id === version.id);
  if (!stored || stored.board.id !== board.id || !sameBoardContent(stored.board, board)) {
    throw new Error("Không thể lưu bản khôi phục trên thiết bị. Bản nháp vẫn được giữ nguyên; hãy giải phóng dung lượng rồi thử lại.");
  }
  return stored;
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
  const verificationRetries = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveNotices = useRef(new Map<string, string>());
  const alive = useRef(true), queue = useRef(new SaveQueue()), dirty = useRef(false), cacheFailed = useRef(false);
  const conflictRef = useRef<WorkspaceConflict | null>(null);
  const navigation = useRef(0);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const hasLoadedList = useRef(false);
  const previewQueue = useRef(new SaveQueue());
  const previews = useRef(new Map<string, { version: string; thumbnail?: CanvasThumbnail }>());
  const navigationSyncs = useRef(new Set<string>());
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
  const refresh = useCallback(function refresh(afterCurrent = false): Promise<void> {
    if (refreshInFlight.current) {
      return afterCurrent ? refreshInFlight.current.then(() => refresh()) : refreshInFlight.current;
    }
    const request = (async () => {
      try {
        // Use the device list on first paint. A later refresh keeps an already
        // fetched list visible while the cloud metadata is in flight.
        const immediate = readCache(owner);
        if (alive.current && !hasLoadedList.current && immediate.length) {
          setProjects(immediate);
          setLoading(false);
        }
        await hydrateProjectCache(owner);
        const cache = readCache(owner);
        dirty.current = cache.some(p => p.pending);
        if (alive.current && !hasLoadedList.current && cache.length) {
          setProjects(cache);
          setLoading(false);
          if (!current.current && dirty.current) setStatus(navigator.onLine ? "pending" : "offline");
        }
        const folderRequest = fetchFolders(owner).then(fs => {
          if (alive.current) setFolders(fs);
        }).catch(err => { if (navigator.onLine) report(err); });
        try {
          const remote = owner ? await fetchProjects(owner) : [];
          if (alive.current) {
            const merged = mergeProjects(remote, readCache(owner), owner).map(project => {
              const preview = previews.current.get(project.id);
              return !project.thumbnail && preview?.version === thumbnailVersion(project) ? { ...project, thumbnail: preview.thumbnail } : project;
            });
            dirty.current = merged.some(p => p.pending);
            hasLoadedList.current = true;
            setProjects(merged);
            if (!current.current && !dirty.current) setStatus(owner ? "saved" : "localSaved");
          }
        } finally {
          if (alive.current) setLoading(false);
          await folderRequest;
        }
      } catch (err) {
        if (alive.current && !navigator.onLine) setStatus("offline");
        else report(err);
      } finally { if (alive.current) setLoading(false); }
    })();
    refreshInFlight.current = request;
    void request.finally(() => { if (refreshInFlight.current === request) refreshInFlight.current = null; });
    return request;
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
      // Persist the viewport and normalized legacy fields locally without
      // turning a read/pan into a full content PATCH.
      const contentChanged = !existing || !sameBoardContent(normalizeEditor(existing.board), active) || existing.folderId !== folderId.current;
      const pending = existing?.pending === true || (!!owner && accessRole !== "viewer" && !existing?.cloudOffline && contentChanged);
      const snapshot: CachedProject = {
        ...existing,
        id: active.id,
        title: active.title,
        updatedAt: contentChanged ? active.updatedAt : existing.updatedAt,
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

  const loadThumbnails = useCallback(async (cards: Project[]) => {
    const requested = new Map<string, { version: string; thumbnail?: CanvasThumbnail }>();
    for (const card of cards) {
      const version = thumbnailVersion(card);
      if (card.thumbnail || previews.current.get(card.id)?.version === version) continue;
      const preview = { version, thumbnail: card.board ? createCanvasThumbnail(card.board) : undefined };
      previews.current.set(card.id, preview);
      requested.set(card.id, preview);
    }
    const apply = () => {
      if (alive.current) setProjects(items => items.map(item => {
        const preview = requested.get(item.id);
        return !item.thumbnail && preview?.thumbnail && preview.version === thumbnailVersion(item)
          ? { ...item, thumbnail: preview.thumbnail } : item;
      }));
    };
    if (!requested.size) return;
    if ([...requested.values()].some(item => item.thumbnail)) apply();
    if (!owner || !navigator.onLine) {
      // Unfetched previews can be requested after the device comes back online.
      for (const [id, preview] of requested) if (!preview.thumbnail) previews.current.delete(id);
      return;
    }
    const remoteIds = [...requested].filter(([, item]) => !item.thumbnail).map(([id]) => id);
    for (let index = 0; index < remoteIds.length; index += PROJECT_THUMBNAIL_BATCH_SIZE) {
      const ids = remoteIds.slice(index, index + PROJECT_THUMBNAIL_BATCH_SIZE);
      await previewQueue.current.run(async () => {
        if (!alive.current) return;
        try {
          const thumbnails = await fetchProjectThumbnails(owner, ids);
          for (const [id, thumbnail] of thumbnails) {
            const preview = requested.get(id);
            if (preview && previews.current.get(id) === preview) preview.thumbnail = thumbnail;
          }
          if (thumbnails.size) apply();
        } catch {
          for (const id of ids) if (previews.current.get(id) === requested.get(id)) previews.current.delete(id);
        }
      });
    }
  }, [owner]);

  const flush = useCallback(async (projectId?: string): Promise<boolean> => {
    const originId = current.current?.id;
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

    const verificationPendingIds = new Set<string>();
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
          cacheProject(owner, { ...existing, id: b.id, title: b.title, updatedAt: b.updatedAt, board: b, thumbnail: createCanvasThumbnail(b), folderId: folderId.current, pending: !!owner, revision: existing?.revision, baseUpdatedAt: existing?.baseUpdatedAt, ownerId: existing?.ownerId ?? owner ?? undefined, accessRole: existing?.accessRole ?? (owner ? "owner" : undefined), shared: existing?.shared ?? false });
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
          // A verified editor may finish a save that began before navigation.
          if (shared && (p.id !== originId || p.cloudOffline || p.accessRole !== "editor")) {
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
        const clearSaveNotice = () => {
          const notice = saveNotices.current.get(targetId);
          if (!notice) return;
          saveNotices.current.delete(targetId);
          if (alive.current) setError(previous => previous === notice ? "" : previous);
        };
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
              acknowledge(owner, candidate, saved?.revision, saved?.updatedAt);
              await waitForProjectCache(owner);
              clearTimeout(verificationRetries.current.get(candidate.id));
              verificationRetries.current.delete(candidate.id);
              clearSaveNotice();
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
            if (local.folderId === remote.folderId && sameBoardContent(local.board, remote.board)) {
              // The previous write may have succeeded but its response or
              // readback timed out. Confirm its content instead of resending.
              acknowledge(owner, local, remote.revision, remote.updatedAt);
              await waitForProjectCache(owner);
              const confirmed = readCache(owner).find(item => item.id === local.id);
              if (confirmed && alive.current) setProjects(items => [confirmed, ...items.filter(item => item.id !== confirmed.id)]);
              clearSaveNotice();
              continue;
            }
            const next = { projectId: snapshot.id, local, remote };
            conflictRef.current = next; setConflict(next); setError(""); setStatus("saveError");
            return false;
          }
        }
        return true;
      } catch (err) {
        if (err instanceof CloudVerificationPendingError) {
          verificationPendingIds.add(targetId);
          clearTimeout(verificationRetries.current.get(targetId));
          verificationRetries.current.set(targetId, setTimeout(() => {
            verificationRetries.current.delete(targetId);
            if (alive.current) void flush(targetId);
          }, 15_000));
          return false;
        }
        if (alive.current && (!current.current || current.current.id === targetId)) {
          setStatus(navigator.onLine ? "saveError" : "offline");
          if (!cacheFailed.current && isTemporaryCanvasReadFailure(err)) {
            const code = (err as { code?: string } | null)?.code;
            const notice = `Bản nháp đã được giữ trên thiết bị. Đám mây chưa xác nhận lần lưu này${code === "57014" ? " [57014]" : ""}. Hãy thử đồng bộ lại.`;
            saveNotices.current.set(targetId, notice);
            setError(notice);
          } else report(err);
        }
        return false;
      }
    }, targetId);

    const outcomes = await Promise.all(targetIds.map(async id => [id, await flushProject(id)] as const));
    const resultById = new Map(outcomes);
    const allSaved = outcomes.every(([, saved]) => saved) && !readCache(owner).some(p => p.pending && (!projectId || p.id === projectId));
    if (alive.current) {
      dirty.current = readCache(owner).some(p => p.pending);
      const activeId = current.current?.id;
      const activePending = !!activeId && readCache(owner).some(p => p.id === activeId && p.pending);
      const activeConflict = !!activeId && conflictRef.current?.projectId === activeId;
      const activeResult = activeId ? resultById.get(activeId) : undefined;
      if (activeConflict) setStatus("saveError");
      else if (activeId && verificationPendingIds.has(activeId)) setStatus("pending");
      else if (activeResult === false) setStatus(navigator.onLine ? "saveError" : "offline");
      else if (activePending) setStatus(navigator.onLine ? "pending" : "offline");
      else if (!activeId && !allSaved) setStatus("saveError");
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
    return () => { checkpointCurrent(); alive.current = false; clearTimeout(timer.current); clearTimeout(viewportTimer.current); verificationRetries.current.forEach(clearTimeout); verificationRetries.current.clear(); window.removeEventListener("online", cameOnline); window.removeEventListener("offline", wentOffline); window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("pagehide", pageHide); document.removeEventListener("visibilitychange", hidden); };
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
      const cachedRevision = readCache(owner).find(item => item.id === projectId)?.revision;
      if (cachedRevision !== undefined && update.revision !== undefined && update.revision < cachedRevision) return;
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
        acknowledge(owner, acknowledged.snapshot, update.revision ?? acknowledged.expectedRevision, update.updatedAt);
        const cached = readCache(owner).find(item => item.id === projectId);
        if (cached) cacheProject(owner, { ...cached, revision: update.revision ?? cached.revision, baseUpdatedAt: update.updatedAt ?? cached.baseUpdatedAt, pending: cached.pending });
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
        if (cached && !cached.pending) cacheProject(owner, { ...cached, revision: update.revision ?? cached.revision, baseUpdatedAt: update.updatedAt ?? cached.baseUpdatedAt });
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
      if (cached) cacheProject(owner, { ...cached, title: next.title, updatedAt: next.updatedAt, baseUpdatedAt: update.updatedAt ?? cached.baseUpdatedAt, board: next, thumbnail, revision: update.revision ?? cached.revision, pending: false });
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
      const baseUpdatedAt = existing?.baseUpdatedAt ?? (existing && !existing.pending ? existing.updatedAt : undefined);
      const p: CachedProject = { favorite: existing?.favorite, deletedAt: existing?.deletedAt, revision: existing?.revision, baseUpdatedAt, ownerId, accessRole, shared, cloudOffline: existing?.cloudOffline, id: next.id, title: next.title, updatedAt: next.updatedAt, board: next, thumbnail: createCanvasThumbnail(next), folderId: folderId.current, pending: !!owner };
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
    const cached = readCache(owner).find(item => item.id === snapshot.id);
    if (cached?.accessRole === "viewer" || cached?.cloudOffline) throw new Error("Bạn chỉ có quyền xem project này.");
    // A dirty or shared canvas can still get an explicit recovery point; a
    // checkpoint never drives a second cloud write while autosave is pending.
    const canSaveToCloud = !!owner && cached?.ownerId === owner && !cached.pending && !cached.shared &&
      sameBoardContent(cached.board, snapshot);
    const version = await createProjectVersion(owner, snapshot, label, canSaveToCloud ? "cloud" : "local");
    if (alive.current && current.current?.id === snapshot.id) setVersions(items => mergeProjectVersions(items, [version]));
    return version;
  };
  const restoreVersion = async (version: ProjectVersion) => {
    const snapshot = current.current;
    if (!snapshot || snapshot.id !== version.projectId) throw new Error("This version belongs to another project.");
    if (readCache(owner).find(item => item.id === snapshot.id)?.accessRole === "viewer" || readCache(owner).find(item => item.id === snapshot.id)?.cloudOffline) throw new Error("Bạn chỉ có quyền xem project này.");
    const backup = await createRecoveryCheckpoint(owner, snapshot, "Before restore");
    const active = current.current;
    if (active?.id !== snapshot.id || !sameBoardContent(active, snapshot)) throw new Error("Canvas vừa thay đổi. Hãy thử khôi phục lại.");
    change({ ...version.board, id: snapshot.id, updatedAt: new Date().toISOString() });
    setVersions(items => mergeProjectVersions(items, [backup]));
  };
  const checkpointBeforeLeaving = async (ticket: number) => {
    if (current.current) {
      checkpointCurrent();
      // The network may fail, but do not leave an unsaved in-memory edit.
      await waitForProjectCache(owner);
    }
    return alive.current && ticket === navigation.current && !cacheFailed.current;
  };
  const syncPendingInBackground = (id: string) => {
    if (!owner || navigationSyncs.current.has(id) || conflictRef.current?.projectId === id ||
      !readCache(owner).some(item => item.id === id && item.pending)) return;
    navigationSyncs.current.add(id);
    void flush(id).catch(report).finally(() => navigationSyncs.current.delete(id));
  };
  const checkOpenedCopy = async (account: string, ticket: number, initial: CachedProject) => {
    const stillOpen = () => alive.current && ticket === navigation.current && current.current?.id === initial.id;
    const unchanged = (cached: CachedProject | undefined, active: BoardState) => cached && !cached.pending &&
      !cacheFailed.current && conflictRef.current?.projectId !== initial.id && cached.revision === initial.revision &&
      cached.baseUpdatedAt === initial.baseUpdatedAt && folderId.current === initial.folderId &&
      sameBoardContent(active, initial.board);
    try {
      const remote = await revalidateOwnedProject(account, initial);
      const active = current.current;
      if (!stillOpen() || !active || !remote) return;
      const latest = readCache(account).find(item => item.id === initial.id);
      if (!unchanged(latest, active)) return;
      if (initial.revision !== undefined && (remote.revision === undefined || remote.revision < initial.revision)) return;
      // A rename can advance updated_at without advancing the content revision.
      // Skip a stale or inconsistent read at the very same version.
      const initialTime = Date.parse(initial.baseUpdatedAt ?? initial.updatedAt);
      const remoteTime = Date.parse(remote.baseUpdatedAt ?? remote.updatedAt);
      if (initial.revision === remote.revision &&
        (remoteTime < initialTime || (remoteTime === initialTime && !sameBoardContent(initial.board, remote.board)))) return;
      const next = normalizeEditor({ ...remote.board, viewport: active.viewport });
      const verified = { ...remote, board: next, pending: false };
      cacheProject(account, verified);
      current.current = next;
      folderId.current = verified.folderId;
      setBoard(next);
      upsertSummary(verified);
    } catch (err) {
      if (!stillOpen()) return;
      const active = current.current!;
      const latest = readCache(account).find(item => item.id === initial.id);
      if (isTemporaryCanvasReadFailure(err)) {
        if (unchanged(latest, active)) setStatus("offline");
        return;
      }
      const code = (err as { code?: string } | null)?.code;
      if (err instanceof OwnedProjectUnavailableError || code === "42501" || code === "PGRST116") {
        // A confirmed denial invalidates a clean view. Keep a draft that was
        // edited while checking so it can still be exported or recovered.
        if (unchanged(latest, active)) {
          current.current = null;
          setBoard(null);
          clearHistory();
          setProjects(items => items.filter(item => item.id !== initial.id));
        }
      }
      report(err);
    }
  };
  const open = async (p: Project) => {
    if (p.deletedAt) return;
    const ticket = ++navigation.current;
    if (current.current?.id === p.id) return;
    setError("");
    try {
      let cached = readCache(owner).find(c => c.id === p.id);
      const shared = !!owner && !!(p.shared || p.accessRole === "editor" || p.accessRole === "viewer" || (p.ownerId && p.ownerId !== owner) || cached?.shared || cached?.accessRole === "editor" || cached?.accessRole === "viewer" || (cached?.ownerId && cached.ownerId !== owner));
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      // Shared projects are cloud-authoritative. A pending device cache can
      // only be used for offline viewing; it must not win an online open.
      const cachedOwnerCopy = !!owner && !shared && cached?.ownerId === owner && !cached.deletedAt &&
        (cached.revision !== undefined || !!cached.baseUpdatedAt);
      let local = !!cached && (!owner || offline || (!shared && (cached.pending || cachedOwnerCopy)));
      let snapshot: CachedProject | undefined;
      let offlineCopy = offline;
      if (!local && owner) {
        try { snapshot = await fetchProjectSnapshot(owner, p.id); }
        catch (err) {
          if (!cached || cached.deletedAt || shared || !(p.ownerId === owner || cached.ownerId === owner) || !isTemporaryCanvasReadFailure(err)) throw err;
          // Save still uses the cached revision guard; an older copy cannot
          // silently overwrite a newer canvas on the server.
          local = offlineCopy = true;
        }
      }
      if (!alive.current || ticket !== navigation.current) return;
      if (!await checkpointBeforeLeaving(ticket)) return;
      const previousId = current.current?.id;
      cached = readCache(owner).find(c => c.id === p.id);
      if (!shared && cached?.pending && !snapshot) local = true;
      if (shared && cached?.pending && snapshot &&
        (cached.revision === undefined || (snapshot.revision !== undefined && snapshot.revision >= cached.revision)) &&
        cached.folderId === snapshot.folderId && sameBoardContent(cached.board, snapshot.board)) {
        acknowledge(owner, cached, snapshot.revision, snapshot.updatedAt);
        await waitForProjectCache(owner);
        if (!alive.current || ticket !== navigation.current) return;
        cached = readCache(owner).find(c => c.id === p.id);
      }
      if (cached && snapshot && (
        (cached.pending && (cached.folderId !== snapshot.folderId || !sameBoardContent(cached.board, snapshot.board))) ||
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
      if (!next || metadata.deletedAt) throw new Error("Project unavailable");
      if (!alive.current || ticket !== navigation.current) return;
      const opened = normalizeEditor(next);
      const entry = { ...metadata, board: opened, thumbnail: metadata.thumbnail ?? createCanvasThumbnail(opened), baseUpdatedAt: metadata.baseUpdatedAt ?? (snapshot ? snapshot.updatedAt : undefined), pending: !!cached?.pending || !!(local && snapshot), cloudOffline: shared && offline,
        ...(shared && snapshot ? { ownerId: snapshot.ownerId, accessRole: snapshot.accessRole, shared: snapshot.shared } : {}) };
      if (!cachedOwnerCopy || !cached || entry.pending || !cached.thumbnail) cacheProject(owner, entry);
      if (previousId) syncPendingInBackground(previousId);
      current.current = opened; folderId.current = metadata.folderId; setBoard(opened); clearHistory(); setVersions([]);
      // Publish the access metadata immediately so a newly accepted viewer
      // cannot get one editable render while the background refresh completes.
      upsertSummary(entry);
      setStatus(conflictRef.current?.projectId === p.id ? "saveError" : !owner ? "localSaved" : offlineCopy ? "offline" : entry.pending ? "pending" : "saved");
      // Opening a pending owned draft does not depend on the same PATCH that
      // timed out earlier. Leave other drafts to their own queue or manual retry.
      if (!shared && !offlineCopy && entry.pending) syncPendingInBackground(p.id);
      else if (owner && cachedOwnerCopy && !offlineCopy) void checkOpenedCopy(owner, ticket, entry);
    } catch (err) { if (ticket === navigation.current) report(err); }
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
    try {
      if (!await checkpointBeforeLeaving(ticket)) return;
      const id = current.current?.id;
      if (id) syncPendingInBackground(id);
      current.current = null;
      setBoard(null);
      clearHistory();
      setVersions([]);
      if (id) await refresh();
    } catch (err) { if (ticket === navigation.current) report(err); }
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
    try { if (!await flush()) throw new Error("Please save your pending changes and reconnect first."); await updateProject(owner, project, patch); await refresh(true); }
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
      await refresh(true);
    } catch (err) { report(err); throw err; }
  };
  const resolveConflict = async (resolution: ConflictResolution, copySuffix = "copy") => queue.current.run(async () => {
    const active = conflictRef.current;
    if (!owner || !active) return false;
    const clearedConflict = { ...active, error: undefined };
    conflictRef.current = clearedConflict; setConflict(clearedConflict);
    setStatus("saving"); setError("");
    try {
      const latestRemote = resolution === "cloud" ? active.remote : await fetchProjectSnapshot(owner, active.projectId);
      const latestLocal = readCache(owner).find(item => item.id === active.projectId) ?? active.local;
      let selected: CachedProject;
      if (resolution === "cloud") {
        await waitForProjectCache(owner);
        await createRecoveryCheckpoint(owner, latestLocal.board, "Local conflict backup");
        // Fetch the current cloud copy after checkpointing; do not download
        // an extra snapshot before writing the recovery point.
        const confirmedRemote = await fetchProjectSnapshot(owner, active.projectId);
        const deviceNow = readCache(owner).find(item => item.id === active.projectId);
        if (!deviceNow || deviceNow.folderId !== latestLocal.folderId || !sameBoardContent(deviceNow.board, latestLocal.board)
          || (current.current?.id === active.projectId && !sameBoardContent(current.current, latestLocal.board))) {
          throw new Error("Canvas vừa có thay đổi mới. Bản nháp được giữ lại; hãy thử đồng bộ lại sau khi vẽ xong.");
        }
        selected = confirmedRemote;
        cacheProject(owner, selected);
        try { await waitForProjectCache(owner); }
        catch (err) {
          // The editor is still showing the device draft. Restore its
          // in-memory cache too if neither durable cache accepted the cloud.
          cacheProject(owner, latestLocal);
          throw err;
        }
      } else if (resolution === "overwrite") {
        await createRecoveryCheckpoint(owner, latestRemote.board, "Before conflict overwrite");
        const candidate = { ...latestLocal, revision: latestRemote.revision, baseUpdatedAt: latestRemote.updatedAt, pending: true };
        cacheProject(owner, candidate);
        upsertSummary(candidate);
        const saved = await persistProject(owner, candidate);
        acknowledge(owner, candidate, saved.revision, saved.updatedAt);
        selected = readCache(owner).find(item => item.id === candidate.id) ?? { ...candidate, revision: saved.revision, baseUpdatedAt: saved.updatedAt, pending: false };
      } else {
        const timestamp = new Date().toISOString();
        const copyBoard = { ...structuredClone(latestLocal.board), id: crypto.randomUUID(), title: `${latestLocal.board.title} — ${copySuffix}`, updatedAt: timestamp };
        const candidate: CachedProject = { ...latestLocal, id: copyBoard.id, title: copyBoard.title, updatedAt: timestamp, board: copyBoard, revision: undefined, pending: true,
          ownerId: owner, accessRole: "owner", shared: false, cloudOffline: false, folderId: null };
        cacheProject(owner, candidate);
        upsertSummary(candidate);
        const saved = await persistProject(owner, candidate);
        acknowledge(owner, candidate, saved.revision, saved.updatedAt);
        cacheProject(owner, latestRemote);
        selected = readCache(owner).find(item => item.id === candidate.id) ?? { ...candidate, revision: saved.revision, baseUpdatedAt: saved.updatedAt, pending: false };
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
      setStatus(navigator.onLine ? "saveError" : "offline");
      if (err instanceof ProjectConflictError && err.projectId === active.projectId) {
        try {
          const remote = await fetchProjectSnapshot(owner, active.projectId);
          const local = readCache(owner).find(item => item.id === active.projectId) ?? active.local;
          const next = { projectId: active.projectId, local, remote, error: "Cloud vừa thay đổi trong lúc xử lý. Hãy xem lại hai phiên bản rồi chọn lại." };
          conflictRef.current = next; setConflict(next);
          setError(next.error);
          return false;
        } catch (refreshError) {
          report(refreshError);
        }
      }
      const message = errorMessage(err, "Không thể hoàn tất lựa chọn xung đột.");
      const failed = { ...active, error: message };
      conflictRef.current = failed; setConflict(failed);
      report(err);
      return false;
    }
  });
  // The refs are updated before the React render that follows a canvas commit.
  // Reading them here keeps the toolbar state aligned with the transaction
  // that was just created, including a create-text/shape commit followed
  // immediately by Undo while a cloud save is still settling.
  return { board, projects, folders, versions, versionLoading, loading, error, setError, status, online, pendingCount: projects.filter(project => project.pending).length, conflict, resolveConflict, change, checkpointDraft, navigate, undo, redo, canUndo: !!pastRef.current.length, canRedo: !!futureRef.current.length, flush, refresh, loadVersions, saveCheckpoint, restoreVersion, open, create, home, newFolder, renameFolder, removeFolder, move, manageProject, duplicateProject, loadThumbnails };
}
