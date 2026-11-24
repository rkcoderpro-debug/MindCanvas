import type { AnnouncementCursor, SystemAnnouncement } from "./systemAnnouncements";
import type { ContentLanguage } from "../../../../packages/shared/src/contentLanguage.js";
import type { MindMapAiOperation, MindMapEdge, StructuredMindMap } from "@mindcanvas/shared";
import { getCurrentSession } from "./supabase";
import type { AccountPlan, PlanId, SubscriptionHistoryRecord } from "./account";
import { DEFAULT_AI_OPTIONS, type AiGenerationOptions, type MindMapDetail } from "./aiOptions";

const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8787";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public retryable = false,
    public retryAfterSeconds?: number,
  ) { super(message); }
}

export type AdminUserSummary = AccountPlan & {
  userId: string;
  email: string;
  displayName: string;
  lastSignInAt: string | null;
  createdAt: string | null;
};

export type AdminSummary = {
  generatedAt: string;
  totalUsers: number;
  planCounts: Record<PlanId, number>;
  storageBytes: number;
  aiAutoCount: number;
  uploads: number;
};

export type AdminUserDetail = {
  user: AdminUserSummary;
  plan: AccountPlan;
  usage: AccountPlan["usage"][];
  events: Array<{ id: string; kind: string; units: number; bytes: number; metadata: Record<string, unknown>; created_at: string }>;
  history: SubscriptionHistoryRecord[];
};

export type OnlineRoomAdminAction =
  | { op:"pilot"; enabled:boolean; verified:boolean }
  | { op:"limits"; openLimit:number; publicLimit:number }
  | { op:"billing"; downstreamGb:number; costUsd:number }
  | { op:"preset" | "public_host" | "moderator"; target:string; enabled:boolean }
  | { op:"dismiss_report" | "resolve_report" | "remove_reported_message"; target:string };
export type OnlineRoomAdminData = {
  pilot_enabled:boolean; pilot_ready:boolean; open_count:number; public_count:number; open_limit:number; public_limit:number;
  latest_webhook:string|null; measured_minutes:number; closed_sessions:number; open_sessions:number; period_start:string;
  billing:{ downstream_gb:number;cost_usd:number;recorded_at:string }|null;
  presets:{ id:string;name:string;open:boolean }[]; public_hosts:string[]; moderators:string[];
  reports:{ id:string;reason:string;detail:string;message_excerpt:string|null;filed_at:string;room_name:string;has_message:boolean;can_remove:boolean }[];
};
export const getOnlineRoomAdmin = (signal?:AbortSignal) => accountRequest<OnlineRoomAdminData>("/api/admin/online-rooms",{ signal });
export const updateOnlineRoomAdmin = (action:OnlineRoomAdminAction) => accountRequest<OnlineRoomAdminData>("/api/admin/online-rooms",{ method:"POST",body:JSON.stringify(action) });

