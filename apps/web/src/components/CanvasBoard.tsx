import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignLeft, AlignRight, AlignStartHorizontal, AlignStartVertical, AudioLines, Bold, Circle, ClipboardPaste, Copy, Eraser, FileText, Film, GitFork, Globe2, Hand, Highlighter, ImagePlus, Italic, List, ListChecks, Magnet, Mic, Minimize2, Minus, MousePointer2, PaintBucket, PenLine, Plus, RotateCcw, RotateCw, SlidersHorizontal, Sparkles, Square, Trash2, Triangle, Type, Underline, ArrowUpRight, Maximize2, Network, Undo2, X, MoreHorizontal, Timer } from "lucide-react";
import type { BoardState, CanvasBackgroundMedia, CanvasBackgroundPattern, CanvasCrop, CanvasEmbed, CanvasEmbedKind, CanvasMedia, CanvasMediaKind, MindMapLayoutBehavior, ToolMode, Vec2 } from "@mindcanvas/shared";
import { applyMindMapAiOperations, applySelectionAi, arrangeMindMap, arrangeMindMapMultiSided, arrangeMindMapTwoSided, clamp, connect, connectorGeometry, elementBounds, hiddenNodes, mindMapLayoutBehavior, mindMapSelectionScope, moveElement, pathData, resizeElement, selectionToStudyText, MAX_FILE_BYTES, type Selection } from "../lib/board";
import { useLanguage, useTheme, type MessageKey } from "../lib/i18n";
import { canvasTextColor, readableTextColor } from "../lib/color";
import { THEME_CANVAS_PALETTES } from "../lib/theme";
import { addRelativeNode, alignSelection, distributeSelection, duplicateSelection, expandGroups, groupSelection, moveLayer, moveSelection, orderedElements, pasteSelection, removeSelection, reparentNode, reorderSelection, resizeSelection, resizeSelectionFromHandle, rotateMindMapSelection, rotateMindMapSubtree, rotateSelection, selectionBounds, setElementFlags, smartSnapMoveSelection, ungroupSelection, type ResizeHandle, type SnapGuide } from "../lib/editorCommands";
import LayerStack from "./LayerStack";
import ElementsPanel from "./ElementsPanel";
import CanvasNavigator from "./CanvasNavigator";
import { nodeHeight, type MindMapLayoutMode, type MindMapLayoutSummary, type MindMapMultiLayoutSummary } from "../lib/mindMapLayout";
import CanvasBackground, { BACKGROUND_OPTIONS } from "./CanvasBackground";
import AiSelectionPanel from "./AiSelectionPanel";
import SourceDocumentPanel, { type SourceDocumentView } from "./SourceDocumentPanel";
import { copyCanvasSelection, hasCanvasClipboard, readCanvasSelection, readClipboardImage } from "../lib/canvasClipboard";
import { getDocumentSource } from "../lib/supabase";
import { selectionRevision, type SelectionAiResult } from "../lib/api";
import Dialog from "./Dialog";
import { autoPanViewportDelta, panViewport, readWheelDelta, wheelPanDelta, zoomViewportAtFactor, zoomViewportAtPoint } from "../lib/canvasViewport";
import type { ToolbarPosition } from "../lib/editorPreferences";
import { CANVAS_TOOL_IDS } from "../lib/toolbarPreferences";
import { DEFAULT_CANVAS_TOUCH_SETTINGS, isIOSDevice, pinchScale, readCanvasTouchSettings, saveCanvasTouchSettings, type CanvasInputMode } from "../lib/canvasInput";
import { getMindMapHierarchy } from "../lib/mindMapGraph";
import MobileQuickActions from "./MobileQuickActions";
import { clampDrawingSize, DRAWING_SIZE_RANGES, eraseDrawingPaths, readDrawingSizes, saveDrawingSizes, type DrawingToolName, type DrawingToolSizes } from "../lib/drawingTools";
import DocumentViewer from "./DocumentViewer";
import { DOCUMENT_ACCEPT, documentKindFor, fileToDataUrl, MAX_DOCUMENT_BYTES, type DocumentKind } from "../lib/documentStore";
import { TOOL_HOLD_THRESHOLD_MS, toolAfterRelease } from "../lib/toolActivation";
import { emitGuideAction } from "../lib/featureGuides";

type Props = { board: BoardState; onChange: (next: BoardState) => void; onDraftChange?: (next: BoardState) => void; onViewportChange?: (next: BoardState) => void; onUndo: () => void; onRedo: () => void; canUndo?: boolean; canRedo?: boolean; onSave: () => void; canUseAi?: boolean; canUseCanvasBackground?: boolean; onRequestCanvasBackgroundUpgrade?: () => void; isFullscreen?: boolean; onToggleFullscreen?: () => void; toolbarPosition?: ToolbarPosition; timerVisible?: boolean; onToggleTimer?: () => void; showMobileZoomControls?: boolean; visibleToolIds?: ToolMode[]; readOnly?: boolean; onDocumentSaved?: (document: { name: string; mimeType: string; kind: DocumentKind; size: number; dataUrl: string }) => void };
type Gesture = { mode: "move" | "resize" | "rotate" | "pan" | "zoom" | "draw" | "erase" | "line" | "shape" | "marquee"; start: Vec2; screen: Vec2; base: BoardState; selection?: Selection; selections?: Selection[]; pointer: number; next: BoardState; reparent?: boolean; target?: string; center?: Vec2; startAngle?: number; resizeHandle?: ResizeHandle; eraseRadius?: number; erasePoints?: Vec2[]; zoomAnchor?: Vec2 };
type PinchGesture = { pointerIds: [number, number]; base: BoardState; startDistance: number; worldCenter: Vec2; next: BoardState };
type Editing = { selection: Selection; value: string; fresh?: BoardState };
type CanvasPointerInput = { pointerId: number; pointerType: string; button: number; clientX: number; clientY: number; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; preventDefault: () => void; stopPropagation?: () => void; capture?: boolean };
type IOSOverlayItem = { id: string; source: "media" | "embed"; x: number; y: number; width: number; height: number; rotation: number; opacity: number };

function isStylusPointer(pointerType: string) {
  return ["pen", "stylus", "xpen"].includes(pointerType.toLocaleLowerCase());
}

function iosOverlayRect(svg: SVGSVGElement, frame: HTMLDivElement, viewport: BoardState["viewport"], item: Pick<IOSOverlayItem, "x" | "y" | "width" | "height">) {
  if (typeof svg.getScreenCTM !== "function" || typeof svg.createSVGPoint !== "function") return null;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const frameRect = frame.getBoundingClientRect();
  const project = (x: number, y: number) => {
    const point = svg.createSVGPoint();
    point.x = viewport.x + x * viewport.scale;
    point.y = viewport.y + y * viewport.scale;
    return point.matrixTransform(matrix);
  };
  const topLeft = project(item.x, item.y);
  const topRight = project(item.x + item.width, item.y);
  const bottomLeft = project(item.x, item.y + item.height);
  const left = topLeft.x - frameRect.left;
  const top = topLeft.y - frameRect.top;
  const width = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const height = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}

const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
const DEFAULT_CROP: CanvasCrop = { top: 0, right: 0, bottom: 0, left: 0 };
const IOS_MEDIA_PROBE_TIMEOUT_MS = 4500;
const IOS_MEDIA_LABEL_HEIGHT = 30;
const RESIZE_HANDLES: Array<{ id: ResizeHandle; x: "left" | "center" | "right"; y: "top" | "center" | "bottom" }> = [
  { id: "nw", x: "left", y: "top" }, { id: "n", x: "center", y: "top" }, { id: "ne", x: "right", y: "top" },
  { id: "e", x: "right", y: "center" }, { id: "se", x: "right", y: "bottom" }, { id: "s", x: "center", y: "bottom" },
  { id: "sw", x: "left", y: "bottom" }, { id: "w", x: "left", y: "center" },
];

function mediaKindFor(type: string, name: string, iosCompatibility = false): CanvasMediaKind | null {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  const extension = name.toLocaleLowerCase().split(".").at(-1) ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", ...(iosCompatibility ? ["heic", "heif"] : [])].includes(extension)) return "image";
  if (["mp4", "webm", "mov", "m4v", "ogv", "avi"].includes(extension)) return "video";
  if (["mp3", "wav", "ogg", "oga", "m4a", "aac"].includes(extension)) return "audio";
  return null;
}

function fallbackMimeFor(kind: CanvasMediaKind, name: string) {
  const extension = name.toLocaleLowerCase().split(".").at(-1) ?? "";
  const byExtension: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif", heic: "image/heic", heif: "image/heif",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4", ogv: "video/ogg", avi: "video/x-msvideo",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac",
  };
  return byExtension[extension] ?? (kind === "image" ? "image/png" : kind === "video" ? "video/mp4" : "audio/webm");
}

function recordingExtension(mimeType: string) {
  const normalized = mimeType.toLocaleLowerCase();
  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("ogg")) return "ogg";
  return "webm";
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read media file."));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read media file."));
    reader.readAsDataURL(blob);
  });
}

type IntrinsicMediaResult = { width: number; height: number; status: "loaded" | "timeout" | "error" };

function intrinsicMediaSize(kind: CanvasMediaKind, src: string, probeSrc = src, timeoutMs?: number): Promise<IntrinsicMediaResult> {
  const fallback = kind === "audio" ? { width: 360, height: 86 } : { width: 16, height: 9 };
  if (kind === "audio") return Promise.resolve({ ...fallback, status: "loaded" });
  return new Promise(resolve => {
    let settled = false;
    let timeout = 0;
    const finish = (size: { width: number; height: number }, status: IntrinsicMediaResult["status"]) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve({ ...size, status });
    };
    if (timeoutMs !== undefined) timeout = window.setTimeout(() => finish(fallback, "timeout"), timeoutMs);
    if (kind === "image") {
      const image = new Image();
      image.onload = () => finish({ width: image.naturalWidth || fallback.width, height: image.naturalHeight || fallback.height }, "loaded");
      image.onerror = () => finish(fallback, "error");
      image.src = probeSrc;
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => finish({ width: video.videoWidth || fallback.width, height: video.videoHeight || fallback.height }, "loaded");
    video.onerror = () => finish(fallback, "error");
    video.src = probeSrc;
    video.load();
  });
}

function mediaFrameSize(kind: CanvasMediaKind, intrinsic: { width: number; height: number }) {
  if (kind === "audio") return { width: 360, height: 112 };
  const aspect = intrinsic.width > 0 && intrinsic.height > 0 ? intrinsic.width / intrinsic.height : 16 / 9;
  const maxWidth = 400, maxHeight = 270;
  let width = Math.min(maxWidth, Math.max(180, intrinsic.width || maxWidth));
  let height = width / aspect;
  if (height > maxHeight) { height = maxHeight; width = height * aspect; }
  return { width: Math.max(160, Math.round(width)), height: Math.max(100, Math.round(height + 30)) };
}

