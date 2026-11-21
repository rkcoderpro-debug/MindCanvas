import type { MindMapNode, MindMapEdge } from "@mindcanvas/shared";
import { getMindMapHierarchy } from "./mindMapGraph";

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

type LayoutForest = {
  byId: Map<string, MindMapNode>;
  children: Map<string, string[]>;
  roots: string[];
  order: string[];
  depth: Map<string, number>;
};

function layoutForest(nodes: MindMapNode[], edges: MindMapEdge[]): LayoutForest {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const hierarchy = getMindMapHierarchy(nodes, edges);
  const roots = [...hierarchy.roots];
  const order: string[] = [];
  const depth = new Map<string, number>();
  const visited = new Set<string>();
  const visit = (candidate: string, level: number) => {
    if (visited.has(candidate) || !byId.has(candidate)) return;
    const stack = [{ id: candidate, level }];
    while (stack.length) {
      const item = stack.pop()!;
      if (visited.has(item.id) || !byId.has(item.id)) continue;
      visited.add(item.id);
      order.push(item.id);
      depth.set(item.id, item.level);
      const branchChildren = hierarchy.children.get(item.id) ?? [];
      for (let index = branchChildren.length - 1; index >= 0; index -= 1) {
        stack.push({ id: branchChildren[index], level: item.level + 1 });
      }
    }
  };
  roots.forEach(root => visit(root, 0));
  // A malformed board can still contain an orphaned node omitted from roots;
  // retain it as a deterministic fallback instead of dropping it.
  nodes.forEach(node => {
    if (!visited.has(node.id)) { roots.push(node.id); visit(node.id, 0); }
  });
  return { byId, children: hierarchy.children, roots, order, depth };
}

