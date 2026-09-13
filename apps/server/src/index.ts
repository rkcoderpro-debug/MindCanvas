import cors from "cors";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "./config.js";
import { requireAdmin, requireUser } from "./auth.js";
import { assignPlan, enforceQuota, getAccountPlan, getAdminSummary, getAdminUserDetail, listAdminUsers, PlanLimitError, recordUsage, type PlanId } from "./account.js";
import { extractDocument, UnsupportedDocumentError } from "./document.js";
import { generateWithFallback } from "./providers.js";
import { AIError } from "./gemini.js";
import { generateFlashcardsWithGemini, MAX_FLASHCARDS } from "./flashcards.js";
import { generateSelectionWithGemini, selectionActions } from "./selection.js";
import { aiScheduler } from "./aiScheduler.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_DOCUMENT_BYTES, files: 1 } });
app.use(cors({ origin: config.WEB_ORIGIN ?? true, credentials: true })); app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (_req, res) => res.json({
  ok: true,
  mode: "server",
  release: "4.0",
  ai: "gemini",
  aiConfigured: Boolean(config.GEMINI_API_KEY),
  aiModelCount: (config.GEMINI_MODELS ?? config.GEMINI_MODEL).split(",").filter(Boolean).length,
  aiCapacity: config.AI_MAX_CONCURRENT,
}));

app.get("/api/account/plan", requireUser, async (req, res) => {
  try { return res.json(await getAccountPlan(req.userId!)); }
  catch { return res.status(503).json({ error: "Account plan service is temporarily unavailable." }); }
});

app.get("/api/admin/me", requireUser, (req, res) => {
  const isAdmin = Boolean(config.ADMIN_EMAIL && config.SUPABASE_SERVICE_ROLE_KEY && (req.userEmail ?? "").trim().toLocaleLowerCase() === config.ADMIN_EMAIL.trim().toLocaleLowerCase());
  return res.json({ isAdmin });
});

app.get("/api/admin/summary", requireAdmin, async (_req, res) => {
  try { return res.json(await getAdminSummary()); }
  catch { return res.status(503).json({ error: "Admin service is temporarily unavailable." }); }
});

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.slice(0, 120) : "";
  const plan = typeof req.query.plan === "string" ? req.query.plan : "";
  if (plan && !["free", "plus", "pro", "max"].includes(plan)) return res.status(400).json({ error: "Invalid plan filter." });
  try { return res.json({ users: await listAdminUsers(query, plan) }); }
  catch { return res.status(503).json({ error: "Admin service is temporarily unavailable." }); }
});

app.get("/api/admin/users/:userId", requireAdmin, async (req, res) => {
  const userId = typeof req.params.userId === "string" ? req.params.userId : "";
  if (!z.string().uuid().safeParse(userId).success) return res.status(400).json({ error: "Invalid user id." });
  try { return res.json(await getAdminUserDetail(userId)); }
  catch { return res.status(503).json({ error: "Admin user details are temporarily unavailable." }); }
});

const planAssignmentInput = z.object({
  planId: z.enum(["free", "plus", "pro", "max"]),
  expiresAt: z.string().trim().max(64).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
app.patch("/api/admin/users/:userId/plan", requireAdmin, async (req, res) => {
  const userId = typeof req.params.userId === "string" ? req.params.userId : "";
  if (!z.string().uuid().safeParse(userId).success) return res.status(400).json({ error: "Invalid user id." });
  const parsed = planAssignmentInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid plan assignment." });
  const expiresAt = parsed.data.expiresAt || null;
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) return res.status(400).json({ error: "Invalid expiration date." });
  try {
    await assignPlan(req.userId!, userId, parsed.data.planId as PlanId, expiresAt, parsed.data.note || null);
    return res.json({ ok: true });
  } catch { return res.status(503).json({ error: "Could not update the user plan." }); }
});

function sendAiError(res: express.Response, error: unknown, fallbackMessage: string) {
  if (error instanceof PlanLimitError) return res.status(error.quota === "storage" ? 413 : 429).json({ error: error.message, code: "PLAN_LIMIT", quota: error.quota, retryable: false });
  if (error instanceof AIError) {
    if (error.retryAfterSeconds) res.set("Retry-After", String(error.retryAfterSeconds));
    return res.status(error.status).json({
      error: error.message,
      code: error.code,
      retryable: error.code === "AI_BUSY" || error.code === "AI_UNAVAILABLE",
      retryAfterSeconds: error.retryAfterSeconds,
    });
  }
  return res.status(502).json({ error: fallbackMessage, code: "AI_FAILED", retryable: false });
}

app.post("/api/documents/upload", requireUser, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A source file is required." });
  try {
    await enforceQuota(req.userId!, "storage", req.file.size);
    const extracted = await extractDocument(req.file.buffer, req.file.originalname, req.file.mimetype);
    await recordUsage(req.userId!, "document_upload", 1, req.file.size, { fileName: req.file.originalname, mimeType: req.file.mimetype });
    return res.json({ id: crypto.randomUUID(), ...extracted });
  } catch (error) {
    if (error instanceof PlanLimitError) return sendAiError(res, error, "Account limit reached.");
    if (error instanceof UnsupportedDocumentError) return res.status(415).json({ error: error.message, code: error.code });
    return res.status(422).json({ error: "Document text extraction failed." });
  }
});

