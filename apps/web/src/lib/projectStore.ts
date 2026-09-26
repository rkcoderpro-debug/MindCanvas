import type { BoardState, CanvasThumbnail } from "@mindcanvas/shared";
import { getCurrentSession, requestTimeoutSignal, supabase } from "./supabase";
import { parseBoard } from "./board";
import { applyStudyEventToTasks, isStudyDayComplete, type Flashcard, type FlashcardDeck, type FlashcardStorage, type StudyDayProgress, type StudyEvent, type StudyPlan, type StudyPlanDay, type StudyPlanMode, type StudyPlanSourceType, type StudyPlanStatus, type StudyTaskKind } from "./flashcards";
import { readOfflineProjectCache, writeOfflineProjectCache } from "./offlineProjectCache";
import { createCanvasThumbnail, isCanvasThumbnail } from "./canvasThumbnail";
import { deleteFlashcardList, readFlashcardList, writeFlashcardList } from "./flashcardStorage";

export type Project = { id: string; title: string; folderId: string | null; updatedAt: string; baseUpdatedAt?: string; board?: BoardState; thumbnail?: CanvasThumbnail; pending?: boolean; favorite?: boolean; deletedAt?: string | null; revision?: number; ownerId?: string; accessRole?: "owner" | "editor" | "viewer"; shared?: boolean; cloudOffline?: boolean };
export type ProjectFolder = { id: string; name: string };
export type CachedProject = Project & { board: BoardState; pending: boolean };
export class ProjectConflictError extends Error {
  code = "PROJECT_CONFLICT";
  constructor(public projectId?: string, message = "Cloud project changed in another tab or device. Keep the local copy and choose a recovery action.") {
    super(message);
  }
}
export class ProjectVerificationError extends Error {
  code = "PROJECT_VERIFY_PENDING";
  constructor(public projectId: string, public lastError?: unknown) {
    super("Cloud chưa xác nhận được nội dung canvas. Bản nháp trên thiết bị vẫn được giữ và đang chờ đồng bộ; hãy thử lại sau.");
    this.name = "ProjectVerificationError";
  }
}
export type ProjectVersion = { id: string; projectId: string; version: number; createdAt: string; board: BoardState; source: "cloud" | "local"; label?: string };
export const MAX_PROJECT_VERSIONS = 30;
export const cacheKey = (owner: string | null) => `mindcanvas:projects:v3:${owner ?? "guest"}`;
export const versionCacheKey = (owner: string | null, projectId: string) => `mindcanvas:versions:v1:${owner ?? "guest"}:${projectId}`;
export const flashcardDeckCacheKey = (owner: string | null) => `mindcanvas:flashcards:v1:${owner ?? "guest"}:decks`;
export const flashcardCacheKey = (owner: string | null, deckId: string) => `mindcanvas:flashcards:v1:${owner ?? "guest"}:cards:${deckId}`;
export const flashcardStudyPlanCacheKey = (owner: string | null) => `mindcanvas:flashcards:v2:${owner ?? "guest"}:plans`;
export const flashcardStudyDayCacheKey = (owner: string | null) => `mindcanvas:flashcards:v2:${owner ?? "guest"}:study-days`;
export const flashcardStudyEventQueueCacheKey = (owner: string | null) => `mindcanvas:flashcards:v2:${owner ?? "guest"}:study-events`;
const memoryCaches = new Map<string, CachedProject[]>();
const memoryOnlyCaches = new Set<string>();
const hydratedCaches = new Set<string>();
const cacheWrites = new Map<string, Promise<void>>();
const cacheWriteErrors = new Map<string, unknown>();
const cacheGenerations = new Map<string, number>();
const ownerCacheId = (owner: string | null) => owner ?? "guest";
function parseProjectCache(value: unknown): CachedProject[] {
  if (!Array.isArray(value)) throw new Error("Invalid local cache; export your browser data before clearing it.");
  return value.map(item => {
    if (!item || typeof item !== "object") throw new Error("Invalid local project cache.");
    const project = item as Partial<CachedProject>;
    if (typeof project.id !== "string" || typeof project.title !== "string" || typeof project.updatedAt !== "string" || !project.board) throw new Error("Invalid local project cache.");
    return { ...project, folderId: typeof project.folderId === "string" ? project.folderId : null, pending: !!project.pending, thumbnail: isCanvasThumbnail(project.thumbnail) ? project.thumbnail : undefined, board: parseBoard(project.board) } as CachedProject;
  });
}
function writeProjectCache(owner: string | null, projects: CachedProject[]) {
  const key = cacheKey(owner), normalized = projects.map(project => ({ ...project, board: parseBoard(project.board) }));
  memoryCaches.set(key, normalized);
  cacheGenerations.set(key, (cacheGenerations.get(key) ?? 0) + 1);
  let localSaved = false;
  try {
    localStorage.setItem(key, JSON.stringify(normalized));
    memoryOnlyCaches.delete(key);
    localSaved = true;
  } catch {
    // Keep the current session usable when a large canvas exceeds the
    // localStorage quota. IndexedDB remains the durable fallback.
    memoryOnlyCaches.add(key);
  }
  // Each write stores the whole owner cache. Concurrent IndexedDB transactions
  // could otherwise commit an older canvas after the latest gesture checkpoint.
  const previous = cacheWrites.get(key) ?? Promise.resolve();
  const write = previous.catch(() => undefined).then(async () => {
    try {
      await writeOfflineProjectCache(ownerCacheId(owner), normalized);
      cacheWriteErrors.delete(key);
    } catch (error) {
      if (!localSaved) cacheWriteErrors.set(key, error);
      // A successful localStorage write is still a durable fallback.
      if (!localSaved) throw error;
    }
  });
  cacheWrites.set(key, write);
  void write.catch(() => undefined);
}
export async function waitForProjectCache(owner: string | null) {
  const key = cacheKey(owner);
  await cacheWrites.get(key);
  if (memoryOnlyCaches.has(key) && cacheWriteErrors.has(key)) throw cacheWriteErrors.get(key);
}
export function readCache(owner: string | null): CachedProject[] {
  const key = cacheKey(owner);
  // localStorage may contain yesterday's canvas if the latest setItem threw
  // QuotaExceededError. Never let that stale value replace the in-memory edit.
  const memory = memoryCaches.get(key);
  if (memoryOnlyCaches.has(key) && memory) return memory;
  const raw = localStorage.getItem(key);
  if (raw) {
    const parsed = parseProjectCache(JSON.parse(raw));
    memoryCaches.set(key, parsed);
    return parsed;
  }
  // A memory-only copy is intentional only after localStorage rejected a
  // write. Otherwise an empty localStorage (for example after sign-out or a
  // test reset) must not resurrect stale data from module memory.
  memoryCaches.delete(key);
  // Recover only the explicit v2 user cache; never import the old shared demo key.
  const legacy = localStorage.getItem(`mindcanvas:board:v2:${owner ?? "guest"}`);
  if (!legacy) { memoryCaches.set(key, []); return []; }
  const board = parseBoard(JSON.parse(legacy));
  // The v2 board.id sometimes differed from notes.id. Keep the old copy, but
  // never replay it automatically as a new cloud row (possibly "demo-board").
  // Only drafts created by the v3 repository have a reliable cloud identity.
  const projects = [{ id: board.id, title: board.title, updatedAt: board.updatedAt, folderId: null, board, pending: false }];
  memoryCaches.set(key, projects);
  return projects;
}
export async function hydrateProjectCache(owner: string | null) {
  const id = ownerCacheId(owner), key = cacheKey(owner);
  if (hydratedCaches.has(key)) return readCache(owner);
  const generation = cacheGenerations.get(key) ?? 0;
  await waitForProjectCache(owner);
  const local = readCache(owner);
  try {
    const stored = await readOfflineProjectCache(id);
    // A gesture (or a second workspace mount) may have written a newer draft
    // while this IndexedDB read was pending. Do not publish the old snapshot.
    if ((cacheGenerations.get(key) ?? 0) !== generation) return readCache(owner);
    if (stored) {
      const indexed = parseProjectCache(stored), merged = new Map(indexed.map(project => [project.id, project]));
      for (const project of local) {
        const previous = merged.get(project.id);
        // IndexedDB is our durable large-canvas store. A stale localStorage
        // entry must not win a same-timestamp tie after a quota failure.
        if (!previous || project.updatedAt > previous.updatedAt || (project.pending && !previous.pending && project.updatedAt === previous.updatedAt)) merged.set(project.id, project);
      }
      writeProjectCache(owner, [...merged.values()]);
    } else writeProjectCache(owner, local);
  } catch { memoryCaches.set(key, local); }
  hydratedCaches.add(key);
  return readCache(owner);
}
export function cacheProject(owner: string | null, project: CachedProject) {
  const entries = readCache(owner);
  writeProjectCache(owner, [project, ...entries.filter(p => p.id !== project.id)]);
}
export function acknowledge(owner: string, snapshot: CachedProject, revision = snapshot.revision, baseUpdatedAt = snapshot.updatedAt) {
  const entries = readCache(owner);
  writeProjectCache(owner, entries.map(p => {
    if (p.id !== snapshot.id) return p;
    const exactSnapshot = JSON.stringify(p.board) === JSON.stringify(snapshot.board) && p.folderId === snapshot.folderId;
    if (exactSnapshot) return { ...p, pending: false, revision, baseUpdatedAt };
    // An edit may arrive while this snapshot is in flight. It is still based on
    // the revision that just saved, so advance its base without marking it clean.
    return p.revision === snapshot.revision ? { ...p, revision, baseUpdatedAt } : p;
  }));
}

