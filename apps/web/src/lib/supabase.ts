import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;
export const isSupabaseConfigured = Boolean(supabase);

/**
 * Safari/WebViews that predate AbortSignal.timeout throw before a Supabase
 * request is created. Keep the same timeout contract with an AbortController
 * fallback so cloud reads/writes fail visibly instead of hanging or silently
 * switching to an incomplete local state.
 */
export function requestTimeoutSignal(milliseconds: number): AbortSignal {
  const nativeTimeout = (AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout;
  if (typeof nativeTimeout === "function") return nativeTimeout(milliseconds);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  // Do not keep a Node-based test process alive solely for the browser fallback.
  if (typeof timer === "object" && timer !== null && "unref" in timer && typeof timer.unref === "function") timer.unref();
  return controller.signal;
}

export async function signInWithGoogle() {
  if (!supabase) return { error: new Error("Supabase chưa được cấu hình; ứng dụng đang ở chế độ local.") };
  // Preserve an invitation query through the OAuth round trip. A normal login
  // still returns to the app origin; an invite must return to its exact link
  // so the authenticated account can accept it.
  const inviteToken = new URLSearchParams(window.location.search).get("invite");
  if (inviteToken) {
    try { localStorage.setItem("mindcanvas:pending-invite", inviteToken); } catch {}
  }
  const redirectTo = window.location.origin;
  return supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, queryParams: { prompt: "select_account" } } });
}

export async function getCurrentSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

export type ProjectSummary = { id: string; title: string; folderId: string | null; updatedAt: string };
export type FolderSummary = { id: string; name: string };

const blankBoard = (id?: string, title = "Untitled canvas"): import("@mindcanvas/shared").BoardState => ({
  id: id ?? crypto.randomUUID(), title, updatedAt: new Date().toISOString(), viewport: { x: 0, y: 0, scale: 1 },
  background: "dots", texts: [], shapes: [], drawings: [], media: [], embeds: [], nodes: [], edges: [],
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

export async function saveDocumentToStorage(file: File, documentId: string, extractedText: string, pageCount?: number, noteId?: string) {
  if (!supabase) return;
  const user = await getCurrentUser();
  if (!user) throw new Error("Bạn cần đăng nhập để lưu tài liệu.");
  const extension = (file.name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] ?? "bin").replace(/[^a-z0-9]/g, "");
  const contentType = file.type || "application/octet-stream";
  const path = `${user.id}/${documentId}.${extension}`;
  const upload = await supabase.storage.from("documents").upload(path, file, { contentType, upsert: false });
  if (upload.error) throw upload.error;
  const removeUploadedFile = async () => {
    const cleanup = await supabase.storage.from("documents").remove([path]);
    if (cleanup.error) console.warn("MindCanvas could not clean up an unlinked document", cleanup.error);
  };
  const modern = await supabase.from("documents").upsert({ id: documentId, user_id: user.id, note_id: noteId, file_path: path, file_name: file.name, extracted_text: extractedText, page_count: pageCount, file_size_bytes: file.size });
  if (modern.error && !/file_size_bytes|column/i.test(modern.error.message)) { await removeUploadedFile(); throw modern.error; }
  if (modern.error) {
    const legacy = await supabase.from("documents").upsert({ id: documentId, user_id: user.id, note_id: noteId, file_path: path, file_name: file.name, extracted_text: extractedText, page_count: pageCount });
    if (legacy.error) { await removeUploadedFile(); throw legacy.error; }
  }
}

export async function getDocumentSource(options: { documentId?: string; projectId?: string }) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  let query = supabase.from("documents").select("id,file_path,file_name,page_count,created_at");
  if (options.documentId) query = query.eq("id", options.documentId);
  else if (options.projectId) query = query.eq("note_id", options.projectId).order("created_at", { ascending: false }).limit(1);
  else throw new Error("Không tìm thấy tài liệu nguồn.");
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data?.file_path) throw new Error("Không tìm thấy tài liệu nguồn của project này.");
  const signed = await supabase.storage.from("documents").createSignedUrl(data.file_path as string, 15 * 60);
  if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("Không mở được PDF nguồn.");
  return { id: data.id as string, name: data.file_name as string, pageCount: Number(data.page_count) || undefined, url: signed.data.signedUrl };
}
