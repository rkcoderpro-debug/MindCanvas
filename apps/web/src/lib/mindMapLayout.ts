import type { MindMapNode, MindMapEdge } from "@mindcanvas/shared";

export type MindMapBranch = {
  rootId: string;
  rootLabel: string;
  nodeIds: string[];
  nodeLabels: string[];
};

export type MindMapLayoutSummary = {
  rootId: string;
  rootLabel: string;
  left: MindMapBranch[];
  right: MindMapBranch[];
};

export type MindMapLayoutMode = "radial" | "fan" | "symmetric" | "left-right" | "top-bottom" | "organic";

export type MindMapLayoutSide = {
  index: number;
  angle: number;
  branches: MindMapBranch[];
};

export type MindMapMultiLayoutSummary = {
  rootId: string;
  rootLabel: string;
  sides: MindMapLayoutSide[];
  sideCount: number;
  mode: MindMapLayoutMode;
};

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

/**
 * Arrange a map around its main root. Direct root branches are balanced by
 * subtree size and placed on the left/right; descendants stay on the same
 * side as their branch. The returned summary is intentionally derived data,
 * so no new persistence format is needed for existing boards.
 */
export function layoutMindMapTwoSided(nodes: MindMapNode[], edges: MindMapEdge[], origin = { x: 100, y: 100 }): { nodes: MindMapNode[]; summary: MindMapLayoutSummary } {
  if (!nodes.length) return { nodes, summary: { rootId: "", rootLabel: "", left: [], right: [] } };
  const byId = new Map(nodes.map(node => [node.id, node]));
  const outgoing = new Map(nodes.map(node => [node.id, [] as string[]]));
  const incoming = new Set<string>();
  const explicitParent = new Set<string>();
  const addHierarchy = (source: string, target: string) => {
    if (source === target || !byId.has(source) || !byId.has(target) || outgoing.get(source)!.includes(target)) return;
    outgoing.get(source)!.push(target);
    incoming.add(target);
  };
  for (const node of nodes) {
    if (node.parentId && byId.has(node.parentId) && node.parentId !== node.id) {
      explicitParent.add(node.id);
      addHierarchy(node.parentId, node.id);
    }
  }
  for (const edge of edges) if (!explicitParent.has(edge.target)) addHierarchy(edge.source, edge.target);

  const roots: string[] = [];
  const visited = new Set<string>();
  const order: string[] = [];
  const children = new Map(nodes.map(node => [node.id, [] as string[]]));
  const depth = new Map<string, number>();
  const candidates = [...nodes.filter(node => !incoming.has(node.id)), ...nodes];
  for (const candidate of candidates) {
    if (visited.has(candidate.id)) continue;
    roots.push(candidate.id);
    const stack = [{ id: candidate.id, level: 0, parent: "" }];
    while (stack.length) {
      const item = stack.pop()!;
      if (visited.has(item.id)) continue;
      visited.add(item.id);
      order.push(item.id);
      depth.set(item.id, item.level);
      if (item.parent) children.get(item.parent)!.push(item.id);
      const next = outgoing.get(item.id)!;
      for (let index = next.length - 1; index >= 0; index -= 1) stack.push({ id: next[index], level: item.level + 1, parent: item.id });
    }
  }

  const sizes = new Map(nodes.map(node => {
    const width = 260;
    return [node.id, { width, height: nodeHeight(node.label, width, node.sourcePage, node.collapsed) }];
  }));
  const spans = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const branchChildren = children.get(id)!;
    const total = branchChildren.reduce((sum, child) => sum + (spans.get(child) ?? sizes.get(child)!.height), 0) + Math.max(0, branchChildren.length - 1) * 36;
    spans.set(id, Math.max(sizes.get(id)!.height, total));
  }

  const mainRootId = roots[0];
  const mainRoot = byId.get(mainRootId)!;
  const branchRoots = [...children.get(mainRootId)!, ...roots.slice(1)];
  const left: MindMapBranch[] = [];
  const right: MindMapBranch[] = [];
  let leftWeight = 0;
  let rightWeight = 0;
  const collectBranch = (rootId: string): string[] => {
    const result: string[] = [], stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      result.push(id);
      const branchChildren = children.get(id) ?? [];
      for (let index = branchChildren.length - 1; index >= 0; index -= 1) stack.push(branchChildren[index]);
    }
    return result;
  };
  for (const [index, branchRootId] of branchRoots.entries()) {
    const ids = collectBranch(branchRootId);
    // Put the first branch on the left and the next on the right. Remaining
    // branches go to the lighter side so large maps remain readable.
    const side: "left" | "right" = index === 0 ? "left" : index === 1 ? "right" : leftWeight <= rightWeight ? "left" : "right";
    const branch = { rootId: branchRootId, rootLabel: byId.get(branchRootId)!.label, nodeIds: ids, nodeLabels: ids.map(id => byId.get(id)!.label) };
    (side === "left" ? left : right).push(branch);
    const weight = spans.get(branchRootId) ?? sizes.get(branchRootId)!.height;
    if (side === "left") leftWeight += weight; else rightWeight += weight;
  }

  const placed = new Map<string, MindMapNode>();
  const rootSize = sizes.get(mainRootId)!;
  placed.set(mainRootId, { ...mainRoot, ...rootSize, x: origin.x, y: origin.y });
  const placeBranch = (id: string, top: number, side: "left" | "right", distance: number) => {
    const node = byId.get(id)!;
    const span = spans.get(id) ?? rootSize.height;
    const size = sizes.get(id)!;
    placed.set(id, { ...node, ...size, x: origin.x + (side === "left" ? -1 : 1) * distance * 380, y: top + (span - size.height) / 2 });
    const branchChildren = children.get(id) ?? [];
    const childSpan = branchChildren.reduce((sum, child) => sum + (spans.get(child) ?? sizes.get(child)!.height), 0) + Math.max(0, branchChildren.length - 1) * 36;
    let childTop = top + (span - childSpan) / 2;
    for (const child of branchChildren) {
      const childHeight = spans.get(child) ?? sizes.get(child)!.height;
      placeBranch(child, childTop, side, distance + 1);
      childTop += childHeight + 36;
    }
  };
  const centerY = origin.y + rootSize.height / 2;
  const placeSide = (branches: MindMapBranch[], side: "left" | "right") => {
    const total = branches.reduce((sum, branch) => sum + (spans.get(branch.rootId) ?? rootSize.height), 0) + Math.max(0, branches.length - 1) * 36;
    let top = centerY - total / 2;
    for (const branch of branches) {
      const span = spans.get(branch.rootId) ?? rootSize.height;
      placeBranch(branch.rootId, top, side, 1);
      top += span + 36;
    }
  };
  placeSide(left, "left");
  placeSide(right, "right");
  // A malformed/cyclic legacy map may leave a node outside the spanning
  // forest. Keep it visible and report it on the right instead of dropping it.
  for (const node of nodes) if (!placed.has(node.id)) {
    const fallback = { rootId: node.id, rootLabel: node.label, nodeIds: [node.id], nodeLabels: [node.label] };
    right.push(fallback);
    placeBranch(node.id, centerY, "right", 1);
  }
  return { nodes: nodes.map(node => placed.get(node.id) ?? node), summary: { rootId: mainRootId, rootLabel: mainRoot.label, left, right } };
}