export function sameBoardContent(left: BoardState, right: BoardState) {
  const { viewport: _leftViewport, updatedAt: _leftUpdatedAt, ...leftContent } = left;
  const { viewport: _rightViewport, updatedAt: _rightUpdatedAt, ...rightContent } = right;
  return JSON.stringify(leftContent) === JSON.stringify(rightContent);
}
function readVersionCache(owner: string | null, projectId: string): ProjectVersion[] {
  const raw = localStorage.getItem(versionCacheKey(owner, projectId));
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("Invalid local version history.");
  return data.map(item => {
    if (!item || typeof item !== "object") throw new Error("Invalid local version history.");
    const entry = item as Partial<ProjectVersion>;
    const version = entry.version;
    if (typeof entry.id !== "string" || typeof entry.projectId !== "string" || entry.projectId !== projectId || typeof version !== "number" || !Number.isInteger(version) || version < 1 || typeof entry.createdAt !== "string" || !entry.board) throw new Error("Invalid local version history.");
    return { ...entry, version, board: parseBoard(entry.board), source: entry.source === "cloud" ? "cloud" : "local" } as ProjectVersion;
  }).sort((a, b) => b.version - a.version).slice(0, MAX_PROJECT_VERSIONS);
}
function cacheVersion(owner: string | null, version: ProjectVersion) {
  const current = readVersionCache(owner, version.projectId);
  try {
    localStorage.setItem(versionCacheKey(owner, version.projectId), JSON.stringify([version, ...current.filter(item => item.id !== version.id)].sort((a, b) => b.version - a.version).slice(0, MAX_PROJECT_VERSIONS)));
  } catch {
    // Recovery history must never block conflict resolution when a media-heavy
    // project has exhausted localStorage. A cloud checkpoint remains separate.
  }
}
function versionFromRow(row: any, source: "cloud" | "local"): ProjectVersion | null {
  try {
    const projectId = String(row.note_id ?? row.project_id);
    const content = row.content?.board ?? row.content;
    const board = parseBoard({ ...content, id: projectId });
    return { id: String(row.id), projectId, version: Number(row.version), createdAt: String(row.created_at), board, source, label: typeof row.label === "string" ? row.label : undefined };
  } catch { return null; }
}
export function readProjectVersions(owner: string | null, projectId: string) {
  return readVersionCache(owner, projectId);
}
export async function fetchProjectVersions(owner: string | null, projectId: string): Promise<ProjectVersion[]> {
  if (!owner) return readVersionCache(null, projectId);
  try {
    const client = await clientFor(owner);
    const { data, error } = await client.from("note_versions").select("id,note_id,version,label,content,created_at").eq("user_id", owner).eq("note_id", projectId).order("version", { ascending: false }).limit(MAX_PROJECT_VERSIONS).abortSignal(requestTimeoutSignal(20000));
    if (error) throw error;
    const remote = (data ?? []).map(row => versionFromRow(row, "cloud")).filter((row): row is ProjectVersion => !!row);
    remote.forEach(version => cacheVersion(owner, version));
    return remote.length ? remote : readVersionCache(owner, projectId);
  } catch {
    // History is a recovery aid. A missing migration or temporary network failure
    // falls back to the owner-scoped local checkpoints without blocking the editor.
    return readVersionCache(owner, projectId);
  }
}
function createLocalVersion(owner: string | null, board: BoardState, label?: string): ProjectVersion {
  const current = readVersionCache(owner, board.id), version = (current[0]?.version ?? 0) + 1;
  const snapshot: ProjectVersion = { id: crypto.randomUUID(), projectId: board.id, version, createdAt: new Date().toISOString(), board: parseBoard(board), source: "local", label };
  cacheVersion(owner, snapshot);
  return snapshot;
}
export async function createProjectVersion(owner: string | null, board: BoardState, label?: string): Promise<ProjectVersion> {
  if (!owner) return createLocalVersion(null, board, label);
  try {
    const client = await clientFor(owner), local = readVersionCache(owner, board.id);
    const latest = await client.from("note_versions").select("version").eq("user_id", owner).eq("note_id", board.id).order("version", { ascending: false }).limit(1).abortSignal(requestTimeoutSignal(20000)).maybeSingle();
    if (latest.error) throw latest.error;
    const version = Math.max(Number(latest.data?.version ?? 0), local[0]?.version ?? 0) + 1;
    const row = { id: crypto.randomUUID(), note_id: board.id, user_id: owner, version, label: label ?? null, content: { type: "mindcanvas-board", version: 1, board }, created_at: new Date().toISOString() };
    const result = await client.from("note_versions").insert(row).select("id,note_id,version,label,content,created_at").abortSignal(requestTimeoutSignal(20000)).single();
    if (result.error) throw result.error;
    const saved = versionFromRow(result.data, "cloud");
    if (!saved) throw new Error("Invalid version returned by Supabase.");
    cacheVersion(owner, saved);
    return saved;
  } catch {
    return createLocalVersion(owner, board, label);
  }
}
export function mergeProjects(remote: Project[], cache: CachedProject[], owner: string | null): Project[] {
  if (!owner) return cache;
  const result = new Map(remote.map(p => [p.id, p]));
  for (const p of cache) {
    const shared = p.shared || (!!p.ownerId && p.ownerId !== owner);
    if (shared) {
      // A collaborator's device cache is a read-through cache only. Once the
      // remote list is available, never let a pending/stale shared snapshot
      // replace the cloud metadata shown in the workspace. A shared entry
      // missing from that list is no longer accessible and must not linger as
      // a false project; offline refreshes do not call this merge function.
      const remoteProject = result.get(p.id);
      if (remoteProject) result.set(p.id, { ...p, ...remoteProject, board: p.board, pending: p.pending, cloudOffline: false });
      else result.delete(p.id);
    } else if (p.pending) result.set(p.id, p);
    else if (result.has(p.id) && result.get(p.id)!.updatedAt === p.updatedAt) result.set(p.id, { ...p, ...result.get(p.id)!, board: p.board });
  }
  return [...result.values()];
}
async function clientFor(owner: string) {
  const session = await getCurrentSession();
  if (!supabase || !session || session.user.id !== owner) throw new Error("Phiên đăng nhập đã thay đổi. Hãy đăng nhập lại.");

  // getSession() only reads the browser cache.  A stale/expired access token
  // can therefore look valid here while Postgres receives no authenticated
  // identity and rejects an insert with 42501.  Verify the token with the
  // Supabase Auth endpoint before any cloud read/write.  The optional guard
  // keeps lightweight unit-test clients (which only implement `from`) valid.
  const auth = (supabase as unknown as {
    auth?: {
      getUser?: () => Promise<{ data?: { user?: { id?: string } | null }; error?: { message?: string } | null }>;
      refreshSession?: () => Promise<{ error?: { message?: string } | null }>;
    };
  }).auth;
  if (typeof auth?.getUser === "function") {
    let verified = await auth.getUser();
    if (verified.error && typeof auth.refreshSession === "function") {
      const refreshed = await auth.refreshSession();
      if (!refreshed.error) verified = await auth.getUser();
    }
    if (verified.error) throw new Error("Phiên Supabase đã hết hạn. Hãy đăng nhập lại rồi thử lưu.");
    if (verified.data?.user?.id !== owner) throw new Error("Tài khoản Supabase hiện tại không khớp với workspace. Hãy đăng nhập lại.");
  }
  return supabase;
}
export async function fetchProjects(owner: string): Promise<Project[]> {
  const client = await clientFor(owner);
  let result: any = await client.from("notes").select("id,user_id,title,folder_id,updated_at,is_favorite,deleted_at,revision,thumbnail").order("updated_at", { ascending: false }).abortSignal(requestTimeoutSignal(20000));
  if (result.error && /revision|column/i.test(result.error.message)) result = await client.from("notes").select("id,user_id,title,folder_id,updated_at,is_favorite,deleted_at").order("updated_at", { ascending: false }).abortSignal(requestTimeoutSignal(20000));
  if (result.error) throw result.error;
  const data = result.data as any[] | null;
  let memberships: Record<string, "editor" | "viewer"> = {};
  try {
    const memberResult = await client.from("project_members").select("project_id,role").eq("user_id", owner);
    if (!memberResult.error) memberships = Object.fromEntries((memberResult.data ?? []).map((row: any) => [String(row.project_id), row.role === "editor" ? "editor" : "viewer"]));
  } catch { /* V4.4 migration may not be applied yet; owner projects still load. */ }
  return (data ?? []).map(p => {
    const ownerId = typeof p.user_id === "string" ? p.user_id : owner;
    return { id: p.id, title: p.title, folderId: p.folder_id, updatedAt: p.updated_at, baseUpdatedAt: p.updated_at, favorite: p.is_favorite, deletedAt: p.deleted_at, revision: typeof p.revision === "number" ? p.revision : undefined,
      ownerId, accessRole: ownerId === owner ? "owner" : memberships[p.id] ?? "viewer", shared: ownerId !== owner, thumbnail: isCanvasThumbnail(p.thumbnail) ? p.thumbnail : undefined };
  });
}
export async function fetchProjectSnapshot(owner: string, id: string, timeoutMs = 20000): Promise<CachedProject> {
  const client = await clientFor(owner);
  let result: any = await client.from("notes").select("id,user_id,title,folder_id,updated_at,is_favorite,deleted_at,revision,thumbnail,content").eq("id", id).abortSignal(requestTimeoutSignal(timeoutMs)).single();
  if (result.error && /revision|column/i.test(result.error.message)) {
    // RLS already limits the visible notes. Filtering by the current user here
    // would incorrectly hide a shared note in a legacy schema without revision.
    result = await client.from("notes").select("id,user_id,title,folder_id,updated_at,is_favorite,deleted_at,content").eq("id", id).abortSignal(requestTimeoutSignal(timeoutMs)).single();
  }
  if (result.error) throw result.error;
  const data = result.data as any;
  const board = parseBoard({ ...(data.content?.board ?? data.content), id: data.id, title: data.title });
  const ownerId = typeof data.user_id === "string" ? data.user_id : owner;
  let accessRole: "owner" | "editor" | "viewer" = ownerId === owner ? "owner" : "viewer";
  if (accessRole !== "owner") {
    try {
      const membership = await client.from("project_members").select("role").eq("project_id", id).eq("user_id", owner).maybeSingle();
      if (!membership.error && membership.data?.role === "editor") accessRole = "editor";
    } catch { /* keep the read-only fallback */ }
  }
  const cloudUpdatedAt = String(data.updated_at ?? board.updatedAt);
  return { id: String(data.id), title: String(data.title), folderId: data.folder_id ?? null, updatedAt: cloudUpdatedAt, baseUpdatedAt: cloudUpdatedAt,
    favorite: !!data.is_favorite, deletedAt: data.deleted_at ?? null, revision: typeof data.revision === "number" ? data.revision : undefined, ownerId, accessRole, shared: ownerId !== owner, thumbnail: isCanvasThumbnail(data.thumbnail) ? data.thumbnail : createCanvasThumbnail(board), board, pending: false };
}

