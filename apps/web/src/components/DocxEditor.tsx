import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Download,
  FilePlus2,
  FileText,
  Fullscreen,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Minus,
  MoreHorizontal,
  Palette,
  PanelTop,
  Paintbrush2,
  Plus,
  Redo2,
  Save,
  Search,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  Type,
  Underline,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { UploadedDocument } from "../lib/documentStore";
import { saveDocument } from "../lib/documentStore";
import {
  buildDocxPackage,
  DEFAULT_PAGE,
  importDocx,
  modelFromHtml,
  modelToHtml,
  type DocxAlignment,
  type DocxBlock,
  type DocxDocument,
  type DocxParagraph,
  type DocxParagraphStyle,
  type DocxRun,
} from "../lib/docxModel";
import { deleteDocxDraft, readDocxDraft, writeDocxDraft } from "../lib/docxDraftStore";
import { emitGuideAction } from "../lib/featureGuides";

type Props = { owner: string | null; source: UploadedDocument | null; onSaved: () => void };
type RibbonTab = "home" | "insert" | "layout" | "view";
type ViewMode = "pages" | "continuous";
type SaveState = "editing" | "saving" | "saved" | "failed";
type MarkName = "bold" | "italic" | "underline" | "strike" | "superscript" | "subscript";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const FONT_OPTIONS = ["Arial", "Calibri", "Times New Roman", "Cambria", "Inter", "Verdana", "Courier New"];
const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
const MARK_TAG: Record<MarkName, string> = { bold: "strong", italic: "em", underline: "u", strike: "s", superscript: "sup", subscript: "sub" };

function bytesFromDataUrl(dataUrl: string) {
  const raw = dataUrl.split(",", 2)[1] ?? "";
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function dataUrlFromBase64(base64: string) {
  return `data:${DOCX_MIME};base64,${base64}`;
}

function downloadDataUrl(dataUrl: string, name: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = name;
  link.click();
}

function cloneModel(model: DocxDocument): DocxDocument {
  return JSON.parse(JSON.stringify(model)) as DocxDocument;
}

function currentBlocks(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > blockquote, :scope > ul, :scope > ol, :scope > table, :scope > figure, :scope > img, :scope > [data-page-break]"));
}

function blockAncestors(range: Range, root: HTMLElement) {
  const all = currentBlocks(root);
  const candidates = new Set<HTMLElement>();
  const start = (range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement) as HTMLElement | null;
  const end = (range.endContainer instanceof HTMLElement ? range.endContainer : range.endContainer.parentElement) as HTMLElement | null;
  for (const node of [start, end]) {
    let cursor = node;
    while (cursor && cursor !== root) {
      if (all.includes(cursor)) candidates.add(cursor);
      cursor = cursor.parentElement;
    }
  }
  for (const block of all) {
    try {
      if (range.intersectsNode(block)) candidates.add(block);
    } catch { /* A detached node is ignored. */ }
  }
  return [...candidates];
}

function selectionRange(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !root.contains(selection.anchorNode)) return null;
  return selection.getRangeAt(0).cloneRange();
}

function restoreRange(range: Range | null) {
  if (!range) return;
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectionText(root: HTMLElement) {
  const range = selectionRange(root);
  return range?.toString() ?? "";
}

function setCaretAfter(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  restoreRange(range);
}

function nearestParagraph(node: Node | null, root: HTMLElement) {
  let cursor = node instanceof Element ? node : node?.parentElement ?? null;
  while (cursor && cursor !== root) {
    if (/^(P|H[1-6]|BLOCKQUOTE|LI)$/i.test(cursor.tagName)) return cursor;
    cursor = cursor.parentElement;
  }
  return null;
}

function nearestTableCell(node: Node | null, root: HTMLElement) {
  let cursor = node instanceof Element ? node : node?.parentElement ?? null;
  while (cursor && cursor !== root) {
    if (cursor instanceof HTMLTableCellElement) return cursor;
    cursor = cursor.parentElement;
  }
  return null;
}

function nearestImage(node: Node | null, root: HTMLElement) {
  let cursor = node instanceof Element ? node : node?.parentElement ?? null;
  while (cursor && cursor !== root) {
    if (cursor instanceof HTMLImageElement) return cursor;
    const image = cursor.querySelector("img[data-docx-image]");
    if (image instanceof HTMLImageElement) return image;
    cursor = cursor.parentElement;
  }
  return null;
}

function setSelectionText(root: HTMLElement, text: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const index = node.data.indexOf(text);
    if (index >= 0 && text) {
      const range = document.createRange();
      range.setStart(node, index); range.setEnd(node, index + text.length); restoreRange(range); return range;
    }
  }
  return null;
}

function sanitizeHref(value: string) {
  const url = value.trim();
  if (!url) return "";
  try {
    const parsed = new URL(url, window.location.origin);
    if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) return "";
    return parsed.href;
  } catch { return ""; }
}

function findTextInModel(model: DocxDocument, query: string) {
  if (!query.trim()) return 0;
  const normalized = query.toLocaleLowerCase();
  let count = 0;
  const visit = (blocks: DocxBlock[]) => {
    blocks.forEach(block => {
      if (block.type === "paragraph") {
        count += block.runs.reduce((sum, run) => sum + (run.text.toLocaleLowerCase().split(normalized).length - 1), 0);
      } else if (block.type === "table") block.rows.forEach(row => row.cells.forEach(cell => visit(cell.blocks)));
    });
  };
  visit(model.blocks);
  return count;
}

function mergePage(model: DocxDocument, next: DocxDocument): DocxDocument {
  return { ...next, page: model.page, header: model.header, footer: model.footer, warnings: model.warnings };
}

function paragraphFromElement(element: HTMLElement): DocxParagraph | null {
  const model = modelFromHtml(element.outerHTML);
  return model.blocks.find((block): block is DocxParagraph => block.type === "paragraph") ?? null;
}

