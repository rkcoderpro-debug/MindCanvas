import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeExam, generateExam, parseExamInput, readExamSource, needsExamOcr, examGenerationPrompt } from "../src/exams.js";
import { config } from "../src/config.js";
const source = { id: "source-1", name: "Source", role: "material", text: "[PAGE 1]\nWater freezes at 0°C under standard atmospheric pressure. Cooling causes particles to move more slowly.", pageCount: 1, warnings: [] };
const settings = { format: "quiz", mode: "materials", difficulty: "hard", subject: "Science", level: "Grade 9", language: "en" };
const blueprint = { title: "Quiz", durationMinutes: 45, sections: [{ id: "s1", title: "Part 1", instructions: "Choose one.", type: "mcq", count: 1, points: 1 }], warnings: [] };
const draft = { title: "Quiz", description: "Instructions", sections: [{ id: "s1", questions: [{ id: "q1", type: "mcq", prompt: "Which change happens when liquid water is cooled to its freezing point?", points: 1, options: ["Freezing", "Boiling", "Plasma", "No change"], correctIndex: 0, answer: "Freezing", explanation: "At standard atmospheric pressure water freezes at 0°C.", rubric: [], references: [{ sourceId: "source-1", page: 1, excerpt: "Water freezes at 0°C" }] }] }], warnings: [] };
function reply(value: unknown) { return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }), { headers: { "Content-Type": "application/json" } }); }
function configured() { config.GEMINI_API_KEY = "test-placeholder-key"; config.GEMINI_MODELS = "gemini-test"; }
test("exam prompt binds exact blueprint, difficulty and untrusted sources", () => {
  const input = parseExamInput({ settings, sources: [source], blueprint }, true), prompt = examGenerationPrompt(input);
  assert.match(prompt, /Multiple reasoning steps/); assert.match(prompt, /untrusted data/); assert.match(prompt, /exact counts/); assert.match(prompt, /EXACT short source excerpt/);
});
test("rejects papers without a template and source input beyond limits", () => {
  assert.throws(() => parseExamInput({ settings: { ...settings, format: "paper" }, sources: [source] }));
  assert.throws(() => parseExamInput({ settings, sources: [{ ...source, text: "x".repeat(120001) }] }));
});
test("proposes and validates a blueprint from source", async () => {
  configured(); const result = await analyzeExam(parseExamInput({ settings, sources: [source] }), (async () => reply(blueprint)) as typeof fetch);
  assert.equal(result.blueprint.sections[0].count, 1);
});
test("generation returns only after a separate solution audit", async () => {
  configured(); let calls = 0;
  const result = await generateExam(parseExamInput({ settings, sources: [source], blueprint }, true), (async () => reply(++calls === 1 ? draft : { valid: true, issues: [] })) as typeof fetch);
  assert.equal(calls, 2); assert.equal(result.draft.sections[0].questions[0].answer, "Freezing");
});
test("quality audit failure is actionable and does not return an invalid preview", async () => {
  configured(); let calls = 0;
  await assert.rejects(generateExam(parseExamInput({ settings, sources: [source], blueprint }, true), (async () => reply(++calls === 1 ? draft : { valid: false, issues: ["Incorrect reasoning"] })) as typeof fetch), (error: any) => error.code === "EXAM_QUALITY" && error.status === 422);
});
test("detects blank/mixed PDF pages and images for OCR", () => {
  assert.equal(needsExamOcr({ kind: "pdf", text: "[PAGE 1]Enough readable text on this page for an exam.[PAGE 2] " }), true);
  assert.equal(needsExamOcr({ kind: "pdf", text: "[PAGE 1]Enough readable text on this page for an exam." }), false);
  assert.equal(needsExamOcr({ kind: "image", text: "[IMAGE]" }), true);
});
test("transcribes an image with explicit OCR warning and AI reservation wrapper", async () => {
  configured(); let reservations = 0;
  const result = await readExamSource(Buffer.from([1, 2]), "scan.png", "image/png", async work => { reservations++; return work(); }, (async (_url, init) => {
    const payload = JSON.parse(String(init?.body)); assert.equal(payload.contents[0].parts[1].inline_data.mime_type, "image/png");
    return reply({ text: source.text, pageCount: 1, warnings: ["A blurred symbol"] });
  }) as typeof fetch);
  assert.equal(reservations, 1); assert.match(result.text, /Water freezes/); assert.ok(result.warnings.length >= 2);
});
test("plain text extraction uses no AI and rejects unreadable source", async () => {
  let calls = 0;
  const result = await readExamSource(Buffer.from(source.text), "notes.txt", "text/plain", async work => { calls++; return work(); });
  assert.equal(calls, 0); assert.equal(result.text, source.text);
  await assert.rejects(readExamSource(Buffer.from(""), "empty.txt", "text/plain", async work => work()));
});