// Build a spanning forest for placement; retain all cross-links in board data.
// Iterative traversal supports old files with cycles without recursion overflow.
export function layoutMindMap(nodes: MindMapNode[], edges: MindMapEdge[], origin = { x: 100, y: 100 }): MindMapNode[] {
  if (!nodes.length) return nodes;
  const { byId, roots, order, children, depth } = layoutForest(nodes, edges);
  const sizes = new Map(nodes.map(n => {
    const width = n.locked ? n.width : 260;
    return [n.id, { width, height: n.locked ? n.height : nodeHeight(n.label, width, n.sourcePage, n.collapsed) }];
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
    const node = byId.get(id)!;
    placed.set(id, { ...node, ...size, x: node.locked ? node.x : origin.x + depth.get(id)! * 380, y: node.locked ? node.y : top + (span - size.height) / 2 });
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
  const { byId, roots, order, children, depth } = layoutForest(nodes, edges);

  const sizes = new Map(nodes.map(node => {
    const width = node.locked ? node.width : 260;
    return [node.id, { width, height: node.locked ? node.height : nodeHeight(node.label, width, node.sourcePage, node.collapsed) }];
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
  placed.set(mainRootId, { ...mainRoot, ...rootSize, x: mainRoot.locked ? mainRoot.x : origin.x, y: mainRoot.locked ? mainRoot.y : origin.y });
  const placeBranch = (id: string, top: number, side: "left" | "right", distance: number) => {
    const node = byId.get(id)!;
    const span = spans.get(id) ?? rootSize.height;
    const size = sizes.get(id)!;
    placed.set(id, { ...node, ...size, x: node.locked ? node.x : origin.x + (side === "left" ? -1 : 1) * distance * 380, y: node.locked ? node.y : top + (span - size.height) / 2 });
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
  if (mode === "top-bottom") return Array.from({ length: sideCount }, (_, index) => index % 2 === 0 ? -Math.PI / 2 : Math.PI / 2);
  if (sideCount === 2 || mode === "left-right") return Array.from({ length: sideCount }, (_, index) => index % 2 === 0 ? Math.PI : 0);
  const start = mode === "fan" ? -Math.PI * .82 : -Math.PI / 2;
  const span = mode === "fan" ? Math.PI * 1.64 : Math.PI * 2;
  return Array.from({ length: sideCount }, (_, index) => start + span * index / sideCount);
}

function relaxMindMapOverlaps(placed: Map<string, MindMapNode>, rootId: string, byId: Map<string, MindMapNode>) {
  const movable = (id: string) => id !== rootId && !byId.get(id)?.locked;
  const overlap = (a: MindMapNode, b: MindMapNode) => {
    const x = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const y = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return x > 0 && y > 0 ? { x, y } : null;
  };
  // Layout lanes are usually enough; this small deterministic relaxation is
  // a final safety net for long labels and highly uneven branch sizes.
  for (let pass = 0; pass < 8; pass += 1) {
    const entries = [...placed.entries()];
    let changed = false;
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const [aId, a] = entries[left], [bId, b] = entries[right], amount = overlap(a, b);
        if (!amount) continue;
        const moveA = movable(aId), moveB = movable(bId);
        if (!moveA && !moveB) continue;
        const aCenter = { x: a.x + a.width / 2, y: a.y + a.height / 2 }, bCenter = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        const horizontal = amount.x <= amount.y;
        let dx = 0, dy = 0;
        if (horizontal) dx = (aCenter.x <= bCenter.x ? -1 : 1) * (amount.x + 18);
        else dy = (aCenter.y <= bCenter.y ? -1 : 1) * (amount.y + 18);
        const move = (id: string, fraction: number) => {
          const current = placed.get(id);
          if (!current || !movable(id)) return;
          placed.set(id, { ...current, x: current.x + dx * fraction, y: current.y + dy * fraction });
        };
        if (moveA && moveB) { move(aId, -.5); move(bId, .5); }
        else if (moveA) move(aId, -1);
        else move(bId, 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
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

  const { byId, children, roots, order, depth } = layoutForest(nodes, edges);
  const mainRootId = rootId && byId.has(rootId) ? rootId : roots[0];
  const mainRoot = byId.get(mainRootId)!;
  const sizes = new Map(nodes.map(node => {
    const width = node.locked ? node.width : 260;
    return [node.id, { width, height: node.locked ? node.height : nodeHeight(node.label, width, node.sourcePage, node.collapsed) }];
  }));
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
  const rootOrigin = mainRoot.locked ? { x: mainRoot.x, y: mainRoot.y } : origin;
  const rootCenter = { x: rootOrigin.x + rootSize.width / 2, y: rootOrigin.y + rootSize.height / 2 };
  placed.set(mainRootId, { ...mainRoot, ...rootSize, x: rootOrigin.x, y: rootOrigin.y });
  const distance = mode === "organic" ? 330 : mode === "fan" ? 350 : 380;
  const gap = mode === "organic" ? 48 : 36;
  const placeBranch = (id: string, bucket: typeof buckets[number], top: number, level: number, branchSpan: number) => {
    const node = byId.get(id)!;
    const size = sizes.get(id)!;
    const span = spans.get(id) ?? size.height;
    const direction = { x: Math.cos(bucket.angle), y: Math.sin(bucket.angle) };
    const tangent = { x: -direction.y, y: direction.x };
    const center = { x: rootCenter.x + direction.x * distance * level + tangent.x * (top + (branchSpan - size.height) / 2), y: rootCenter.y + direction.y * distance * level + tangent.y * (top + (branchSpan - size.height) / 2) };
    placed.set(id, { ...node, ...size, x: node.locked ? node.x : center.x - size.width / 2, y: node.locked ? node.y : center.y - size.height / 2 });
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
  relaxMindMapOverlaps(placed, mainRootId, byId);
  return {
    nodes: nodes.map(node => placed.get(node.id) ?? node),
    summary: { rootId: mainRootId, rootLabel: mainRoot.label, sides: buckets.map(({ index, angle, branches }) => ({ index, angle, branches })), sideCount: count, mode },
  };
}
