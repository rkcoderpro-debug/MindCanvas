import type { StructuredMindMap } from "@mindcanvas/shared";
import { getCurrentSession } from "./supabase";

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

export async function generateMindMap(text: string, documentId?: string, signal?: AbortSignal) {
  const response = await fetch(`${apiBase}/api/ai/mind-map`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text, documentId }),
  });
  if (!response.ok) await responseError(response, `AI HTTP ${response.status}`);
  return response.json() as Promise<{ provider: string; graph: StructuredMindMap }>;
}

export type AiFileSource = { id: string; kind: "pdf" | "docx" | "pptx" | "text" | "image"; fileName: string; mimeType: string; text: string; pageCount?: number };
export type GeneratedMindMap = { provider: string; model?: string; graph: StructuredMindMap; source: AiFileSource };

async function generateFromFile<T>(file: File, task: "mind-map" | "flashcards", maxCards: number | undefined, signal?: AbortSignal) {
  const body = new FormData();
  body.append("file", file);
  body.append("task", task);
  if (maxCards !== undefined) body.append("maxCards", String(maxCards));
  const response = await fetch(`${apiBase}/api/ai/file`, { method: "POST", headers: await authHeaders(), body, signal });
  if (!response.ok) await responseError(response, `Không thể xử lý file bằng AI (HTTP ${response.status}).`);
  return response.json() as Promise<T>;
}

export function generateMindMapFromFile(file: File, signal?: AbortSignal) {
  return generateFromFile<GeneratedMindMap>(file, "mind-map", undefined, signal);
}

export type GeneratedFlashcard = { front: string; back: string; sourcePage?: number };
export type GeneratedFlashcards = { provider: string; model: string; title: string; cards: GeneratedFlashcard[]; sourceDocumentId?: string };
export type GeneratedFlashcardsFromFile = GeneratedFlashcards & { source: AiFileSource };
export type SelectionAiAction = "summarize" | "explain" | "rewrite" | "expand";
export type SelectionAiResult = { provider: string; model: string; action: SelectionAiAction; title: string; text: string; ideas: string[] };

export async function generateFlashcards(text: string, documentId?: string, maxCards = 20, signal?: AbortSignal) {
  const response = await fetch(`${apiBase}/api/ai/flashcards`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text, documentId, maxCards }),
  });
  if (!response.ok) await responseError(response, `AI HTTP ${response.status}`);
  return response.json() as Promise<GeneratedFlashcards>;
}

export function generateFlashcardsFromFile(file: File, maxCards = 20, signal?: AbortSignal) {
  return generateFromFile<GeneratedFlashcardsFromFile>(file, "flashcards", maxCards, signal);
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
