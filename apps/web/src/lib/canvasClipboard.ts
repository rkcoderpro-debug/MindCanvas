import type { BoardState } from "@mindcanvas/shared";
import { parseBoard, type Selection } from "./board";

const FORMAT = "mindcanvas-elements-v1";
type ClipboardPayload = { format: typeof FORMAT; board: BoardState; selection: Selection[] };
let memory: ClipboardPayload | null = null;
let pasteCount = 0;

function validSelection(board: BoardState, value: unknown): Selection[] {
  if (!Array.isArray(value) || value.length > 5000) return [];
  const kinds = new Set(["nodes", "texts", "shapes", "drawings", "edges"]);
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Selection;
    if (!kinds.has(candidate.kind) || typeof candidate.id !== "string") return [];
    return board[candidate.kind].some(element => element.id === candidate.id) ? [candidate] : [];
  });
}

function parsePayload(raw: string): ClipboardPayload | null {
  if (!raw || raw.length > 5_000_000) return null;
  try {
    const value = JSON.parse(raw) as Partial<ClipboardPayload>;
    if (value.format !== FORMAT || !value.board) return null;
    const board = parseBoard(value.board);
    const selection = validSelection(board, value.selection);
    return selection.length ? { format: FORMAT, board, selection } : null;
  } catch { return null; }
}

export async function copyCanvasSelection(board: BoardState, selection: Selection[]) {
  memory = { format: FORMAT, board: structuredClone(board), selection: structuredClone(selection) };
  pasteCount = 0;
  try { await navigator.clipboard?.writeText(JSON.stringify(memory)); } catch { /* In-memory copy remains available. */ }
}

export async function readCanvasSelection() {
  try {
    const raw = await navigator.clipboard?.readText();
    const external = raw ? parsePayload(raw) : null;
    if (external) memory = external;
  } catch { /* Clipboard permission is optional; use the session copy. */ }
  if (!memory) return null;
  pasteCount += 1;
  return { board: structuredClone(memory.board), selection: structuredClone(memory.selection), offset: pasteCount * 24 };
}

export function hasCanvasClipboard() { return !!memory; }
export function clearCanvasClipboardForTests() { memory = null; pasteCount = 0; }
