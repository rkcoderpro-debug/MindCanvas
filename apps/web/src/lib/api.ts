import type { StructuredMindMap } from "@mindcanvas/shared";
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

export function consumeAiManualUsage(requestId = crypto.randomUUID(), signal?: AbortSignal) {
  return accountRequest<{ ok: boolean; requestId: string; remaining?: number | null }>("/api/ai/manual/usage/consume", { method: "POST", body: JSON.stringify({ requestId }), signal });
}

export function getAdminStatus(signal?: AbortSignal) {
  return accountRequest<{ isAdmin: boolean }>("/api/admin/me", { signal });
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

export async function generateMindMap(text: string, documentId?: string, signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS, detail: MindMapDetail = "medium") {
  const response = await fetch(`${apiBase}/api/ai/mind-map`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text, documentId, ...options, detail }),
  });
  if (!response.ok) await responseError(response, `AI HTTP ${response.status}`);
  return response.json() as Promise<{ provider: string; graph: StructuredMindMap }>;
}

export type AiFileSource = { id: string; kind: "pdf" | "docx" | "pptx" | "text" | "image"; fileName: string; mimeType: string; text: string; pageCount?: number };
export type GeneratedMindMap = { provider: string; model?: string; graph: StructuredMindMap; source: AiFileSource };

async function generateFromFile<T>(file: File, task: "mind-map" | "flashcards" | "quiz", maxCards: number | undefined, signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS, detail: MindMapDetail = "medium") {
  const body = new FormData();
  body.append("file", file);
  body.append("task", task);
  if (maxCards !== undefined) body.append("maxCards", String(maxCards));
  body.append("difficulty", options.difficulty);
  body.append("depth", options.depth);
  if (task === "mind-map") body.append("detail", detail);
  const response = await fetch(`${apiBase}/api/ai/file`, { method: "POST", headers: await authHeaders(), body, signal });
  if (!response.ok) await responseError(response, `Không thể xử lý file bằng AI (HTTP ${response.status}).`);
  return response.json() as Promise<T>;
}

export function generateMindMapFromFile(file: File, signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS, detail: MindMapDetail = "medium") {
  return generateFromFile<GeneratedMindMap>(file, "mind-map", undefined, signal, options, detail);
}

export type GeneratedFlashcard = { front: string; back: string; sourcePage?: number };
export type GeneratedFlashcards = { provider: string; model: string; title: string; cards: GeneratedFlashcard[]; sourceDocumentId?: string };
export type GeneratedFlashcardsFromFile = GeneratedFlashcards & { source: AiFileSource };
export type SelectionAiAction = "summarize" | "explain" | "rewrite" | "expand";
export type SelectionAiResult = { provider: string; model: string; action: SelectionAiAction; title: string; text: string; ideas: string[] };

export async function generateFlashcards(text: string, documentId?: string, maxCards = 20, signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS) {
  const response = await fetch(`${apiBase}/api/ai/flashcards`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text, documentId, maxCards, ...options }),
  });
  if (!response.ok) await responseError(response, `AI HTTP ${response.status}`);
  return response.json() as Promise<GeneratedFlashcards>;
}

export function generateFlashcardsFromFile(file: File, maxCards = 20, signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS) {
  return generateFromFile<GeneratedFlashcardsFromFile>(file, "flashcards", maxCards, signal, options);
}

export type GeneratedQuizQuestion = { id?: string; prompt: string; options: [string, string, string, string]; correctIndex: 0 | 1 | 2 | 3; explanation: string; sourcePage?: number; topic?: string };
export type GeneratedQuiz = { provider: string; model: string; title: string; description: string; questions: GeneratedQuizQuestion[]; sourceDocumentId?: string };
export type GeneratedQuizFromFile = GeneratedQuiz & { source: AiFileSource };

export function generateQuiz(text: string, documentId?: string, maxQuestions = 10, language: "vi" | "en" = "vi", signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS) {
  return accountRequest<GeneratedQuiz>("/api/ai/quiz", { method: "POST", body: JSON.stringify({ text, documentId, maxQuestions, language, ...options }), signal });
}

export function generateQuizFromFile(file: File, maxQuestions = 10, signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS) {
  return generateFromFile<GeneratedQuizFromFile>(file, "quiz", maxQuestions, signal, options);
}

export type StudyPlanCardSignal = { due: boolean; repetitions: number; lapses: number; intervalDays: number };
export type StudyPlanRecommendation = { provider: string; model: string; dailyTarget: number; focus: "due" | "new" | "difficult" | "balanced"; rationale: string };

export function recommendStudyPlan(cards: StudyPlanCardSignal[], dailyMinutes: number, language: "vi" | "en", signal?: AbortSignal, options: AiGenerationOptions = DEFAULT_AI_OPTIONS) {
  return accountRequest<StudyPlanRecommendation>("/api/ai/study-plan", { method: "POST", body: JSON.stringify({ cards, dailyMinutes, language, ...options }), signal });
}

export async function transformSelection(action: SelectionAiAction, text: string, language: "vi" | "en", signal?: AbortSignal) {
  const response = await fetch(`${apiBase}/api/ai/selection`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ action, text, language }),
  });
  if (!response.ok) await responseError(response, `AI HTTP ${response.status}`);
  return response.json() as Promise<SelectionAiResult>;
}