export async function fetchBoard(owner: string, id: string): Promise<BoardState> {
  return (await fetchProjectSnapshot(owner, id)).board;
}
export type ProjectWriteVerificationOptions = {
  maxWaitMs?: number;
  retryDelaysMs?: readonly number[];
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  fetchSnapshot?: (owner: string, projectId: string, timeoutMs: number) => Promise<CachedProject>;
  onChecking?: () => void;
};
const DEFAULT_PROJECT_VERIFY_WAIT_MS = 15_000;
const DEFAULT_PROJECT_VERIFY_DELAYS_MS = [1000, 2000, 3000, 4000, 2500] as const;
const sleepFor = (milliseconds: number) => new Promise<void>(resolve => window.setTimeout(resolve, milliseconds));
function retryableVerificationReadError(error: unknown): boolean {
  const value = error as { status?: unknown; statusCode?: unknown; code?: unknown } | null;
  const status = Number(value?.status ?? value?.statusCode);
  const code = String(value?.code ?? "");
  if ([408, 409, 425, 429, 404, 406].includes(status) || code === "PGRST116") return true;
  if (status >= 500) return true;
  if (status >= 400) return false;
  if (code === "42501" || code.startsWith("23") || code.startsWith("28")) return false;
  // Fetch failures and PostgREST connection errors can recover during the bounded window.
  return !code || code.startsWith("08") || code.startsWith("PGRST");
}
export async function verifyProjectWrite(owner: string, project: CachedProject, expectedRevision: number | undefined, options: ProjectWriteVerificationOptions = {}): Promise<{ revision?: number; updatedAt?: string }> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? sleepFor;
  const fetchSnapshot = options.fetchSnapshot ?? fetchProjectSnapshot;
  const maxWaitMs = Math.max(0, options.maxWaitMs ?? DEFAULT_PROJECT_VERIFY_WAIT_MS);
  const startedAt = now();
  const deadline = startedAt + maxWaitMs;
  const delays = options.retryDelaysMs ?? DEFAULT_PROJECT_VERIFY_DELAYS_MS;
  let attempt = 0;
  let lastError: unknown;
  options.onChecking?.();

  while (true) {
    if (attempt > 0) {
      const remaining = deadline - now();
      if (remaining <= 0) break;
      const delay = delays[Math.min(attempt - 1, delays.length - 1)] ?? 1000;
      if (delay >= remaining) { await sleep(remaining); break; }
      await sleep(delay);
    }
    const remaining = Math.max(1, deadline - now());
    let timeoutId: number | undefined;
    try {
      const remote = await Promise.race([
        fetchSnapshot(owner, project.id, remaining),
        new Promise<never>((_resolve, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error("Cloud readback timed out")), remaining);
        }),
      ]);
      const contentMatches = remote.folderId === project.folderId && sameBoardContent(remote.board, project.board);
      const revisionMatches = expectedRevision === undefined || (remote.revision !== undefined && remote.revision >= expectedRevision);
      if (contentMatches && revisionMatches) return { revision: remote.revision, updatedAt: remote.updatedAt };
      if (!contentMatches && expectedRevision !== undefined && remote.revision !== undefined && remote.revision > expectedRevision) {
        throw new ProjectConflictError(project.id, "Cloud đã nhận một chỉnh sửa mới hơn có nội dung khác. Bản nháp trên thiết bị vẫn được giữ.");
      }
      lastError = undefined;
    } catch (error) {
      if (error instanceof ProjectConflictError) throw error;
      if (!retryableVerificationReadError(error)) throw error;
      lastError = error;
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
    attempt++;
    if (now() >= deadline) break;
  }
  throw new ProjectVerificationError(project.id, lastError);
}
export type PersistProjectOptions = { onVerifying?: () => void; verification?: ProjectWriteVerificationOptions };
export async function persistProject(owner: string, project: CachedProject, options: PersistProjectOptions = {}): Promise<{ revision?: number; updatedAt?: string }> {
  if (project.accessRole === "viewer") throw new Error("Bạn chỉ có quyền xem project này.");
  if (project.cloudOffline) throw new Error("Project chia sẻ đang ở chế độ chỉ xem khi ngoại tuyến.");
  // An existing shared draft without a base revision must be reconciled,
  // never inserted under the collaborator's identity.
  if (project.revision === undefined && !project.baseUpdatedAt && (project.shared || (project.ownerId && project.ownerId !== owner))) {
    throw new ProjectConflictError(project.id);
  }
  const client = await clientFor(owner);
  const verify = async (revision?: number) => verifyProjectWrite(owner, project, revision, { ...options.verification, onChecking: options.onVerifying });
  const payload = { id: project.id, folder_id: project.folderId, title: project.board.title, content: { type: "mindcanvas-board", version: 1, board: project.board }, thumbnail: project.thumbnail ?? createCanvasThumbnail(project.board), updated_at: project.board.updatedAt };
  const { thumbnail: _thumbnail, ...payloadWithoutThumbnail } = payload;
  const updateWithRevision = async (baseRevision: number) => {
    const nextRevision = baseRevision + 1;
    let result = await client.from("notes").update({ ...payload, revision: nextRevision }).eq("id", project.id).eq("revision", baseRevision).select("revision").abortSignal(requestTimeoutSignal(20000)).maybeSingle();
    if (result.error && /thumbnail/i.test(String(result.error.message ?? ""))) result = await client.from("notes").update({ ...payloadWithoutThumbnail, revision: nextRevision }).eq("id", project.id).eq("revision", baseRevision).select("revision").abortSignal(requestTimeoutSignal(20000)).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new ProjectConflictError(project.id);
    return verify(Number(result.data.revision ?? nextRevision));
  };
  if (project.revision === undefined && project.baseUpdatedAt) {
    // Older caches and pre-revision databases still have updated_at. Refresh
    // the cloud base before writing so a missing revision never becomes an
    // INSERT for a project that already exists.
    const base = await fetchProjectSnapshot(owner, project.id);
    if (base.updatedAt !== project.baseUpdatedAt || base.folderId !== project.folderId) throw new ProjectConflictError(project.id);
    if (sameBoardContent(base.board, project.board)) return { revision: base.revision, updatedAt: base.updatedAt };
    if (base.revision !== undefined) return updateWithRevision(base.revision);

    let legacy = await client.from("notes").update(payload).eq("id", project.id).eq("updated_at", base.updatedAt).select("id").abortSignal(requestTimeoutSignal(20000)).maybeSingle();
    if (legacy.error && /thumbnail/i.test(String(legacy.error.message ?? ""))) {
      legacy = await client.from("notes").update(payloadWithoutThumbnail).eq("id", project.id).eq("updated_at", base.updatedAt).select("id").abortSignal(requestTimeoutSignal(20000)).maybeSingle();
    }
    if (legacy.error) throw legacy.error;
    if (!legacy.data) throw new ProjectConflictError(project.id);
    return verify(undefined);
  }
  if (project.revision === undefined) {
    // A newly created canvas must go through INSERT, not UPSERT.  UPSERT is
    // an INSERT ... ON CONFLICT UPDATE and can unexpectedly require the
    // editor/update policy (or attempt to change ownership) even for a fresh
    // local UUID.  Existing legacy rows are handled only after a duplicate
    // key response below.
    // Do not request RETURNING for a new row. PostgreSQL applies the SELECT
    // policy to INSERT ... RETURNING; a shared-project SELECT policy can
    // reject a just-created row even when its INSERT WITH CHECK is valid.
    // The initial revision is known locally, so no returned column is needed.
    let modern = await client.from("notes").insert({ ...payload, user_id: owner, revision: 0 }).abortSignal(requestTimeoutSignal(20000));
    if (modern.error && /thumbnail/i.test(String(modern.error.message ?? ""))) modern = await client.from("notes").insert({ ...payloadWithoutThumbnail, user_id: owner, revision: 0 }).abortSignal(requestTimeoutSignal(20000));
    if (!modern.error) return verify(0);
    const modernMessage = String(modern.error.message ?? "");
    const modernCode = String((modern.error as { code?: unknown }).code ?? "");
    const duplicate = modernCode === "23505" || /duplicate key|already exists/i.test(modernMessage);
    if (!duplicate && !/revision|column/i.test(modernMessage)) throw modern.error;

    // A pre-revision database can still accept a brand-new note.  Do not
    // retry a 42501/RLS failure with a broader write; surface that exact
    // problem so the UI can point to the Supabase project/session mismatch.
    if (!duplicate && /revision|column/i.test(modernMessage)) {
      let legacy = await client.from("notes").insert({ ...( /thumbnail/i.test(modernMessage) ? payloadWithoutThumbnail : payload), user_id: owner }).abortSignal(requestTimeoutSignal(20000));
      if (legacy.error && /thumbnail/i.test(String(legacy.error.message ?? ""))) legacy = await client.from("notes").insert({ ...payloadWithoutThumbnail, user_id: owner }).abortSignal(requestTimeoutSignal(20000));
      if (!legacy.error) return verify(undefined);
      const legacyMessage = String(legacy.error.message ?? "");
      const legacyCode = String((legacy.error as { code?: unknown }).code ?? "");
      if (!(legacyCode === "23505" || /duplicate key|already exists/i.test(legacyMessage))) throw legacy.error;
    }

    // A duplicate proves this is not a new canvas. Without a base revision
    // an automatic update would silently overwrite another device's edits.
    throw new ProjectConflictError(project.id);
  }
  return updateWithRevision(project.revision);
}
export async function fetchFolders(owner: string | null): Promise<ProjectFolder[]> {
  if (!owner) return JSON.parse(localStorage.getItem(cacheKey(null) + ":folders") ?? "[]");
  const client = await clientFor(owner);
  const { data, error } = await client.from("folders").select("id,name").eq("user_id", owner).order("created_at").abortSignal(requestTimeoutSignal(20000));
  if (error) throw error;
  return data ?? [];
}
export type ProjectPatch = { favorite?: boolean; deletedAt?: string | null; title?: string; folderId?: string | null };
export async function updateProjectThumbnail(owner: string | null, projectId: string, thumbnail: CanvasThumbnail) {
  if (!owner) return;
  const client = await clientFor(owner);
  const { error } = await client.from("notes").update({ thumbnail }).eq("id", projectId).select("id").single();
  if (error) throw error;
}
export async function updateProject(owner: string | null, project: Project, patch: ProjectPatch) {
  // Metadata writes never replace content. Cloud actions must complete before
  // the UI announces success; a failed request leaves the local record intact.
  const timestamp = patch.title !== undefined ? new Date().toISOString() : project.updatedAt;
  if (owner) {
    const client = await clientFor(owner);
    const changes = { ...(patch.favorite !== undefined ? { is_favorite: patch.favorite } : {}),
      ...(patch.deletedAt !== undefined ? { deleted_at: patch.deletedAt } : {}),
      ...(patch.folderId !== undefined ? { folder_id: patch.folderId } : {}),
      ...(patch.title !== undefined ? { title: patch.title, updated_at: timestamp } : {}) };
    let metadataQuery = client.from("notes").update(changes).eq("id", project.id);
    // Keep the owner filter for legacy callers and migrations. Shared members
    // identify the owner through the RLS policy and must not filter by their
    // own user id.
    if (!project.shared && (!project.ownerId || project.ownerId === owner)) metadataQuery = metadataQuery.eq("user_id", owner);
    const { error } = await metadataQuery.select("id").abortSignal(requestTimeoutSignal(20000)).single();
    if (error) throw error;
  }
  const cached = readCache(owner).find(p => p.id === project.id);
  if (cached) cacheProject(owner, { ...cached, ...patch, updatedAt: timestamp,
    board: patch.title !== undefined ? { ...cached.board, title: patch.title, updatedAt: timestamp } : cached.board });
}
export async function addFolder(owner: string | null, name: string): Promise<ProjectFolder> {
  const folder = { id: crypto.randomUUID(), name };
  if (!owner) { localStorage.setItem(cacheKey(null) + ":folders", JSON.stringify([...(await fetchFolders(null)), folder])); return folder; }
  const client = await clientFor(owner);
  const { error } = await client.from("folders").insert({ ...folder, user_id: owner }).abortSignal(requestTimeoutSignal(20000));
  if (error) throw error;
  return folder;
}
export async function updateFolder(owner: string | null, folder: ProjectFolder, name: string) {
  if (owner) {
    const client = await clientFor(owner);
    const { error } = await client.from("folders").update({ name }).eq("user_id", owner).eq("id", folder.id).select("id").single();
    if (error) throw error;
  }
  const folders = await fetchFolders(owner);
  localStorage.setItem(cacheKey(owner) + ":folders", JSON.stringify(folders.map(f => f.id === folder.id ? { ...f, name } : f)));
}
export async function deleteFolder(owner: string | null, folder: ProjectFolder) {
  if (owner) {
    const client = await clientFor(owner);
    const { error } = await client.from("folders").delete().eq("user_id", owner).eq("id", folder.id);
    if (error) throw error;
  }
  const folders = (await fetchFolders(owner)).filter(f => f.id !== folder.id);
  localStorage.setItem(cacheKey(owner) + ":folders", JSON.stringify(folders));
  const entries = readCache(owner).map(p => p.folderId === folder.id ? { ...p, folderId: null } : p);
  writeProjectCache(owner, entries);
}

