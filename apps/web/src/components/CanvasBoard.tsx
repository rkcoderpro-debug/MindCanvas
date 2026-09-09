import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Circle, Copy, Hand, Highlighter, MousePointer2, PenLine, Plus, Square, Trash2, Type, ArrowUpRight } from "lucide-react";
import type { BoardState, ToolMode, Vec2 } from "@mindcanvas/shared";
import { clamp, connect, duplicateElement, elementBounds, hiddenNodes, moveElement, pathData, removeElement, resizeElement, type Selection } from "../lib/board";
import { useLanguage, type MessageKey } from "../lib/i18n";

type Props = { board: BoardState; onChange: (next: BoardState) => void; onUndo: () => void; onRedo: () => void; onSave: () => void };
type Gesture = { mode: "move" | "resize" | "pan" | "draw" | "shape"; start: Vec2; screen: Vec2; base: BoardState; selection?: Selection; pointer: number; next: BoardState };
type Editing = { selection: Selection; value: string; fresh?: BoardState };
const tools: { id: ToolMode; icon: typeof Hand; key: string }[] = [
  { id: "select", icon: MousePointer2, key: "V" }, { id: "hand", icon: Hand, key: "H" },
  { id: "text", icon: Type, key: "T" }, { id: "pen", icon: PenLine, key: "P" },
  { id: "highlighter", icon: Highlighter, key: "B" }, { id: "rect", icon: Square, key: "R" },
  { id: "ellipse", icon: Circle, key: "O" }, { id: "connector", icon: ArrowUpRight, key: "C" },
];
export default function CanvasBoard({ board, onChange, onUndo, onRedo, onSave }: Props) {
  const { t } = useLanguage();
  const svg = useRef<SVGSVGElement>(null), gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<BoardState | null>(null), [selected, setSelected] = useState<Selection | null>(null);
  const [tool, setTool] = useState<ToolMode>("select"), [editing, setEditing] = useState<Editing | null>(null);
  const editRef = useRef<Editing | null>(null), [space, setSpace] = useState(false);
  const [ink, setInk] = useState("#4562df"), [strokeWidth, setStrokeWidth] = useState(3);
  const b = preview ?? editing?.fresh ?? board;
  const bounds = selected ? elementBounds(b, selected) : null;
  const selectedEl = selected ? b[selected.kind].find(el => el.id === selected.id) : null;
  const hidden = hiddenNodes(b);
  const interactive = tool === "select" || tool === "connector";
  const point = (clientX: number, clientY: number, base = board): Vec2 => {
    const rect = svg.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - base.viewport.x) / base.viewport.scale, y: (clientY - rect.top - base.viewport.y) / base.viewport.scale };
  };
  const edit = (s: Selection, fresh?: BoardState) => {
    if (s.kind !== "texts" && s.kind !== "nodes") return;
    const el = (fresh ?? board)[s.kind].find(n => n.id === s.id);
    if (!el) return;
    const value = "text" in el ? el.text : el.label;
    const next = { selection: s, value, fresh }; editRef.current = next; setEditing(next); setSelected(s);
  };
  const finishEdit = (cancel = false) => {
    const e = editRef.current; if (!e) return;
    editRef.current = null; setEditing(null);
    if (!cancel) {
      const base = e.fresh ?? board, kind = e.selection.kind;
      onChange({ ...base, [kind]: base[kind].map(el => el.id === e.selection.id ? { ...el, [kind === "texts" ? "text" : "label"]: e.value } : el) });
    }
  };
  const selectElement = (e: ReactPointerEvent, s: Selection) => {
    if (gesture.current || (e.button !== 0 && e.button !== 1)) return;
    if (!interactive || space || e.button === 1) return;
    e.stopPropagation(); e.preventDefault(); setSelected(s);
    if (tool === "connector") {
      if (s.kind !== "nodes" && s.kind !== "shapes") return;
      if (selected && ["nodes", "shapes"].includes(selected.kind)) onChange(connect(board, selected.id, s.id));
      return;
    }
    if (s.kind === "edges") return;
    svg.current?.focus(); svg.current?.setPointerCapture(e.pointerId);
    const p = point(e.clientX, e.clientY);
    gesture.current = { mode: "move", start: p, screen: { x: e.clientX, y: e.clientY }, base: board, selection: s, pointer: e.pointerId, next: board };
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (gesture.current) return;
    if (e.button !== 0 && e.button !== 1) return;
    if (editRef.current) { finishEdit(); return; }
    e.preventDefault(); svg.current?.focus(); window.getSelection()?.removeAllRanges();
    const p = point(e.clientX, e.clientY);
    const base = board;
    if (space || tool === "hand" || e.button === 1 || tool === "select") {
      setSelected(null); gesture.current = { mode: "pan", start: p, screen: { x: e.clientX, y: e.clientY }, base, pointer: e.pointerId, next: base };
    } else if (tool === "text") {
      const id = crypto.randomUUID();
      edit({ kind: "texts", id }, { ...base, texts: [...base.texts, { id, x: p.x, y: p.y + 16, text: "", width: 260, height: 42, fontSize: 16, color: "#18213b" }] });
      setTool("select"); return;
    } else if (tool === "pen" || tool === "highlighter") {
      const id = crypto.randomUUID(), next = { ...base, drawings: [...base.drawings, { id, points: [p], color: tool === "highlighter" ? "#f5c542" : ink, width: tool === "highlighter" ? 20 : strokeWidth, opacity: tool === "highlighter" ? .3 : 1 }] };
      setSelected(null); setPreview(next); gesture.current = { mode: "draw", start: p, screen: p, base, pointer: e.pointerId, next };
    } else if (tool === "rect" || tool === "ellipse") {
      const id = crypto.randomUUID(), next = { ...base, shapes: [...base.shapes, { id, kind: tool, x: p.x, y: p.y, width: 1, height: 1, color: "#e1e7ff" }] };
      setSelected({ kind: "shapes", id }); setPreview(next); gesture.current = { mode: "shape", start: p, screen: p, base, pointer: e.pointerId, next };
    }
    svg.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current; if (!g || e.pointerId !== g.pointer) return;
    e.preventDefault(); const p = point(e.clientX, e.clientY, g.base), dx = p.x - g.start.x, dy = p.y - g.start.y;
    let next = g.next;
    if (g.mode === "move") next = moveElement(g.base, g.selection!, dx, dy);
    if (g.mode === "resize") { const r = elementBounds(g.base, g.selection!)!; next = resizeElement(g.base, g.selection!, r.width + dx, r.height + dy); }
    if (g.mode === "pan") next = { ...g.base, viewport: { ...g.base.viewport, x: g.base.viewport.x + e.clientX - g.screen.x, y: g.base.viewport.y + e.clientY - g.screen.y } };
    if (g.mode === "draw") {
      const path = g.next.drawings.at(-1)!;
      if (path.points.length >= 20000) return;
      next = { ...g.next, drawings: [...g.base.drawings, { ...path, points: [...path.points, p] }] };
    }
    if (g.mode === "shape") next = { ...g.next, shapes: [...g.base.shapes, { ...g.next.shapes.at(-1)!, x: Math.min(p.x, g.start.x), y: Math.min(p.y, g.start.y), width: Math.max(1, Math.abs(dx)), height: Math.max(1, Math.abs(dy)) }] };
    g.next = next; setPreview(next);
  };
  const finish = (cancel = false) => {
    const g = gesture.current; if (!g) return;
    gesture.current = null; setPreview(null);
    if (!cancel && JSON.stringify(g.base) !== JSON.stringify(g.next)) onChange(g.next);
    if (svg.current?.hasPointerCapture(g.pointer)) svg.current.releasePointerCapture(g.pointer);
  };
  const duplicate = () => { if (!selected) return; const next = duplicateElement(board, selected); setSelected(next.selection); onChange(next.board); };
  const remove = () => { if (!selected) return; onChange(removeElement(board, selected)); setSelected(null); };
  const patch = (value: Record<string, unknown>) => { if (selected) onChange({ ...board, [selected.kind]: board[selected.kind].map(el => el.id === selected.id ? { ...el, ...value } : el) }); };
  const zoom = (factor: number) => onChange({ ...board, viewport: { ...board.viewport, scale: clamp(board.viewport.scale * factor, .2, 4) } });
  const addNode = () => {
    const parent = selected?.kind === "nodes" ? board.nodes.find(n => n.id === selected.id) : undefined;
    const id = crypto.randomUUID(), p = parent ? { x: parent.x + parent.width + 90, y: parent.y + 20 } : point((svg.current?.getBoundingClientRect().left ?? 0) + 250, (svg.current?.getBoundingClientRect().top ?? 0) + 180);
    const next = { ...board, nodes: [...board.nodes, { id, label: parent ? t("newNode") : t("rootNode"), ...p, width: 190, height: 76, color: "#e1e7ff" }] };
    onChange(parent ? connect(next, parent.id, id) : next); setTool("select"); setSelected({ kind: "nodes", id });
  };

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable=true], dialog")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === "Space") { e.preventDefault(); setSpace(true); }
      if (e.key === "Escape") { finish(true); setSelected(null); }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); onSave(); return; }
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? onRedo() : onUndo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); onRedo(); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
      if (e.key === "Enter" && selected) { e.preventDefault(); edit(selected); }
      if (selected && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault(); const n = e.shiftKey ? 10 : 1;
        onChange(moveElement(board, selected, e.key === "ArrowRight" ? n : e.key === "ArrowLeft" ? -n : 0, e.key === "ArrowDown" ? n : e.key === "ArrowUp" ? -n : 0));
      }
      if (!mod && (e.key === "+" || e.key === "=")) { e.preventDefault(); zoom(1.1); }
      if (!mod && e.key === "-") { e.preventDefault(); zoom(1 / 1.1); }
      if (!mod) { const item = tools.find(i => i.key.toLowerCase() === e.key.toLowerCase()); if (item) setTool(item.id); }
    };
    const keyup = (e: KeyboardEvent) => { if (e.code === "Space") setSpace(false); };
    const blur = () => { setSpace(false); finish(true); };
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", blur); };
  });
  useEffect(() => {
    const el = svg.current; if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (editRef.current || gesture.current) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const p = point(e.clientX, e.clientY), r = el.getBoundingClientRect();
        const scale = clamp(board.viewport.scale * Math.exp(-e.deltaY * .003), .2, 4);
        onChange({ ...board, viewport: { scale, x: e.clientX - r.left - p.x * scale, y: e.clientY - r.top - p.y * scale } });
      } else onChange({ ...board, viewport: { ...board.viewport, x: board.viewport.x - e.deltaX, y: board.viewport.y - e.deltaY } });
    };
    el.addEventListener("wheel", wheel, { passive: false }); return () => el.removeEventListener("wheel", wheel);
  }, [board, onChange]);

  const editBounds = editing ? elementBounds(b, editing.selection) : null;
  const labelKey: Record<Selection["kind"], MessageKey> = { nodes: "node", shapes: "rect", drawings: "pen", texts: "text", edges: "connector" };
  const selectedColor = selectedEl && "color" in selectedEl ? selectedEl.color ?? "#e1e7ff" : "#4562df";
  return <div className="editor-layout">
    <div className="editor-frame">
      <div className="drawing-toolbar" role="toolbar" aria-label={t("properties")}>{tools.map(({ id, icon: Icon, key }) =>
        <button key={id} className={tool === id ? "selected" : ""} aria-pressed={tool === id} aria-label={t(id)} title={t(id) + " (" + key + ")"} onClick={() => { finishEdit(); setTool(id); setSelected(null); }}><Icon size={19}/></button>)}
        <span className="toolbar-divider"/><button aria-label={t("node")} title={t("node")} onClick={addNode}><Plus size={20}/></button></div>
      <svg ref={svg} tabIndex={0} aria-label="Canvas" className={`canvas-svg tool-${space ? "hand" : tool}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={e => { if (gesture.current?.pointer === e.pointerId) finish(); }} onPointerCancel={e => { if (gesture.current?.pointer === e.pointerId) finish(true); }}>
        <defs><marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10z" fill="#8a99b5"/></marker></defs>
        <g transform={`translate(${b.viewport.x} ${b.viewport.y}) scale(${b.viewport.scale})`}>
          <g style={{ pointerEvents: interactive && !space ? "auto" : "none" }}>
          {b.shapes.map(s => <g key={s.id} data-element={s.id} onPointerDown={e => selectElement(e, { kind: "shapes", id: s.id })}>
            {s.kind === "rect" ? <rect x={s.x} y={s.y} width={s.width} height={s.height} rx="6" fill={s.color} stroke="#a6b5db"/> : <ellipse cx={s.x + s.width / 2} cy={s.y + s.height / 2} rx={s.width / 2} ry={s.height / 2} fill={s.color} stroke="#a6b5db"/>}</g>)}
          {b.drawings.map(p => <g key={p.id} data-element={p.id} onPointerDown={e => selectElement(e, { kind: "drawings", id: p.id })}>
            <path d={pathData(p.points)} fill="none" stroke={p.color} strokeWidth={p.width} opacity={p.opacity} strokeLinecap="round" strokeLinejoin="round"/>
            <path d={pathData(p.points)} fill="none" stroke="transparent" strokeWidth={Math.max(12 / b.viewport.scale, p.width)} pointerEvents={interactive && !space ? "stroke" : "none"}/></g>)}
          {b.edges.map(e => {
            if (hidden.has(e.source) || hidden.has(e.target)) return null;
            const s = [...b.nodes, ...b.shapes].find(n => n.id === e.source), d = [...b.nodes, ...b.shapes].find(n => n.id === e.target); if (!s || !d) return null;
            const x1 = s.x + s.width, y1 = s.y + s.height / 2, x2 = d.x, y2 = d.y + d.height / 2, c = Math.max(40, Math.abs(x2 - x1) * .45);
            const path = `M${x1},${y1} C${x1+c},${y1} ${x2-c},${y2} ${x2},${y2}`;
            return <g key={e.id} data-element={e.id} onPointerDown={ev => selectElement(ev, { kind: "edges", id: e.id })}><path d={path} fill="none" stroke={selected?.id === e.id ? "#4562df" : "#8a99b5"} strokeWidth="2" markerEnd="url(#canvas-arrow)"/><path d={path} fill="none" stroke="transparent" strokeWidth="14" pointerEvents={interactive && !space ? "stroke" : "none"}/></g>;
          })}
          {b.texts.map(text => { const r = elementBounds(b, { kind: "texts", id: text.id })!; return <g key={text.id} data-element={text.id} onPointerDown={e => selectElement(e, { kind: "texts", id: text.id })}
            onDoubleClick={e => { if (tool !== "select") return; e.stopPropagation(); edit({ kind: "texts", id: text.id }); }}>
            <foreignObject x={r.x} y={r.y} width={r.width} height={r.height}><div className="canvas-copy" style={{ fontSize: text.fontSize ?? 16, color: text.color ?? "#18213b" }}>{editing?.selection.id === text.id ? "" : text.text}</div></foreignObject>
          </g>; })}
          {b.nodes.filter(n => !hidden.has(n.id)).map(n => <g key={n.id} data-element={n.id} className="mind-node" onPointerDown={e => selectElement(e, { kind: "nodes", id: n.id })}
            onDoubleClick={e => { if (tool !== "select") return; e.stopPropagation(); edit({ kind: "nodes", id: n.id }); }}>
            <rect x={n.x} y={n.y} width={n.width} height={n.height} rx="12" fill={n.color ?? "#ffffff"} stroke="#bcc8e4"/>
            <foreignObject x={n.x + 12} y={n.y + 10} width={Math.max(12, n.width - 24)} height={Math.max(12, n.height - 20)}><div className="node-copy">{editing?.selection.id === n.id ? "" : n.label}{n.sourcePage && <small>{t("page")} {n.sourcePage}</small>}{n.collapsed && <small>…</small>}</div></foreignObject>
          </g>)}
          </g>
          {bounds && selected && !editing && tool === "select" && <g className="selection-box">
            <rect x={bounds.x - 3} y={bounds.y - 3} width={bounds.width + 6} height={bounds.height + 6} fill="none" stroke="#4562df" strokeWidth={1.5 / b.viewport.scale} pointerEvents="none"/>
            <rect className="resize-handle" x={bounds.x + bounds.width - 4 / b.viewport.scale} y={bounds.y + bounds.height - 4 / b.viewport.scale} width={8 / b.viewport.scale} height={8 / b.viewport.scale} fill="white" stroke="#4562df" strokeWidth={1 / b.viewport.scale}
              onPointerDown={e => { e.preventDefault(); e.stopPropagation(); svg.current?.setPointerCapture(e.pointerId); gesture.current = { mode: "resize", start: point(e.clientX, e.clientY), screen: { x: e.clientX, y: e.clientY }, base: board, selection: selected, pointer: e.pointerId, next: board }; }}/></g>}
          {editing && editBounds && <foreignObject x={editBounds.x} y={editBounds.y} width={Math.max(editBounds.width, 120)} height={Math.max(editBounds.height, 100)}>
            <textarea className="inline-editor" autoFocus aria-label={t("editText")} placeholder={t("newText")} maxLength={10000}
              style={{ fontSize: selectedEl && "fontSize" in selectedEl ? selectedEl.fontSize ?? 16 : 16 }}
              value={editing.value} onChange={e => { const next = { ...editing, value: e.target.value }; editRef.current = next; setEditing(next); }}
              onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onBlur={() => finishEdit()}
              onKeyDown={e => { e.stopPropagation(); if (e.nativeEvent.isComposing) return; if (e.key === "Escape") { e.preventDefault(); finishEdit(true); } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); finishEdit(); } }}/></foreignObject>}
        </g>
      </svg>
      <div className="canvas-hint">{t(tool === "connector" ? "connectorHint" : tool === "text" ? "textHint" : tool === "pen" || tool === "highlighter" ? "drawHint" : "canvasHint")}</div>
      <div className="zoom-control"><button aria-label={t("zoomOut")} onClick={() => zoom(1/1.1)}>−</button><button className="zoom-value" aria-label={t("resetZoom")} onClick={() => onChange({ ...board, viewport: { x: 0, y: 0, scale: 1 } })}>{Math.round(b.viewport.scale * 100)}%</button><button aria-label={t("zoomIn")} onClick={() => zoom(1.1)}>+</button></div>
    </div>
    <aside className="inspector"><h3>{t("properties")}</h3>
      {!selectedEl ? <><p>{t("selectHint")}</p><label>{t("color")}<input type="color" value={ink} onChange={e => setInk(e.target.value)}/></label><label>{t("stroke")}<input type="range" min="1" max="20" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))}/></label></> : <>
        <div className="property-caption">{t(labelKey[selected!.kind])}</div>
        {bounds && <div className="property-grid">{(["x", "y", "width", "height"] as const).map(k => <label key={k}>{k === "width" ? t("width") : k === "height" ? t("height") : k.toUpperCase()}<input type="number" step="1" aria-label={k} value={Math.round(bounds[k])} onChange={e => {
          if (e.target.value === "" || !Number.isFinite(e.target.valueAsNumber)) return;
          const v = clamp(e.target.valueAsNumber, -100000, 100000);
          onChange(k === "x" || k === "y" ? moveElement(board, selected!, k === "x" ? v - bounds.x : 0, k === "y" ? v - bounds.y : 0) : resizeElement(board, selected!, k === "width" ? v : bounds.width, k === "height" ? v : bounds.height));
        }}/></label>)}</div>}
        {selected?.kind !== "edges" && <label>{t("color")}<input type="color" value={selectedColor} onChange={e => patch({ color: e.target.value })}/></label>}
        {selected?.kind === "texts" && <label>{t("fontSize")}<input type="number" min="8" max="200" value={"fontSize" in selectedEl ? selectedEl.fontSize ?? 16 : 16} onChange={e => { if(e.target.value) patch({ fontSize: clamp(Number(e.target.value), 8, 200) }); }}/></label>}
        {selected?.kind === "drawings" && <><label>{t("stroke")}<input type="range" min="1" max="40" value={"width" in selectedEl ? selectedEl.width : 3} onChange={e => patch({ width: Number(e.target.value) })}/></label><label>{t("opacity")}<input type="range" min=".05" max="1" step=".05" value={"opacity" in selectedEl ? selectedEl.opacity : 1} onChange={e => patch({ opacity: Number(e.target.value) })}/></label></>}
        {(selected?.kind === "texts" || selected?.kind === "nodes") && <button className="secondary-button" onClick={() => edit(selected!)}>{t("editText")}</button>}
        {selected?.kind === "nodes" && <button className="secondary-button" onClick={() => patch({ collapsed: !("collapsed" in selectedEl && selectedEl.collapsed) })}>{t("collapsed" in selectedEl && selectedEl.collapsed ? "expand" : "collapse")}</button>}
        <div className="actions">{selected?.kind !== "edges" && <button className="icon-button" aria-label={t("duplicate")} title={t("duplicate")} onClick={duplicate}><Copy size={18}/></button>}<button className="icon-button danger" aria-label={t("delete")} title={t("delete")} onClick={remove}><Trash2 size={18}/></button></div>
      </>}
      <h3>{t("layers")}</h3><div className="layer-list">{(["nodes", "texts", "shapes", "drawings", "edges"] as const).flatMap(kind => b[kind].map(el =>
        <button key={el.id} className={selected?.id === el.id ? "active" : ""} onClick={() => { setTool("select"); setSelected({ kind, id: el.id }); }}>{("label" in el ? el.label : "text" in el ? el.text : "") || t(labelKey[kind])}</button>))}</div>
    </aside>
  </div>;
}
