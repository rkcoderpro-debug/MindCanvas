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

export async function loadLatestBoardNote() {
  if (!supabase) return null;
  const { data, error } = await supabase.from("notes").select("id,title,content").order("updated_at", { ascending: false }).limit(1);
  if (error) throw error;
  const row = data?.[0] as { id: string; title: string; content: { board?: unknown } } | undefined;
  if (!row) return null;
  return { id: row.id, board: (row.content?.board ?? row.content) as import("@mindcanvas/shared").BoardState };
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
