import { describe, expect, it } from "vitest";
import { applyGraph, applySelectionAi, blankBoard, connect, duplicateElement, elementBounds, exportCanvasSvg, hiddenNodes, moveElement, parseBoard, removeElement, resizeElement, selectionToStudyText } from "./board";
import { en, vi } from "./i18n";
const board = () => ({ ...blankBoard(), nodes: [{ id: "a", label: "A", x: 0, y: 0, width: 150, height: 60 }, { id: "b", label: "B", x: 250, y: 0, width: 150, height: 60 }] });
describe("Editable canvas model", () => {
  it("starts with no sample content and a movable dot-paper background", () => { const b = blankBoard(); expect(b.nodes.length + b.texts.length + b.shapes.length + b.drawings.length + b.edges.length).toBe(0); expect(b.background).toBe("dots"); expect(b.id).not.toBe(blankBoard().id); });
  it("moves independent strokes without touching nodes", () => { const b = { ...board(), drawings: [{ id: "p", points: [{ x: 2, y: 3 }], color: "#123456", width: 3, opacity: 1 }] }; const next = moveElement(b, { kind: "drawings", id: "p" }, 20, 30); expect(next.drawings[0].points[0]).toEqual({ x: 22, y: 33 }); expect(next.nodes).toBe(b.nodes); });
  it("resizes drawings and keeps originals immutable", () => { const b = { ...board(), drawings: [{ id: "p", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: "#123456", width: 3, opacity: 1 }] }; const next = resizeElement(b, { kind: "drawings", id: "p" }, 30, 40); expect(next.drawings[0].points[1]).toEqual({ x: 30, y: 40 }); expect(b.drawings[0].points[1]).toEqual({ x: 10, y: 10 }); });
  it("connectors track ids after moves and are removed with endpoints", () => { const b = connect(board(), "a", "b"); const next = moveElement(b, { kind: "nodes", id: "a" }, 100, 20); expect(next.edges).toEqual(b.edges); expect(next.nodes[0].x).toBe(100); expect(removeElement(next, { kind: "nodes", id: "a" }).edges).toHaveLength(0); expect(connect(b, "a", "b").edges).toHaveLength(1); });
  it("duplicates with fresh IDs and offsets", () => { const b = board(), next = duplicateElement(b, { kind: "nodes", id: "a" }); expect(next.board.nodes).toHaveLength(3); expect(next.selection.id).not.toBe("a"); expect(next.board.nodes[2].x).toBe(24); });
  it("AI Apply preserves existing content and remaps all IDs on repeated applies", () => { const b = board(), g = { title: "Map", nodes: [{ id: "a", label: "AI A" }, { id: "b", label: "AI B" }], edges: [{ id: "edge", source: "a", target: "b" }] }; const once = applyGraph(b, g), twice = applyGraph(once, g); expect(twice.nodes).toHaveLength(6); expect(new Set(twice.nodes.map(n => n.id)).size).toBe(6); expect(twice.title).toBe(b.title); expect(twice.edges[0].source).not.toBe("a"); });
  it("keeps private PDF source metadata on every generated mind-map node", () => {
    const next = applyGraph(board(), { title: "PDF map", sourceDocumentId: "document-1", sourceDocumentName: "biology.pdf", nodes: [{ id: "root", label: "Cell", sourcePage: 4 }], edges: [] });
    expect(next.nodes.at(-1)).toMatchObject({ sourceDocumentId: "document-1", sourcePage: 4 });
    expect(next.sourceDocuments).toEqual([{ id: "document-1", name: "biology.pdf" }]);
  });
  it("bounds legacy text and supports multiline", () => { const b = { ...board(), texts: [{ id: "t", x: 20, y: 40, width: 200, text: "one\ntwo" }] }; expect(elementBounds(b, { kind: "texts", id: "t" })?.height).toBeGreaterThan(40); });
  it("validates old file format and rejects corrupt geometry", () => { expect(parseBoard(board()).nodes).toHaveLength(2); expect(() => parseBoard({ ...board(), viewport: { x: 0, y: 0, scale: 0 } })).toThrow(); expect(() => parseBoard({ ...board(), nodes: [{ ...board().nodes[0], width: NaN }] })).toThrow(); expect(() => parseBoard({ ...board(), nodes: [board().nodes[0], board().nodes[0]] })).toThrow(); });
  it("validates backgrounds and rich-text properties without breaking legacy boards", () => {
    const rich = { ...board(), background: "ruled" as const, texts: [{ id: "text", text: "Study", x: 10, y: 30, width: 200, bold: true, italic: true, underline: true, textAlign: "center" as const, backgroundColor: "#fff2cc" }] };
    expect(parseBoard(rich)).toMatchObject({ background: "ruled", texts: [{ bold: true, textAlign: "center" }] });
    expect(() => parseBoard({ ...board(), background: "wallpaper" })).toThrow("Invalid canvas background");
  });
  it("collapses descendants safely even with cycles", () => { const b = connect(connect(board(), "a", "b"), "b", "a"); b.nodes[0] = { ...b.nodes[0], collapsed: true } as typeof b.nodes[0]; expect([...hiddenNodes(b)]).toEqual(["b"]); });
  it("has full parity between Vietnamese and English UI dictionaries", () => { expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort()); expect(Object.values(vi).every(Boolean)).toBe(true); });
  it("exports an editable board as a bounded SVG with labels and escaped text", () => {
    const b = { ...board(), texts: [{ id: "t", text: "A & B", x: 20, y: 100, width: 160 }], edges: [{ id: "e", source: "a", target: "b", label: "leads to" }] };
    const svg = exportCanvasSvg(b); expect(svg).toContain("A &amp; B"); expect(svg).toContain("leads to"); expect(svg).toContain("mindcanvas-arrow"); expect(svg).toContain('viewBox=');
  });
  it("exports the selected paper style and rich text formatting", () => {
    const svg = exportCanvasSvg({ ...blankBoard(), background: "graph", texts: [{ id: "t", text: "Key fact", x: 10, y: 40, width: 200, bold: true, textAlign: "right", backgroundColor: "#fff2cc" }] });
    expect(svg).toContain('id="mindcanvas-bg"'); expect(svg).toContain('font-weight="700"'); expect(svg).toContain('text-anchor="end"'); expect(svg).toContain("#fff2cc");
  });
  it("exports wrapped node labels with a portable font and readable dark-node text", () => {
    const svg = exportCanvasSvg({ ...blankBoard(), nodes: [{ id: "long", label: "A long editable mind map label that must stay inside its node", x: 10, y: 20, width: 150, height: 90, color: "#172554", sourcePage: 8 }] });
    expect((svg.match(/<tspan/g) ?? []).length).toBeGreaterThan(2);
    expect(svg).toContain('font-family="Inter,Arial,Helvetica,sans-serif"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain("Page 8");
  });
  it("uses the active export palette for both paper and connectors", () => {
    const palette = { canvas: "#111111", dot: "#222222", grid: "#333333", gridMinor: "#444444", gridMajor: "#555555", rule: "#666666", margin: "#777777", text: "#eeeeee", nodeFill: "#888888", elementStroke: "#999999", connector: "#abcdef", muted: "#bbbbbb", surface: "#121212" };
    const svg = exportCanvasSvg({ ...board(), edges: [{ id: "edge", source: "a", target: "b" }] }, palette);
    expect(svg).toContain('fill="#111111"'); expect(svg).toContain('stroke="#abcdef"');
  });
  it("uses only selected study content and applies contextual AI as editable elements", () => {
    const b = { ...blankBoard(), texts: [{ id: "t", text: "Mitosis", x: 20, y: 40, width: 200 }], nodes: [{ id: "n", label: "Cell cycle", x: 300, y: 20, width: 190, height: 76 }] };
    expect(selectionToStudyText(b, [{ kind: "texts", id: "t" }])).toBe("Mitosis");
    const rewritten = applySelectionAi(b, [{ kind: "texts", id: "t" }], { action: "rewrite", title: "Rewrite", text: "Cell division", ideas: [] });
    expect(rewritten.texts[0].text).toBe("Cell division");
    const expanded = applySelectionAi(b, [{ kind: "nodes", id: "n" }], { action: "expand", title: "Cycle", text: "Overview", ideas: ["G1", "S", "G2"] });
    expect(expanded.nodes).toHaveLength(4); expect(expanded.edges).toHaveLength(3); expect(expanded.nodes.slice(1).every(node => node.parentId === "n")).toBe(true);
  });
});
