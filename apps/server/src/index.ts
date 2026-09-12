import cors from "cors";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "./config.js";
import { requireUser } from "./auth.js";
import { extractDocument, UnsupportedDocumentError } from "./document.js";
import { generateWithFallback } from "./providers.js";
import { AIError } from "./gemini.js";
import { generateFlashcardsWithGemini } from "./flashcards.js";
import { generateSelectionWithGemini, selectionActions } from "./selection.js";
import { aiScheduler } from "./aiScheduler.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_DOCUMENT_BYTES, files: 1 } });
app.use(cors({ origin: config.WEB_ORIGIN ?? true, credentials: true })); app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (_req, res) => res.json({
  ok: true,
  mode: "server",
  release: "3.8.0",
  ai: "gemini",
  aiConfigured: Boolean(config.GEMINI_API_KEY),
  aiModelCount: (config.GEMINI_MODELS ?? config.GEMINI_MODEL).split(",").filter(Boolean).length,
  aiCapacity: config.AI_MAX_CONCURRENT,
}));

function sendAiError(res: express.Response, error: unknown, fallbackMessage: string) {
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
    const extracted = await extractDocument(req.file.buffer, req.file.originalname, req.file.mimetype);
    return res.json({ id: crypto.randomUUID(), ...extracted });
  } catch (error) {
    if (error instanceof UnsupportedDocumentError) return res.status(415).json({ error: error.message, code: error.code });
    return res.status(422).json({ error: "Document text extraction failed." });
  }
});

const aiInput = z.object({ text: z.string().min(1).max(120000), documentId: z.string().optional() });
app.post("/api/ai/mind-map", requireUser, async (req, res) => {
  const parsed = aiInput.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Invalid document input." });
  try { const result = await aiScheduler.run(req.userId!, () => generateWithFallback(parsed.data)); return res.json(result); }
  catch (error) { return sendAiError(res, error, "AI processing failed."); }
});

const aiFileInput = z.object({ task: z.enum(["mind-map", "flashcards"]), maxCards: z.coerce.number().int().min(3).max(50).default(20) });
app.post("/api/ai/file", requireUser, upload.single("file"), async (req, res) => {
  const parsed = aiFileInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid file AI request." });
  if (!req.file) return res.status(400).json({ error: "A source file is required." });
  try {
    const source = await extractDocument(req.file.buffer, req.file.originalname, req.file.mimetype);
    const documentId = crypto.randomUUID();
    const result = parsed.data.task === "mind-map"
      ? await aiScheduler.run(req.userId!, () => generateWithFallback({ text: source.text, documentId, image: source.image }))
      : await aiScheduler.run(req.userId!, () => generateFlashcardsWithGemini({ text: source.text, documentId, maxCards: parsed.data.maxCards, image: source.image }));
    return res.json({ ...result, source: { id: documentId, kind: source.kind, fileName: source.fileName, mimeType: source.mimeType, text: source.text, pageCount: source.pageCount } });
  } catch (error) {
    if (error instanceof UnsupportedDocumentError) return res.status(415).json({ error: error.message, code: error.code });
    return sendAiError(res, error, parsed.data.task === "mind-map" ? "File AI processing failed." : "Flashcard generation failed.");
  }
});

const flashcardInput = aiInput.extend({ maxCards: z.coerce.number().int().min(3).max(50).default(20) });
app.post("/api/ai/flashcards", requireUser, async (req, res) => {
  const parsed = flashcardInput.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Invalid flashcard input." });
  try { const result = await aiScheduler.run(req.userId!, () => generateFlashcardsWithGemini(parsed.data)); return res.json(result); }
  catch (error) { return sendAiError(res, error, "Flashcard generation failed."); }
});

const selectionInput = z.object({
  action: z.enum(selectionActions),
  text: z.string().trim().min(1).max(30000),
  language: z.enum(["vi", "en"]).default("vi"),
});
app.post("/api/ai/selection", requireUser, async (req, res) => {
  const parsed = selectionInput.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Invalid selection input." });
  try { return res.json(await aiScheduler.run(req.userId!, () => generateSelectionWithGemini(parsed.data))); }
  catch (error) { return sendAiError(res, error, "Selection AI failed."); }
});

app.listen(config.PORT, () => console.log(`MindCanvas API listening on ${config.PORT}`));
