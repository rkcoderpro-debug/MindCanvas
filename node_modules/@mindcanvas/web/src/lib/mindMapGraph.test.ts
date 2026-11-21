import { describe, expect, it } from "vitest";
import { collectMindMapSubtree, getMindMapHierarchy } from "./mindMapGraph";

const node = (id: string, parentId?: string) => ({
  id,
  label: id,
  x: 0,
  y: 0,
  width: 190,
  height: 76,
  ...(parentId ? { parentId } : {}),
});

describe("Mind-map hierarchy graph", () => {
  it("keeps relation edges out of parent and subtree resolution", () => {
    const nodes = [node("root"), node("child", "root"), node("outside")];
    const edges = [
      { id: "branch", source: "root", target: "child", kind: "branch" as const },
      { id: "cross", source: "child", target: "outside", kind: "relation" as const },
    ];
    const hierarchy = getMindMapHierarchy(nodes, edges);

    expect(hierarchy.parent.get("child")).toBe("root");
    expect(hierarchy.parent.has("outside")).toBe(false);
    expect(hierarchy.branchEdges).toEqual(new Set(["branch"]));
    expect(hierarchy.relationEdges).toEqual(new Set(["cross"]));
    expect(collectMindMapSubtree(hierarchy, "root")).toEqual(new Set(["root", "child"]));
  });

  it("preserves legacy first-incoming behavior while ignoring later incoming edges", () => {
    const nodes = [node("root"), node("first"), node("second")];
    const edges = [
      { id: "first-edge", source: "root", target: "first" },
      { id: "second-edge", source: "second", target: "first" },
    ];
    const hierarchy = getMindMapHierarchy(nodes, edges);

    expect(hierarchy.parent.get("first")).toBe("root");
    expect(hierarchy.children.get("root")).toEqual(["first"]);
    expect(hierarchy.relationEdges).toEqual(new Set(["second-edge"]));
  });

  it("guards malformed cycles and still returns every node exactly once", () => {
    const nodes = [node("a", "b"), node("b", "a"), node("c")];
    const edges = [
      { id: "ab", source: "a", target: "b", kind: "branch" as const },
      { id: "ba", source: "b", target: "a", kind: "branch" as const },
    ];
    const hierarchy = getMindMapHierarchy(nodes, edges);
    const all = new Set(nodes.flatMap(candidate => [...collectMindMapSubtree(hierarchy, candidate.id)]));

    expect(all).toEqual(new Set(["a", "b", "c"]));
    expect(hierarchy.parent.get("a")).toBe("b");
    expect(hierarchy.parent.has("b")).toBe(false);
    expect([...hierarchy.children.values()].flat()).toHaveLength(1);
  });
});