function normalizeEmbedUrl(raw: string): { kind: CanvasEmbedKind; url: string } | null {
  const candidate = raw.trim();
  if (!candidate) return null;
  let parsed: URL;
  try { parsed = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`); }
  catch { return null; }
  if (!/^https?:$/.test(parsed.protocol)) return null;
  const host = parsed.hostname.toLocaleLowerCase().replace(/^www\./, "");
  const isYouTube = host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com";
  if (isYouTube) {
    const parts = parsed.pathname.split("/").filter(Boolean);
    const id = host === "youtu.be" ? parts[0] : parsed.searchParams.get("v") ?? (parts[0] && ["embed", "shorts", "live", "v"].includes(parts[0]) ? parts[1] : undefined);
    if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) return { kind: "youtube", url: `https://www.youtube.com/embed/${id}?rel=0` };
  }
  if (/\.(?:mp4|webm|ogg|ogv|m4v|mov)(?:$|[?#])/i.test(parsed.pathname + parsed.search)) return { kind: "video", url: parsed.toString() };
  return { kind: "web", url: parsed.toString() };
}

function embedFrameSize(kind: CanvasEmbedKind) { return kind === "video" ? { width: 480, height: 310 } : kind === "document" ? { width: 620, height: 520 } : { width: 480, height: 340 }; }

function cropStyle(crop?: CanvasCrop) {
  const value = { ...DEFAULT_CROP, ...crop }, width = Math.max(1, 100 - value.left - value.right), height = Math.max(1, 100 - value.top - value.bottom);
  return { width: `${10000 / width}%`, height: `${10000 / height}%`, maxWidth: "none", maxHeight: "none", objectFit: "fill" as const, transform: `translate(-${value.left}%, -${value.top}%)` };
}

function iosNativeImageGeometry(media: CanvasMedia) {
  const labelHeight = Math.min(IOS_MEDIA_LABEL_HEIGHT, Math.max(18, media.height * .3));
  const visualHeight = Math.max(1, media.height - labelHeight);
  const crop = { ...DEFAULT_CROP, ...media.crop };
  const visibleWidth = Math.max(1, 100 - crop.left - crop.right);
  const visibleHeight = Math.max(1, 100 - crop.top - crop.bottom);
  return {
    labelHeight,
    visualHeight,
    clipId: `ios-media-crop-${media.id.replace(/[^a-z0-9_-]/gi, "_")}`,
    imageX: media.x - media.width * crop.left / visibleWidth,
    imageY: media.y - visualHeight * crop.top / visibleHeight,
    imageWidth: media.width * 100 / visibleWidth,
    imageHeight: visualHeight * 100 / visibleHeight,
  };
}

function mediaTrimStart(media: CanvasMedia) { return Number.isFinite(media.trimStart) && (media.trimStart ?? 0) > 0 ? media.trimStart! : 0; }
function applyTrimStart(element: HTMLMediaElement, media: CanvasMedia) {
  const start = mediaTrimStart(media);
  if (start > 0 && Number.isFinite(element.duration) && element.duration >= start) element.currentTime = start;
}
function enforceTrimEnd(element: HTMLMediaElement, media: CanvasMedia) {
  const end = media.trimEnd;
  if (Number.isFinite(end) && end !== undefined && end > mediaTrimStart(media) && element.currentTime >= end) {
    element.pause(); element.currentTime = mediaTrimStart(media);
  }
}

const tools: { id: ToolMode; icon: typeof Hand; key: string }[] = [
  { id: "select", icon: MousePointer2, key: "V" }, { id: "hand", icon: Hand, key: "Space" },
  { id: "text", icon: Type, key: "T" }, { id: "pen", icon: PenLine, key: "P" },
  { id: "highlighter", icon: Highlighter, key: "H" }, { id: "eraser", icon: Eraser, key: "E" }, { id: "line", icon: Minus, key: "L" },
  { id: "rect", icon: Square, key: "R" }, { id: "ellipse", icon: Circle, key: "O" },
  { id: "triangle", icon: Triangle, key: "G" }, { id: "connector", icon: ArrowUpRight, key: "C" },
];
const drawingSizeLabelKey: Record<DrawingToolName, MessageKey> = { pen: "penSize", highlighter: "highlighterSize", eraser: "eraserSize" };
export default function CanvasBoard({ board, onChange: onChangeProp, onDraftChange, onViewportChange, onUndo, onRedo, canUndo = false, canRedo = false, onSave, canUseAi = false, canUseCanvasBackground = false, onRequestCanvasBackgroundUpgrade, isFullscreen = false, onToggleFullscreen, toolbarPosition = "top", timerVisible = false, onToggleTimer, showMobileZoomControls = false, visibleToolIds = [...CANVAS_TOOL_IDS], readOnly = false, onDocumentSaved }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme(), palette = THEME_CANVAS_PALETTES[theme];
  const svg = useRef<SVGSVGElement>(null), frame = useRef<HTMLDivElement>(null), toolbar = useRef<HTMLDivElement>(null), toolbarTools = useRef<HTMLSpanElement>(null), gesture = useRef<Gesture | null>(null), pinch = useRef<PinchGesture | null>(null);
  const mediaInput = useRef<HTMLInputElement>(null), backgroundInput = useRef<HTMLInputElement>(null), recorder = useRef<MediaRecorder | null>(null), recorderStream = useRef<MediaStream | null>(null), recordingChunks = useRef<Blob[]>([]);
  const touchPoints = useRef(new Map<number, Vec2>()), iosTouchActive = useRef(false), autoPanPointer = useRef<Vec2 | null>(null), autoPanFrame = useRef<number | null>(null), autoPanLastAt = useRef<number | null>(null), toolbarUserExpanded = useRef(false), connectorPulseTimer = useRef<number | null>(null);
  const draftCheckpointAt = useRef(0);
  const iosTouchFallback = isIOSDevice();
  const boardRef = useRef(board);
  const onChange = (next: BoardState) => {
    const before = boardRef.current;
    const { viewport: _nextViewport, updatedAt: _nextUpdatedAt, ...nextContent } = next;
    const { viewport: _beforeViewport, updatedAt: _beforeUpdatedAt, ...beforeContent } = before;
    const viewportOnly = JSON.stringify(nextContent) === JSON.stringify(beforeContent);
    if (viewportOnly && onViewportChange) {
      const navigated = { ...before, viewport: next.viewport };
      boardRef.current = navigated;
      onViewportChange(navigated);
      return;
    }
    if (!readOnly) {
      // Keep the interaction baseline current even before the parent render
      // commits. This is important when Apply/rotate and a follow-up shortcut
      // happen in the same React batch: the second operation must build on the
      // first, while the workspace records each committed operation once.
      boardRef.current = next;
      onChangeProp(next);
    }
  };
  const onChangeRef = useRef(onChange);
  const wheelPending = useRef<BoardState | null>(null), wheelIdle = useRef<number | null>(null), wheelFrameCancel = useRef<(() => void) | null>(null);
  const [preview, setPreview] = useState<BoardState | null>(null), [selections, setSelections] = useState<Selection[]>([]);
  const selectionsRef = useRef(selections);
  selectionsRef.current = selections;
  const [mindMapLayoutSummary, setMindMapLayoutSummary] = useState<MindMapLayoutSummary | MindMapMultiLayoutSummary | null>(null);
  const [mindMapLayoutOpen, setMindMapLayoutOpen] = useState(false), [mindMapLayoutSides, setMindMapLayoutSides] = useState(4), [mindMapLayoutMode, setMindMapLayoutMode] = useState<MindMapLayoutMode>("radial"), [mindMapLayoutBehaviorChoice, setMindMapLayoutBehaviorChoice] = useState<MindMapLayoutBehavior>("assist"), [mindMapRotationAngle, setMindMapRotationAngle] = useState(45);
  const selected = selections.at(-1) ?? null;
  const setSelected = (s: Selection | null) => setSelections(s ? [s] : []);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [hasCopy, setHasCopy] = useState(hasCanvasClipboard);
  const [tool, setTool] = useState<ToolMode>("select"), [editing, setEditing] = useState<Editing | null>(null), [snap, setSnap] = useState(false), [connectorSource, setConnectorSource] = useState<Selection | null>(null), [connectorPulse, setConnectorPulse] = useState<string[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 620);
  const [toolbarExpanded, setToolbarExpanded] = useState(() => typeof window === "undefined" || window.innerWidth > 620);
  const [toolbarOverflowing, setToolbarOverflowing] = useState(false);
  const [showToolbarSwipeHint, setShowToolbarSwipeHint] = useState(() => {
    try { return localStorage.getItem("mindcanvas:mobile-toolbar-swiped:v1") !== "true"; } catch { return true; }
  });
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [touchSettings, setTouchSettings] = useState(readCanvasTouchSettings);
  const [inputMode, setInputMode] = useState<CanvasInputMode>("idle");
  const [aiOpen, setAiOpen] = useState(false), [sourceView, setSourceView] = useState<SourceDocumentView | null>(null), [sourceError, setSourceError] = useState("");
  const [mediaError, setMediaError] = useState(""), [isRecording, setIsRecording] = useState(false), [recordingSeconds, setRecordingSeconds] = useState(0);
  const [iosMediaSources, setIOSMediaSources] = useState<Record<string, string>>({});
  const [iosOverlayItems, setIOSOverlayItems] = useState<Array<IOSOverlayItem & { left: number; top: number; screenWidth: number; screenHeight: number }>>([]);
  const [embedOpen, setEmbedOpen] = useState(false), [embedUrl, setEmbedUrl] = useState(""), [embedTitle, setEmbedTitle] = useState("");
  const editRef = useRef<Editing | null>(null), [space, setSpace] = useState(false), [heldTool, setHeldTool] = useState<ToolMode | null>(null);
  const spaceRef = useRef(false), ctrlRef = useRef(false), heldToolRef = useRef<ToolMode | null>(null);
  const keyboardToolPresses = useRef(new Map<string, { tool: ToolMode; previous: ToolMode; startedAt: number }>());
  const toolbarToolPress = useRef<{ tool: ToolMode; previous: ToolMode; pointerId: number; startedAt: number; timer: number | null; held: boolean } | null>(null);
  const previousThemeInk = useRef(palette.ink);
  const [ink, setInk] = useState(palette.ink), [strokeWidth, setStrokeWidth] = useState(3);
  const [drawingSizes, setDrawingSizes] = useState<DrawingToolSizes>(readDrawingSizes);
  const [eraserCursor, setEraserCursor] = useState<Vec2 | null>(null);
  useEffect(() => { boardRef.current = board; onChangeRef.current = onChange; }, [board, onChangeProp, readOnly]);
  const iosMedia = board.media.filter(media => media.src.startsWith("data:") && ["image", "video", "audio"].includes(media.kind));
  const iosMediaSignature = iosTouchFallback ? JSON.stringify(iosMedia.map(media => [media.id, media.src])) : "";
  const b = preview ?? editing?.fresh ?? board;
  useEffect(() => {
    if (!iosTouchFallback || !iosMediaSignature || typeof fetch !== "function" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      setIOSMediaSources(current => Object.keys(current).length ? {} : current);
      return;
    }
    let alive = true;
    const createdUrls: string[] = [];
    const hydrate = async () => {
      const entries = await Promise.all(iosMedia.map(async media => {
        try {
          const response = await fetch(media.src);
          if (!response.ok) return null;
          const url = URL.createObjectURL(await response.blob());
          return [media.id, url] as const;
        } catch { return null; }
      }));
      const valid = entries.filter((entry): entry is readonly [string, string] => !!entry);
      if (!alive) {
        valid.forEach(([, url]) => { try { URL.revokeObjectURL(url); } catch {} });
        return;
      }
      createdUrls.push(...valid.map(([, url]) => url));
      setIOSMediaSources(Object.fromEntries(valid));
    };
    void hydrate();
    return () => {
      alive = false;
      createdUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch {} });
    };
  }, [iosTouchFallback, iosMediaSignature]);
  const iosOverlaySignature = iosTouchFallback ? JSON.stringify([
    b.viewport,
    ...b.media.filter(media => !media.hidden && media.kind !== "image").map(media => ["media", media.id, media.x, media.y, media.width, media.height, media.rotation ?? 0, media.opacity ?? 1]),
    ...b.embeds.filter(embed => !embed.hidden).map(embed => ["embed", embed.id, embed.x, embed.y, embed.width, embed.height, embed.rotation ?? 0, embed.opacity ?? 1]),
  ]) : "";
  useEffect(() => {
    if (!iosTouchFallback) {
      setIOSOverlayItems(current => current.length ? [] : current);
      return;
    }
    const svgElement = svg.current;
    const frameElement = frame.current;
    if (!svgElement || !frameElement) return;
    let frameRequest = 0;
    const update = () => {
      frameRequest = 0;
      const next = [
        ...b.media.filter(media => !media.hidden && media.kind !== "image").map(media => ({ id: media.id, source: "media" as const, x: media.x, y: media.y, width: media.width, height: media.height, rotation: media.rotation ?? 0, opacity: media.opacity ?? 1 })),
        ...b.embeds.filter(embed => !embed.hidden).map(embed => ({ id: embed.id, source: "embed" as const, x: embed.x, y: embed.y, width: embed.width, height: embed.height, rotation: embed.rotation ?? 0, opacity: embed.opacity ?? 1 })),
      ].flatMap(item => {
        const rect = iosOverlayRect(svgElement, frameElement, b.viewport, item);
        return rect ? [{ ...item, left: rect.left, top: rect.top, screenWidth: rect.width, screenHeight: rect.height }] : [];
      });
      setIOSOverlayItems(next);
    };
    const schedule = () => {
      if (frameRequest) return;
      if (typeof window.requestAnimationFrame === "function") frameRequest = window.requestAnimationFrame(update);
      else frameRequest = window.setTimeout(update, 16);
    };
    update();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(frameElement);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (frameRequest) {
        if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(frameRequest);
        else window.clearTimeout(frameRequest);
      }
    };
  }, [iosTouchFallback, iosOverlaySignature]);
  useEffect(() => saveCanvasTouchSettings(touchSettings), [touchSettings]);
  useEffect(() => saveDrawingSizes(drawingSizes), [drawingSizes]);
  useEffect(() => { if (tool !== "connector") setConnectorSource(null); }, [tool]);
  const cancelWheelFrame = () => { wheelFrameCancel.current?.(); wheelFrameCancel.current = null; };
  const commitWheelViewport = () => {
    if (wheelIdle.current !== null) { window.clearTimeout(wheelIdle.current); wheelIdle.current = null; }
    cancelWheelFrame();
    const pending = wheelPending.current;
    wheelPending.current = null;
    if (pending) { setPreview(current => current === pending ? null : current); onChangeRef.current(pending); }
  };
  const scheduleWheelPreview = () => {
    if (wheelFrameCancel.current) return;
    const render = () => { wheelFrameCancel.current = null; if (wheelPending.current) setPreview(wheelPending.current); };
    if (typeof window.requestAnimationFrame === "function") {
      const id = window.requestAnimationFrame(render);
      wheelFrameCancel.current = () => window.cancelAnimationFrame(id);
    } else {
      const id = window.setTimeout(render, 16);
      wheelFrameCancel.current = () => window.clearTimeout(id);
    }
  };
  const scheduleWheelCommit = () => {
    if (wheelIdle.current !== null) window.clearTimeout(wheelIdle.current);
    wheelIdle.current = window.setTimeout(commitWheelViewport, 120);
  };
  const bounds = selectionBounds(b, selections);
  const selectedEl = selected && selections.length === 1 ? b[selected.kind].find(el => el.id === selected.id) : null;
  const selectedStudyText = selectionToStudyText(b, selections);
  const selectedMindMapRootId = selected?.kind === "nodes" && selections.length === 1 ? selected.id : undefined;
  const selectedMindMapScope = selectedMindMapRootId ? mindMapSelectionScope(b, selections) : undefined;
  const selectedMindMapHasLocked = !!selectedMindMapScope?.nodeIds.some(id => b.nodes.find(node => node.id === id)?.locked);
  const selectedMindMapNodes = selections.filter(selection => selection.kind === "nodes");
  const selectedMindMapSelectionHasLocked = selectedMindMapNodes.some(selection => b.nodes.find(node => node.id === selection.id)?.locked);
  const selectedMindMapHierarchy = getMindMapHierarchy(b.nodes, b.edges);
  const hidden = hiddenNodes(b);
  const hiddenElements = new Set([...b.nodes.filter(e => e.hidden).map(e => e.id), ...b.texts.filter(e => e.hidden).map(e => e.id), ...b.shapes.filter(e => e.hidden).map(e => e.id), ...b.drawings.filter(e => e.hidden).map(e => e.id), ...b.media.filter(e => e.hidden).map(e => e.id), ...b.embeds.filter(e => e.hidden).map(e => e.id), ...b.edges.filter(e => e.hidden).map(e => e.id), ...hidden]);
  const connectorPulseIds = new Set(connectorPulse);
  const isLocked = (s: Selection) => {
    const element = b[s.kind].find(e => e.id === s.id);
    return !!element && "locked" in element && !!element.locked;
  };
  const canEditSelection = selections.some(selection => !isLocked(selection));
  const requestAutoPanFrame = (callback: () => void) => typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame(() => callback())
    : window.setTimeout(callback, 16);
  const stopAutoPan = () => {
    if (autoPanFrame.current !== null) {
      window.cancelAnimationFrame?.(autoPanFrame.current);
      window.clearTimeout(autoPanFrame.current);
    }
    autoPanFrame.current = null; autoPanPointer.current = null;
  };
  const edgePanDelta = (clientX: number, clientY: number, elapsedMs: number) => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return autoPanViewportDelta(clientX, clientY, rect, elapsedMs);
  };
  const updateMarquee = (g: Gesture, p: Vec2) => {
    const dx = p.x - g.start.x, dy = p.y - g.start.y;
    const rect = { x: Math.min(g.start.x, p.x), y: Math.min(g.start.y, p.y), width: Math.abs(dx), height: Math.abs(dy) };
    setMarquee(rect);
    // A left-to-right drag selects elements fully inside the box. A
    // right-to-left drag behaves like a desktop pointer's crossing selection
    // and includes every element the box touches.
    const crossing = dx < 0;
    const found = orderedElements(g.base).filter(s => {
      if (hidden.has(s.id) || s.kind === "edges") return false;
      const bounds = elementBounds(g.base, s);
      if (!bounds || rect.width === 0 || rect.height === 0) return false;
      return crossing
        ? bounds.x < rect.x + rect.width && bounds.x + bounds.width > rect.x && bounds.y < rect.y + rect.height && bounds.y + bounds.height > rect.y
        : bounds.x >= rect.x && bounds.y >= rect.y && bounds.x + bounds.width <= rect.x + rect.width && bounds.y + bounds.height <= rect.y + rect.height;
    });
    setSelections(expandGroups(g.base, [...(g.selections ?? []), ...found]));
  };
  const autoPanTick = () => {
    autoPanFrame.current = null;
    const g = gesture.current, pointer = autoPanPointer.current;
    if (!g || g.mode !== "marquee" || !pointer) return;
    const now = performance.now(), previous = autoPanLastAt.current ?? now, elapsed = Math.min(50, Math.max(1, now - previous));
    autoPanLastAt.current = now;
    const delta = edgePanDelta(pointer.x, pointer.y, elapsed);
    if (delta.x !== 0 || delta.y !== 0) {
      g.next = { ...g.next, viewport: panViewport(g.next.viewport, delta.x, delta.y) };
      updateMarquee(g, point(pointer.x, pointer.y, g.next));
      setPreview(g.next);
    }
    autoPanFrame.current = requestAutoPanFrame(autoPanTick);
  };
  const scheduleAutoPan = () => {
    if (autoPanFrame.current !== null) return;
    autoPanLastAt.current = performance.now();
    autoPanFrame.current = requestAutoPanFrame(autoPanTick);
  };
  useEffect(() => { setInk(current => current === previousThemeInk.current ? palette.ink : current); previousThemeInk.current = palette.ink; }, [palette.ink]);
  useEffect(() => { const ids = new Set(orderedElements(board).map(s => s.id)); if (!editing && selections.some(s => !ids.has(s.id))) setSelections(selections.filter(s => ids.has(s.id))); }, [board, editing, selections]);
  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => setRecordingSeconds(seconds => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);
  useEffect(() => {
    toolbarUserExpanded.current = false;
    const updateToolbarFit = () => {
      const host = frame.current, bar = toolbar.current;
      if (!host || !bar || toolbarUserExpanded.current) return;
      const hostRect = host.getBoundingClientRect();
      const available = toolbarPosition === "top" || toolbarPosition === "bottom" ? hostRect.width * .8 : hostRect.height * .8;
      const contentSize = toolbarPosition === "top" || toolbarPosition === "bottom" ? bar.scrollWidth : bar.scrollHeight;
      if (contentSize > available + 4) setToolbarExpanded(false);
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updateToolbarFit) : null;
    if (frame.current) observer?.observe(frame.current);
    if (toolbar.current) observer?.observe(toolbar.current);
    window.addEventListener("resize", updateToolbarFit);
    const timer = window.setTimeout(updateToolbarFit, 0);
    return () => { observer?.disconnect(); window.removeEventListener("resize", updateToolbarFit); window.clearTimeout(timer); };
  }, [toolbarPosition, inspectorOpen, isFullscreen]);
  useEffect(() => {
    const track = toolbarTools.current;
    const mobile = typeof window !== "undefined" && window.matchMedia?.("(max-width: 620px)").matches;
    if (!track || !toolbarExpanded || !mobile) { setToolbarOverflowing(false); return; }
    const vertical = toolbarPosition === "left" || toolbarPosition === "right";
    const update = () => setToolbarOverflowing(vertical ? track.scrollHeight > track.clientHeight + 4 : track.scrollWidth > track.clientWidth + 4);
    update();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(track);
    window.addEventListener("resize", update);
    const timer = window.setTimeout(update, 30);
    return () => { observer?.disconnect(); window.removeEventListener("resize", update); window.clearTimeout(timer); };
  }, [toolbarExpanded, toolbarPosition]);
  useEffect(() => {
    const track = toolbarTools.current;
    if (!track || !toolbarExpanded || typeof window === "undefined" || !window.matchMedia?.("(max-width: 620px)").matches) return;
    const active = track.querySelector<HTMLElement>(`[data-tool="${tool}"]`);
    active?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [tool, toolbarExpanded, toolbarPosition]);
  useEffect(() => {
    if (!toolbarExpanded || !toolbarOverflowing || !showToolbarSwipeHint) return;
    const timer = window.setTimeout(() => {
      setShowToolbarSwipeHint(false);
      try { localStorage.setItem("mindcanvas:mobile-toolbar-swiped:v1", "true"); } catch {}
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [toolbarExpanded, toolbarOverflowing, showToolbarSwipeHint]);
  useEffect(() => () => {
    stopAutoPan();
    if (connectorPulseTimer.current !== null) window.clearTimeout(connectorPulseTimer.current);
    if (toolbarToolPress.current?.timer !== null) window.clearTimeout(toolbarToolPress.current?.timer);
    toolbarToolPress.current = null;
    recorder.current?.stop();
    recorderStream.current?.getTracks().forEach(track => track.stop());
  }, []);
  const activeToolMode = space ? "hand" : heldTool ?? tool;
  const currentInputTool = () => spaceRef.current ? "hand" : heldToolRef.current ?? tool;
  const interactive = !readOnly && (activeToolMode === "select" || activeToolMode === "connector");
  const point = (clientX: number, clientY: number, base = board): Vec2 => {
    const rect = svg.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - base.viewport.x) / base.viewport.scale, y: (clientY - rect.top - base.viewport.y) / base.viewport.scale };
  };
  const addMediaBlobs = async (items: Array<{ blob: Blob; name: string; kind?: CanvasMediaKind }>) => {
    const additions: CanvasMedia[] = [];
    const rect = svg.current?.getBoundingClientRect();
    const center = rect ? point(rect.left + rect.width / 2, rect.top + rect.height / 2) : { x: 240, y: 180 };
    for (const [index, item] of items.entries()) {
      if (item.blob.size > MAX_MEDIA_BYTES) { setMediaError(t("mediaFileTooLarge")); continue; }
      const kind = item.kind ?? mediaKindFor(item.blob.type, item.name, iosTouchFallback);
      if (!kind) continue;
      const fallbackMime = iosTouchFallback ? fallbackMimeFor(kind, item.name) : kind === "image" ? "image/png" : kind === "video" ? "video/mp4" : "audio/webm";
      const sourceBlob = item.blob.type ? item.blob : new Blob([item.blob], { type: fallbackMime });
      let probeUrl = "";
      try {
        const src = await readBlobAsDataUrl(sourceBlob);
        try {
          if (iosTouchFallback && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") probeUrl = URL.createObjectURL(sourceBlob);
        } catch { /* Data URLs remain the portable persistence format. */ }
        const intrinsic = await intrinsicMediaSize(kind, src, probeUrl || src, iosTouchFallback ? IOS_MEDIA_PROBE_TIMEOUT_MS : undefined);
        if (iosTouchFallback && intrinsic.status === "error") { setMediaError(t("mediaFormatUnsupported")); continue; }
        const size = mediaFrameSize(kind, intrinsic);
        additions.push({ id: crypto.randomUUID(), kind, src, name: item.name || t(kind), mimeType: sourceBlob.type || fallbackMime,
          x: center.x - size.width / 2 + index * 28, y: center.y - size.height / 2 + index * 28, width: size.width, height: size.height });
      } catch { setMediaError(t("mediaFormatUnsupported")); }
      finally {
        if (probeUrl) { try { URL.revokeObjectURL(probeUrl); } catch {} }
      }
    }
    if (!additions.length) return;
    const latest = boardRef.current;
    onChange({ ...latest, media: [...latest.media, ...additions] });
    setTool("select"); setSelections(additions.map(media => ({ kind: "media" as const, id: media.id })));
  };
  const addMediaFiles = (files: File[]) => { void addMediaBlobs(files.map(file => ({ blob: file, name: file.name }))); };
  const addDocumentFiles = async (files: File[]) => {
    const additions: CanvasEmbed[] = [];
    const rect = svg.current?.getBoundingClientRect();
    const center = rect ? point(rect.left + rect.width / 2, rect.top + rect.height / 2) : { x: 320, y: 240 };
    for (const [index, file] of files.entries()) {
      const kind = documentKindFor(file.name, file.type);
      if (!kind) { setMediaError("Chỉ hỗ trợ PDF, DOCX, PPTX và XLSX."); continue; }
      if (file.size > MAX_DOCUMENT_BYTES) { setMediaError("Tài liệu vượt quá 40 MB."); continue; }
      try {
        const dataUrl = await fileToDataUrl(file);
        const size = { width: 620, height: 520 };
        const documentEmbed: CanvasEmbed = { id: crypto.randomUUID(), kind: "document", url: dataUrl, title: file.name, fileName: file.name, mimeType: file.type || undefined, x: center.x - size.width / 2 + index * 26, y: center.y - size.height / 2 + index * 26, ...size };
        additions.push(documentEmbed);
        onDocumentSaved?.({ name: file.name, mimeType: file.type || "application/octet-stream", kind, size: file.size, dataUrl });
      } catch { setMediaError("Không thể đọc tài liệu."); }
    }
    if (!additions.length) return;
    const latest = boardRef.current;
    onChange({ ...latest, embeds: [...latest.embeds, ...additions] });
    setTool("select"); setSelections(additions.map(embed => ({ kind: "embeds" as const, id: embed.id })));
  };
  const addCanvasFiles = (files: File[]) => {
    const documents = files.filter(file => !!documentKindFor(file.name, file.type));
    const media = files.filter(file => !documentKindFor(file.name, file.type));
    if (documents.length) void addDocumentFiles(documents);
    if (media.length) addMediaFiles(media);
  };
  const openMediaPicker = () => {
    finishEdit();
    setMediaError("");
    const input = mediaInput.current;
    if (!input) return;
    input.value = "";
    // Keep this synchronous with the user's tap. iOS WebViews may reject a
    // delayed or display:none file-input activation.
    input.click();
  };
  const openBackgroundPicker = () => {
    if (!canUseCanvasBackground) { onRequestCanvasBackgroundUpgrade?.(); return; }
    finishEdit();
    setMediaError("");
    const input = backgroundInput.current;
    if (!input) return;
    input.value = "";
    input.click();
  };
  const addBackgroundFile = async (file: File | undefined) => {
    if (!file) return;
    if (!canUseCanvasBackground) { onRequestCanvasBackgroundUpgrade?.(); return; }
    if (file.size > MAX_FILE_BYTES) { setMediaError(t("mediaFileTooLarge")); return; }
    const kind = mediaKindFor(file.type, file.name, iosTouchFallback);
    if (kind !== "image" && kind !== "video") { setMediaError(t("backgroundMediaUnsupported")); return; }
    try {
      const sourceBlob = file.type ? file : new Blob([file], { type: kind === "image" ? "image/png" : "video/mp4" });
      const src = await readBlobAsDataUrl(sourceBlob);
      const background: CanvasBackgroundMedia = { kind, src, name: file.name, mimeType: sourceBlob.type || undefined, opacity: .62, blur: 0, brightness: 1, fit: "cover", position: "center", overlay: "#000000" };
      onChange({ ...board, background });
      setMediaError("");
    } catch { setMediaError(t("backgroundMediaUnsupported")); }
  };
  const addClipboardImage = async () => {
    const blob = await readClipboardImage();
    if (!blob) { setMediaError(t("clipboardImageUnavailable")); return; }
    void addMediaBlobs([{ blob, name: `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`, kind: "image" }]);
  };
  const insertEmbed = () => {
    const normalized = normalizeEmbedUrl(embedUrl);
    if (!normalized) { setMediaError(t("error")); return; }
    const rect = svg.current?.getBoundingClientRect();
    const center = rect ? point(rect.left + rect.width / 2, rect.top + rect.height / 2) : { x: 240, y: 180 };
    const size = embedFrameSize(normalized.kind);
    const embed: CanvasEmbed = { id: crypto.randomUUID(), ...normalized, title: embedTitle.trim() || undefined,
      x: center.x - size.width / 2, y: center.y - size.height / 2, width: size.width, height: size.height };
    onChange({ ...board, embeds: [...board.embeds, embed] });
    setEmbedOpen(false); setEmbedUrl(""); setEmbedTitle(""); setMediaError(""); setTool("select"); setSelected({ kind: "embeds", id: embed.id });
  };
  const stopRecording = () => { recorder.current?.stop(); setIsRecording(false); setRecordingSeconds(0); };
  const startRecording = async () => {
    setMediaError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setMediaError(t("recordingUnsupported")); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const formats = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"];
      const mimeType = formats.find(format => typeof MediaRecorder.isTypeSupported !== "function" || MediaRecorder.isTypeSupported(format));
      const nextRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined), chunks: Blob[] = [];
      recorder.current = nextRecorder; recorderStream.current = stream; recordingChunks.current = chunks;
      nextRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      nextRecorder.onerror = () => { setMediaError(t("error")); setIsRecording(false); };
      nextRecorder.onstop = () => {
        const outputMimeType = nextRecorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: outputMimeType });
        stream.getTracks().forEach(track => track.stop()); recorder.current = null; recorderStream.current = null;
        if (blob.size) void addMediaBlobs([{ blob, name: `${t("audio")}-${new Date().toISOString().replace(/[:.]/g, "-")}.${iosTouchFallback ? recordingExtension(outputMimeType) : "webm"}`, kind: "audio" }]);
      };
      nextRecorder.start(); setRecordingSeconds(0); setIsRecording(true);
    } catch (error) {
      setMediaError(error instanceof DOMException && error.name === "NotAllowedError" ? t("recordingPermissionDenied") : t("recordingUnsupported"));
    }
  };
  const edit = (s: Selection, fresh?: BoardState) => {
    if (readOnly || (s.kind !== "texts" && s.kind !== "nodes")) return;
    const el = (fresh ?? board)[s.kind].find(n => n.id === s.id);
    if (!el) return;
    const value = "text" in el ? el.text : el.label;
    const next = { selection: s, value, fresh }; editRef.current = next; setEditing(next); setSelected(s);
  };
  const openInlineEditor = (event: ReactMouseEvent, selection: Selection) => {
    if (readOnly || tool !== "select") return;
    event.preventDefault(); event.stopPropagation(); edit(selection);
  };
  const pulseConnection = (ids: string[]) => {
    setConnectorPulse(ids);
    if (connectorPulseTimer.current !== null) window.clearTimeout(connectorPulseTimer.current);
    connectorPulseTimer.current = window.setTimeout(() => { connectorPulseTimer.current = null; setConnectorPulse([]); }, 720);
  };
  const autoLayoutMindMap = (next: BoardState, rootId?: string) => {
    if (!rootId || mindMapLayoutBehavior(next) !== "auto" || !next.nodes.some(node => node.id === rootId)) return next;
    return arrangeMindMapMultiSided(next, rootId, 4, "organic").board;
  };
  const finishEdit = (cancel = false) => {
    const e = editRef.current; if (!e) return;
    editRef.current = null; setEditing(null);
    if (!cancel) {
      const base = e.fresh ?? board, kind = e.selection.kind;
      const changed = { ...base, [kind]: base[kind].map(el => el.id === e.selection.id ? { ...el, [kind === "texts" ? "text" : "label"]: e.value,
        ...(kind === "nodes" && "width" in el ? { height: Math.max("height" in el ? el.height ?? 76 : 76, nodeHeight(e.value, el.width, "sourcePage" in el ? el.sourcePage : undefined)) } : {}) } : el) };
      const changedRoot = kind === "nodes" ? getMindMapHierarchy(changed.nodes, changed.edges).parent.get(e.selection.id) ?? e.selection.id : undefined;
      onChange(kind === "nodes" ? autoLayoutMindMap(changed, changedRoot) : changed);
    }
  };
  const isIOSCanvasTouchTarget = (target: EventTarget | null) => {
    const element = target instanceof Element ? target : null;
    if (!svg.current || !element || !svg.current.contains(element)) return false;
    return !element.closest(".canvas-media video, .canvas-media audio, .canvas-embed-body, .inline-editor, .resize-handle, .rotation-handle, button, input, textarea, select, [contenteditable=true]");
  };
  const shouldUseIOSNativeTouch = (e: { pointerType: string; target: EventTarget | null }) =>
    iosTouchFallback && e.pointerType === "touch" && (iosTouchActive.current || isIOSCanvasTouchTarget(e.target));
  const selectElementAt = (input: CanvasPointerInput, s: Selection) => {
    const interactionBoard = wheelPending.current ?? board;
    commitWheelViewport();
    if (gesture.current || (input.button !== 0 && input.button !== 1 && !isStylusPointer(input.pointerType))) return;
    if (input.ctrlKey || input.metaKey || ctrlRef.current) return;
    const inputTool = currentInputTool();
    if (!interactive || inputTool === "hand" || input.button === 1) return;
    input.stopPropagation?.(); input.preventDefault();
    svg.current?.focus();
    if (inputTool === "connector") {
      if (s.kind !== "nodes" && s.kind !== "shapes") return;
      if (!connectorSource) { setConnectorSource(s); setSelected(s); return; }
      if (connectorSource.id === s.id) { setConnectorSource(null); setSelected(null); return; }
      const next = connect(interactionBoard, connectorSource.id, s.id, "relation");
      if (next !== interactionBoard) onChange(next);
      pulseConnection([connectorSource.id, s.id]);
      setConnectorSource(null);
      setSelected(s);
      return;
    }
    const expanded = expandGroups(interactionBoard, [s]);
    if (input.shiftKey) {
      const ids = new Set(expanded.map(s => s.id));
      const currentSelections = selectionsRef.current;
      setSelections(currentSelections.some(item => item.id === s.id) ? currentSelections.filter(item => !ids.has(item.id)) : [...currentSelections, ...expanded.filter(item => !currentSelections.some(s => s.id === item.id))]);
      return;
    }
    const currentSelections = selectionsRef.current;
    const targets = currentSelections.some(item => item.id === s.id) ? currentSelections : expanded;
    setSelections(targets);
    if (isLocked(s)) return;
    if (s.kind === "edges") return;
    svg.current?.focus(); if (input.capture) svg.current?.setPointerCapture(input.pointerId);
    const p = point(input.clientX, input.clientY, interactionBoard);
    setInputMode("transforming");
    gesture.current = { mode: "move", start: p, screen: { x: input.clientX, y: input.clientY }, base: interactionBoard, selection: s, selections: targets, reparent: input.altKey && targets.length === 1 && s.kind === "nodes", pointer: input.pointerId, next: interactionBoard };
  };
  const selectElement = (e: ReactPointerEvent, s: Selection) => {
    if (shouldUseIOSNativeTouch(e)) return;
    selectElementAt({ pointerId: e.pointerId, pointerType: e.pointerType, button: e.button, clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation(), capture: true }, s);
  };
  const checkpointGestureDraft = (next: BoardState, force = false) => {
    if (!onDraftChange) return;
    const now = performance.now();
    if (!force && now - draftCheckpointAt.current < 180) return;
    draftCheckpointAt.current = now;
    onDraftChange(next);
  };
  const begin = (input: CanvasPointerInput) => {
    const interactionBoard = wheelPending.current ?? board;
    commitWheelViewport();
    if (gesture.current || pinch.current) return;
    if (input.button !== 0 && input.button !== 1 && !isStylusPointer(input.pointerType)) return;
    if (editRef.current) { finishEdit(); return; }
    input.preventDefault(); svg.current?.focus(); window.getSelection()?.removeAllRanges();
    const base = interactionBoard;
    const inputTool = currentInputTool();
    const zoomShortcut = !!(input.ctrlKey || input.metaKey || ctrlRef.current);
    const svgRect = svg.current?.getBoundingClientRect();
    if (zoomShortcut && svgRect) {
      const zoomAnchor = { x: input.clientX - svgRect.left, y: input.clientY - svgRect.top };
      setInputMode("panning");
      gesture.current = { mode: "zoom", start: point(input.clientX, input.clientY, base), screen: { x: input.clientX, y: input.clientY }, base, pointer: input.pointerId, next: base, zoomAnchor };
      if (input.capture) svg.current?.setPointerCapture(input.pointerId);
      return;
    }
    const p = point(input.clientX, input.clientY, interactionBoard);
    // Touch follows the active tool. Pen/highlighter only fall back to temporary pan
    // when finger drawing was explicitly disabled. Two-finger gestures are still
    // promoted to pinch/pan by the capture handlers below without changing `tool`.
    // Some Windows/XPen drivers expose the stylus as a touch pointer. Restrict
    // the finger-drawing preference to phone layouts so desktop pen tablets
    // still follow the active drawing tool.
    const phoneLayout = typeof window !== "undefined" && window.matchMedia?.("(max-width: 620px)").matches;
    const touchShouldPan = input.pointerType === "touch" && (inputTool === "select" || (phoneLayout && (inputTool === "pen" || inputTool === "highlighter" || inputTool === "eraser") && !touchSettings.drawWithFinger));
    // Holding V is an explicit pointer override, so it must never be turned
    // into a pen by the stylus-only preference. Keep the legacy behavior for
    // the normal Select tool and for text/connector insertion.
    const temporarySelect = heldToolRef.current === "select";
    const forceStylusPen = ["text", "connector"].includes(inputTool) || (inputTool === "select" && !temporarySelect);
    const stylusTool: ToolMode = isStylusPointer(input.pointerType) && touchSettings.stylusDrawOnly && forceStylusPen ? "pen" : inputTool;
    const effectiveTool = input.pointerType === "touch" && !isStylusPointer(input.pointerType) ? tool : stylusTool;
    if (readOnly || inputTool === "hand" || input.button === 1 || touchShouldPan) {
      setSelected(null); setInputMode("panning"); gesture.current = { mode: "pan", start: p, screen: { x: input.clientX, y: input.clientY }, base, pointer: input.pointerId, next: base };
    } else if (effectiveTool === "select") {
      const initial = input.shiftKey ? selections : [];
      setSelections(initial); setMarquee({ ...p, width: 0, height: 0 }); setInputMode("selecting");
      gesture.current = { mode: "marquee", start: p, screen: p, base, selections: initial, pointer: input.pointerId, next: base };
      autoPanPointer.current = { x: input.clientX, y: input.clientY }; autoPanLastAt.current = performance.now(); scheduleAutoPan();
    } else if (effectiveTool === "connector") {
      setConnectorSource(null); setSelected(null); return;
    } else if (effectiveTool === "text") {
      const id = crypto.randomUUID();
      edit({ kind: "texts", id }, { ...base, texts: [...base.texts, { id, x: p.x, y: p.y + 16, text: "", width: 260, height: 42, fontSize: 16, color: "#18213b" }] });
      setTool("select"); return;
    } else if (effectiveTool === "pen" || effectiveTool === "highlighter") {
      const id = crypto.randomUUID(), next = { ...base, drawings: [...base.drawings, { id, points: [p], color: effectiveTool === "highlighter" ? palette.highlighter : ink, width: effectiveTool === "highlighter" ? drawingSizes.highlighter : drawingSizes.pen, opacity: effectiveTool === "highlighter" ? .3 : 1 }] };
      setSelected(null); setPreview(next); setInputMode("drawing"); gesture.current = { mode: "draw", start: p, screen: p, base, pointer: input.pointerId, next }; checkpointGestureDraft(next, true);
    } else if (effectiveTool === "eraser") {
      const radius = drawingSizes.eraser / 2, next = eraseDrawingPaths(base, [p], radius);
      setSelected(null); setEraserCursor(p); setPreview(next); setInputMode("erasing"); gesture.current = { mode: "erase", start: p, screen: p, base, pointer: input.pointerId, next, eraseRadius: radius, erasePoints: [p] }; checkpointGestureDraft(next, true);
    } else if (effectiveTool === "line") {
      const id = crypto.randomUUID(), next = { ...base, drawings: [...base.drawings, { id, points: [p, p], color: ink, width: strokeWidth, opacity: 1 }] };
      setSelected({ kind: "drawings", id }); setPreview(next); setInputMode("drawing"); gesture.current = { mode: "line", start: p, screen: p, base, pointer: input.pointerId, next }; checkpointGestureDraft(next, true);
    } else if (effectiveTool === "rect" || effectiveTool === "ellipse" || effectiveTool === "triangle") {
      const id = crypto.randomUUID(), next = { ...base, shapes: [...base.shapes, { id, kind: effectiveTool, x: p.x, y: p.y, width: 1, height: 1, color: palette.fill }] };
      setSelected({ kind: "shapes", id }); setPreview(next); gesture.current = { mode: "shape", start: p, screen: p, base, pointer: input.pointerId, next }; checkpointGestureDraft(next, true);
    }
    if (input.capture) svg.current?.setPointerCapture(input.pointerId);
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (shouldUseIOSNativeTouch(e)) return;
    begin({ pointerId: e.pointerId, pointerType: e.pointerType, button: e.button, clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, preventDefault: () => e.preventDefault(), capture: true });
  };
  const moveAt = (pointerId: number, clientX: number, clientY: number, preventDefault: () => void) => {
    const g = gesture.current; if (!g || pointerId !== g.pointer) return;
    preventDefault();
    if (g.mode === "marquee") {
      autoPanPointer.current = { x: clientX, y: clientY }; scheduleAutoPan();
      updateMarquee(g, point(clientX, clientY, g.next));
      return;
    }
    const p = point(clientX, clientY, g.base), dx = p.x - g.start.x, dy = p.y - g.start.y;
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
    if (g.mode === "resize") {
      const selections = g.selections ?? [g.selection!];
      if (g.resizeHandle) next = resizeSelectionFromHandle(g.base, selections, g.resizeHandle, dx, dy);
      else { const r = selectionBounds(g.base, selections)!; next = resizeSelection(g.base, selections, r.width + dx, r.height + dy); }
    }
    if (g.mode === "rotate" && g.center !== undefined && g.startAngle !== undefined) { const angle = Math.atan2(p.y - g.center.y, p.x - g.center.x) * 180 / Math.PI; next = rotateSelection(g.base, g.selections ?? [g.selection!], angle - g.startAngle); }
    if (g.mode === "pan") next = { ...g.base, viewport: { ...g.base.viewport, x: g.base.viewport.x + clientX - g.screen.x, y: g.base.viewport.y + clientY - g.screen.y } };
    if (g.mode === "zoom" && g.zoomAnchor) {
      const factor = Math.exp((g.screen.y - clientY) * 0.004);
      next = { ...g.base, viewport: zoomViewportAtFactor(g.base.viewport, factor, g.zoomAnchor) };
    }
    if (g.mode === "draw") {
      const path = g.next.drawings.at(-1)!;
      if (path.points.length >= 20000) return;
      next = { ...g.next, drawings: [...g.base.drawings, { ...path, points: [...path.points, p] }] };
    }
    if (g.mode === "erase") {
      const previous = g.erasePoints?.at(-1) ?? g.start;
      next = eraseDrawingPaths(g.next, [previous, p], g.eraseRadius ?? drawingSizes.eraser / 2);
      g.erasePoints = [...(g.erasePoints ?? [g.start]), p];
      setEraserCursor(p);
    }
    if (g.mode === "line") {
      const path = g.next.drawings.at(-1)!;
      next = { ...g.next, drawings: [...g.base.drawings, { ...path, points: [g.start, p] }] };
    }
    if (g.mode === "shape") next = { ...g.next, shapes: [...g.base.shapes, { ...g.next.shapes.at(-1)!, x: Math.min(p.x, g.start.x), y: Math.min(p.y, g.start.y), width: Math.max(1, Math.abs(dx)), height: Math.max(1, Math.abs(dy)) }] };
    g.next = next; setPreview(next);
    if (["draw", "erase", "line", "shape"].includes(g.mode)) checkpointGestureDraft(next);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (shouldUseIOSNativeTouch(e)) return;
    moveAt(e.pointerId, e.clientX, e.clientY, () => e.preventDefault());
  };
  const finish = (cancel = false, releaseCapture = true) => {
    const g = gesture.current; if (!g) { setInputMode(pinch.current ? "pinching" : "idle"); return; }
    stopAutoPan(); autoPanLastAt.current = null;
    gesture.current = null; setPreview(null); setEraserCursor(null); setMarquee(null); setDropTarget(null); setGuides([]);
    if (g.mode === "marquee") { if (cancel) setSelections(g.selections ?? []); }
    if (!cancel && g.reparent && g.target) {
      g.next = reparentNode(g.next, g.selection!.id, g.target);
      g.next = autoLayoutMindMap(g.next, g.target);
    }
    if (!cancel && JSON.stringify(g.base) !== JSON.stringify(g.next)) {
      if (["draw", "erase", "line", "shape"].includes(g.mode)) checkpointGestureDraft(g.next, true);
      if ((g.mode === "pan" || g.mode === "zoom") && onViewportChange) onViewportChange({ ...boardRef.current, viewport: g.next.viewport });
      else onChange(g.next);
    }
    if (!cancel) {
      if (["draw", "line", "shape"].includes(g.mode)) emitGuideAction("canvas:draw");
      if (g.mode === "shape" && g.next.shapes.at(-1)?.kind === "rect") emitGuideAction("canvas:rectangle");
      if (g.mode === "erase") emitGuideAction("canvas:erase");
      if (g.mode === "marquee") emitGuideAction("canvas:select");
      if (g.mode === "move") emitGuideAction("canvas:move");
      if (g.mode === "pan") emitGuideAction("canvas:pan");
      if (g.mode === "zoom") emitGuideAction("canvas:zoom");
    }
    if (releaseCapture && svg.current?.hasPointerCapture(g.pointer)) svg.current.releasePointerCapture(g.pointer);
    setInputMode(pinch.current ? "pinching" : "idle");
  };
  const startPinch = (interactionBoard: BoardState, capturePointers: boolean) => {
    if (pinch.current || !svg.current) return false;
    const activeGesture = gesture.current;
    const cancelTouchStroke = (activeGesture?.mode === "draw" || activeGesture?.mode === "erase") && !touchSettings.drawWithFinger;
    const pinchBase = cancelTouchStroke ? interactionBoard : activeGesture?.next ?? interactionBoard;
    if (activeGesture) finish(!["draw", "erase"].includes(activeGesture.mode) || !touchSettings.drawWithFinger, false);
    const entries = [...touchPoints.current.entries()].slice(0, 2);
    if (entries.length < 2) return false;
    const first = entries[0][1], second = entries[1][1], rect = svg.current.getBoundingClientRect();
    const center = { x: (first.x + second.x) / 2 - rect.left, y: (first.y + second.y) / 2 - rect.top };
    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    pinch.current = { pointerIds: [entries[0][0], entries[1][0]], base: pinchBase, startDistance: distance,
      worldCenter: { x: (center.x - pinchBase.viewport.x) / pinchBase.viewport.scale, y: (center.y - pinchBase.viewport.y) / pinchBase.viewport.scale }, next: pinchBase };
    setInputMode("pinching");
    if (capturePointers) for (const [pointerId] of entries) if (!svg.current.hasPointerCapture(pointerId)) svg.current.setPointerCapture(pointerId);
    return true;
  };
  const updatePinch = (preventDefault: () => void, stopPropagation?: () => void) => {
    const active = pinch.current;
    if (!active || !svg.current) return false;
    const first = touchPoints.current.get(active.pointerIds[0]), second = touchPoints.current.get(active.pointerIds[1]);
    if (!first || !second) return false;
    const rect = svg.current.getBoundingClientRect(), distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    const scale = pinchScale(active.base.viewport.scale, distance / active.startDistance, touchSettings.zoomSensitivity, touchSettings.invertZoom);
    const center = { x: (first.x + second.x) / 2 - rect.left, y: (first.y + second.y) / 2 - rect.top };
    active.next = { ...active.base, viewport: { scale, x: center.x - active.worldCenter.x * scale, y: center.y - active.worldCenter.y * scale } };
    setPreview(active.next); preventDefault(); stopPropagation?.();
    return true;
  };
  const finishPinch = (cancel = false, preventDefault?: () => void, stopPropagation?: () => void) => {
    const active = pinch.current;
    if (!active) return false;
    pinch.current = null; setPreview(null); setInputMode("idle");
    if (!cancel && JSON.stringify(active.base.viewport) !== JSON.stringify(active.next.viewport)) {
      if (onViewportChange) onViewportChange(active.next);
      else onChange(active.next);
    }
    touchPoints.current.clear();
    for (const pointerId of active.pointerIds) if (svg.current?.hasPointerCapture(pointerId)) svg.current.releasePointerCapture(pointerId);
    preventDefault?.(); stopPropagation?.();
    return true;
  };
  const touchDownCapture = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (shouldUseIOSNativeTouch(e)) return;
    if (e.pointerType !== "touch") return;
    const interactionBoard = wheelPending.current ?? boardRef.current;
    commitWheelViewport();
    touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPoints.current.size !== 2) return;
    if (startPinch(interactionBoard, true)) { e.preventDefault(); e.stopPropagation(); }
  };
  const touchMoveCapture = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (shouldUseIOSNativeTouch(e)) return;
    if (e.pointerType !== "touch") return;
    touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    updatePinch(() => e.preventDefault(), () => e.stopPropagation());
  };
  const touchEndCapture = (e: ReactPointerEvent<SVGSVGElement>, cancel = false) => {
    if (shouldUseIOSNativeTouch(e)) return;
    if (e.pointerType !== "touch") return;
    touchPoints.current.delete(e.pointerId);
    finishPinch(cancel, () => e.preventDefault(), () => e.stopPropagation());
  };
  const cancelActiveInput = () => {
    stopAutoPan(); autoPanLastAt.current = null; autoPanPointer.current = null;
    const activeGesture = gesture.current;
    gesture.current = null; pinch.current = null; touchPoints.current.clear(); iosTouchActive.current = false;
    setPreview(null); setEraserCursor(null); setMarquee(null); setDropTarget(null); setGuides([]); setInputMode("idle");
    if (activeGesture && svg.current?.hasPointerCapture(activeGesture.pointer)) svg.current.releasePointerCapture(activeGesture.pointer);
  };
  const lostPointerCapture = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (shouldUseIOSNativeTouch(e)) return;
    touchPoints.current.delete(e.pointerId);
    if (gesture.current?.pointer === e.pointerId) {
      const preserve = ["draw", "erase", "line", "shape"].includes(gesture.current.mode);
      finish(!preserve, false);
    }
    if (pinch.current?.pointerIds.includes(e.pointerId)) { pinch.current = null; touchPoints.current.clear(); setPreview(null); setInputMode("idle"); }
  };
  useEffect(() => {
    if (!iosTouchFallback) return;
    const options: AddEventListenerOptions = { capture: true, passive: false };
    const updatePoints = (touches: TouchList) => {
      for (const touch of Array.from(touches)) touchPoints.current.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
    };
    const isStylusTouch = (touch: Touch) => "touchType" in touch && touch.touchType === "stylus";
    const handleTouchStart = (event: TouchEvent) => {
      if (!iosTouchActive.current && !isIOSCanvasTouchTarget(event.target)) return;
      if (!event.touches.length) return;
      if (Array.from(event.touches).some(isStylusTouch)) return;
      if (!iosTouchActive.current) { iosTouchActive.current = true; touchPoints.current.clear(); }
      updatePoints(event.touches);
      if (event.touches.length >= 2) {
        if (!pinch.current) startPinch(boardRef.current, false);
        event.preventDefault();
        return;
      }
      const touch = event.touches[0];
      const targetElement = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-element]") : null;
      const targetId = targetElement?.getAttribute("data-element");
      const targetSelection = targetId ? orderedElements(boardRef.current).find(selection => selection.id === targetId) : undefined;
      if (targetSelection && interactive && currentInputTool() !== "hand") {
        selectElementAt({ pointerId: touch.identifier, pointerType: "touch", button: 0, clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation() }, targetSelection);
        event.preventDefault();
        return;
      }
      begin({ pointerId: touch.identifier, pointerType: "touch", button: 0, clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => event.preventDefault() });
      event.preventDefault();
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!iosTouchActive.current) return;
      updatePoints(event.changedTouches);
      if (pinch.current) {
        updatePinch(() => event.preventDefault());
      } else {
        const activeGesture = gesture.current;
        for (const touch of Array.from(event.changedTouches)) {
          if (activeGesture?.pointer === touch.identifier) moveAt(touch.identifier, touch.clientX, touch.clientY, () => event.preventDefault());
        }
        if (gesture.current) event.preventDefault();
      }
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (!iosTouchActive.current) return;
      const changed = Array.from(event.changedTouches), cancel = event.type === "touchcancel";
      for (const touch of changed) touchPoints.current.delete(touch.identifier);
      const activePinch = pinch.current;
      if (activePinch) {
        if (cancel || changed.some(touch => activePinch.pointerIds.includes(touch.identifier))) finishPinch(cancel, () => event.preventDefault());
        else event.preventDefault();
      } else if (gesture.current && changed.some(touch => gesture.current?.pointer === touch.identifier)) {
        // WebKit can cancel a touch when it decides the finger is leaving the
        // page. Preserve an in-progress drawing in that case; pan/select
        // gestures should still be discarded as before.
        const preserveDrawing = cancel && ["draw", "erase"].includes(gesture.current.mode);
        finish(cancel && !preserveDrawing);
        event.preventDefault();
      } else {
        event.preventDefault();
      }
      if (cancel || event.touches.length === 0) { touchPoints.current.clear(); iosTouchActive.current = false; }
    };
    document.addEventListener("touchstart", handleTouchStart, options);
    document.addEventListener("touchmove", handleTouchMove, options);
    document.addEventListener("touchend", handleTouchEnd, options);
    document.addEventListener("touchcancel", handleTouchEnd, options);
    return () => {
      document.removeEventListener("touchstart", handleTouchStart, options);
      document.removeEventListener("touchmove", handleTouchMove, options);
      document.removeEventListener("touchend", handleTouchEnd, options);
      document.removeEventListener("touchcancel", handleTouchEnd, options);
      if (iosTouchActive.current) cancelActiveInput();
      iosTouchActive.current = false;
    };
  }, [iosTouchFallback, tool, heldTool, touchSettings, snap, readOnly, space, palette.highlighter, palette.fill, ink, strokeWidth, drawingSizes, board]);
  useEffect(() => {
    if (!gesture.current && !pinch.current) return;
    cancelActiveInput();
  }, [tool]);
  useEffect(() => {
    const preserveOrCancel = () => {
      const active = gesture.current;
      if (active && ["draw", "erase", "line", "shape"].includes(active.mode)) finish(false, false);
      else cancelActiveInput();
    };
    const visibility = () => { if (document.visibilityState !== "visible") preserveOrCancel(); };
    window.addEventListener("blur", preserveOrCancel);
    window.addEventListener("pagehide", preserveOrCancel);
    window.addEventListener("orientationchange", preserveOrCancel);
    document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", preserveOrCancel); window.removeEventListener("pagehide", preserveOrCancel); window.removeEventListener("orientationchange", preserveOrCancel); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  const duplicate = () => { const editableSelections = selections.filter(selection => !isLocked(selection)); if (!editableSelections.length) return; const next = duplicateSelection(board, editableSelections); setSelections(next.selection); onChange(next.board); };
  const copy = async () => { if (!selections.length) return; await copyCanvasSelection(board, selections); setHasCopy(true); };
  const paste = async () => {
    const content = await readCanvasSelection();
    if (content) { const next = pasteSelection(board, content.board, content.selection, content.offset); setSelections(next.selection); onChange(next.board); return; }
    const image = await readClipboardImage();
    if (image) void addMediaBlobs([{ blob: image, name: `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`, kind: "image" }]);
  };
  const remove = () => { const removable = selections.filter(selection => !isLocked(selection)); if (!removable.length) return; onChange(removeSelection(board, removable)); setSelected(null); };
  const relative = (sibling: boolean) => { if (selected?.kind !== "nodes" || selections.length !== 1) return; const next = addRelativeNode(board, selected.id, sibling, t("newNode")); if (next) { setTool("select"); edit(next.selection, next.board); } };
  const patch = (value: Record<string, unknown>) => { if (selected) onChange({ ...board, [selected.kind]: board[selected.kind].map(el => el.id === selected.id ? { ...el, ...value } : el) }); };
  const toggleTextPrefix = (prefix: "• " | "☐ ") => {
    if (selected?.kind !== "texts" || !selectedEl || !("text" in selectedEl)) return;
    const lines = selectedEl.text.split("\n"), enabled = lines.filter(Boolean).every(line => line.startsWith(prefix));
    patch({ text: lines.map(line => !line ? line : enabled ? line.slice(prefix.length) : `${prefix}${line.replace(/^(?:• |☐ )/, "")}`).join("\n") });
  };
  const applyAi = (result: SelectionAiResult) => {
    const next = result.action === "organize" && selectedMindMapRootId
      ? applyMindMapAiOperations(board, selectedMindMapRootId, result.operations, { fill: palette.fill })
      : applySelectionAi(board, selections, result, { ink: palette.ink, fill: palette.fill });
    if (next !== board) onChange(next);
    setAiOpen(false);
  };
  const openSource = async (documentId: string, page: number) => {
    setSourceError("");
    try { const source = await getDocumentSource({ documentId }); setSourceView({ url: source.url, name: source.name, kind: source.kind, page }); }
    catch { setSourceError(t("sourceError")); }
  };
  const visibleCanvasCenter = () => {
    const frameRect = frame.current?.getBoundingClientRect();
    const canvasRect = svg.current?.getBoundingClientRect();
    if (!frameRect) return { x: 0, y: 0 };
    if (!canvasRect) return { x: frameRect.width / 2, y: frameRect.height / 2 };
    return { x: canvasRect.left - frameRect.left + canvasRect.width / 2, y: canvasRect.top - frameRect.top + canvasRect.height / 2 };
  };
  const zoom = (factor: number) => {
    commitWheelViewport();
    const source = boardRef.current;
    const viewport = zoomViewportAtFactor(source.viewport, factor, visibleCanvasCenter());
    onChange({ ...source, viewport });
  };
  const resetZoom = () => {
    commitWheelViewport();
    const source = boardRef.current;
    const viewport = zoomViewportAtFactor(source.viewport, 1 / source.viewport.scale, visibleCanvasCenter());
    onChange({ ...source, viewport });
  };
  const addNode = () => {
    const parent = selected?.kind === "nodes" ? board.nodes.find(n => n.id === selected.id) : undefined;
    const id = crypto.randomUUID(), p = parent ? { x: parent.x + parent.width + 90, y: parent.y + 20 } : point((svg.current?.getBoundingClientRect().left ?? 0) + 250, (svg.current?.getBoundingClientRect().top ?? 0) + 180);
    const next = { ...board, nodes: [...board.nodes.map(n => n.id === parent?.id ? { ...n, collapsed: false } : n), { id, parentId: parent?.id, label: parent ? t("newNode") : t("rootNode"), ...p, width: 190, height: 76, color: palette.fill }] };
    const connected = parent ? connect(next, parent.id, id, "branch") : next;
    onChange(parent ? autoLayoutMindMap(connected, parent.id) : connected); setTool("select"); setSelected({ kind: "nodes", id });
  };
  const openMindMapLayout = () => { if (!board.nodes.length || editing) return; setMindMapLayoutBehaviorChoice(mindMapLayoutBehavior(board)); setMindMapLayoutOpen(true); setMobileMoreOpen(false); };
  const applyMindMapLayout = () => {
    const configured = { ...board, layoutMeta: { ...board.layoutMeta, mindMapBehavior: mindMapLayoutBehaviorChoice } };
    const result = arrangeMindMapMultiSided(configured, selectedMindMapRootId, mindMapLayoutSides, mindMapLayoutMode);
    setMindMapLayoutSummary(result.summary); onChange(result.board); setMindMapLayoutOpen(false);
  };
  const mindMapLayoutPreview = mindMapLayoutOpen ? arrangeMindMapMultiSided(board, selectedMindMapRootId, mindMapLayoutSides, mindMapLayoutMode).summary : null;

  useEffect(() => {
    const temporaryTools: Record<string, ToolMode> = { e: "eraser", h: "highlighter", v: "select" };
    const pdfFullscreenActive = () => {
      const active = document.fullscreenElement;
      return !!active?.closest(".document-viewer.is-fullscreen");
    };
    const setTemporaryTool = (next: ToolMode | null) => {
      heldToolRef.current = next;
      setHeldTool(next);
    };
    const keydown = (e: KeyboardEvent) => {
      if (pdfFullscreenActive()) return;
      if (e.key === "Control" || e.key === "Meta") { ctrlRef.current = true; return; }
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable=true], dialog")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === "Space") { e.preventDefault(); spaceRef.current = true; setSpace(true); return; }
      if (e.key === "Escape") { finish(true); setSelected(null); if (isFullscreen) onToggleFullscreen?.(); }
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
      if (!mod) {
        const temporary = temporaryTools[e.key.toLowerCase()];
        if (temporary) {
          e.preventDefault();
          if (!e.repeat && !keyboardToolPresses.current.has(e.key.toLowerCase())) {
            keyboardToolPresses.current.set(e.key.toLowerCase(), { tool: temporary, previous: tool, startedAt: performance.now() });
            setTemporaryTool(temporary);
          }
          return;
        }
        const item = tools.find(i => i.key.length === 1 && i.key.toLowerCase() === e.key.toLowerCase());
        if (item) setTool(item.id);
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") { ctrlRef.current = false; return; }
      if (e.code === "Space") { spaceRef.current = false; setSpace(false); return; }
      const key = e.key.toLowerCase();
      const press = keyboardToolPresses.current.get(key);
      if (!press) return;
      keyboardToolPresses.current.delete(key);
      setTemporaryTool(null);
      const duration = performance.now() - press.startedAt;
      setTool(toolAfterRelease(press.previous, press.tool, duration));
    };
    const blur = () => {
      ctrlRef.current = false; spaceRef.current = false; keyboardToolPresses.current.clear(); heldToolRef.current = null;
      setSpace(false); setHeldTool(null); toolbarToolPress.current = null; finish(true);
    };
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", blur); };
  });
  useEffect(() => {
    // Listen on the whole editor frame so diagonal trackpad gestures remain
    // available even when the pointer is over an SVG foreignObject.
    const el = frame.current; if (!el) return;
    const wheel = (e: WheelEvent) => {
      const zoomGesture = e.ctrlKey || e.metaKey;
      if (editRef.current || gesture.current || pinch.current) { if (zoomGesture) e.preventDefault(); return; }
      const target = e.target instanceof Element ? e.target : null;
      const controlTarget = target?.closest(".drawing-toolbar, .drawing-size-control, .mobile-quick-actions, .canvas-navigator, .zoom-control, .inspector-toggle, .canvas-fullscreen-toggle, .canvas-media video, .canvas-media audio");
      if (controlTarget && !zoomGesture) return;
      // A regular wheel over an embedded document/media belongs to that
      // viewer. Ctrl/⌘+wheel is intentionally handled by the canvas, however,
      // so the browser never zooms the entire page while the pointer is here.
      if (!zoomGesture && target?.closest(".canvas-embed-body")) return;
      const normalized = readWheelDelta(e);
      if (normalized.x === 0 && normalized.y === 0) return;
      e.preventDefault();
      const source = boardRef.current;
      const currentViewport = wheelPending.current?.viewport ?? source.viewport;
      const rect = el.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const pan = wheelPanDelta(normalized, e.altKey);
      const viewport = zoomGesture
        ? zoomViewportAtPoint(currentViewport, normalized.y, anchor)
        : panViewport(currentViewport, -pan.x, -pan.y);
      wheelPending.current = { ...source, viewport };
      scheduleWheelPreview();
      scheduleWheelCommit();
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { el.removeEventListener("wheel", wheel); commitWheelViewport(); };
  }, []);

  const editBounds = editing ? elementBounds(b, editing.selection) : null;
  const labelKey: Record<Selection["kind"], MessageKey> = { nodes: "node", shapes: "rect", drawings: "pen", texts: "text", media: "media", embeds: "embed", edges: "connector" };
  const backgroundLabel: Record<CanvasBackgroundPattern, MessageKey> = { dots: "backgroundDots", grid: "backgroundGrid", ruled: "backgroundRuled", graph: "backgroundGraph", isometric: "backgroundIsometric", plain: "backgroundPlain" };
  const backgroundPattern = typeof board.background === "string" ? board.background : "plain";
  const backgroundMedia = typeof board.background === "object" ? board.background : null;
  const selectedColor = selectedEl && "color" in selectedEl ? selectedEl.color ?? palette.fill : palette.ink;
  const selectedMedia = selected?.kind === "media" && selectedEl && "name" in selectedEl ? selectedEl : null;
  const selectedRotation = selectedEl && "rotation" in selectedEl ? selectedEl.rotation ?? 0 : 0;
  const selectedOpacity = selectedEl && "opacity" in selectedEl && typeof selectedEl.opacity === "number" ? clamp(selectedEl.opacity, 0, 1) : 1;
  const selectedLabelKey = selected?.kind === "shapes" && selectedEl && "kind" in selectedEl ? selectedEl.kind as MessageKey : selected ? labelKey[selected.kind] : "rect";
  const renderCanvasMedia = (media: CanvasMedia, renderedMediaSrc: string) => <div {...{ xmlns: "http://www.w3.org/1999/xhtml" }} className={`canvas-media ${media.kind}`} aria-label={`${t(media.kind)}: ${media.name}`}>
    <div className="canvas-media-frame">
      {media.kind === "image" && <div className="canvas-media-visual"><img src={renderedMediaSrc} alt={media.name} draggable={false} onError={iosTouchFallback ? () => setMediaError(t("mediaFormatUnsupported")) : undefined} style={cropStyle(media.crop)}/></div>}
      {media.kind === "video" && <div className="canvas-media-visual"><video src={renderedMediaSrc} controls preload="metadata" playsInline onLoadedMetadata={event => applyTrimStart(event.currentTarget, media)} onError={iosTouchFallback ? () => setMediaError(t("mediaFormatUnsupported")) : undefined} onTimeUpdate={event => enforceTrimEnd(event.currentTarget, media)} onPlay={event => { if (event.currentTarget.currentTime < mediaTrimStart(media)) event.currentTarget.currentTime = mediaTrimStart(media); }} onPointerDown={event => event.stopPropagation()} aria-label={media.name} style={cropStyle(media.crop)}/></div>}
      {media.kind === "audio" && <><AudioLines size={26} aria-hidden="true"/><audio src={renderedMediaSrc} controls preload="metadata" onLoadedMetadata={event => applyTrimStart(event.currentTarget, media)} onError={iosTouchFallback ? () => setMediaError(t("mediaFormatUnsupported")) : undefined} onTimeUpdate={event => enforceTrimEnd(event.currentTarget, media)} onPlay={event => { if (event.currentTarget.currentTime < mediaTrimStart(media)) event.currentTarget.currentTime = mediaTrimStart(media); }} onPointerDown={event => event.stopPropagation()} aria-label={media.name}/></>}
    </div>
    <div className="canvas-media-name" title={media.name}>{media.name}</div>
  </div>;
  const selectIOSOverlayElement = (event: ReactPointerEvent, selection: Selection) => {
    if (event.target instanceof HTMLMediaElement || event.target instanceof HTMLIFrameElement) { event.stopPropagation(); return; }
    selectElement(event, selection);
  };
  const updateCrop = (edge: keyof CanvasCrop, raw: number) => {
    if (!selectedMedia || !Number.isFinite(raw)) return;
    const crop = { ...DEFAULT_CROP, ...selectedMedia.crop, [edge]: clamp(raw, 0, 90) };
    if (crop.left + crop.right >= 100) crop[edge === "left" || edge === "right" ? edge : "left"] = Math.min(crop[edge === "left" || edge === "right" ? edge : "left"], 99 - (edge === "left" || edge === "right" ? (edge === "left" ? crop.right : crop.left) : crop.left));
    if (crop.top + crop.bottom >= 100) crop[edge === "top" || edge === "bottom" ? edge : "top"] = Math.min(crop[edge === "top" || edge === "bottom" ? edge : "top"], 99 - (edge === "top" || edge === "bottom" ? (edge === "top" ? crop.bottom : crop.top) : crop.top));
    patch({ crop });
  };
  const updateTrim = (key: "trimStart" | "trimEnd", raw: number | undefined) => {
    if (!selectedMedia || (raw !== undefined && (!Number.isFinite(raw) || raw < 0))) return;
    let value = raw;
    if (value !== undefined && key === "trimStart" && selectedMedia.trimEnd !== undefined && value >= selectedMedia.trimEnd) value = Math.max(0, selectedMedia.trimEnd - .1);
    if (value !== undefined && key === "trimEnd" && selectedMedia.trimStart !== undefined && value <= selectedMedia.trimStart) value = selectedMedia.trimStart + .1;
    patch({ [key]: value });
  };
  const activeTool = tools.find(item => item.id === tool) ?? tools[0];
  const activeToolDefinition = tools.find(item => item.id === activeToolMode) ?? activeTool;
  const drawingTool: DrawingToolName | null = tool === "pen" || tool === "highlighter" || tool === "eraser" ? tool : null;
  const drawingSize = drawingTool ? drawingSizes[drawingTool] : 0;
  const drawingSizeRange = drawingTool ? DRAWING_SIZE_RANGES[drawingTool] : null;
  const drawingSizeProgress = drawingTool && drawingSizeRange ? `${((drawingSize - drawingSizeRange.min) / Math.max(1, drawingSizeRange.max - drawingSizeRange.min)) * 100}%` : "0%";
  const visibleToolbarTools = tools.filter(item => visibleToolIds.includes(item.id));
  const hiddenToolbarTools = tools.filter(item => !visibleToolIds.includes(item.id));
  const ActiveToolIcon = activeToolDefinition.icon;
  const chooseTool = (id: ToolMode) => {
    finishEdit(); setTool(id); setSelected(null); setMobileMoreOpen(false);
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 620px)").matches) setToolbarExpanded(false);
  };
  const beginToolbarToolPress = (event: ReactPointerEvent<HTMLButtonElement>, id: ToolMode) => {
    if (event.button !== 0) return;
    const active = toolbarToolPress.current;
    if (active) {
      if (active.timer !== null) window.clearTimeout(active.timer);
      setTool(active.previous);
    }
    finishEdit();
    const previous = tool;
    setTool(id);
    setMobileMoreOpen(false);
    const state = { tool: id, previous, pointerId: event.pointerId, startedAt: performance.now(), timer: null as number | null, held: false };
    state.timer = window.setTimeout(() => {
      if (toolbarToolPress.current === state) toolbarToolPress.current = { ...state, held: true, timer: null };
    }, TOOL_HOLD_THRESHOLD_MS);
    toolbarToolPress.current = state;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is not available in jsdom/Safari fallback. */ }
  };
  const endToolbarToolPress = (event: ReactPointerEvent<HTMLButtonElement>, id: ToolMode) => {
    const state = toolbarToolPress.current;
    if (!state || state.tool !== id || state.pointerId !== event.pointerId) return;
    if (state.timer !== null) window.clearTimeout(state.timer);
    toolbarToolPress.current = null;
    const duration = performance.now() - state.startedAt;
    setTool(toolAfterRelease(state.previous, state.tool, duration));
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Pointer capture is not available in jsdom/Safari fallback. */ }
  };
  const toolbarToolEvents = (id: ToolMode) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => beginToolbarToolPress(event, id),
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => endToolbarToolPress(event, id),
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => endToolbarToolPress(event, id),
    onClick: (event: ReactMouseEvent<HTMLButtonElement>) => { if (event.detail === 0) chooseTool(id); },
  });
  return <div className={`editor-layout toolbar-${toolbarPosition} ${drawingTool ? "drawing-size-active" : ""} ${readOnly ? "editor-readonly" : ""} ${iosTouchFallback ? "ios-touch-fallback" : ""}`} aria-readonly={readOnly} data-input-mode={inputMode}>
    <div ref={frame} className="editor-frame" onDragOver={event => { if ([...event.dataTransfer.types].includes("Files")) event.preventDefault(); }} onDrop={event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); addCanvasFiles([...event.dataTransfer.files]); }} onPaste={event => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true], dialog")) return;
      const item = [...event.clipboardData.items].find(entry => entry.type.startsWith("image/"));
      const blob = item?.getAsFile();
      if (blob) { event.preventDefault(); void addMediaBlobs([{ blob, name: `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`, kind: "image" }]); }
      else void paste();
    }}>
      {onToggleFullscreen && <button type="button" className="canvas-fullscreen-toggle icon-button" aria-label={t(isFullscreen ? "exitFullscreen" : "maximizeCanvas")} title={t(isFullscreen ? "exitFullscreen" : "maximizeCanvas")} onClick={onToggleFullscreen}>{isFullscreen ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}</button>}
      {!readOnly && <MobileQuickActions hasSelection={selections.length > 0} canEditSelection={canEditSelection} canPaste onCopy={copy} onPaste={paste} onDuplicate={duplicate} onDelete={remove} canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo}/>}
      {!readOnly && <div ref={toolbar} className={`drawing-toolbar toolbar-${toolbarExpanded ? "expanded" : "collapsed"} ${toolbarOverflowing ? "toolbar-overflowing" : ""}`} role="toolbar" aria-label={t("properties")}>
        {!toolbarExpanded && <button type="button" className="toolbar-current-tool selected" aria-label={t(activeToolMode)} title={t(activeToolMode)} onClick={() => setToolbarExpanded(true)}><ActiveToolIcon size={18}/><span>{t(activeToolMode)}</span></button>}
        <button type="button" className="toolbar-toggle" aria-expanded={toolbarExpanded} aria-label={t(toolbarExpanded ? "collapseToolbar" : "expandToolbar")} title={t(toolbarExpanded ? "collapseToolbar" : "expandToolbar")} onClick={() => { toolbarUserExpanded.current = true; setToolbarExpanded(value => !value); }}>{toolbarExpanded ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}</button>
        <span ref={toolbarTools} className="drawing-toolbar-tools" onScroll={() => {
          if (!showToolbarSwipeHint) return;
          setShowToolbarSwipeHint(false);
          try { localStorage.setItem("mindcanvas:mobile-toolbar-swiped:v1", "true"); } catch {}
        }}>{visibleToolbarTools.map(({ id, icon: Icon, key }) =>
          <button key={id} data-tool={id} className={`${tool === id ? "selected" : ""} ${["select", "hand", "text", "pen", "highlighter", "eraser"].includes(id) ? "mobile-primary-tool" : "mobile-secondary-tool"}`} aria-pressed={tool === id} aria-label={t(id)} title={t(id) + " (" + key + ")"} {...toolbarToolEvents(id)}><Icon size={19}/></button>)}
        <span className="toolbar-divider"/><button className="mobile-extra-action" aria-label={t("node")} title={t("node")} onClick={addNode}><Plus size={20}/></button>
        <button className="mobile-extra-action" aria-label={t("insertMedia")} title={t("insertMediaHint")} onClick={openMediaPicker}><ImagePlus size={19}/></button>
        <button className="mobile-extra-action" aria-label={t("embedWeb")} title={t("embedHint")} onClick={() => { finishEdit(); setMediaError(""); setEmbedOpen(true); }}><Globe2 size={19}/></button>
        <button className="mobile-extra-action" aria-label={t("pasteImage")} title={t("pasteImageHint")} onClick={() => void addClipboardImage()}><ClipboardPaste size={18}/></button>
        <button className={`${isRecording ? "selected recording-button" : ""} mobile-extra-action`} aria-pressed={isRecording} aria-label={t(isRecording ? "stopRecording" : "recordAudio")} title={t(isRecording ? "stopRecording" : "recordAudio")} onClick={() => isRecording ? stopRecording() : void startRecording()}>{isRecording ? <Square size={17}/> : <Mic size={19}/>}</button>
        {isRecording && <span className="recording-time" role="status">{t("recording", { seconds: recordingSeconds })}</span>}
        <button className={`${snap ? "selected" : ""} mobile-extra-action`} aria-pressed={snap} aria-label={t("snap")} title={t("snap")} onClick={() => setSnap(v => !v)}><Magnet size={18}/></button>
        <button className="mobile-extra-action" aria-label={t("arrangeMap")} title={t("arrangeMap")} disabled={!board.nodes.length || !!editing} onClick={() => { setSelected(null); setMindMapLayoutSummary(null); onChange(arrangeMindMap(board)); }}><Network size={20}/></button>
        <button className="mobile-extra-action" aria-label={t("arrangeMapTwoSided")} title={t("arrangeMapTwoSided")} disabled={!board.nodes.length || !!editing} onClick={() => { setSelected(null); const result = arrangeMindMapTwoSided(board); setMindMapLayoutSummary(result.summary); onChange(result.board); }}><GitFork size={20}/></button>
        <button className="mobile-extra-action" aria-label={t("arrangeMapSmart")} title={t("arrangeMapSmart")} disabled={!board.nodes.length || !!editing} onClick={openMindMapLayout}><Network size={20}/></button>
        <span className="toolbar-divider mobile-extra-action"/><button className="mobile-extra-action" aria-label={t("askAiSelection")} title={!selectedStudyText ? t("selectTextForAi") : !canUseAi ? t("aiManualHint") : t("askAiSelection")} disabled={!selectedStudyText} onClick={() => setAiOpen(true)}><Sparkles size={19}/></button><button type="button" className="canvas-more-tools-trigger" aria-label={t("moreTools")} title={t("moreTools")} aria-expanded={mobileMoreOpen} onClick={() => setMobileMoreOpen(value => !value)}><MoreHorizontal size={20}/></button></span>
        {toolbarExpanded && toolbarOverflowing && showToolbarSwipeHint && <span className="toolbar-swipe-hint" role="status">{t("swipeForMore")}</span>}
      </div>}
      {!readOnly && drawingTool && drawingSizeRange && <div className={`drawing-size-control drawing-size-${drawingTool}`} role="group" aria-label={t(drawingSizeLabelKey[drawingTool])}>
        <ActiveToolIcon size={14}/><span className="drawing-size-label">{t(drawingSizeLabelKey[drawingTool])}</span><input type="range" min={drawingSizeRange.min} max={drawingSizeRange.max} step={drawingSizeRange.step} value={drawingSize} aria-label={t(drawingSizeLabelKey[drawingTool])} style={{ "--range-progress": drawingSizeProgress } as CSSProperties} onChange={event => setDrawingSizes(current => ({ ...current, [drawingTool]: clampDrawingSize(drawingTool, event.target.valueAsNumber) }))}/><output>{drawingSize}px</output><span className="drawing-size-sample" style={{ width: `${Math.min(18, Math.max(6, drawingSize / 3))}px`, height: `${Math.min(18, Math.max(6, drawingSize / 3))}px` }}/>
      </div>}
      <input ref={mediaInput} className="media-file-input" hidden={!iosTouchFallback} aria-label={t("insertMedia")} type="file" accept={`${iosTouchFallback ? "image/*,video/*,audio/*,.heic,.heif,.mov,.m4a" : "image/*,video/*,audio/*"},${DOCUMENT_ACCEPT}`} multiple onChange={event => { const files = [...(event.currentTarget.files ?? [])]; event.currentTarget.value = ""; addCanvasFiles(files); }}/>
      <svg ref={svg} tabIndex={0} aria-label="Canvas" data-selection-tool={activeToolMode === "select" ? "pointer" : undefined} className={`canvas-svg tool-${activeToolMode} ${activeToolMode === "select" ? "selection-pointer" : ""}`}
        onPointerDownCapture={touchDownCapture} onPointerMoveCapture={touchMoveCapture} onPointerUpCapture={e => { if (!shouldUseIOSNativeTouch(e)) touchEndCapture(e); }} onPointerCancelCapture={e => { if (!shouldUseIOSNativeTouch(e)) touchEndCapture(e, true); }}
        onPointerDown={down} onPointerMove={move} onPointerUp={e => { if (!shouldUseIOSNativeTouch(e) && gesture.current?.pointer === e.pointerId) finish(); }} onPointerCancel={e => { if (!shouldUseIOSNativeTouch(e) && gesture.current?.pointer === e.pointerId) finish(true); }} onLostPointerCapture={lostPointerCapture}>
        <CanvasBackground board={b}/>
        <defs><marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10z" fill="var(--connector)"/></marker></defs>
        <g data-canvas-viewport="true" transform={`translate(${b.viewport.x} ${b.viewport.y}) scale(${b.viewport.scale})`}>
          <LayerStack board={b} interactive={interactive}>
          {b.embeds.filter(embed => !hiddenElements.has(embed.id)).map(embed => {
            const embedSelection = { kind: "embeds" as const, id: embed.id };
            const selectEmbed = (event: ReactPointerEvent) => {
              if (event.target instanceof HTMLIFrameElement || event.target instanceof HTMLMediaElement) { event.stopPropagation(); return; }
              if (activeToolMode !== "select" && activeToolMode !== "connector") return;
              selectElement(event, embedSelection);
            };
            const allowCanvasPointer = (event: ReactPointerEvent) => {
              const target = event.target instanceof Element ? event.target : null;
              const onPdfPage = !!target?.closest(".pdf-page-stack, .pdf-page-shell, .document-pdf-body");
              const drawingMode = ["pen", "highlighter", "eraser", "line", "rect", "ellipse", "triangle"].includes(activeToolMode);
              if (activeToolMode === "hand" || event.ctrlKey || event.metaKey || (drawingMode && onPdfPage) || ((activeToolMode === "select" || activeToolMode === "connector") && onPdfPage)) return;
              event.stopPropagation();
            };
            return <g key={embed.id} data-element={embed.id} data-ios-embed-renderer={iosTouchFallback ? "overlay" : undefined} opacity={embed.opacity ?? 1} transform={`rotate(${embed.rotation ?? 0} ${embed.x + embed.width / 2} ${embed.y + embed.height / 2})`} onPointerDown={selectEmbed}>
              {iosTouchFallback ? <rect x={embed.x} y={embed.y} width={embed.width} height={embed.height} rx="10" fill="var(--surface-raised)" stroke="var(--line)" pointerEvents={interactive ? "auto" : "none"}/> : <foreignObject x={embed.x} y={embed.y} width={embed.width} height={embed.height} pointerEvents={interactive ? "auto" : "none"} onPointerDown={selectEmbed}>
                <div {...{ xmlns: "http://www.w3.org/1999/xhtml" }} className={`canvas-embed ${embed.kind}`} aria-label={`${t("embed")}: ${embed.title || embed.url}`}>
                  <div className="canvas-embed-header" onPointerDown={selectEmbed}><Globe2 size={14}/><span title={embed.url}>{embed.title || (embed.kind === "youtube" ? t("youtube") : embed.kind === "video" ? t("video") : t("webPage"))}</span></div>
                  <div className="canvas-embed-body" onPointerDown={allowCanvasPointer}>
                    {embed.kind === "document" ? <DocumentViewer embedded source={{ dataUrl: embed.url, name: embed.fileName || embed.title || "Tài liệu", mimeType: embed.mimeType || "application/octet-stream", kind: documentKindFor(embed.fileName || embed.title || "", embed.mimeType || "") || "pdf" }} /> : embed.kind === "video" ? <video src={embed.url} controls playsInline preload="metadata" aria-label={embed.title || embed.url}/> : <iframe src={embed.url} title={embed.title || embed.url} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>}
                  </div>
                </div>
              </foreignObject>}
            </g>;
          })}
          {b.media.filter(media => !hiddenElements.has(media.id)).map(media => {
            const mediaSelection = { kind: "media" as const, id: media.id };
            const renderedMediaSrc = iosMediaSources[media.id] ?? media.src;
            const nativeIOSImage = iosTouchFallback && media.kind === "image" ? iosNativeImageGeometry(media) : null;
            const selectMedia = (event: ReactPointerEvent) => {
              if (event.target instanceof HTMLMediaElement) { event.stopPropagation(); return; }
              selectElement(event, mediaSelection);
            };
            return <g key={media.id} data-element={media.id} opacity={media.opacity ?? 1} transform={`rotate(${media.rotation ?? 0} ${media.x + media.width / 2} ${media.y + media.height / 2})`} onPointerDown={selectMedia}>
              {nativeIOSImage ? <g data-ios-media-renderer="native" pointerEvents={interactive ? "auto" : "none"}>
                <defs><clipPath id={nativeIOSImage.clipId}><rect x={media.x} y={media.y} width={media.width} height={nativeIOSImage.visualHeight}/></clipPath></defs>
                <rect x={media.x} y={media.y} width={media.width} height={media.height} rx="10" fill="var(--surface-raised)"/>
                <image data-ios-media-image="true" href={renderedMediaSrc} xlinkHref={renderedMediaSrc} x={nativeIOSImage.imageX} y={nativeIOSImage.imageY} width={nativeIOSImage.imageWidth} height={nativeIOSImage.imageHeight} preserveAspectRatio="none" clipPath={`url(#${nativeIOSImage.clipId})`} aria-label={media.name} onError={() => setMediaError(t("mediaFormatUnsupported"))}/>
                <rect x={media.x} y={media.y + nativeIOSImage.visualHeight} width={media.width} height={nativeIOSImage.labelHeight} fill="var(--surface-raised)"/>
                <line x1={media.x} y1={media.y + nativeIOSImage.visualHeight} x2={media.x + media.width} y2={media.y + nativeIOSImage.visualHeight} stroke="var(--line)"/>
                <rect x={media.x} y={media.y} width={media.width} height={media.height} rx="10" fill="none" stroke="var(--line)"/>
                <text x={media.x + 8} y={media.y + nativeIOSImage.visualHeight + nativeIOSImage.labelHeight / 2} fontSize="11" fill="var(--muted)" dominantBaseline="middle" pointerEvents="none">{media.name}</text>
              </g> : iosTouchFallback ? <g data-ios-media-renderer="overlay" pointerEvents={interactive ? "auto" : "none"}>
                <rect x={media.x} y={media.y} width={media.width} height={media.height} rx="10" fill="var(--surface-raised)" stroke="var(--line)"/>
                <text x={media.x + 8} y={media.y + media.height / 2} fontSize="11" fill="var(--muted)" dominantBaseline="middle" pointerEvents="none">{media.name}</text>
              </g> : <foreignObject x={media.x} y={media.y} width={media.width} height={media.height} pointerEvents={interactive ? "auto" : "none"} onPointerDown={selectMedia}>
                <div {...{ xmlns: "http://www.w3.org/1999/xhtml" }} className={`canvas-media ${media.kind}`} aria-label={`${t(media.kind)}: ${media.name}`}>
                  <div className="canvas-media-frame">
                    {media.kind === "image" && <div className="canvas-media-visual"><img src={iosTouchFallback ? renderedMediaSrc : media.src} alt={media.name} draggable={false} onError={iosTouchFallback ? () => setMediaError(t("mediaFormatUnsupported")) : undefined} style={cropStyle(media.crop)}/></div>}
                    {media.kind === "video" && <div className="canvas-media-visual"><video src={renderedMediaSrc} controls preload="metadata" playsInline onLoadedMetadata={event => applyTrimStart(event.currentTarget, media)} onError={iosTouchFallback ? () => setMediaError(t("mediaFormatUnsupported")) : undefined} onTimeUpdate={event => enforceTrimEnd(event.currentTarget, media)} onPlay={event => { if (event.currentTarget.currentTime < mediaTrimStart(media)) event.currentTarget.currentTime = mediaTrimStart(media); }} onPointerDown={event => event.stopPropagation()} aria-label={media.name} style={cropStyle(media.crop)}/></div>}
                    {media.kind === "audio" && <><AudioLines size={26} aria-hidden="true"/><audio src={renderedMediaSrc} controls preload="metadata" onLoadedMetadata={event => applyTrimStart(event.currentTarget, media)} onError={iosTouchFallback ? () => setMediaError(t("mediaFormatUnsupported")) : undefined} onTimeUpdate={event => enforceTrimEnd(event.currentTarget, media)} onPlay={event => { if (event.currentTarget.currentTime < mediaTrimStart(media)) event.currentTarget.currentTime = mediaTrimStart(media); }} onPointerDown={event => event.stopPropagation()} aria-label={media.name}/></>}
                  </div>
                  <div className="canvas-media-name" title={media.name}>{media.name}</div>
                </div>
              </foreignObject>}
            </g>;
          })}
          {b.shapes.filter(s => !hiddenElements.has(s.id)).map(s => <g key={s.id} data-element={s.id} className={`canvas-connectable ${connectorSource?.id === s.id ? "connector-source" : ""} ${connectorPulseIds.has(s.id) ? "connector-pulse" : ""}`} opacity={s.opacity ?? 1} transform={`rotate(${s.rotation ?? 0} ${s.x + s.width / 2} ${s.y + s.height / 2})`} onPointerDown={e => selectElement(e, { kind: "shapes", id: s.id })}>
            {s.kind === "rect" ? <rect x={s.x} y={s.y} width={s.width} height={s.height} rx="6" fill={s.color} stroke="var(--element-stroke)"/> : s.kind === "ellipse" ? <ellipse cx={s.x + s.width / 2} cy={s.y + s.height / 2} rx={s.width / 2} ry={s.height / 2} fill={s.color} stroke="var(--element-stroke)"/> : <polygon points={`${s.x + s.width / 2},${s.y} ${s.x + s.width},${s.y + s.height} ${s.x},${s.y + s.height}`} fill={s.color} stroke="var(--element-stroke)" strokeLinejoin="round"/>}</g>)}
          {b.drawings.filter(p => !hiddenElements.has(p.id)).map(p => { const r = elementBounds(b, { kind: "drawings", id: p.id })!; return <g key={p.id} data-element={p.id} transform={`rotate(${p.rotation ?? 0} ${r.x + r.width / 2} ${r.y + r.height / 2})`} onPointerDown={e => selectElement(e, { kind: "drawings", id: p.id })}>
            <path d={pathData(p.points)} fill="none" stroke={p.color} strokeWidth={p.width} opacity={p.opacity} strokeLinecap="round" strokeLinejoin="round"/>
            <path d={pathData(p.points)} fill="none" stroke="transparent" strokeWidth={Math.max(12 / b.viewport.scale, p.width)} pointerEvents={interactive ? "stroke" : "none"}/></g>; })}
          {b.edges.map(e => {
            if (hiddenElements.has(e.id) || hiddenElements.has(e.source) || hiddenElements.has(e.target)) return null;
            const s = [...b.nodes, ...b.shapes].find(n => n.id === e.source), d = [...b.nodes, ...b.shapes].find(n => n.id === e.target); if (!s || !d) return null;
            const geometry = connectorGeometry(b, e); if (!geometry) return null;
            const { path, midpoint } = geometry;
            const connectionPulse = connectorPulseIds.has(e.source) && connectorPulseIds.has(e.target);
            return <g key={e.id} data-element={e.id} className={`${connectionPulse ? "connector-edge-pulse" : ""} ${e.kind === "relation" ? "connector-relation" : "connector-branch"}`} opacity={e.opacity ?? 1} onPointerDown={ev => selectElement(ev, { kind: "edges", id: e.id })}><path d={path} fill="none" stroke={selected?.id === e.id ? "var(--accent)" : "var(--connector)"} strokeWidth="2" strokeDasharray={e.kind === "relation" ? "7 5" : undefined} markerEnd="url(#canvas-arrow)"/><path d={path} fill="none" stroke="transparent" strokeWidth="14" pointerEvents={interactive ? "stroke" : "none"}/>{e.label && <text x={midpoint.x} y={midpoint.y - 8} textAnchor="middle" fontSize="13" fill="var(--muted)" pointerEvents="none">{e.label}</text>}</g>;
          })}
          {b.texts.filter(text => !hiddenElements.has(text.id)).map(text => { const r = elementBounds(b, { kind: "texts", id: text.id })!; const textSelection = { kind: "texts" as const, id: text.id }; return <g key={text.id} data-element={text.id} data-text-editable="true" opacity={text.opacity ?? 1} transform={`rotate(${text.rotation ?? 0} ${r.x + r.width / 2} ${r.y + r.height / 2})`} onPointerDown={e => selectElement(e, textSelection)}
            onDoubleClick={e => openInlineEditor(e, textSelection)}>
            <foreignObject x={r.x} y={r.y} width={r.width} height={r.height} data-text-editable="true" onDoubleClick={e => openInlineEditor(e, textSelection)}><div className="canvas-copy" data-text-editable="true" onDoubleClick={e => openInlineEditor(e, textSelection)} style={{ fontSize: text.fontSize ?? 16, color: canvasTextColor(text.color), backgroundColor: text.backgroundColor, fontWeight: text.bold ? 700 : 400, fontStyle: text.italic ? "italic" : "normal", textDecoration: text.underline ? "underline" : "none", textAlign: text.textAlign ?? "left" }}>{editing?.selection.id === text.id ? "" : text.text}</div></foreignObject>
          </g>; })}
          {b.nodes.filter(n => !hiddenElements.has(n.id)).map(n => { const nodeSelection = { kind: "nodes" as const, id: n.id }; return <g key={n.id} data-element={n.id} data-text-editable="true" className={`mind-node ${connectorSource?.id === n.id ? "connector-source" : ""} ${connectorPulseIds.has(n.id) ? "connector-pulse" : ""}`} opacity={n.opacity ?? 1} transform={`rotate(${n.rotation ?? 0} ${n.x + n.width / 2} ${n.y + n.height / 2})`} onPointerDown={e => selectElement(e, nodeSelection)}
            onDoubleClick={e => openInlineEditor(e, nodeSelection)}>
            <rect x={n.x} y={n.y} width={n.width} height={n.height} rx="12" fill={n.color ?? "var(--node-fill)"} stroke={dropTarget === n.id ? "var(--accent)" : "var(--element-stroke)"} strokeWidth={dropTarget === n.id ? 3 : 1}/>
            <foreignObject x={n.x + 12} y={n.y + 10} width={Math.max(12, n.width - 24)} height={Math.max(12, n.height - 20)} data-text-editable="true" onDoubleClick={e => openInlineEditor(e, nodeSelection)}><div className="node-copy" data-text-editable="true" onDoubleClick={e => openInlineEditor(e, nodeSelection)} style={{ color: readableTextColor(n.color) }}>{editing?.selection.id === n.id ? "" : n.label}{n.sourcePage && (n.sourceDocumentId ? <button className="source-page-link" title={t("openSource")} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); void openSource(n.sourceDocumentId!, n.sourcePage!); }}><FileText size={12}/>{t("page")} {n.sourcePage}</button> : <small>{t("page")} {n.sourcePage}</small>)}{n.collapsed && <small>…</small>}</div></foreignObject>
            {(selectedMindMapHierarchy.children.get(n.id)?.length ?? 0) > 0 && <g role="button" tabIndex={0} aria-label={t(n.collapsed ? "expand" : "collapse") + ": " + n.label} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onChange({ ...board, nodes: board.nodes.map(item => item.id === n.id ? { ...item, collapsed: !item.collapsed } : item) }); }} onKeyDown={e => { if (["Enter", " "].includes(e.key)) { e.preventDefault(); e.stopPropagation(); onChange({ ...board, nodes: board.nodes.map(item => item.id === n.id ? { ...item, collapsed: !item.collapsed } : item) }); } }}><circle cx={n.x + n.width} cy={n.y + n.height / 2} r={10} fill="var(--surface-raised)" stroke="var(--accent)"/><text x={n.x + n.width} y={n.y + n.height / 2 + 5} textAnchor="middle" fontSize={16} fill="var(--accent)">{n.collapsed ? "+" : "−"}</text></g>}
          </g>; })}
          </LayerStack>
          {eraserCursor && activeToolMode === "eraser" && <circle className="eraser-cursor" cx={eraserCursor.x} cy={eraserCursor.y} r={drawingSizes.eraser / 2} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={1 / b.viewport.scale} pointerEvents="none"/>}
          {guides.map((guide, index) => guide.axis === "x"
            ? <line key={`x-${index}`} className="smart-guide" x1={guide.value} y1={guide.from} x2={guide.value} y2={guide.to} strokeWidth={1 / b.viewport.scale}/>
            : <line key={`y-${index}`} className="smart-guide" x1={guide.from} y1={guide.value} x2={guide.to} y2={guide.value} strokeWidth={1 / b.viewport.scale}/>)}
          {marquee && <rect {...marquee} fill="color-mix(in srgb, var(--accent) 12%, transparent)" stroke="var(--accent)" strokeWidth={1 / b.viewport.scale} pointerEvents="none"/>}
          {selections.length > 1 && selections.map(s => { const r = elementBounds(b, s); return r && <rect key={s.id} {...r} fill="none" stroke="var(--accent)" strokeDasharray="4 3" pointerEvents="none"/>; })}
          {bounds && selected && !editing && activeToolMode === "select" && <g className="selection-box">
            <rect x={bounds.x - 3} y={bounds.y - 3} width={bounds.width + 6} height={bounds.height + 6} fill="none" stroke="var(--accent)" strokeWidth={1.5 / b.viewport.scale} pointerEvents="none"/>
            {selected.kind !== "edges" && RESIZE_HANDLES.map(handle => {
              const x = handle.x === "left" ? bounds.x : handle.x === "right" ? bounds.x + bounds.width : bounds.x + bounds.width / 2;
              const y = handle.y === "top" ? bounds.y : handle.y === "bottom" ? bounds.y + bounds.height : bounds.y + bounds.height / 2;
              return <rect key={handle.id} data-resize-handle={handle.id} className={`resize-handle resize-${handle.id}`} x={x - 4 / b.viewport.scale} y={y - 4 / b.viewport.scale} width={8 / b.viewport.scale} height={8 / b.viewport.scale} fill="var(--surface-raised)" stroke="var(--accent)" strokeWidth={1 / b.viewport.scale}
                onPointerDown={e => { if (e.ctrlKey || e.metaKey || ctrlRef.current) return; e.preventDefault(); e.stopPropagation(); svg.current?.setPointerCapture(e.pointerId); gesture.current = { mode: "resize", start: point(e.clientX, e.clientY), screen: { x: e.clientX, y: e.clientY }, base: board, selection: selected, selections, pointer: e.pointerId, next: board, resizeHandle: handle.id }; }}/>;
            })}
            {selected.kind !== "edges" && <g className="rotation-handle" onPointerDown={e => { if (e.ctrlKey || e.metaKey || ctrlRef.current) return; e.preventDefault(); e.stopPropagation(); const p = point(e.clientX, e.clientY); const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }; svg.current?.setPointerCapture(e.pointerId); gesture.current = { mode: "rotate", start: p, screen: { x: e.clientX, y: e.clientY }, base: board, selection: selected, selections, pointer: e.pointerId, next: board, center, startAngle: Math.atan2(p.y - center.y, p.x - center.x) * 180 / Math.PI }; }}><line x1={bounds.x + bounds.width / 2} y1={bounds.y - 3} x2={bounds.x + bounds.width / 2} y2={bounds.y - 25} stroke="var(--accent-2)"/><circle cx={bounds.x + bounds.width / 2} cy={bounds.y - 30} r={6 / b.viewport.scale} fill="var(--surface-raised)" stroke="var(--accent-2)"/></g>}
          </g>}
          {editing && editBounds && <foreignObject x={editBounds.x} y={editBounds.y} width={Math.max(editBounds.width, 120)} height={Math.max(editBounds.height, 100)}>
            <textarea className="inline-editor" autoFocus aria-label={t("editText")} placeholder={t("newText")} maxLength={10000}
              style={{ fontSize: selectedEl && "fontSize" in selectedEl ? selectedEl.fontSize ?? 16 : 16, fontWeight: selectedEl && "bold" in selectedEl && selectedEl.bold ? 700 : 400, fontStyle: selectedEl && "italic" in selectedEl && selectedEl.italic ? "italic" : "normal", textDecoration: selectedEl && "underline" in selectedEl && selectedEl.underline ? "underline" : "none", textAlign: selectedEl && "textAlign" in selectedEl ? selectedEl.textAlign ?? "left" : "left" }}
              value={editing.value} onChange={e => { const next = { ...editing, value: e.target.value }; editRef.current = next; setEditing(next); }}
              onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onBlur={() => finishEdit()}
              onKeyDown={e => { e.stopPropagation(); if (e.nativeEvent.isComposing) return; if (e.key === "Escape") { e.preventDefault(); finishEdit(true); } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); finishEdit(); } }}/></foreignObject>}
        </g>
      </svg>
      {iosTouchFallback && iosOverlayItems.length > 0 && <div className="ios-media-overlay" data-ios-media-overlay="true" aria-label={t("media")}>
        {iosOverlayItems.map(item => {
          const element = item.source === "media" ? b.media.find(media => media.id === item.id) : b.embeds.find(embed => embed.id === item.id);
          if (!element) return null;
          const selection = item.source === "media" ? { kind: "media" as const, id: item.id } : { kind: "embeds" as const, id: item.id };
          return <div key={`${item.source}-${item.id}`} className="ios-media-overlay-item" data-ios-overlay-item={item.id} style={{ left: item.left, top: item.top, width: item.screenWidth, height: item.screenHeight, opacity: item.opacity, transform: `rotate(${item.rotation}deg)`, transformOrigin: "center center", pointerEvents: activeToolMode === "select" || activeToolMode === "connector" ? "auto" : "none" }} onPointerDown={event => selectIOSOverlayElement(event, selection)}>
            {item.source === "media" && "src" in element ? renderCanvasMedia(element, iosMediaSources[element.id] ?? element.src) : "url" in element ? <div {...{ xmlns: "http://www.w3.org/1999/xhtml" }} className={`canvas-embed ${element.kind}`} aria-label={`${t("embed")}: ${element.title || element.url}`}>
              <div className="canvas-embed-header" onPointerDown={event => selectIOSOverlayElement(event, selection)}><Globe2 size={14}/><span title={element.url}>{element.title || (element.kind === "youtube" ? t("youtube") : element.kind === "video" ? t("video") : t("webPage"))}</span></div>
              <div className="canvas-embed-body" onPointerDown={event => event.stopPropagation()}>
                {element.kind === "document" ? <DocumentViewer embedded source={{ dataUrl: element.url, name: element.fileName || element.title || "Tài liệu", mimeType: element.mimeType || "application/octet-stream", kind: documentKindFor(element.fileName || element.title || "", element.mimeType || "") || "pdf" }} /> : element.kind === "video" ? <video src={element.url} controls playsInline preload="metadata" aria-label={element.title || element.url}/> : <iframe src={element.url} title={element.title || element.url} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>}
              </div>
            </div> : null}
          </div>;
        })}
      </div>}
      {mobileMoreOpen && !readOnly && <div className="canvas-tools-sheet-backdrop" onClick={() => setMobileMoreOpen(false)}><aside className="canvas-tools-sheet" aria-label={t("moreTools")} onClick={event => event.stopPropagation()}>
        <header><strong>{t("moreTools")}</strong><button className="icon-button" aria-label={t("close")} onClick={() => setMobileMoreOpen(false)}><X size={18}/></button></header>
        <div className="canvas-tools-sheet-grid">{[...hiddenToolbarTools, ...tools.filter(item => visibleToolIds.includes(item.id) && ["line", "rect", "ellipse", "triangle", "connector"].includes(item.id))].map(({ id, icon: Icon }) => <button key={id} className={tool === id ? "selected" : ""} {...toolbarToolEvents(id)}><Icon size={19}/><span>{t(id)}</span></button>)}
          <button onClick={() => { addNode(); setMobileMoreOpen(false); }}><Plus size={19}/><span>{t("node")}</span></button>
          <button onClick={() => { openMediaPicker(); setMobileMoreOpen(false); }}><ImagePlus size={19}/><span>{t("insertMedia")}</span></button>
          <button onClick={() => { setEmbedOpen(true); setMobileMoreOpen(false); }}><Globe2 size={19}/><span>{t("embedWeb")}</span></button>
          {iosTouchFallback && <button onClick={() => { void paste(); setMobileMoreOpen(false); }}><ClipboardPaste size={19}/><span>{t("pasteImage")}</span></button>}
          {iosTouchFallback && <button className={isRecording ? "selected recording-button" : ""} aria-pressed={isRecording} onClick={() => { if (isRecording) stopRecording(); else void startRecording(); setMobileMoreOpen(false); }}>{isRecording ? <Square size={19}/> : <Mic size={19}/>}<span>{t(isRecording ? "stopRecording" : "recordAudio")}</span></button>}
          {iosTouchFallback && <button disabled={!board.nodes.length || !!editing} onClick={() => { setSelected(null); setMindMapLayoutSummary(null); onChange(arrangeMindMap(board)); setMobileMoreOpen(false); }}><Network size={19}/><span>{t("arrangeMap")}</span></button>}
          {iosTouchFallback && <button disabled={!board.nodes.length || !!editing} onClick={() => { setSelected(null); const result = arrangeMindMapTwoSided(board); setMindMapLayoutSummary(result.summary); onChange(result.board); setMobileMoreOpen(false); }}><GitFork size={19}/><span>{t("arrangeMapTwoSided")}</span></button>}
          <button disabled={!board.nodes.length || !!editing} onClick={openMindMapLayout}><Network size={19}/><span>{t("arrangeMapSmart")}</span></button>
          {iosTouchFallback && <button disabled={!selectedStudyText} title={!selectedStudyText ? t("selectTextForAi") : !canUseAi ? t("aiManualHint") : t("askAiSelection")} onClick={() => { setAiOpen(true); setMobileMoreOpen(false); }}><Sparkles size={19}/><span>{t("askAiSelection")}</span></button>}
          <button className={snap ? "selected" : ""} onClick={() => setSnap(value => !value)}><Magnet size={19}/><span>{t("snap")}</span></button>
          {onToggleTimer && <button className={timerVisible ? "selected" : ""} aria-pressed={timerVisible} onClick={onToggleTimer}><Timer size={19}/><span>{t("showFocusTimer")}</span></button>}
        </div>
        <section className="canvas-touch-settings"><strong>{t("canvasControls")}</strong><label><input type="checkbox" checked={touchSettings.drawWithFinger} onChange={event => setTouchSettings(current => ({ ...current, drawWithFinger: event.target.checked }))}/><span>{t("drawWithFinger")}</span></label><label><input type="checkbox" checked={touchSettings.stylusDrawOnly} onChange={event => setTouchSettings(current => ({ ...current, stylusDrawOnly: event.target.checked }))}/><span>{t("stylusDrawOnly")}</span></label><small>{t("oneFingerPans")} · {t("twoFingerGestures")}</small><label className="touch-range"><span>{t("zoomSensitivity")}</span><input type="range" min="0.5" max="2" step="0.1" value={touchSettings.zoomSensitivity} onChange={event => setTouchSettings(current => ({ ...current, zoomSensitivity: Number(event.target.value) }))}/><output>{touchSettings.zoomSensitivity.toFixed(1)}×</output></label><label><input type="checkbox" checked={touchSettings.invertZoom} onChange={event => setTouchSettings(current => ({ ...current, invertZoom: event.target.checked }))}/><span>{t("invertZoom")}</span></label><button className="secondary-button" onClick={() => setTouchSettings({ ...DEFAULT_CANVAS_TOUCH_SETTINGS })}><RotateCcw size={15}/>{t("resetCanvasControls")}</button></section>
      </aside></div>}
      {sourceError && <div className="canvas-inline-error" role="alert"><span>{sourceError}</span><button className="icon-button" aria-label={t("close")} onClick={() => setSourceError("")}><X size={14}/></button></div>}
      {mediaError && <div className="canvas-inline-error media-inline-error" role="alert"><span>{mediaError}</span><button className="icon-button" aria-label={t("close")} onClick={() => setMediaError("")}><X size={14}/></button></div>}
      {((inputMode === "drawing" || inputMode === "erasing") && ["pen", "highlighter", "eraser"].includes(activeToolMode)) && <div className="pen-mode-badge" role="status">{activeToolMode === "eraser" ? <Eraser size={14}/> : <PenLine size={14}/>}<span>{t(activeToolMode)}</span></div>}
      {inputMode === "pinching" && <div className="gesture-mode-badge" role="status"><Hand size={14}/><span>{t("gestureMode")}</span></div>}
      <div className="canvas-hint">{t(activeToolMode === "connector" ? "connectorHint" : activeToolMode === "text" ? "textHint" : activeToolMode === "eraser" ? "eraserHint" : ["pen", "highlighter", "line", "rect", "ellipse", "triangle"].includes(activeToolMode) ? "drawHint" : "canvasHint")}</div>
      {tool === "connector" && <div className="connector-status" role="status"><ArrowUpRight size={15}/><span>{t(connectorSource ? "connectorChooseTarget" : "connectorChooseSource")}</span>{connectorSource && <button type="button" onClick={() => { setConnectorSource(null); setSelected(null); }}>{t("cancelConnector")}</button>}</div>}
      <div className="canvas-mobile-dock">
        <button type="button" className="inspector-toggle" aria-label={t(inspectorOpen ? "closeProperties" : "openProperties")} aria-expanded={inspectorOpen} title={t(inspectorOpen ? "closeProperties" : "openProperties")} onClick={() => setInspectorOpen(value => !value)}><SlidersHorizontal size={18}/><span>{t("properties")}</span></button>
        <CanvasNavigator board={b} selection={selections} svg={svg} onChange={onChange}/>
      </div>
      {mindMapLayoutSummary && <aside className="mind-map-layout-report" aria-label={t("mindMapLayoutReport")}>
        <header><div><strong>{t("mindMapLayoutReport")}</strong><small>{t("mindMapRoot")}: {mindMapLayoutSummary.rootLabel}</small></div><div className="mind-map-layout-report-actions"><button type="button" className="secondary-button" disabled={!canUndo || readOnly} onClick={onUndo}><Undo2 size={14}/>{t("undo")}</button><button className="icon-button" aria-label={t("closeLayoutReport")} title={t("closeLayoutReport")} onClick={() => setMindMapLayoutSummary(null)}><X size={15}/></button></div></header>
        {"sides" in mindMapLayoutSummary ? <div className="mind-map-layout-columns mind-map-layout-multi">{mindMapLayoutSummary.sides.map(side => <section key={side.index} className="mind-map-layout-side">
          <div className="mind-map-layout-side-heading"><strong>{t("mindMapSide")} {side.index + 1}</strong><small>{t("mindMapNodeCount", { count: side.branches.reduce((sum, branch) => sum + branch.nodeIds.length, 0) })}</small></div>
          {side.branches.length ? side.branches.map(branch => <div className="mind-map-branch-group" key={branch.rootId}><strong>{branch.rootLabel}</strong><ul>{branch.nodeLabels.map((label, index) => <li key={`${branch.rootId}-${index}`} title={label}>{label}</li>)}</ul></div>) : <small className="mind-map-no-branch">{t("mindMapNoBranches")}</small>}
        </section>)}</div> : <div className="mind-map-layout-columns">{(["left", "right"] as const).map(side => <section key={side} className={`mind-map-layout-side ${side}`}>
          <div className="mind-map-layout-side-heading"><strong>{t(side === "left" ? "mindMapLeft" : "mindMapRight")}</strong><small>{t("mindMapNodeCount", { count: mindMapLayoutSummary[side].reduce((sum, branch) => sum + branch.nodeIds.length, 0) })}</small></div>
          {mindMapLayoutSummary[side].length ? mindMapLayoutSummary[side].map(branch => <div className="mind-map-branch-group" key={branch.rootId}><strong>{branch.rootLabel}</strong><ul>{branch.nodeLabels.map((label, index) => <li key={`${branch.rootId}-${index}`} title={label}>{label}</li>)}</ul></div>) : <small className="mind-map-no-branch">{t("mindMapNoBranches")}</small>}
        </section>)}</div>}
      </aside>}
      <div className={`zoom-control ${showMobileZoomControls ? "mobile-zoom-visible" : "mobile-zoom-hidden"}`}><button aria-label={t("zoomOut")} onClick={() => zoom(1/1.1)}>−</button><button className="zoom-value" aria-label={t("resetZoom")} onClick={resetZoom}>{Math.round(b.viewport.scale * 100)}%</button><button aria-label={t("zoomIn")} onClick={() => zoom(1.1)}>+</button></div>
    </div>
    {!readOnly && <aside className={`inspector ${inspectorOpen ? "is-open" : "is-closed"}`}><div className="inspector-heading"><h3>{t("properties")}</h3><button type="button" className="icon-button inspector-close" aria-label={t("closeProperties")} title={t("closeProperties")} onClick={() => setInspectorOpen(false)}><X size={19}/></button></div>
      <section className="canvas-background-picker"><div className="property-caption"><PaintBucket size={14}/>{t("canvasBackground")}</div><div className="background-options">{BACKGROUND_OPTIONS.map(option => <button key={option} className={backgroundPattern === option ? "active" : ""} aria-pressed={backgroundPattern === option} title={t(backgroundLabel[option])} onClick={() => onChange({ ...board, background: option })}><span className={`background-swatch ${option}`}/><span>{t(backgroundLabel[option])}</span></button>)}</div><input ref={backgroundInput} hidden type="file" accept="image/*,video/*,.mov,.m4v,.webm" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void addBackgroundFile(file); }}/><div className="canvas-background-media-control">{backgroundMedia ? <><div className="canvas-background-file"><span className={`background-media-icon ${backgroundMedia.kind}`}>{backgroundMedia.kind === "video" ? <Film size={14}/> : <ImagePlus size={14}/>}</span><span title={backgroundMedia.name}>{backgroundMedia.name || t(backgroundMedia.kind === "video" ? "video" : "image")}</span></div><button type="button" className="icon-button" aria-label={t("clearCanvasBackground")} title={t("clearCanvasBackground")} onClick={() => onChange({ ...board, background: "dots" })}><Trash2 size={15}/></button></> : <button type="button" className="secondary-button" onClick={openBackgroundPicker}><ImagePlus size={15}/>{t("uploadCanvasBackground")}</button>}{backgroundMedia && <button type="button" className="secondary-button" onClick={openBackgroundPicker}><ImagePlus size={15}/>{t("replace")}</button>}<small className="field-hint">{canUseCanvasBackground ? t("canvasBackgroundHint") : t("backgroundProOnly")}</small></div>{backgroundMedia && <div className="canvas-background-adjustments"><label>{t("backgroundMediaOpacity")}<input type="range" min=".1" max="1" step=".05" value={backgroundMedia.opacity ?? 1} onChange={event => onChange({ ...board, background: { ...backgroundMedia, opacity: Number(event.target.value) } })}/></label><label>{t("backgroundMediaBlur")}<input type="range" min="0" max="24" step="1" value={backgroundMedia.blur ?? 0} onChange={event => onChange({ ...board, background: { ...backgroundMedia, blur: Number(event.target.value) } })}/></label><label>{t("backgroundMediaBrightness")}<input type="range" min=".5" max="1.5" step=".05" value={backgroundMedia.brightness ?? 1} onChange={event => onChange({ ...board, background: { ...backgroundMedia, brightness: Number(event.target.value) } })}/></label><label>{t("backgroundMediaFit")}<select value={backgroundMedia.fit ?? "cover"} onChange={event => onChange({ ...board, background: { ...backgroundMedia, fit: event.target.value as "cover" | "contain" } })}><option value="cover">{t("backgroundFitCover")}</option><option value="contain">{t("backgroundFitContain")}</option></select></label><label>{t("backgroundMediaPosition")}<select value={backgroundMedia.position ?? "center"} onChange={event => onChange({ ...board, background: { ...backgroundMedia, position: event.target.value } })}><option value="center">{t("center")}</option><option value="top">{t("alignTop")}</option><option value="right">{t("alignRight")}</option><option value="bottom">{t("alignBottom")}</option><option value="left">{t("alignLeft")}</option></select></label></div>}</section>
      {backgroundMedia && <section className="canvas-background-overlay-control"><label>{t("backgroundMediaOverlay")}<input type="color" value={backgroundMedia.overlay ?? "#000000"} onChange={event => onChange({ ...board, background: { ...backgroundMedia, overlay: event.target.value } })}/></label></section>}
      {hasCopy && <button className="secondary-button" onClick={() => void paste()}>{t("pasteElements")}</button>}
      {selections.length > 0 && <div className="selection-actions"><strong>{selections.length} {t("selectedElements")}</strong><div className="property-grid">
        <button onClick={() => onChange(reorderSelection(board, selections, "front"))}>{t("bringFront")}</button><button onClick={() => onChange(reorderSelection(board, selections, "back"))}>{t("sendBack")}</button>
        <button onClick={() => onChange(reorderSelection(board, selections, "forward"))}>{t("bringForward")}</button><button onClick={() => onChange(reorderSelection(board, selections, "backward"))}>{t("sendBackward")}</button>
        <button title={t("alignLeft")} onClick={() => onChange(alignSelection(board, selections, "left"))}><AlignStartHorizontal size={15}/>{t("alignLeft")}</button><button title={t("alignCenter")} onClick={() => onChange(alignSelection(board, selections, "center"))}><AlignCenterHorizontal size={15}/>{t("alignCenter")}</button><button title={t("alignRight")} onClick={() => onChange(alignSelection(board, selections, "right"))}><AlignEndHorizontal size={15}/>{t("alignRight")}</button>
        <button title={t("alignTop")} onClick={() => onChange(alignSelection(board, selections, "top"))}><AlignStartVertical size={15}/>{t("alignTop")}</button><button title={t("alignMiddle")} onClick={() => onChange(alignSelection(board, selections, "middle"))}><AlignCenterVertical size={15}/>{t("alignMiddle")}</button><button title={t("alignBottom")} onClick={() => onChange(alignSelection(board, selections, "bottom"))}><AlignEndVertical size={15}/>{t("alignBottom")}</button>
        <button disabled={selections.length < 3} onClick={() => onChange(distributeSelection(board, selections, "horizontal"))}>{t("distributeHorizontal")}</button><button disabled={selections.length < 3} onClick={() => onChange(distributeSelection(board, selections, "vertical"))}>{t("distributeVertical")}</button>
        <button disabled={selections.length < 2} onClick={() => onChange(groupSelection(board, selections))}>{t("group")}</button><button disabled={!board.groups?.some(g => g.elementIds.some(id => selections.some(s => s.id === id)))} onClick={() => onChange(ungroupSelection(board, selections))}>{t("ungroup")}</button>
        <button onClick={() => void copy()}>{t("copyElements")}</button><button onClick={duplicate}>{t("duplicate")}</button><button onClick={() => onChange(setElementFlags(board, selections, { locked: !selections.some(s => isLocked(s)) }))}>{selections.some(s => isLocked(s)) ? t("unlock") : t("lock")}</button><button onClick={() => onChange(setElementFlags(board, selections, { hidden: !selections.every(s => hiddenElements.has(s.id)) }))}>{selections.every(s => hiddenElements.has(s.id)) ? t("show") : t("hide")}</button><button onClick={remove}>{t("delete")}</button></div>
        {selectedMindMapNodes.length > 1 && selectedMindMapNodes.length === selections.length && <section className="mind-map-branch-tools"><strong>{t("mindMapBranchTools")}</strong><small>{selectedMindMapSelectionHasLocked ? t("mindMapBranchLocked") : t("mindMapBranchHint")}</small><label>{t("mindMapRotationAngle")}<input type="number" min="15" max="360" step="15" value={mindMapRotationAngle} onChange={event => { if (event.target.value !== "" && Number.isFinite(event.target.valueAsNumber)) setMindMapRotationAngle(clamp(Math.round(event.target.valueAsNumber / 15) * 15, 15, 360)); }}/></label><div><button type="button" disabled={selectedMindMapSelectionHasLocked} onClick={() => onChange(rotateMindMapSelection(board, selections, -mindMapRotationAngle))}><RotateCcw size={14}/>{t("rotateSelectionLeft")}</button><button type="button" disabled={selectedMindMapSelectionHasLocked} onClick={() => onChange(rotateMindMapSelection(board, selections, mindMapRotationAngle))}><RotateCw size={14}/>{t("rotateSelectionRight")}</button></div></section>}
        {selectedStudyText && <button className="ai-selection-button" title={!canUseAi ? t("aiManualHint") : t("askAiSelection")} onClick={() => setAiOpen(true)}><Sparkles size={15}/>{t("askAiSelection")}</button>}
        {selected?.kind === "nodes" && selections.length === 1 && <><button onClick={() => relative(false)}>{t("addChild")} · Tab</button><button onClick={() => relative(true)}>{t("addSibling")} · Enter</button><small>{t("reparentHint")}</small></>}
      </div>}
      {!selectedEl ? <><p>{t("selectHint")}</p><label>{t("color")}<input type="color" value={ink} onChange={e => setInk(e.target.value)}/></label><label>{t("stroke")}<input type="range" min="1" max="20" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))}/></label></> : <>
        <div className="property-caption">{t(selectedLabelKey)}</div>
        {bounds && <div className="property-grid">{(["x", "y", "width", "height"] as const).map(k => <label key={k}>{k === "width" ? t("width") : k === "height" ? t("height") : k.toUpperCase()}<input type="number" step="1" aria-label={k} value={Math.round(bounds[k])} onChange={e => {
          if (e.target.value === "" || !Number.isFinite(e.target.valueAsNumber)) return;
          const v = clamp(e.target.valueAsNumber, -100000, 100000);
          onChange(k === "x" || k === "y" ? moveElement(board, selected!, k === "x" ? v - bounds.x : 0, k === "y" ? v - bounds.y : 0) : resizeElement(board, selected!, k === "width" ? v : bounds.width, k === "height" ? v : bounds.height));
        }}/></label>)}</div>}
        {selected?.kind !== "edges" && <div className="rotation-control"><label>{t("rotation")}<input aria-label={t("rotation")} type="number" min="-3600" max="3600" step="1" value={Math.round(selectedRotation)} onChange={e => { if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber)) patch({ rotation: clamp(e.target.valueAsNumber, -3600, 3600) }); }}/></label><button type="button" className="secondary-button" onClick={() => patch({ rotation: 0 })}><RotateCcw size={14}/>{t("resetRotation")}</button></div>}
        {selected?.kind !== "edges" && selected?.kind !== "media" && selected?.kind !== "embeds" && <label>{t("color")}<input type="color" value={selectedColor} onChange={e => patch({ color: e.target.value })}/></label>}
        <div className="alpha-control"><label>{t("alpha")}<output>{Math.round(selectedOpacity * 100)}%</output><input aria-label={t("alpha")} type="range" min="0" max="1" step=".01" value={selectedOpacity} onChange={e => patch({ opacity: Number(e.target.value) })}/></label><button type="button" className="secondary-button" onClick={() => patch({ opacity: 1 })}><RotateCcw size={14}/>{t("resetAlpha")}</button></div>
        {selected?.kind === "edges" && <label>{t("label")}<input aria-label={t("label")} maxLength={500} value={"label" in selectedEl ? selectedEl.label ?? "" : ""} onChange={e => patch({ label: e.target.value || undefined })}/></label>}
        {selectedMedia && <div className="media-inspector-card"><strong>{selectedMedia.name}</strong><small>{t(selectedMedia.kind)} · {selectedMedia.mimeType ?? "media"}</small></div>}
        {selectedMedia && (selectedMedia.kind === "image" || selectedMedia.kind === "video") && <fieldset className="media-editor-fieldset"><legend>{t("crop")}</legend><div className="property-grid">{(["top", "right", "bottom", "left"] as const).map(edge => <label key={edge}>{t(`crop${edge[0].toUpperCase()}${edge.slice(1)}` as MessageKey)}<input type="number" min="0" max="90" step="1" value={Math.round((selectedMedia.crop?.[edge] ?? 0) * 10) / 10} onChange={e => { if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber)) updateCrop(edge, e.target.valueAsNumber); }}/></label>)}</div><button type="button" className="secondary-button" onClick={() => patch({ crop: undefined })}><RotateCcw size={14}/>{t("resetCrop")}</button></fieldset>}
        {selectedMedia && (selectedMedia.kind === "audio" || selectedMedia.kind === "video") && <fieldset className="media-editor-fieldset"><legend>{t("trimStart")} / {t("trimEnd")}</legend><div className="property-grid"><label>{t("trimStart")}<input type="number" min="0" step="0.1" value={selectedMedia.trimStart ?? ""} onChange={e => updateTrim("trimStart", e.target.value === "" ? undefined : e.target.valueAsNumber)}/></label><label>{t("trimEnd")}<input type="number" min="0" step="0.1" value={selectedMedia.trimEnd ?? ""} onChange={e => updateTrim("trimEnd", e.target.value === "" ? undefined : e.target.valueAsNumber)}/></label></div><small>{t("trimHint")}</small><button type="button" className="secondary-button" onClick={() => patch({ trimStart: undefined, trimEnd: undefined })}><RotateCcw size={14}/>{t("resetTrim")}</button></fieldset>}
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
        {selected?.kind === "drawings" && <label>{t("stroke")}<input type="range" min="1" max="120" value={"width" in selectedEl ? selectedEl.width : 3} onChange={e => patch({ width: Number(e.target.value) })}/></label>}
        {(selected?.kind === "texts" || selected?.kind === "nodes") && <button className="secondary-button" onClick={() => edit(selected!)}>{t("editText")}</button>}
        {selected?.kind === "nodes" && <><button className="secondary-button" onClick={() => patch({ collapsed: !("collapsed" in selectedEl && selectedEl.collapsed) })}>{t("collapsed" in selectedEl && selectedEl.collapsed ? "expand" : "collapse")}</button><button className="secondary-button" onClick={openMindMapLayout}>{t("arrangeMapSmart")}</button><section className="mind-map-branch-tools"><strong>{t("mindMapBranchTools")}</strong><small>{selectedMindMapHasLocked ? t("mindMapBranchLocked") : t("mindMapBranchHint")}</small><label>{t("mindMapRotationAngle")}<input type="number" min="15" max="360" step="15" value={mindMapRotationAngle} onChange={event => { if (event.target.value !== "" && Number.isFinite(event.target.valueAsNumber)) setMindMapRotationAngle(clamp(Math.round(event.target.valueAsNumber / 15) * 15, 15, 360)); }}/></label><div><button type="button" disabled={selectedMindMapHasLocked} onClick={() => onChange(rotateMindMapSubtree(board, selected.id, -mindMapRotationAngle))}><RotateCcw size={14}/>{t("rotateByAngle", { angle: -mindMapRotationAngle })}</button><button type="button" disabled={selectedMindMapHasLocked} onClick={() => onChange(rotateMindMapSubtree(board, selected.id, mindMapRotationAngle))}><RotateCw size={14}/>{t("rotateByAngle", { angle: mindMapRotationAngle })}</button></div></section></>}
        <div className="actions">{selected?.kind !== "edges" && <button className="icon-button" aria-label={t("duplicate")} title={t("duplicate")} onClick={duplicate}><Copy size={18}/></button>}<button className="icon-button danger" aria-label={t("delete")} title={t("delete")} onClick={remove}><Trash2 size={18}/></button></div>
      </>}
      <ElementsPanel board={b} selections={selections} hiddenElements={hiddenElements}
        onSelect={(selection, additive) => { setTool("select"); const next = expandGroups(b, [selection]); setSelections(additive ? expandGroups(b, [...selections, ...next]) : next); }}
        onMove={(sourceId, targetId) => onChange(moveLayer(board, sourceId, targetId))}
        onToggleHidden={(selection, value) => onChange(setElementFlags(board, [selection], { hidden: value }))}
        onToggleLocked={(selection, value) => onChange(setElementFlags(board, [selection], { locked: value }))}/>
    </aside>}
    {aiOpen && <AiSelectionPanel sourceText={selectedStudyText} canUse={canUseAi} mindMapScope={selectedMindMapScope} sourceRevision={selectionRevision(selectedStudyText, selectedMindMapScope)} onClose={() => setAiOpen(false)} onApply={applyAi}/>} 
    {mindMapLayoutOpen && <Dialog title={t("arrangeMapSmart")} onClose={() => setMindMapLayoutOpen(false)}><form onSubmit={event => { event.preventDefault(); applyMindMapLayout(); }}>
      <p className="dialog-hint">{t("mindMapLayoutPreviewHint")}</p>
      {selectedMindMapRootId && <p className="mind-map-layout-selected-root">{t("mindMapLayoutSelectedRoot")}: <strong>{board.nodes.find(node => node.id === selectedMindMapRootId)?.label}</strong></p>}
      <label>{t("mindMapLayoutBehavior")}<select value={mindMapLayoutBehaviorChoice} onChange={event => setMindMapLayoutBehaviorChoice(event.target.value as MindMapLayoutBehavior)}><option value="auto">{t("mindMapLayoutBehaviorAuto")}</option><option value="assist">{t("mindMapLayoutBehaviorAssist")}</option><option value="free">{t("mindMapLayoutBehaviorFree")}</option></select><small className="field-hint">{t("mindMapLayoutBehaviorHint")}</small></label>
      <label>{t("mindMapLayoutSides")}<input type="number" min="2" max="12" step="1" list="mindmap-side-presets" value={mindMapLayoutSides} onChange={event => setMindMapLayoutSides(clamp(Math.round(event.target.valueAsNumber || 2), 2, 12))}/><datalist id="mindmap-side-presets"><option value="2"/><option value="3"/><option value="4"/><option value="6"/><option value="8"/></datalist></label>
      <label>{t("mindMapLayoutMode")}<select value={mindMapLayoutMode} onChange={event => setMindMapLayoutMode(event.target.value as MindMapLayoutMode)}><option value="radial">{t("mindMapLayoutModeRadial")}</option><option value="fan">{t("mindMapLayoutModeFan")}</option><option value="symmetric">{t("mindMapLayoutModeSymmetric")}</option><option value="left-right">{t("mindMapLayoutModeLeftRight")}</option><option value="top-bottom">{t("mindMapLayoutModeTopBottom")}</option><option value="organic">{t("mindMapLayoutModeOrganic")}</option></select></label>
      {mindMapLayoutPreview && <div className="mind-map-layout-preview"><strong>{t("mindMapLayoutPreview")}</strong><small>{mindMapLayoutPreview.sides.map(side => `${side.index + 1}: ${side.branches.reduce((sum, branch) => sum + branch.nodeIds.length, 0)}`).join(" · ")} · {mindMapLayoutPreview.sideCount} {t("mindMapSide").toLocaleLowerCase()}</small></div>}
      <footer className="actions"><button type="button" className="secondary-button" onClick={() => setMindMapLayoutOpen(false)}>{t("cancel")}</button><button className="primary-button">{t("mindMapLayoutApply")}</button></footer>
    </form></Dialog>}
    {sourceView && <SourceDocumentPanel source={sourceView} onClose={() => setSourceView(null)}/>} 
    {embedOpen && <Dialog title={t("embedWeb")} onClose={() => setEmbedOpen(false)}><form onSubmit={event => { event.preventDefault(); insertEmbed(); }}>
      <label>{t("embedUrl")}<input autoFocus required type="url" placeholder={t("embedPlaceholder")} value={embedUrl} onChange={event => setEmbedUrl(event.target.value)}/></label>
      <label>{t("embedTitle")}<input maxLength={500} value={embedTitle} onChange={event => setEmbedTitle(event.target.value)}/></label>
      <p className="dialog-hint">{t("embedHint")}</p>
      <footer className="actions"><button type="button" onClick={() => setEmbedOpen(false)}>{t("cancel")}</button><button className="primary-button">{t("insertEmbed")}</button></footer>
    </form></Dialog>}
  </div>;
}
