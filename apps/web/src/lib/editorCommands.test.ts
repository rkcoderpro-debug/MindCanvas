import { describe, it, expect } from "vitest";
import { blankBoard, parseBoard } from "./board";
import { addRelativeNode, alignSelection, distributeSelection, duplicateSelection, expandGroups, fittedViewport, groupSelection, moveLayer, moveSelection, normalizeEditor, orderedElements, pasteSelection, removeSelection, reparentNode, reorderSelection, resizeSelection, rotateSelection, setElementFlags, smartSnapMoveSelection, snapMoveSelection, ungroupSelection } from "./editorCommands";
const fixture = () => normalizeEditor({ ...blankBoard(), nodes: [{ id:"n",label:"Root",x:0,y:0,width:190,height:76 }], texts:[{ id:"t",text:"Text",x:300,y:30,width:200 }], shapes:[{ id:"s",kind:"rect" as const,x:0,y:0,width:400,height:200,color:"#ffffff" }] });
describe("Editor commands", () => {
  it("pastes an independent group with new IDs and a new offset each time", () => {
    const source=groupSelection(fixture(),[{kind:"texts",id:"t"},{kind:"nodes",id:"n"}]);
    const selected=expandGroups(source,[{kind:"nodes",id:"n"}]);
    const first=pasteSelection(blankBoard(),source,selected), second=pasteSelection(first.board,source,selected,48);
    expect(first.board.nodes).toHaveLength(1);expect(second.board.nodes).toHaveLength(2);expect(second.board.nodes[1].x-first.board.nodes[0].x).toBe(24);
    expect(second.board.groups).toHaveLength(2); expect(new Set(second.board.layerOrder).size).toBe(4); expect(parseBoard(second.board)).toBeTruthy();
  });
  it("preserves legacy order and appends newly created elements above all types", () => {
    const b=fixture(); expect(orderedElements(b).map(s=>s.id)).toEqual(["s","t","n"]);
    const next=normalizeEditor({...b,drawings:[{id:"p",points:[{x:0,y:0}],width:3,opacity:1,color:"#123456"}]},b);
    expect(next.layerOrder).toEqual(["s","t","n","p"]);
    expect(parseBoard(next).layerOrder).toEqual(next.layerOrder);
  });
  it("reorders across element types and moves groups as atomic blocks", () => {
    const b=groupSelection(fixture(),[{kind:"texts",id:"t"},{kind:"nodes",id:"n"}]);
    const next=reorderSelection(b,[{kind:"texts",id:"t"}],"back"); expect(next.layerOrder).toEqual(["t","n","s"]);
    expect(reorderSelection(next,[{kind:"shapes",id:"s"}],"backward").layerOrder).toEqual(["s","t","n"]);
    expect(ungroupSelection(next,[{kind:"nodes",id:"n"}]).groups).toEqual([]);
  });
  it("drags a layer row without splitting its group", () => {
    const grouped=groupSelection(fixture(),[{kind:"texts",id:"t"},{kind:"nodes",id:"n"}]);
    expect(moveLayer(grouped,"t","s").layerOrder).toEqual(["s","t","n"]);
    expect(moveLayer(grouped,"n","t")).toBe(grouped);
  });
  it("moves group members once and removes groups/connectors with deleted endpoints", () => {
    const b=groupSelection(fixture(),[{kind:"texts",id:"t"},{kind:"nodes",id:"n"}]);
    const selection=expandGroups(b,[{kind:"nodes",id:"n"}]); expect(selection).toHaveLength(2);
    const moved=moveSelection(b,selection,50,30); expect(moved.nodes[0].x).toBe(50); expect(moved.texts[0].x).toBe(350); expect(b.nodes[0].x).toBe(0);
    expect(removeSelection(moved,selection).groups).toHaveLength(0);
  });
  it("duplicates connected nodes with fresh groups and internal edge references", () => {
    const initial=fixture(); const child=addRelativeNode(initial,"n",false,"Child")!;
    const b=groupSelection(child.board,[{kind:"nodes",id:"n"},child.selection]);
    const result=duplicateSelection(b,expandGroups(b,[{kind:"nodes",id:"n"}]));
    expect(result.board.nodes).toHaveLength(4); expect(result.board.edges).toHaveLength(2); expect(result.board.groups).toHaveLength(2);
    const added=result.board.nodes.slice(2); expect(added[1].parentId).toBe(added[0].id); expect(result.board.edges[1].source).toBe(added[0].id);
    expect(parseBoard(result.board)).toBeTruthy();
  });
  it("creates siblings, reparents safely, and refuses descendant cycles", () => {
    const a=addRelativeNode(fixture(),"n",false,"A")!;
    const b=addRelativeNode(a.board,a.selection.id,true,"B")!;
    const moved=reparentNode(b.board,a.selection.id,b.selection.id);
    expect(moved.nodes.find(n=>n.id===a.selection.id)?.parentId).toBe(b.selection.id);
    expect(moved.nodes.find(n=>n.id===a.selection.id)!.x).toBeGreaterThan(moved.nodes.find(n=>n.id===b.selection.id)!.x + 260);
    expect(reparentNode(moved,b.selection.id,a.selection.id)).toBe(moved);
    expect(reparentNode(moved,"n",a.selection.id)).toBe(moved);
  });
  it("fits finite viewports and rejects invalid layer/group imports", () => {
    const v=fittedViewport({x:-100,y:-200,width:400,height:300},800,600); expect(v.scale).toBeGreaterThan(0); expect(Number.isFinite(v.x)).toBe(true);
    expect(()=>parseBoard({...fixture(),layerOrder:["missing"]})).toThrow();
    expect(()=>parseBoard({...fixture(),groups:[{id:"g",elementIds:["n","n"]}]})).toThrow();
  });
  it("supports editor-pro transforms, alignment, distribution, flags and grid snap", () => {
    const b = { ...blankBoard(), shapes: [
      { id:"a", kind:"rect" as const, x:10, y:10, width:40, height:40, color:"#ffffff" },
      { id:"b", kind:"rect" as const, x:100, y:30, width:20, height:20, color:"#ffffff" },
      { id:"c", kind:"rect" as const, x:200, y:80, width:30, height:30, color:"#ffffff" },
    ] };
    const selections = b.shapes.map(s => ({ kind:"shapes" as const, id:s.id }));
    expect(resizeSelection(b, selections, 400, 200).shapes[2].x).toBeGreaterThan(200);
    expect(alignSelection(b, selections, "top").shapes.map(s => s.y)).toEqual([10,10,10]);
    expect(distributeSelection(b, selections, "horizontal").shapes[1].x).toBeGreaterThan(10);
    expect(rotateSelection(b, [{kind:"shapes",id:"a"}], 45).shapes[0].rotation).toBe(45);
    const flagged = setElementFlags(b, [{kind:"shapes",id:"a"}], { locked:true, hidden:true });
    expect(flagged.shapes[0]).toMatchObject({locked:true,hidden:true});
    expect(snapMoveSelection(b, [{kind:"shapes",id:"a"}], 7, 9).shapes[0]).toMatchObject({x:16,y:16});
    expect(parseBoard(flagged)).toBeTruthy();
  });
  it("shows smart guides and aligns a moving element to a nearby edge", () => {
    const b = { ...blankBoard(), shapes: [
      { id:"moving", kind:"rect" as const, x:10, y:10, width:40, height:40, color:"#ffffff" },
      { id:"target", kind:"rect" as const, x:100, y:80, width:60, height:40, color:"#ffffff" },
    ] };
    const result = smartSnapMoveSelection(b, [{kind:"shapes",id:"moving"}], 48, 69, 8, 8);
    expect(result.board.shapes[0]).toMatchObject({ x:60, y:80 });
    expect(result.guides.some(guide => guide.axis === "y" && guide.value === 80)).toBe(true);
  });
});
