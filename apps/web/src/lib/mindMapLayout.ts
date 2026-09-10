import type { MindMapNode, MindMapEdge } from "@mindcanvas/shared";

// Conservative text sizing, independent of DOM/fonts so imports and tests agree.
export function nodeHeight(label: string, width: number, sourcePage?: number, collapsed?: boolean) {
  const columns = Math.max(1, Math.floor((width - 24) / 12));
  const lines = label.split("\n").reduce((sum, paragraph) => {
    let count = 1, used = 0;
    for (const word of paragraph.split(/\s+/)) {
      const length = Array.from(word).length;
      if (used && used + 1 + length > columns) { count++; used = 0; }
      else if (used) used++;
      count += Math.max(0, Math.ceil(length / columns) - 1);
      used += length ? ((length - 1) % columns) + 1 : 0;
    }
    return sum + count;
  }, 0);
  return Math.max(76, 24 + lines * 23 + (sourcePage ? 24 : 0) + (collapsed ? 24 : 0));
}

// Build a spanning forest for placement; retain all cross-links in board data.
// Iterative traversal supports old files with cycles without recursion overflow.
export function layoutMindMap(nodes: MindMapNode[], edges: MindMapEdge[], origin = { x: 100, y: 100 }): MindMapNode[] {
  if (!nodes.length) return nodes;
  const byId = new Map(nodes.map(n => [n.id, n]));
  const outgoing = new Map(nodes.map(n => [n.id, [] as string[]]));
  const incoming = new Set<string>();
  for (const e of edges) if (e.source !== e.target && byId.has(e.source) && byId.has(e.target)) {
    if (!outgoing.get(e.source)!.includes(e.target)) outgoing.get(e.source)!.push(e.target);
    incoming.add(e.target);
  }
  const roots: string[] = [], visited = new Set<string>(), order: string[] = [];
  const children = new Map(nodes.map(n => [n.id, [] as string[]]));
  const depth = new Map<string, number>();
  const candidates = [...nodes.filter(n => !incoming.has(n.id)), ...nodes];
  for (const candidate of candidates) {
    if (visited.has(candidate.id)) continue;
    roots.push(candidate.id);
    const stack = [{ id: candidate.id, level: 0, parent: "" }];
    while (stack.length) {
      const item = stack.pop()!;
      if (visited.has(item.id)) continue;
      visited.add(item.id); order.push(item.id); depth.set(item.id, item.level);
      if (item.parent) children.get(item.parent)!.push(item.id);
      const next = outgoing.get(item.id)!;
      for (let i = next.length - 1; i >= 0; i--) stack.push({ id: next[i], level: item.level + 1, parent: item.id });
    }
  }
  const sizes = new Map(nodes.map(n => {
    const width = 260;
    return [n.id, { width, height: nodeHeight(n.label, width, n.sourcePage, n.collapsed) }];
  }));
  const spans = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const kids = children.get(id)!;
    const total = kids.reduce((sum, child) => sum + spans.get(child)!, 0) + Math.max(0, kids.length - 1) * 36;
    spans.set(id, Math.max(sizes.get(id)!.height, total));
  }
  const tops = new Map<string, number>(); let rootY = origin.y;
  for (const root of roots) { tops.set(root, rootY); rootY += spans.get(root)! + 80; }
  const placed = new Map<string, MindMapNode>();
  for (const id of order) {
    const top = tops.get(id)!, span = spans.get(id)!, size = sizes.get(id)!;
    placed.set(id, { ...byId.get(id)!, ...size, x: origin.x + depth.get(id)! * 380, y: top + (span - size.height) / 2 });
    const kids = children.get(id)!;
    const childSpan = kids.reduce((sum, child) => sum + spans.get(child)!, 0) + Math.max(0, kids.length - 1) * 36;
    let childY = top + (span - childSpan) / 2;
    for (const child of kids) { tops.set(child, childY); childY += spans.get(child)! + 36; }
  }
  return nodes.map(n => placed.get(n.id)!);
}