async function responseError(response: Response, fallback: string) {
  const detail = await response.json().catch(() => null) as { error?: unknown; code?: unknown; retryable?: unknown; retryAfterSeconds?: unknown } | null;
  const headerRetry = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
  const bodyRetry = typeof detail?.retryAfterSeconds === "number" ? detail.retryAfterSeconds : undefined;
  throw new ApiError(
    typeof detail?.error === "string" ? detail.error.slice(0, 1000) : fallback,
    response.status,
    typeof detail?.code === "string" ? detail.code : undefined,
    detail?.retryable === true,
    Number.isFinite(bodyRetry) ? bodyRetry : Number.isFinite(headerRetry) ? headerRetry : undefined,
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  const session = await getCurrentSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function accountRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBase}${path}`, { ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(await authHeaders()), ...(init.headers ?? {}) } });
  if (!response.ok) await responseError(response, `MindCanvas API HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export function getAccountPlan(signal?: AbortSignal) {
  return accountRequest<AccountPlan>("/api/account/plan", { signal });
}

export function getSubscriptionHistory(signal?: AbortSignal) {
  return accountRequest<{ history: SubscriptionHistoryRecord[] }>("/api/account/subscription-history", { signal });
}

export function consumeAiManualUsage(requestId: string = crypto.randomUUID(), signal?: AbortSignal) {
  return accountRequest<{ ok: boolean; requestId: string; remaining?: number | null }>("/api/ai/manual/usage/consume", { method: "POST", body: JSON.stringify({ requestId }), signal });
}

export function getAdminStatus(signal?: AbortSignal) {
  return accountRequest<{ isAdmin: boolean }>("/api/admin/me", { signal });
}

export function listAdminSystemAnnouncements(before?: AnnouncementCursor, signal?: AbortSignal) {
  const query = before ? new URLSearchParams({ before: before.published_at, beforeId: before.id }) : null;
  return accountRequest<{ items: SystemAnnouncement[]; hasMore: boolean }>(`/api/admin/system-announcements${query ? `?${query}` : ""}`, { signal });
}

export function publishAdminSystemAnnouncement(body: { requestId: string; title: string; body: string }, signal?: AbortSignal) {
  return accountRequest<{ item: SystemAnnouncement }>("/api/admin/system-announcements", { method: "POST", body: JSON.stringify(body), signal });
}

export function getAdminSummary(signal?: AbortSignal) {
  return accountRequest<AdminSummary>("/api/admin/summary", { signal });
}

export function getAdminUsers(query = "", plan = "", signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("query", query.trim());
  if (plan) params.set("plan", plan);
  return accountRequest<{ users: AdminUserSummary[] }>(`/api/admin/users${params.size ? `?${params}` : ""}`, { signal });
}

export function getAdminUserDetail(userId: string, signal?: AbortSignal) {
  return accountRequest<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(userId)}`, { signal });
}

export function assignAdminPlan(userId: string, body: { planId: PlanId; addonEnabled: boolean; expiresAt: string | null; note: string | null }) {
  return accountRequest<{ ok: true }>(`/api/admin/users/${encodeURIComponent(userId)}/plan`, { method: "PATCH", body: JSON.stringify(body) });
}

export type UploadedDocument = { id: string; kind: "pdf" | "docx" | "pptx" | "text" | "image"; fileName: string; mimeType: string; text: string; pageCount?: number };

export async function uploadDocument(file: File, signal?: AbortSignal) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${apiBase}/api/documents/upload`, { method: "POST", headers: await authHeaders(), body, signal });
  if (!response.ok) await responseError(response, "Không thể đọc tài liệu trên máy chủ.");
  return response.json() as Promise<UploadedDocument>;
}

/** Kept as a compatibility alias for earlier V3 clients. */
export const uploadPdf = uploadDocument;

export async function generateMindMap(text: string, documentId?: string, signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS, detail: MindMapDetail = "medium", unlimited = false, language?: ContentLanguage) {
  const response = await fetch(`${apiBase}/api/ai/mind-map`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text, documentId, depth: options.depth, detail, unlimited, language }),
  });
  if (!response.ok) await responseError(response, `AI HTTP ${response.status}`);
  return response.json() as Promise<{ provider: string; graph: StructuredMindMap }>;
}

export type AiFileSource = { id: string; kind: "pdf" | "docx" | "pptx" | "text" | "image"; fileName: string; mimeType: string; text: string; pageCount?: number };
export type GeneratedMindMap = { provider: string; model?: string; graph: StructuredMindMap; source: AiFileSource };

async function generateFromFile<T>(file: File, task: "mind-map" | "flashcards" | "quiz", maxCards: number | undefined, signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS, detail: MindMapDetail = "medium", unlimited = false, language?: ContentLanguage) {
  const body = new FormData();
  body.append("file", file);
  body.append("task", task);
  if (maxCards !== undefined) body.append("maxCards", String(maxCards));
  body.append("depth", options.depth);
  if (language) body.append("language", language);
  if (task === "mind-map") {
    body.append("detail", detail);
    if (unlimited) body.append("unlimited", "true");
  } else {
    body.append("difficulty", options.difficulty);
  }
  const response = await fetch(`${apiBase}/api/ai/file`, { method: "POST", headers: await authHeaders(), body, signal });
  if (!response.ok) await responseError(response, `Không thể xử lý file bằng AI (HTTP ${response.status}).`);
  return response.json() as Promise<T>;
}

export function generateMindMapFromFile(file: File, signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS, detail: MindMapDetail = "medium", unlimited = false, language?: ContentLanguage) {
  return generateFromFile<GeneratedMindMap>(file, "mind-map", undefined, signal, options, detail, unlimited, language);
}

export type GeneratedFlashcard = { front: string; back: string; sourcePage?: number };
export type GeneratedFlashcards = { provider: string; model: string; title: string; cards: GeneratedFlashcard[]; sourceDocumentId?: string };
export type GeneratedFlashcardsFromFile = GeneratedFlashcards & { source: AiFileSource };
export type SelectionAiAction = "summarize" | "explain" | "rewrite" | "expand" | "organize";
export type SelectionMindMapScope = { rootId: string; nodeIds: string[]; edges: Array<Pick<MindMapEdge, "source" | "target" | "label" | "kind">> };
/** Small deterministic revision for guarding an AI preview against stale edits. */
export function selectionRevision(text: string, scope?: SelectionMindMapScope) {
  const input = JSON.stringify({ text, scope });
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export type SelectionAiResult = { provider: string; model: string; action: SelectionAiAction; title: string; text: string; ideas: string[]; operations: MindMapAiOperation[]; sourceRevision?: string };

export async function generateFlashcards(text: string, documentId?: string, maxCards = 20, signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS, language?: ContentLanguage) {
  const response = await fetch(`${apiBase}/api/ai/flashcards`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text, documentId, maxCards, language, ...options }),
  });
  if (!response.ok) await responseError(response, `AI HTTP ${response.status}`);
  return response.json() as Promise<GeneratedFlashcards>;
}

