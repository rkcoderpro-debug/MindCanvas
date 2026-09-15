import { describe, it, expect } from "vitest";
import { layoutMindMap, layoutMindMapMultiSided, layoutMindMapTwoSided, nodeHeight } from "./mindMapLayout";
import { applyGraph, arrangeMindMap, arrangeMindMapMultiSided, blankBoard } from "./board";
const node = (id: string) => ({ id, label: id, x: 0, y: 0, width: 190, height: 76 });
describe("Mind-map hierarchy layout", () => {
  it("places complete subtrees in separate bands with parents to their left", () => {
    const nodes = ["root", "a", "b", "a1", "a2", "b1"].map(node);
    const edges = [["root", "a"], ["root", "b"], ["a", "a1"], ["a", "a2"], ["b", "b1"]].map(([source, target], i) => ({ id: String(i), source, target }));
    const result = layoutMindMap(nodes, edges), byId = new Map(result.map(n => [n.id, n]));
    for (const e of edges) expect(byId.get(e.source)!.x + 260).toBeLessThan(byId.get(e.target)!.x);
    expect(byId.get("a2")!.y + byId.get("a2")!.height).toBeLessThan(byId.get("b1")!.y);
    for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
      const a = result[i], b = result[j];
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    }
  });
  it("sizes long labels including page references", () => {
    expect(nodeHeight("Nhãn dài ".repeat(20), 260, 12)).toBeGreaterThan(200);
    expect(nodeHeight("Label", 260, 12)).toBeGreaterThanOrEqual(nodeHeight("Label", 260));
  });
  it("handles cycles and disconnected roots deterministically without losing nodes", () => {
    const nodes = ["a", "b", "c"].map(node), edges = [{ id: "1", source: "a", target: "b" }, { id: "2", source: "b", target: "a" }];
    const result = layoutMindMap(nodes, edges);
    expect(result).toHaveLength(3); expect(result).toEqual(layoutMindMap(nodes, edges)); expect(result.every(n => Number.isFinite(n.y))).toBe(true);
  });
  it("uses parentId without edges and preserves existing board content", () => {
    const before = { ...blankBoard(), nodes: [node("old")], texts: [{ id: "t", text: "keep", x: 20, y: 20, width: 100 }] };
    const next = applyGraph(before, { title: "AI", nodes: [{ id: "child", label: "child", parentId: "root" }, { id: "root", label: "root" }], edges: [] });
    expect(next.nodes[0]).toEqual(before.nodes[0]); expect(next.texts).toBe(before.texts);
    expect(next.nodes.find(n => n.label === "root")!.x).toBeLessThan(next.nodes.find(n => n.label === "child")!.x); expect(next.edges).toHaveLength(1);
  });
  it("rearranges saved maps without changing edges, content or unrelated elements", () => {
    const before = { ...blankBoard(), nodes: [node("a"), node("b")], edges: [{ id: "e", source: "a", target: "b" }], shapes: [{ id: "s", kind: "rect" as const, x: 400, y: 0, width: 200, height: 200, color: "#fff" }] };
    const next = arrangeMindMap(before); expect(next.edges).toBe(before.edges); expect(next.shapes).toBe(before.shapes); expect(next.nodes[0].x).toBeGreaterThan(600);
    expect(next.nodes.map(n => n.id)).toEqual(["a", "b"]); expect(before.nodes[0].x).toBe(0);
  });
  it("balances root branches on both sides and reports their node membership", () => {
    const nodes = ["root", "alpha", "alpha-child", "beta", "beta-child", "gamma"].map(node);
    const edges = [["root", "alpha"], ["alpha", "alpha-child"], ["root", "beta"], ["beta", "beta-child"], ["root", "gamma"]].map(([source, target], index) => ({ id: String(index), source, target }));
    const result = layoutMindMapTwoSided(nodes, edges, { x: 500, y: 100 });
    const byId = new Map(result.nodes.map(item => [item.id, item]));
    expect(byId.get("root")!.x).toBe(500);
    expect(byId.get("alpha")!.x).toBeLessThan(byId.get("root")!.x);
    expect(byId.get("beta")!.x).toBeGreaterThan(byId.get("root")!.x);
    expect(result.summary.left.flatMap(branch => branch.nodeIds)).toEqual(["alpha", "alpha-child", "gamma"]);
    expect(result.summary.right.flatMap(branch => branch.nodeIds)).toEqual(["beta", "beta-child"]);
  });

  it("distributes first-level branches across the requested radial sides", () => {
    const nodes = ["root", "a", "b", "c", "d", "a1", "c1"].map(node);
    const edges = [["root", "a"], ["root", "b"], ["root", "c"], ["root", "d"], ["a", "a1"], ["c", "c1"]].map(([source, target], index) => ({ id: String(index), source, target }));
    const result = layoutMindMapMultiSided(nodes, edges, { x: 500, y: 300 }, 4, "radial");
    const root = result.nodes.find(item => item.id === "root")!;
    expect(root.x).toBe(500);
    expect(result.summary.sides).toHaveLength(4);
    expect(result.summary.sides.flatMap(side => side.branches).map(branch => branch.rootId)).toEqual(["a", "b", "c", "d"]);
    expect(result.nodes.every(item => Number.isFinite(item.x) && Number.isFinite(item.y))).toBe(true);
  });

  it("keeps unrelated elements in place when arranging a selected subtree", () => {
    const before = { ...blankBoard(), nodes: [node("root"), { ...node("child"), parentId: "root" }, node("other")], edges: [{ id: "e", source: "root", target: "child" }], texts: [{ id: "t", text: "keep", x: 20, y: 20, width: 100 }] };
    const next = arrangeMindMapMultiSided(before, "root", 3, "fan").board;
    expect(next.nodes.find(item => item.id === "root")!.x).toBe(before.nodes[0].x);
    expect(next.nodes.find(item => item.id === "other")).toEqual(before.nodes[2]);
    expect(next.texts).toBe(before.texts);
  });
});
