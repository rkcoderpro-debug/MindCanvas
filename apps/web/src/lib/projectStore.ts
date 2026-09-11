import type { BoardState } from "@mindcanvas/shared";
import { getCurrentSession, supabase } from "./supabase";
import { parseBoard } from "./board";
import type { Flashcard, FlashcardDeck, FlashcardStorage } from "./flashcards";

export type Project = { id: string; title: string; folderId: string | null; updatedAt: string; board?: BoardState; pending?: boolean; favorite?: boolean; deletedAt?: string | null; revision?: number };
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
export function readCache(owner: string | null): CachedProject[] {
  const raw = localStorage.getItem(cacheKey(owner));
  if (raw) {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error("Invalid local cache; export your browser data before clearing it.");
    return data.map(p => ({ ...p, board: parseBoard(p.board) }));
  }
  // Recover only the explicit v2 user cache; never import the old shared demo key.
  const legacy = localStorage.getItem(`mindcanvas:board:v2:${owner ?? "guest"}`);
  if (!legacy) return [];
  const board = parseBoard(JSON.parse(legacy));
  // The v2 board.id sometimes differed from notes.id. Keep the old copy, but
  // never replay it automatically as a new cloud row (possibly "demo-board").
  // Only drafts created by the v3 repository have a reliable cloud identity.
  return [{ id: board.id, title: board.title, updatedAt: board.updatedAt, folderId: null, board, pending: false }];
}
export function cacheProject(owner: string | null, project: CachedProject) {
  const entries = readCache(owner);
  localStorage.setItem(cacheKey(owner), JSON.stringify([project, ...entries.filter(p => p.id !== project.id)]));
}
export function acknowledge(owner: string, snapshot: CachedProject, revision = snapshot.revision) {
  const entries = readCache(owner);
  localStorage.setItem(cacheKey(owner), JSON.stringify(entries.map(p => {
    if (p.id !== snapshot.id) return p;
    const exactSnapshot = JSON.stringify(p.board) === JSON.stringify(snapshot.board) && p.folderId === snapshot.folderId;
    if (exactSnapshot) return { ...p, pending: false, revision };
    // An edit may arrive while this snapshot is in flight. It is still based on
    // the revision that just saved, so advance its base without marking it clean.
    return p.revision === snapshot.revision ? { ...p, revision } : p;
  })));
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
  localStorage.setItem(versionCacheKey(owner, version.projectId), JSON.stringify([version, ...current.filter(item => item.id !== version.id)].sort((a, b) => b.version - a.version).slice(0, MAX_PROJECT_VERSIONS)));
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
  if (!supabase || !session || session.user.id !== owner) throw new Error("Session changed. Please sign in again.");
  return supabase;
}
export async function fetchProjects(owner: string): Promise<Project[]> {
  const client = await clientFor(owner);
  let result: any = await client.from("notes").select("id,title,folder_id,updated_at,is_favorite,deleted_at,revision").eq("user_id", owner).order("updated_at", { ascending: false }).abortSignal(AbortSignal.timeout(20000));
  if (result.error && /revision|column/i.test(result.error.message)) result = await client.from("notes").select("id,title,folder_id,updated_at,is_favorite,deleted_at").eq("user_id", owner).order("updated_at", { ascending: false }).abortSignal(AbortSignal.timeout(20000));
  if (result.error) throw result.error;
  const data = result.data as any[] | null;
  return (data ?? []).map(p => ({ id: p.id, title: p.title, folderId: p.folder_id, updatedAt: p.updated_at, favorite: p.is_favorite, deletedAt: p.deleted_at, revision: typeof p.revision === "number" ? p.revision : undefined }));
}
export async function fetchProjectSnapshot(owner: string, id: string): Promise<CachedProject> {
  const client = await clientFor(owner);
  let result: any = await client.from("notes").select("id,title,folder_id,updated_at,is_favorite,deleted_at,revision,content").eq("user_id", owner).eq("id", id).abortSignal(AbortSignal.timeout(20000)).single();
  if (result.error && /revision|column/i.test(result.error.message)) {
    result = await client.from("notes").select("id,title,folder_id,updated_at,is_favorite,deleted_at,content").eq("user_id", owner).eq("id", id).abortSignal(AbortSignal.timeout(20000)).single();
  }
  if (result.error) throw result.error;
  const data = result.data as any;
  const board = parseBoard({ ...(data.content?.board ?? data.content), id: data.id, title: data.title });
  return { id: String(data.id), title: String(data.title), folderId: data.folder_id ?? null, updatedAt: String(data.updated_at ?? board.updatedAt),
    favorite: !!data.is_favorite, deletedAt: data.deleted_at ?? null, revision: typeof data.revision === "number" ? data.revision : undefined, board, pending: false };
}

export async function fetchBoard(owner: string, id: string): Promise<BoardState> {
  return (await fetchProjectSnapshot(owner, id)).board;
}
export async function persistProject(owner: string, project: CachedProject): Promise<{ revision?: number }> {
  const client = await clientFor(owner);
  const payload = { id: project.id, user_id: owner, folder_id: project.folderId, title: project.board.title, content: { type: "mindcanvas-board", version: 1, board: project.board }, updated_at: project.board.updatedAt };
  if (project.revision === undefined) {
    const modern = await client.from("notes").upsert({ ...payload, revision: 0 }).select("revision").abortSignal(AbortSignal.timeout(20000)).maybeSingle();
    if (!modern.error) return { revision: Number(modern.data?.revision ?? 0) };
    if (!/revision|column/i.test(modern.error.message)) throw modern.error;
    const legacy = await client.from("notes").upsert(payload).abortSignal(AbortSignal.timeout(20000));
    if (legacy.error) throw legacy.error;
    return {};
  }
  const nextRevision = project.revision + 1;
  const result = await client.from("notes").update({ ...payload, revision: nextRevision }).eq("id", project.id).eq("user_id", owner).eq("revision", project.revision).select("revision").abortSignal(AbortSignal.timeout(20000)).maybeSingle();
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
    const { error } = await client.from("notes").update(changes).eq("user_id", owner).eq("id", project.id).select("id").abortSignal(AbortSignal.timeout(20000)).single();
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
  localStorage.setItem(cacheKey(owner), JSON.stringify(entries));
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

// A rejected save must not poison subsequent saves. Requests remain ordered.
export class SaveQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
