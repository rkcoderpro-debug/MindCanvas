import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Eraser, FileSpreadsheet, FileText, Maximize2, Minimize2, PenLine, RotateCcw, X } from "lucide-react";
import type { UploadedDocument, DocumentKind } from "../lib/documentStore";
import { useLanguage } from "../lib/i18n";
import { PDFDocument, rgb } from "pdf-lib";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

type Source = Pick<UploadedDocument, "name" | "mimeType" | "dataUrl" | "kind"> & Partial<Pick<UploadedDocument, "id">>;
type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };

type Props = { source: Source; embedded?: boolean; onClose?: () => void };

function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const raw = dataUrl.split(",", 2)[1] ?? "";
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!)); }
function kindFor(source: Source): DocumentKind { return source.kind; }
function colorParts(value: string) { const match = /^#([0-9a-f]{6})$/i.exec(value); if (!match) return [0.16, 0.42, 0.82] as const; const number = Number.parseInt(match[1], 16); return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255] as const; }
function sanitizeOfficeHtml(value: string): string {
  if (typeof DOMParser === "undefined") return value.replace(/<(?:script|iframe|object|embed|link|style)\b[\s\S]*?<\/[^>]+>/gi, "").replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  const document = new DOMParser().parseFromString(value, "text/html");
  document.querySelectorAll("script,iframe,object,embed,link,style").forEach(node => node.remove());
  document.querySelectorAll("*").forEach(node => {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      if (["href", "src", "xlink:href"].includes(attribute.name.toLowerCase()) && !/^data:(?:image|video|audio)\//i.test(attribute.value)) node.removeAttribute(attribute.name);
    }
  });
  return document.body.innerHTML;
}

function OfficeViewer({ source }: { source: Source }) {
  const { t } = useLanguage();
  const [html, setHtml] = useState("");
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState(0);
  const [slides, setSlides] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError(""); setHtml(""); setSheets([]); setSlides([]); setSheet(0);
    void (async () => {
      try {
        const bytes = bytesFromDataUrl(source.dataUrl);
        if (source.kind === "docx") {
          const mammoth = await import("mammoth");
          const arrayBuffer = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(arrayBuffer).set(bytes);
          const result = await mammoth.convertToHtml({ arrayBuffer });
          if (alive) setHtml(sanitizeOfficeHtml(result.value));
        } else if (source.kind === "xlsx") {
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(bytes, { type: "array" });
          if (alive) { setSheets(workbook.SheetNames); setHtml(workbook.SheetNames.length ? sanitizeOfficeHtml(XLSX.utils.sheet_to_html(workbook.Sheets[workbook.SheetNames[0]])) : "<p>Không có trang tính.</p>"); }
        } else {
          const JSZip = (await import("jszip")).default;
          const zip = await JSZip.loadAsync(bytes);
          const names = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] ?? 0) - Number(b.match(/slide(\d+)/i)?.[1] ?? 0));
          const parsed: string[] = [];
          for (const name of names) {
            const xml = await zip.files[name].async("text");
            const texts = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(match => match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
            parsed.push(texts.length ? texts.map(escapeHtml).join("<br/>") : "<em>Trang chiếu không có văn bản.</em>");
          }
          if (alive) setSlides(parsed);
        }
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : "Không thể xem tài liệu."); }
    })();
    return () => { alive = false; };
  }, [source.dataUrl, source.kind]);
  if (error) return <div className="document-error"><FileText size={30}/><p>{error}</p></div>;
  if (source.kind === "xlsx") return <div className="office-sheet-viewer"><div className="office-sheet-tabs">{sheets.map((name, index) => <button key={name} className={sheet === index ? "active" : ""} onClick={() => { setSheet(index); void (async () => { const XLSX = await import("xlsx"); const workbook = XLSX.read(bytesFromDataUrl(source.dataUrl), { type: "array" }); setHtml(sanitizeOfficeHtml(XLSX.utils.sheet_to_html(workbook.Sheets[name]))); })(); }}>{name}</button>)}</div><div className="office-html" dangerouslySetInnerHTML={{ __html: html || "<p>Đang đọc bảng tính…</p>" }}/></div>;
  if (source.kind === "pptx") return <div className="pptx-viewer">{slides.length ? <div className="pptx-slide"><div dangerouslySetInnerHTML={{ __html: slides[sheet] }}/></div> : <p>Đang đọc bản trình chiếu…</p>}<div className="document-pager"><button disabled={sheet <= 0} onClick={() => setSheet(value => value - 1)}><ChevronLeft size={16}/></button><span>{slides.length ? `${sheet + 1} / ${slides.length}` : "…"}</span><button disabled={sheet >= slides.length - 1} onClick={() => setSheet(value => value + 1)}><ChevronRight size={16}/></button></div></div>;
  return <div className="office-html" dangerouslySetInnerHTML={{ __html: html || "<p>Đang đọc tài liệu…</p>" }}/>;
}

