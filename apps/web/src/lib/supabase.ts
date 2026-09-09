import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
export const isSupabaseConfigured = Boolean(supabase);

export async function signInWithGoogle() {
  if (!supabase) return { error: new Error("Supabase chưa được cấu hình; đang dùng demo mode.") };
  return supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
}

export async function getCurrentSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export type ProjectSummary = { id: string; title: string; folderId: string | null; updatedAt: string };
export type FolderSummary = { id: string; name: string };

const blankBoard = (id?: string, title = "Untitled canvas"): import("@mindcanvas/shared").BoardState => ({
  id: id ?? crypto.randomUUID(), title, updatedAt: new Date().toISOString(), viewport: { x: 0, y: 0, scale: 1 },
  texts: [], shapes: [], drawings: [], nodes: [], edges: [],
});

export function createBlankBoard(id?: string, title?: string) { return blankBoard(id, title); }

export async function listProjects() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("notes").select("id,title,folder_id,updated_at").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id as string, title: row.title as string, folderId: (row.folder_id as string | null) ?? null, updatedAt: row.updated_at as string })) as ProjectSummary[];
}

export async function listFolders() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("folders").select("id,name").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FolderSummary[];
}

export async function createProject(title: string) {
  if (!supabase) return { id: crypto.randomUUID(), title };
  const user = await getCurrentUser();
  if (!user) throw new Error("Bạn cần đăng nhập để tạo project.");
  const id = crypto.randomUUID();
  const board = blankBoard(id, title);
  const { error } = await supabase.from("notes").insert({ id, user_id: user.id, title, content: { type: "mindcanvas-board", version: 1, board } });
  if (error) throw error;
  return { id, title };
}

export async function loadProject(id: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.from("notes").select("id,title,content").eq("id", id).maybeSingle();
  if (error) throw error;
  const board = (data?.content as { board?: import("@mindcanvas/shared").BoardState } | null)?.board;
  return data && board ? { id: data.id as string, board: { ...board, id: data.id as string, title: data.title as string } } : null;
}

export async function createFolder(name: string) {
  if (!supabase) return { id: crypto.randomUUID(), name };
  const user = await getCurrentUser();
  if (!user) throw new Error("Bạn cần đăng nhập để tạo folder.");
  const { data, error } = await supabase.from("folders").insert({ name, user_id: user.id }).select("id,name").single();
  if (error) throw error;
  return data as FolderSummary;
}

export async function assignProjectToFolder(projectId: string, folderId: string | null) {
  if (!supabase) return;
  const { error } = await supabase.from("notes").update({ folder_id: folderId }).eq("id", projectId);
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadLatestBoardNote() {
  if (!supabase) return null;
  const { data, error } = await supabase.from("notes").select("id,title,content").order("updated_at", { ascending: false }).limit(1);
  if (error) throw error;
  const row = data?.[0] as { id: string; title: string; content: { board?: unknown } } | undefined;
  if (!row) return null;
  const board = (row.content?.board ?? row.content) as Partial<import("@mindcanvas/shared").BoardState>;
  if (!Array.isArray(board.nodes) || !Array.isArray(board.edges)) return null;
  return { id: row.id, board: board as import("@mindcanvas/shared").BoardState };
}

export async function saveBoardNote(board: import("@mindcanvas/shared").BoardState, noteId?: string) {
  if (!supabase) return noteId;
  const user = await getCurrentUser();
  if (!user) return noteId;
  const id = noteId ?? crypto.randomUUID();
  const { error } = await supabase.from("notes").upsert({ id, user_id: user.id, title: board.title, content: { type: "mindcanvas-board", version: 1, board }, updated_at: new Date().toISOString() });
  if (error) throw error;
  return id;
}

export async function saveDocumentToStorage(file: File, documentId: string, extractedText: string, pageCount?: number) {
  if (!supabase) return;
  const user = await getCurrentUser();
  if (!user) throw new Error("Bạn cần đăng nhập để lưu PDF.");
  const path = `${user.id}/${documentId}.pdf`;
  const upload = await supabase.storage.from("documents").upload(path, file, { contentType: "application/pdf", upsert: true });
  if (upload.error) throw upload.error;
  const { error } = await supabase.from("documents").upsert({ id: documentId, user_id: user.id, file_path: path, file_name: file.name, extracted_text: extractedText, page_count: pageCount });
  if (error) throw error;
}
