import { useEffect, useRef, useState } from "react";
import type { BoardState, CanvasShape, DrawingPath, MindMapNode, ToolMode, Vec2 } from "@mindcanvas/shared";

type Props = {
  board: BoardState;
  tool: ToolMode;
  onChange: (next: BoardState) => void;
};

const colors = { ink: "#1c2440", cobalt: "#4361ee", gold: "#f59e0b" };

export default function CanvasBoard({ board, tool, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("node-root");
  const [drag, setDrag] = useState<{ id: string; offset: Vec2 } | null>(null);
  const [pan, setPan] = useState<{ start: Vec2; origin: BoardState["viewport"] } | null>(null);
  const [draftPath, setDraftPath] = useState<DrawingPath | null>(null);
  const [draftShape, setDraftShape] = useState<CanvasShape | null>(null);

  const localPoint = (event: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rect.left - board.viewport.x) / board.viewport.scale,
      y: (event.clientY - rect.top - board.viewport.y) / board.viewport.scale,
    };
  };

  const commit = (changes: Partial<BoardState>) => onChange({ ...board, ...changes, updatedAt: new Date().toISOString() });

  const handleSurfaceDown = (event: React.PointerEvent) => {
    const point = localPoint(event);
    if (tool === "pen" || tool === "highlighter") {
      const path: DrawingPath = { id: crypto.randomUUID(), points: [point], color: tool === "pen" ? colors.cobalt : colors.gold, width: tool === "pen" ? 3 : 15, opacity: tool === "pen" ? 0.9 : 0.28 };
      setDraftPath(path); event.currentTarget.setPointerCapture(event.pointerId); return;
    }
    if (tool === "rect" || tool === "ellipse") {
      const shape: CanvasShape = { id: crypto.randomUUID(), kind: tool, x: point.x, y: point.y, width: 1, height: 1, color: tool === "rect" ? "#dbe4ff" : "#e4f7f1" };
      setDraftShape(shape); event.currentTarget.setPointerCapture(event.pointerId); return;
    }
    if (tool === "text") {
      const text = window.prompt("Nội dung ghi chú", "Ghi chú mới");
      if (text?.trim()) commit({ texts: [...board.texts, { id: crypto.randomUUID(), text: text.trim(), x: point.x, y: point.y, width: 220 }] });
      return;
    }
    if (tool === "select") {
      setPan({ start: { x: event.clientX, y: event.clientY }, origin: board.viewport });
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handleSurfaceMove = (event: React.PointerEvent) => {
    const point = localPoint(event);
    if (draftPath) setDraftPath({ ...draftPath, points: [...draftPath.points, point] });
    if (draftShape) setDraftShape({ ...draftShape, width: point.x - draftShape.x, height: point.y - draftShape.y });
    if (pan) commit({ viewport: { ...pan.origin, x: pan.origin.x + event.clientX - pan.start.x, y: pan.origin.y + event.clientY - pan.start.y } });
    if (drag) {
      commit({ nodes: board.nodes.map((node) => node.id === drag.id ? { ...node, x: point.x - drag.offset.x, y: point.y - drag.offset.y } : node) });
    }
  };

  const finishPointer = () => {
    if (draftPath) commit({ drawings: [...board.drawings, draftPath] });
    if (draftShape) commit({ shapes: [...board.shapes, { ...draftShape, width: Math.abs(draftShape.width), height: Math.abs(draftShape.height), x: draftShape.width < 0 ? draftShape.x + draftShape.width : draftShape.x, y: draftShape.height < 0 ? draftShape.y + draftShape.height : draftShape.y }] });
    setDraftPath(null); setDraftShape(null); setDrag(null); setPan(null);
  };

  const onNodeDown = (event: React.PointerEvent, node: MindMapNode) => {
    event.stopPropagation();
    if (tool === "connector" && selectedNodeId && selectedNodeId !== node.id && !board.edges.some((edge) => edge.source === selectedNodeId && edge.target === node.id)) {
      commit({ edges: [...board.edges, { id: crypto.randomUUID(), source: selectedNodeId, target: node.id }] });
    }
    setSelectedNodeId(node.id);
    if (tool !== "select") return;
    const point = localPoint(event); setDrag({ id: node.id, offset: { x: point.x - node.x, y: point.y - node.y } });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const addNode = () => {
    const parent = board.nodes.find((node) => node.id === selectedNodeId) ?? board.nodes[0];
    const node: MindMapNode = { id: crypto.randomUUID(), label: "Ý mới", x: parent.x + parent.width + 100, y: parent.y + 20, width: 145, height: 54, color: "#eef2ff" };
    commit({ nodes: [...board.nodes, node], edges: [...board.edges, { id: crypto.randomUUID(), source: parent.id, target: node.id }] }); setSelectedNodeId(node.id);
  };

  const editNode = (node: MindMapNode) => {
    const label = window.prompt("Chỉnh sửa node", node.label);
    if (label?.trim()) commit({ nodes: board.nodes.map((item) => item.id === node.id ? { ...item, label: label.trim() } : item) });
  };

  useEffect(() => { if (!selectedNodeId && board.nodes[0]) setSelectedNodeId(board.nodes[0].id); }, [board.nodes, selectedNodeId]);

  return (
    <div className="canvas-shell">
      <div className="canvas-hint"><span className="hint-dot" /> Kéo để di chuyển canvas · Double-click node để sửa · Phím <kbd>+</kbd>/<kbd>−</kbd> để zoom</div>
      <svg ref={svgRef} className="canvas-svg" onPointerDown={handleSurfaceDown} onPointerMove={handleSurfaceMove} onPointerUp={finishPointer} onPointerCancel={finishPointer} onDoubleClick={() => undefined}>
        <g transform={`translate(${board.viewport.x} ${board.viewport.y}) scale(${board.viewport.scale})`}>
          {board.drawings.map((path) => <path key={path.id} d={path.points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ")} fill="none" stroke={path.color} strokeWidth={path.width} strokeOpacity={path.opacity} strokeLinecap="round" strokeLinejoin="round" />)}
          {draftPath && <path d={draftPath.points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ")} fill="none" stroke={draftPath.color} strokeWidth={draftPath.width} strokeOpacity={draftPath.opacity} strokeLinecap="round" />}
          {board.shapes.map((shape) => shape.kind === "rect" ? <rect key={shape.id} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="12" fill={shape.color} stroke="#b9c7ef" strokeWidth="2" /> : <ellipse key={shape.id} cx={shape.x + shape.width / 2} cy={shape.y + shape.height / 2} rx={Math.abs(shape.width / 2)} ry={Math.abs(shape.height / 2)} fill={shape.color} stroke="#a6d5c8" strokeWidth="2" />)}
          {draftShape && <rect x={draftShape.x} y={draftShape.y} width={draftShape.width} height={draftShape.height} fill="none" stroke={colors.cobalt} strokeDasharray="6 5" strokeWidth="2" />}
          {board.texts.map((text) => <text key={text.id} x={text.x} y={text.y} className="canvas-text">{text.text}</text>)}
          <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#99a3bf" /></marker></defs>
          {board.edges.map((edge) => {
            const source = board.nodes.find((node) => node.id === edge.source); const target = board.nodes.find((node) => node.id === edge.target); if (!source || !target) return null;
            const x1 = source.x + source.width; const y1 = source.y + source.height / 2; const x2 = target.x; const y2 = target.y + target.height / 2; const curve = Math.max(42, Math.abs(x2 - x1) * 0.4);
            return <path key={edge.id} d={`M${x1},${y1} C${x1 + curve},${y1} ${x2 - curve},${y2} ${x2},${y2}`} fill="none" stroke="#aab4ca" strokeWidth="2.5" markerEnd="url(#arrow)" />;
          })}
          {board.nodes.map((node) => <g key={node.id} className={`mind-node ${selectedNodeId === node.id ? "selected" : ""}`} onPointerDown={(event) => onNodeDown(event, node)} onDoubleClick={(event) => { event.stopPropagation(); editNode(node); }}>
            <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="14" fill={node.color ?? "#ffffff"} />
            <text x={node.x + 16} y={node.y + 24} className="node-label">{node.label}</text>
            {node.sourcePage && <text x={node.x + 16} y={node.y + 43} className="node-source">Nguồn · trang {node.sourcePage}</text>}
          </g>)}
        </g>
      </svg>
      <button className="add-node" onClick={addNode} aria-label="Thêm node mind map">+ <span>Thêm ý</span></button>
      <div className="zoom-control"><button onClick={() => commit({ viewport: { ...board.viewport, scale: Math.min(2.2, board.viewport.scale + 0.1) } })}>+</button><span>{Math.round(board.viewport.scale * 100)}%</span><button onClick={() => commit({ viewport: { ...board.viewport, scale: Math.max(0.45, board.viewport.scale - 0.1) } })}>−</button></div>
    </div>
  );
}