export type FlashcardRepositoryResult<T> = { items: T[]; source: FlashcardStorage };

const memoryLocalLists = new Map<string, unknown[]>();
const memoryOnlyLocalLists = new Set<string>();

function readLocalList<T>(key: string): T[] {
  if (memoryOnlyLocalLists.has(key)) return (memoryLocalLists.get(key) as T[] | undefined) ?? [];
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      memoryLocalLists.delete(key);
      return [];
    }
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value;
  } catch {
    return (memoryLocalLists.get(key) as T[] | undefined) ?? [];
  }
}

function writeLocalList<T>(key: string, value: T[]): boolean {
  const snapshot = [...value];
  memoryLocalLists.set(key, snapshot);
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
    memoryLocalLists.delete(key);
    memoryOnlyLocalLists.delete(key);
    return true;
  } catch {
    // A cache quota error must not turn a successful cloud operation into a
    // reported network failure. Keep this owner's latest cache for the session.
    memoryOnlyLocalLists.add(key);
    return false;
  }
}

/**
 * Flashcards used to rely on localStorage for guests and as the offline
 * fallback for signed-in users. A large canvas/document cache can fill that
 * small quota even though IndexedDB still has room. Hydrate an IndexedDB copy
 * when one exists and use it as the durable fallback without deleting the old
 * localStorage copy.
 */
