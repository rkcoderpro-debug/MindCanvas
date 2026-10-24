import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyNoteSettings } from "../../../packages/shared/src/takenotes.js";
import { generateNote, noteGenerationPrompt, parseNoteInput } from "../src/takenotes.js";
import { config } from "../src/config.js";
import { validateHubOutline, validateHubChapter } from "../../../packages/shared/src/learningHub.js";
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

const hubGoal = (id: string) => ({ id, title: `Goal ${id}`, sourceRefs: [{ sourceId: source.id, location: "Paragraph 1" }] });
function hubChapter(n: number) {
  const objective = { ...hubGoal(`o${n}`), explanation: "Energy is associated with motion.", terms: "Mass in kg, speed in m/s, energy in J.", example: "At 2 kg and 4 m/s, energy is 16 J.", misconception: "Speed is squared, not multiplied by two.", recall: "E = ½mv²", visual: null };
  return { id: `ch${n}`, title: `Chapter ${n}`, summary: "Energy concepts", objectives: [objective], questions: [0, 1].map(k => ({ id: `ch${n}q${k}`, objectiveId: objective.id, prompt: `Question ${n}-${k}`, options: [{ id: "a", text: "16 J" }, { id: "b", text: "8 J" }], answerId: "a", explanation: "E = ½ × 2 × 4² = 16 J", difficulty: "basic" })) };
}
test("HTML Auto first maps all chapters then fills each chapter and assembles a working offline hub", async () => {
  config.GEMINI_API_KEY = "test-placeholder-key"; config.GEMINI_MODELS = "gemini-hub-test";
  const chapters = [hubChapter(1), hubChapter(2)];
  const outline = { title: "Energy hub", summary: "Learn through chapters", warnings: ["Check source mapping"], chapters: chapters.map(c => ({ ...c, objectives: c.objectives.map(o => hubGoal(o.id)), questions: undefined })) };
  const responses = [outline, ...chapters], prompts: string[] = [];
  const result = await generateNote(parseNoteInput({ settings: { ...emptyNoteSettings(), format: "html", questionsPerRound: 3 }, sources: [source] }), (async (_url, init) => {
    const req = JSON.parse(String(init?.body)); prompts.push(req.contents[0].parts[0].text);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(responses.shift()) }] } }] }));
  }) as typeof fetch);
  assert.equal(prompts.length, 3); assert.match(prompts[0], /STAGE 1/); assert.match(prompts[1], /STAGE 2/); assert.match(prompts[2], /ch2/);
  assert.match(result.note.content, /mindcanvas-learning-hub/); assert.match(result.note.content, /Chapter 2/); assert.match(result.note.content, /pickHubRound/);
  assert.deepEqual(result.note.warnings, ["Check source mapping"]);
});
test("source audit rejects missing sources and chapter validation rejects removed or relabeled goals", () => {
  const chapter = hubChapter(1);
  const outline = validateHubOutline({ title: "Hub", summary: "Summary", warnings: [], chapters: [chapter] }, [source.id]);
  assert.throws(() => validateHubOutline(outline, [source.id, "unmapped-source"]), /nguồn/);
  assert.throws(() => validateHubChapter({ ...chapter, objectives: [{ ...chapter.objectives[0], title: "Different objective" }] }, outline.chapters[0]), /mục tiêu/);
  assert.throws(() => validateHubChapter({ ...chapter, questions: chapter.questions.slice(0, 1) }, outline.chapters[0]));
});
test("a failed chapter stops HTML Auto without returning a partial hub", async () => {
  config.GEMINI_API_KEY = "test-placeholder-key"; config.GEMINI_MODELS = "gemini-hub-failure";
  const chapter = hubChapter(1), outline = { title: "Hub", summary: "Summary", warnings: [], chapters: [chapter] }; let calls = 0;
  await assert.rejects(generateNote(parseNoteInput({ settings: { ...emptyNoteSettings(), format: "html" }, sources: [source] }), (async () => {
    calls++; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(calls === 1 ? outline : { ...chapter, questions: [] }) }] } }] }));
  }) as typeof fetch));
  assert.equal(calls, 2);
});