function selectedInlineMark(root: HTMLElement, mark: MarkName, savedRange?: Range | null) {
  const selection = window.getSelection();
  const anchorNode = selection?.anchorNode && root.contains(selection.anchorNode) ? selection.anchorNode : savedRange?.startContainer;
  if (!anchorNode) return false;
  let cursor: Node | null = anchorNode;
  while (cursor && cursor !== root) {
    if (cursor instanceof HTMLElement && (cursor.tagName.toLowerCase() === MARK_TAG[mark] || cursor.style.fontWeight === "700" && mark === "bold" || cursor.style.fontStyle === "italic" && mark === "italic")) return true;
    cursor = cursor.parentNode;
  }
  return false;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocxEditor({ owner, source, onSaved }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const modelRef = useRef<DocxDocument>({ schemaVersion: 1, blocks: [{ type: "paragraph", style: "Normal", runs: [{ text: "" }] }], page: cloneModel({ schemaVersion: 1, blocks: [], page: DEFAULT_PAGE, warnings: [] }).page, warnings: [] });
  const historyRef = useRef<{ past: DocxDocument[]; future: DocxDocument[] }>({ past: [], future: [] });
  const lastDraftRef = useRef<DocxDocument | null>(null);
  const renderPendingRef = useRef(false);
  const dirtyRef = useRef(false);
  const [model, setModel] = useState<DocxDocument>(modelRef.current);
  const [loading, setLoading] = useState(Boolean(source));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("editing");
  const [warnings, setWarnings] = useState<DocxDocument["warnings"]>([]);
  const [draftCandidate, setDraftCandidate] = useState<{ model: DocxDocument; savedAt: string; stale: boolean } | null>(null);
  const [tab, setTab] = useState<RibbonTab>("home");
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [viewMode, setViewMode] = useState<ViewMode>("pages");
  const [showRuler, setShowRuler] = useState(true);
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [replaceCount, setReplaceCount] = useState(0);
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontSize, setFontSize] = useState(12);
  const [textColor, setTextColor] = useState("#1f2937");
  const [highlight, setHighlight] = useState("#fff2a8");
  const [linkUrl, setLinkUrl] = useState("");
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const [fullscreen, setFullscreen] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [workingDocumentId, setWorkingDocumentId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [workingName, setWorkingName] = useState("");
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [selectionWordCount, setSelectionWordCount] = useState(0);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<{ fontFamily?: string; fontSize?: string; color?: string; backgroundColor?: string; style: DocxParagraphStyle } | null>(null);

  const sourceId = source?.id ?? "new";
  const sourceName = source?.name ?? "Tài liệu DOCX mới.docx";
  const baseName = (workingName || sourceName).replace(/\.docx$/i, "");

  const setEditorHtml = useCallback((next: DocxDocument) => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = modelToHtml(next);
    if (headerRef.current) headerRef.current.innerHTML = next.header?.length ? modelToHtml({ ...next, blocks: next.header }) : "";
    if (footerRef.current) footerRef.current.innerHTML = next.footer?.length ? modelToHtml({ ...next, blocks: next.footer }) : "";
    renderPendingRef.current = false;
    setPageCount(Math.max(1, Math.ceil(editorRef.current.scrollHeight / (viewMode === "pages" ? 1122 : 900))));
  }, [viewMode]);

  const captureSelection = useCallback(() => {
    if (!editorRef.current) return;
    const range = selectionRange(editorRef.current);
    if (range) {
      selectionRef.current = range;
      setSelectionWordCount(range.toString().trim().split(/\s+/).filter(Boolean).length);
      setSelectionVersion(value => value + 1);
    }
  }, []);

  const currentSelection = useCallback((root: HTMLElement) => selectionRange(root) ?? (selectionRef.current && root.contains(selectionRef.current.startContainer) ? selectionRef.current.cloneRange() : null), []);

  const selectedBlockStyle = useMemo<DocxParagraphStyle>(() => {
    void selectionVersion;
    const root = editorRef.current;
    const range = root ? currentSelection(root) : null;
    let element = range?.startContainer instanceof Element ? range.startContainer : range?.startContainer.parentElement;
    while (element && element !== root) {
      const explicit = element.getAttribute("data-docx-style");
      if (explicit && /^(Normal|Title|Subtitle|Quote|Heading[1-6])$/.test(explicit)) return explicit as DocxParagraphStyle;
      const heading = element.tagName.match(/^H([1-6])$/i);
      if (heading) return `Heading${heading[1]}` as DocxParagraphStyle;
      if (element.tagName === "BLOCKQUOTE") return "Quote";
      element = element.parentElement;
    }
    return "Normal";
  }, [currentSelection, selectionVersion]);

  const tableContext = useMemo(() => {
    const root = editorRef.current;
    const range = root ? currentSelection(root) : null;
    const cell = root && range ? nearestTableCell(range.startContainer, root) : null;
    if (!range || !cell || !(cell.parentElement instanceof HTMLTableRowElement) || !(cell.closest("table") instanceof HTMLTableElement)) return null;
    return { cell, row: cell.parentElement, table: cell.closest("table") as HTMLTableElement, range };
  }, [currentSelection, model, selectionVersion]);
  const imageContext = useMemo(() => {
    const root = editorRef.current;
    const range = root ? currentSelection(root) : null;
    const image = (selectedImage && root?.contains(selectedImage) ? selectedImage : null)
      ?? (root && range ? nearestImage(range.startContainer, root) : null);
    return image ? { image, range } : null;
  }, [currentSelection, model, selectedImage, selectionVersion]);

  useEffect(() => {
    if (!renderPendingRef.current || loading || !editorRef.current) return;
    setEditorHtml(modelRef.current);
  }, [loading, model, setEditorHtml]);

  const commit = useCallback((next: DocxDocument, options: { render?: boolean; action?: string } = {}) => {
    const previous = cloneModel(modelRef.current);
    historyRef.current.past = [...historyRef.current.past.slice(-49), previous];
    historyRef.current.future = [];
    modelRef.current = next;
    setModel(next);
    if (options.render !== false) renderPendingRef.current = true;
    dirtyRef.current = true;
    setSaveState("editing");
    if (options.action) emitGuideAction(options.action, { documentId: sourceId });
  }, [sourceId]);

  const syncFromDom = useCallback((action?: string) => {
    if (!editorRef.current) return;
    const next = mergePage(modelRef.current, modelFromHtml(editorRef.current.innerHTML));
    commit(next, { render: false, action });
  }, [commit]);

  const syncPageRegion = useCallback((region: "header" | "footer", element: HTMLDivElement) => {
    const blocks = modelFromHtml(element.innerHTML).blocks;
    commit({ ...modelRef.current, [region]: blocks }, { render: false, action: "docx:layout" });
  }, [commit]);

  useEffect(() => {
    let alive = true;
    setLoading(Boolean(source));
    setError(""); setNotice(""); setWarnings([]); setDraftCandidate(null); setWorkingDocumentId(null); setWorkingName(source?.name ?? "");
    setSelectedImage(null); setSelectionWordCount(0); selectionRef.current = null;
    historyRef.current = { past: [], future: [] };
    if (!source) {
      const fresh: DocxDocument = { schemaVersion: 1, blocks: [{ type: "paragraph", style: "Normal", runs: [{ text: "" }] }], page: cloneModel({ schemaVersion: 1, blocks: [], page: DEFAULT_PAGE, warnings: [] }).page, warnings: [] };
      modelRef.current = fresh; setModel(fresh); renderPendingRef.current = true; setLoading(false); return () => { alive = false; };
    }
    void (async () => {
      try {
        const imported = await importDocx(bytesFromDataUrl(source.dataUrl));
        if (!alive) return;
        setWarnings(imported.warnings);
        modelRef.current = imported; setModel(imported); renderPendingRef.current = true;
        const draft = await readDocxDraft(owner, source.id);
        if (!alive) return;
        if (draft && draft.baseUpdatedAt === source.updatedAt) {
          lastDraftRef.current = draft.model;
          setDraftCandidate({ model: draft.model, savedAt: draft.savedAt, stale: false });
        } else if (draft) {
          setDraftCandidate({ model: draft.model, savedAt: draft.savedAt, stale: true });
        }
        emitGuideAction("docx:open", { documentId: source.id });
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "Không thể đọc DOCX hợp lệ.");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [owner, source?.dataUrl, source?.id, source?.updatedAt]);

  useEffect(() => {
    if (!source || loading || !dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      void writeDocxDraft(owner, source.id, source.updatedAt, modelRef.current).catch(() => setSaveState("failed"));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [model, owner, source, loading]);

  useEffect(() => {
    const measure = () => {
      if (editorRef.current) setPageCount(Math.max(1, Math.ceil(editorRef.current.scrollHeight / (viewMode === "pages" ? 1122 : 900))));
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" && editorRef.current ? new ResizeObserver(measure) : null;
    if (observer && editorRef.current) observer.observe(editorRef.current);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [loading, model, viewMode, zoom]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  const performUndo = useCallback(() => {
    const previous = historyRef.current.past.pop();
    if (!previous) return;
    historyRef.current.future.unshift(cloneModel(modelRef.current));
    modelRef.current = previous; setModel(previous); renderPendingRef.current = true; dirtyRef.current = true; setSaveState("editing");
    emitGuideAction("docx:undo", { documentId: sourceId });
  }, [sourceId]);

  const performRedo = useCallback(() => {
    const next = historyRef.current.future.shift();
    if (!next) return;
    historyRef.current.past.push(cloneModel(modelRef.current));
    modelRef.current = next; setModel(next); renderPendingRef.current = true; dirtyRef.current = true; setSaveState("editing");
    emitGuideAction("docx:redo", { documentId: sourceId });
  }, [sourceId]);

  const withSelection = useCallback((fn: (range: Range, root: HTMLElement) => void, action = "docx:format") => {
    const root = editorRef.current;
    const range = root ? currentSelection(root) : null;
    if (!root || !range) return;
    const saved = range.cloneRange();
    selectionRef.current = saved;
    fn(range, root);
    syncFromDom(action);
    window.setTimeout(() => restoreRange(saved), 0);
  }, [currentSelection, syncFromDom]);

  const applyMark = useCallback((mark: MarkName) => {
    withSelection((range) => {
      const wrapper = document.createElement(MARK_TAG[mark]);
      if (range.collapsed) {
        wrapper.appendChild(document.createTextNode("\u200b"));
        range.insertNode(wrapper);
        const caret = document.createRange(); caret.setStart(wrapper.firstChild!, 1); caret.collapse(true); restoreRange(caret);
      } else {
        try { wrapper.appendChild(range.extractContents()); range.insertNode(wrapper); setCaretAfter(wrapper); }
        catch {
          const text = range.toString();
          if (text) { wrapper.textContent = text; range.deleteContents(); range.insertNode(wrapper); setCaretAfter(wrapper); }
        }
      }
    });
  }, [withSelection]);

  const applyInlineStyle = useCallback((style: string, value: string) => {
    withSelection((range) => {
      const wrapper = document.createElement("span"); wrapper.style.setProperty(style, value);
      if (range.collapsed) { wrapper.appendChild(document.createTextNode("\u200b")); range.insertNode(wrapper); const caret = document.createRange(); caret.setStart(wrapper.firstChild!, 1); caret.collapse(true); restoreRange(caret); }
      else { wrapper.appendChild(range.extractContents()); range.insertNode(wrapper); setCaretAfter(wrapper); }
    });
  }, [withSelection]);

  const copyFormatting = useCallback(() => {
    const root = editorRef.current;
    const range = root ? currentSelection(root) : null;
    if (!root || !range) return;
    const node = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const source = node instanceof HTMLElement ? node : node?.parentElement;
    if (!source) return;
    const computed = window.getComputedStyle(source);
    setCopiedFormat({ fontFamily: computed.fontFamily, fontSize: computed.fontSize, color: computed.color, backgroundColor: computed.backgroundColor, style: selectedBlockStyle });
    setNotice("Đã sao chép định dạng. Chọn vùng khác rồi bấm lại nút để áp dụng.");
  }, [currentSelection, selectedBlockStyle]);

  const applyCopiedFormatting = useCallback(() => {
    if (!copiedFormat) return;
    withSelection((range) => {
      const wrapper = document.createElement("span");
      if (copiedFormat.fontFamily) wrapper.style.fontFamily = copiedFormat.fontFamily;
      if (copiedFormat.fontSize) wrapper.style.fontSize = copiedFormat.fontSize;
      if (copiedFormat.color) wrapper.style.color = copiedFormat.color;
      if (copiedFormat.backgroundColor && copiedFormat.backgroundColor !== "rgba(0, 0, 0, 0)") wrapper.style.backgroundColor = copiedFormat.backgroundColor;
      if (!range.collapsed) { wrapper.appendChild(range.extractContents()); range.insertNode(wrapper); setCaretAfter(wrapper); }
    }, "docx:format");
  }, [copiedFormat, withSelection]);

  const clearFormatting = useCallback(() => {
    withSelection((range) => {
      if (range.collapsed) return;
      const fragment = range.extractContents();
      fragment.querySelectorAll("*").forEach(element => {
        if (element.tagName === "BR") return;
        const parent = element.parentNode;
        if (!parent) return;
        while (element.firstChild) parent.insertBefore(element.firstChild, element);
        element.remove();
      });
      range.insertNode(fragment);
      range.collapse(false);
      restoreRange(range);
    }, "docx:format");
  }, [withSelection]);

  const applyBlock = useCallback((style: DocxParagraphStyle) => {
    const root = editorRef.current; const range = root ? currentSelection(root) : null;
    if (!root || !range) return;
    const blocks = blockAncestors(range, root).filter(node => /^(P|H[1-6]|BLOCKQUOTE)$/i.test(node.tagName));
    const headingLevel = style.match(/^Heading([1-6])$/)?.[1];
    const tag = style === "Title" ? "h1" : style === "Subtitle" ? "h2" : style === "Quote" ? "blockquote" : headingLevel ? `h${headingLevel}` : "p";
    blocks.forEach(block => {
      const replacement = document.createElement(tag);
      for (const attribute of Array.from(block.attributes)) if (attribute.name !== "data-docx-style") replacement.setAttribute(attribute.name, attribute.value);
      replacement.dataset.docxStyle = style;
      while (block.firstChild) replacement.appendChild(block.firstChild);
      block.replaceWith(replacement);
    });
    syncFromDom("docx:format");
  }, [currentSelection, syncFromDom]);

  const setAlignment = useCallback((align: DocxAlignment) => {
    const root = editorRef.current; const range = root ? currentSelection(root) : null;
    if (!root || !range) return;
    blockAncestors(range, root).filter(node => /^(P|H[1-6]|BLOCKQUOTE)$/i.test(node.tagName)).forEach(node => { node.style.textAlign = align; });
    syncFromDom("docx:format");
  }, [currentSelection, syncFromDom]);

  const toggleList = useCallback((kind: "bullet" | "number") => {
    const root = editorRef.current; const range = root ? currentSelection(root) : null;
    if (!root || !range) return;
    const blocks = blockAncestors(range, root).filter(node => /^(P|H[1-6]|BLOCKQUOTE)$/i.test(node.tagName));
    if (!blocks.length) return;
    const existing = blocks[0].parentElement?.tagName.toLowerCase();
    if (existing === (kind === "number" ? "ol" : "ul")) {
      blocks.forEach(block => {
        const list = block.parentElement;
        if (!list) return;
        list.parentElement?.insertBefore(block, list);
        if (!list.children.length) list.remove();
      });
    } else {
      const list = document.createElement(kind === "number" ? "ol" : "ul"); list.dataset.docxListLevel = "0";
      const first = blocks[0]; first.parentElement?.insertBefore(list, first);
      blocks.forEach(block => { const item = document.createElement("li"); item.dataset.docxStyle = block.dataset.docxStyle || "Normal"; while (block.firstChild) item.appendChild(block.firstChild); block.remove(); list.appendChild(item); });
    }
    syncFromDom("docx:format");
  }, [currentSelection, syncFromDom]);

  const changeIndent = useCallback((delta: number) => {
    const root = editorRef.current;
    const range = root ? currentSelection(root) : null;
    if (!root || !range) return;
    blockAncestors(range, root).filter(node => /^(P|H[1-6]|BLOCKQUOTE)$/i.test(node.tagName)).forEach(node => {
      const current = Number.parseFloat(node.style.marginLeft || "0") || 0;
      node.style.marginLeft = `${Math.max(0, current + delta)}cm`;
    });
    syncFromDom("docx:format");
  }, [currentSelection, syncFromDom]);

  const insertTable = useCallback(() => {
    const root = editorRef.current; const range = root ? currentSelection(root) : null;
    if (!root || !range) return;
    const table = document.createElement("table"); table.dataset.docxTable = "true";
    const tbody = document.createElement("tbody"); table.appendChild(tbody);
    for (let rowIndex = 0; rowIndex < tableRows; rowIndex += 1) {
      const row = document.createElement("tr");
      for (let columnIndex = 0; columnIndex < tableColumns; columnIndex += 1) { const cell = document.createElement(rowIndex === 0 ? "th" : "td"); cell.textContent = rowIndex === 0 ? `Cột ${columnIndex + 1}` : ""; row.appendChild(cell); }
      tbody.appendChild(row);
    }
    const paragraph = nearestParagraph(range.startContainer, root);
    if (paragraph) paragraph.parentElement?.insertBefore(table, paragraph.nextSibling); else range.insertNode(table);
    syncFromDom("docx:table");
    setCaretAfter(table);
  }, [syncFromDom, tableColumns, tableRows]);

  const mutateTable = useCallback((mutator: (context: { cell: HTMLTableCellElement; row: HTMLTableRowElement; table: HTMLTableElement; range: Range }) => void) => {
    if (!tableContext) return;
    mutator(tableContext);
    syncFromDom("docx:table");
    captureSelection();
  }, [captureSelection, syncFromDom, tableContext]);

  const addTableRow = useCallback(() => mutateTable(({ row, table }) => {
    const clone = row.cloneNode(true) as HTMLTableRowElement;
    clone.querySelectorAll("th,td").forEach(cell => { if (cell instanceof HTMLElement) cell.textContent = ""; });
    row.parentElement?.insertBefore(clone, row.nextSibling);
    void table;
  }), [mutateTable]);

  const deleteTableRow = useCallback(() => mutateTable(({ row, table }) => {
    if (table.rows.length <= 1) { if (window.confirm("Bảng chỉ còn một hàng. Xóa bảng?")) table.remove(); return; }
    row.remove();
  }), [mutateTable]);

  const addTableColumn = useCallback(() => mutateTable(({ cell, table }) => {
    const columnIndex = cell.cellIndex;
    Array.from(table.rows).forEach(row => {
      const source = row.cells[columnIndex];
      const next = document.createElement(row.cells[0]?.tagName.toLowerCase() === "th" ? "th" : "td");
      next.textContent = "";
      row.insertBefore(next, row.cells[columnIndex + 1] ?? null);
      void source;
    });
  }), [mutateTable]);

  const deleteTableColumn = useCallback(() => mutateTable(({ cell, table }) => {
    if (table.rows[0]?.cells.length <= 1) { if (window.confirm("Bảng chỉ còn một cột. Xóa bảng?")) table.remove(); return; }
    const columnIndex = cell.cellIndex;
    Array.from(table.rows).forEach(row => row.cells[columnIndex]?.remove());
  }), [mutateTable]);

  const removeTable = useCallback(() => mutateTable(({ table }) => {
    if (window.confirm("Xóa bảng khỏi tài liệu?")) table.remove();
  }), [mutateTable]);

  const mergeTableCells = useCallback(() => {
    if (!tableContext?.range) return;
    const cells = Array.from(tableContext.table.querySelectorAll<HTMLTableCellElement>("th,td")).filter(cell => {
      try { return tableContext.range.intersectsNode(cell); } catch { return false; }
    });
    if (cells.length < 2) { setError("Hãy chọn ít nhất hai ô trong cùng một hàng để gộp."); return; }
    if (new Set(cells.map(cell => cell.parentElement)).size !== 1) { setError("Chỉ gộp các ô trong cùng một hàng ở phiên bản này."); return; }
    const first = cells[0];
    cells.slice(1).forEach(cell => { while (cell.firstChild) first.appendChild(cell.firstChild); cell.remove(); });
    first.colSpan = cells.reduce((sum, cell) => sum + Math.max(1, cell.colSpan), 0);
    syncFromDom("docx:table");
    captureSelection();
  }, [captureSelection, syncFromDom, tableContext]);

  const splitTableCell = useCallback(() => mutateTable(({ cell }) => {
    if (cell.colSpan <= 1) { setError("Ô này không có cột đã gộp để tách."); return; }
    const span = cell.colSpan;
    cell.colSpan = 1;
    for (let index = 1; index < span; index += 1) {
      const sibling = document.createElement(cell.tagName.toLowerCase());
      cell.parentElement?.insertBefore(sibling, cell.nextSibling);
    }
  }), [mutateTable]);

  const setTableHeader = useCallback(() => mutateTable(({ row }) => {
    Array.from(row.cells).forEach(cell => {
      if (cell.tagName.toLowerCase() === "th") return;
      const replacement = document.createElement("th");
      for (const attribute of Array.from(cell.attributes)) replacement.setAttribute(attribute.name, attribute.value);
      while (cell.firstChild) replacement.appendChild(cell.firstChild);
      cell.replaceWith(replacement);
    });
  }), [mutateTable]);

  const insertPageBreak = useCallback(() => {
    const root = editorRef.current; const range = root ? currentSelection(root) : null;
    if (!root || !range) return;
    const marker = document.createElement("div"); marker.dataset.pageBreak = "true"; marker.className = "docx-page-break"; marker.contentEditable = "false"; marker.innerHTML = "<span>Ngắt trang</span>";
    const paragraph = nearestParagraph(range.startContainer, root);
    if (paragraph) paragraph.parentElement?.insertBefore(marker, paragraph.nextSibling); else range.insertNode(marker);
    syncFromDom("docx:page-break");
  }, [currentSelection, syncFromDom]);

  const insertLink = useCallback(() => {
    const url = sanitizeHref(linkUrl);
    if (!url) { setError("Hãy nhập URL http, https hoặc mailto hợp lệ."); return; }
    withSelection((range) => {
      const anchor = document.createElement("a"); anchor.href = url; anchor.dataset.docxLink = "true"; anchor.target = "_blank"; anchor.rel = "noreferrer";
      anchor.textContent = range.toString() || url;
      range.deleteContents(); range.insertNode(anchor); setCaretAfter(anchor);
    }, "docx:link");
    setLinkUrl("");
  }, [linkUrl, withSelection]);

  const insertSymbol = useCallback((symbol: string) => {
    withSelection((range) => {
      range.deleteContents();
      const text = document.createTextNode(symbol);
      range.insertNode(text);
      setCaretAfter(text);
    }, "docx:text");
  }, [withSelection]);

  const insertImage = useCallback(async (file?: File) => {
    if (!file || !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) { setError("Ảnh phải là định dạng được trình duyệt đọc và không vượt quá 10 MB."); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Không đọc được ảnh.")); reader.onerror = () => reject(reader.error ?? new Error("Không đọc được ảnh.")); reader.readAsDataURL(file); });
    const root = editorRef.current; const range = root ? currentSelection(root) : null;
    if (!root || !range) return;
    const figure = document.createElement("figure"); figure.dataset.docxImageBlock = "true";
    const image = document.createElement("img"); image.dataset.docxImage = "true"; image.src = dataUrl; image.alt = file.name; image.style.maxWidth = "100%"; figure.appendChild(image);
    const paragraph = nearestParagraph(range.startContainer, root);
    if (paragraph) paragraph.parentElement?.insertBefore(figure, paragraph.nextSibling); else range.insertNode(figure);
    syncFromDom("docx:image");
  }, [currentSelection, syncFromDom]);

  const mutateImage = useCallback((mutator: (image: HTMLImageElement) => void) => {
    if (!imageContext) return;
    mutator(imageContext.image);
    setSelectedImage(imageContext.image);
    syncFromDom("docx:image");
    setSelectionVersion(value => value + 1);
  }, [imageContext, syncFromDom]);

  const resizeImage = useCallback((dimension: "width" | "height", value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    mutateImage(image => {
      const currentWidth = Number(image.getAttribute("width")) || image.naturalWidth || image.getBoundingClientRect().width;
      const currentHeight = Number(image.getAttribute("height")) || image.naturalHeight || image.getBoundingClientRect().height;
      const ratio = currentWidth > 0 && currentHeight > 0 ? currentHeight / currentWidth : 1;
      if (dimension === "width") {
        image.setAttribute("width", String(Math.round(value)));
        image.setAttribute("height", String(Math.max(1, Math.round(value * ratio))));
      } else {
        image.setAttribute("height", String(Math.round(value)));
        image.setAttribute("width", String(Math.max(1, Math.round(value / ratio))));
      }
    });
  }, [mutateImage]);

  const deleteImage = useCallback(() => {
    if (!imageContext) return;
    const target = imageContext.image.closest("figure") ?? imageContext.image;
    target.remove();
    setSelectedImage(null);
    syncFromDom("docx:image");
  }, [imageContext, syncFromDom]);

  const replaceImage = useCallback(async (file?: File) => {
    if (!file || !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      setError("Ảnh thay thế phải là định dạng được trình duyệt đọc và không vượt quá 10 MB.");
      return;
    }
    if (!imageContext) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Không đọc được ảnh."));
      reader.onerror = () => reject(reader.error ?? new Error("Không đọc được ảnh."));
      reader.readAsDataURL(file);
    });
    imageContext.image.src = dataUrl;
    imageContext.image.alt = file.name;
    imageContext.image.removeAttribute("width");
    imageContext.image.removeAttribute("height");
    syncFromDom("docx:image");
    setSelectionVersion(value => value + 1);
  }, [imageContext, syncFromDom]);

  const replaceAll = useCallback(() => {
    if (!findQuery.trim() || !editorRef.current) return;
    let count = 0;
    const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) nodes.push(node);
    nodes.forEach(textNode => { const occurrences = textNode.data.split(findQuery).length - 1; if (occurrences) { count += occurrences; textNode.data = textNode.data.split(findQuery).join(replaceQuery); } });
    setReplaceCount(count); if (count) syncFromDom("docx:replace");
  }, [findQuery, replaceQuery, syncFromDom]);

  const replaceNext = useCallback(() => {
    if (!findQuery.trim() || !editorRef.current) return;
    const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const index = node.data.toLocaleLowerCase().indexOf(findQuery.toLocaleLowerCase());
      if (index < 0) continue;
      node.replaceData(index, findQuery.length, replaceQuery);
      setReplaceCount(1);
      syncFromDom("docx:replace");
      return;
    }
  }, [findQuery, replaceQuery, syncFromDom]);

  const saveCurrent = useCallback(async (asCopy = false) => {
    if (!modelRef.current) return;
    setSaveState("saving"); setError(""); setNotice("");
    try {
      const base = baseName || "Tài liệu DOCX";
      const name = asCopy || !workingDocumentId ? `${base} — bản sửa.docx` : `${base}.docx`;
      const base64 = await buildDocxPackage(modelRef.current);
      const dataUrl = dataUrlFromBase64(base64);
      const saved = await saveDocument(owner, { id: asCopy || !workingDocumentId ? undefined : workingDocumentId, name, mimeType: DOCX_MIME, kind: "docx", size: Math.ceil((dataUrl.length * 3) / 4), dataUrl, folderId: source?.folderId ?? null });
      setWorkingDocumentId(saved.id); setWorkingName(saved.name); dirtyRef.current = false; setSaveState("saved");
      await deleteDocxDraft(owner, sourceId).catch(() => undefined);
      onSaved(); emitGuideAction("docx:save", { documentId: sourceId, savedDocumentId: saved.id });
      setNotice(asCopy ? "Đã tạo bản sao DOCX. Bản gốc vẫn được giữ." : "Đã lưu trên thiết bị. Bản gốc vẫn được giữ.");
    } catch (cause) { setSaveState("failed"); setError(cause instanceof Error ? cause.message : "Không thể lưu DOCX."); }
  }, [baseName, onSaved, owner, source, sourceId, workingDocumentId]);

  const exportCurrent = useCallback(async () => {
    setSaveState("saving"); setError("");
    try {
      const base64 = await buildDocxPackage(modelRef.current);
      const name = `${baseName || "Tài liệu DOCX"}.docx`;
      downloadDataUrl(dataUrlFromBase64(base64), name); setSaveState(dirtyRef.current ? "editing" : "saved"); setNotice("Đã xuất DOCX hợp lệ. Bản gốc không bị ghi đè."); emitGuideAction("docx:export", { documentId: sourceId });
    } catch (cause) { setSaveState("failed"); setError(cause instanceof Error ? cause.message : "Không thể xuất DOCX."); }
  }, [baseName, sourceId]);

  const toggleFullscreen = useCallback(() => {
    const panel = editorRef.current?.closest(".docx-editor-panel");
    if (!document.fullscreenElement && panel instanceof HTMLElement) void panel.requestFullscreen?.();
    else if (document.fullscreenElement) void document.exitFullscreen?.();
  }, []);

  const applyPage = useCallback((patch: Partial<DocxDocument["page"]> | { margins: Partial<DocxDocument["page"]["margins"]> }) => {
    const nextPage = "margins" in patch && Object.keys(patch).length === 1 ? { ...modelRef.current.page, margins: { ...modelRef.current.page.margins, ...patch.margins } } : { ...modelRef.current.page, ...(patch as Partial<DocxDocument["page"]>) };
    commit({ ...modelRef.current, page: nextPage }, { render: false, action: "docx:layout" });
  }, [commit]);

  const displayedStatus = saveState === "saving" ? "Đang lưu…" : saveState === "saved" ? "Đã lưu trên thiết bị" : saveState === "failed" ? "Lưu thất bại — nội dung vẫn được giữ" : "Đang sửa";
  const wordCount = useMemo(() => model.blocks.reduce((total, block) => block.type === "paragraph" ? total + block.runs.reduce((sum, run) => sum + run.text.trim().split(/\s+/).filter(Boolean).length, 0) : total, 0), [model]);
  const findCount = useMemo(() => findTextInModel(model, findQuery), [findQuery, model]);

  const onEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveCurrent(false); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) performRedo(); else performUndo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); performRedo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); setShowFind(true); return; }
    if (event.key === "Tab" && event.target instanceof HTMLTableCellElement) {
      event.preventDefault();
      const root = editorRef.current;
      const range = root ? currentSelection(root) : null;
      if (root && range) { range.deleteContents(); range.insertNode(document.createTextNode("\t")); setCaretAfter(event.target); syncFromDom("docx:text"); }
    }
  };

  const renderRibbon = () => {
    if (tab === "insert") return <div className="docx-ribbon-groups">
      <div className="docx-ribbon-group"><button data-docx-action="insert-table" className="docx-ribbon-action" onClick={insertTable}><Table2/><span>Bảng</span></button><label className="docx-inline-number">Hàng<input type="number" min={1} max={20} value={tableRows} onChange={e => setTableRows(Math.max(1, Number(e.target.value) || 1))}/></label><label className="docx-inline-number">Cột<input type="number" min={1} max={12} value={tableColumns} onChange={e => setTableColumns(Math.max(1, Number(e.target.value) || 1))}/></label><small>Chèn bảng thực</small></div>
      {tableContext && <div className="docx-ribbon-group docx-table-context" aria-label="Công cụ bảng"><button className="docx-ribbon-action compact" onClick={addTableRow}>+ hàng</button><button className="docx-ribbon-action compact" onClick={deleteTableRow}>− hàng</button><button className="docx-ribbon-action compact" onClick={addTableColumn}>+ cột</button><button className="docx-ribbon-action compact" onClick={deleteTableColumn}>− cột</button><button className="docx-ribbon-action compact" onClick={mergeTableCells}>Gộp ô</button><button className="docx-ribbon-action compact" onClick={splitTableCell}>Tách ô</button><button className="docx-ribbon-action compact" onClick={removeTable}>Xóa bảng</button><button className="docx-ribbon-action compact" onClick={setTableHeader}>Hàng tiêu đề</button><label title="Màu nền ô"><span>Nền</span><input type="color" defaultValue="#ffffff" onChange={event => mutateTable(({ cell }) => { cell.style.backgroundColor = event.target.value; })}/></label><label title="Căn ngang ô"><span>Căn</span><select defaultValue="left" onChange={event => mutateTable(({ cell }) => { cell.style.textAlign = event.target.value; })}><option value="left">Trái</option><option value="center">Giữa</option><option value="right">Phải</option></select></label><small>Ô đang chọn</small></div>}
      {imageContext && <div className="docx-ribbon-group docx-image-context" aria-label="Công cụ ảnh"><label>Rộng<input type="number" min={1} max={2000} value={Math.round(Number(imageContext.image.getAttribute("width")) || imageContext.image.naturalWidth || 0)} onChange={event => resizeImage("width", Number(event.target.value))}/></label><label>Cao<input type="number" min={1} max={2000} value={Math.round(Number(imageContext.image.getAttribute("height")) || imageContext.image.naturalHeight || 0)} onChange={event => resizeImage("height", Number(event.target.value))}/></label><label className="docx-image-alt">Alt text<input value={imageContext.image.alt} onChange={event => mutateImage(image => { image.alt = event.target.value; })}/></label><label title="Căn ảnh inline">Căn<select value={imageContext.image.closest("figure")?.style.textAlign || "center"} onChange={event => mutateImage(image => { const figure = image.closest("figure"); if (figure) figure.style.textAlign = event.target.value; })}><option value="left">Trái</option><option value="center">Giữa</option><option value="right">Phải</option></select></label><button className="docx-ribbon-action compact" onClick={() => replaceImageInputRef.current?.click()}>Thay ảnh</button><input ref={replaceImageInputRef} hidden type="file" accept="image/*" onChange={event => { void replaceImage(event.target.files?.[0]); event.currentTarget.value = ""; }}/><button className="docx-ribbon-action compact" onClick={deleteImage}>Xóa ảnh</button><small>Ảnh đang chọn</small></div>}
      <div className="docx-ribbon-group"><button className="docx-ribbon-action" onClick={() => imageInputRef.current?.click()}><ImagePlus/><span>Ảnh</span></button><input ref={imageInputRef} hidden type="file" accept="image/*" onChange={e => { void insertImage(e.target.files?.[0]); e.currentTarget.value = ""; }}/><button className="docx-ribbon-action" onClick={insertPageBreak}><FilePlus2/><span>Ngắt trang</span></button></div>
      <div className="docx-ribbon-group docx-link-group"><label><Link2 size={15}/><input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" aria-label="Địa chỉ liên kết"/></label><button className="docx-ribbon-action compact" onClick={insertLink}>Chèn liên kết</button><div className="docx-symbols" aria-label="Ký tự thường dùng">{["→", "⇌", "±", "×", "÷", "°", "α", "β"].map(symbol => <button key={symbol} className="docx-symbol-button" title={`Chèn ${symbol}`} onClick={() => insertSymbol(symbol)}>{symbol}</button>)}</div></div>
    </div>;
    if (tab === "layout") return <div className="docx-ribbon-groups">
      <div className="docx-ribbon-group"><label className="docx-ribbon-field">Khổ giấy<select value={model.page.size} onChange={e => applyPage({ size: e.target.value as DocxDocument["page"]["size"] })}><option value="A4">A4</option><option value="Letter">Letter</option></select></label><label className="docx-ribbon-field">Hướng<select value={model.page.orientation} onChange={e => applyPage({ orientation: e.target.value as DocxDocument["page"]["orientation"] })}><option value="portrait">Dọc</option><option value="landscape">Ngang</option></select></label></div>
      <div className="docx-ribbon-group docx-margin-group"><strong>Lề (cm)</strong>{(["top", "right", "bottom", "left"] as const).map(edge => <label key={edge}><span>{edge === "top" ? "Trên" : edge === "right" ? "Phải" : edge === "bottom" ? "Dưới" : "Trái"}</span><input type="number" step="0.1" min="0" max="8" value={model.page.margins[edge]} onChange={e => applyPage({ margins: { [edge]: Number(e.target.value) || 0 } })}/></label>)}</div>
      <div className="docx-ribbon-group"><button className="docx-ribbon-action" onClick={() => applyPage({ margins: { top: model.page.margins.top + 0.25, bottom: model.page.margins.bottom + 0.25 } })}><PanelTop/><span>Khoảng cách<br/>header/footer</span></button></div>
    </div>;
    if (tab === "view") return <div className="docx-ribbon-groups"><div className="docx-ribbon-group"><label className="docx-check-field"><input type="checkbox" checked={showRuler} onChange={e => setShowRuler(e.target.checked)}/> Thước ngang</label><label className="docx-check-field"><input type="checkbox" checked={viewMode === "continuous"} onChange={e => setViewMode(e.target.checked ? "continuous" : "pages")}/> Trang liên tục</label></div><div className="docx-ribbon-group"><button className="docx-ribbon-action" onClick={() => setZoom(value => Math.max(50, value - 10))}><ZoomOut/><span>Thu nhỏ</span></button><output className="docx-zoom-output">{zoom}%</output><button className="docx-ribbon-action" onClick={() => setZoom(value => Math.min(200, value + 10))}><ZoomIn/><span>Phóng to</span></button></div><div className="docx-ribbon-group"><button className="docx-ribbon-action" onClick={toggleFullscreen}><Fullscreen/><span>Toàn màn hình</span></button></div></div>;
    return <div className="docx-ribbon-groups">
      <div className="docx-ribbon-group docx-style-group"><label>Kiểu đoạn<select value={selectedBlockStyle} onChange={e => applyBlock(e.target.value as DocxParagraphStyle)}><option value="Normal">Đoạn văn</option><option value="Title">Title</option><option value="Subtitle">Subtitle</option><option value="Heading1">Heading 1</option><option value="Heading2">Heading 2</option><option value="Heading3">Heading 3</option><option value="Heading4">Heading 4</option><option value="Heading5">Heading 5</option><option value="Heading6">Heading 6</option><option value="Quote">Trích dẫn</option></select></label></div>
      <div className="docx-ribbon-group docx-font-group"><label>Font<select value={fontFamily} onChange={e => { setFontFamily(e.target.value); applyInlineStyle("font-family", e.target.value); }}>{FONT_OPTIONS.map(font => <option key={font}>{font}</option>)}</select></label><label>Cỡ<input type="number" min={1} max={200} step={0.5} value={fontSize} onChange={e => { const next = Number(e.target.value) || 12; setFontSize(next); applyInlineStyle("font-size", `${next}pt`); }}/></label><button title="Giảm cỡ chữ" onClick={() => { const next = Math.max(1, fontSize - 1); setFontSize(next); applyInlineStyle("font-size", `${next}pt`); }}><Minus/></button><button title="Tăng cỡ chữ" onClick={() => { const next = Math.min(200, fontSize + 1); setFontSize(next); applyInlineStyle("font-size", `${next}pt`); }}><Plus/></button></div>
      <div className="docx-ribbon-group docx-mark-group">{(["bold", "italic", "underline", "strike", "superscript", "subscript"] as MarkName[]).map(mark => <button key={mark} className={selectedInlineMark(editorRef.current ?? document.body, mark, selectionRef.current) ? "active" : ""} title={mark} onClick={() => applyMark(mark)}>{mark === "bold" ? <Bold/> : mark === "italic" ? <Italic/> : mark === "underline" ? <Underline/> : mark === "strike" ? <Strikethrough/> : mark === "superscript" ? <Superscript/> : <Subscript/>}</button>)}<label title="Màu chữ"><Type/><input type="color" value={textColor} onChange={e => { setTextColor(e.target.value); applyInlineStyle("color", e.target.value); }}/></label><label title="Highlight"><Palette/><input type="color" value={highlight} onChange={e => { setHighlight(e.target.value); applyInlineStyle("background-color", e.target.value); }}/></label><button title="Sao chép định dạng" onClick={copiedFormat ? applyCopiedFormatting : copyFormatting}><Paintbrush2/></button><button title="Xóa định dạng" onClick={clearFormatting}>Tx</button></div>
      <div className="docx-ribbon-group docx-align-group">{(["left", "center", "right", "justify"] as DocxAlignment[]).map(align => <button key={align} title={align} onClick={() => setAlignment(align)}>{align === "left" ? <AlignLeft/> : align === "center" ? <AlignCenter/> : align === "right" ? <AlignRight/> : <AlignJustify/>}</button>)}<button title="Danh sách dấu đầu dòng" onClick={() => toggleList("bullet")}><List/></button><button title="Danh sách đánh số" onClick={() => toggleList("number")}><ListOrdered/></button><button title="Giảm thụt lề" onClick={() => changeIndent(-0.5)}><IndentDecrease/></button><button title="Tăng thụt lề" onClick={() => changeIndent(0.5)}><IndentIncrease/></button></div>
      <div className="docx-ribbon-group"><button className="docx-ribbon-action" onClick={() => setShowFind(true)}><Search/><span>Tìm và thay thế</span></button><button className="docx-ribbon-action" onClick={() => { const text = selectionText(editorRef.current ?? document.body); if (text && navigator.clipboard) void navigator.clipboard.writeText(text); }}><Copy/><span>Sao chép</span></button></div>
    </div>;
  };

  return <section className={`docx-editor-panel ${fullscreen ? "docx-editor-fullscreen" : ""}`} data-docx-editor="true" data-document-id={sourceId}>
    <header className="docx-editor-topbar"><div className="docx-editor-title"><FileText size={19}/><div>{renaming ? <input autoFocus value={workingName} onChange={e => setWorkingName(e.target.value)} onBlur={() => setRenaming(false)} onKeyDown={e => { if (e.key === "Enter") setRenaming(false); if (e.key === "Escape") { setWorkingName(sourceName); setRenaming(false); } }} /> : <button className="docx-title-button" title={workingName || sourceName} onDoubleClick={() => setRenaming(true)} onClick={() => setRenaming(true)}>{workingName || sourceName}</button>}<small>DOCX · {formatBytes(source?.size ?? 0)}</small></div></div><div className="docx-editor-status"><span className={`docx-save-state ${saveState}`}>{saveState === "saved" && <Check size={13}/>} {displayedStatus}</span><button title="Hoàn tác" disabled={!historyRef.current.past.length} onClick={performUndo}><Undo2/></button><button title="Làm lại" disabled={!historyRef.current.future.length} onClick={performRedo}><Redo2/></button><button data-docx-action="save" className="secondary-button" disabled={loading || saveState === "saving"} onClick={() => void saveCurrent(false)}><Save size={15}/>Lưu</button><button data-docx-action="save-copy" className="secondary-button docx-save-copy-button" disabled={loading || saveState === "saving"} onClick={() => void saveCurrent(true)}><Copy size={15}/>Lưu bản sao</button><button data-docx-action="export" className="primary-button" disabled={loading || saveState === "saving"} onClick={() => void exportCurrent()}><Download size={15}/>Xuất DOCX</button><button className="icon-button" title="Toàn màn hình" onClick={toggleFullscreen}>{fullscreen ? <Maximize2/> : <Fullscreen/>}</button><button className="icon-button docx-header-more" title="Thêm thao tác" aria-label="Thêm thao tác" aria-expanded={showHeaderMenu} onClick={() => setShowHeaderMenu(value => !value)}><MoreHorizontal/></button>{showHeaderMenu && <div className="docx-header-menu" role="menu"><button role="menuitem" data-docx-action="save-copy" disabled={loading || saveState === "saving"} onClick={() => { setShowHeaderMenu(false); void saveCurrent(true); }}><Copy size={14}/>Lưu bản sao</button></div>}</div></header>
    <nav className="docx-ribbon-tabs" aria-label="Công cụ DOCX">{(["home", "insert", "layout", "view"] as RibbonTab[]).map(item => <button key={item} className={tab === item ? "active" : ""} onClick={() => { setTab(item); setRibbonCollapsed(false); }}>{item === "home" ? "Trang đầu" : item === "insert" ? "Chèn" : item === "layout" ? "Bố cục" : "Xem"}</button>)}<button className={`docx-ribbon-collapse ${ribbonCollapsed ? "collapsed" : ""}`} title={ribbonCollapsed ? "Mở ribbon" : "Thu gọn ribbon"} aria-label={ribbonCollapsed ? "Mở ribbon" : "Thu gọn ribbon"} aria-expanded={!ribbonCollapsed} onClick={() => setRibbonCollapsed(value => !value)}><ChevronDown/></button></nav>
    {!ribbonCollapsed && <div className="docx-ribbon" role="toolbar" aria-label={`Ribbon ${tab}`} onMouseDown={captureSelection}>{renderRibbon()}</div>}
    {showFind && <div className="docx-findbar"><Search size={16}/><input autoFocus value={findQuery} onChange={e => setFindQuery(e.target.value)} placeholder="Tìm trong tài liệu…"/><span>{findCount} kết quả</span><input value={replaceQuery} onChange={e => setReplaceQuery(e.target.value)} placeholder="Thay thế bằng…"/><button onClick={replaceNext}>Thay một</button><button onClick={replaceAll}>Thay tất cả</button><button className="icon-button" onClick={() => setShowFind(false)}>×</button>{replaceCount > 0 && <small>Đã thay {replaceCount}</small>}</div>}
    {warnings.length > 0 && <details className="docx-compatibility"><summary>Một số định dạng nâng cao chưa được giữ nguyên; bản gốc vẫn được bảo toàn.</summary><ul>{warnings.map(warning => <li key={`${warning.code}-${warning.detail ?? ""}`}>{warning.message}{warning.detail ? ` (${warning.detail})` : ""}</li>)}</ul></details>}
    {notice && <div className="docx-editor-notice" role="status">{notice}</div>}
    {error && <div className="form-error docx-editor-error" role="alert">{error}</div>}
    {draftCandidate && <div className="docx-draft-choice" role="dialog"><div><strong>{draftCandidate.stale ? "Có bản nháp cũ hơn bản gốc" : "Đã tìm thấy bản nháp trên thiết bị"}</strong><span>{draftCandidate.stale ? "Bản gốc đã thay đổi; hãy xem lại trước khi lưu." : ""} · {new Date(draftCandidate.savedAt).toLocaleString("vi-VN")}</span></div><button onClick={() => { modelRef.current = draftCandidate.model; setModel(draftCandidate.model); renderPendingRef.current = true; dirtyRef.current = true; setDraftCandidate(null); setNotice("Đã khôi phục bản nháp DOCX; bản gốc vẫn được bảo toàn."); }}>Khôi phục bản nháp</button><button className="text-button" onClick={() => { setDraftCandidate(null); void deleteDocxDraft(owner, sourceId); }}>Mở bản hiện tại</button></div>}
    {loading ? <div className="document-loading">Đang đọc cấu trúc DOCX…</div> : <div className={`docx-editor-viewport ${viewMode === "continuous" ? "continuous" : "paged"}`}><div className="docx-editor-scroll"><div className="docx-paper-stage" style={{ "--docx-zoom": zoom / 100 } as React.CSSProperties}>{showRuler && <div className="docx-ruler" aria-label="Thước ngang"><span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span><span>12</span><span>14</span><span>16</span><span>18</span><span>20</span></div>}<div className="docx-page-stack"><div ref={headerRef} className="docx-page-header" data-docx-region="header" contentEditable suppressContentEditableWarning data-placeholder="Đầu trang" onInput={event => syncPageRegion("header", event.currentTarget)}/><div ref={editorRef} className="docx-editable" contentEditable suppressContentEditableWarning onInput={() => { syncFromDom("docx:text"); }} onPaste={event => { const imageItem = [...event.clipboardData.items].find(item => item.type.startsWith("image/")); if (imageItem) { event.preventDefault(); void insertImage(imageItem.getAsFile() ?? undefined); } }} onKeyDown={onEditorKeyDown} onClick={event => { const target = event.target; if (target instanceof HTMLImageElement && target.dataset.docxImage === "true") { setSelectedImage(target); setSelectionWordCount(0); setSelectionVersion(value => value + 1); } else setSelectedImage(null); }} onFocus={() => { captureSelection(); emitGuideAction("docx:focus", { documentId: sourceId }); }} onMouseUp={event => { if (!(event.target instanceof HTMLImageElement)) captureSelection(); emitGuideAction("docx:selection", { documentId: sourceId }); }} onKeyUp={() => { captureSelection(); emitGuideAction("docx:selection", { documentId: sourceId }); }}/><div ref={footerRef} className="docx-page-footer" data-docx-region="footer" contentEditable suppressContentEditableWarning data-placeholder="Chân trang" onInput={event => syncPageRegion("footer", event.currentTarget)}/></div></div></div></div>}
    <footer className="docx-statusbar"><span>Trang 1/{pageCount}</span><span>{selectionWordCount ? `${selectionWordCount} từ được chọn` : `${wordCount} từ`}</span><span>Tiếng Việt / English</span><span className="docx-status-spacer"/><button onClick={() => setZoom(value => Math.max(50, value - 10))}><ZoomOut size={14}/></button><span>{zoom}%</span><button onClick={() => setZoom(value => Math.min(200, value + 10))}><ZoomIn size={14}/></button><button onClick={() => setViewMode("continuous")}>Vừa chiều rộng</button><button onClick={() => setViewMode("pages")}>Vừa trang</button></footer>
  </section>;
}

export { modelFromHtml, modelToHtml, buildDocxPackage };