export default function DocumentViewer({ source, embedded = false, onClose }: Props) {
  const { t } = useLanguage();
  const kind = kindFor(source);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [pdf, setPdf] = useState<any>(null);
  const [loading, setLoading] = useState(kind === "pdf");
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#2563eb");
  const [width, setWidth] = useState(3);
  const [strokes, setStrokes] = useState<Record<number, Stroke[]>>({});
  const pageCanvas = useRef<HTMLCanvasElement>(null);
  const annotationCanvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const currentStroke = useRef<Stroke | null>(null);
  const dimensions = useRef<Record<number, { width: number; height: number; pdfWidth: number; pdfHeight: number }>>({});
  const pdfBytes = useMemo(() => kind === "pdf" ? bytesFromDataUrl(source.dataUrl) : null, [kind, source.dataUrl]);

  useEffect(() => {
    if (kind !== "pdf" || !pdfBytes) return;
    let alive = true;
    setLoading(true); setError(""); setPage(1);
    void import("pdfjs-dist/legacy/build/pdf.mjs").then(module => {
      if (!alive) return;
      // PDF.js 6 no longer silently falls back to a fake worker in the
      // browser. Point it at Vite's emitted worker asset before opening the
      // document so embedded and manager viewers work in production builds.
      module.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      // Pass a copy because the worker may transfer (and detach) the input
      // buffer; exportPdf still needs the original bytes later.
      return module.getDocument({ data: pdfBytes.slice() }).promise.then((document) => { if (alive) { setPdf(document); setPageCount(document.numPages); } });
    }).catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : "Không thể mở PDF."); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [kind, pdfBytes]);

  useEffect(() => {
    if (!pdf || kind !== "pdf" || !pageCanvas.current || !annotationCanvas.current) return;
    let alive = true;
    void pdf.getPage(page).then(async (pdfPage: any) => {
      const viewport = pdfPage.getViewport({ scale: 1.35 });
      const canvas = pageCanvas.current!; const overlay = annotationCanvas.current!;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = viewport.width * ratio; canvas.height = viewport.height * ratio;
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      overlay.width = viewport.width * ratio; overlay.height = viewport.height * ratio;
      overlay.style.width = `${viewport.width}px`; overlay.style.height = `${viewport.height}px`;
      dimensions.current[page] = { width: viewport.width, height: viewport.height, pdfWidth: pdfPage.view[2] - pdfPage.view[0], pdfHeight: pdfPage.view[3] - pdfPage.view[1] };
      await pdfPage.render({ canvasContext: canvas.getContext("2d")!, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined }).promise;
      if (alive) redraw(page);
    }).catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : "Không thể render trang PDF."); });
    return () => { alive = false; };
  }, [pdf, page]);

  const redraw = (targetPage = page) => {
    const canvas = annotationCanvas.current; const context = canvas?.getContext("2d"); const size = dimensions.current[targetPage];
    if (!canvas || !context || !size) return;
    const ratio = window.devicePixelRatio || 1; context.clearRect(0, 0, canvas.width, canvas.height); context.save(); context.scale(ratio, ratio); context.lineCap = "round"; context.lineJoin = "round";
    for (const stroke of strokes[targetPage] ?? []) { context.strokeStyle = stroke.color; context.lineWidth = stroke.width; context.beginPath(); stroke.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke(); }
    context.restore();
  };
  useEffect(() => { redraw(); }, [strokes, page]);

  const beginStroke = (event: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing) return; const rect = event.currentTarget.getBoundingClientRect(); currentStroke.current = { points: [{ x: event.clientX - rect.left, y: event.clientY - rect.top }], color, width }; event.currentTarget.setPointerCapture(event.pointerId); };
  const moveStroke = (event: React.PointerEvent<HTMLCanvasElement>) => { const stroke = currentStroke.current; if (!stroke) return; const rect = event.currentTarget.getBoundingClientRect(); stroke.points.push({ x: event.clientX - rect.left, y: event.clientY - rect.top }); redraw(); };
  const finishStroke = () => { const stroke = currentStroke.current; currentStroke.current = null; if (!stroke || stroke.points.length < 2) return; setStrokes(current => ({ ...current, [page]: [...(current[page] ?? []), stroke] })); };
  const clearPage = () => setStrokes(current => ({ ...current, [page]: [] }));
  const undoStroke = () => setStrokes(current => ({ ...current, [page]: (current[page] ?? []).slice(0, -1) }));
  const exportPdf = async () => {
    if (!pdfBytes) return;
    try {
      const pdfDocument = await PDFDocument.load(pdfBytes);
      for (const [pageKey, pageStrokes] of Object.entries(strokes)) {
        const pdfPage = pdfDocument.getPage(Number(pageKey) - 1); const size = dimensions.current[Number(pageKey)];
        if (!size) continue;
        for (const stroke of pageStrokes) for (let index = 1; index < stroke.points.length; index += 1) {
          const from = stroke.points[index - 1], to = stroke.points[index], [r, g, b] = colorParts(stroke.color);
          pdfPage.drawLine({ start: { x: from.x / size.width * size.pdfWidth, y: size.pdfHeight - from.y / size.height * size.pdfHeight }, end: { x: to.x / size.width * size.pdfWidth, y: size.pdfHeight - to.y / size.height * size.pdfHeight }, thickness: Math.max(.5, stroke.width / size.width * size.pdfWidth), color: rgb(r, g, b) });
        }
      }
      const savedBytes = await pdfDocument.save();
      const blob = new Blob([new Uint8Array(savedBytes)], { type: "application/pdf" }); const url = URL.createObjectURL(blob); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `${source.name.replace(/\.pdf$/i, "")}-annotated.pdf`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể xuất PDF mới."); }
  };
  const toggleFullscreen = async () => { if (!viewer.current) return; try { if (document.fullscreenElement === viewer.current) await document.exitFullscreen(); else await viewer.current.requestFullscreen(); } catch { setFullscreen(value => !value); } };
  useEffect(() => { const sync = () => setFullscreen(document.fullscreenElement === viewer.current); document.addEventListener("fullscreenchange", sync); return () => document.removeEventListener("fullscreenchange", sync); }, []);

  return (
    <section ref={viewer} className={`document-viewer ${embedded ? "document-viewer-embedded" : ""} ${fullscreen ? "is-fullscreen" : ""}`} aria-label={`${t("documentViewer")} ${source.name}`}>
      <header className="document-viewer-header">
        <div className="document-viewer-title">
          {kind === "xlsx" ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
          <strong title={source.name}>{source.name}</strong>
          <small>{kind.toUpperCase()}</small>
        </div>
        <div className="document-viewer-actions">
          {kind === "pdf" && (
            <>
              <label className="document-draw-toggle">
                <input type="checkbox" checked={drawing} onChange={event => setDrawing(event.target.checked)} />
                <PenLine size={15} />
                {t("drawOnPdf")}
              </label>
              {drawing && (
                <>
                  <input aria-label={t("penColor")} type="color" value={color} onChange={event => setColor(event.target.value)} />
                  <label className="document-width">
                    <PenLine size={13} />
                    <input aria-label={t("penWidth")} type="range" min="1" max="16" value={width} onChange={event => setWidth(Number(event.target.value))} />
                  </label>
                  <button title={t("undoDrawing")} onClick={undoStroke}><RotateCcw size={15} /></button>
                  <button title={t("clearDrawing")} onClick={clearPage}><Eraser size={15} /></button>
                </>
              )}
              <button className="primary-button" title={t("exportAnnotatedPdf")} onClick={() => void exportPdf()}>
                <Download size={15} />
                {t("exportPdf")}
              </button>
            </>
          )}
          <button title={fullscreen ? t("exitFullscreen") : t("maximizeCanvas")} onClick={() => void toggleFullscreen()}>
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          {onClose && <button title={t("close")} onClick={onClose}><X size={16} /></button>}
        </div>
      </header>
      {kind === "pdf" ? (
        <div className="document-pdf-body">
          {loading && <div className="document-loading">Đang render PDF…</div>}
          {error && <div className="document-error">{error}</div>}
          {!loading && !error && (
            <>
              <div className="pdf-page-stack">
                <canvas ref={pageCanvas} />
                <canvas ref={annotationCanvas} className="pdf-annotation-canvas" onPointerDown={beginStroke} onPointerMove={moveStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke} />
              </div>
              <div className="document-pager">
                <button disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} /></button>
                <span>{page} / {pageCount}</span>
                <button disabled={page >= pageCount} onClick={() => setPage(value => value + 1)}><ChevronRight size={16} /></button>
              </div>
            </>
          )}
        </div>
      ) : <OfficeViewer source={source} />}
    </section>
  );
}
