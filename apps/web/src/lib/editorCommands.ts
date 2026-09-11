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
export function reorderSelection(board: BoardState, selections: Selection[], direction: "front" | "back" | "forward" | "backward"): BoardState {
  const ids = new Set(expandGroups(board, selections).map(s => s.id));
  // Treat groups as atomic blocks so moving a neighbouring layer cannot split one.
  const order = orderedElements(board).map(s => s.id), used = new Set<string>(), blocks: string[][] = [];
  for (const id of order) {
    if (used.has(id)) continue;
    const group = board.groups?.find(g => g.elementIds.includes(id));
    const block = group ? order.filter(id => group.elementIds.includes(id)) : [id];
    block.forEach(id => used.add(id)); blocks.push(block);
  }
  const chosen = (block: string[]) => block.some(id => ids.has(id));
  if (direction === "front" || direction === "back") {
    const yes = blocks.filter(chosen), no = blocks.filter(b => !chosen(b));
    return { ...board, layerOrder: (direction === "front" ? [...no, ...yes] : [...yes, ...no]).flat() };
  }
  if (direction === "forward") { for (let i = blocks.length - 2; i >= 0; i--) if (chosen(blocks[i]) && !chosen(blocks[i + 1])) [blocks[i], blocks[i + 1]] = [blocks[i + 1], blocks[i]]; }
  else { for (let i = 1; i < blocks.length; i++) if (chosen(blocks[i]) && !chosen(blocks[i - 1])) [blocks[i], blocks[i - 1]] = [blocks[i - 1], blocks[i]]; }
  return { ...board, layerOrder: blocks.flat() };
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
