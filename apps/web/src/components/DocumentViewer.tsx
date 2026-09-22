import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Eraser, FileSpreadsheet, FileText, Highlighter, Maximize2, Minimize2, Minus, PenLine, Plus, RotateCcw, RotateCw, X } from "lucide-react";
import type { UploadedDocument, DocumentKind } from "../lib/documentStore";
import { useLanguage } from "../lib/i18n";
import { PDFDocument, rgb } from "pdf-lib";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { annotationMapsEqual, cloneAnnotationMap, eraseAnnotationStrokes, type AnnotationStroke, type AnnotationTool } from "../lib/documentAnnotations";
import { emitGuideAction, GUIDE_REQUEST_EVENT } from "../lib/featureGuides";

type Source = Pick<UploadedDocument, "name" | "mimeType" | "dataUrl" | "kind"> & Partial<Pick<UploadedDocument, "id">>;
type ViewerReadyDetail = { sessionId: string; documentId?: string; kind: DocumentKind };
type Point = { x: number; y: number };
type Stroke = AnnotationStroke;
type AnnotationMode = AnnotationTool | "eraser";
type ActiveStroke = Stroke & { page: number };

type Props = { source: Source; embedded?: boolean; dedicated?: boolean; enableGuide?: boolean; onClose?: () => void; onReady?: (detail: ViewerReadyDetail) => void };

function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const raw = dataUrl.split(",", 2)[1] ?? "";
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!)); }
function kindFor(source: Source): DocumentKind { return source.kind; }
export function shouldRequestPdfGuide(kind: DocumentKind, enableGuide = true, dedicated = false) {
  return kind === "pdf" && enableGuide && !dedicated;
}
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