async function hydrateLocalList<T>(key: string): Promise<T[]> {
  const current = readLocalList<T>(key);
  if (memoryOnlyLocalLists.has(key)) return current;
  try {
    const stored = await readFlashcardList(key);
    if (stored) {
      const snapshot = stored as T[];
      memoryLocalLists.set(key, [...snapshot]);
      memoryOnlyLocalLists.add(key);
      return [...snapshot];
    }
  } catch {
    // localStorage remains the first recovery path when IndexedDB is blocked.
  }
  return current;
}

async function persistLocalList<T>(key: string, value: T[]): Promise<boolean> {
  const hadIndexedFallback = memoryOnlyLocalLists.has(key);
  const snapshot = [...value];
  if (writeLocalList(key, snapshot)) {
    // Keep an existing IndexedDB fallback in sync until it can be safely
    // removed. This prevents an older IDB copy from resurrecting after F5.
    if (hadIndexedFallback) {
      if (await writeFlashcardList(key, snapshot)) memoryOnlyLocalLists.add(key);
      else void deleteFlashcardList(key);
    }
    return true;
  }
  if (await writeFlashcardList(key, snapshot)) {
    memoryLocalLists.set(key, snapshot);
    memoryOnlyLocalLists.add(key);
    return true;
  }
  return false;
}

function removeLocalList(key: string) {
  memoryLocalLists.delete(key);
  memoryOnlyLocalLists.delete(key);
  void deleteFlashcardList(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Hide an undeletable stale browser copy for the remainder of this session.
    memoryOnlyLocalLists.add(key);
  }
}

function requirePersistentLocalList(saved: boolean) {
  if (!saved) throw new Error("Dung lượng lưu trữ của trình duyệt đã đầy. Dữ liệu chưa được lưu bền vững; hãy giải phóng dung lượng rồi thử lại.");
}

// Keep server rejection diagnostics when a second, local write also fails.
// Do not include server details: they can contain the full rejected card row.
function finishFlashcardFallback(saved: boolean, cloudError: unknown): FlashcardStorage {
  const error = cloudError && typeof cloudError === "object"
    ? cloudError as { code?: unknown; message?: unknown } : null;
  const code = typeof error?.code === "string" ? error.code : "";
  if (cloudError && (!saved || code)) {
    const reason = typeof error?.message === "string" ? error.message.slice(0, 500) : "Không kết nối được dịch vụ cloud.";
    const recovery = saved
      ? "Đã lưu bản dự phòng trên trình duyệt; thay đổi chưa đồng bộ lên cloud."
      : "Không ghi được bản dự phòng trên trình duyệt. Dữ liệu chưa được lưu bền vững; giữ trang này mở và sao lưu nội dung trước khi tải lại.";
    throw new Error(`Không lưu được flashcard lên cloud${code ? ` [${code}]` : ""}: ${reason}. ${recovery}`);
  }
  requirePersistentLocalList(saved);
  return "local";
}

function deckFromRow(row: any, source: FlashcardStorage): FlashcardDeck | null {
  if (!row || typeof row.id !== "string" || typeof row.name !== "string") return null;
  const timestamp = typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString();
  return { id: row.id, name: row.name, projectId: typeof row.project_id === "string" ? row.project_id : null, folderId: typeof row.folder_id === "string" ? row.folder_id : null, createdAt: typeof row.created_at === "string" ? row.created_at : timestamp, updatedAt: timestamp, source };
}

function cardFromRow(row: any, source: FlashcardStorage): Flashcard | null {
  if (!row || typeof row.id !== "string" || typeof row.deck_id !== "string" || typeof row.front !== "string" || typeof row.back !== "string") return null;
  const timestamp = typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString();
  const page = Number(row.source_page);
  return { id: row.id, deckId: row.deck_id, projectId: typeof row.project_id === "string" ? row.project_id : null, front: row.front, back: row.back, sourcePage: Number.isInteger(page) && page > 0 ? page : null, dueAt: typeof row.due_at === "string" ? row.due_at : timestamp, intervalDays: Number.isFinite(Number(row.interval_days)) ? Math.max(0, Number(row.interval_days)) : 0, ease: Number.isFinite(Number(row.ease)) ? Math.max(1.3, Number(row.ease)) : 2.5, repetitions: Number.isInteger(Number(row.repetitions)) ? Math.max(0, Number(row.repetitions)) : 0, lapses: Number.isInteger(Number(row.lapses)) ? Math.max(0, Number(row.lapses)) : 0, createdAt: typeof row.created_at === "string" ? row.created_at : timestamp, updatedAt: timestamp, source };
}

function localDecks(owner: string | null) {
  return readLocalList<FlashcardDeck>(flashcardDeckCacheKey(owner)).filter(deck => typeof deck?.id === "string" && typeof deck.name === "string");
}

function localCards(owner: string | null, deckId: string) {
  return readLocalList<Flashcard>(flashcardCacheKey(owner, deckId)).filter(card => typeof card?.id === "string" && card.deckId === deckId && typeof card.front === "string" && typeof card.back === "string");
}

async function cacheDeck(owner: string | null, deck: FlashcardDeck): Promise<boolean> {
  await hydrateLocalList<FlashcardDeck>(flashcardDeckCacheKey(owner));
  const items = localDecks(owner).filter(item => item.id !== deck.id);
  return persistLocalList(flashcardDeckCacheKey(owner), [{ ...deck }, ...items].slice(0, 200));
}

async function cacheCard(owner: string | null, card: Flashcard): Promise<boolean> {
  await hydrateLocalList<Flashcard>(flashcardCacheKey(owner, card.deckId));
  const items = localCards(owner, card.deckId).filter(item => item.id !== card.id);
  return persistLocalList(flashcardCacheKey(owner, card.deckId), [{ ...card }, ...items].slice(0, 1000));
}

export function readFlashcardDecks(owner: string | null) {
  return localDecks(owner);
}

export function readFlashcards(owner: string | null, deckId: string) {
  return localCards(owner, deckId);
}

export async function fetchFlashcardDecks(owner: string | null): Promise<FlashcardRepositoryResult<FlashcardDeck>> {
  await hydrateLocalList<FlashcardDeck>(flashcardDeckCacheKey(owner));
  if (!owner) return { items: localDecks(null), source: "local" };
  try {
    const client = await clientFor(owner);
    const { data, error } = await client.from("flashcard_decks").select("id,name,project_id,folder_id,created_at,updated_at").eq("user_id", owner).order("updated_at", { ascending: false }).abortSignal(requestTimeoutSignal(20000));
    if (error) throw error;
    const items = (data ?? []).map(row => deckFromRow(row, "cloud")).filter((item): item is FlashcardDeck => !!item);
    await persistLocalList(flashcardDeckCacheKey(owner), items);
    return { items, source: "cloud" };
  } catch {
    return { items: localDecks(owner), source: "local" };
  }
}

export async function fetchFlashcards(owner: string | null, deckId: string): Promise<FlashcardRepositoryResult<Flashcard>> {
  await hydrateLocalList<Flashcard>(flashcardCacheKey(owner, deckId));
  if (!owner) return { items: localCards(null, deckId), source: "local" };
  try {
    const client = await clientFor(owner);
    const { data, error } = await client.from("flashcards").select("id,deck_id,project_id,front,back,source_page,due_at,interval_days,ease,repetitions,lapses,created_at,updated_at").eq("user_id", owner).eq("deck_id", deckId).order("created_at", { ascending: true }).abortSignal(requestTimeoutSignal(20000));
    if (error) throw error;
    const items = (data ?? []).map(row => cardFromRow(row, "cloud")).filter((item): item is Flashcard => !!item);
    await persistLocalList(flashcardCacheKey(owner, deckId), items);
    return { items, source: "cloud" };
  } catch {
    return { items: localCards(owner, deckId), source: "local" };
  }
}

export async function upsertFlashcardDeck(owner: string | null, deck: FlashcardDeck): Promise<FlashcardStorage> {
  let cloudError: unknown;
  if (owner) {
    try {
      const client = await clientFor(owner);
      const { error } = await client.from("flashcard_decks").upsert({ id: deck.id, user_id: owner, name: deck.name, project_id: deck.projectId, folder_id: deck.folderId, created_at: deck.createdAt, updated_at: deck.updatedAt }).abortSignal(requestTimeoutSignal(20000));
      if (error) throw error;
      await cacheDeck(owner, { ...deck, source: "cloud" });
      return "cloud";
    } catch (error) {
      cloudError = error;
      // A missing migration or unavailable network keeps the edit usable locally.
    }
  }
  return finishFlashcardFallback(await cacheDeck(owner, { ...deck, source: "local" }), cloudError);
}

