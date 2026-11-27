import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { ArrowDown, ArrowUp, Download, FileText, ListOrdered, Plus, Trash2, Type } from "lucide-react";
import type { BoardState, CanvasPage, CanvasPaper } from "@mindcanvas/shared";
import CanvasBoard from "./CanvasBoard";
import Dialog from "./Dialog";
import { useLanguage } from "../lib/i18n";
import { readWheelDelta } from "../lib/canvasViewport";
import { sameBoardContent } from "../lib/boardEquality";
import {
  A4_FONT, A4_HEIGHT, A4_LINE, A4_LINES, A4_MARGIN, A4_MAX_PAGES, A4_TEXT_ADVANCE, A4_WIDTH,
  a4TextColumns, a4WritingArea, newA4Page, pageStride, projectA4Board, rearrangeA4Pages, ruledLines, unprojectA4Board, updateA4Text,
} from "../lib/a4Canvas";
import { a4PrintSvg, downloadA4Pdf, downloadA4PageImage } from "../lib/a4Pdf";

const INSET = 22;
const textKey = (page?: CanvasPage) => page ? `page:${page.id}` : "blank";
type Props = Omit<ComponentProps<typeof CanvasBoard>, "paperSurface">;

export default function A4CanvasEditor({ board, onChange, onDraftChange, readOnly = false, visibleToolIds, ...canvasProps }: Props) {
  const { t } = useLanguage();
  const layout = board.a4!;
  const stride = pageStride(layout);
  const container = useRef<HTMLDivElement>(null);
  const textInputs = useRef(new Map<string, HTMLTextAreaElement>());
  const focus = useRef<{ page: string; caret: number } | null>(null);
  const landing = useRef<{ pageId: string; top: number } | null>(null);
  const [focusedPage, setFocusedPage] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 760, height: 600 });
  const resizedPaper = useRef<{ width: number; scale: number } | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [typing, setTyping] = useState(true);
  const [composition, setComposition] = useState<{ page: string; text: string } | null>(null);
  const [jump, setJump] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [first, setFirst] = useState("1"), [last, setLast] = useState("1"), [preview, setPreview] = useState(1);
  const [previewSource, setPreviewSource] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const graphicId = "a4-" + useId().replace(/[^a-z0-9_-]/gi, "");
  const allowWriting = typing && !readOnly;
  const scale = zoom ?? Math.min(1, Math.max(.2, (size.width - INSET * 2) / A4_WIDTH));
  const stageWidth = Math.max(size.width, A4_WIDTH * scale + 2 * INSET);
  const paperLeft = (stageWidth - A4_WIDTH * scale) / 2;
  const phantom = layout.mode === "continuous" && layout.pages.length < A4_MAX_PAGES;
  const shownCount = layout.pages.length + Number(phantom);
  const totalHeight = ((shownCount - 1) * stride + A4_HEIGHT) * scale + 2 * INSET;
  const landed = landing.current?.top === position.top ? layout.pages.findIndex(page => page.id === landing.current?.pageId) : -1;
  const current = landed >= 0 ? landed : Math.max(0, Math.min(layout.pages.length - 1,
    Math.floor((position.top - INSET + Math.min(260, size.height * .35)) / (stride * scale))));
  const firstVisible = Math.max(0, Math.floor((position.top - INSET) / (stride * scale)) - 1);
  const lastVisible = Math.min(shownCount - 1, Math.ceil((position.top + size.height - INSET) / (stride * scale)) + 1);
  const visible = Array.from({ length: Math.max(0, lastVisible - firstVisible + 1) }, (_, i) => i + firstVisible);
  const activeTextIndex = focusedPage === "blank" ? (phantom ? layout.pages.length : -1)
    : focusedPage ? layout.pages.findIndex(page => textKey(page) === focusedPage) : -1;
  const shownText = activeTextIndex >= 0 && !visible.includes(activeTextIndex) ? [...visible, activeTextIndex].sort((a, b) => a - b) : visible;
  const art = useMemo(() => projectA4Board(board, board.viewport), [board]);
  const viewport = { scale, x: paperLeft - position.left, y: INSET - position.top };
  const presented = { ...art, viewport };


  useLayoutEffect(() => {
    const el = container.current; if (!el) return;
    const measure = () => setSize({ width: el.clientWidth || 760, height: el.clientHeight || 600 });
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);
  useEffect(() => {
    const el = container.current; if (!el) return;
    const scrollPaper = (event: WheelEvent) => {
      if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".inspector, .drawing-toolbar, .canvas-tools-sheet, .canvas-embed-body, .canvas-media video, .canvas-media audio, select, input[type=range]")) return;
      const delta = readWheelDelta(event);
      const horizontal = event.shiftKey || event.altKey;
      const dx = delta.x || (horizontal ? delta.y : 0);
      const dy = horizontal ? 0 : delta.y;
      if (!dx && !dy) return;
      // The sticky SVG/editor can consume native scrolling (especially over
      // a textarea or when an inline editor has focus). Move the paper scroller.
      event.preventDefault();
      el.scrollLeft += dx;
      el.scrollTop += dy;
      onScroll(el);
    };
    el.addEventListener("wheel", scrollPaper, { passive: false });
    return () => el.removeEventListener("wheel", scrollPaper);
  }, []);

  useLayoutEffect(() => {
    const el = container.current;
    const previous = resizedPaper.current;
    resizedPaper.current = { width: size.width, scale };
    if (!el || !previous || previous.width === size.width || previous.scale === scale || jump !== null) return;
    // Auto-fit changes paper coordinates. Preserve the line at the top of the reader.
    const savedTop = position.top;
    el.scrollTop = savedTop < INSET ? savedTop : INSET + (savedTop - INSET) * scale / previous.scale;
    if (landing.current) landing.current = { ...landing.current, top: el.scrollTop };
    setPosition({ left: el.scrollLeft, top: el.scrollTop });
  }, [size.width, scale, jump]);

  useLayoutEffect(() => {
    if (jump === null || !container.current) return;
    const index = layout.pages.findIndex(page => page.id === jump);
    if (index < 0) { setJump(null); return; }
    container.current.scrollTop = index * stride * scale;
    landing.current = { pageId: jump, top: container.current.scrollTop };
    setPosition({ left: container.current.scrollLeft, top: container.current.scrollTop });
    setJump(null);
  }, [jump, stride, scale, layout.pages]);

  useLayoutEffect(() => {
    const next = focus.current;
    if (!allowWriting || !next) return;
    const field = textInputs.current.get(next.page);
    if (!field) return;
    focus.current = null;
    field.focus({ preventScroll: true });
    field.setSelectionRange(next.caret, next.caret);
  });

  const viewPage = (index: number) => {
    const page = layout.pages[index];
    if (!page) return;
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement && container.current?.contains(active) && active.dataset.pageId !== page.id) active.blur();
    setJump(page.id);
  };
  const onScroll = (el: HTMLDivElement) => {
    if (landing.current && el.scrollTop !== landing.current.top) landing.current = null;
    setPosition({ left: el.scrollLeft, top: el.scrollTop });
  };
  const nav = (next: BoardState) => {
    const el = container.current; if (!el) return;
    const nextZoom = Math.max(.2, Math.min(2.5, next.viewport.scale));
    const nextWidth = Math.max(size.width, A4_WIDTH * nextZoom + 2 * INSET);
    const top = Math.max(0, INSET - next.viewport.y);
    const left = Math.max(0, (nextWidth - A4_WIDTH * nextZoom) / 2 - next.viewport.x);
    if (Math.abs(nextZoom - scale) > .0001) setZoom(nextZoom);
    setPosition({ left, top });
    requestAnimationFrame(() => { el.scrollLeft = left; el.scrollTop = top; onScroll(el); });
  };
  const applyCanvas = (next: BoardState) => {
    // CanvasBoard has other ways to zoom/navigate (trackpad, zoom controls,
    // hand, stylus). These operate on the paper viewport, not project data.
    if (sameBoardContent(presented, next)) {
      if (next.viewport.x !== viewport.x || next.viewport.y !== viewport.y || next.viewport.scale !== viewport.scale) nav(next);
      return;
    }
    if (readOnly) return;
    const state = unprojectA4Board(board, presented, next, phantom);
    if (!sameBoardContent(board, state)) onChange(state);
  };
  const setLayout = (patch: Partial<NonNullable<BoardState["a4"]>>) => {
    if (!readOnly) onChange({ ...board, a4: { ...layout, ...patch } });
  };
  const addPage = () => {
    if (readOnly || layout.pages.length >= A4_MAX_PAGES) return;
    const pages = [...layout.pages];
    const at = layout.mode === "continuous" ? pages.length : current + 1;
    const page = newA4Page();
    pages.splice(at, 0, page);
    // Explicit insert starts a separate text section on the following page.
    if (pages[at + 1]?.flows) pages[at + 1] = { ...pages[at + 1], flows: undefined };
    onChange(rearrangeA4Pages(board, pages, false)); setJump(page.id);
  };
  const movePage = (direction: -1 | 1) => {
    const to = current + direction;
    if (readOnly || to < 0 || to >= layout.pages.length) return;
    const pages = [...layout.pages];
    pages.splice(to, 0, pages.splice(current, 1)[0]);
    onChange(rearrangeA4Pages(board, pages)); setJump(pages[to].id);
  };
  const deletePage = () => {
    if (readOnly || layout.pages.length < 2) return;
    const pages = layout.pages.filter((_, index) => index !== current);
    onChange(rearrangeA4Pages(board, pages));
    setJump(pages[Math.min(current, pages.length - 1)].id); setDeleteOpen(false);
  };
  const write = (index: number, text: string, caret: number) => {
    if (readOnly || (!layout.pages[index] && !text)) return;
    const next = updateA4Text(layout, index, text, caret);
    if (!next) { setError(t("a4Limit")); return; }
    setError("");
    const reflowed = next.inserted ? rearrangeA4Pages(board, next.pages, false) : { ...board, a4: { ...layout, pages: next.pages } };
    if (!sameBoardContent(board, reflowed)) onChange(reflowed);
    if (next.caretPage !== index || !layout.pages[index]) {
      focus.current = { page: textKey(next.pages[next.caretPage]), caret: next.caret };
      if (next.caretPage !== index) setJump(next.pages[next.caretPage].id);
    }
  };

  const takePdf = async () => {
    if (progress) return;
    const from = Number(first), to = Number(last);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > layout.pages.length) { setError(t("a4RangeError")); return; }
    setError(""); setProgress(from);
    try { await downloadA4Pdf(board, from, to, setProgress); setPdfOpen(false); }
    catch { setError(t("a4PdfError")); }
    finally { setProgress(0); }
  };
  useEffect(() => {
    if (!pdfOpen) { setPreviewSource(""); return; }
    const svg = a4PrintSvg(board, Math.min(preview, layout.pages.length) - 1);
    if (typeof URL.createObjectURL !== "function") {
      setPreviewSource(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      return;
    }
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    setPreviewSource(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfOpen, board, preview, layout.pages.length]);

  const rows = useMemo(() => new Map(visible.map(index => [index, ruledLines(layout.pages[index]?.text ?? "").slice(0, A4_LINES)])), [layout.pages, firstVisible, lastVisible]);
  const paper = (index: number) => {
    const top = stride * index;
    const background = typeof board.background === "object" ? board.background : null;
    return <g key={layout.pages[index]?.id ?? "next"} pointerEvents="none" data-a4-sheet={index + 1}>
      <rect x={0} y={top} width={A4_WIDTH} height={A4_HEIGHT} fill="#fff" stroke={layout.mode === "separate" ? "#94a3b8" : undefined} strokeWidth={1.5}/>
      {background?.kind === "image" && <image href={background.src} x={0} y={top} width={A4_WIDTH} height={A4_HEIGHT}
        preserveAspectRatio={background.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"} opacity={background.opacity ?? 1}
        clipPath={`url(#${graphicId})`} style={{ filter: `blur(${background.blur ?? 0}px) brightness(${background.brightness ?? 1})` }}/>}
      {layout.mode === "continuous" && index > 0 && <path d={`M0 ${top}H${A4_WIDTH}`} fill="none" stroke="#97aaba" strokeDasharray="5 6"/>}
      {layout.paper !== "plain" && Array.from({ length: A4_LINES + 1 }, (_, i) => <line key={i} x1={A4_MARGIN} x2={A4_WIDTH - A4_MARGIN}
        y1={top + A4_MARGIN + A4_LINE * i} y2={top + A4_MARGIN + A4_LINE * i} stroke="#d9e5ef"/>)}
      {layout.paper === "grid" && Array.from({ length: Math.floor((A4_WIDTH - 2 * A4_MARGIN) / A4_LINE) + 1 }, (_, i) => <line key={i}
        x1={A4_MARGIN + A4_LINE * i} x2={A4_MARGIN + A4_LINE * i} y1={top + A4_MARGIN} y2={top + A4_MARGIN + A4_LINES * A4_LINE} stroke="#d9e5ef"/>)}
      {!allowWriting && <g fill="#172033" fontFamily="monospace" fontSize={A4_FONT} xmlSpace="preserve">{rows.get(index)?.map((line, i) =>
        line.display && <text key={i} x={A4_MARGIN} y={top + A4_MARGIN + A4_LINE * i + 19}
          textLength={Math.max(1, a4TextColumns(line.display)) * A4_TEXT_ADVANCE} lengthAdjust="spacingAndGlyphs">{line.display}</text>
      )}</g>}
    </g>;
  };

  return <section className={`a4-workspace ${canvasProps.isFullscreen ? "a4-fullscreen" : ""}`} aria-label={t("canvasA4")}>
    <header className="a4-command">
      <span className="project-a4-badge">A4</span>
      <label>{t("a4Layout")} <select disabled={readOnly} value={layout.mode} onChange={event => {
        setJump(layout.pages[current].id); setLayout({ mode: event.target.value as typeof layout.mode });
      }}><option value="separate">{t("a4Separate")}</option><option value="continuous">{t("a4Continuous")}</option></select></label>
      <label>{t("a4Paper")} <select disabled={readOnly} value={layout.paper} onChange={event => setLayout({ paper: event.target.value as CanvasPaper })}>
        <option value="plain">{t("a4Plain")}</option><option value="ruled">{t("a4Ruled")}</option><option value="grid">{t("a4Grid")}</option></select></label>
      {!readOnly && <button type="button" className="secondary-button" aria-pressed={allowWriting} onClick={() => { setTyping(value => !value); setComposition(null); }}><Type size={15}/>{t("a4Write")}</button>}
      {!readOnly && <button type="button" className="secondary-button" disabled={layout.pages.length >= A4_MAX_PAGES} onClick={addPage}><Plus size={16}/>{t("a4AddPage")}</button>}
      <button type="button" className="primary-button" onClick={() => {
        setFirst("1"); setLast(String(layout.pages.length)); setPreview(current + 1); setError(""); setPdfOpen(true);
      }}><Download size={15}/>{t("a4DownloadPdf")}</button>
    </header>
    <div className="a4-page-actions">
      <label>{t("page")} <select value={current} onChange={event => viewPage(Number(event.target.value))}>
        {layout.pages.map((page, index) => <option key={page.id} value={index}>{index + 1} / {layout.pages.length}</option>)}
      </select></label>
      <button type="button" className="icon-button" disabled={current === 0} aria-label={t("a4PreviousPage")} title={t("a4PreviousPage")} onClick={() => viewPage(current - 1)}><ArrowUp size={17}/></button>
      <button type="button" className="icon-button" disabled={current >= layout.pages.length - 1} aria-label={t("a4NextPage")} title={t("a4NextPage")} onClick={() => viewPage(current + 1)}><ArrowDown size={17}/></button>
      {!readOnly && layout.mode === "separate" && <>
        <button type="button" className="icon-button" disabled={layout.pages.length === 1} aria-label={t("a4ReorderPages")} title={t("a4ReorderPages")}
          onClick={() => setArranging(true)}><ListOrdered size={17}/></button>
        <button type="button" className="icon-button" disabled={layout.pages.length === 1} aria-label={t("a4DeletePage")} title={t("a4DeletePage")} onClick={() => setDeleteOpen(true)}><Trash2 size={17}/></button>
      </>}
      <button type="button" className="secondary-button" onClick={() => { setZoom(null); setJump(layout.pages[current].id); }}>{t("a4FitWidth")}</button>
      {allowWriting && <span className="a4-writing-hint">{t("a4WriteHint")}</span>}
    </div>
    {error && !pdfOpen && <p className="form-error" role="alert">{error}</p>}
    <div className={`a4-scroll ${allowWriting ? "a4-writing" : ""} ${readOnly ? "a4-viewer" : ""}`} ref={container} onScroll={event => onScroll(event.currentTarget)} aria-label={t("a4Scroll")}>
      <div className="a4-scroll-track" style={{ width: stageWidth, height: Math.max(size.height, totalHeight) }}>
        <div className="a4-stage" style={{ width: size.width, height: size.height }}>
          <CanvasBoard {...canvasProps} board={presented} readOnly={readOnly} visibleToolIds={visibleToolIds}
            paperSurface={{
              clip: graphicId,
              nativeScroll: allowWriting || readOnly,
              onToolChosen: () => { setTyping(false); setComposition(null); },
              artwork: <><defs><clipPath id={graphicId}>{visible.map(index => <rect key={index} x={0} y={index * stride} width={A4_WIDTH} height={A4_HEIGHT}/>)}</clipPath></defs>{visible.map(paper)}</>,
              liveClip: <defs><clipPath id={graphicId + "-live"}>{visible.map(index => <rect key={index} x={viewport.x} y={viewport.y + index * stride * scale} width={A4_WIDTH * scale} height={A4_HEIGHT * scale}/>)}</clipPath></defs>,
              contains: point => point.x >= 0 && point.x <= A4_WIDTH && point.y >= 0 && point.y < shownCount * stride && point.y % stride < A4_HEIGHT,
              overlay: view => allowWriting ? <div className="a4-text-overlay">{shownText.map(index => {
                const page = layout.pages[index];
                const key = textKey(page);
                return <textarea
                  key={key}
                  ref={field => { if (field) textInputs.current.set(key, field); else textInputs.current.delete(key); }}
                  className="a4-page-text"
                  data-page-id={page?.id}
                  aria-label={`${t("a4Write")} · ${t("page")} ${index + 1}`}
                  maxLength={40000}
                  wrap="soft"
                  value={composition?.page === key ? composition.text : page?.text ?? ""}
                  style={a4WritingArea(index, stride, view)}
                  onPointerDown={event => event.stopPropagation()}
                  onFocus={() => setFocusedPage(key)}
                  onBlur={() => setFocusedPage(value => value === key ? null : value)}
                  onCompositionStart={event => setComposition({ page: key, text: event.currentTarget.value })}
                  onCompositionEnd={event => { setComposition(null); write(index, event.currentTarget.value, event.currentTarget.selectionStart); }}
                  onChange={event => {
                    if (composition?.page === key || (event.nativeEvent as InputEvent).isComposing) setComposition({ page: key, text: event.currentTarget.value });
                    else write(index, event.currentTarget.value, event.currentTarget.selectionStart);
                  }}
                  onKeyDown={event => {
                    if (event.nativeEvent.isComposing) return;
                    if (event.key === "Backspace" && index > 0 && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0) {
                      event.preventDefault();
                      const previous = layout.pages[index - 1];
                      focus.current = { page: textKey(previous), caret: previous.text.length };
                      viewPage(index - 1);
                    }
                  }}
                  placeholder={index === 0 && !page?.text ? t("a4StartTyping") : undefined}
                />;
              })}</div> : null,
            }}
            onChange={applyCanvas} onDraftChange={readOnly || !onDraftChange ? undefined : next => onDraftChange(unprojectA4Board(board, presented, next, phantom))}
            onViewportChange={nav}/>
        </div>
      </div>
    </div>
    {arranging && <Dialog title={t("a4ReorderPages")} onClose={() => setArranging(false)}>
      <p>{t("a4ReorderHint", { page: current + 1 })}</p>
      <footer className="actions">
        <button type="button" className="secondary-button" disabled={current === 0} onClick={() => { movePage(-1); setArranging(false); }}><ArrowUp size={17}/>{t("a4MoveEarlier")}</button>
        <button type="button" className="secondary-button" disabled={current >= layout.pages.length - 1} onClick={() => { movePage(1); setArranging(false); }}><ArrowDown size={17}/>{t("a4MoveLater")}</button>
      </footer>
    </Dialog>}
    {deleteOpen && <Dialog title={t("a4DeletePage")} onClose={() => setDeleteOpen(false)}>
      <p>{t("a4DeleteConfirm", { page: current + 1 })}</p>
      <footer className="actions"><button type="button" className="secondary-button" onClick={() => setDeleteOpen(false)}>{t("cancel")}</button><button type="button" className="danger-button" onClick={deletePage}>{t("a4DeletePage")}</button></footer>
    </Dialog>}
    {pdfOpen && <Dialog workspace title={t("a4PreviewPdf")} onClose={() => setPdfOpen(false)} dismissible={!progress}
      footer={<footer className="actions"><button type="button" className="secondary-button" disabled={!!progress} onClick={() => setPdfOpen(false)}>{t("cancel")}</button>
        <button type="button" className="primary-button" disabled={!!progress} onClick={() => void takePdf()}><Download size={16}/>{t("a4DownloadPdf")}</button></footer>}>
      <div className="a4-pdf-fields"><label>{t("a4From")}<input type="number" min={1} max={layout.pages.length} value={first} disabled={!!progress} onChange={event => setFirst(event.target.value)}/></label>
        <label>{t("a4To")}<input type="number" min={1} max={layout.pages.length} value={last} disabled={!!progress} onChange={event => setLast(event.target.value)}/></label>
        <label>{t("a4PreviewPage")}<select value={Math.min(preview, layout.pages.length)} disabled={!!progress} onChange={event => setPreview(Number(event.target.value))}>
          {layout.pages.map((page, index) => <option key={page.id} value={index + 1}>{index + 1}</option>)}</select></label></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="a4-preview-exports">
        {(["svg", "png"] as const).map(format => <button key={format} type="button" className="secondary-button" disabled={!!progress}
          onClick={() => void downloadA4PageImage(board, Math.min(preview, layout.pages.length) - 1, format).catch(() => setError(t("error")))}>
          {t(format === "svg" ? "exportSvg" : "exportPng")}
        </button>)}
      </div>
      {!!progress && <p role="status">{t("a4Rendering", { page: progress })}</p>}
      <div className="a4-pdf-preview"><FileText size={15}/>{previewSource && <img alt={t("a4PreviewPdf")} src={previewSource}/>}</div>
    </Dialog>}
  </section>;
}