function OfficeViewer({ source, onReady }: { source: Source; onReady?: () => void }) {
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
          if (alive) { setHtml(sanitizeOfficeHtml(result.value)); onReady?.(); }
        } else if (source.kind === "xlsx") {
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(bytes, { type: "array" });
          if (alive) { setSheets(workbook.SheetNames); setHtml(workbook.SheetNames.length ? sanitizeOfficeHtml(XLSX.utils.sheet_to_html(workbook.Sheets[workbook.SheetNames[0]])) : "<p>Không có trang tính.</p>"); onReady?.(); }
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
          if (alive) { setSlides(parsed); onReady?.(); }
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

export default function DocumentViewer({ source, embedded = false, dedicated = false, enableGuide = true, onClose, onReady }: Props) {
  const { t } = useLanguage();
  const kind = kindFor(source);
  const viewerSessionId = useMemo(() => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `viewer-${Date.now()}-${Math.random().toString(36).slice(2)}`, [source.dataUrl, source.id]);
  useEffect(() => {
    if (!shouldRequestPdfGuide(kind, enableGuide, dedicated)) return;
    const timer = window.setTimeout(() => window.dispatchEvent(new CustomEvent(GUIDE_REQUEST_EVENT, { detail: { guideId: "pdf-annotation", viewerSessionId, documentId: source.id, kind } })), 0);
    return () => window.clearTimeout(timer);
  }, [dedicated, enableGuide, kind, source.dataUrl, source.id, viewerSessionId]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [pdf, setPdf] = useState<any>(null);
  const [loading, setLoading] = useState(kind === "pdf");
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>("pen");
  const [heldAnnotationMode, setHeldAnnotationMode] = useState<AnnotationMode | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [color, setColor] = useState("#2563eb");
  const [width, setWidth] = useState(3);
  const [eraserSize, setEraserSize] = useState(20);
  const [pdfZoom, setPdfZoom] = useState(1);
  const [pdfZoomOrigin, setPdfZoomOrigin] = useState<Point>({ x: 0, y: 0 });
  const [strokes, setStrokes] = useState<Record<number, Stroke[]>>({});
  const [historyRevision, setHistoryRevision] = useState(0);
  const pageCanvas = useRef<HTMLCanvasElement>(null);
  const annotationCanvas = useRef<HTMLCanvasElement>(null);
  const pdfBody = useRef<HTMLDivElement>(null);
  const pdfPageShell = useRef<HTMLDivElement>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const currentStroke = useRef<ActiveStroke | null>(null);
  const activeEraser = useRef<{ page: number; before: Record<number, Stroke[]>; changed: boolean } | null>(null);
  const strokesRef = useRef<Record<number, Stroke[]>>({});
  const historyPast = useRef<Record<number, Stroke[]>[]>([]);
  const historyFuture = useRef<Record<number, Stroke[]>[]>([]);
  const eraserCursor = useRef<Point | null>(null);
  const ctrlHeld = useRef(false);
  const spaceHeldRef = useRef(false);
  const heldAnnotationKeys = useRef<string[]>([]);
  const pdfZoomGesture = useRef<{ pointerId: number; startY: number; startZoom: number; origin: Point } | null>(null);
  const pdfPanGesture = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const dimensions = useRef<Record<number, { width: number; height: number; pdfWidth: number; pdfHeight: number }>>({});
  const pdfBytes = useMemo(() => kind === "pdf" ? bytesFromDataUrl(source.dataUrl) : null, [kind, source.dataUrl]);
  strokesRef.current = strokes;
  const effectiveAnnotationMode = heldAnnotationMode ?? annotationMode;
  const annotationActive = (fullscreen || dedicated) && (drawing || heldAnnotationMode !== null);

  useEffect(() => {
    if (kind !== "pdf" || !pdfBytes) return;
    let alive = true;
    setLoading(true); setError(""); setPage(1); setPdf(null); setPageCount(0); setPdfZoom(1); setPdfZoomOrigin({ x: 0, y: 0 });
    strokesRef.current = {}; setStrokes({}); historyPast.current = []; historyFuture.current = []; setHistoryRevision(value => value + 1);
    currentStroke.current = null; activeEraser.current = null; eraserCursor.current = null;
    void import("pdfjs-dist/legacy/build/pdf.mjs").then(module => {
      if (!alive) return;
      // PDF.js 6 no longer silently falls back to a fake worker in the
      // browser. Point it at Vite's emitted worker asset before opening the
      // document so embedded and manager viewers work in production builds.
      module.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      // Pass a copy because the worker may transfer (and detach) the input
      // buffer; exportPdf still needs the original bytes later.
      return module.getDocument({ data: pdfBytes.slice() }).promise.then((document) => { if (alive) { setPdf(document); setPageCount(document.numPages); onReady?.({ sessionId: viewerSessionId, documentId: source.id, kind }); } });
    }).catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : "Không thể mở PDF."); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [kind, pdfBytes, source.id, viewerSessionId]);

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

  const drawStroke = (context: CanvasRenderingContext2D, stroke: Stroke) => {
    if (!stroke.points.length) return;
    context.save();
    context.strokeStyle = stroke.color;
    context.fillStyle = stroke.color;
    context.globalAlpha = stroke.tool === "highlight" ? 0.34 : 1;
    context.lineWidth = stroke.width;
    context.lineCap = "round";
    context.lineJoin = "round";
    if (stroke.points.length === 1) {
      context.beginPath();
      context.arc(stroke.points[0].x, stroke.points[0].y, Math.max(0.5, stroke.width / 2), 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      stroke.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.stroke();
    }
    context.restore();
  };
  const redraw = (targetPage = page) => {
    const canvas = annotationCanvas.current; const context = canvas?.getContext("2d"); const size = dimensions.current[targetPage];
    if (!canvas || !context || !size) return;
    const ratio = window.devicePixelRatio || 1;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save(); context.scale(ratio, ratio);
    for (const stroke of strokesRef.current[targetPage] ?? []) drawStroke(context, stroke);
    const active = currentStroke.current;
    if (active?.page === targetPage && active.tool !== undefined) drawStroke(context, active);
    if (effectiveAnnotationMode === "eraser" && targetPage === page && eraserCursor.current) {
      context.save();
      context.strokeStyle = "rgba(239, 68, 68, .9)";
      context.lineWidth = 1 / ratio;
      context.setLineDash([4 / ratio, 3 / ratio]);
      context.beginPath();
      context.arc(eraserCursor.current.x, eraserCursor.current.y, eraserSize / 2, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
    context.restore();
  };
  useEffect(() => { redraw(); }, [strokes, page, annotationMode, historyRevision]);

  const setStrokesImmediately = (next: Record<number, Stroke[]>) => {
    strokesRef.current = next;
    setStrokes(next);
  };
  const recordStrokes = (next: Record<number, Stroke[]>) => {
    if (annotationMapsEqual(strokesRef.current, next)) return;
    historyPast.current.push(cloneAnnotationMap(strokesRef.current));
    historyFuture.current = [];
    setStrokesImmediately(next);
    setHistoryRevision(value => value + 1);
  };
  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = pdfPageShell.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const zoom = Math.max(.01, pdfZoom);
    return { x: pdfZoomOrigin.x + (event.clientX - rect.left - pdfZoomOrigin.x) / zoom, y: pdfZoomOrigin.y + (event.clientY - rect.top - pdfZoomOrigin.y) / zoom };
  };
  const applyEraser = (point: Point, targetPage: number) => {
    const active = activeEraser.current;
    if (!active || active.page !== targetPage) return;
    const currentPage = strokesRef.current[targetPage] ?? [];
    const nextPage = eraseAnnotationStrokes(currentPage, point, eraserSize / 2);
    const next = { ...strokesRef.current, [targetPage]: nextPage };
    if (annotationMapsEqual(strokesRef.current, next)) return;
    active.changed = true;
    setStrokesImmediately(next);
    redraw(targetPage);
  };
  const beginStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!annotationActive || event.ctrlKey || event.metaKey || ctrlHeld.current || spaceHeldRef.current) return;
    const point = pointFromEvent(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (effectiveAnnotationMode === "eraser") {
      activeEraser.current = { page, before: cloneAnnotationMap(strokesRef.current), changed: false };
      eraserCursor.current = point;
      applyEraser(point, page);
      redraw(page);
      return;
    }
    currentStroke.current = { page, points: [point], color, width: effectiveAnnotationMode === "highlight" ? Math.max(10, width * 3) : width, tool: effectiveAnnotationMode };
    redraw(page);
  };
  const moveStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    if (activeEraser.current) {
      eraserCursor.current = point;
      applyEraser(point, activeEraser.current.page);
      redraw(activeEraser.current.page);
      return;
    }
    const stroke = currentStroke.current;
    if (!stroke) return;
    stroke.points.push(point);
    redraw(stroke.page);
  };
  const finishStroke = () => {
    const stroke = currentStroke.current;
    currentStroke.current = null;
    const eraser = activeEraser.current;
    activeEraser.current = null;
    eraserCursor.current = null;
    if (eraser?.changed) {
      historyPast.current.push(eraser.before);
      historyFuture.current = [];
      setHistoryRevision(value => value + 1);
    }
    if (stroke && stroke.points.length >= 2) {
      const committedStroke: Stroke = { points: stroke.points, color: stroke.color, width: stroke.width, tool: stroke.tool };
      const next = { ...strokesRef.current, [stroke.page]: [...(strokesRef.current[stroke.page] ?? []), committedStroke] };
      recordStrokes(next);
      emitGuideAction("pdf:draw");
    }
    redraw(page);
  };
  const clearPage = () => {
    const currentPage = strokesRef.current[page] ?? [];
    if (!currentPage.length) return;
    recordStrokes({ ...strokesRef.current, [page]: [] });
  };
  const undoStroke = () => {
    const previous = historyPast.current.pop();
    if (!previous) return;
    historyFuture.current.push(cloneAnnotationMap(strokesRef.current));
    setStrokesImmediately(previous);
    setHistoryRevision(value => value + 1);
  };
  const redoStroke = () => {
    const next = historyFuture.current.pop();
    if (!next) return;
    historyPast.current.push(cloneAnnotationMap(strokesRef.current));
    setStrokesImmediately(next);
    setHistoryRevision(value => value + 1);
  };
  const chooseAnnotationMode = (mode: AnnotationMode) => {
    setAnnotationMode(mode);
    emitGuideAction(`pdf:tool:${mode}`);
    if (mode !== "eraser") eraserCursor.current = null;
    redraw(page);
  };
  const beginPdfPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("button, input, label, .document-pager")) return;
    const body = pdfBody.current;
    const shell = pdfPageShell.current;
    if (!body || !shell) return;
    if (event.ctrlKey || event.metaKey || ctrlHeld.current) {
      const rect = shell.getBoundingClientRect();
      const origin = { x: pdfZoomOrigin.x + (event.clientX - rect.left - pdfZoomOrigin.x) / Math.max(.01, pdfZoom), y: pdfZoomOrigin.y + (event.clientY - rect.top - pdfZoomOrigin.y) / Math.max(.01, pdfZoom) };
      pdfZoomGesture.current = { pointerId: event.pointerId, startY: event.clientY, startZoom: pdfZoom, origin };
      setPdfZoomOrigin(origin);
      body.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
    if (spaceHeldRef.current) {
      pdfPanGesture.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, scrollLeft: body.scrollLeft, scrollTop: body.scrollTop };
      body.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
  };
  const movePdfPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const body = pdfBody.current;
    const zoomGesture = pdfZoomGesture.current;
    const panGesture = pdfPanGesture.current;
    if (!body) return;
    if (zoomGesture?.pointerId === event.pointerId) {
      const nextZoom = Math.min(4, Math.max(.5, zoomGesture.startZoom * Math.exp((zoomGesture.startY - event.clientY) * .004)));
      setPdfZoom(nextZoom);
      event.preventDefault();
      return;
    }
    if (panGesture?.pointerId === event.pointerId) {
      body.scrollLeft = panGesture.scrollLeft - (event.clientX - panGesture.startX);
      body.scrollTop = panGesture.scrollTop - (event.clientY - panGesture.startY);
      event.preventDefault();
    }
  };
  const finishPdfPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const body = pdfBody.current;
    if (pdfZoomGesture.current?.pointerId === event.pointerId) pdfZoomGesture.current = null;
    if (pdfPanGesture.current?.pointerId === event.pointerId) pdfPanGesture.current = null;
    if (body?.hasPointerCapture?.(event.pointerId)) body.releasePointerCapture(event.pointerId);
  };
  const zoomPdfAt = (nextZoom: number, clientX: number, clientY: number) => {
    const shell = pdfPageShell.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const currentZoom = Math.max(.01, pdfZoom);
    const origin = { x: pdfZoomOrigin.x + (clientX - rect.left - pdfZoomOrigin.x) / currentZoom, y: pdfZoomOrigin.y + (clientY - rect.top - pdfZoomOrigin.y) / currentZoom };
    setPdfZoomOrigin(origin);
    setPdfZoom(Math.min(4, Math.max(.5, nextZoom)));
  };
  const zoomPdfAtCenter = (factor: number) => {
    const body = pdfBody.current;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    zoomPdfAt(pdfZoom * factor, rect.left + body.clientWidth / 2, rect.top + body.clientHeight / 2);
  };
  const zoomPdfWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey) || !pdfPageShell.current) return;
    event.preventDefault();
    zoomPdfAt(pdfZoom * Math.exp(-event.deltaY * .0015), event.clientX, event.clientY);
  };
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!fullscreen) return;
      if (event.key === "Control" || event.key === "Meta") { ctrlHeld.current = true; return; }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.code === "Space") { event.preventDefault(); spaceHeldRef.current = true; setSpaceHeld(true); return; }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        const key = event.key.toLowerCase();
        if (!event.repeat && (key === "e" || key === "h")) {
          event.preventDefault();
          heldAnnotationKeys.current = heldAnnotationKeys.current.filter(item => item !== key);
          heldAnnotationKeys.current.push(key);
          setHeldAnnotationMode(key === "e" ? "eraser" : "highlight");
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.shiftKey) redoStroke(); else undoStroke();
      } else if (key === "y") {
        event.preventDefault();
        event.stopImmediatePropagation();
        redoStroke();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control" || event.key === "Meta") { ctrlHeld.current = false; return; }
      if (event.code === "Space") { spaceHeldRef.current = false; setSpaceHeld(false); return; }
      const key = event.key.toLowerCase();
      if (key !== "e" && key !== "h") return;
      heldAnnotationKeys.current = heldAnnotationKeys.current.filter(item => item !== key);
      const active = heldAnnotationKeys.current.at(-1);
      setHeldAnnotationMode(active === "e" ? "eraser" : active === "h" ? "highlight" : null);
    };
    const handleBlur = () => { ctrlHeld.current = false; spaceHeldRef.current = false; heldAnnotationKeys.current = []; setSpaceHeld(false); setHeldAnnotationMode(null); pdfZoomGesture.current = null; pdfPanGesture.current = null; };
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);
    return () => { window.removeEventListener("keydown", handleKeyDown, true); window.removeEventListener("keyup", handleKeyUp, true); window.removeEventListener("blur", handleBlur); handleBlur(); };
  }, [fullscreen]);
  const exportPdf = async () => {
    if (!pdfBytes) return;
    try {
      const pdfDocument = await PDFDocument.load(pdfBytes);
      for (const [pageKey, pageStrokes] of Object.entries(strokes)) {
        const pdfPage = pdfDocument.getPage(Number(pageKey) - 1); const size = dimensions.current[Number(pageKey)];
        if (!size) continue;
        for (const stroke of pageStrokes) for (let index = 1; index < stroke.points.length; index += 1) {
          const from = stroke.points[index - 1], to = stroke.points[index], [r, g, b] = colorParts(stroke.color);
          pdfPage.drawLine({ start: { x: from.x / size.width * size.pdfWidth, y: size.pdfHeight - from.y / size.height * size.pdfHeight }, end: { x: to.x / size.width * size.pdfWidth, y: size.pdfHeight - to.y / size.height * size.pdfHeight }, thickness: Math.max(.5, stroke.width / size.width * size.pdfWidth), color: rgb(r, g, b), opacity: stroke.tool === "highlight" ? .34 : 1 });
        }
      }
      const savedBytes = await pdfDocument.save();
      const blob = new Blob([new Uint8Array(savedBytes)], { type: "application/pdf" }); const url = URL.createObjectURL(blob); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `${source.name.replace(/\.pdf$/i, "")}-annotated.pdf`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      emitGuideAction("pdf:export");
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
              <div className="document-pdf-zoom-control" role="group" aria-label="PDF zoom">
                <button type="button" title={t("zoomOut")} aria-label={t("zoomOut")} onClick={() => zoomPdfAtCenter(.8)} disabled={pdfZoom <= .5}><Minus size={14}/></button>
                <span>{Math.round(pdfZoom * 100)}%</span>
                <button type="button" title={t("zoomIn")} aria-label={t("zoomIn")} onClick={() => zoomPdfAtCenter(1.25)} disabled={pdfZoom >= 4}><Plus size={14}/></button>
              </div>
              <label className="document-draw-toggle">
                <input type="checkbox" checked={drawing} disabled={!fullscreen && !dedicated} onChange={event => setDrawing(event.target.checked)} />
                <PenLine size={15} />
                {fullscreen || dedicated ? t("drawOnPdf") : t("pdfDrawFullscreenOnly")}
              </label>
              {drawing && (fullscreen || dedicated) && (
                <>
                  <div className="document-annotation-tools" role="toolbar" aria-label={t("pdfAnnotationTools")}>
                    <button type="button" className={annotationMode === "pen" ? "active" : ""} aria-pressed={annotationMode === "pen"} title={t("pdfPen")} onClick={() => chooseAnnotationMode("pen")}><PenLine size={14} /><span>{t("pdfPen")}</span></button>
                    <button type="button" className={annotationMode === "highlight" ? "active" : ""} aria-pressed={annotationMode === "highlight"} title={t("pdfHighlight")} onClick={() => chooseAnnotationMode("highlight")}><Highlighter size={14} /><span>{t("pdfHighlight")}</span></button>
                    <button type="button" className={annotationMode === "eraser" ? "active" : ""} aria-pressed={annotationMode === "eraser"} title={t("pdfEraser")} onClick={() => chooseAnnotationMode("eraser")}><Eraser size={14} /><span>{t("pdfEraser")}</span></button>
                  </div>
                  <input aria-label={t("penColor")} disabled={annotationMode === "eraser"} type="color" value={color} onChange={event => setColor(event.target.value)} />
                  <label className="document-width">
                    {annotationMode === "eraser" ? <Eraser size={13} /> : annotationMode === "highlight" ? <Highlighter size={13} /> : <PenLine size={13} />}
                    <input aria-label={annotationMode === "eraser" ? t("eraserSize") : t("penWidth")} type="range" min={annotationMode === "eraser" ? 8 : 1} max={annotationMode === "eraser" ? 48 : 16} value={annotationMode === "eraser" ? eraserSize : width} onChange={event => annotationMode === "eraser" ? setEraserSize(Number(event.target.value)) : setWidth(Number(event.target.value))} />
                  </label>
                  <button type="button" title={t("undoDrawing")} disabled={historyRevision >= 0 && !historyPast.current.length} onClick={undoStroke}><RotateCcw size={15} /></button>
                  <button type="button" title={t("redoDrawing")} disabled={historyRevision >= 0 && !historyFuture.current.length} onClick={redoStroke}><RotateCw size={15} /></button>
                  <button type="button" title={t("clearDrawing")} disabled={!strokesRef.current[page]?.length} onClick={clearPage}><Eraser size={15} /></button>
                </>
              )}
              <button className="primary-button" title={t("exportAnnotatedPdf")} onClick={() => void exportPdf()}>
                <Download size={15} />
                {t("exportPdf")}
              </button>
            </>
          )}
          <button className="document-fullscreen-toggle" title={fullscreen ? t("exitFullscreen") : t("maximizeCanvas")} onClick={() => void toggleFullscreen()}>
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          {onClose && <button title={t("close")} onClick={onClose}><X size={16} /></button>}
        </div>
      </header>
      {kind === "pdf" ? (
          <div ref={pdfBody} className={`document-pdf-body ${spaceHeld ? "pdf-hand-active" : ""}`} onWheel={zoomPdfWheel} onPointerDown={beginPdfPointer} onPointerMove={movePdfPointer} onPointerUp={finishPdfPointer} onPointerCancel={finishPdfPointer} style={{ touchAction: fullscreen ? "none" : "auto" }}>
          {loading && <div className="document-loading">Đang render PDF…</div>}
          {error && <div className="document-error">{error}</div>}
          {!loading && !error && (
            <>
              <div ref={pdfPageShell} className="pdf-page-shell">
                <div className="pdf-page-stack" style={{ transform: `scale(${pdfZoom})`, transformOrigin: `${pdfZoomOrigin.x}px ${pdfZoomOrigin.y}px` }}>
                <canvas ref={pageCanvas} />
                <canvas ref={annotationCanvas} className={`pdf-annotation-canvas annotation-${effectiveAnnotationMode} ${annotationActive ? "annotation-active" : "annotation-inactive"}`} style={{ pointerEvents: annotationActive ? "auto" : "none" }} onPointerDown={beginStroke} onPointerMove={moveStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke} onPointerLeave={() => { eraserCursor.current = null; redraw(page); }} />
                </div>
              </div>
              <div className="document-pager">
                <button disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} /></button>
                <span>{page} / {pageCount} · {Math.round(pdfZoom * 100)}%</span>
                <button disabled={page >= pageCount} onClick={() => setPage(value => value + 1)}><ChevronRight size={16} /></button>
              </div>
            </>
          )}
        </div>
      ) : <OfficeViewer source={source} onReady={() => onReady?.({ sessionId: viewerSessionId, documentId: source.id, kind })} />}
    </section>
  );
}
