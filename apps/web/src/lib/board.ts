import type { BoardState, StructuredMindMap, Vec2 } from "@mindcanvas/shared";

export type ElementKind = "nodes" | "texts" | "shapes" | "drawings" | "edges";
export type Selection = { kind: ElementKind; id: string };
export type Bounds = { x: number; y: number; width: number; height: number };
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const pathData = (points: Vec2[]) => points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ") + (points.length === 1 ? " l0.01,0.01" : "");
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
      for (const e of board.edges.filter(e => e.source === current)) if (!visited.has(e.target)) {
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
  return { ...board, nodes: [...board.nodes, ...graph.nodes.map((n, i) => ({
    id: ids.get(n.id)!, label: n.label, sourcePage: Number.isInteger(n.sourcePage) && n.sourcePage! > 0 ? n.sourcePage : undefined,
    x: x + (i % 3) * 250, y: 100 + Math.floor(i / 3) * 130, width: 190, height: 76, color: i === 0 ? "#e1e7ff" : "#ffffff",
  }))], edges: [...board.edges, ...graph.edges.map(e => ({ id: crypto.randomUUID(), source: ids.get(e.source)!, target: ids.get(e.target)!, label: e.label }))] };
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
