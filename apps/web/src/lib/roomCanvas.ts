import type { BoardState } from "@mindcanvas/shared";
import { parseBoard } from "./board";

const items = ["nodes","edges","texts","shapes","drawings"] as const;
const safeBackgrounds = new Set(["plain","dots","grid","ruled","graph","isometric"]);
const baseFields = ["id","rotation","opacity","hidden","locked"];
const geometry = ["x","y","width","height","color"];
const fields = {
  nodes: [...geometry,"label","parentId","collapsed"], edges: ["source","target","kind","label"],
  texts: [...geometry,"text","fontSize","backgroundColor","bold","italic","underline","textAlign"],
  shapes: [...geometry,"kind","frameTemplate","frameName","clipContent"], drawings: ["points","width","color"],
};
function record(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
}
const pick = (value: unknown, keys: readonly string[]) => {
  const raw = record(value);
  return Object.fromEntries(keys.filter(key => Object.hasOwn(raw,key) && raw[key] !== undefined).map(key => [key,raw[key]]));
};
// Reconstruct what the room can render. Never trust media paths, embeds, or
// attached personal sources sent directly to the RPC by another participant.
export function meetingBoardCopy(value: unknown, roomId: string): BoardState {
  const raw = record(value), a4 = record(raw.a4), title = typeof raw.title === "string" ? [...raw.title.trim()].slice(0,100).join("") : "";
  const board: Record<string,unknown> = {
    id: roomId, title, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    viewport: { x:0,y:0,scale:1 }, media: [], embeds: [],
    background: typeof raw.background === "string" && safeBackgrounds.has(raw.background) ? raw.background : "dots",
    layoutMeta: pick(raw.layoutMeta, ["mindMapBehavior"]),
  };
  for (const kind of items) {
    const collection = raw[kind];
    if (!Array.isArray(collection) || collection.length > 5000) throw new Error("Invalid Canvas");
    board[kind] = collection.map(el => {
      const item = pick(el,[...baseFields,...fields[kind]]);
      if (kind === "drawings" && Array.isArray(item.points)) item.points = item.points.map(point => pick(point,["x","y"]));
      if (kind === "edges" && typeof item.label !== "string") delete item.label;
      return item;
    });
  }
  const ids = new Set(items.flatMap(kind => (board[kind] as Array<{ id: string }>).map(item => item.id)));
  if (Array.isArray(raw.layerOrder)) board.layerOrder = raw.layerOrder.filter(id => ids.has(id));
  if (Array.isArray(raw.groups)) board.groups = raw.groups.flatMap(group => {
    const value = pick(group,["id","elementIds"]);
    if (!Array.isArray(value.elementIds)) return [];
    const elementIds = value.elementIds.filter(id => ids.has(id));
    return elementIds.length > 1 ? [{ ...value, elementIds }] : [];
  });
  if (raw.a4 !== undefined) board.a4 = {
    ...pick(a4,["mode","paper"]), pages: Array.isArray(a4.pages) ? a4.pages.map(page => pick(page,["id","text","flows"])) : a4.pages,
  };
  return parseBoard(board);
}
export function equalRoomValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b,key) && equalRoomValue(a[key], b[key]));
}
export const sameRoomBoard = (a: BoardState, b: BoardState) =>
  [...items,"title","background","a4","layoutMeta","layerOrder","groups"].every(key => equalRoomValue(a[key as keyof BoardState], b[key as keyof BoardState]));

export function mergeRoomBoard(base: BoardState, mine: BoardState, remote: BoardState): BoardState | null {
  let conflict = false;
  function pick<T>(b: T, m: T, r: T): T {
    if (equalRoomValue(m,b)) return r;
    if (equalRoomValue(r,b) || equalRoomValue(m,r)) return m;
    conflict = true;
    return r;
  }
  const next = { ...remote };
  for (const kind of items) {
    type Entity = (typeof base)[typeof kind][number];
    const byId = (array: Entity[]) => new Map(array.map(item => [item.id,item]));
    const b = byId(base[kind]), m = byId(mine[kind]), r = byId(remote[kind]);
    const merged = new Set([...r.keys(),...m.keys()]);
    Object.assign(next, { [kind]: [...merged].flatMap(id => {
      const chosen = pick(b.get(id),m.get(id),r.get(id));
      return chosen ? [chosen] : [];
    }) });
  }
  next.title = pick(base.title,mine.title,remote.title);
  next.background = pick(base.background,mine.background,remote.background);
  next.a4 = pick(base.a4,mine.a4,remote.a4);
  next.layoutMeta = pick(base.layoutMeta,mine.layoutMeta,remote.layoutMeta);
  // CanvasBoard rebuilds layerOrder on almost every drawing. Preserve
  // ordering of common elements, while allowing independent new elements.
  const ids = new Set(items.flatMap(kind => next[kind].map(item => item.id)));
  const added = new Set([...mine.layerOrder ?? [],...remote.layerOrder ?? []].filter(id => !base.layerOrder?.includes(id)));
  const retained = (board: BoardState) => (board.layerOrder ?? []).filter(id => ids.has(id) && !added.has(id));
  const order = pick(retained(base),retained(mine),retained(remote));
  if (base.layerOrder || mine.layerOrder || remote.layerOrder) next.layerOrder = [...order,...[...added].filter(id => ids.has(id))];
  next.groups = pick(base.groups,mine.groups,remote.groups);
  if (conflict) return null;
  try { return meetingBoardCopy(next,remote.id); } catch { return null; }
}
