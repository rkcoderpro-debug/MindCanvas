import type { StructuredMindMap } from "@mindcanvas/shared";
import { getCurrentSession } from "./supabase";

const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8787";

async function authHeaders(): Promise<Record<string, string>> {
  const session = await getCurrentSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function uploadPdf(file: File, signal?: AbortSignal) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${apiBase}/api/documents/upload`, { method: "POST", headers: await authHeaders(), body, signal });
  if (!response.ok) throw new Error("Không thể tải PDF lên máy chủ.");
  return response.json() as Promise<{ id: string; fileName: string; text: string; pageCount?: number }>;
}

export async function generateMindMap(text: string, documentId?: string, signal?: AbortSignal) {
  const response = await fetch(`${apiBase}/api/ai/mind-map`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text, documentId }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(typeof detail?.error === "string" ? detail.error.slice(0, 2000) : `AI HTTP ${response.status}`);
  }
  return response.json() as Promise<{ provider: string; graph: StructuredMindMap }>;
}

export type GeneratedFlashcard = { front: string; back: string; sourcePage?: number };
export type GeneratedFlashcards = { provider: string; model: string; title: string; cards: GeneratedFlashcard[]; sourceDocumentId?: string };
export type SelectionAiAction = "summarize" | "explain" | "rewrite" | "expand";
export type SelectionAiResult = { provider: string; model: string; action: SelectionAiAction; title: string; text: string; ideas: string[] };

export async function generateFlashcards(text: string, documentId?: string, maxCards = 20, signal?: AbortSignal) {
  const response = await fetch(`${apiBase}/api/ai/flashcards`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text, documentId, maxCards }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(typeof detail?.error === "string" ? detail.error.slice(0, 2000) : `AI HTTP ${response.status}`);
  }
  return response.json() as Promise<GeneratedFlashcards>;
}

export async function transformSelection(action: SelectionAiAction, text: string, language: "vi" | "en", signal?: AbortSignal) {
  const response = await fetch(`${apiBase}/api/ai/selection`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ action, text, language }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(typeof detail?.error === "string" ? detail.error.slice(0, 2000) : `AI HTTP ${response.status}`);
  }
  return response.json() as Promise<SelectionAiResult>;
}
