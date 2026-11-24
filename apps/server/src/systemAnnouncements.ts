import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "./auth.js";
import { config } from "./config.js";

type Announcement = { id: string; title: string; body: string; published_at: string };
const pageSize = 30;
const publishInput = z.object({
  requestId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
}).strict();
const cursorInput = z.union([
  z.object({ before: z.undefined(), beforeId: z.undefined() }),
  z.object({ before: z.string().datetime({ offset: true }), beforeId: z.string().uuid() }),
]);

async function serviceCall<T>(path: string, body?: object): Promise<T> {
  const key = config.SUPABASE_SERVICE_ROLE_KEY;
  if (!config.SUPABASE_URL || !key) throw new Error("MISSING_SERVICE_CONFIGURATION");
  const response = await fetch(`${config.SUPABASE_URL}/rest/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { code?: string } | null;
    throw new Error(result?.code === "23505" ? "ANNOUNCEMENT_REQUEST_CONFLICT" : "ANNOUNCEMENT_SERVICE_UNAVAILABLE");
  }
  return response.json() as Promise<T>;
}

export const systemAnnouncementsAdmin = Router();
systemAnnouncementsAdmin.use(requireAdmin);
systemAnnouncementsAdmin.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const cursor = cursorInput.safeParse({ before: req.query.before, beforeId: req.query.beforeId });
  if (!cursor.success) return res.status(400).json({ error: "Invalid announcement cursor." });
  const search = new URLSearchParams({ select: "id,title,body,published_at", order: "published_at.desc,id.desc", limit: String(pageSize + 1) });
  if (cursor.data.before) {
    search.set("or", `(published_at.lt.${cursor.data.before},and(published_at.eq.${cursor.data.before},id.lt.${cursor.data.beforeId}))`);
  }
  try {
    const rows = await serviceCall<Announcement[]>(`system_announcements?${search}`);
    return res.json({ items: rows.slice(0, pageSize), hasMore: rows.length > pageSize });
  } catch { return res.status(503).json({ error: "System announcements are temporarily unavailable." }); }
});

systemAnnouncementsAdmin.post("/", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const body = publishInput.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid system announcement." });
  try {
    const input = body.data;
    const item = await serviceCall<Announcement>("rpc/publish_system_announcement", {
      p_id: input.requestId, p_admin: req.userId!, p_title: input.title, p_body: input.body,
    });
    return res.status(201).json({ item });
  } catch (err) {
    if (err instanceof Error && err.message === "ANNOUNCEMENT_REQUEST_CONFLICT")
      return res.status(409).json({ error: "Announcement request already used.", code: err.message });
    return res.status(503).json({ error: "Could not publish system announcement." });
  }
});
