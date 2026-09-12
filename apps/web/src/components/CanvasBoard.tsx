import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignLeft, AlignRight, AlignStartHorizontal, AlignStartVertical, Bold, Circle, Copy, FileText, Hand, Highlighter, Italic, List, ListChecks, Magnet, MousePointer2, PaintBucket, PenLine, Plus, SlidersHorizontal, Sparkles, Square, Trash2, Type, Underline, ArrowUpRight, Network, X } from "lucide-react";
import type { BoardState, CanvasBackground as CanvasBackgroundType, ToolMode, Vec2 } from "@mindcanvas/shared";
import { applySelectionAi, arrangeMindMap, clamp, connect, elementBounds, hiddenNodes, moveElement, pathData, resizeElement, selectionToStudyText, type Selection } from "../lib/board";
import { useLanguage, useTheme, type MessageKey } from "../lib/i18n";
import { canvasTextColor, readableTextColor } from "../lib/color";
import { THEME_CANVAS_PALETTES } from "../lib/theme";
import { addRelativeNode, alignSelection, distributeSelection, duplicateSelection, expandGroups, groupSelection, moveLayer, moveSelection, orderedElements, pasteSelection, removeSelection, reparentNode, reorderSelection, resizeSelection, rotateSelection, selectionBounds, setElementFlags, smartSnapMoveSelection, ungroupSelection, type SnapGuide } from "../lib/editorCommands";
import LayerStack from "./LayerStack";
import ElementsPanel from "./ElementsPanel";
import CanvasNavigator from "./CanvasNavigator";
import { nodeHeight } from "../lib/mindMapLayout";
import CanvasBackground, { BACKGROUND_OPTIONS } from "./CanvasBackground";
import AiSelectionPanel from "./AiSelectionPanel";
import SourceDocumentPanel, { type SourceDocumentView } from "./SourceDocumentPanel";
import { copyCanvasSelection, hasCanvasClipboard, readCanvasSelection } from "../lib/canvasClipboard";
import { getDocumentSource } from "../lib/supabase";
import type { SelectionAiResult } from "../lib/api";

