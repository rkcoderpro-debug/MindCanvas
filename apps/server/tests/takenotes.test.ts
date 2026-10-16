import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyNoteSettings } from "../../../packages/shared/src/takenotes.js";
import { generateNote, noteGenerationPrompt, parseNoteInput } from "../src/takenotes.js";
import { config } from "../src/config.js";
const source = { id: "source-1", name: "Lesson", role: "material", text: "The kinetic energy of a moving object equals one half of its mass multiplied by its squared speed.", warnings: [] };
test("notes require real readable sources within limits", () => {
  assert.throws(() => parseNoteInput({ settings: emptyNoteSettings(), sources: [] }));
  assert.throws(() => parseNoteInput({ settings: emptyNoteSettings(), sources: [{ ...source, text: "[UNREADABLE]" }] }));
  assert.throws(() => parseNoteInput({ settings: emptyNoteSettings(), sources: [{ ...source, text: "x".repeat(120001) }] }));
});
test("HTML prompt binds selected visuals, source grounding and sandbox requirements", () => {
  const prompt = noteGenerationPrompt(parseNoteInput({ settings: { ...emptyNoteSettings(), format: "html", visuals: ["simulation"] }, sources: [source] }));
  assert.match(prompt, /opaque origin/); assert.match(prompt, /units, assumptions/); assert.match(prompt, /untrusted source data/); assert.match(prompt, /kinetic energy/); assert.match(prompt, /simulation/);
});
test("notes generation validates real AI output through the existing Gemini scheduler adapter", async () => {
  config.GEMINI_API_KEY = "test-placeholder-key"; config.GEMINI_MODELS = "gemini-note-test";
  const response = { title: "Kinetic energy", content: "## Definition\n\nEnergy depends on mass and speed.", warnings: [] };
  const result = await generateNote(parseNoteInput({ settings: emptyNoteSettings(), sources: [source] }), (async (_url, init) => {
    const request = JSON.parse(String(init?.body)); assert.equal(request.generationConfig.responseMimeType, "application/json");
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }] }), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch);
  assert.deepEqual(result.note, response);
});
test("revision retains the original sources and requests a full replacement", () => {
  const prompt = noteGenerationPrompt(parseNoteInput({ settings: emptyNoteSettings(), sources: [source], revision: "Add an example", previous: "Previous note" }));
  assert.match(prompt, /FULL revised document/); assert.match(prompt, /Previous note/); assert.match(prompt, /Add an example/); assert.match(prompt, /SOURCE DATA/);
});
