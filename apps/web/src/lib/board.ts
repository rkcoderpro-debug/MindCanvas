import type { BoardState, StructuredMindMap, Vec2 } from "@mindcanvas/shared";
import { layoutMindMap } from "./mindMapLayout";

export type ElementKind = "nodes" | "texts" | "shapes" | "drawings" | "edges";
export type Selection = { kind: ElementKind; id: string };
export type Bounds = { x: number; y: number; width: number; height: number };
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const pathData = (points: Vec2[]) => points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ") + (points.length === 1 ? " l0.01,0.01" : "");
const xml = (value: unknown) => String(value ?? "").replace(/[&<>\"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&apos;" }[char]!));
const color = (value: unknown, fallback: string) => typeof value === "string" && /^(#[0-9a-f]{6}|none)$/i.test(value) ? value : fallback;
const exportOrder = (board: BoardState): Selection[] => {
  const legacy = (["shapes", "drawings", "edges", "texts", "nodes"] as const).flatMap(kind => board[kind].map(e => ({ kind, id: e.id })));
  const byId = new Map(legacy.map(item => [item.id, item]));
  return [...new Set([...(board.layerOrder ?? []), ...legacy.map(item => item.id)])].flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
};
const exportBounds = (board: BoardState): Bounds => {
  const hidden = hiddenNodes(board), bounds = exportOrder(board).flatMap(selection => {
    if (hidden.has(selection.id) || (selection.kind !== "edges" && board[selection.kind].find(item => item.id === selection.id)?.hidden)) return [];
    if (selection.kind === "edges") {
      const edge = board.edges.find(item => item.id === selection.id), ends = edge ? [edge.source, edge.target] : [];
      return ends.flatMap(id => exportOrder(board).filter(item => item.id === id).flatMap(item => { const bound = elementBounds(board, item); return bound ? [bound] : []; }));
    }
    const bound = elementBounds(board, selection); return bound ? [bound] : [];
  });
  if (!bounds.length) return { x: 0, y: 0, width: 800, height: 600 };
  const x = Math.min(...bounds.map(bound => bound.x)), y = Math.min(...bounds.map(bound => bound.y));
  return { x, y, width: Math.max(1, Math.max(...bounds.map(bound => bound.x + bound.width)) - x), height: Math.max(1, Math.max(...bounds.map(bound => bound.y + bound.height)) - y) };
};
const endpoint = (board: BoardState, id: string) => [...board.nodes, ...board.shapes].find(item => item.id === id);
export function exportCanvasSvg(board: BoardState) {
  const bounds = exportBounds(board), pad = 40, hidden = hiddenNodes(board), all = [...board.nodes, ...board.shapes, ...board.texts, ...board.drawings];
  const isHidden = (id: string) => hidden.has(id) || !!all.find(item => item.id === id && item.hidden);
  const body = exportOrder(board).map(selection => {
    if (isHidden(selection.id)) return "";
    if (selection.kind === "edges") {
      const edge = board.edges.find(item => item.id === selection.id), source = edge && endpoint(board, edge.source), target = edge && endpoint(board, edge.target);
      if (!edge || !source || !target || isHidden(source.id) || isHidden(target.id)) return "";
      const x1 = source.x + source.width, y1 = source.y + source.height / 2, x2 = target.x, y2 = target.y + target.height / 2, curve = Math.max(40, Math.abs(x2 - x1) * .45), path = `M${x1},${y1} C${x1 + curve},${y1} ${x2 - curve},${y2} ${x2},${y2}`;
      return `<path d="${path}" fill="none" stroke="#8a99b5" stroke-width="2" marker-end="url(#mindcanvas-arrow)"/>${edge.label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle" font-size="13" fill="#65718a">${xml(edge.label)}</text>` : ""}`;
    }
    const item = board[selection.kind].find(entry => entry.id === selection.id) as any, bound = elementBounds(board, selection);
    if (!item || !bound) return "";
    const rotation = "rotation" in item && item.rotation ? ` transform="rotate(${item.rotation} ${bound.x + bound.width / 2} ${bound.y + bound.height / 2})"` : "";
    if (selection.kind === "shapes") return item.kind === "rect" ? `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="6" fill="${color(item.color, "#ffffff")}" stroke="#a6b5db"${rotation}/>` : `<ellipse cx="${item.x + item.width / 2}" cy="${item.y + item.height / 2}" rx="${item.width / 2}" ry="${item.height / 2}" fill="${color(item.color, "#ffffff")}" stroke="#a6b5db"${rotation}/>`;
    if (selection.kind === "drawings") return `<path d="${pathData(item.points)}" fill="none" stroke="${color(item.color, "#4562df")}" stroke-width="${item.width}" opacity="${item.opacity}" stroke-linecap="round" stroke-linejoin="round"${rotation}/>`;
    if (selection.kind === "texts") return `<text x="${bound.x}" y="${bound.y + (item.fontSize ?? 16)}" font-size="${item.fontSize ?? 16}" fill="${color(item.color, "#18213b")}"${rotation}>${xml(item.text).split("\n").map((line, index) => `<tspan x="${bound.x}" dy="${index ? item.fontSize ?? 16 : 0}">${line}</tspan>`).join("")}</text>`;
    return `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="12" fill="${color(item.color, "#ffffff")}" stroke="#bcc8e4"${rotation}/><text x="${item.x + item.width / 2}" y="${item.y + item.height / 2 + 6}" text-anchor="middle" font-size="16" fill="#18213b">${xml(item.label)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width + pad * 2}" height="${bounds.height + pad * 2}" viewBox="${bounds.x - pad} ${bounds.y - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}"><defs><marker id="mindcanvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10z" fill="#8a99b5"/></marker></defs><rect x="${bounds.x - pad}" y="${bounds.y - pad}" width="${bounds.width + pad * 2}" height="${bounds.height + pad * 2}" fill="#ffffff"/>${body}</svg>`;
}
function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function exportCanvasSvgFile(board: BoardState) { downloadBlob(new Blob([exportCanvasSvg(board)], { type: "image/svg+xml" }), `${board.title.replace(/[<>:"/\\|?*]/g, "_").slice(0, 100) || "canvas"}.svg`); }
export async function exportCanvasPngFile(board: BoardState) {
  const svg = exportCanvasSvg(board), url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), image = new Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Could not render canvas image.")); image.src = url; });
  const bounds = exportBounds(board), canvas = document.createElement("canvas"); canvas.width = Math.min(4096, Math.max(1, Math.ceil(bounds.width + 80))); canvas.height = Math.min(4096, Math.max(1, Math.ceil(bounds.height + 80))); const context = canvas.getContext("2d");
  if (!context) { URL.revokeObjectURL(url); throw new Error("Canvas export is unavailable in this browser."); }
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png")); if (!blob) throw new Error("Could not create PNG export."); downloadBlob(blob, `${board.title.replace(/[<>:"/\\|?*]/g, "_").slice(0, 100) || "canvas"}.png`);
}
export function blankBoard(title = "Untitled canvas"): BoardState {
  return { id: crypto.randomUUID(), title, updatedAt: new Date().toISOString(), viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [], texts: [], shapes: [], drawings: [] };
}
export function elementBounds(board: BoardState, selection: Selection): Bounds | null {
  if (selection.kind === "edges") return null;
  const el = board[selection.kind].find(e => e.id === selection.id);
  if (!el) return null;
  if ("points" in el) {
    const xs = el.points.map(p => p.x), ys = el.points.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(1, Math.max(...xs) - Math.min(...xs)), height: Math.max(1, Math.max(...ys) - Math.min(...ys)) };
  }
  if ("text" in el) {
    const fs = el.fontSize ?? 16;
    const lines = el.text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / Math.max(1, Math.floor(el.width / (fs * .55))))), 0);
    return { x: el.x, y: el.y - fs, width: el.width, height: Math.max(el.height ?? 32, lines * fs * 1.4) };
  }
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}
export function moveElement(board: BoardState, s: Selection, dx: number, dy: number): BoardState {
  if (s.kind === "edges") return board;
  return { ...board, [s.kind]: board[s.kind].map(el => el.id !== s.id ? el : "points" in el
    ? { ...el, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
    : { ...el, x: el.x + dx, y: el.y + dy }) };
}
export function resizeElement(board: BoardState, s: Selection, width: number, height: number): BoardState {
  const b = elementBounds(board, s);
  if (!b || s.kind === "edges") return board;
  width = clamp(width, 24, 10000); height = clamp(height, 24, 10000);
  return { ...board, [s.kind]: board[s.kind].map(el => el.id !== s.id ? el : "points" in el
    ? { ...el, points: el.points.map(p => ({ x: b.x + (p.x - b.x) * width / b.width, y: b.y + (p.y - b.y) * height / b.height })) }
    : { ...el, width, height }) };
}
export function removeElement(board: BoardState, s: Selection): BoardState {
  return { ...board, [s.kind]: board[s.kind].filter(el => el.id !== s.id),
    edges: board.edges.filter(e => (s.kind !== "edges" || e.id !== s.id) && e.source !== s.id && e.target !== s.id) };
}
export function duplicateElement(board: BoardState, s: Selection): { board: BoardState; selection: Selection } {
  const el = board[s.kind].find(e => e.id === s.id);
  if (!el || s.kind === "edges") return { board, selection: s };
  const selection = { ...s, id: crypto.randomUUID() };
  const next = { ...board, [s.kind]: [...board[s.kind], { ...el, id: selection.id }] };
  return { board: moveElement(next, selection, 24, 24), selection };
}
export function connect(board: BoardState, source: string, target: string): BoardState {
  if (source === target || board.edges.some(e => e.source === source && e.target === target)) return board;
  return { ...board, edges: [...board.edges, { id: crypto.randomUUID(), source, target }] };
}
export function hiddenNodes(board: BoardState): Set<string> {
  const hidden = new Set<string>();
  for (const root of board.nodes.filter(n => n.collapsed)) {
    const visited = new Set([root.id]), stack = [root.id];
    while (stack.length) {
      const current = stack.pop();
      for (const e of board.edges.filter(e => e.source === current && (!board.nodes.find(n => n.id === e.target)?.parentId || board.nodes.find(n => n.id === e.target)?.parentId === current))) if (!visited.has(e.target)) {
        visited.add(e.target); hidden.add(e.target); stack.push(e.target);
      }
    }
    hidden.delete(root.id);
  }
  return hidden;
}
export function applyGraph(board: BoardState, graph: StructuredMindMap): BoardState {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !graph.nodes.length || graph.nodes.length > 200) throw new Error("Invalid AI graph");
  const ids = new Map<string, string>();
  graph.nodes.forEach(n => {
    if (typeof n.id !== "string" || typeof n.label !== "string" || n.label.length > 10000 || ids.has(n.id)) throw new Error("Invalid AI node");
    ids.set(n.id, crypto.randomUUID());
  });
  if (graph.edges.length > 400 || graph.edges.some(e => !ids.has(e.source) || !ids.has(e.target))) throw new Error("Invalid AI edge");
  const bounds = (["nodes", "shapes", "texts", "drawings"] as const).flatMap(kind => board[kind].map(e => elementBounds(board, { kind, id: e.id })!));
  const x = bounds.length ? Math.max(...bounds.map(b => b.x + b.width)) + 100 : 100;
  const nodes = graph.nodes.map((n, i) => ({
    id: ids.get(n.id)!, label: n.label, parentId: n.parentId ? ids.get(n.parentId) : undefined, sourcePage: Number.isInteger(n.sourcePage) && n.sourcePage! > 0 ? n.sourcePage : undefined,
    x: x + (i % 3) * 250, y: 100 + Math.floor(i / 3) * 130, width: 190, height: 76, color: i === 0 ? "#e1e7ff" : "#ffffff",
  }));
  const edges = graph.edges.map(e => ({ id: crypto.randomUUID(), source: ids.get(e.source)!, target: ids.get(e.target)!, label: e.label }));
  // Prefer explicit hierarchy for placement, retain the provider's cross-links.
  const hierarchy = graph.nodes.filter(n => n.parentId && ids.has(n.parentId) && n.parentId !== n.id).map(n => ({ id: crypto.randomUUID(), source: ids.get(n.parentId!)!, target: ids.get(n.id)! }));
  for (const edge of hierarchy) if (!edges.some(e => e.source === edge.source && e.target === edge.target)) edges.push({ ...edge, label: undefined });
  const explicitChildren = new Set(hierarchy.map(e => e.target));
  const layoutEdges = [...hierarchy, ...edges.filter(e => !explicitChildren.has(e.target))];
  return { ...board, nodes: [...board.nodes, ...layoutMindMap(nodes, layoutEdges, { x, y: 100 })], edges: [...board.edges, ...edges] };
}

export function arrangeMindMap(board: BoardState): BoardState {
  if (!board.nodes.length) return board;
  const other = (["shapes", "texts", "drawings"] as const).flatMap(kind => board[kind].map(e => elementBounds(board, { kind, id: e.id })!));
  const x = other.length ? Math.max(...other.map(b => b.x + b.width)) + 100 : Math.min(...board.nodes.map(n => n.x));
  return { ...board, nodes: layoutMindMap(board.nodes, board.edges, { x, y: Math.min(...board.nodes.map(n => n.y)) }) };
}

const obj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 10000000;
const string = (v: unknown, max = 10000) => typeof v === "string" && v.length <= max;
export function parseBoard(value: unknown): BoardState {
  if (!obj(value)) throw new Error("Invalid board");
  const b = value;
  if (!string(b.id, 200) || !string(b.title, 500) || !string(b.updatedAt, 100) || !Number.isFinite(Date.parse(b.updatedAt))
    || !obj(b.viewport) || !number(b.viewport.x) || !number(b.viewport.y) || !number(b.viewport.scale) || b.viewport.scale < .1 || b.viewport.scale > 10) throw new Error("Invalid board metadata");
  const ids = new Set<string>();
  let points = 0;
  for (const kind of ["nodes", "texts", "shapes", "drawings", "edges"] as const) {
    if (!Array.isArray(b[kind]) || b[kind].length > 5000) throw new Error("Invalid elements");
    for (const el of b[kind]) {
      if (!obj(el) || !string(el.id, 200) || ids.has(el.id)) throw new Error("Invalid element id");
      ids.add(el.id);
      if (el.rotation !== undefined && (!number(el.rotation) || el.rotation < -3600 || el.rotation > 3600) || el.hidden !== undefined && typeof el.hidden !== "boolean" || el.locked !== undefined && typeof el.locked !== "boolean") throw new Error("Invalid element flags");
      if (el.color !== undefined && (typeof el.color !== "string" || !/^#[0-9a-f]{6}$/i.test(el.color))) throw new Error("Invalid color");
      if (kind === "edges") { if (!string(el.source, 200) || !string(el.target, 200)) throw new Error("Invalid connection"); continue; }
      if (kind === "drawings") {
        if (!Array.isArray(el.points) || !el.points.length || el.points.length > 20000 || !el.points.every(p => obj(p) && number(p.x) && number(p.y))
          || !number(el.opacity) || el.opacity < 0 || el.opacity > 1 || !number(el.width) || el.width <= 0) throw new Error("Invalid stroke");
        points += el.points.length; continue;
      }
      if (!number(el.x) || !number(el.y) || !number(el.width) || el.width <= 0 || (kind !== "texts" && (!number(el.height) || el.height <= 0))) throw new Error("Invalid geometry");
      if (kind === "texts" && (!string(el.text) || (el.fontSize !== undefined && (!number(el.fontSize) || el.fontSize < 8 || el.fontSize > 200)))) throw new Error("Invalid text");
      if (kind === "nodes" && !string(el.label)) throw new Error("Invalid label");
      if (kind === "shapes" && !["rect", "ellipse"].includes(el.kind)) throw new Error("Invalid shape");
    }
  }
  if (points > 200000 || b.edges.some((e: any) => !ids.has(e.source) || !ids.has(e.target))) throw new Error("Invalid graph");
  if (b.layerOrder !== undefined && (!Array.isArray(b.layerOrder) || b.layerOrder.length > ids.size || new Set(b.layerOrder).size !== b.layerOrder.length || b.layerOrder.some((id: unknown) => typeof id !== "string" || !ids.has(id)))) throw new Error("Invalid layers");
  if (b.groups !== undefined) {
    if (!Array.isArray(b.groups) || b.groups.length > 5000) throw new Error("Invalid groups");
    const grouped = new Set<string>(), groupIds = new Set<string>();
    for (const g of b.groups) {
      if (!obj(g) || !string(g.id, 200) || groupIds.has(g.id) || !Array.isArray(g.elementIds) || g.elementIds.length < 2) throw new Error("Invalid group");
      groupIds.add(g.id);
      for (const id of g.elementIds) { if (!ids.has(id) || grouped.has(id)) throw new Error("Invalid group member"); grouped.add(id); }
    }
  }
  if (b.nodes.some((n: any) => n.parentId !== undefined && (!string(n.parentId, 200) || !b.nodes.some((p: any) => p.id === n.parentId) || n.parentId === n.id))) throw new Error("Invalid parent");
  return structuredClone(b) as BoardState;
}
export function exportBoard(board: BoardState) {
  const blob = new Blob([JSON.stringify({ format: "mindcanvas", version: 1, board }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = (board.title.replace(/[<>:"/\\|?*]/g, "_").slice(0, 100) || "canvas") + ".mindcanvas.json";
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importBoard(file: File): Promise<BoardState> {
  if (file.size > MAX_FILE_BYTES) throw new Error("File too large");
  const data = JSON.parse(await file.text());
  if (data.format !== "mindcanvas" || data.version !== 1) throw new Error("Invalid format");
  return { ...parseBoard(data.board), id: crypto.randomUUID(), updatedAt: new Date().toISOString() };
}