export async function deleteFlashcardDeck(owner: string | null, deckId: string): Promise<FlashcardStorage> {
  await hydrateLocalList<FlashcardDeck>(flashcardDeckCacheKey(owner));
  if (owner) {
    try {
      const client = await clientFor(owner);
      const { error } = await client.from("flashcard_decks").delete().eq("user_id", owner).eq("id", deckId).abortSignal(requestTimeoutSignal(20000));
      if (error) throw error;
      await persistLocalList(flashcardDeckCacheKey(owner), localDecks(owner).filter(deck => deck.id !== deckId));
      removeLocalList(flashcardCacheKey(owner, deckId));
      return "cloud";
    } catch {
      // Keep the app usable until the flashcard migration/network is available.
    }
  }
  requirePersistentLocalList(await persistLocalList(flashcardDeckCacheKey(owner), localDecks(owner).filter(deck => deck.id !== deckId)));
  removeLocalList(flashcardCacheKey(owner, deckId));
  return "local";
}

export async function upsertFlashcard(owner: string | null, card: Flashcard): Promise<FlashcardStorage> {
  let cloudError: unknown;
  if (owner) {
    try {
      const client = await clientFor(owner);
      const { error } = await client.from("flashcards").upsert({ id: card.id, deck_id: card.deckId, user_id: owner, project_id: card.projectId, front: card.front, back: card.back, source_page: card.sourcePage, due_at: card.dueAt, interval_days: card.intervalDays, ease: card.ease, repetitions: card.repetitions, lapses: card.lapses, created_at: card.createdAt, updated_at: card.updatedAt }).abortSignal(requestTimeoutSignal(20000));
      if (error) throw error;
      await cacheCard(owner, { ...card, source: "cloud" });
      return "cloud";
    } catch (error) {
      cloudError = error;
      // A missing migration or unavailable network keeps the edit usable locally.
    }
  }
  return finishFlashcardFallback(await cacheCard(owner, { ...card, source: "local" }), cloudError);
}

export async function upsertFlashcards(owner: string | null, cards: Flashcard[]): Promise<FlashcardStorage> {
  if (!cards.length) return owner ? "cloud" : "local";
  if (new Set(cards.map(card => card.deckId)).size !== 1) throw new Error("Cards must belong to one deck.");
  let cloudError: unknown;
  const deckId = cards[0].deckId;
  await hydrateLocalList<Flashcard>(flashcardCacheKey(owner, deckId));
  if (owner) {
    try {
      const client = await clientFor(owner);
      const rows = cards.map(card => ({ id: card.id, deck_id: card.deckId, user_id: owner, project_id: card.projectId, front: card.front, back: card.back, source_page: card.sourcePage, due_at: card.dueAt, interval_days: card.intervalDays, ease: card.ease, repetitions: card.repetitions, lapses: card.lapses, created_at: card.createdAt, updated_at: card.updatedAt }));
      // PostgREST executes a multi-row upsert in one database transaction, so
      // an AI preview is never partially applied to the cloud deck.
      const { error } = await client.from("flashcards").upsert(rows).abortSignal(requestTimeoutSignal(30000));
      if (error) throw error;
      const existing = localCards(owner, deckId), ids = new Set(cards.map(card => card.id));
      await persistLocalList(flashcardCacheKey(owner, deckId), [...existing.filter(card => !ids.has(card.id)), ...cards.map(card => ({ ...card, source: "cloud" as const }))].slice(0, 1000));
      return "cloud";
    } catch (error) {
      cloudError = error;
      // Preserve the complete batch locally for retry/import when cloud is unavailable.
    }
  }
  const existing = localCards(owner, deckId), ids = new Set(cards.map(card => card.id));
  return finishFlashcardFallback(await persistLocalList(flashcardCacheKey(owner, deckId), [...existing.filter(card => !ids.has(card.id)), ...cards.map(card => ({ ...card, source: "local" as const }))].slice(0, 1000)), cloudError);
}

export async function deleteFlashcard(owner: string | null, card: Flashcard): Promise<FlashcardStorage> {
  if (owner) {
    try {
      const client = await clientFor(owner);
      const { error } = await client.from("flashcards").delete().eq("user_id", owner).eq("id", card.id).abortSignal(requestTimeoutSignal(20000));
      if (error) throw error;
      await persistLocalList(flashcardCacheKey(owner, card.deckId), localCards(owner, card.deckId).filter(item => item.id !== card.id));
      return "cloud";
    } catch {
      // Keep the app usable until the flashcard migration/network is available.
    }
  }
  requirePersistentLocalList(await persistLocalList(flashcardCacheKey(owner, card.deckId), localCards(owner, card.deckId).filter(item => item.id !== card.id)));
  return "local";
}

export type StudyRepositoryResult<T> = { item: T; source: FlashcardStorage };

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
}

function studyPlanSchedule(value: unknown): StudyPlanDay[] {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && typeof item === "object" && typeof (item as any).studyDate === "string").map(item => {
    const raw = item as any;
    const tasks = Array.isArray(raw.tasks) ? raw.tasks.filter((task: any) => task && typeof task.id === "string" && typeof task.title === "string").map((task: any) => ({
      id: task.id,
      kind: (task.kind === "quiz" || task.kind === "focus" || task.kind === "custom") ? task.kind as StudyTaskKind : "flashcards" as const,
      title: task.title,
      deckIds: stringArray(task.deckIds),
      quizId: typeof task.quizId === "string" ? task.quizId : null,
      targetCount: Number.isInteger(task.targetCount) ? Math.max(1, Math.min(500, task.targetCount)) : undefined,
      minutes: Number.isInteger(task.minutes) ? Math.max(1, Math.min(240, task.minutes)) : undefined,
    })) : [];
    return { studyDate: raw.studyDate, tasks, restDay: raw.restDay === true };
  });
}

function planFromRow(row: any, source: FlashcardStorage): StudyPlan | null {
  if (!row || typeof row.id !== "string" || typeof row.name !== "string") return null;
  const sourceType: StudyPlanSourceType = row.source_type === "document" || row.source_type === "mixed" ? row.source_type : "decks";
  const status: StudyPlanStatus = row.status === "paused" ? "paused" : "active";
  const timestamp = typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString();
  const dailyTarget = Number(row.daily_target);
  const dailyMinutes = Number(row.daily_minutes);
  return {
    id: row.id,
    name: row.name,
    sourceType,
    deckIds: stringArray(row.deck_ids),
    sourceDocumentId: typeof row.source_document_id === "string" ? row.source_document_id : null,
    dailyTarget: Number.isInteger(dailyTarget) ? Math.max(1, Math.min(500, dailyTarget)) : 1,
    dailyMinutes: Number.isInteger(dailyMinutes) ? Math.max(5, Math.min(180, dailyMinutes)) : 20,
    timezone: typeof row.timezone === "string" && row.timezone ? row.timezone : "Asia/Ho_Chi_Minh",
    startDate: typeof row.start_date === "string" ? row.start_date : timestamp.slice(0, 10),
    status,
    mode: row.plan_mode === "manual" || row.plan_mode === "hybrid" ? row.plan_mode as StudyPlanMode : "ai",
    schedule: studyPlanSchedule(row.schedule),
    createdAt: typeof row.created_at === "string" ? row.created_at : timestamp,
    updatedAt: timestamp,
    source,
  };
}

function studyDayFromRow(row: any, source: FlashcardStorage): StudyDayProgress | null {
  if (!row || typeof row.study_date !== "string" || typeof row.context_key !== "string") return null;
  const targetCount = Number(row.target_count);
  const reviewedCount = Number(row.reviewed_count);
  const retryCount = Number(row.retry_count);
  const timestamp = typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString();
  const target = Number.isInteger(targetCount) ? Math.max(1, targetCount) : 1;
  const reviewed = Number.isInteger(reviewedCount) ? Math.max(0, reviewedCount) : 0;
  const planId = typeof row.plan_id === "string" ? row.plan_id : null;
  const forgottenCardIds = stringArray(row.forgotten_card_ids);
  const taskIds = stringArray(row.task_ids);
  const completedTaskIds = stringArray(row.completed_task_ids);
  const rawTaskCardIds = row.task_card_ids && typeof row.task_card_ids === "object" && !Array.isArray(row.task_card_ids) ? row.task_card_ids as Record<string, unknown> : {};
  const taskCardIds = Object.fromEntries(Object.entries(rawTaskCardIds).map(([key, value]) => [key, stringArray(value)]));
  const taskCount = Number(row.task_count);
  const completedTaskCount = Number(row.completed_task_count);
  return {
    studyDate: row.study_date,
    contextKey: row.context_key,
    planId,
    targetCount: target,
    reviewedCount: reviewed,
    retryCount: Number.isInteger(retryCount) ? Math.max(0, retryCount) : 0,
    assignedCardIds: stringArray(row.assigned_card_ids),
    reviewedCardIds: stringArray(row.reviewed_card_ids),
    forgottenCardIds,
    completed: taskIds.length || row.rest_day === true
      ? row.rest_day === true || (taskIds.every(id => completedTaskIds.includes(id)) && forgottenCardIds.length === 0)
      : row.completed === true || (reviewed >= target && (!planId || forgottenCardIds.length === 0)),
    firstReviewAt: typeof row.first_review_at === "string" ? row.first_review_at : null,
    lastReviewAt: typeof row.last_review_at === "string" ? row.last_review_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : timestamp,
    updatedAt: timestamp,
    taskIds,
    completedTaskIds,
    taskCardIds,
    taskCount: Number.isInteger(taskCount) && taskCount > 0 ? taskCount : taskIds.length || undefined,
    completedTaskCount: Number.isInteger(completedTaskCount) && completedTaskCount >= 0 ? completedTaskCount : completedTaskIds.length,
    restDay: row.rest_day === true,
    source,
  };
}

