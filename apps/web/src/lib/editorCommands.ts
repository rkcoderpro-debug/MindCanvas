import type { BoardState, Viewport } from "@mindcanvas/shared";
import { elementBounds, moveElement, type Selection, type Bounds } from "./board";

export function orderedElements(board: BoardState): Selection[] {
  const legacy = (["shapes", "drawings", "edges", "texts", "nodes"] as const).flatMap(kind => board[kind].map(e => ({ kind, id: e.id })));
  const map = new Map(legacy.map(s => [s.id, s]));
  const order = [...new Set([...(board.layerOrder ?? []), ...legacy.map(s => s.id)])];
  return order.flatMap(id => map.has(id) ? [map.get(id)!] : []);
}
export function normalizeEditor(board: BoardState, previous?: BoardState): BoardState {
  const oldIds = new Set(previous ? orderedElements(previous).map(s => s.id) : []);
  const entries = orderedElements(board), ids = new Set(entries.map(s => s.id));
  const prior = previous ? orderedElements(previous).map(s => s.id).filter(id => ids.has(id)) : [];
  const layerOrder = board.layerOrder ?? [...prior, ...entries.filter(s => !oldIds.has(s.id)).map(s => s.id)];
  const groups = (board.groups ?? []).map(g => ({ ...g, elementIds: g.elementIds.filter(id => ids.has(id)) })).filter(g => g.elementIds.length > 1);
  return { ...board, layerOrder: orderedElements({ ...board, layerOrder }).map(s => s.id), groups };
}
export function expandGroups(board: BoardState, selection: Selection[]): Selection[] {
  const ids = new Set(selection.map(s => s.id));
  for (const group of board.groups ?? []) if (group.elementIds.some(id => ids.has(id))) for (const id of group.elementIds) ids.add(id);
  return orderedElements(board).filter(s => ids.has(s.id));
}
export function selectionBounds(board: BoardState, selections: Selection[]): Bounds | null {
  const bounds = selections.flatMap(s => {
    const b = elementBounds(board, s); if (b) return [b];
    if (s.kind !== "edges") return [];
    const edge = board.edges.find(e => e.id === s.id);
    return edge ? orderedElements(board).filter(e => e.id === edge.source || e.id === edge.target).flatMap(e => { const r = elementBounds(board, e); return r ? [r] : []; }) : [];
  });
  if (!bounds.length) return null;
  const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y));
  return { x, y, width: Math.max(...bounds.map(b => b.x + b.width)) - x, height: Math.max(...bounds.map(b => b.y + b.height)) - y };
}
export function moveSelection(board: BoardState, selection: Selection[], dx: number, dy: number) {
  return selection.reduce((b, s) => moveElement(b, s, dx, dy), board);
}
export function removeSelection(board: BoardState, selections: Selection[]): BoardState {
  const ids = new Set(selections.map(s => s.id));
  return normalizeEditor({ ...board, nodes: board.nodes.filter(n => !ids.has(n.id)).map(n => ids.has(n.parentId ?? "") ? { ...n, parentId: undefined } : n),
    texts: board.texts.filter(e => !ids.has(e.id)), shapes: board.shapes.filter(e => !ids.has(e.id)), drawings: board.drawings.filter(e => !ids.has(e.id)),
    edges: board.edges.filter(e => !ids.has(e.id) && !ids.has(e.source) && !ids.has(e.target)) });
}
export function duplicateSelection(board: BoardState, selections: Selection[]) {
  const selected = new Set(selections.map(s => s.id));
  const edges = board.edges.filter(e => selected.has(e.id) || (selected.has(e.source) && selected.has(e.target)));
  const ids = new Map<string, string>([...selected, ...edges.map(e => e.id)].map(id => [id, crypto.randomUUID()]));
  let next = structuredClone(board);
  for (const kind of ["nodes", "texts", "shapes", "drawings"] as const) {
    for (const el of board[kind].filter(e => selected.has(e.id))) {
      const copy = { ...structuredClone(el), id: ids.get(el.id)! };
      if ("parentId" in copy) copy.parentId = ids.get(copy.parentId ?? "");
      (next[kind] as unknown[]).push(copy);
    }
  }
  next.edges.push(...edges.map(e => ({ ...e, id: ids.get(e.id)!, source: ids.get(e.source) ?? e.source, target: ids.get(e.target) ?? e.target })));
  next.groups = [...(board.groups ?? []), ...(board.groups ?? []).filter(g => g.elementIds.every(id => ids.has(id))).map(g => ({ id: crypto.randomUUID(), elementIds: g.elementIds.map(id => ids.get(id)!) }))];
  const selection = orderedElements(next).filter(s => [...ids.values()].includes(s.id));
  next = moveSelection(next, selection, 24, 24);
  next.layerOrder = [...orderedElements(board).map(s => s.id), ...orderedElements(board).filter(s => ids.has(s.id)).map(s => ids.get(s.id)!)];
  return { board: normalizeEditor(next), selection };
}
export function groupSelection(board: BoardState, selections: Selection[]): BoardState {
  const selection = expandGroups(board, selections), ids = new Set(selection.map(s => s.id));
  if (ids.size < 2) return board;
  const order = orderedElements(board).map(s => s.id), last = Math.max(...order.map((id, i) => ids.has(id) ? i : -1));
  const before = order.slice(0, last + 1).filter(id => !ids.has(id)), after = order.slice(last + 1);
  return { ...board, layerOrder: [...before, ...order.filter(id => ids.has(id)), ...after], groups: [...(board.groups ?? []).filter(g => !g.elementIds.some(id => ids.has(id))), { id: crypto.randomUUID(), elementIds: selection.map(s => s.id) }] };
}
export function pasteSelection(target: BoardState, source: BoardState, selections: Selection[], offset = 24) {
  const copy = duplicateSelection(source, selections), ids = new Set(copy.selection.map(s => s.id));
  const additions = moveSelection(copy.board, copy.selection, offset - 24, offset - 24);
  const next = { ...target, nodes: [...target.nodes, ...additions.nodes.filter(n => ids.has(n.id))],
    texts: [...target.texts, ...additions.texts.filter(n => ids.has(n.id))], shapes: [...target.shapes, ...additions.shapes.filter(n => ids.has(n.id))],
    drawings: [...target.drawings, ...additions.drawings.filter(n => ids.has(n.id))], edges: [...target.edges, ...additions.edges.filter(n => ids.has(n.id))],
    groups: [...(target.groups ?? []), ...(additions.groups ?? []).filter(g => g.elementIds.every(id => ids.has(id)))],
    layerOrder: [...orderedElements(target).map(s => s.id), ...orderedElements(additions).filter(s => ids.has(s.id)).map(s => s.id)] };
  // A copied loose connection is retained only when both endpoints exist here.
  const endpoints = new Set([...next.nodes,...next.shapes].map(n => n.id));
  next.edges = next.edges.filter(e => endpoints.has(e.source) && endpoints.has(e.target));
  return { board: normalizeEditor(next), selection: copy.selection.filter(s => s.kind !== "edges" || next.edges.some(e => e.id === s.id)) };
}
export function ungroupSelection(board: BoardState, selections: Selection[]): BoardState {
  const ids = new Set(selections.map(s => s.id));
  return { ...board, groups: (board.groups ?? []).filter(g => !g.elementIds.some(id => ids.has(id))) };
}
function layerBlocks(board: BoardState) {
  const order = orderedElements(board).map(s => s.id), used = new Set<string>(), blocks: string[][] = [];
  for (const id of order) {
    if (used.has(id)) continue;
    const group = board.groups?.find(item => item.elementIds.includes(id));
    const block = group ? order.filter(elementId => group.elementIds.includes(elementId)) : [id];
    block.forEach(elementId => used.add(elementId));
    blocks.push(block);
  }
  return blocks;
}
export function reorderSelection(board: BoardState, selections: Selection[], direction: "front" | "back" | "forward" | "backward"): BoardState {
  const ids = new Set(expandGroups(board, selections).map(s => s.id));
  // Treat groups as atomic blocks so moving a neighbouring layer cannot split one.
  const blocks = layerBlocks(board);
  const chosen = (block: string[]) => block.some(id => ids.has(id));
  if (direction === "front" || direction === "back") {
    const yes = blocks.filter(chosen), no = blocks.filter(b => !chosen(b));
    return { ...board, layerOrder: (direction === "front" ? [...no, ...yes] : [...yes, ...no]).flat() };
  }
  if (direction === "forward") { for (let i = blocks.length - 2; i >= 0; i--) if (chosen(blocks[i]) && !chosen(blocks[i + 1])) [blocks[i], blocks[i + 1]] = [blocks[i + 1], blocks[i]]; }
  else { for (let i = 1; i < blocks.length; i++) if (chosen(blocks[i]) && !chosen(blocks[i - 1])) [blocks[i], blocks[i - 1]] = [blocks[i - 1], blocks[i]]; }
  return { ...board, layerOrder: blocks.flat() };
}
/** Move one layer/group directly above another layer in the visible stack. */
export function moveLayer(board: BoardState, sourceId: string, targetId: string): BoardState {
  if (sourceId === targetId) return board;
  const blocks = layerBlocks(board), sourceIndex = blocks.findIndex(block => block.includes(sourceId)), targetIndex = blocks.findIndex(block => block.includes(targetId));
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return board;
  const [source] = blocks.splice(sourceIndex, 1);
  const adjustedTarget = blocks.findIndex(block => block.includes(targetId));
  blocks.splice(adjustedTarget + 1, 0, source);
  return { ...board, layerOrder: blocks.flat() };
}
const editable = (board: BoardState, selections: Selection[]) => expandGroups(board, selections).filter(s => s.kind !== "edges");
export function setElementFlags(board: BoardState, selections: Selection[], flags: { hidden?: boolean; locked?: boolean }): BoardState {
  const ids = new Set(expandGroups(board, selections).map(s => s.id));
  return { ...board, nodes: board.nodes.map(e => ids.has(e.id) ? { ...e, ...flags } : e), texts: board.texts.map(e => ids.has(e.id) ? { ...e, ...flags } : e), shapes: board.shapes.map(e => ids.has(e.id) ? { ...e, ...flags } : e), drawings: board.drawings.map(e => ids.has(e.id) ? { ...e, ...flags } : e), edges: board.edges.map(e => ids.has(e.id) ? { ...e, ...flags } : e) };
}
export function rotateSelection(board: BoardState, selections: Selection[], degrees: number): BoardState {
  const ids = new Set(editable(board, selections).map(s => s.id));
  const rotate = <T extends { id: string; rotation?: number }>(items: T[]) => items.map(e => ids.has(e.id) ? { ...e, rotation: ((e.rotation ?? 0) + degrees) % 360 } : e);
  return { ...board, nodes: rotate(board.nodes), texts: rotate(board.texts), shapes: rotate(board.shapes), drawings: rotate(board.drawings) };
}
export function resizeSelection(board: BoardState, selections: Selection[], width: number, height: number): BoardState {
  const active = editable(board, selections), box = selectionBounds(board, active); if (!box || !active.length) return board;
  const sx = Math.max(.05, width / Math.max(1, box.width)), sy = Math.max(.05, height / Math.max(1, box.height)), ids = new Set(active.map(s => s.id));
  const resize = <T extends { id: string; x: number; y: number; width: number; height?: number }>(items: T[]) => items.map(e => ids.has(e.id) ? { ...e, x: box.x + (e.x - box.x) * sx, y: box.y + (e.y - box.y) * sy, width: Math.max(24, e.width * sx), height: Math.max(24, (e.height ?? 32) * sy) } : e);
  const drawings = board.drawings.map(e => { if (!ids.has(e.id)) return e; return { ...e, points: e.points.map(p => ({ x: box.x + (p.x - box.x) * sx, y: box.y + (p.y - box.y) * sy })), width: Math.max(1, e.width * Math.min(sx, sy)) }; });
  return { ...board, nodes: resize(board.nodes), texts: resize(board.texts), shapes: resize(board.shapes), drawings };
}
export function alignSelection(board: BoardState, selections: Selection[], axis: "left" | "center" | "right" | "top" | "middle" | "bottom"): BoardState {
  const active = editable(board, selections), box = selectionBounds(board, active); if (!box) return board;
  return active.reduce((next, s) => { const r = elementBounds(next, s); if (!r) return next; const dx = axis === "left" ? box.x - r.x : axis === "center" ? box.x + box.width / 2 - (r.x + r.width / 2) : axis === "right" ? box.x + box.width - r.x - r.width : 0; const dy = axis === "top" ? box.y - r.y : axis === "middle" ? box.y + box.height / 2 - (r.y + r.height / 2) : axis === "bottom" ? box.y + box.height - r.y - r.height : 0; return moveElement(next, s, dx, dy); }, board);
}
export function distributeSelection(board: BoardState, selections: Selection[], axis: "horizontal" | "vertical"): BoardState {
  const active = editable(board, selections).map(s => ({ s, r: elementBounds(board, s) })).filter(v => v.r) as Array<{ s: Selection; r: Bounds }>;
  if (active.length < 3) return board; active.sort((a,b) => axis === "horizontal" ? a.r.x - b.r.x : a.r.y - b.r.y);
  const first = active[0].r, last = active.at(-1)!.r, span = axis === "horizontal" ? last.x + last.width - first.x : last.y + last.height - first.y, total = active.reduce((n,v) => n + (axis === "horizontal" ? v.r.width : v.r.height), 0), gap = (span - total) / (active.length - 1); let cursor = axis === "horizontal" ? first.x : first.y;
  return active.reduce((next, v) => { const pos = axis === "horizontal" ? v.r.x : v.r.y, delta = cursor - pos; cursor += (axis === "horizontal" ? v.r.width : v.r.height) + gap; return moveElement(next, v.s, axis === "horizontal" ? delta : 0, axis === "vertical" ? delta : 0); }, board);
}
export type SnapGuide = { axis: "x" | "y"; value: number; from: number; to: number };
export function smartSnapMoveSelection(board: BoardState, selections: Selection[], dx: number, dy: number, grid = 8, threshold = 7): { board: BoardState; guides: SnapGuide[] } {
  const active = editable(board, selections), box = selectionBounds(board, active);
  if (!box) return { board: moveSelection(board, selections, dx, dy), guides: [] };
  const ids = new Set(active.map(selection => selection.id));
  const candidates = orderedElements(board).flatMap(selection => {
    if (selection.kind === "edges" || ids.has(selection.id)) return [];
    const element = board[selection.kind].find(item => item.id === selection.id);
    if (element && "hidden" in element && element.hidden) return [];
    const bounds = elementBounds(board, selection);
    return bounds ? [bounds] : [];
  });
  const snap = (value: number) => Math.round(value / grid) * grid;
  let snappedDx = snap(box.x + dx) - box.x, snappedDy = snap(box.y + dy) - box.y;
  const moved = () => ({ x: box.x + snappedDx, y: box.y + snappedDy, width: box.width, height: box.height });
  const guides: SnapGuide[] = [];

  let bestX: { distance: number; delta: number; value: number; target: Bounds } | null = null;
  let bestY: { distance: number; delta: number; value: number; target: Bounds } | null = null;
  for (const target of candidates) {
    const current = moved();
    const movingX = [current.x, current.x + current.width / 2, current.x + current.width];
    const targetX = [target.x, target.x + target.width / 2, target.x + target.width];
    for (const source of movingX) for (const value of targetX) {
      const delta = value - source, distance = Math.abs(delta);
      if (distance <= threshold && (!bestX || distance < bestX.distance)) bestX = { distance, delta, value, target };
    }
    const movingY = [current.y, current.y + current.height / 2, current.y + current.height];
    const targetY = [target.y, target.y + target.height / 2, target.y + target.height];
    for (const source of movingY) for (const value of targetY) {
      const delta = value - source, distance = Math.abs(delta);
      if (distance <= threshold && (!bestY || distance < bestY.distance)) bestY = { distance, delta, value, target };
    }
  }
  if (bestX) {
    snappedDx += bestX.delta;
    const current = moved();
    guides.push({ axis: "x", value: bestX.value, from: Math.min(current.y, bestX.target.y) - 24, to: Math.max(current.y + current.height, bestX.target.y + bestX.target.height) + 24 });
  }
  if (bestY) {
    snappedDy += bestY.delta;
    const current = moved();
    guides.push({ axis: "y", value: bestY.value, from: Math.min(current.x, bestY.target.x) - 24, to: Math.max(current.x + current.width, bestY.target.x + bestY.target.width) + 24 });
  }
  return { board: moveSelection(board, selections, snappedDx, snappedDy), guides };
}
export function snapMoveSelection(board: BoardState, selections: Selection[], dx: number, dy: number, grid = 8): BoardState {
  const box = selectionBounds(board, editable(board, selections));
  if (!box) return moveSelection(board, selections, dx, dy);
  const snap = (value: number) => Math.round(value / grid) * grid;
  return moveSelection(board, selections, snap(box.x + dx) - box.x, snap(box.y + dy) - box.y);
}
export function parentOf(board: BoardState, id: string) {
  return board.nodes.find(n => n.id === id)?.parentId ?? board.edges.find(e => e.target === id && board.nodes.some(n => n.id === e.source))?.source;
}
export function reparentNode(board: BoardState, id: string, parentId: string): BoardState {
  if (id === parentId || !board.nodes.some(n => n.id === id) || !board.nodes.some(n => n.id === parentId)) return board;
  const visited = new Set<string>(); let cursor: string | undefined = parentId;
  while (cursor && !visited.has(cursor)) { if (cursor === id) return board; visited.add(cursor); cursor = parentOf(board, cursor); }
  const parent = parentOf(board, id);
  const subtree = new Set([id]);
  let expanded = true;
  while (expanded) { expanded = false; for (const n of board.nodes) if (!subtree.has(n.id) && subtree.has(parentOf(board, n.id) ?? "")) { subtree.add(n.id); expanded = true; } }
  const root = board.nodes.find(n => n.id === id)!, target = board.nodes.find(n => n.id === parentId)!;
  const siblings = board.nodes.filter(n => !subtree.has(n.id) && parentOf(board, n.id) === parentId);
  const x = target.x + target.width + 100, y = Math.max(target.y, ...siblings.map(n => n.y + n.height + 36));
  return { ...board, nodes: board.nodes.map(n => {
    const positioned = subtree.has(n.id) ? { ...n, x: n.x + x - root.x, y: n.y + y - root.y } : n;
    return n.id === id ? { ...positioned, parentId } : n.id === parentId ? { ...positioned, collapsed: false } : positioned;
  }),
    edges: [...board.edges.filter(e => !(e.target === id && (e.source === parent || e.source === parentId))), { id: crypto.randomUUID(), source: parentId, target: id }] };
}
export function addRelativeNode(board: BoardState, id: string, sibling: boolean, label: string) {
  const selected = board.nodes.find(n => n.id === id); if (!selected) return null;
  const parentId = sibling ? parentOf(board, id) : id, parent = board.nodes.find(n => n.id === parentId);
  const siblings = board.nodes.filter(n => parentOf(board, n.id) === parentId);
  const node = { id: crypto.randomUUID(), label, parentId, x: parent ? parent.x + parent.width + 100 : selected.x,
    y: Math.max(selected.y + (sibling ? selected.height + 36 : 0), ...siblings.map(n => n.y + n.height + 36)), width: 260, height: 76, color: "#e1e7ff" };
  return { board: { ...board, nodes: [...board.nodes.map(n => n.id === parentId ? { ...n, collapsed: false } : n), node], edges: parent ? [...board.edges, { id: crypto.randomUUID(), source: parent.id, target: node.id }] : board.edges }, selection: { kind: "nodes" as const, id: node.id } };
}
export function fittedViewport(bounds: Bounds, width: number, height: number): Viewport {
  const scale = Math.max(.1, Math.min(2, (width - 100) / Math.max(1, bounds.width), (height - 100) / Math.max(1, bounds.height)));
  return { scale, x: width / 2 - (bounds.x + bounds.width / 2) * scale, y: height / 2 - (bounds.y + bounds.height / 2) * scale };
}
