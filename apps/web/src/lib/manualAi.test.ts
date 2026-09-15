import { describe, expect, it } from "vitest";
import {
  buildFlashcardsPrompt,
  buildMindMapPrompt,
  buildSelectionPrompt,
  ManualAiValidationError,
  parseManualFlashcards,
  parseManualMindMap,
  parseManualSelectionResult,
} from "./manualAi";

describe("manual AI exchange", () => {
  it("builds explicit prompts with a JSON-only contract", () => {
    const prompt = buildMindMapPrompt({ text: "Mục tiêu học tập", language: "vi" });
    expect(prompt).toContain("Return exactly one valid JSON object");
    expect(prompt).toContain("Mục tiêu học tập");
    expect(prompt).toContain('"parentId"');
    expect(buildMindMapPrompt({ fileName: "notes.pdf", detail: "detailed", language: "en" })).toContain("Detail level: detailed");
    expect(buildMindMapPrompt({ fileName: "notes.pdf", detail: "basic", language: "en" })).toContain("Detail level: basic");
    const qualityPrompt = buildMindMapPrompt({ fileName: "notes.pdf", detail: "medium", language: "en", options: { difficulty: "hard", depth: "detailed" } });
    expect(qualityPrompt).not.toContain("Difficulty:");
    expect(qualityPrompt).toContain("Depth: detailed");

    expect(buildSelectionPrompt({ action: "expand", text: "A selected idea", language: "en" })).toContain('"action":"summarize|explain|rewrite|expand"');
    expect(buildSelectionPrompt({ action: "organize", text: "NODE root: Root", language: "en", scope: { rootId: "root", nodeIds: ["root"], edges: [] } })).toContain('"operations":[]');
    const flashcardPrompt = buildFlashcardsPrompt({ fileName: "notes.pdf", maxCards: 12, language: "en" });
    expect(flashcardPrompt).toContain("notes.pdf");
    expect(flashcardPrompt).toContain("mindcanvas-flashcards.json");
    expect(flashcardPrompt).toContain("Create no more than 12 useful cards");
    expect(flashcardPrompt).toContain("escape every internal ASCII double quote");
    expect(buildFlashcardsPrompt({ fileName: "notes.pdf", maxCards: 12, language: "en", options: { difficulty: "hard", depth: "detailed" } })).toContain("Difficulty: hard");
  });

  it("accepts a fenced or wrapped mind-map object and normalizes optional values", () => {
    const graph = parseManualMindMap(`Here is the result:\n\`\`\`json\n${JSON.stringify({
      title: "Biology",
      nodes: [
        { id: "root", label: "Life", parentId: null, sourcePage: null },
        { id: "cell", label: "Cell", parentId: "root", sourcePage: 2 },
      ],
      edges: [{ id: "e1", source: "root", target: "cell", kind: "branch", label: null }],
    })}\n\`\`\``);
    expect(graph.nodes[0].parentId).toBeUndefined();
    expect(graph.nodes[1].sourcePage).toBe(2);
    expect(graph.edges[0].label).toBeUndefined();
    expect(graph.edges[0].kind).toBe("branch");
  });

  it("rejects unsafe or unusable graph relationships", () => {
    expect(() => parseManualMindMap(JSON.stringify({ title: "Bad", nodes: [{ id: "a", label: "A", parentId: "missing" }], edges: [] }))).toThrowError(ManualAiValidationError);
    expect(() => parseManualMindMap(JSON.stringify({ title: "Cycle", nodes: [{ id: "a", label: "A", parentId: "b" }, { id: "b", label: "B", parentId: "a" }], edges: [] }))).toThrowError(ManualAiValidationError);
  });

  it("requires the selected action and validates flashcard count", () => {
    expect(parseManualSelectionResult(JSON.stringify({ action: "rewrite", title: "Rewrite", text: "Updated", ideas: [] }), "rewrite")).toMatchObject({ provider: "manual", model: "Manual AI" });
    expect(() => parseManualSelectionResult(JSON.stringify({ action: "summarize", title: "", text: "Wrong", ideas: [] }), "explain")).toThrowError(ManualAiValidationError);

    const cards = parseManualFlashcards(JSON.stringify({ title: "Review", cards: [{ front: "Q", back: "A", sourcePage: null }] }), 3);
    expect(cards.cards[0].sourcePage).toBeNull();
    expect(() => parseManualFlashcards(JSON.stringify({ title: "Too many", cards: [{ front: "1", back: "1" }, { front: "2", back: "2" }] }), 1)).toThrowError(ManualAiValidationError);
  });

  it("validates manual organization operations before the preview can be applied", () => {
    const result = parseManualSelectionResult(JSON.stringify({ action: "organize", title: "Layout", text: "Organized", ideas: [], operations: [{ op: "update", id: "child", label: "New label" }, { op: "link", source: "child", target: "root", label: "supports" }] }), "organize");
    expect(result.operations).toHaveLength(2);
    expect(() => parseManualSelectionResult(JSON.stringify({ action: "organize", title: "Bad", text: "x", ideas: [], operations: [{ op: "link", source: "root", target: "root" }] }), "organize")).toThrowError(ManualAiValidationError);
    expect(() => parseManualSelectionResult(JSON.stringify({ action: "organize", title: "Bad", text: "x", ideas: [], operations: [{ op: "add", id: "new", label: "New", x: 100 }] }), "organize")).toThrowError(ManualAiValidationError);
  });

  it("repairs common Gemini quotes and accepts up to 500 manual cards", () => {
    const malformed = String.raw`{"title":"Review","cards":[{"front":"Từ "迷" (mí) có nghĩa là gì?","back":"Mê, say mê.","sourcePage":1}]}`;
    expect(parseManualFlashcards(malformed, 500).cards[0].front).toContain("迷");
    const cards = Array.from({ length: 500 }, (_, index) => ({ front: `Question ${index}`, back: `Answer ${index}`, sourcePage: null }));
    expect(parseManualFlashcards(JSON.stringify({ title: "Large set", cards }), 500).cards).toHaveLength(500);
  });
});