const aiInput = z.object({ text: z.string().min(1).max(120000), documentId: z.string().optional() });
app.post("/api/ai/mind-map", requireUser, async (req, res) => {
  const parsed = aiInput.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Invalid document input." });
  try { await enforceQuota(req.userId!, "ai_auto"); const result = await aiScheduler.run(req.userId!, () => generateWithFallback(parsed.data)); await recordUsage(req.userId!, "ai_mind_map", 1, 0, { source: "text" }); return res.json(result); }
  catch (error) { return sendAiError(res, error, "AI processing failed."); }
});

const aiFileInput = z.object({ task: z.enum(["mind-map", "flashcards"]), maxCards: z.coerce.number().int().min(3).max(MAX_FLASHCARDS).default(20) });
app.post("/api/ai/file", requireUser, upload.single("file"), async (req, res) => {
  const parsed = aiFileInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid file AI request." });
  if (!req.file) return res.status(400).json({ error: "A source file is required." });
  try {
    await enforceQuota(req.userId!, "ai_auto");
    await enforceQuota(req.userId!, "storage", req.file.size);
    const source = await extractDocument(req.file.buffer, req.file.originalname, req.file.mimetype);
    const documentId = crypto.randomUUID();
    const result: any = parsed.data.task === "mind-map"
      ? await aiScheduler.run(req.userId!, () => generateWithFallback({ text: source.text, documentId, image: source.image }))
      : await aiScheduler.run(req.userId!, () => generateFlashcardsWithGemini({ text: source.text, documentId, maxCards: parsed.data.maxCards, image: source.image }));
    await recordUsage(req.userId!, "document_upload", 1, req.file.size, { fileName: req.file.originalname, mimeType: req.file.mimetype, source: "ai" });
    await recordUsage(req.userId!, parsed.data.task === "mind-map" ? "ai_mind_map" : "ai_flashcards", 1, 0, { source: "file", cardCount: result.cards?.length ?? 0 });
    return res.json({ ...result, source: { id: documentId, kind: source.kind, fileName: source.fileName, mimeType: source.mimeType, text: source.text, pageCount: source.pageCount } });
  } catch (error) {
    if (error instanceof PlanLimitError) return sendAiError(res, error, "Account limit reached.");
    if (error instanceof UnsupportedDocumentError) return res.status(415).json({ error: error.message, code: error.code });
    return sendAiError(res, error, parsed.data.task === "mind-map" ? "File AI processing failed." : "Flashcard generation failed.");
  }
});

const flashcardInput = aiInput.extend({ maxCards: z.coerce.number().int().min(3).max(MAX_FLASHCARDS).default(20) });
app.post("/api/ai/flashcards", requireUser, async (req, res) => {
  const parsed = flashcardInput.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Invalid flashcard input." });
  try { await enforceQuota(req.userId!, "ai_auto"); const result = await aiScheduler.run(req.userId!, () => generateFlashcardsWithGemini(parsed.data)); await recordUsage(req.userId!, "ai_flashcards", 1, 0, { source: "text", cardCount: result.cards.length }); return res.json(result); }
  catch (error) { return sendAiError(res, error, "Flashcard generation failed."); }
});

const selectionInput = z.object({
  action: z.enum(selectionActions),
  text: z.string().trim().min(1).max(30000),
  language: z.enum(["vi", "en"]).default("vi"),
});
app.post("/api/ai/selection", requireUser, async (req, res) => {
  const parsed = selectionInput.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Invalid selection input." });
  try { await enforceQuota(req.userId!, "ai_auto"); const result = await aiScheduler.run(req.userId!, () => generateSelectionWithGemini(parsed.data)); await recordUsage(req.userId!, "ai_selection", 1, 0, { source: "selection", action: parsed.data.action }); return res.json(result); }
  catch (error) { return sendAiError(res, error, "Selection AI failed."); }
});

app.listen(config.PORT, () => console.log(`MindCanvas API listening on ${config.PORT}`));
