import type { IncomingLearningShare, LearningCopySource, LearningKind } from "./learningShare";

export type PendingLearningInvite = { id: string; kind: LearningKind; token_hash: string; expires_at: string };
const invalid = () => new Error("Dữ liệu chia sẻ không hợp lệ. Hãy thử tải lại.");
function rows(value: unknown): Record<string, unknown>[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw invalid();
  return value;
}
function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw invalid();
  return value;
}
function kind(value: unknown): LearningKind {
  if (value !== "quiz" && value !== "flashcard" && value !== "lab" && value !== "document") throw invalid();
  return value;
}
function text(value: unknown, fallback: string): string { return typeof value === "string" && value.trim() ? value : fallback; }
function date(value: unknown): string { return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : ""; }

/** A deleted source legitimately has NULL title/updated_at in the share RPC. */
export function normalizeIncomingShares(value: unknown): IncomingLearningShare[] {
  return rows(value).map(row => {
    if (row.status !== "active" && row.status !== "paused" && row.status !== "removed") throw invalid();
    return { kind: kind(row.kind), resource_id: required(row.resource_id), status: row.status,
      title: text(row.title, row.status === "removed" ? "Học liệu đã xóa" : "Học liệu"),
      owner_name: text(row.owner_name, "Người chia sẻ"), updated_at: date(row.updated_at) };
  });
}
export function normalizeCopySources(value: unknown): LearningCopySource[] {
  return rows(value).map(row => ({ kind: kind(row.kind), copy_id: required(row.copy_id), source_id: required(row.source_id),
    source_title: text(row.source_title, "Học liệu"), owner_name: text(row.owner_name, "Người chia sẻ"), saved_at: date(row.saved_at) }));
}
export function normalizePendingInvites(value: unknown): PendingLearningInvite[] {
  return rows(value).map(row => {
    const expires = date(row.expires_at);
    if (!expires) throw invalid();
    return { id: required(row.id), kind: kind(row.kind), token_hash: required(row.token_hash), expires_at: expires };
  });
}

/** Stop an unavailable request from leaving the inbox loading indefinitely.
 * Late settlements are ignored by the page's request generation guard. */
export function withInboxTimeout<T>(work: Promise<T>, timeout = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Kết nối quá lâu. Hãy kiểm tra mạng và thử lại.")), timeout);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
