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

    expect(buildSelectionPrompt({ action: "expand", text: "A selected idea", language: "en" })).toContain('"action":"summarize|explain|rewrite|expand"');
    expect(buildFlashcardsPrompt({ fileName: "notes.pdf", maxCards: 12, language: "en" })).toContain("notes.pdf");
  });

  it("accepts a fenced or wrapped mind-map object and normalizes optional values", () => {
    const graph = parseManualMindMap(`Here is the result:\n\`\`\`json\n${JSON.stringify({
      title: "Biology",
      nodes: [
        { id: "root", label: "Life", parentId: null, sourcePage: null },
        { id: "cell", label: "Cell", parentId: "root", sourcePage: 2 },
      ],
      edges: [{ id: "e1", source: "root", target: "cell", label: null }],
    })}\n\`\`\``);
    expect(graph.nodes[0].parentId).toBeUndefined();
    expect(graph.nodes[1].sourcePage).toBe(2);
    expect(graph.edges[0].label).toBeUndefined();
  });

  it("rejects unsafe or unusable graph relationships", () => {
    expect(() => parseManualMindMap(JSON.stringify({ title: "Bad", nodes: [{ id: "a", label: "A", parentId: "missing" }], edges: [] }))).toThrowError(ManualAiValidationError);
    expect(() => parseManualMindMap(JSON.stringify({ title: "Cycle", nodes: [{ id: "a", label: "A", parentId: "b" }, { id: "b", label: "B", parentId: "a" }], edges: [] }))).toThrowError(ManualAiValidationError);
  });

  it("requires the selected action and validates flashcard count", () => {
    expect(parseManualSelectionResult(JSON.stringify({ action: "rewrite", title: "Rewrite", text: "Updated", ideas: [] }), "rewrite")).toMatchObject({ provider: "manual", model: "Gemini Web" });
    expect(() => parseManualSelectionResult(JSON.stringify({ action: "summarize", title: "", text: "Wrong", ideas: [] }), "explain")).toThrowError(ManualAiValidationError);

    const cards = parseManualFlashcards(JSON.stringify({ title: "Review", cards: [{ front: "Q", back: "A", sourcePage: null }] }), 3);
    expect(cards.cards[0].sourcePage).toBeNull();
    expect(() => parseManualFlashcards(JSON.stringify({ title: "Too many", cards: [{ front: "1", back: "1" }, { front: "2", back: "2" }] }), 1)).toThrowError(ManualAiValidationError);
  });
});
