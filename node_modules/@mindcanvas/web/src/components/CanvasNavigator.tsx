import { useEffect, useState, type RefObject } from "react";
import { Crosshair, Map, Maximize2, Navigation } from "lucide-react";
import type { BoardState } from "@mindcanvas/shared";
import type { Selection } from "../lib/board";
import { canvasContentBounds, fittedViewport, visibleCanvasElements, visibleElementBounds, visibleSelectionBounds } from "../lib/editorCommands";
import { useLanguage } from "../lib/i18n";

export default function CanvasNavigator({ board, selection, svg, onChange }: { board: BoardState; selection: Selection[]; svg: RefObject<SVGSVGElement | null>; onChange: (b: BoardState) => void }) {
  const { t } = useLanguage();
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [show, setShow] = useState(() => typeof window === "undefined" || !window.matchMedia?.("(max-width: 620px)").matches);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const el = svg.current; if (!el) return;
    const update = () => { const r = el.getBoundingClientRect(); setSize({ width: r.width || 800, height: r.height || 600 }); }; update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update); ro.observe(el); return () => ro.disconnect();
  }, [svg]);
  const entries = visibleCanvasElements(board), all = canvasContentBounds(board), chosen = visibleSelectionBounds(board, selection);
  const view = { x: -board.viewport.x / board.viewport.scale, y: -board.viewport.y / board.viewport.scale, width: size.width / board.viewport.scale, height: size.height / board.viewport.scale };
  const x = Math.min(all?.x ?? view.x, view.x) - 40, y = Math.min(all?.y ?? view.y, view.y) - 40;
  const w = Math.max(all ? all.x + all.width : view.x + view.width, view.x + view.width) - x + 40;
  const h = Math.max(all ? all.y + all.height : view.y + view.height, view.y + view.height) - y + 40;
  const currentCanvasSize = () => {
    const rect = svg.current?.getBoundingClientRect();
    return { width: rect?.width || size.width, height: rect?.height || size.height };
  };
  const fit = (selected: boolean) => {
    // Re-read both content and frame geometry at click time. This prevents a
    // stale minimap/viewport snapshot from shrinking Fit after a resize or a
    // previous pan/zoom operation.
    const bounds = selected ? visibleSelectionBounds(board, selection) : canvasContentBounds(board);
    if (bounds) {
      const currentSize = currentCanvasSize();
      onChange({ ...board, viewport: fittedViewport(bounds, currentSize.width, currentSize.height) });
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest("input,textarea,select,dialog")) return;
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && ["Digit1", "Digit2"].includes(e.code)) { e.preventDefault(); fit(e.code === "Digit2"); }
    }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  const runMobileAction = (action: () => void) => { action(); setMobileOpen(false); };
  return <div className={`canvas-navigator ${mobileOpen ? "mobile-expanded" : ""}`}>
    {show && <svg className="minimap" aria-label={t("minimap")} role="img" viewBox={`${x} ${y} ${w} ${h}`} onPointerDown={e => {
      const matrix = e.currentTarget.getScreenCTM(); if (!matrix) return;
      const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
      onChange({ ...board, viewport: { ...board.viewport, x: size.width / 2 - point.x * board.viewport.scale, y: size.height / 2 - point.y * board.viewport.scale } });
    }}>{entries.filter(s => s.kind !== "edges").map(s => { const b = visibleElementBounds(board, s); return b && <rect key={s.id} {...b} fill={selection.some(item => item.id === s.id) ? "var(--accent)" : "var(--accent-border)"}/>; })}<rect {...view} fill="color-mix(in srgb, var(--accent) 8%, transparent)" stroke="var(--accent)" strokeWidth={Math.max(w, h) / 180}/></svg>}
    <div className="navigator-actions"><button disabled={!all} onClick={() => fit(false)} title="Shift+1">{t("fitCanvas")}</button>{chosen && <button onClick={() => fit(true)} title="Shift+2">{t("fitSelection")}</button>}<button className="navigator-minimap-toggle" aria-pressed={show} onClick={() => setShow(!show)}>{t("minimap")}</button></div>
    <div className="mobile-navigator-controls">
      {mobileOpen && <div className="mobile-navigator-actions" role="menu">
        <button disabled={!all} onClick={() => runMobileAction(() => fit(false))} title={t("fitCanvas")}><Maximize2 size={17}/><span>{t("fitCanvas")}</span></button>
        <button disabled={!chosen} onClick={() => runMobileAction(() => fit(true))} title={t("fitSelection")}><Crosshair size={17}/><span>{t("fitSelection")}</span></button>
        <button aria-pressed={show} onClick={() => runMobileAction(() => setShow(value => !value))} title={t("minimap")}><Map size={17}/><span>{t("minimap")}</span></button>
      </div>}
      <button type="button" className={`mobile-navigator-trigger ${mobileOpen ? "selected" : ""}`} aria-expanded={mobileOpen} aria-label={t("canvasNavigation")} title={t("canvasNavigation")} onClick={() => setMobileOpen(value => !value)}><Navigation size={19}/></button>
    </div>
  </div>;
}