export function generateFlashcardsFromFile(file: File, maxCards = 20, signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS, language?: ContentLanguage) {
  return generateFromFile<GeneratedFlashcardsFromFile>(file, "flashcards", maxCards, signal, options, undefined, false, language);
}

export type GeneratedQuizQuestion = { id?: string; prompt: string; options: [string, string, string, string]; correctIndex: 0 | 1 | 2 | 3; explanation: string; sourcePage?: number; topic?: string };
export type GeneratedQuiz = { provider: string; model: string; title: string; description: string; questions: GeneratedQuizQuestion[]; sourceDocumentId?: string };
export type GeneratedQuizFromFile = GeneratedQuiz & { source: AiFileSource };

export function generateQuiz(text: string, documentId?: string, maxQuestions = 10, language: "vi" | "en" = "vi", signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS) {
  return accountRequest<GeneratedQuiz>("/api/ai/quiz", { method: "POST", body: JSON.stringify({ text, documentId, maxQuestions, language, ...options }), signal });
}

export function generateQuizFromFile(file: File, maxQuestions = 10, signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS, language?: ContentLanguage) {
  return generateFromFile<GeneratedQuizFromFile>(file, "quiz", maxQuestions, signal, options, undefined, false, language);
}

export type StudyPlanCardSignal = { due: boolean; repetitions: number; lapses: number; intervalDays: number };
export type StudyPlanRecommendation = { provider: string; model: string; dailyTarget: number; focus: "due" | "new" | "difficult" | "balanced"; rationale: string };

export function recommendStudyPlan(cards: StudyPlanCardSignal[], dailyMinutes: number, language: "vi" | "en", signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS) {
  return accountRequest<StudyPlanRecommendation>("/api/ai/study-plan", { method: "POST", body: JSON.stringify({ cards, dailyMinutes, language, ...options }), signal });
}

export async function transformSelection(action: SelectionAiAction, text: string, language: "vi" | "en", signal?: AbortSignal, scope?: SelectionMindMapScope) {
  const response = await fetch(`${apiBase}/api/ai/selection`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ action, text, language, scope }),
  });
  if (!response.ok) await responseError(response, `AI HTTP ${response.status}`);
  return response.json() as Promise<SelectionAiResult>;
}

export async function readExamFile(file: File, signal?: AbortSignal) {
  const body = new FormData(); body.append("file", file);
  const response = await fetch(`${apiBase}/api/exams/read-source`, { method: "POST", headers: await authHeaders(), body, signal });
  if (!response.ok) await responseError(response, "Không thể đọc nguồn đề thi.");
  return response.json() as Promise<import("@mindcanvas/shared").ExamSource>;
}
export function analyzeExamSources(settings: import("@mindcanvas/shared").ExamSettings, sources: import("@mindcanvas/shared").ExamSource[], signal?: AbortSignal) {
  return accountRequest<{ blueprint: import("@mindcanvas/shared").ExamBlueprint }>("/api/exams/analyze", { method: "POST", body: JSON.stringify({ settings, sources }), signal });
}
export function generateExamDraft(settings: import("@mindcanvas/shared").ExamSettings, sources: import("@mindcanvas/shared").ExamSource[], blueprint: import("@mindcanvas/shared").ExamBlueprint, excludedPrompts: string[] = [], signal?: AbortSignal) {
  return accountRequest<{ draft: import("@mindcanvas/shared").ExamDraft }>("/api/exams/generate", { method: "POST", body: JSON.stringify({ settings, sources, blueprint, excludedPrompts }), signal });
}

export function generateTakenote(settings: import("../../../../packages/shared/src/takenotes.js").NoteSettings, sources: import("@mindcanvas/shared").ExamSource[], signal?: AbortSignal, revision = "", previous = "") {
  return accountRequest<{ note: import("../../../../packages/shared/src/takenotes.js").NoteResult }>("/api/takenotes/generate", { method: "POST", body: JSON.stringify({ settings, sources, revision, previous }), signal });
}
