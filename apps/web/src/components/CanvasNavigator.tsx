import { useEffect, useState, type RefObject } from "react";
import type { BoardState } from "@mindcanvas/shared";
import { hiddenNodes, elementBounds, type Selection } from "../lib/board";
import { orderedElements, selectionBounds, fittedViewport } from "../lib/editorCommands";
import { useLanguage } from "../lib/i18n";

export default function CanvasNavigator({ board, selection, svg, onChange }: { board: BoardState; selection: Selection[]; svg: RefObject<SVGSVGElement | null>; onChange: (b: BoardState) => void }) {
  const { t } = useLanguage(); const [size, setSize] = useState({ width: 800, height: 600 }), [show, setShow] = useState(true);
  useEffect(() => {
    const el = svg.current; if (!el) return;
    const update = () => { const r = el.getBoundingClientRect(); setSize({ width: r.width || 800, height: r.height || 600 }); }; update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update); ro.observe(el); return () => ro.disconnect();
  }, [svg]);
  const hidden = hiddenNodes(board), entries = orderedElements(board).filter(s => {
    if (hidden.has(s.id)) return false;
    const edge = s.kind === "edges" ? board.edges.find(e => e.id === s.id) : null;
    return !edge || (!hidden.has(edge.source) && !hidden.has(edge.target));
  });
  const all = selectionBounds(board, entries), chosen = selectionBounds(board, selection);
  const view = { x: -board.viewport.x / board.viewport.scale, y: -board.viewport.y / board.viewport.scale, width: size.width / board.viewport.scale, height: size.height / board.viewport.scale };
  const x = Math.min(all?.x ?? view.x, view.x) - 40, y = Math.min(all?.y ?? view.y, view.y) - 40;
  const w = Math.max(all ? all.x + all.width : view.x + view.width, view.x + view.width) - x + 40;
  const h = Math.max(all ? all.y + all.height : view.y + view.height, view.y + view.height) - y + 40;
  const fit = (selected: boolean) => { const bounds = selected ? chosen : all; if (bounds) onChange({ ...board, viewport: fittedViewport(bounds, size.width, size.height) }); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest("input,textarea,select,dialog")) return;
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && ["Digit1", "Digit2"].includes(e.code)) { e.preventDefault(); fit(e.code === "Digit2"); }
    }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  return <div className="canvas-navigator"><div className="navigator-actions"><button disabled={!all} onClick={() => fit(false)} title="Shift+1">{t("fitCanvas")}</button><button disabled={!chosen} onClick={() => fit(true)} title="Shift+2">{t("fitSelection")}</button><button aria-pressed={show} onClick={() => setShow(!show)}>{t("minimap")}</button></div>
    {show && <svg className="minimap" aria-label={t("minimap")} role="img" viewBox={`${x} ${y} ${w} ${h}`} onPointerDown={e => {
      const matrix = e.currentTarget.getScreenCTM(); if (!matrix) return;
      const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
      onChange({ ...board, viewport: { ...board.viewport, x: size.width / 2 - point.x * board.viewport.scale, y: size.height / 2 - point.y * board.viewport.scale } });
    }}>{entries.filter(s => s.kind !== "edges").map(s => { const b = elementBounds(board, s); return b && <rect key={s.id} {...b} fill={selection.some(item => item.id === s.id) ? "var(--accent)" : "var(--accent-border)"}/>; })}<rect {...view} fill="color-mix(in srgb, var(--accent) 8%, transparent)" stroke="var(--accent)" strokeWidth={Math.max(w, h) / 180}/></svg>}
  </div>;
}
