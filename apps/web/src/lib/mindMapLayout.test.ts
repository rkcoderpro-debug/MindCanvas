import { describe, it, expect } from "vitest";
import { layoutMindMap, nodeHeight } from "./mindMapLayout";
import { applyGraph, arrangeMindMap, blankBoard } from "./board";
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
});
