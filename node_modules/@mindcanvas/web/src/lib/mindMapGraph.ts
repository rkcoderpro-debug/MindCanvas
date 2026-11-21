import type { MindMapEdge, MindMapNode } from "@mindcanvas/shared";

export type MindMapHierarchy = {
  /** The selected hierarchy parent for each node, excluding roots. */
  parent: Map<string, string>;
  /** Deterministic hierarchy children. Relation edges are not included. */
  children: Map<string, string[]>;
  /** Edge ids that participate in the hierarchy. Parent-only metadata has no id. */
  branchEdges: Set<string>;
  /** Edge ids that are visible relationships but not hierarchy. */
  relationEdges: Set<string>;
  roots: string[];
};

function wouldCreateCycle(parent: Map<string, string>, child: string, candidateParent: string) {
  const seen = new Set<string>([child]);
  let current: string | undefined = candidateParent;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = parent.get(current);
  }
  return false;
}

/**
 * Resolve the hierarchy without mutating the board.
 *
 * Precedence is intentional:
 * 1. node.parentId is the strongest signal;
 * 2. an explicitly typed branch edge is next;
 * 3. an old untyped edge becomes the first incoming branch edge only.
 *
 * All other edges remain relation edges. This gives old projects their former
 * layout while making cross-links safe for V4.7 branch operations.
 */
export function getMindMapHierarchy(nodes: MindMapNode[], edges: MindMapEdge[]): MindMapHierarchy {
  const ids = new Set(nodes.map(node => node.id));
  const parent = new Map<string, string>();
  const children = new Map(nodes.map(node => [node.id, [] as string[]]));
  const branchEdges = new Set<string>();
  const acceptedEdgeByPair = new Map<string, string>();

  const addParent = (child: string, candidateParent: string, edge?: MindMapEdge) => {
    if (child === candidateParent || !ids.has(child) || !ids.has(candidateParent) || parent.has(child) || wouldCreateCycle(parent, child, candidateParent)) return false;
    parent.set(child, candidateParent);
    children.get(candidateParent)!.push(child);
    if (edge) {
      branchEdges.add(edge.id);
      acceptedEdgeByPair.set(`${edge.source}\u0000${edge.target}`, edge.id);
    }
    return true;
  };

  // Explicit parent metadata wins over every edge because it is how newer
  // generated maps preserve hierarchy when they also contain cross-links.
  for (const node of nodes) {
    if (node.parentId && ids.has(node.parentId)) addParent(node.id, node.parentId);
  }

  // When a newer board stores parentId plus its historical untyped edge,
  // classify that edge as the visible branch connector as well.
  for (const edge of edges) {
    if (edge.kind !== "relation" && parent.get(edge.target) === edge.source && !branchEdges.has(edge.id)) {
      const pair = `${edge.source}\u0000${edge.target}`;
      if (!acceptedEdgeByPair.has(pair)) {
        branchEdges.add(edge.id);
        acceptedEdgeByPair.set(pair, edge.id);
      }
    }
  }

  // Typed branch edges are authoritative for nodes that have no parentId.
  for (const edge of edges) {
    if (edge.kind === "branch") addParent(edge.target, edge.source, edge);
  }

  // Legacy edges had no kind. Pick only one incoming hierarchy edge per node;
  // the cycle guard makes malformed old graphs safe and deterministic.
  for (const edge of edges) {
    if (edge.kind !== undefined || parent.has(edge.target)) continue;
    addParent(edge.target, edge.source, edge);
  }

  const relationEdges = new Set<string>();
  for (const edge of edges) {
    const isHierarchyPair = parent.get(edge.target) === edge.source;
    const accepted = acceptedEdgeByPair.get(`${edge.source}\u0000${edge.target}`);
    if (!branchEdges.has(edge.id) && (!isHierarchyPair || accepted !== edge.id || edge.kind === "relation")) relationEdges.add(edge.id);
  }

  const roots = nodes.filter(node => !parent.has(node.id)).map(node => node.id);
  return { parent, children, branchEdges, relationEdges, roots };
}

export function collectMindMapSubtree(hierarchy: MindMapHierarchy, rootId: string) {
  const result = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const child of hierarchy.children.get(id) ?? []) stack.push(child);
  }
  return result;
}

export function hierarchyParent(hierarchy: MindMapHierarchy, id: string) {
  return hierarchy.parent.get(id);
}
