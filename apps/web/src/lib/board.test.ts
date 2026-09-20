import { describe, expect, it } from "vitest";
import { applyGraph, applyMindMapAiOperations, applySelectionAi, arrangeMindMapMultiSided, blankBoard, connect, connectorGeometry, connectorPath, duplicateElement, elementBounds, exportCanvasSvg, hiddenNodes, moveElement, parseBoard, removeElement, resizeElement, selectionToStudyText } from "./board";
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
    const rich = { ...board(), background: "ruled" as const, texts: [{ id: "text", text: "Study", x: 10, y: 30, width: 200, bold: true, italic: true, underline: true, textAlign: "center" as const, backgroundColor: "#fff2cc", opacity: .42 }] };
    expect(parseBoard(rich)).toMatchObject({ background: "ruled", texts: [{ bold: true, textAlign: "center" }] });
    expect(parseBoard(rich).texts[0].opacity).toBe(.42);
    const imageBackground = { kind: "image" as const, src: "data:image/png;base64,AA==", name: "paper.png", mimeType: "image/png", opacity: .62, blur: 4, brightness: 1.1, fit: "contain" as const, position: "center", overlay: "#000000" };
    expect(parseBoard({ ...board(), background: imageBackground }).background).toEqual(imageBackground);
    expect(exportCanvasSvg({ ...board(), background: imageBackground })).toContain('href="data:image/png;base64,AA=="');
    const videoBackground = { kind: "video" as const, src: "https://cdn.example.test/paper.mp4", name: "paper.mp4" };
    expect(exportCanvasSvg({ ...board(), background: videoBackground })).toContain("paper.mp4");
    expect(() => parseBoard({ ...board(), background: "wallpaper" })).toThrow("Invalid canvas background");
    expect(() => parseBoard({ ...board(), background: { ...imageBackground, opacity: 2 } })).toThrow("Invalid canvas background");
    expect(() => parseBoard({ ...board(), background: { ...imageBackground, src: "data:text/plain;base64,AA==" } })).toThrow("Invalid canvas background");
    expect(() => parseBoard({ ...board(), shapes: [{ id: "shape", kind: "rect", x: 0, y: 0, width: 40, height: 40, color: "#ffffff", opacity: 1.1 }] })).toThrow("Invalid opacity");
  });
  it("persists and exports triangle shapes", () => {
    const triangle = { id: "triangle", kind: "triangle" as const, x: 10, y: 20, width: 120, height: 100, color: "#abcdef" };
    const parsed = parseBoard({ ...blankBoard(), shapes: [triangle] });
    expect(parsed.shapes[0]).toEqual(triangle);
    expect(exportCanvasSvg(parsed)).toContain('<polygon points="70,20 130,120 10,120"');
  });
  it("persists, moves, resizes and exports embedded media", () => {
    const media = { id: "image", kind: "image" as const, src: "data:image/png;base64,iVBORw0KGgo=", name: "diagram.png", mimeType: "image/png", x: 20, y: 30, width: 240, height: 160, crop: { top: 5, right: 10, bottom: 15, left: 20 } };
    const audio = { id: "audio", kind: "audio" as const, src: "data:audio/webm;base64,AA==", name: "voice.webm", x: 20, y: 220, width: 240, height: 100, trimStart: 2, trimEnd: 8 };
    const embed = { id: "embed", kind: "youtube" as const, url: "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0", title: "Study video", x: 300, y: 30, width: 480, height: 340 };
    const b = { ...blankBoard(), media: [media, audio], embeds: [embed] };
    expect(parseBoard(b).media).toEqual([media, audio]);
    expect(parseBoard(b).embeds).toEqual([embed]);
    expect(elementBounds(b, { kind: "media", id: "image" })).toMatchObject({ x: 20, y: 30, width: 240, height: 160 });
    expect(moveElement(b, { kind: "media", id: "image" }, 10, 15).media[0]).toMatchObject({ x: 30, y: 45 });
    expect(resizeElement(b, { kind: "media", id: "image" }, 320, 200).media[0]).toMatchObject({ width: 320, height: 200 });
    expect(exportCanvasSvg(b)).toContain("data:image/png;base64");
    expect(exportCanvasSvg(b)).toContain("media-crop-image");
    expect(exportCanvasSvg(b)).toContain("Study video");
    const legacy = { ...blankBoard() } as Record<string, unknown>;
    delete legacy.media;
    delete legacy.embeds;
    expect(parseBoard(legacy).media).toEqual([]);
    expect(parseBoard(legacy).embeds).toEqual([]);
    expect(() => parseBoard({ ...b, media: [{ ...media, crop: { top: 80, right: 30, bottom: 30, left: 0 } }] })).toThrow("Invalid media crop");
    expect(() => parseBoard({ ...b, media: [{ ...audio, trimStart: 9, trimEnd: 8 }] })).toThrow("Invalid media trim");
    expect(() => parseBoard({ ...b, embeds: [{ ...embed, url: "javascript:alert(1)" }] })).toThrow("Invalid embed");
  });
  it("persists supported document embeds while rejecting unsafe or unknown document data", () => {
    const documentEmbed = { id: "pdf", kind: "document" as const, url: "data:application/pdf;base64,AA==", title: "notes.pdf", fileName: "notes.pdf", mimeType: "application/pdf", x: 20, y: 30, width: 620, height: 520 };
    const parsed = parseBoard({ ...blankBoard(), embeds: [documentEmbed] });
    expect(parsed.embeds).toEqual([documentEmbed]);
    expect(exportCanvasSvg(parsed)).toContain("notes.pdf");
    expect(() => parseBoard({ ...blankBoard(), embeds: [{ ...documentEmbed, url: "data:text/html;base64,AA==" }] })).toThrow("Invalid embedded document");
    expect(() => parseBoard({ ...blankBoard(), embeds: [{ ...documentEmbed, kind: "document", url: "https://example.com/file.pdf" }] })).toThrow("Invalid embedded document");
  });
  it("collapses descendants safely even with cycles", () => { const b = connect(connect(board(), "a", "b"), "b", "a"); b.nodes[0] = { ...b.nodes[0], collapsed: true } as typeof b.nodes[0]; expect([...hiddenNodes(b)]).toEqual(["b"]); });
  it("keeps relation edges out of collapse and selected-branch layout", () => {
    const before = { ...blankBoard(), nodes: [
      { id: "root", label: "Root", x: 100, y: 100, width: 190, height: 76 },
      { id: "child", label: "Child", x: 500, y: 100, width: 190, height: 76, parentId: "root" },
      { id: "other", label: "Other", x: 900, y: 100, width: 190, height: 76 },
      { id: "other-child", label: "Other child", x: 1200, y: 100, width: 190, height: 76, parentId: "other" },
    ], edges: [
      { id: "branch", source: "root", target: "child", kind: "branch" as const },
      { id: "other-branch", source: "other", target: "other-child", kind: "branch" as const },
      { id: "relation", source: "child", target: "other-child", kind: "relation" as const },
    ] };
    const collapsed = { ...before, nodes: before.nodes.map(node => node.id === "root" ? { ...node, collapsed: true } : node) };
    expect(hiddenNodes(collapsed)).toEqual(new Set(["child"]));
    const arranged = arrangeMindMapMultiSided(before, "root", 4, "organic").board;
    expect(arranged.nodes.find(node => node.id === "other")!.x).toBe(before.nodes[2].x);
    expect(arranged.nodes.find(node => node.id === "other-child")!.x).toBe(before.nodes[3].x);
  });
  it("has full parity between Vietnamese and English UI dictionaries", () => { expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort()); expect(Object.values(vi).every(Boolean)).toBe(true); });
  it("exports an editable board as a bounded SVG with labels and escaped text", () => {
    const b = { ...board(), texts: [{ id: "t", text: "A & B", x: 20, y: 100, width: 160 }], edges: [{ id: "e", source: "a", target: "b", label: "leads to" }] };
    const svg = exportCanvasSvg(b); expect(svg).toContain("A &amp; B"); expect(svg).toContain("leads to"); expect(svg).toContain("mindcanvas-arrow"); expect(svg).toContain('viewBox=');
  });
  it("exports left and right mind-map connectors without reversing or clipping either side", () => {
    const b = {
      ...blankBoard(),
      nodes: [
        { id: "root", label: "Root", x: 500, y: 100, width: 260, height: 76 },
        { id: "left", label: "Left", x: 120, y: 100, width: 260, height: 76 },
        { id: "right", label: "Right", x: 880, y: 100, width: 260, height: 76 },
      ],
      edges: [
        { id: "left-edge", source: "root", target: "left" },
        { id: "right-edge", source: "root", target: "right" },
      ],
    };
    const leftPath = "M500,138 C446,138 434,138 380,138";
    const rightPath = "M760,138 C814,138 826,138 880,138";
    expect(connectorPath(b, b.edges[0])).toBe(leftPath);
    expect(connectorPath(b, b.edges[1])).toBe(rightPath);
    const svg = exportCanvasSvg(b);
    expect(svg).toContain(`d="${leftPath}"`);
    expect(svg).toContain(`d="${rightPath}"`);
    expect(svg.match(/viewBox="([^"]+)"/)?.[1].split(" ").map(Number)[0]).toBe(72);
  });
  it("exports the selected paper style and rich text formatting", () => {
    const svg = exportCanvasSvg({ ...blankBoard(), background: "graph", texts: [{ id: "t", text: "Key fact", x: 10, y: 40, width: 200, bold: true, textAlign: "right", backgroundColor: "#fff2cc", opacity: .35 }] });
    expect(svg).toContain('id="mindcanvas-bg"'); expect(svg).toContain('font-weight="700"'); expect(svg).toContain('text-anchor="end"'); expect(svg).toContain("#fff2cc");
    expect(svg).toContain('opacity="0.35"');
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
  it("routes vertical connectors from the closest compatible sides", () => {
    const b = { ...blankBoard(), nodes: [
      { id: "top", label: "Top", x: 100, y: 100, width: 260, height: 76 },
      { id: "bottom", label: "Bottom", x: 100, y: 360, width: 260, height: 76 },
    ] };
    const geometry = connectorGeometry(b, { source: "top", target: "bottom" });
    expect(geometry?.sourceSide).toBe("bottom"); expect(geometry?.targetSide).toBe("top"); expect(geometry?.path).toContain("M230,176"); expect(geometry?.path).toContain("230,360");
  });
  it("keeps cross-links visually distinct in SVG export", () => {
    const b = { ...blankBoard(), nodes: [
      { id: "a", label: "A", x: 0, y: 0, width: 190, height: 76 },
      { id: "b", label: "B", x: 320, y: 180, width: 190, height: 76 },
    ], edges: [{ id: "relation", source: "a", target: "b", kind: "relation" as const }] };
    expect(exportCanvasSvg(b)).toContain('stroke-dasharray="7 5"');
  });
  it("applies only safe AI operations inside the selected branch and relays layout to the engine", () => {
    const b = { ...blankBoard(), nodes: [
      { id: "root", label: "Root", x: 100, y: 100, width: 190, height: 76 },
      { id: "child", label: "Child", x: 400, y: 100, width: 190, height: 76, parentId: "root" },
      { id: "outside", label: "Outside", x: 900, y: 100, width: 190, height: 76 },
    ], edges: [{ id: "branch", source: "root", target: "child", kind: "branch" as const }] };
    const next = applyMindMapAiOperations(b, "root", [
      { op: "update", id: "child", label: "Updated child" },
      { op: "add", id: "new", label: "New detail", parentId: "child" },
      { op: "link", source: "new", target: "child", label: "supports" },
    ]);
    expect(next).not.toBe(b); expect(next.nodes.find(node => node.id === "child")?.label).toBe("Updated child"); expect(next.nodes.some(node => node.label === "New detail")).toBe(true);
    expect(next.edges.some(edge => edge.kind === "relation" && edge.label === "supports")).toBe(true); expect(next.nodes.find(node => node.id === "outside")).toEqual(b.nodes[2]);
    expect(applyMindMapAiOperations(b, "root", [{ op: "update", id: "outside", label: "No" }])).toBe(b);
    expect(applyMindMapAiOperations(b, "root", [{ op: "update", id: "root", parentId: null }])).toBe(b);
  });
});
