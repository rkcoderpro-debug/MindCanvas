import type { StructuredMindMap } from "@mindcanvas/shared";
import { getCurrentSession } from "./supabase";

const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8787";

async function authHeaders(): Promise<Record<string, string>> {
  const session = await getCurrentSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function uploadPdf(file: File) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${apiBase}/api/documents/upload`, { method: "POST", headers: await authHeaders(), body });
  if (!response.ok) throw new Error("Không thể tải PDF lên máy chủ.");
  return response.json() as Promise<{ id: string; fileName: string; text: string; pageCount?: number }>;
}

export async function generateMindMap(text: string, documentId?: string) {
  const response = await fetch(`${apiBase}/api/ai/mind-map`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text, documentId }),
  });
  if (!response.ok) throw new Error("AI chưa sẵn sàng hoặc request đã quá giới hạn.");
  return response.json() as Promise<{ provider: string; graph: StructuredMindMap }>;
}
