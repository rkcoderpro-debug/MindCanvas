import type { BoardState } from "@mindcanvas/shared";
import { getCurrentSession, supabase } from "./supabase";
import { parseBoard } from "./board";
import { applyStudyEventToTasks, isStudyDayComplete, type Flashcard, type FlashcardDeck, type FlashcardStorage, type StudyDayProgress, type StudyEvent, type StudyPlan, type StudyPlanDay, type StudyPlanMode, type StudyPlanSourceType, type StudyPlanStatus, type StudyTaskKind } from "./flashcards";
import { readOfflineProjectCache, writeOfflineProjectCache } from "./offlineProjectCache";

export type Project = { id: string; title: string; folderId: string | null; updatedAt: string; board?: BoardState; pending?: boolean; favorite?: boolean; deletedAt?: string | null; revision?: number; ownerId?: string; accessRole?: "owner" | "editor" | "viewer"; shared?: boolean };
export type ProjectFolder = { id: string; name: string };
export type CachedProject = Project & { board: BoardState; pending: boolean };
export class ProjectConflictError extends Error {
  code = "PROJECT_CONFLICT";
  constructor(public projectId?: string) {
    super("Cloud project changed in another tab or device. Keep the local copy and choose a recovery action.");
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
const ownerCacheId = (owner: string | null) => owner ?? "guest";
function parseProjectCache(value: unknown): CachedProject[] {
  if (!Array.isArray(value)) throw new Error("Invalid local cache; export your browser data before clearing it.");
  return value.map(item => {
    if (!item || typeof item !== "object") throw new Error("Invalid local project cache.");
    const project = item as Partial<CachedProject>;
    if (typeof project.id !== "string" || typeof project.title !== "string" || typeof project.updatedAt !== "string" || !project.board) throw new Error("Invalid local project cache.");
    return { ...project, folderId: typeof project.folderId === "string" ? project.folderId : null, pending: !!project.pending, board: parseBoard(project.board) } as CachedProject;
  });
}
function writeProjectCache(owner: string | null, projects: CachedProject[]) {
  const key = cacheKey(owner), normalized = projects.map(project => ({ ...project, board: parseBoard(project.board) }));
  memoryCaches.set(key, normalized);
  try {
    localStorage.setItem(key, JSON.stringify(normalized));
    memoryOnlyCaches.delete(key);
  } catch {
    // Keep the current session usable when a large canvas exceeds the
    // localStorage quota. IndexedDB remains the durable fallback.
    memoryOnlyCaches.add(key);
  }
  void writeOfflineProjectCache(ownerCacheId(owner), normalized).catch(() => undefined);
}
export function readCache(owner: string | null): CachedProject[] {
  const key = cacheKey(owner);
  const raw = localStorage.getItem(key);
  if (raw) {
    const parsed = parseProjectCache(JSON.parse(raw));
    memoryCaches.set(key, parsed);
    return parsed;
  }
  // A memory-only copy is intentional only after localStorage rejected a
  // write. Otherwise an empty localStorage (for example after sign-out or a
  // test reset) must not resurrect stale data from module memory.
  const memory = memoryCaches.get(key);
  if (memoryOnlyCaches.has(key) && memory) return memory;
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
  const local = readCache(owner);
  try {
    const stored = await readOfflineProjectCache(id);
    if (stored) {
      const indexed = parseProjectCache(stored), merged = new Map(indexed.map(project => [project.id, project]));
      for (const project of local) {
        const previous = merged.get(project.id);
        if (!previous || project.pending || project.updatedAt >= previous.updatedAt) merged.set(project.id, project);
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
export function acknowledge(owner: string, snapshot: CachedProject, revision = snapshot.revision) {
  const entries = readCache(owner);
  writeProjectCache(owner, entries.map(p => {
    if (p.id !== snapshot.id) return p;
    const exactSnapshot = JSON.stringify(p.board) === JSON.stringify(snapshot.board) && p.folderId === snapshot.folderId;
    if (exactSnapshot) return { ...p, pending: false, revision };
    // An edit may arrive while this snapshot is in flight. It is still based on
    // the revision that just saved, so advance its base without marking it clean.
    return p.revision === snapshot.revision ? { ...p, revision } : p;
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
    const { data, error } = await client.from("note_versions").select("id,note_id,version,label,content,created_at").eq("user_id", owner).eq("note_id", projectId).order("version", { ascending: false }).limit(MAX_PROJECT_VERSIONS).abortSignal(AbortSignal.timeout(20000));
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
    const latest = await client.from("note_versions").select("version").eq("user_id", owner).eq("note_id", board.id).order("version", { ascending: false }).limit(1).abortSignal(AbortSignal.timeout(20000)).maybeSingle();
    if (latest.error) throw latest.error;
    const version = Math.max(Number(latest.data?.version ?? 0), local[0]?.version ?? 0) + 1;
    const row = { id: crypto.randomUUID(), note_id: board.id, user_id: owner, version, label: label ?? null, content: { type: "mindcanvas-board", version: 1, board }, created_at: new Date().toISOString() };
    const result = await client.from("note_versions").insert(row).select("id,note_id,version,label,content,created_at").abortSignal(AbortSignal.timeout(20000)).single();
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
    if (p.pending) result.set(p.id, p);
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
  let result: any = await client.from("notes").select("id,user_id,title,folder_id,updated_at,is_favorite,deleted_at,revision").order("updated_at", { ascending: false }).abortSignal(AbortSignal.timeout(20000));
  if (result.error && /revision|column/i.test(result.error.message)) result = await client.from("notes").select("id,title,folder_id,updated_at,is_favorite,deleted_at").eq("user_id", owner).order("updated_at", { ascending: false }).abortSignal(AbortSignal.timeout(20000));
  if (result.error) throw result.error;
  const data = result.data as any[] | null;
  let memberships: Record<string, "editor" | "viewer"> = {};
  try {
    const memberResult = await client.from("project_members").select("project_id,role").eq("user_id", owner);
    if (!memberResult.error) memberships = Object.fromEntries((memberResult.data ?? []).map((row: any) => [String(row.project_id), row.role === "editor" ? "editor" : "viewer"]));
  } catch { /* V4.4 migration may not be applied yet; owner projects still load. */ }
  return (data ?? []).map(p => {
    const ownerId = typeof p.user_id === "string" ? p.user_id : owner;
    return { id: p.id, title: p.title, folderId: p.folder_id, updatedAt: p.updated_at, favorite: p.is_favorite, deletedAt: p.deleted_at, revision: typeof p.revision === "number" ? p.revision : undefined,
      ownerId, accessRole: ownerId === owner ? "owner" : memberships[p.id] ?? "viewer", shared: ownerId !== owner };
  });
}
export async function fetchProjectSnapshot(owner: string, id: string): Promise<CachedProject> {
  const client = await clientFor(owner);
  let result: any = await client.from("notes").select("id,user_id,title,folder_id,updated_at,is_favorite,deleted_at,revision,content").eq("id", id).abortSignal(AbortSignal.timeout(20000)).single();
  if (result.error && /revision|column/i.test(result.error.message)) {
    result = await client.from("notes").select("id,title,folder_id,updated_at,is_favorite,deleted_at,content").eq("user_id", owner).eq("id", id).abortSignal(AbortSignal.timeout(20000)).single();
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
  return { id: String(data.id), title: String(data.title), folderId: data.folder_id ?? null, updatedAt: String(data.updated_at ?? board.updatedAt),
    favorite: !!data.is_favorite, deletedAt: data.deleted_at ?? null, revision: typeof data.revision === "number" ? data.revision : undefined, ownerId, accessRole, shared: ownerId !== owner, board, pending: false };
}

export async function fetchBoard(owner: string, id: string): Promise<BoardState> {
  return (await fetchProjectSnapshot(owner, id)).board;
}
export async function persistProject(owner: string, project: CachedProject): Promise<{ revision?: number }> {
  if (project.accessRole === "viewer") throw new Error("Bạn chỉ có quyền xem project này.");
  // An existing shared draft without a base revision must be reconciled,
  // never inserted under the collaborator's identity.
  if (project.revision === undefined && (project.shared || (project.ownerId && project.ownerId !== owner))) {
    throw new ProjectConflictError(project.id);
  }
  const client = await clientFor(owner);
  const payload = { id: project.id, folder_id: project.folderId, title: project.board.title, content: { type: "mindcanvas-board", version: 1, board: project.board }, updated_at: project.board.updatedAt };
  if (project.revision === undefined) {
    // A newly created canvas must go through INSERT, not UPSERT.  UPSERT is
    // an INSERT ... ON CONFLICT UPDATE and can unexpectedly require the
    // editor/update policy (or attempt to change ownership) even for a fresh
    // local UUID.  Existing legacy rows are handled only after a duplicate
    // key response below.
    const modern = await client.from("notes").insert({ ...payload, user_id: owner, revision: 0 }).select("revision").abortSignal(AbortSignal.timeout(20000)).maybeSingle();
    if (!modern.error) return { revision: Number(modern.data?.revision ?? 0) };
    const modernMessage = String(modern.error.message ?? "");
    const modernCode = String((modern.error as { code?: unknown }).code ?? "");
    const duplicate = modernCode === "23505" || /duplicate key|already exists/i.test(modernMessage);
    if (!duplicate && !/revision|column/i.test(modernMessage)) throw modern.error;

    // A pre-revision database can still accept a brand-new note.  Do not
    // retry a 42501/RLS failure with a broader write; surface that exact
    // problem so the UI can point to the Supabase project/session mismatch.
    if (!duplicate && /revision|column/i.test(modernMessage)) {
      const legacy = await client.from("notes").insert({ ...payload, user_id: owner }).abortSignal(AbortSignal.timeout(20000));
      if (!legacy.error) return {};
      const legacyMessage = String(legacy.error.message ?? "");
      const legacyCode = String((legacy.error as { code?: unknown }).code ?? "");
      if (!(legacyCode === "23505" || /duplicate key|already exists/i.test(legacyMessage))) throw legacy.error;
    }

    // A duplicate proves this is not a new canvas. Without a base revision
    // an automatic update would silently overwrite another device's edits.
    throw new ProjectConflictError(project.id);
  }
  const nextRevision = project.revision + 1;
  const result = await client.from("notes").update({ ...payload, revision: nextRevision }).eq("id", project.id).eq("revision", project.revision).select("revision").abortSignal(AbortSignal.timeout(20000)).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new ProjectConflictError(project.id);
  return { revision: Number(result.data.revision ?? nextRevision) };
}
export async function fetchFolders(owner: string | null): Promise<ProjectFolder[]> {
  if (!owner) return JSON.parse(localStorage.getItem(cacheKey(null) + ":folders") ?? "[]");
  const client = await clientFor(owner);
  const { data, error } = await client.from("folders").select("id,name").eq("user_id", owner).order("created_at").abortSignal(AbortSignal.timeout(20000));
  if (error) throw error;
  return data ?? [];
}
export type ProjectPatch = { favorite?: boolean; deletedAt?: string | null; title?: string; folderId?: string | null };
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
    const { error } = await metadataQuery.select("id").abortSignal(AbortSignal.timeout(20000)).single();
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
  const { error } = await client.from("folders").insert({ ...folder, user_id: owner }).abortSignal(AbortSignal.timeout(20000));
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

function readLocalList<T>(key: string): T[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLocalList<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value));
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

function cacheDeck(owner: string | null, deck: FlashcardDeck) {
  const items = localDecks(owner).filter(item => item.id !== deck.id);
  writeLocalList(flashcardDeckCacheKey(owner), [{ ...deck }, ...items].slice(0, 200));
}

function cacheCard(owner: string | null, card: Flashcard) {
  const items = localCards(owner, card.deckId).filter(item => item.id !== card.id);
  writeLocalList(flashcardCacheKey(owner, card.deckId), [{ ...card }, ...items].slice(0, 1000));
}

export function readFlashcardDecks(owner: string | null) {
  return localDecks(owner);
}

export function readFlashcards(owner: string | null, deckId: string) {
  return localCards(owner, deckId);
}

export async function fetchFlashcardDecks(owner: string | null): Promise<FlashcardRepositoryResult<FlashcardDeck>> {
  if (!owner) return { items: localDecks(null), source: "local" };
  try {
    const client = await clientFor(owner);
    const { data, error } = await client.from("flashcard_decks").select("id,name,project_id,folder_id,created_at,updated_at").eq("user_id", owner).order("updated_at", { ascending: false }).abortSignal(AbortSignal.timeout(20000));
    if (error) throw error;
    const items = (data ?? []).map(row => deckFromRow(row, "cloud")).filter((item): item is FlashcardDeck => !!item);
    writeLocalList(flashcardDeckCacheKey(owner), items);
    return { items, source: "cloud" };
  } catch {
    return { items: localDecks(owner), source: "local" };
  }
}

export async function fetchFlashcards(owner: string | null, deckId: string): Promise<FlashcardRepositoryResult<Flashcard>> {
  if (!owner) return { items: localCards(null, deckId), source: "local" };
  try {
    const client = await clientFor(owner);
    const { data, error } = await client.from("flashcards").select("id,deck_id,project_id,front,back,source_page,due_at,interval_days,ease,repetitions,lapses,created_at,updated_at").eq("user_id", owner).eq("deck_id", deckId).order("created_at", { ascending: true }).abortSignal(AbortSignal.timeout(20000));
    if (error) throw error;
    const items = (data ?? []).map(row => cardFromRow(row, "cloud")).filter((item): item is Flashcard => !!item);
    writeLocalList(flashcardCacheKey(owner, deckId), items);
    return { items, source: "cloud" };
  } catch {
    return { items: localCards(owner, deckId), source: "local" };
  }
}

export async function upsertFlashcardDeck(owner: string | null, deck: FlashcardDeck): Promise<FlashcardStorage> {
  if (owner) {
    try {
      const client = await clientFor(owner);
      const { error } = await client.from("flashcard_decks").upsert({ id: deck.id, user_id: owner, name: deck.name, project_id: deck.projectId, folder_id: deck.folderId, created_at: deck.createdAt, updated_at: deck.updatedAt }).abortSignal(AbortSignal.timeout(20000));
      if (error) throw error;
      cacheDeck(owner, { ...deck, source: "cloud" });
      return "cloud";
    } catch {
      // A missing migration or unavailable network keeps the edit usable locally.
    }
  }
  cacheDeck(owner, { ...deck, source: "local" });
  return "local";
}

export async function deleteFlashcardDeck(owner: string | null, deckId: string): Promise<FlashcardStorage> {
  if (owner) {
    try {
      const client = await clientFor(owner);
      const { error } = await client.from("flashcard_decks").delete().eq("user_id", owner).eq("id", deckId).abortSignal(AbortSignal.timeout(20000));
      if (error) throw error;
      writeLocalList(flashcardDeckCacheKey(owner), localDecks(owner).filter(deck => deck.id !== deckId));
      localStorage.removeItem(flashcardCacheKey(owner, deckId));
      return "cloud";
    } catch {
      // Keep the app usable until the flashcard migration/network is available.
    }
  }
  writeLocalList(flashcardDeckCacheKey(owner), localDecks(owner).filter(deck => deck.id !== deckId));
  localStorage.removeItem(flashcardCacheKey(owner, deckId));
  return "local";
}

export async function upsertFlashcard(owner: string | null, card: Flashcard): Promise<FlashcardStorage> {
  if (owner) {
    try {
      const client = await clientFor(owner);
      const { error } = await client.from("flashcards").upsert({ id: card.id, deck_id: card.deckId, user_id: owner, project_id: card.projectId, front: card.front, back: card.back, source_page: card.sourcePage, due_at: card.dueAt, interval_days: card.intervalDays, ease: card.ease, repetitions: card.repetitions, lapses: card.lapses, created_at: card.createdAt, updated_at: card.updatedAt }).abortSignal(AbortSignal.timeout(20000));
      if (error) throw error;
      cacheCard(owner, { ...card, source: "cloud" });
      return "cloud";
    } catch {
      // A missing migration or unavailable network keeps the edit usable locally.
    }
  }
  cacheCard(owner, { ...card, source: "local" });
  return "local";
}

export async function upsertFlashcards(owner: string | null, cards: Flashcard[]): Promise<FlashcardStorage> {
  if (!cards.length) return owner ? "cloud" : "local";
  if (new Set(cards.map(card => card.deckId)).size !== 1) throw new Error("Cards must belong to one deck.");
  if (owner) {
    try {
      const client = await clientFor(owner);
      const rows = cards.map(card => ({ id: card.id, deck_id: card.deckId, user_id: owner, project_id: card.projectId, front: card.front, back: card.back, source_page: card.sourcePage, due_at: card.dueAt, interval_days: card.intervalDays, ease: card.ease, repetitions: card.repetitions, lapses: card.lapses, created_at: card.createdAt, updated_at: card.updatedAt }));
      // PostgREST executes a multi-row upsert in one database transaction, so
      // an AI preview is never partially applied to the cloud deck.
      const { error } = await client.from("flashcards").upsert(rows).abortSignal(AbortSignal.timeout(30000));
      if (error) throw error;
      const deckId = cards[0].deckId, existing = localCards(owner, deckId), ids = new Set(cards.map(card => card.id));
      writeLocalList(flashcardCacheKey(owner, deckId), [...existing.filter(card => !ids.has(card.id)), ...cards.map(card => ({ ...card, source: "cloud" as const }))].slice(0, 1000));
      return "cloud";
    } catch {
      // Preserve the complete batch locally for retry/import when cloud is unavailable.
    }
  }
  const deckId = cards[0].deckId, existing = localCards(owner, deckId), ids = new Set(cards.map(card => card.id));
  writeLocalList(flashcardCacheKey(owner, deckId), [...existing.filter(card => !ids.has(card.id)), ...cards.map(card => ({ ...card, source: "local" as const }))].slice(0, 1000));
  return "local";
}

export async function deleteFlashcard(owner: string | null, card: Flashcard): Promise<FlashcardStorage> {
  if (owner) {
    try {
      const client = await clientFor(owner);
      const { error } = await client.from("flashcards").delete().eq("user_id", owner).eq("id", card.id).abortSignal(AbortSignal.timeout(20000));
      if (error) throw error;
      writeLocalList(flashcardCacheKey(owner, card.deckId), localCards(owner, card.deckId).filter(item => item.id !== card.id));
      return "cloud";
    } catch {
      // Keep the app usable until the flashcard migration/network is available.
    }
  }
  writeLocalList(flashcardCacheKey(owner, card.deckId), localCards(owner, card.deckId).filter(item => item.id !== card.id));
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

function cacheStudyPlan(owner: string | null, plan: StudyPlan) {
  writeLocalList(flashcardStudyPlanCacheKey(owner), [plan, ...localStudyPlans(owner).filter(item => item.id !== plan.id)].slice(0, 20));
}

function cacheStudyDay(owner: string | null, day: StudyDayProgress) {
  writeLocalList(flashcardStudyDayCacheKey(owner), [day, ...localStudyDays(owner).filter(item => studyDayKey(item) !== studyDayKey(day))].slice(0, 730));
}

function cacheStudyEvent(owner: string | null, event: StudyEvent) {
  writeLocalList(flashcardStudyEventQueueCacheKey(owner), [event, ...localStudyEvents(owner).filter(item => item.eventId !== event.eventId)].slice(0, 5000));
}

function removeStudyEvent(owner: string | null, eventId: string) {
  writeLocalList(flashcardStudyEventQueueCacheKey(owner), localStudyEvents(owner).filter(event => event.eventId !== eventId));
}

export function readStudyPlans(owner: string | null) {
  return localStudyPlans(owner);
}

export function readStudyDays(owner: string | null) {
  return localStudyDays(owner);
}

export async function fetchStudyPlans(owner: string | null): Promise<FlashcardRepositoryResult<StudyPlan>> {
  if (!owner) return { items: localStudyPlans(null), source: "local" };
  try {
    const client = await clientFor(owner);
    const { data, error } = await client.from("flashcard_study_plans").select("id,name,source_type,deck_ids,source_document_id,daily_target,daily_minutes,timezone,start_date,status,plan_mode,schedule,created_at,updated_at").eq("user_id", owner).order("updated_at", { ascending: false }).abortSignal(AbortSignal.timeout(20000));
    if (error) throw error;
    const items = (data ?? []).map(row => planFromRow(row, "cloud")).filter((item): item is StudyPlan => !!item);
    writeLocalList(flashcardStudyPlanCacheKey(owner), items);
    return { items, source: "cloud" };
  } catch {
    return { items: localStudyPlans(owner), source: "local" };
  }
}

export async function upsertStudyPlan(owner: string | null, plan: StudyPlan): Promise<FlashcardStorage> {
  if (owner) {
    try {
      const client = await clientFor(owner);
      const { error } = await client.from("flashcard_study_plans").upsert({ id: plan.id, user_id: owner, name: plan.name, source_type: plan.sourceType, deck_ids: plan.deckIds, source_document_id: plan.sourceDocumentId, daily_target: plan.dailyTarget, daily_minutes: plan.dailyMinutes, timezone: plan.timezone, start_date: plan.startDate, status: plan.status, plan_mode: plan.mode ?? "ai", schedule: plan.schedule ?? [], created_at: plan.createdAt, updated_at: plan.updatedAt }).abortSignal(AbortSignal.timeout(20000));
      if (error) throw error;
      cacheStudyPlan(owner, { ...plan, source: "cloud" });
      return "cloud";
    } catch {
      // The migration may be applied after the UI is deployed. Keep plan setup
      // usable locally until the cloud table becomes available.
    }
  }
  cacheStudyPlan(owner, { ...plan, source: "local" });
  return "local";
}

export async function fetchStudyDays(owner: string | null): Promise<FlashcardRepositoryResult<StudyDayProgress>> {
  if (!owner) return { items: localStudyDays(null), source: "local" };
  await flushStudyEvents(owner);
  try {
    const client = await clientFor(owner);
    const { data, error } = await client.from("flashcard_study_days").select("study_date,context_key,plan_id,target_count,reviewed_count,retry_count,assigned_card_ids,reviewed_card_ids,forgotten_card_ids,completed,task_ids,completed_task_ids,task_card_ids,task_count,completed_task_count,rest_day,first_review_at,last_review_at,created_at,updated_at").eq("user_id", owner).order("study_date", { ascending: false }).limit(730).abortSignal(AbortSignal.timeout(20000));
    if (error) throw error;
    const remote = (data ?? []).map(row => studyDayFromRow(row, "cloud")).filter((item): item is StudyDayProgress => !!item);
    const merged = new Map(remote.map(day => [studyDayKey(day), day]));
    for (const day of localStudyDays(owner)) {
      const previous = merged.get(studyDayKey(day));
      if (!previous || day.updatedAt >= previous.updatedAt) merged.set(studyDayKey(day), day);
    }
    const items = [...merged.values()].sort((a, b) => b.studyDate.localeCompare(a.studyDate) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 730);
    writeLocalList(flashcardStudyDayCacheKey(owner), items);
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
      let result: any = await client.from("flashcard_study_days").insert(row).select(select).abortSignal(AbortSignal.timeout(20000)).single();
      if (result.error?.code === "23505") {
        result = await client.from("flashcard_study_days").select(select).eq("user_id", owner).eq("study_date", day.studyDate).eq("context_key", day.contextKey).abortSignal(AbortSignal.timeout(20000)).single();
      }
      const { data, error } = result;
      if (error) throw error;
      const saved = studyDayFromRow(data, "cloud");
      if (!saved) throw new Error("Invalid study day returned by Supabase.");
      cacheStudyDay(owner, saved);
      return { item: saved, source: "cloud" };
    } catch {
      // Fall through to the offline copy when the V4.2 migration is not live.
    }
  }
  const saved = { ...day, source: "local" as const };
  cacheStudyDay(owner, saved);
  return { item: saved, source: "local" };
}

/** Explicit day edits (manual task completion) may overwrite an existing row. */
export async function saveStudyDay(owner: string | null, day: StudyDayProgress): Promise<StudyRepositoryResult<StudyDayProgress>> {
  if (owner) {
    try {
      const client = await clientFor(owner);
      const row = { user_id: owner, study_date: day.studyDate, context_key: day.contextKey, plan_id: day.planId, target_count: day.targetCount, reviewed_count: day.reviewedCount, retry_count: day.retryCount, assigned_card_ids: day.assignedCardIds, reviewed_card_ids: day.reviewedCardIds, forgotten_card_ids: day.forgottenCardIds, completed: day.completed, task_ids: day.taskIds ?? [], completed_task_ids: day.completedTaskIds ?? [], task_card_ids: day.taskCardIds ?? {}, task_count: day.taskCount ?? day.taskIds?.length ?? 0, completed_task_count: day.completedTaskCount ?? day.completedTaskIds?.length ?? 0, rest_day: day.restDay ?? false, first_review_at: day.firstReviewAt, last_review_at: day.lastReviewAt, created_at: day.createdAt, updated_at: day.updatedAt };
      const select = "study_date,context_key,plan_id,target_count,reviewed_count,retry_count,assigned_card_ids,reviewed_card_ids,forgotten_card_ids,completed,task_ids,completed_task_ids,task_card_ids,task_count,completed_task_count,rest_day,first_review_at,last_review_at,created_at,updated_at";
      const { data, error } = await client.from("flashcard_study_days").upsert(row, { onConflict: "user_id,study_date,context_key" }).select(select).abortSignal(AbortSignal.timeout(20000)).single();
      if (error) throw error;
      const saved = studyDayFromRow(data, "cloud");
      if (!saved) throw new Error("Invalid study day returned by Supabase.");
      cacheStudyDay(owner, saved);
      return { item: saved, source: "cloud" };
    } catch {
      // Fall through to the local copy until the V4.3 migration is live.
    }
  }
  const saved = { ...day, source: "local" as const };
  cacheStudyDay(owner, saved);
  return { item: saved, source: "local" };
}

function localApplyStudyEvent(owner: string | null, event: StudyEvent, queueForCloud: boolean) {
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
  cacheStudyDay(owner, saved);
  cacheStudyEvent(owner, event);
  if (!queueForCloud) removeStudyEvent(owner, event.eventId);
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
  }).abortSignal(AbortSignal.timeout(20000));
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const saved = studyDayFromRow(row, "cloud");
  if (!saved) throw new Error("Invalid study event returned by Supabase.");
  cacheStudyDay(owner, saved);
  cacheStudyEvent(owner, event);
  removeStudyEvent(owner, event.eventId);
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
      const saved = localApplyStudyEvent(owner, event, true);
      return { item: saved, source: "local" };
    }
  }
  return { item: localApplyStudyEvent(null, event, false), source: "local" };
}

// A rejected save must not poison subsequent saves. Requests remain ordered.
export class SaveQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