function layoutModeAngles(sideCount: number, mode: MindMapLayoutMode) {
  if (sideCount === 2 || mode === "left-right") return Array.from({ length: sideCount }, (_, index) => index % 2 === 0 ? Math.PI : 0);
  if (mode === "top-bottom") return Array.from({ length: sideCount }, (_, index) => index % 2 === 0 ? -Math.PI / 2 : Math.PI / 2);
  const start = mode === "fan" ? -Math.PI * .82 : -Math.PI / 2;
  const span = mode === "fan" ? Math.PI * 1.64 : Math.PI * 2;
  return Array.from({ length: sideCount }, (_, index) => start + span * index / sideCount);
}

/**
 * Arrange a selected mind-map subtree around its main node. Branches are
 * distributed into 2–12 directional buckets, while every descendant stays
 * inside the tangent band of its first-level branch. This keeps the result
 * map-like without changing edge data or unrelated canvas elements.
 */
export function layoutMindMapMultiSided(
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  origin = { x: 100, y: 100 },
  sideCount = 4,
  mode: MindMapLayoutMode = "radial",
  rootId?: string,
): { nodes: MindMapNode[]; summary: MindMapMultiLayoutSummary } {
  const count = Math.max(2, Math.min(12, Math.round(Number.isFinite(sideCount) ? sideCount : 4)));
  const emptySummary = { rootId: "", rootLabel: "", sides: Array.from({ length: count }, (_, index) => ({ index, angle: 0, branches: [] })), sideCount: count, mode };
  if (!nodes.length) return { nodes, summary: emptySummary };

  const byId = new Map(nodes.map(node => [node.id, node]));
  const children = new Map(nodes.map(node => [node.id, [] as string[]]));
  const incoming = new Set<string>();
  const explicitParent = new Set<string>();
  const addHierarchy = (source: string, target: string) => {
    if (source === target || !byId.has(source) || !byId.has(target) || children.get(source)!.includes(target)) return;
    children.get(source)!.push(target);
    incoming.add(target);
  };
  for (const node of nodes) if (node.parentId && byId.has(node.parentId) && node.parentId !== node.id) {
    explicitParent.add(node.id);
    addHierarchy(node.parentId, node.id);
  }
  for (const edge of edges) if (!explicitParent.has(edge.target)) addHierarchy(edge.source, edge.target);

  const roots: string[] = [], visited = new Set<string>();
  const candidates = [...nodes.filter(node => !incoming.has(node.id)), ...nodes];
  for (const candidate of candidates) {
    if (visited.has(candidate.id)) continue;
    roots.push(candidate.id);
    const stack = [candidate.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const branchChildren = children.get(id) ?? [];
      for (let index = branchChildren.length - 1; index >= 0; index -= 1) stack.push(branchChildren[index]);
    }
  }
  const mainRootId = rootId && byId.has(rootId) ? rootId : roots[0];
  const mainRoot = byId.get(mainRootId)!;
  const sizes = new Map(nodes.map(node => {
    const width = 260;
    return [node.id, { width, height: nodeHeight(node.label, width, node.sourcePage, node.collapsed) }];
  }));
  const order: string[] = [];
  const depth = new Map<string, number>();
  const visit = (id: string, level: number, seen = new Set<string>()) => {
    if (seen.has(id)) return;
    seen.add(id); order.push(id); depth.set(id, level);
    for (const child of children.get(id) ?? []) visit(child, level + 1, seen);
  };
  visit(mainRootId, 0);
  for (const root of roots) if (!order.includes(root)) visit(root, 0);
  const spans = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const branchChildren = children.get(id) ?? [];
    const total = branchChildren.reduce((sum, child) => sum + (spans.get(child) ?? sizes.get(child)!.height), 0) + Math.max(0, branchChildren.length - 1) * 34;
    spans.set(id, Math.max(sizes.get(id)!.height, total));
  }

  const branchRoots = [...(children.get(mainRootId) ?? []), ...roots.filter(id => id !== mainRootId)];
  const angles = layoutModeAngles(count, mode);
  const buckets = angles.map((angle, index) => ({ index, angle, branches: [] as MindMapBranch[], weight: 0 }));
  const collectBranch = (branchRootId: string) => {
    const result: string[] = [], stack = [branchRootId], seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id); result.push(id);
      const branchChildren = children.get(id) ?? [];
      for (let index = branchChildren.length - 1; index >= 0; index -= 1) stack.push(branchChildren[index]);
    }
    return result;
  };
  for (const [index, branchRootId] of branchRoots.entries()) {
    const nodeIds = collectBranch(branchRootId);
    const branch = { rootId: branchRootId, rootLabel: byId.get(branchRootId)!.label, nodeIds, nodeLabels: nodeIds.map(id => byId.get(id)!.label) };
    const bucket = index < count ? buckets[index] : buckets.reduce((lightest, current) => current.weight < lightest.weight ? current : lightest, buckets[0]);
    bucket.branches.push(branch);
    bucket.weight += spans.get(branchRootId) ?? sizes.get(branchRootId)!.height;
  }

  const placed = new Map<string, MindMapNode>();
  const rootSize = sizes.get(mainRootId)!;
  const rootCenter = { x: origin.x + rootSize.width / 2, y: origin.y + rootSize.height / 2 };
  placed.set(mainRootId, { ...mainRoot, ...rootSize, x: origin.x, y: origin.y });
  const distance = mode === "organic" ? 330 : mode === "fan" ? 350 : 380;
  const gap = mode === "organic" ? 48 : 36;
  const placeBranch = (id: string, bucket: typeof buckets[number], top: number, level: number, branchSpan: number) => {
    const node = byId.get(id)!;
    const size = sizes.get(id)!;
    const span = spans.get(id) ?? size.height;
    const direction = { x: Math.cos(bucket.angle), y: Math.sin(bucket.angle) };
    const tangent = { x: -direction.y, y: direction.x };
    const center = { x: rootCenter.x + direction.x * distance * level + tangent.x * (top + (branchSpan - size.height) / 2), y: rootCenter.y + direction.y * distance * level + tangent.y * (top + (branchSpan - size.height) / 2) };
    placed.set(id, { ...node, ...size, x: center.x - size.width / 2, y: center.y - size.height / 2 });
    const branchChildren = children.get(id) ?? [];
    const childSpan = branchChildren.reduce((sum, child) => sum + (spans.get(child) ?? sizes.get(child)!.height), 0) + Math.max(0, branchChildren.length - 1) * gap;
    let childTop = top + (span - childSpan) / 2;
    for (const child of branchChildren) {
      const childHeight = spans.get(child) ?? sizes.get(child)!.height;
      placeBranch(child, bucket, childTop, level + 1, childHeight);
      childTop += childHeight + gap;
    }
  };
  for (const bucket of buckets) {
    const total = bucket.branches.reduce((sum, branch) => sum + (spans.get(branch.rootId) ?? rootSize.height), 0) + Math.max(0, bucket.branches.length - 1) * gap;
    let top = -total / 2;
    for (const branch of bucket.branches) {
      const span = spans.get(branch.rootId) ?? rootSize.height;
      placeBranch(branch.rootId, bucket, top, 1, span);
      top += span + gap;
    }
  }
  for (const node of nodes) if (!placed.has(node.id)) {
    const bucket = buckets[0];
    placeBranch(node.id, bucket, 0, 1, sizes.get(node.id)!.height);
  }
  return {
    nodes: nodes.map(node => placed.get(node.id) ?? node),
    summary: { rootId: mainRootId, rootLabel: mainRoot.label, sides: buckets.map(({ index, angle, branches }) => ({ index, angle, branches })), sideCount: count, mode },
  };
}