type Props = { board: BoardState; onChange: (next: BoardState) => void; onUndo: () => void; onRedo: () => void; onSave: () => void; canUseAi?: boolean };
type Gesture = { mode: "move" | "resize" | "rotate" | "pan" | "draw" | "shape" | "marquee"; start: Vec2; screen: Vec2; base: BoardState; selection?: Selection; selections?: Selection[]; pointer: number; next: BoardState; reparent?: boolean; target?: string; center?: Vec2; startAngle?: number };
type PinchGesture = { pointerIds: [number, number]; base: BoardState; startDistance: number; worldCenter: Vec2; next: BoardState };
type Editing = { selection: Selection; value: string; fresh?: BoardState };
const tools: { id: ToolMode; icon: typeof Hand; key: string }[] = [
  { id: "select", icon: MousePointer2, key: "V" }, { id: "hand", icon: Hand, key: "H" },
  { id: "text", icon: Type, key: "T" }, { id: "pen", icon: PenLine, key: "P" },
  { id: "highlighter", icon: Highlighter, key: "B" }, { id: "rect", icon: Square, key: "R" },
  { id: "ellipse", icon: Circle, key: "O" }, { id: "connector", icon: ArrowUpRight, key: "C" },
];
export default function CanvasBoard({ board, onChange, onUndo, onRedo, onSave, canUseAi = false }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme(), palette = THEME_CANVAS_PALETTES[theme];
  const svg = useRef<SVGSVGElement>(null), gesture = useRef<Gesture | null>(null), pinch = useRef<PinchGesture | null>(null);
  const touchPoints = useRef(new Map<number, Vec2>());
  const [preview, setPreview] = useState<BoardState | null>(null), [selections, setSelections] = useState<Selection[]>([]);
  const selected = selections.at(-1) ?? null;
  const setSelected = (s: Selection | null) => setSelections(s ? [s] : []);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [hasCopy, setHasCopy] = useState(hasCanvasClipboard);
  const [tool, setTool] = useState<ToolMode>("select"), [editing, setEditing] = useState<Editing | null>(null), [snap, setSnap] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false), [sourceView, setSourceView] = useState<SourceDocumentView | null>(null), [sourceError, setSourceError] = useState("");
  const editRef = useRef<Editing | null>(null), [space, setSpace] = useState(false);
  const previousThemeInk = useRef(palette.ink);
  const [ink, setInk] = useState(palette.ink), [strokeWidth, setStrokeWidth] = useState(3);
  const b = preview ?? editing?.fresh ?? board;
  const bounds = selectionBounds(b, selections);
  const selectedEl = selected && selections.length === 1 ? b[selected.kind].find(el => el.id === selected.id) : null;
  const selectedStudyText = selectionToStudyText(b, selections);
  const hidden = hiddenNodes(b);
  const hiddenElements = new Set([...b.nodes.filter(e => e.hidden).map(e => e.id), ...b.texts.filter(e => e.hidden).map(e => e.id), ...b.shapes.filter(e => e.hidden).map(e => e.id), ...b.drawings.filter(e => e.hidden).map(e => e.id), ...b.edges.filter(e => e.hidden).map(e => e.id), ...hidden]);
  const isLocked = (s: Selection) => s.kind !== "edges" && !!b[s.kind].find(e => e.id === s.id && "locked" in e && e.locked);
  useEffect(() => { setInk(current => current === previousThemeInk.current ? palette.ink : current); previousThemeInk.current = palette.ink; }, [palette.ink]);
  useEffect(() => { const ids = new Set(orderedElements(board).map(s => s.id)); if (!editing && selections.some(s => !ids.has(s.id))) setSelections(selections.filter(s => ids.has(s.id))); }, [board, editing, selections]);
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
      onChange({ ...base, [kind]: base[kind].map(el => el.id === e.selection.id ? { ...el, [kind === "texts" ? "text" : "label"]: e.value,
        ...(kind === "nodes" && "width" in el ? { height: Math.max("height" in el ? el.height ?? 76 : 76, nodeHeight(e.value, el.width, "sourcePage" in el ? el.sourcePage : undefined)) } : {}) } : el) });
    }
  };
  const selectElement = (e: ReactPointerEvent, s: Selection) => {
    if (gesture.current || (e.button !== 0 && e.button !== 1)) return;
    if (!interactive || space || e.button === 1) return;
    e.stopPropagation(); e.preventDefault();
    svg.current?.focus();
    if (tool === "connector") {
      if (s.kind !== "nodes" && s.kind !== "shapes") return;
      if (selected && ["nodes", "shapes"].includes(selected.kind)) onChange(connect(board, selected.id, s.id));
      setSelected(s);
      return;
    }
    const expanded = expandGroups(board, [s]);
    if (e.shiftKey) {
      const ids = new Set(expanded.map(s => s.id));
      setSelections(selections.some(item => item.id === s.id) ? selections.filter(item => !ids.has(item.id)) : [...selections, ...expanded.filter(item => !selections.some(s => s.id === item.id))]);
      return;
    }
    const targets = selections.some(item => item.id === s.id) ? selections : expanded;
    setSelections(targets);
    if (isLocked(s)) return;
    if (s.kind === "edges") return;
    svg.current?.focus(); svg.current?.setPointerCapture(e.pointerId);
    const p = point(e.clientX, e.clientY);
    gesture.current = { mode: "move", start: p, screen: { x: e.clientX, y: e.clientY }, base: board, selection: s, selections: targets, reparent: e.altKey && targets.length === 1 && s.kind === "nodes", pointer: e.pointerId, next: board };
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (gesture.current) return;
    if (e.button !== 0 && e.button !== 1) return;
    if (editRef.current) { finishEdit(); return; }
    e.preventDefault(); svg.current?.focus(); window.getSelection()?.removeAllRanges();
    const p = point(e.clientX, e.clientY);
    const base = board;
    if (space || tool === "hand" || e.button === 1 || (e.pointerType === "touch" && tool === "select")) {
      setSelected(null); gesture.current = { mode: "pan", start: p, screen: { x: e.clientX, y: e.clientY }, base, pointer: e.pointerId, next: base };
    } else if (tool === "select") {
      const initial = e.shiftKey ? selections : [];
      setSelections(initial); setMarquee({ ...p, width: 0, height: 0 });
      gesture.current = { mode: "marquee", start: p, screen: p, base, selections: initial, pointer: e.pointerId, next: base };
    } else if (tool === "text") {
      const id = crypto.randomUUID();
      edit({ kind: "texts", id }, { ...base, texts: [...base.texts, { id, x: p.x, y: p.y + 16, text: "", width: 260, height: 42, fontSize: 16, color: "#18213b" }] });
      setTool("select"); return;
    } else if (tool === "pen" || tool === "highlighter") {
      const id = crypto.randomUUID(), next = { ...base, drawings: [...base.drawings, { id, points: [p], color: tool === "highlighter" ? palette.highlighter : ink, width: tool === "highlighter" ? 20 : strokeWidth, opacity: tool === "highlighter" ? .3 : 1 }] };
      setSelected(null); setPreview(next); gesture.current = { mode: "draw", start: p, screen: p, base, pointer: e.pointerId, next };
    } else if (tool === "rect" || tool === "ellipse") {
      const id = crypto.randomUUID(), next = { ...base, shapes: [...base.shapes, { id, kind: tool, x: p.x, y: p.y, width: 1, height: 1, color: palette.fill }] };
      setSelected({ kind: "shapes", id }); setPreview(next); gesture.current = { mode: "shape", start: p, screen: p, base, pointer: e.pointerId, next };
    }
    svg.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current; if (!g || e.pointerId !== g.pointer) return;
    e.preventDefault(); const p = point(e.clientX, e.clientY, g.base), dx = p.x - g.start.x, dy = p.y - g.start.y;
    let next = g.next;
    if (g.mode === "move") {
      if (snap) {
        const result = smartSnapMoveSelection(g.base, g.selections ?? [g.selection!], dx, dy, 8, 7 / g.base.viewport.scale);
        next = result.board; setGuides(result.guides);
      } else { next = moveSelection(g.base, g.selections ?? [g.selection!], dx, dy); setGuides([]); }
      if (g.reparent) {
        g.target = [...orderedElements(g.base)].reverse().filter(s => s.kind === "nodes" && s.id !== g.selection!.id && !hidden.has(s.id)).find(s => {
          const n = g.base.nodes.find(n => n.id === s.id)!;
          return p.x >= n.x && p.x <= n.x + n.width && p.y >= n.y && p.y <= n.y + n.height && reparentNode(g.base, g.selection!.id, n.id) !== g.base;
        })?.id;
        setDropTarget(g.target ?? null);
      }
    }
    if (g.mode === "marquee") {
      const rect = { x: Math.min(g.start.x, p.x), y: Math.min(g.start.y, p.y), width: Math.abs(dx), height: Math.abs(dy) }; setMarquee(rect);
      const found = orderedElements(g.base).filter(s => { if (hidden.has(s.id) || s.kind === "edges") return false; const b = elementBounds(g.base, s)!; return b.x >= rect.x && b.y >= rect.y && b.x + b.width <= rect.x + rect.width && b.y + b.height <= rect.y + rect.height; });
      setSelections(expandGroups(g.base, [...(g.selections ?? []), ...found]));
      return;
    }
    if (g.mode === "resize") { const r = selectionBounds(g.base, g.selections ?? [g.selection!])!; next = resizeSelection(g.base, g.selections ?? [g.selection!], r.width + dx, r.height + dy); }
    if (g.mode === "rotate" && g.center !== undefined && g.startAngle !== undefined) { const angle = Math.atan2(p.y - g.center.y, p.x - g.center.x) * 180 / Math.PI; next = rotateSelection(g.base, g.selections ?? [g.selection!], angle - g.startAngle); }
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
    gesture.current = null; setPreview(null); setMarquee(null); setDropTarget(null); setGuides([]);
    if (g.mode === "marquee") { if (cancel) setSelections(g.selections ?? []); }
    if (!cancel && g.reparent && g.target) g.next = reparentNode(g.next, g.selection!.id, g.target);
    if (!cancel && JSON.stringify(g.base) !== JSON.stringify(g.next)) onChange(g.next);
    if (svg.current?.hasPointerCapture(g.pointer)) svg.current.releasePointerCapture(g.pointer);
  };
  const touchDownCapture = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== "touch") return;
    touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPoints.current.size !== 2) return;
    if (gesture.current) finish(true);
    const entries = [...touchPoints.current.entries()] as [[number, Vec2], [number, Vec2]];
    const [, first] = entries[0], [, second] = entries[1], rect = svg.current!.getBoundingClientRect();
    const center = { x: (first.x + second.x) / 2 - rect.left, y: (first.y + second.y) / 2 - rect.top };
    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    pinch.current = { pointerIds: [entries[0][0], entries[1][0]], base: board, startDistance: distance,
      worldCenter: { x: (center.x - board.viewport.x) / board.viewport.scale, y: (center.y - board.viewport.y) / board.viewport.scale }, next: board };
    for (const [pointerId] of entries) if (!svg.current?.hasPointerCapture(pointerId)) svg.current?.setPointerCapture(pointerId);
    e.preventDefault(); e.stopPropagation();
  };
  const touchMoveCapture = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== "touch") return;
    touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const active = pinch.current;
    if (!active) return;
    const first = touchPoints.current.get(active.pointerIds[0]), second = touchPoints.current.get(active.pointerIds[1]);
    if (!first || !second) return;
    const rect = svg.current!.getBoundingClientRect(), distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    const scale = clamp(active.base.viewport.scale * distance / active.startDistance, .2, 4);
    const center = { x: (first.x + second.x) / 2 - rect.left, y: (first.y + second.y) / 2 - rect.top };
    active.next = { ...active.base, viewport: { scale, x: center.x - active.worldCenter.x * scale, y: center.y - active.worldCenter.y * scale } };
    setPreview(active.next); e.preventDefault(); e.stopPropagation();
  };
  const touchEndCapture = (e: ReactPointerEvent<SVGSVGElement>, cancel = false) => {
    if (e.pointerType !== "touch") return;
    touchPoints.current.delete(e.pointerId);
    const active = pinch.current;
    if (!active) return;
    pinch.current = null; setPreview(null);
    if (!cancel && JSON.stringify(active.base.viewport) !== JSON.stringify(active.next.viewport)) onChange(active.next);
    for (const pointerId of active.pointerIds) if (svg.current?.hasPointerCapture(pointerId)) svg.current.releasePointerCapture(pointerId);
    e.preventDefault(); e.stopPropagation();
  };
  const duplicate = () => { if (!selected) return; const next = duplicateSelection(board, selections); setSelections(next.selection); onChange(next.board); };
  const copy = async () => { if (!selections.length) return; await copyCanvasSelection(board, selections); setHasCopy(true); };
  const paste = async () => { const content = await readCanvasSelection(); if (!content) return; const next = pasteSelection(board, content.board, content.selection, content.offset); setSelections(next.selection); onChange(next.board); };
  const remove = () => { if (!selected) return; onChange(removeSelection(board, selections)); setSelected(null); };
  const relative = (sibling: boolean) => { if (selected?.kind !== "nodes" || selections.length !== 1) return; const next = addRelativeNode(board, selected.id, sibling, t("newNode")); if (next) { setTool("select"); edit(next.selection, next.board); } };
  const patch = (value: Record<string, unknown>) => { if (selected) onChange({ ...board, [selected.kind]: board[selected.kind].map(el => el.id === selected.id ? { ...el, ...value } : el) }); };
  const toggleTextPrefix = (prefix: "• " | "☐ ") => {
    if (selected?.kind !== "texts" || !selectedEl || !("text" in selectedEl)) return;
    const lines = selectedEl.text.split("\n"), enabled = lines.filter(Boolean).every(line => line.startsWith(prefix));
    patch({ text: lines.map(line => !line ? line : enabled ? line.slice(prefix.length) : `${prefix}${line.replace(/^(?:• |☐ )/, "")}`).join("\n") });
  };
  const applyAi = (result: SelectionAiResult) => { onChange(applySelectionAi(board, selections, result, { ink: palette.ink, fill: palette.fill })); setAiOpen(false); };
  const openSource = async (documentId: string, page: number) => {
    setSourceError("");
    try { const source = await getDocumentSource({ documentId }); setSourceView({ url: source.url, name: source.name, page }); }
    catch { setSourceError(t("sourceError")); }
  };
  const zoom = (factor: number) => onChange({ ...board, viewport: { ...board.viewport, scale: clamp(board.viewport.scale * factor, .2, 4) } });
  const addNode = () => {
    const parent = selected?.kind === "nodes" ? board.nodes.find(n => n.id === selected.id) : undefined;
    const id = crypto.randomUUID(), p = parent ? { x: parent.x + parent.width + 90, y: parent.y + 20 } : point((svg.current?.getBoundingClientRect().left ?? 0) + 250, (svg.current?.getBoundingClientRect().top ?? 0) + 180);
    const next = { ...board, nodes: [...board.nodes.map(n => n.id === parent?.id ? { ...n, collapsed: false } : n), { id, parentId: parent?.id, label: parent ? t("newNode") : t("rootNode"), ...p, width: 190, height: 76, color: palette.fill }] };
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
      if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); void copy(); return; }
      if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); void paste(); return; }
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSelections(orderedElements(board).filter(s => !hidden.has(s.id))); return; }
      if (mod && e.key.toLowerCase() === "g") { e.preventDefault(); onChange(e.shiftKey ? ungroupSelection(board, selections) : groupSelection(board, selections)); return; }
      if (mod && ["[", "]"].includes(e.key)) { e.preventDefault(); onChange(reorderSelection(board, selections, e.key === "]" ? (e.shiftKey ? "front" : "forward") : (e.shiftKey ? "back" : "backward"))); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
      if (!mod && e.key === "Tab" && selected?.kind === "nodes" && selections.length === 1 && !e.shiftKey) { e.preventDefault(); relative(false); return; }
      if (e.key === "Enter" && selected) { e.preventDefault(); selected.kind === "nodes" && !e.shiftKey ? relative(true) : edit(selected); return; }
      if (selected && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault(); const n = e.shiftKey ? 10 : 1;
        onChange(moveSelection(board, selections, e.key === "ArrowRight" ? n : e.key === "ArrowLeft" ? -n : 0, e.key === "ArrowDown" ? n : e.key === "ArrowUp" ? -n : 0));
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
  const backgroundLabel: Record<CanvasBackgroundType, MessageKey> = { dots: "backgroundDots", grid: "backgroundGrid", ruled: "backgroundRuled", graph: "backgroundGraph", isometric: "backgroundIsometric", plain: "backgroundPlain" };
  const selectedColor = selectedEl && "color" in selectedEl ? selectedEl.color ?? palette.fill : palette.ink;
  return <div className="editor-layout">
    <div className="editor-frame">
      <div className="drawing-toolbar" role="toolbar" aria-label={t("properties")}>{tools.map(({ id, icon: Icon, key }) =>
        <button key={id} className={tool === id ? "selected" : ""} aria-pressed={tool === id} aria-label={t(id)} title={t(id) + " (" + key + ")"} onClick={() => { finishEdit(); setTool(id); setSelected(null); }}><Icon size={19}/></button>)}
        <span className="toolbar-divider"/><button aria-label={t("node")} title={t("node")} onClick={addNode}><Plus size={20}/></button>
        <button className={snap ? "selected" : ""} aria-pressed={snap} aria-label={t("snap")} title={t("snap")} onClick={() => setSnap(v => !v)}><Magnet size={18}/></button>
        <button aria-label={t("arrangeMap")} title={t("arrangeMap")} disabled={!board.nodes.length || !!editing} onClick={() => { setSelected(null); onChange(arrangeMindMap(board)); }}><Network size={20}/></button>
        <span className="toolbar-divider"/><button aria-label={t("askAiSelection")} title={selectedStudyText ? t("askAiSelection") : t("selectTextForAi")} disabled={!selectedStudyText || !canUseAi} onClick={() => setAiOpen(true)}><Sparkles size={19}/></button></div>
      <svg ref={svg} tabIndex={0} aria-label="Canvas" className={`canvas-svg tool-${space ? "hand" : tool}`}
        onPointerDownCapture={touchDownCapture} onPointerMoveCapture={touchMoveCapture} onPointerUpCapture={e => touchEndCapture(e)} onPointerCancelCapture={e => touchEndCapture(e, true)}
        onPointerDown={down} onPointerMove={move} onPointerUp={e => { if (gesture.current?.pointer === e.pointerId) finish(); }} onPointerCancel={e => { if (gesture.current?.pointer === e.pointerId) finish(true); }}>
        <CanvasBackground board={b}/>
        <defs><marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10z" fill="var(--connector)"/></marker></defs>
        <g transform={`translate(${b.viewport.x} ${b.viewport.y}) scale(${b.viewport.scale})`}>
          <LayerStack board={b} interactive={interactive && !space}>
          {b.shapes.filter(s => !hiddenElements.has(s.id)).map(s => <g key={s.id} data-element={s.id} transform={`rotate(${s.rotation ?? 0} ${s.x + s.width / 2} ${s.y + s.height / 2})`} onPointerDown={e => selectElement(e, { kind: "shapes", id: s.id })}>
            {s.kind === "rect" ? <rect x={s.x} y={s.y} width={s.width} height={s.height} rx="6" fill={s.color} stroke="var(--element-stroke)"/> : <ellipse cx={s.x + s.width / 2} cy={s.y + s.height / 2} rx={s.width / 2} ry={s.height / 2} fill={s.color} stroke="var(--element-stroke)"/>}</g>)}
          {b.drawings.filter(p => !hiddenElements.has(p.id)).map(p => { const r = elementBounds(b, { kind: "drawings", id: p.id })!; return <g key={p.id} data-element={p.id} transform={`rotate(${p.rotation ?? 0} ${r.x + r.width / 2} ${r.y + r.height / 2})`} onPointerDown={e => selectElement(e, { kind: "drawings", id: p.id })}>
            <path d={pathData(p.points)} fill="none" stroke={p.color} strokeWidth={p.width} opacity={p.opacity} strokeLinecap="round" strokeLinejoin="round"/>
            <path d={pathData(p.points)} fill="none" stroke="transparent" strokeWidth={Math.max(12 / b.viewport.scale, p.width)} pointerEvents={interactive && !space ? "stroke" : "none"}/></g>; })}
          {b.edges.map(e => {
            if (hiddenElements.has(e.id) || hiddenElements.has(e.source) || hiddenElements.has(e.target)) return null;
            const s = [...b.nodes, ...b.shapes].find(n => n.id === e.source), d = [...b.nodes, ...b.shapes].find(n => n.id === e.target); if (!s || !d) return null;
            const x1 = s.x + s.width, y1 = s.y + s.height / 2, x2 = d.x, y2 = d.y + d.height / 2, c = Math.max(40, Math.abs(x2 - x1) * .45);
            const path = `M${x1},${y1} C${x1+c},${y1} ${x2-c},${y2} ${x2},${y2}`;
            return <g key={e.id} data-element={e.id} onPointerDown={ev => selectElement(ev, { kind: "edges", id: e.id })}><path d={path} fill="none" stroke={selected?.id === e.id ? "var(--accent)" : "var(--connector)"} strokeWidth="2" markerEnd="url(#canvas-arrow)"/><path d={path} fill="none" stroke="transparent" strokeWidth="14" pointerEvents={interactive && !space ? "stroke" : "none"}/>{e.label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" fontSize="13" fill="var(--muted)" pointerEvents="none">{e.label}</text>}</g>;
          })}
          {b.texts.filter(text => !hiddenElements.has(text.id)).map(text => { const r = elementBounds(b, { kind: "texts", id: text.id })!; return <g key={text.id} data-element={text.id} transform={`rotate(${text.rotation ?? 0} ${r.x + r.width / 2} ${r.y + r.height / 2})`} onPointerDown={e => selectElement(e, { kind: "texts", id: text.id })}
            onDoubleClick={e => { if (tool !== "select") return; e.stopPropagation(); edit({ kind: "texts", id: text.id }); }}>
            <foreignObject x={r.x} y={r.y} width={r.width} height={r.height}><div className="canvas-copy" style={{ fontSize: text.fontSize ?? 16, color: canvasTextColor(text.color), backgroundColor: text.backgroundColor, fontWeight: text.bold ? 700 : 400, fontStyle: text.italic ? "italic" : "normal", textDecoration: text.underline ? "underline" : "none", textAlign: text.textAlign ?? "left" }}>{editing?.selection.id === text.id ? "" : text.text}</div></foreignObject>
          </g>; })}
          {b.nodes.filter(n => !hiddenElements.has(n.id)).map(n => <g key={n.id} data-element={n.id} className="mind-node" transform={`rotate(${n.rotation ?? 0} ${n.x + n.width / 2} ${n.y + n.height / 2})`} onPointerDown={e => selectElement(e, { kind: "nodes", id: n.id })}
            onDoubleClick={e => { if (tool !== "select") return; e.stopPropagation(); edit({ kind: "nodes", id: n.id }); }}>
            <rect x={n.x} y={n.y} width={n.width} height={n.height} rx="12" fill={n.color ?? "var(--node-fill)"} stroke={dropTarget === n.id ? "var(--accent)" : "var(--element-stroke)"} strokeWidth={dropTarget === n.id ? 3 : 1}/>
            <foreignObject x={n.x + 12} y={n.y + 10} width={Math.max(12, n.width - 24)} height={Math.max(12, n.height - 20)}><div className="node-copy" style={{ color: readableTextColor(n.color) }}>{editing?.selection.id === n.id ? "" : n.label}{n.sourcePage && (n.sourceDocumentId ? <button className="source-page-link" title={t("openSource")} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); void openSource(n.sourceDocumentId!, n.sourcePage!); }}><FileText size={12}/>{t("page")} {n.sourcePage}</button> : <small>{t("page")} {n.sourcePage}</small>)}{n.collapsed && <small>…</small>}</div></foreignObject>
            {b.edges.some(e => e.source === n.id && b.nodes.some(child => child.id === e.target)) && <g role="button" tabIndex={0} aria-label={t(n.collapsed ? "expand" : "collapse") + ": " + n.label} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onChange({ ...board, nodes: board.nodes.map(item => item.id === n.id ? { ...item, collapsed: !item.collapsed } : item) }); }} onKeyDown={e => { if (["Enter", " "].includes(e.key)) { e.preventDefault(); e.stopPropagation(); onChange({ ...board, nodes: board.nodes.map(item => item.id === n.id ? { ...item, collapsed: !item.collapsed } : item) }); } }}><circle cx={n.x + n.width} cy={n.y + n.height / 2} r={10} fill="var(--surface-raised)" stroke="var(--accent)"/><text x={n.x + n.width} y={n.y + n.height / 2 + 5} textAnchor="middle" fontSize={16} fill="var(--accent)">{n.collapsed ? "+" : "−"}</text></g>}
          </g>)}
          </LayerStack>
          {guides.map((guide, index) => guide.axis === "x"
            ? <line key={`x-${index}`} className="smart-guide" x1={guide.value} y1={guide.from} x2={guide.value} y2={guide.to} strokeWidth={1 / b.viewport.scale}/>
            : <line key={`y-${index}`} className="smart-guide" x1={guide.from} y1={guide.value} x2={guide.to} y2={guide.value} strokeWidth={1 / b.viewport.scale}/>)}
          {marquee && <rect {...marquee} fill="color-mix(in srgb, var(--accent) 12%, transparent)" stroke="var(--accent)" strokeWidth={1 / b.viewport.scale} pointerEvents="none"/>}
          {selections.length > 1 && selections.map(s => { const r = elementBounds(b, s); return r && <rect key={s.id} {...r} fill="none" stroke="var(--accent)" strokeDasharray="4 3" pointerEvents="none"/>; })}
          {bounds && selected && !editing && tool === "select" && <g className="selection-box">
            <rect x={bounds.x - 3} y={bounds.y - 3} width={bounds.width + 6} height={bounds.height + 6} fill="none" stroke="var(--accent)" strokeWidth={1.5 / b.viewport.scale} pointerEvents="none"/>
            {selected.kind !== "edges" && <rect className="resize-handle" x={bounds.x + bounds.width - 4 / b.viewport.scale} y={bounds.y + bounds.height - 4 / b.viewport.scale} width={8 / b.viewport.scale} height={8 / b.viewport.scale} fill="var(--surface-raised)" stroke="var(--accent)" strokeWidth={1 / b.viewport.scale}
              onPointerDown={e => { e.preventDefault(); e.stopPropagation(); svg.current?.setPointerCapture(e.pointerId); gesture.current = { mode: "resize", start: point(e.clientX, e.clientY), screen: { x: e.clientX, y: e.clientY }, base: board, selection: selected, selections, pointer: e.pointerId, next: board }; }}/>} {selected.kind !== "edges" && <g className="rotation-handle" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); const p = point(e.clientX, e.clientY); const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }; svg.current?.setPointerCapture(e.pointerId); gesture.current = { mode: "rotate", start: p, screen: { x: e.clientX, y: e.clientY }, base: board, selection: selected, selections, pointer: e.pointerId, next: board, center, startAngle: Math.atan2(p.y - center.y, p.x - center.x) * 180 / Math.PI }; }}><line x1={bounds.x + bounds.width / 2} y1={bounds.y - 3} x2={bounds.x + bounds.width / 2} y2={bounds.y - 25} stroke="var(--accent-2)"/><circle cx={bounds.x + bounds.width / 2} cy={bounds.y - 30} r={6 / b.viewport.scale} fill="var(--surface-raised)" stroke="var(--accent-2)"/></g>}</g>}
          {editing && editBounds && <foreignObject x={editBounds.x} y={editBounds.y} width={Math.max(editBounds.width, 120)} height={Math.max(editBounds.height, 100)}>
            <textarea className="inline-editor" autoFocus aria-label={t("editText")} placeholder={t("newText")} maxLength={10000}
              style={{ fontSize: selectedEl && "fontSize" in selectedEl ? selectedEl.fontSize ?? 16 : 16, fontWeight: selectedEl && "bold" in selectedEl && selectedEl.bold ? 700 : 400, fontStyle: selectedEl && "italic" in selectedEl && selectedEl.italic ? "italic" : "normal", textDecoration: selectedEl && "underline" in selectedEl && selectedEl.underline ? "underline" : "none", textAlign: selectedEl && "textAlign" in selectedEl ? selectedEl.textAlign ?? "left" : "left" }}
              value={editing.value} onChange={e => { const next = { ...editing, value: e.target.value }; editRef.current = next; setEditing(next); }}
              onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onBlur={() => finishEdit()}
              onKeyDown={e => { e.stopPropagation(); if (e.nativeEvent.isComposing) return; if (e.key === "Escape") { e.preventDefault(); finishEdit(true); } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); finishEdit(); } }}/></foreignObject>}
        </g>
      </svg>
      {sourceError && <div className="canvas-inline-error" role="alert"><span>{sourceError}</span><button className="icon-button" aria-label={t("close")} onClick={() => setSourceError("")}><X size={14}/></button></div>}
      <div className="canvas-hint">{t(tool === "connector" ? "connectorHint" : tool === "text" ? "textHint" : tool === "pen" || tool === "highlighter" ? "drawHint" : "canvasHint")}</div>
      <CanvasNavigator board={b} selection={selections} svg={svg} onChange={onChange}/>
      <button className="mobile-inspector-toggle" aria-label={t("properties")} aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(value => !value)}><SlidersHorizontal size={18}/><span>{t("properties")}</span></button>
      <div className="zoom-control"><button aria-label={t("zoomOut")} onClick={() => zoom(1/1.1)}>−</button><button className="zoom-value" aria-label={t("resetZoom")} onClick={() => onChange({ ...board, viewport: { x: 0, y: 0, scale: 1 } })}>{Math.round(b.viewport.scale * 100)}%</button><button aria-label={t("zoomIn")} onClick={() => zoom(1.1)}>+</button></div>
    </div>
    <aside className={`inspector ${inspectorOpen ? "mobile-open" : ""}`}><div className="inspector-heading"><h3>{t("properties")}</h3><button className="icon-button inspector-close" aria-label={t("close")} onClick={() => setInspectorOpen(false)}><X size={19}/></button></div>
      <section className="canvas-background-picker"><div className="property-caption"><PaintBucket size={14}/>{t("canvasBackground")}</div><div className="background-options">{BACKGROUND_OPTIONS.map(option => <button key={option} className={(board.background ?? "dots") === option ? "active" : ""} aria-pressed={(board.background ?? "dots") === option} title={t(backgroundLabel[option])} onClick={() => onChange({ ...board, background: option })}><span className={`background-swatch ${option}`}/><span>{t(backgroundLabel[option])}</span></button>)}</div></section>
      {hasCopy && <button className="secondary-button" onClick={() => void paste()}>{t("pasteElements")}</button>}
      {selections.length > 0 && <div className="selection-actions"><strong>{selections.length} {t("selectedElements")}</strong><div className="property-grid">
        <button onClick={() => onChange(reorderSelection(board, selections, "front"))}>{t("bringFront")}</button><button onClick={() => onChange(reorderSelection(board, selections, "back"))}>{t("sendBack")}</button>
        <button onClick={() => onChange(reorderSelection(board, selections, "forward"))}>{t("bringForward")}</button><button onClick={() => onChange(reorderSelection(board, selections, "backward"))}>{t("sendBackward")}</button>
        <button title={t("alignLeft")} onClick={() => onChange(alignSelection(board, selections, "left"))}><AlignStartHorizontal size={15}/>{t("alignLeft")}</button><button title={t("alignCenter")} onClick={() => onChange(alignSelection(board, selections, "center"))}><AlignCenterHorizontal size={15}/>{t("alignCenter")}</button><button title={t("alignRight")} onClick={() => onChange(alignSelection(board, selections, "right"))}><AlignEndHorizontal size={15}/>{t("alignRight")}</button>
        <button title={t("alignTop")} onClick={() => onChange(alignSelection(board, selections, "top"))}><AlignStartVertical size={15}/>{t("alignTop")}</button><button title={t("alignMiddle")} onClick={() => onChange(alignSelection(board, selections, "middle"))}><AlignCenterVertical size={15}/>{t("alignMiddle")}</button><button title={t("alignBottom")} onClick={() => onChange(alignSelection(board, selections, "bottom"))}><AlignEndVertical size={15}/>{t("alignBottom")}</button>
        <button disabled={selections.length < 3} onClick={() => onChange(distributeSelection(board, selections, "horizontal"))}>{t("distributeHorizontal")}</button><button disabled={selections.length < 3} onClick={() => onChange(distributeSelection(board, selections, "vertical"))}>{t("distributeVertical")}</button>
        <button disabled={selections.length < 2} onClick={() => onChange(groupSelection(board, selections))}>{t("group")}</button><button disabled={!board.groups?.some(g => g.elementIds.some(id => selections.some(s => s.id === id)))} onClick={() => onChange(ungroupSelection(board, selections))}>{t("ungroup")}</button>
        <button onClick={() => void copy()}>{t("copyElements")}</button><button onClick={duplicate}>{t("duplicate")}</button><button onClick={() => onChange(setElementFlags(board, selections, { locked: !selections.some(s => isLocked(s)) }))}>{selections.some(s => isLocked(s)) ? t("unlock") : t("lock")}</button><button onClick={() => onChange(setElementFlags(board, selections, { hidden: !selections.every(s => hiddenElements.has(s.id)) }))}>{selections.every(s => hiddenElements.has(s.id)) ? t("show") : t("hide")}</button><button onClick={remove}>{t("delete")}</button></div>
        {selectedStudyText && <button className="ai-selection-button" disabled={!canUseAi} title={!canUseAi ? t("loginRequired") : t("askAiSelection")} onClick={() => setAiOpen(true)}><Sparkles size={15}/>{t("askAiSelection")}</button>}
        {selected?.kind === "nodes" && selections.length === 1 && <><button onClick={() => relative(false)}>{t("addChild")} · Tab</button><button onClick={() => relative(true)}>{t("addSibling")} · Enter</button><small>{t("reparentHint")}</small></>}
      </div>}
      {!selectedEl ? <><p>{t("selectHint")}</p><label>{t("color")}<input type="color" value={ink} onChange={e => setInk(e.target.value)}/></label><label>{t("stroke")}<input type="range" min="1" max="20" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))}/></label></> : <>
        <div className="property-caption">{t(labelKey[selected!.kind])}</div>
        {bounds && <div className="property-grid">{(["x", "y", "width", "height"] as const).map(k => <label key={k}>{k === "width" ? t("width") : k === "height" ? t("height") : k.toUpperCase()}<input type="number" step="1" aria-label={k} value={Math.round(bounds[k])} onChange={e => {
          if (e.target.value === "" || !Number.isFinite(e.target.valueAsNumber)) return;
          const v = clamp(e.target.valueAsNumber, -100000, 100000);
          onChange(k === "x" || k === "y" ? moveElement(board, selected!, k === "x" ? v - bounds.x : 0, k === "y" ? v - bounds.y : 0) : resizeElement(board, selected!, k === "width" ? v : bounds.width, k === "height" ? v : bounds.height));
        }}/></label>)}</div>}
        {selected?.kind !== "edges" && <label>{t("color")}<input type="color" value={selectedColor} onChange={e => patch({ color: e.target.value })}/></label>}
        {selected?.kind === "edges" && <label>{t("label")}<input aria-label={t("label")} maxLength={500} value={"label" in selectedEl ? selectedEl.label ?? "" : ""} onChange={e => patch({ label: e.target.value || undefined })}/></label>}
        {selected?.kind === "texts" && <><label>{t("fontSize")}<input type="number" min="8" max="200" value={"fontSize" in selectedEl ? selectedEl.fontSize ?? 16 : 16} onChange={e => { if(e.target.value) patch({ fontSize: clamp(Number(e.target.value), 8, 200) }); }}/></label>
          <div className="text-format-toolbar" role="toolbar" aria-label={t("editText")}>
            <button aria-label={t("bold")} title={t("bold")} aria-pressed={"bold" in selectedEl && !!selectedEl.bold} className={"bold" in selectedEl && selectedEl.bold ? "active" : ""} onClick={() => patch({ bold: !("bold" in selectedEl && selectedEl.bold) })}><Bold size={16}/></button>
            <button aria-label={t("italic")} title={t("italic")} aria-pressed={"italic" in selectedEl && !!selectedEl.italic} className={"italic" in selectedEl && selectedEl.italic ? "active" : ""} onClick={() => patch({ italic: !("italic" in selectedEl && selectedEl.italic) })}><Italic size={16}/></button>
            <button aria-label={t("underline")} title={t("underline")} aria-pressed={"underline" in selectedEl && !!selectedEl.underline} className={"underline" in selectedEl && selectedEl.underline ? "active" : ""} onClick={() => patch({ underline: !("underline" in selectedEl && selectedEl.underline) })}><Underline size={16}/></button>
            <button aria-label={t("alignLeft")} title={t("alignLeft")} className={("textAlign" in selectedEl ? selectedEl.textAlign : undefined) === "left" || !("textAlign" in selectedEl && selectedEl.textAlign) ? "active" : ""} onClick={() => patch({ textAlign: "left" })}><AlignLeft size={16}/></button>
            <button aria-label={t("alignCenter")} title={t("alignCenter")} className={"textAlign" in selectedEl && selectedEl.textAlign === "center" ? "active" : ""} onClick={() => patch({ textAlign: "center" })}><AlignCenter size={16}/></button>
            <button aria-label={t("alignRight")} title={t("alignRight")} className={"textAlign" in selectedEl && selectedEl.textAlign === "right" ? "active" : ""} onClick={() => patch({ textAlign: "right" })}><AlignRight size={16}/></button>
            <button aria-label={t("bulletedList")} title={t("bulletedList")} onClick={() => toggleTextPrefix("• ")}><List size={16}/></button>
            <button aria-label={t("checklist")} title={t("checklist")} onClick={() => toggleTextPrefix("☐ ")}><ListChecks size={16}/></button>
          </div>
          <label>{t("textBackground")}<span className="color-with-clear"><input type="color" value={"backgroundColor" in selectedEl ? selectedEl.backgroundColor ?? palette.fill : palette.fill} onChange={e => patch({ backgroundColor: e.target.value })}/><button className="icon-button" aria-label={t("clearBackground")} title={t("clearBackground")} onClick={() => patch({ backgroundColor: undefined })}><X size={14}/></button></span></label>
        </>}
        {selected?.kind === "drawings" && <><label>{t("stroke")}<input type="range" min="1" max="40" value={"width" in selectedEl ? selectedEl.width : 3} onChange={e => patch({ width: Number(e.target.value) })}/></label><label>{t("opacity")}<input type="range" min=".05" max="1" step=".05" value={"opacity" in selectedEl ? selectedEl.opacity : 1} onChange={e => patch({ opacity: Number(e.target.value) })}/></label></>}
        {(selected?.kind === "texts" || selected?.kind === "nodes") && <button className="secondary-button" onClick={() => edit(selected!)}>{t("editText")}</button>}
        {selected?.kind === "nodes" && <button className="secondary-button" onClick={() => patch({ collapsed: !("collapsed" in selectedEl && selectedEl.collapsed) })}>{t("collapsed" in selectedEl && selectedEl.collapsed ? "expand" : "collapse")}</button>}
        <div className="actions">{selected?.kind !== "edges" && <button className="icon-button" aria-label={t("duplicate")} title={t("duplicate")} onClick={duplicate}><Copy size={18}/></button>}<button className="icon-button danger" aria-label={t("delete")} title={t("delete")} onClick={remove}><Trash2 size={18}/></button></div>
      </>}
      <ElementsPanel board={b} selections={selections} hiddenElements={hiddenElements}
        onSelect={(selection, additive) => { setTool("select"); const next = expandGroups(b, [selection]); setSelections(additive ? expandGroups(b, [...selections, ...next]) : next); }}
        onMove={(sourceId, targetId) => onChange(moveLayer(board, sourceId, targetId))}
        onToggleHidden={(selection, value) => onChange(setElementFlags(board, [selection], { hidden: value }))}
        onToggleLocked={(selection, value) => onChange(setElementFlags(board, [selection], { locked: value }))}/>
    </aside>
    {aiOpen && <AiSelectionPanel sourceText={selectedStudyText} canUse={canUseAi} onClose={() => setAiOpen(false)} onApply={applyAi}/>} 
    {sourceView && <SourceDocumentPanel source={sourceView} onClose={() => setSourceView(null)}/>} 
  </div>;
}
