import type { IncomingLearningShare, LearningCopySource, LearningKind } from "./learningShare";
import type { Project } from "./projectStore";
import type { ShareReceived } from "./workspaceSharing";

export type InboxKind = LearningKind | "canvas" | "folder";
export type InboxWorkspace = {
  projects: Project[];
  loading: boolean;
  refresh: () => Promise<void>;
  open: (project: Project) => void;
  duplicate: (project: Project, title: string) => Promise<void>;
};

type InboxItem = {
  key: string;
  kind: InboxKind;
  title: string;
  ownerName: string | null;
  date: string;
  status: IncomingLearningShare["status"];
  learning?: IncomingLearningShare;
  project?: Project;
  link?: ShareReceived;
};

export function mergeInboxItems(learning: IncomingLearningShare[], projects: Project[], links: ShareReceived[]): InboxItem[] {
  const items = new Map<string, InboxItem>();
  for (const share of learning) {
    const key = `${share.kind}:${share.resource_id}`;
    items.set(key, { key, kind: share.kind, title: share.title, ownerName: share.owner_name,
      date: share.updated_at, status: share.status, learning: share });
  }
  for (const project of projects) {
    if (!project.shared || project.deletedAt) continue;
    const key = `canvas:${project.id}`;
    items.set(key, { key, kind: "canvas", title: project.title, ownerName: null,
      date: project.updatedAt, status: "active", project });
  }
  for (const link of links) {
    const key = `${link.kind}:${link.id}`;
    const current = items.get(key);
    const kind = link.kind === "file" ? "document" : link.kind === "learning_folder" ? "folder" : link.kind;
    items.set(key, { ...current, key, kind, title: link.title, ownerName: link.owner_name ?? current?.ownerName ?? null,
      date: current && (!link.created_at || Date.parse(current.date) > Date.parse(link.created_at)) ? current.date : link.created_at,
      status: "active", link });
  }
  return [...items.values()];
}

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
export function normalizeReceivedLinks(value: unknown): ShareReceived[] {
  return rows(value).map(row => {
    const { kind, role } = row;
    if (kind !== "file" && kind !== "folder" && kind !== "canvas" && kind !== "learning_folder"
      && kind !== "quiz" && kind !== "flashcard" && kind !== "lab") throw invalid();
    if (role !== "viewer" && role !== "editor") throw invalid();
    const token = required(row.token);
    if (!/^[a-f0-9]{48}$/.test(token)) throw invalid();
    return { kind, role, token, id: required(row.id), title: text(row.title, "Nội dung chia sẻ"),
      owner_name: typeof row.owner_name === "string" ? row.owner_name : null, created_at: date(row.created_at) };
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
