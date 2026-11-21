export function errorMessage(error: unknown, fallback = "") {
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [value.message, value.details, value.hint].filter((part): part is string => typeof part === "string" && Boolean(part.trim())).map(part => part.trim());
    const code = typeof value.code === "string" ? value.code.trim() : "";
    if (code === "42501" && /row-level security.*notes|notes.*row-level security/i.test(parts.join(" "))) {
      return "[42501] Supabase đang từ chối lưu canvas vào bảng notes. Hãy chạy migration 0015_v4_5_9_notes_rls_repair.sql, sau đó đăng xuất/đăng nhập lại để làm mới JWT và kiểm tra VITE_SUPABASE_URL của bản build đang chạy.";
    }
    if (code) parts.unshift(`[${code}]`);
    if (parts.length) return parts.join(" · ");
    try { return JSON.stringify(error); } catch { return fallback; }
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}
