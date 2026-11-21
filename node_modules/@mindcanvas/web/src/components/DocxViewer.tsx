import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, RefreshCw } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { DOCX_FRAME_HTML, renderDocxView } from "../lib/docxView";

export default function DocxViewer({ dataUrl, onReady }: { dataUrl: string; onReady?: () => void }) {
  const { t } = useLanguage();
  const viewport = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const readyCallback = useRef(onReady); readyCallback.current = onReady;
  const pages = useRef<HTMLElement[]>([]);
  const [frameRevision, setFrameRevision] = useState(0);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [oversized, setOversized] = useState(false);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 1100, height: 100 });
  const [viewportWidth, setViewportWidth] = useState(0);
  const [fit, setFit] = useState(true);
  const [manualZoom, setManualZoom] = useState(1);
  const zoom = fit ? Math.min(2, Math.max(.1, (viewportWidth - 24) / dimensions.width || 1)) : manualZoom;

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setViewportWidth(element.clientWidth);
    measure(); window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  useEffect(() => {
    const document = frame.current?.contentDocument;
    if (!frameRevision || !document?.body) return;
    let alive = true;
    const stage = document.createElement("div");
    const styles = document.createElement("div");
    document.body.append(styles, stage);
    pages.current = []; setCount(0); setPage(1); setLoading(true); setError(false); setOversized(false); setFit(true);
    viewport.current?.scrollTo?.({ top: 0, left: 0 });
    void (async () => {
      try {
        const binary = atob(dataUrl.split(",", 2)[1] ?? "");
        if (!binary) throw new Error("Empty DOCX");
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        const result = await renderDocxView(bytes, stage, styles);
        if (!alive) return;
        if (!result.pages.length) throw new Error("No DOCX pages");
        pages.current = result.pages;
        const width = Math.max(...result.pages.map(item => item.getBoundingClientRect().width), 1) + 32;
        setDimensions({ width, height: document.body.scrollHeight });
        setCount(result.pages.length); setOversized(result.oversized); setLoading(false);
        readyCallback.current?.();
      } catch { if (alive) { setLoading(false); setError(true); } }
    })();
    return () => { alive = false; stage.remove(); styles.remove(); };
  }, [dataUrl, frameRevision, retry]);

  const scrollToPage = (next: number) => {
    const bounded = Math.min(count, Math.max(1, next));
    setPage(bounded);
    viewport.current?.scrollTo?.({ top: (pages.current[bounded - 1]?.offsetTop ?? 0) * zoom, behavior: "auto" });
  };
  const zoomBy = (factor: number) => { setManualZoom(Math.min(3, Math.max(.1, zoom * factor))); setFit(false); };

  return <div className={`docx-document-viewer${oversized ? " has-layout-notice" : ""}`}>
    <div className="docx-viewer-toolbar">
      <div className="docx-page-control">
        <button type="button" aria-label={t("docxPreviousPage")} disabled={loading || error || page <= 1} onClick={() => scrollToPage(page - 1)}><ChevronLeft size={16}/></button>
        <span>{t("docxPageCounter", { current: count ? page : 0, total: count })}</span>
        <button type="button" aria-label={t("docxNextPage")} disabled={loading || error || page >= count} onClick={() => scrollToPage(page + 1)}><ChevronRight size={16}/></button>
      </div>
      <div className="docx-zoom-control">
        <button type="button" aria-label={t("zoomOut")} disabled={loading || error || zoom <= .1} onClick={() => zoomBy(.8)}><Minus size={15}/></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label={t("zoomIn")} disabled={loading || error || zoom >= 3} onClick={() => zoomBy(1.25)}><Plus size={15}/></button>
        <button type="button" aria-pressed={fit} disabled={loading || error} onClick={() => setFit(true)}>{t("docxFitWidth")}</button>
        <button type="button" disabled={loading || error} onClick={() => { setManualZoom(1); setFit(false); }}>100%</button>
      </div>
    </div>
    {oversized && <p className="docx-layout-notice" role="status">{t("docxLayoutNotice")}</p>}
    <div ref={viewport} className="docx-document-viewport" onScroll={() => {
      const position = (viewport.current?.scrollTop ?? 0) / zoom + 40;
      let current = 1;
      pages.current.forEach((item, index) => { if (item.offsetTop <= position) current = index + 1; });
      setPage(current);
    }}>
      {loading && <p className="document-loading" role="status">{t("docxLoading")}</p>}
      {error && <div className="document-error" role="alert"><p>{t("docxRenderError")}</p><button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={15}/>{t("retry")}</button></div>}
      <div className="docx-scaled-paper" style={{ width: dimensions.width * zoom, height: dimensions.height * zoom, visibility: loading || error ? "hidden" : "visible" }}>
        <iframe ref={frame} title={t("documentViewer")} sandbox="allow-same-origin" srcDoc={DOCX_FRAME_HTML} onLoad={() => setFrameRevision(value => value + 1)}
          style={{ width: dimensions.width, height: dimensions.height, transform: `scale(${zoom})`, transformOrigin: "0 0" }}/>
      </div>
    </div>
  </div>;
}
