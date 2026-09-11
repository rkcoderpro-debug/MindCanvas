import type { BoardState } from "@mindcanvas/shared";
import { getCurrentSession, supabase } from "./supabase";
import { parseBoard } from "./board";

export type Project = { id: string; title: string; folderId: string | null; updatedAt: string; board?: BoardState; pending?: boolean; favorite?: boolean; deletedAt?: string | null };
export type ProjectFolder = { id: string; name: string };
export type CachedProject = Project & { board: BoardState; pending: boolean };
export const cacheKey = (owner: string | null) => `mindcanvas:projects:v3:${owner ?? "guest"}`;
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
export function acknowledge(owner: string, snapshot: CachedProject) {
  const entries = readCache(owner);
  localStorage.setItem(cacheKey(owner), JSON.stringify(entries.map(p =>
    p.id === snapshot.id && JSON.stringify(p.board) === JSON.stringify(snapshot.board) && p.folderId === snapshot.folderId ? { ...p, pending: false } : p)));
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
  const { data, error } = await client.from("notes").select("id,title,folder_id,updated_at,is_favorite,deleted_at").eq("user_id", owner).order("updated_at", { ascending: false }).abortSignal(AbortSignal.timeout(20000));
  if (error) throw error;
  return (data ?? []).map(p => ({ id: p.id, title: p.title, folderId: p.folder_id, updatedAt: p.updated_at, favorite: p.is_favorite, deletedAt: p.deleted_at }));
}
export async function fetchBoard(owner: string, id: string): Promise<BoardState> {
  const client = await clientFor(owner);
  const { data, error } = await client.from("notes").select("id,title,content").eq("user_id", owner).eq("id", id).abortSignal(AbortSignal.timeout(20000)).single();
  if (error) throw error;
  return parseBoard({ ...(data.content?.board ?? data.content), id: data.id, title: data.title });
}
export async function persistProject(owner: string, project: CachedProject) {
  const client = await clientFor(owner);
  const { error } = await client.from("notes").upsert({ id: project.id, user_id: owner, folder_id: project.folderId,
    title: project.board.title, content: { type: "mindcanvas-board", version: 1, board: project.board }, updated_at: project.board.updatedAt }).abortSignal(AbortSignal.timeout(20000));
  if (error) throw error;
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
// A rejected save must not poison subsequent saves. Requests remain ordered.
export class SaveQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
