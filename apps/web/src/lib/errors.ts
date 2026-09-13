export function errorMessage(error: unknown, fallback = "") {
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [value.message, value.details, value.hint].filter((part): part is string => typeof part === "string" && Boolean(part.trim())).map(part => part.trim());
    if (typeof value.code === "string" && value.code.trim()) parts.unshift(`[${value.code.trim()}]`);
    if (parts.length) return parts.join(" · ");
    try { return JSON.stringify(error); } catch { return fallback; }
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}