function studyDayKey(day: Pick<StudyDayProgress, "studyDate" | "contextKey">) {
  return `${day.studyDate}:${day.contextKey}`;
}

function localStudyPlans(owner: string | null) {
  return readLocalList<StudyPlan>(flashcardStudyPlanCacheKey(owner)).filter(plan => typeof plan?.id === "string" && typeof plan.name === "string");
}

function localStudyDays(owner: string | null) {
  return readLocalList<StudyDayProgress>(flashcardStudyDayCacheKey(owner)).filter(day => typeof day?.studyDate === "string" && typeof day.contextKey === "string").map(day => ({
    ...day,
    planId: typeof day.planId === "string" ? day.planId : null,
    targetCount: Number.isInteger(day.targetCount) ? Math.max(1, day.targetCount) : 1,
    reviewedCount: Number.isInteger(day.reviewedCount) ? Math.max(0, day.reviewedCount) : 0,
    retryCount: Number.isInteger(day.retryCount) ? Math.max(0, day.retryCount) : 0,
    assignedCardIds: stringArray(day.assignedCardIds),
    reviewedCardIds: stringArray(day.reviewedCardIds),
    forgottenCardIds: stringArray(day.forgottenCardIds),
    completed: isStudyDayComplete(day),
    taskIds: stringArray(day.taskIds),
    completedTaskIds: stringArray(day.completedTaskIds),
    taskCardIds: day.taskCardIds && typeof day.taskCardIds === "object" && !Array.isArray(day.taskCardIds) ? Object.fromEntries(Object.entries(day.taskCardIds).map(([key, value]) => [key, stringArray(value)])) : {},
    taskCount: Number.isInteger(day.taskCount) && (day.taskCount ?? 0) > 0 ? day.taskCount : stringArray(day.taskIds).length || undefined,
    completedTaskCount: Number.isInteger(day.completedTaskCount) && (day.completedTaskCount ?? -1) >= 0 ? day.completedTaskCount : stringArray(day.completedTaskIds).length,
    restDay: day.restDay === true,
  }));
}

function localStudyEvents(owner: string | null) {
  return readLocalList<StudyEvent>(flashcardStudyEventQueueCacheKey(owner)).filter(event => typeof event?.eventId === "string" && typeof event.studyDate === "string");
}

async function cacheStudyPlan(owner: string | null, plan: StudyPlan): Promise<boolean> {
  await hydrateLocalList<StudyPlan>(flashcardStudyPlanCacheKey(owner));
  return persistLocalList(flashcardStudyPlanCacheKey(owner), [plan, ...localStudyPlans(owner).filter(item => item.id !== plan.id)].slice(0, 20));
}

async function cacheStudyDay(owner: string | null, day: StudyDayProgress): Promise<boolean> {
  await hydrateLocalList<StudyDayProgress>(flashcardStudyDayCacheKey(owner));
  return persistLocalList(flashcardStudyDayCacheKey(owner), [day, ...localStudyDays(owner).filter(item => studyDayKey(item) !== studyDayKey(day))].slice(0, 730));
}

async function cacheStudyEvent(owner: string | null, event: StudyEvent): Promise<boolean> {
  await hydrateLocalList<StudyEvent>(flashcardStudyEventQueueCacheKey(owner));
  return persistLocalList(flashcardStudyEventQueueCacheKey(owner), [event, ...localStudyEvents(owner).filter(item => item.eventId !== event.eventId)].slice(0, 5000));
}

async function removeStudyEvent(owner: string | null, eventId: string) {
  await hydrateLocalList<StudyEvent>(flashcardStudyEventQueueCacheKey(owner));
  await persistLocalList(flashcardStudyEventQueueCacheKey(owner), localStudyEvents(owner).filter(event => event.eventId !== eventId));
}

export function readStudyPlans(owner: string | null) {
  return localStudyPlans(owner);
}

export function readStudyDays(owner: string | null) {
  return localStudyDays(owner);
}

export async function fetchStudyPlans(owner: string | null): Promise<FlashcardRepositoryResult<StudyPlan>> {
  await hydrateLocalList<StudyPlan>(flashcardStudyPlanCacheKey(owner));
  if (!owner) return { items: localStudyPlans(null), source: "local" };
  try {
    const client = await clientFor(owner);
    const { data, error } = await client.from("flashcard_study_plans").select("id,name,source_type,deck_ids,source_document_id,daily_target,daily_minutes,timezone,start_date,status,plan_mode,schedule,created_at,updated_at").eq("user_id", owner).order("updated_at", { ascending: false }).abortSignal(requestTimeoutSignal(20000));
    if (error) throw error;
    const items = (data ?? []).map(row => planFromRow(row, "cloud")).filter((item): item is StudyPlan => !!item);
    await persistLocalList(flashcardStudyPlanCacheKey(owner), items);
    return { items, source: "cloud" };
  } catch {
    return { items: localStudyPlans(owner), source: "local" };
  }
}

export async function upsertStudyPlan(owner: string | null, plan: StudyPlan): Promise<FlashcardStorage> {
  if (owner) {
    try {
      const client = await clientFor(owner);
      const { error } = await client.from("flashcard_study_plans").upsert({ id: plan.id, user_id: owner, name: plan.name, source_type: plan.sourceType, deck_ids: plan.deckIds, source_document_id: plan.sourceDocumentId, daily_target: plan.dailyTarget, daily_minutes: plan.dailyMinutes, timezone: plan.timezone, start_date: plan.startDate, status: plan.status, plan_mode: plan.mode ?? "ai", schedule: plan.schedule ?? [], created_at: plan.createdAt, updated_at: plan.updatedAt }).abortSignal(requestTimeoutSignal(20000));
      if (error) throw error;
      await cacheStudyPlan(owner, { ...plan, source: "cloud" });
      return "cloud";
    } catch {
      // The migration may be applied after the UI is deployed. Keep plan setup
      // usable locally until the cloud table becomes available.
    }
  }
  requirePersistentLocalList(await cacheStudyPlan(owner, { ...plan, source: "local" }));
  return "local";
}

export async function fetchStudyDays(owner: string | null): Promise<FlashcardRepositoryResult<StudyDayProgress>> {
  await hydrateLocalList<StudyDayProgress>(flashcardStudyDayCacheKey(owner));
  await hydrateLocalList<StudyEvent>(flashcardStudyEventQueueCacheKey(owner));
  if (!owner) return { items: localStudyDays(null), source: "local" };
  await flushStudyEvents(owner);
  try {
    const client = await clientFor(owner);
    const { data, error } = await client.from("flashcard_study_days").select("study_date,context_key,plan_id,target_count,reviewed_count,retry_count,assigned_card_ids,reviewed_card_ids,forgotten_card_ids,completed,task_ids,completed_task_ids,task_card_ids,task_count,completed_task_count,rest_day,first_review_at,last_review_at,created_at,updated_at").eq("user_id", owner).order("study_date", { ascending: false }).limit(730).abortSignal(requestTimeoutSignal(20000));
    if (error) throw error;
    const remote = (data ?? []).map(row => studyDayFromRow(row, "cloud")).filter((item): item is StudyDayProgress => !!item);
    const merged = new Map(remote.map(day => [studyDayKey(day), day]));
    for (const day of localStudyDays(owner)) {
      const previous = merged.get(studyDayKey(day));
      if (!previous || day.updatedAt >= previous.updatedAt) merged.set(studyDayKey(day), day);
    }
    const items = [...merged.values()].sort((a, b) => b.studyDate.localeCompare(a.studyDate) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 730);
    await persistLocalList(flashcardStudyDayCacheKey(owner), items);
    return { items, source: "cloud" };
  } catch {
    return { items: localStudyDays(owner), source: "local" };
  }
}

export async function upsertStudyDay(owner: string | null, day: StudyDayProgress): Promise<StudyRepositoryResult<StudyDayProgress>> {
  if (owner) {
    try {
      const client = await clientFor(owner);
      const row = { user_id: owner, study_date: day.studyDate, context_key: day.contextKey, plan_id: day.planId, target_count: day.targetCount, reviewed_count: day.reviewedCount, retry_count: day.retryCount, assigned_card_ids: day.assignedCardIds, reviewed_card_ids: day.reviewedCardIds, forgotten_card_ids: day.forgottenCardIds, completed: day.completed, task_ids: day.taskIds ?? [], completed_task_ids: day.completedTaskIds ?? [], task_card_ids: day.taskCardIds ?? {}, task_count: day.taskCount ?? day.taskIds?.length ?? 0, completed_task_count: day.completedTaskCount ?? day.completedTaskIds?.length ?? 0, rest_day: day.restDay ?? false, first_review_at: day.firstReviewAt, last_review_at: day.lastReviewAt, created_at: day.createdAt, updated_at: day.updatedAt };
      const select = "study_date,context_key,plan_id,target_count,reviewed_count,retry_count,assigned_card_ids,reviewed_card_ids,forgotten_card_ids,completed,task_ids,completed_task_ids,task_card_ids,task_count,completed_task_count,rest_day,first_review_at,last_review_at,created_at,updated_at";
      let result: any = await client.from("flashcard_study_days").insert(row).select(select).abortSignal(requestTimeoutSignal(20000)).single();
      if (result.error?.code === "23505") {
        result = await client.from("flashcard_study_days").select(select).eq("user_id", owner).eq("study_date", day.studyDate).eq("context_key", day.contextKey).abortSignal(requestTimeoutSignal(20000)).single();
      }
      const { data, error } = result;
      if (error) throw error;
      const saved = studyDayFromRow(data, "cloud");
      if (!saved) throw new Error("Invalid study day returned by Supabase.");
      await cacheStudyDay(owner, saved);
      return { item: saved, source: "cloud" };
    } catch {
      // Fall through to the offline copy when the V4.2 migration is not live.
    }
  }
  const saved = { ...day, source: "local" as const };
  requirePersistentLocalList(await cacheStudyDay(owner, saved));
  return { item: saved, source: "local" };
}

/** Explicit day edits (manual task completion) may overwrite an existing row. */
export async function saveStudyDay(owner: string | null, day: StudyDayProgress): Promise<StudyRepositoryResult<StudyDayProgress>> {
  if (owner) {
    try {
      const client = await clientFor(owner);
      const row = { user_id: owner, study_date: day.studyDate, context_key: day.contextKey, plan_id: day.planId, target_count: day.targetCount, reviewed_count: day.reviewedCount, retry_count: day.retryCount, assigned_card_ids: day.assignedCardIds, reviewed_card_ids: day.reviewedCardIds, forgotten_card_ids: day.forgottenCardIds, completed: day.completed, task_ids: day.taskIds ?? [], completed_task_ids: day.completedTaskIds ?? [], task_card_ids: day.taskCardIds ?? {}, task_count: day.taskCount ?? day.taskIds?.length ?? 0, completed_task_count: day.completedTaskCount ?? day.completedTaskIds?.length ?? 0, rest_day: day.restDay ?? false, first_review_at: day.firstReviewAt, last_review_at: day.lastReviewAt, created_at: day.createdAt, updated_at: day.updatedAt };
      const select = "study_date,context_key,plan_id,target_count,reviewed_count,retry_count,assigned_card_ids,reviewed_card_ids,forgotten_card_ids,completed,task_ids,completed_task_ids,task_card_ids,task_count,completed_task_count,rest_day,first_review_at,last_review_at,created_at,updated_at";
      const { data, error } = await client.from("flashcard_study_days").upsert(row, { onConflict: "user_id,study_date,context_key" }).select(select).abortSignal(requestTimeoutSignal(20000)).single();
      if (error) throw error;
      const saved = studyDayFromRow(data, "cloud");
      if (!saved) throw new Error("Invalid study day returned by Supabase.");
      await cacheStudyDay(owner, saved);
      return { item: saved, source: "cloud" };
    } catch {
      // Fall through to the local copy until the V4.3 migration is live.
    }
  }
  const saved = { ...day, source: "local" as const };
  requirePersistentLocalList(await cacheStudyDay(owner, saved));
  return { item: saved, source: "local" };
}

async function localApplyStudyEvent(owner: string | null, event: StudyEvent, queueForCloud: boolean) {
  await hydrateLocalList<StudyDayProgress>(flashcardStudyDayCacheKey(owner));
  await hydrateLocalList<StudyEvent>(flashcardStudyEventQueueCacheKey(owner));
  const existingEvent = localStudyEvents(owner).find(item => item.eventId === event.eventId);
  const current: StudyDayProgress = localStudyDays(owner).find(day => studyDayKey(day) === studyDayKey(event)) ?? {
    studyDate: event.studyDate,
    contextKey: event.contextKey,
    planId: event.planId,
    targetCount: Math.max(1, event.targetCount),
    reviewedCount: 0,
    retryCount: 0,
    assignedCardIds: [],
    reviewedCardIds: [],
    forgottenCardIds: [],
    completed: false,
    firstReviewAt: null,
    lastReviewAt: null,
    createdAt: event.createdAt ?? new Date().toISOString(),
    updatedAt: event.createdAt ?? new Date().toISOString(),
  } satisfies StudyDayProgress;
  if (existingEvent) return current;
  const timestamp = event.createdAt ?? new Date().toISOString();
  const alreadyCounted = !!event.cardId && current.reviewedCardIds.includes(event.cardId);
  const increment = alreadyCounted ? 0 : event.goalUnit;
  const reviewedCardIds = event.cardId && increment > 0 && !alreadyCounted ? [...current.reviewedCardIds, event.cardId] : current.reviewedCardIds;
  const forgottenCardIds = event.cardId
    ? event.rating === "again"
      ? [...new Set([...current.forgottenCardIds, event.cardId])]
      : current.forgottenCardIds.filter(id => id !== event.cardId)
    : current.forgottenCardIds;
  const targetCount = Math.max(1, current.targetCount, event.targetCount);
  const base: StudyDayProgress = {
    ...current,
    planId: current.planId ?? event.planId,
    targetCount,
    reviewedCount: current.reviewedCount + increment,
    retryCount: current.retryCount + (event.rating === "again" ? 1 : 0),
    reviewedCardIds,
    completed: current.completed || (current.reviewedCount + increment >= targetCount && (event.planId ? forgottenCardIds.length === 0 : true)),
    forgottenCardIds,
    firstReviewAt: current.firstReviewAt ?? timestamp,
    lastReviewAt: timestamp,
    updatedAt: timestamp,
  };
  const saved: StudyDayProgress = { ...applyStudyEventToTasks(base, event), source: "local" };
  requirePersistentLocalList(await cacheStudyDay(owner, saved));
  if (queueForCloud) requirePersistentLocalList(await cacheStudyEvent(owner, event));
  return saved;
}

async function recordCloudStudyEvent(owner: string, event: StudyEvent) {
  const client = await clientFor(owner);
  const { data, error } = await client.rpc("record_flashcard_study_event", {
    p_event_id: event.eventId,
    p_user_id: owner,
    p_study_date: event.studyDate,
    p_context_key: event.contextKey,
    p_plan_id: event.planId,
    p_card_id: event.cardId,
    p_rating: event.rating,
    p_goal_unit: event.goalUnit,
    p_target_count: event.targetCount,
  }).abortSignal(requestTimeoutSignal(20000));
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const saved = studyDayFromRow(row, "cloud");
  if (!saved) throw new Error("Invalid study event returned by Supabase.");
  await cacheStudyDay(owner, saved);
  await cacheStudyEvent(owner, event);
  await removeStudyEvent(owner, event.eventId);
  return saved;
}

async function flushStudyEvents(owner: string) {
  for (const event of localStudyEvents(owner)) {
    try {
      await recordCloudStudyEvent(owner, event);
    } catch {
      break;
    }
  }
}

export async function recordFlashcardStudy(owner: string | null, event: StudyEvent): Promise<StudyRepositoryResult<StudyDayProgress>> {
  if (owner) {
    await flushStudyEvents(owner);
    try {
      const saved = await recordCloudStudyEvent(owner, event);
      return { item: saved, source: "cloud" };
    } catch {
      const saved = await localApplyStudyEvent(owner, event, true);
      return { item: saved, source: "local" };
    }
  }
  return { item: await localApplyStudyEvent(null, event, false), source: "local" };
}

// A rejected save must not poison subsequent saves. Requests for the same
// project remain ordered, while different projects can progress independently
// so one stalled cloud request cannot freeze a newly opened canvas.
export class SaveQueue {
  private tails = new Map<string, Promise<unknown>>();
  run<T>(task: () => Promise<T>, key = "__default__"): Promise<T> {
    const tail = this.tails.get(key) ?? Promise.resolve();
    const result = tail.then(task, task);
    this.tails.set(key, result.catch(() => undefined));
    return result;
  }
}
