import type { BoardState, CanvasBackgroundMedia, CanvasBackgroundPattern, MindMapAiOperation, MindMapEdge, MindMapLayoutBehavior, StructuredMindMap, Vec2 } from "@mindcanvas/shared";
import { layoutMindMap, layoutMindMapMultiSided, layoutMindMapTwoSided, nodeHeight, type MindMapLayoutMode, type MindMapLayoutSummary, type MindMapMultiLayoutSummary } from "./mindMapLayout";
import { collectMindMapSubtree, getMindMapHierarchy } from "./mindMapGraph";

export type ElementKind = "nodes" | "texts" | "shapes" | "drawings" | "media" | "embeds" | "edges";
export type Selection = { kind: ElementKind; id: string };
export type Bounds = { x: number; y: number; width: number; height: number };
export type ContextAiResult = { action: "summarize" | "explain" | "rewrite" | "expand" | "organize"; title: string; text: string; ideas: string[]; operations?: MindMapAiOperation[] };
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_FILE_BYTES = 40 * 1024 * 1024;
export const MAX_MEDIA_DATA_URL_LENGTH = 20 * 1024 * 1024;
export const CANVAS_BACKGROUNDS: CanvasBackgroundPattern[] = ["dots", "grid", "ruled", "graph", "isometric", "plain"];
export const MAX_BACKGROUND_MEDIA_DATA_URL_LENGTH = 20 * 1024 * 1024;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const pathData = (points: Vec2[]) => points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ") + (points.length === 1 ? " l0.01,0.01" : "");
const xml = (value: unknown) => String(value ?? "").replace(/[&<>\"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&apos;" }[char]!));
const color = (value: unknown, fallback: string) => typeof value === "string" && /^(#[0-9a-f]{6}|none)$/i.test(value) ? value : fallback;
const backgroundImageAspect = (fit: "cover" | "contain" | undefined, position: string | undefined) => {
  const align = position === "top" ? "xMidYMin" : position === "right" ? "xMaxYMid" : position === "bottom" ? "xMidYMax" : position === "left" ? "xMinYMid" : "xMidYMid";
  return `${align} ${fit === "contain" ? "meet" : "slice"}`;
};
export type CanvasExportPalette = {
  canvas: string;
  dot: string;
  grid: string;
  gridMinor: string;
  gridMajor: string;
  rule: string;
  margin: string;
  text: string;
  nodeFill: string;
  elementStroke: string;
  connector: string;
  muted: string;
  surface: string;
};
const DEFAULT_EXPORT_PALETTE: CanvasExportPalette = {
  canvas: "#fffdfb", dot: "#d9cede", grid: "#ded3e3", gridMinor: "#ebe5ee", gridMajor: "#b8aabd",
  rule: "#d9cede", margin: "#efb8c4", text: "#281c32", nodeFill: "#f1e7ff", elementStroke: "#a795b7",
  connector: "#81728e", muted: "#665b70", surface: "#ffffff",
};

/** Resolve the active CSS theme before serializing a self-contained SVG. */
export function readCanvasExportPalette(): CanvasExportPalette {
  if (typeof document === "undefined" || !document.documentElement) return DEFAULT_EXPORT_PALETTE;
  const probe = document.createElement("span");
  probe.hidden = true;
  document.documentElement.appendChild(probe);
  const resolve = (variable: string, fallback: string) => {
    probe.style.color = `var(${variable})`;
    const value = getComputedStyle(probe).color;
    probe.style.removeProperty("color");
    return value && value !== "rgba(0, 0, 0, 0)" ? value : fallback;
  };
  try {
    return {
      canvas: resolve("--canvas", DEFAULT_EXPORT_PALETTE.canvas),
      dot: resolve("--canvas-dot", DEFAULT_EXPORT_PALETTE.dot),
      grid: resolve("--canvas-grid", DEFAULT_EXPORT_PALETTE.grid),
      gridMinor: resolve("--canvas-grid-minor", DEFAULT_EXPORT_PALETTE.gridMinor),
      gridMajor: resolve("--canvas-grid-major", DEFAULT_EXPORT_PALETTE.gridMajor),
      rule: resolve("--canvas-rule", DEFAULT_EXPORT_PALETTE.rule),
      margin: resolve("--canvas-margin", DEFAULT_EXPORT_PALETTE.margin),
      text: resolve("--canvas-text", DEFAULT_EXPORT_PALETTE.text),
      nodeFill: resolve("--node-fill", DEFAULT_EXPORT_PALETTE.nodeFill),
      elementStroke: resolve("--element-stroke", DEFAULT_EXPORT_PALETTE.elementStroke),
      connector: resolve("--connector", DEFAULT_EXPORT_PALETTE.connector),
      muted: resolve("--muted", DEFAULT_EXPORT_PALETTE.muted),
      surface: resolve("--surface-raised", DEFAULT_EXPORT_PALETTE.surface),
    };
  } finally { probe.remove(); }
}

const glyphWidth = (character: string, fontSize: number) => {
  if (/\s/.test(character)) return fontSize * .33;
  if (/[ilI.,'`:;!|]/.test(character)) return fontSize * .28;
  if (/[MW@#%&]/.test(character)) return fontSize * .82;
  if (/[^\u0000-\u024f]/.test(character)) return fontSize;
  return fontSize * .55;
};
const textWidth = (value: string, fontSize: number) => Array.from(value).reduce((width, character) => width + glyphWidth(character, fontSize), 0);
export function wrapCanvasText(value: string, maxWidth: number, fontSize: number) {
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r\n?/g, "\n").split("\n")) {
    if (!paragraph) { lines.push(""); continue; }
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && textWidth(candidate, fontSize) > maxWidth) { lines.push(line); line = ""; }
      if (textWidth(word, fontSize) <= maxWidth) { line = line ? `${line} ${word}` : word; continue; }
      for (const character of Array.from(word)) {
        const part = line + character;
        if (line && textWidth(part, fontSize) > maxWidth) { lines.push(line); line = character; }
        else line = part;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}
const clippedLines = (lines: string[], maxLines: number) => {
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, Math.max(1, maxLines));
  visible[visible.length - 1] = `${visible[visible.length - 1].replace(/[.…\s]+$/u, "")}…`;
  return visible;
};
const contrastText = (paint: string, fallback: string) => {
  const match = /^#([0-9a-f]{6})$/i.exec(paint);
  if (!match) return fallback;
  const value = Number.parseInt(match[1], 16), r = value >> 16, g = value >> 8 & 255, b = value & 255;
  const luminance = [r, g, b].map(channel => { const n = channel / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
  return .2126 * luminance[0] + .7152 * luminance[1] + .0722 * luminance[2] > .42 ? "#18213b" : "#ffffff";
};
const svgText = ({ lines, x, y, fontSize, lineHeight, anchor = "start", fill, weight = 400, style = "normal", decoration = "none" }: {
  lines: string[]; x: number; y: number; fontSize: number; lineHeight: number; anchor?: "start" | "middle" | "end"; fill: string; weight?: number; style?: string; decoration?: string;
}) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Inter,Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="${weight}" font-style="${style}" text-decoration="${decoration}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${xml(line || " ")}</tspan>`).join("")}</text>`;
const exportOrder = (board: BoardState): Selection[] => {
  const legacy = (["shapes", "drawings", "media", "embeds", "edges", "texts", "nodes"] as const).flatMap(kind => board[kind].map(e => ({ kind, id: e.id })));
  const byId = new Map(legacy.map(item => [item.id, item]));
  return [...new Set([...(board.layerOrder ?? []), ...legacy.map(item => item.id)])].flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
};
export type ConnectorSide = "top" | "right" | "bottom" | "left";
export type ConnectorEdge = Pick<MindMapEdge, "source" | "target"> & Partial<Pick<MindMapEdge, "kind">> & { sourceSide?: ConnectorSide; targetSide?: ConnectorSide };
const endpoint = (board: BoardState, id: string) => [...board.nodes, ...board.shapes].find(item => item.id === id);
const centerOf = (rect: { x: number; y: number; width: number; height: number }) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
const sideNormal: Record<ConnectorSide, Vec2> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
function connectorSide(source: { x: number; y: number; width: number; height: number }, target: { x: number; y: number; width: number; height: number }, preferred?: ConnectorSide): ConnectorSide {
  if (preferred) return preferred;
  const a = centerOf(source), b = centerOf(target), dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy) * 1.08) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}
function pointOnSide(rect: { x: number; y: number; width: number; height: number }, side: ConnectorSide) {
  if (side === "top") return { x: rect.x + rect.width / 2, y: rect.y };
  if (side === "right") return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  if (side === "bottom") return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  return { x: rect.x, y: rect.y + rect.height / 2 };
}
function oppositeSide(side: ConnectorSide): ConnectorSide {
  return side === "top" ? "bottom" : side === "right" ? "left" : side === "bottom" ? "top" : "right";
}
export function connectorGeometry(board: BoardState, edge: ConnectorEdge) {
  const source = endpoint(board, edge.source), target = endpoint(board, edge.target);
  if (!source || !target) return null;
  const sourceSide = connectorSide(source, target, edge.sourceSide);
  const targetSide = edge.targetSide ?? oppositeSide(sourceSide);
  const start = pointOnSide(source, sourceSide), end = pointOnSide(target, targetSide);
  const normalStart = sideNormal[sourceSide], normalEnd = sideNormal[targetSide];
  const distance = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
  const curve = Math.max(40, Math.min(220, distance * .45));
  const control1 = { x: start.x + normalStart.x * curve, y: start.y + normalStart.y * curve };
  const control2 = { x: end.x + normalEnd.x * curve, y: end.y + normalEnd.y * curve };
  const path = `M${start.x},${start.y} C${control1.x},${control1.y} ${control2.x},${control2.y} ${end.x},${end.y}`;
  const strokePadding = 10;
  const minX = Math.min(start.x, end.x, control1.x, control2.x) - strokePadding;
  const maxX = Math.max(start.x, end.x, control1.x, control2.x) + strokePadding;
  const minY = Math.min(start.y, end.y, control1.y, control2.y) - strokePadding;
  const maxY = Math.max(start.y, end.y, control1.y, control2.y) + strokePadding;
  return { path, x1: start.x, y1: start.y, x2: end.x, y2: end.y, sourceSide, targetSide, midpoint: { x: (start.x + 3 * control1.x + 3 * control2.x + end.x) / 8, y: (start.y + 3 * control1.y + 3 * control2.y + end.y) / 8 }, bounds: { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) } };
}
export function connectorPath(board: BoardState, edge: ConnectorEdge) {
  return connectorGeometry(board, edge)?.path ?? "";
}
const exportBounds = (board: BoardState): Bounds => {
  const hidden = hiddenNodes(board), bounds = exportOrder(board).flatMap(selection => {
    if (hidden.has(selection.id) || (selection.kind !== "edges" && board[selection.kind].find(item => item.id === selection.id)?.hidden)) return [];
    if (selection.kind === "edges") {
      const edge = board.edges.find(item => item.id === selection.id), geometry = edge ? connectorGeometry(board, edge) : null;
      if (geometry) return [geometry.bounds];
      const ends = edge ? [edge.source, edge.target] : [];
      return ends.flatMap(id => exportOrder(board).filter(item => item.id === id).flatMap(item => { const bound = elementBounds(board, item); return bound ? [bound] : []; }));
    }
    const bound = elementBounds(board, selection); return bound ? [bound] : [];
  });
  if (!bounds.length) return { x: 0, y: 0, width: 800, height: 600 };
  const x = Math.min(...bounds.map(bound => bound.x)), y = Math.min(...bounds.map(bound => bound.y));
  return { x, y, width: Math.max(1, Math.max(...bounds.map(bound => bound.x + bound.width)) - x), height: Math.max(1, Math.max(...bounds.map(bound => bound.y + bound.height)) - y) };
};
export function exportCanvasSvg(board: BoardState, palette: CanvasExportPalette = DEFAULT_EXPORT_PALETTE) {
  const bounds = exportBounds(board), pad = 48, hidden = hiddenNodes(board), all = [...board.nodes, ...board.shapes, ...board.texts, ...board.drawings, ...board.media, ...board.embeds];
  const cropId = (id: string) => `media-crop-${id.replace(/[^a-z0-9_-]/gi, "_")}`;
  const cropDefs = board.media.flatMap(media => {
    const crop = media.crop;
    if (!crop || !crop.top && !crop.right && !crop.bottom && !crop.left) return [];
    const bound = elementBounds(board, { kind: "media", id: media.id });
    return bound ? [`<clipPath id="${cropId(media.id)}"><rect x="${bound.x}" y="${bound.y}" width="${bound.width}" height="${bound.height}"/></clipPath>`] : [];
  }).join("");
  const isHidden = (id: string) => hidden.has(id) || !!all.find(item => item.id === id && item.hidden);
  const body = exportOrder(board).map(selection => {
    if (isHidden(selection.id)) return "";
    if (selection.kind === "edges") {
      const edge = board.edges.find(item => item.id === selection.id), source = edge && endpoint(board, edge.source), target = edge && endpoint(board, edge.target), geometry = edge ? connectorGeometry(board, edge) : null;
      if (!edge || !source || !target || !geometry || isHidden(source.id) || isHidden(target.id)) return "";
      const { x1, y1, x2, y2, path } = geometry;
      const labelLines = edge.label ? clippedLines(wrapCanvasText(edge.label, 180, 13), 3) : [];
      const labelX = (x1 + x2) / 2, labelY = (y1 + y2) / 2 - 9 - (labelLines.length - 1) * 8;
      const labelWidth = labelLines.length ? Math.min(196, Math.max(...labelLines.map(line => textWidth(line, 13))) + 16) : 0;
      const labelHeight = labelLines.length * 18 + 6;
      const label = labelLines.length ? `<g class="connector-label"><rect x="${labelX - labelWidth / 2}" y="${labelY - 15}" width="${labelWidth}" height="${labelHeight}" rx="7" fill="${palette.canvas}" fill-opacity=".94"/>${svgText({ lines: labelLines, x: labelX, y: labelY, fontSize: 13, lineHeight: 18, anchor: "middle", fill: palette.muted })}</g>` : "";
      const opacity = edge.opacity === undefined ? "" : ` opacity="${clamp(edge.opacity, 0, 1)}"`;
      const dash = edge.kind === "relation" ? ` stroke-dasharray="7 5"` : "";
      return `<g${opacity}><path d="${path}" fill="none" stroke="${palette.connector}" stroke-width="2"${dash} marker-end="url(#mindcanvas-arrow)"/>${label}</g>`;
    }
    const item = board[selection.kind].find(entry => entry.id === selection.id) as any, bound = elementBounds(board, selection);
    if (!item || !bound) return "";
    const rotation = "rotation" in item && item.rotation ? ` transform="rotate(${item.rotation} ${bound.x + bound.width / 2} ${bound.y + bound.height / 2})"` : "";
    const opacity = item.opacity === undefined ? "" : ` opacity="${clamp(item.opacity, 0, 1)}"`;
    if (selection.kind === "media") {
      if (item.kind === "image") {
        const crop = item.crop, cropWidth = crop ? Math.max(1, 100 - crop.left - crop.right) : 100, cropHeight = crop ? Math.max(1, 100 - crop.top - crop.bottom) : 100;
        const image = crop && (crop.top || crop.right || crop.bottom || crop.left)
          ? `<image href="${xml(item.src)}" x="${bound.x - bound.width * crop.left / cropWidth}" y="${bound.y - bound.height * crop.top / cropHeight}" width="${bound.width * 100 / cropWidth}" height="${bound.height * 100 / cropHeight}" preserveAspectRatio="none" clip-path="url(#${cropId(item.id)})"/>`
          : `<image href="${xml(item.src)}" x="${bound.x}" y="${bound.y}" width="${bound.width}" height="${bound.height}" preserveAspectRatio="xMidYMid meet"/>`;
        return `<g${rotation}${opacity}>${image}<rect x="${bound.x}" y="${bound.y}" width="${bound.width}" height="${bound.height}" fill="none" stroke="${palette.elementStroke}" rx="10"/></g>`;
      }
      const title = item.kind === "video" ? "Video" : "Audio";
      return `<g${rotation}${opacity}><rect x="${bound.x}" y="${bound.y}" width="${bound.width}" height="${bound.height}" rx="10" fill="${palette.surface}" stroke="${palette.elementStroke}"/><text x="${bound.x + bound.width / 2}" y="${bound.y + bound.height / 2 - 4}" text-anchor="middle" font-family="Inter,Arial,Helvetica,sans-serif" font-size="18" fill="${palette.text}">${xml(title)}</text><text x="${bound.x + bound.width / 2}" y="${bound.y + bound.height / 2 + 22}" text-anchor="middle" font-family="Inter,Arial,Helvetica,sans-serif" font-size="12" fill="${palette.muted}">${xml(item.name || title)}</text></g>`;
    }
    if (selection.kind === "embeds") {
      const title = item.title || (item.kind === "youtube" ? "YouTube" : item.kind === "video" ? "Video" : "Web page");
      return `<g${rotation}${opacity}><rect x="${bound.x}" y="${bound.y}" width="${bound.width}" height="${bound.height}" rx="10" fill="${palette.surface}" stroke="${palette.elementStroke}"/><text x="${bound.x + bound.width / 2}" y="${bound.y + bound.height / 2 - 4}" text-anchor="middle" font-family="Inter,Arial,Helvetica,sans-serif" font-size="18" fill="${palette.text}">${xml(title)}</text><text x="${bound.x + bound.width / 2}" y="${bound.y + bound.height / 2 + 22}" text-anchor="middle" font-family="Inter,Arial,Helvetica,sans-serif" font-size="12" fill="${palette.muted}">${xml(item.url)}</text></g>`;
    }
    if (selection.kind === "shapes") {
      if (item.kind === "rect") return `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="6" fill="${color(item.color, palette.nodeFill)}" stroke="${palette.elementStroke}"${opacity}${rotation}/>`;
      if (item.kind === "ellipse") return `<ellipse cx="${item.x + item.width / 2}" cy="${item.y + item.height / 2}" rx="${item.width / 2}" ry="${item.height / 2}" fill="${color(item.color, palette.nodeFill)}" stroke="${palette.elementStroke}"${opacity}${rotation}/>`;
      return `<polygon points="${item.x + item.width / 2},${item.y} ${item.x + item.width},${item.y + item.height} ${item.x},${item.y + item.height}" fill="${color(item.color, palette.nodeFill)}" stroke="${palette.elementStroke}" stroke-linejoin="round"${opacity}${rotation}/>`;
    }
    if (selection.kind === "drawings") return `<path d="${pathData(item.points)}" fill="none" stroke="${color(item.color, "#4562df")}" stroke-width="${item.width}" opacity="${item.opacity}" stroke-linecap="round" stroke-linejoin="round"${rotation}/>`;
    if (selection.kind === "texts") {
      const align = item.textAlign === "center" ? "middle" : item.textAlign === "right" ? "end" : "start";
      const fontSize = item.fontSize ?? 16, paddingX = 6, paddingTop = 4;
      const tx = item.textAlign === "center" ? bound.x + bound.width / 2 : item.textAlign === "right" ? bound.x + bound.width - paddingX : bound.x + paddingX;
      const lines = wrapCanvasText(item.text, Math.max(8, bound.width - paddingX * 2), fontSize);
      const backdrop = item.backgroundColor ? `<rect x="${bound.x}" y="${bound.y}" width="${bound.width}" height="${bound.height}" rx="6" fill="${color(item.backgroundColor, palette.surface)}"/>` : "";
      return `<g${rotation}${opacity}>${backdrop}${svgText({ lines, x: tx, y: bound.y + paddingTop + fontSize, anchor: align, fontSize, lineHeight: fontSize * 1.4, fill: color(item.color, palette.text), weight: item.bold ? 700 : 400, style: item.italic ? "italic" : "normal", decoration: item.underline ? "underline" : "none" })}</g>`;
    }
    const nodeFill = color(item.color, palette.nodeFill), pageHeight = item.sourcePage ? 22 : 0, lineHeight = 22.4;
    const maxLines = Math.max(1, Math.floor((item.height - 20 - pageHeight) / lineHeight));
    const lines = clippedLines(wrapCanvasText(item.label, Math.max(12, item.width - 24), 16), maxLines);
    const textColor = contrastText(nodeFill, palette.text), labelY = item.y + 10 + 16;
    const source = item.sourcePage ? svgText({ lines: [`Page ${item.sourcePage}`], x: item.x + 12, y: item.y + item.height - 10, fontSize: 12, lineHeight: 16, fill: textColor, weight: 500 }) : "";
    return `<g${rotation}${opacity}><rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="12" fill="${nodeFill}" stroke="${palette.elementStroke}"/>${svgText({ lines, x: item.x + 12, y: labelY, fontSize: 16, lineHeight, fill: textColor, weight: 500 })}${source}</g>`;
  }).join("");
  const background = typeof board.background === "string" ? board.background : "plain";
  const backgroundMedia = typeof board.background === "object" ? board.background : null;
  const pattern = background === "dots" ? `<pattern id="mindcanvas-bg" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${palette.dot}"/></pattern>`
    : background === "grid" ? `<pattern id="mindcanvas-bg" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="${palette.grid}" stroke-width="1"/></pattern>`
    : background === "ruled" ? `<pattern id="mindcanvas-bg" width="320" height="32" patternUnits="userSpaceOnUse"><path d="M0 31.5H320" fill="none" stroke="${palette.rule}" stroke-width="1"/><path d="M48 0V32" fill="none" stroke="${palette.margin}" stroke-width="1"/></pattern>`
    : background === "graph" ? `<pattern id="mindcanvas-bg" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M20 0V100M40 0V100M60 0V100M80 0V100M0 20H100M0 40H100M0 60H100M0 80H100" fill="none" stroke="${palette.gridMinor}" stroke-width="1"/><path d="M100 0H0V100" fill="none" stroke="${palette.gridMajor}" stroke-width="1.25"/></pattern>`
    : background === "isometric" ? `<pattern id="mindcanvas-bg" width="48" height="28" patternUnits="userSpaceOnUse"><path d="M0 28L24 14 48 28M0 0L24 14 48 0M24 14V42" fill="none" stroke="${palette.grid}" stroke-width="1"/></pattern>` : "";
  const backgroundFill = background === "plain" ? palette.canvas : "url(#mindcanvas-bg)";
  const backgroundMediaSvg = backgroundMedia?.kind === "image"
    ? `<image href="${xml(backgroundMedia.src)}" x="${bounds.x - pad}" y="${bounds.y - pad}" width="${bounds.width + pad * 2}" height="${bounds.height + pad * 2}" preserveAspectRatio="${backgroundImageAspect(backgroundMedia.fit, backgroundMedia.position)}" opacity="${clamp(backgroundMedia.opacity ?? 1, 0, 1)}" style="filter:blur(${clamp(backgroundMedia.blur ?? 0, 0, 40)}px) brightness(${clamp(backgroundMedia.brightness ?? 1, 0, 2)})"/>`
    : backgroundMedia?.kind === "video" ? `<rect x="${bounds.x - pad}" y="${bounds.y - pad}" width="${bounds.width + pad * 2}" height="${bounds.height + pad * 2}" fill="${palette.surface}"/><text x="${bounds.x + bounds.width / 2}" y="${bounds.y + bounds.height / 2}" text-anchor="middle" font-family="Inter,Arial,Helvetica,sans-serif" font-size="18" fill="${palette.text}">${xml(backgroundMedia.name || "Video background")}</text>` : "";
  const backgroundOverlay = backgroundMedia?.overlay ? `<rect x="${bounds.x - pad}" y="${bounds.y - pad}" width="${bounds.width + pad * 2}" height="${bounds.height + pad * 2}" fill="${color(backgroundMedia.overlay, palette.canvas)}" opacity=".18"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width + pad * 2}" height="${bounds.height + pad * 2}" viewBox="${bounds.x - pad} ${bounds.y - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}" role="img" aria-label="${xml(board.title)}"><defs><marker id="mindcanvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10z" fill="${palette.connector}"/></marker>${pattern}${cropDefs}</defs><rect x="${bounds.x - pad}" y="${bounds.y - pad}" width="${bounds.width + pad * 2}" height="${bounds.height + pad * 2}" fill="${palette.canvas}"/><rect x="${bounds.x - pad}" y="${bounds.y - pad}" width="${bounds.width + pad * 2}" height="${bounds.height + pad * 2}" fill="${backgroundFill}"/>${backgroundMediaSvg}${backgroundOverlay}${body}</svg>`;
}
function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function exportCanvasSvgFile(board: BoardState, palette = readCanvasExportPalette()) { downloadBlob(new Blob([exportCanvasSvg(board, palette)], { type: "image/svg+xml;charset=utf-8" }), `${board.title.replace(/[<>:"/\\|?*]/g, "_").slice(0, 100) || "canvas"}.svg`); }
export async function exportCanvasPngFile(board: BoardState, palette = readCanvasExportPalette()) {
  const svg = exportCanvasSvg(board, palette), url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" })), image = new Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Could not render canvas image.")); image.src = url; });
  const bounds = exportBounds(board), width = Math.max(1, bounds.width + 96), height = Math.max(1, bounds.height + 96);
  const scale = Math.min(2, 8192 / width, 8192 / height, Math.sqrt(32_000_000 / (width * height)));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale)); const context = canvas.getContext("2d");
  if (!context) { URL.revokeObjectURL(url); throw new Error("Canvas export is unavailable in this browser."); }
  context.fillStyle = palette.canvas; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png")); if (!blob) throw new Error("Could not create PNG export."); downloadBlob(blob, `${board.title.replace(/[<>:"/\\|?*]/g, "_").slice(0, 100) || "canvas"}.png`);
}
export function blankBoard(title = "Untitled canvas"): BoardState {
  return { id: crypto.randomUUID(), title, updatedAt: new Date().toISOString(), viewport: { x: 0, y: 0, scale: 1 }, layoutMeta: { mindMapBehavior: "assist" }, background: "dots", nodes: [], edges: [], texts: [], shapes: [], drawings: [], media: [], embeds: [] };
}
export function elementBounds(board: BoardState, selection: Selection): Bounds | null {
  if (selection.kind === "edges") return null;
  const el = board[selection.kind].find(e => e.id === selection.id);
  if (!el) return null;
  if ("points" in el) {
    const xs = el.points.map(p => p.x), ys = el.points.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(1, Math.max(...xs) - Math.min(...xs)), height: Math.max(1, Math.max(...ys) - Math.min(...ys)) };
  }
  if ("text" in el) {
    const fs = el.fontSize ?? 16;
    const lines = el.text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / Math.max(1, Math.floor(el.width / (fs * .55))))), 0);
    return { x: el.x, y: el.y - fs, width: el.width, height: Math.max(el.height ?? 32, lines * fs * 1.4) };
  }
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}
export function moveElement(board: BoardState, s: Selection, dx: number, dy: number): BoardState {
  if (s.kind === "edges") return board;
  return { ...board, [s.kind]: board[s.kind].map(el => el.id !== s.id ? el : "points" in el
    ? { ...el, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
    : { ...el, x: el.x + dx, y: el.y + dy }) };
}

export function selectionToStudyText(board: BoardState, selections: Selection[]) {
  const selected = new Set(selections.map(selection => selection.id));
  const nodeSelection = selections.filter(selection => selection.kind === "nodes");
  if (nodeSelection.length === 1) {
    const scope = mindMapSelectionScope(board, selections);
    if (scope) {
      const nodeById = new Map(board.nodes.map(node => [node.id, node]));
      const hierarchy = getMindMapHierarchy(board.nodes, board.edges);
      const lines = scope.nodeIds.map(id => {
        const node = nodeById.get(id)!;
        const parent = hierarchy.parent.get(id);
        return `NODE ${id}${parent ? ` (parent: ${parent})` : ""}: ${node.label}${node.sourcePage ? ` [PAGE ${node.sourcePage}]` : ""}`;
      });
      const relations = scope.edges.filter(edge => edge.kind === "relation" || board.edges.some(item => item.source === edge.source && item.target === edge.target && hierarchy.relationEdges.has(item.id)));
      for (const edge of relations) lines.push(`RELATION ${edge.source} -> ${edge.target}${edge.label ? `: ${edge.label}` : ""}`);
      return lines.join("\n").slice(0, 30_000);
    }
  }
  const lines = selections.flatMap(selection => {
    if (selection.kind === "texts") return board.texts.filter(item => item.id === selection.id).map(item => item.text);
    if (selection.kind === "nodes") return board.nodes.filter(item => item.id === selection.id).map(item => `${item.label}${item.sourcePage ? ` [PAGE ${item.sourcePage}]` : ""}`);
    if (selection.kind === "edges") return board.edges.filter(item => item.id === selection.id && item.label).map(item => item.label!);
    return [];
  });
  // Include labelled links connecting two selected endpoints even when the edge
  // itself was not selected, so AI keeps the relationship context.
  board.edges.filter(edge => edge.label && selected.has(edge.source) && selected.has(edge.target)).forEach(edge => lines.push(edge.label!));
  return [...new Set(lines.map(line => line.trim()).filter(Boolean))].join("\n\n").slice(0, 30_000);
}

export type MindMapSelectionScope = {
  rootId: string;
  nodeIds: string[];
  edges: Array<Pick<MindMapEdge, "source" | "target" | "label" | "kind">>;
};

export function mindMapSelectionScope(board: BoardState, selections: Selection[]): MindMapSelectionScope | undefined {
  const roots = selections.filter(selection => selection.kind === "nodes");
  if (roots.length !== 1) return undefined;
  const rootId = roots[0].id;
  if (!board.nodes.some(node => node.id === rootId)) return undefined;
  const hierarchy = getMindMapHierarchy(board.nodes, board.edges);
  const nodeIds = [...collectMindMapSubtree(hierarchy, rootId)];
  const included = new Set(nodeIds);
  const edges = board.edges.filter(edge => included.has(edge.source) && included.has(edge.target)).map(edge => ({ source: edge.source, target: edge.target, label: edge.label, kind: edge.kind }));
  return { rootId, nodeIds, edges };
}

export function applySelectionAi(board: BoardState, selections: Selection[], result: ContextAiResult, colors = { ink: "#18213b", fill: "#ffffff" }) {
  if (result.action === "organize") return board;
  if (result.action === "rewrite" && selections.length === 1) {
    const selection = selections[0];
    if (selection.kind === "texts") return { ...board, texts: board.texts.map(item => item.id === selection.id ? { ...item, text: result.text } : item) };
    if (selection.kind === "nodes") return { ...board, nodes: board.nodes.map(item => item.id === selection.id ? { ...item, label: result.text, height: Math.max(item.height, nodeHeight(result.text, item.width, item.sourcePage)) } : item) };
  }
  const selectedBounds = selections.flatMap(selection => { const bounds = elementBounds(board, selection); return bounds ? [bounds] : []; });
  const right = selectedBounds.length ? Math.max(...selectedBounds.map(bounds => bounds.x + bounds.width)) + 90 : 120;
  const top = selectedBounds.length ? Math.min(...selectedBounds.map(bounds => bounds.y)) : 120;
  if (result.action === "expand") {
    const parent = selections.length === 1 && selections[0].kind === "nodes" ? board.nodes.find(node => node.id === selections[0].id) : undefined;
    const root = parent ?? { id: crypto.randomUUID(), label: result.title || result.text.slice(0, 120), x: right, y: top, width: 220, height: 84, color: colors.fill };
    const childX = root.x + root.width + 100;
    const ideas = result.ideas.slice(0, 12).map((idea, index) => ({ id: crypto.randomUUID(), label: idea, parentId: root.id, x: childX, y: root.y + index * 112, width: 240, height: nodeHeight(idea, 240), color: colors.fill }));
    const edges = ideas.map(node => ({ id: crypto.randomUUID(), source: root.id, target: node.id, kind: "branch" as const }));
    return { ...board, nodes: [...board.nodes.map(node => node.id === root.id ? { ...node, collapsed: false } : node), ...(parent ? [] : [root]), ...ideas], edges: [...board.edges, ...edges] };
  }
  const id = crypto.randomUUID();
  const text = `${result.title ? `${result.title}\n` : ""}${result.text}`.trim();
  return { ...board, texts: [...board.texts, { id, text, x: right, y: top + 18, width: 360, height: Math.max(100, text.split("\n").length * 24), fontSize: 16, color: colors.ink, backgroundColor: colors.fill }] };
}
export function resizeElement(board: BoardState, s: Selection, width: number, height: number): BoardState {
  const b = elementBounds(board, s);
  if (!b || s.kind === "edges") return board;
  width = clamp(width, 24, 10000); height = clamp(height, 24, 10000);
  return { ...board, [s.kind]: board[s.kind].map(el => el.id !== s.id ? el : "points" in el
    ? { ...el, points: el.points.map(p => ({ x: b.x + (p.x - b.x) * width / b.width, y: b.y + (p.y - b.y) * height / b.height })) }
    : { ...el, width, height }) };
}
export function removeElement(board: BoardState, s: Selection): BoardState {
  return { ...board, [s.kind]: board[s.kind].filter(el => el.id !== s.id),
    edges: board.edges.filter(e => (s.kind !== "edges" || e.id !== s.id) && e.source !== s.id && e.target !== s.id) };
}
export function duplicateElement(board: BoardState, s: Selection): { board: BoardState; selection: Selection } {
  const el = board[s.kind].find(e => e.id === s.id);
  if (!el || s.kind === "edges") return { board, selection: s };
  const selection = { ...s, id: crypto.randomUUID() };
  const next = { ...board, [s.kind]: [...board[s.kind], { ...el, id: selection.id }] };
  return { board: moveElement(next, selection, 24, 24), selection };
}
export function connect(board: BoardState, source: string, target: string, kind?: MindMapEdge["kind"]): BoardState {
  if (source === target || board.edges.some(e => e.source === source && e.target === target)) return board;
  const edge = { id: crypto.randomUUID(), source, target, ...(kind ? { kind } : {}) };
  return { ...board, edges: [...board.edges, edge] };
}
export function hiddenNodes(board: BoardState): Set<string> {
  const hidden = new Set<string>();
  const hierarchy = getMindMapHierarchy(board.nodes, board.edges);
  for (const root of board.nodes.filter(n => n.collapsed)) {
    const visited = new Set([root.id]), stack = [root.id];
    while (stack.length) {
      const current = stack.pop();
      for (const child of hierarchy.children.get(current!) ?? []) if (!visited.has(child)) {
        visited.add(child); hidden.add(child); stack.push(child);
      }
    }
    hidden.delete(root.id);
  }
  return hidden;
}
export function applyGraph(board: BoardState, graph: StructuredMindMap): BoardState {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !graph.nodes.length || graph.nodes.length > 200) throw new Error("Invalid AI graph");
  const ids = new Map<string, string>();
  graph.nodes.forEach(n => {
    if (typeof n.id !== "string" || typeof n.label !== "string" || n.label.length > 10000 || ids.has(n.id)) throw new Error("Invalid AI node");
    ids.set(n.id, crypto.randomUUID());
  });
  if (graph.nodes.some(node => node.parentId !== undefined && (!ids.has(node.parentId) || node.parentId === node.id))) throw new Error("Invalid AI parent");
  const parents = new Map(graph.nodes.map(node => [node.id, node.parentId]));
  for (const node of graph.nodes) {
    const seen = new Set<string>(); let current: string | undefined = node.id;
    while (current) { if (seen.has(current)) throw new Error("Invalid AI parent cycle"); seen.add(current); current = parents.get(current); }
  }
  if (graph.edges.length > 400) throw new Error("Invalid AI edge");
  const edgeIds = new Set<string>();
  const edgePairs = new Set<string>();
  for (const edge of graph.edges) {
    const pair = `${edge.source}\u0000${edge.target}`;
    if (typeof edge.id !== "string" || edge.id.length > 120 || edgeIds.has(edge.id)
      || !ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target
      || (edge.kind !== undefined && edge.kind !== "branch" && edge.kind !== "relation")
      || edgePairs.has(pair) || edge.label !== undefined && (typeof edge.label !== "string" || edge.label.length > 10_000)) throw new Error("Invalid AI edge");
    edgeIds.add(edge.id);
    edgePairs.add(pair);
  }
  const bounds = (["nodes", "shapes", "texts", "drawings", "media", "embeds"] as const).flatMap(kind => board[kind].map(e => elementBounds(board, { kind, id: e.id })!));
  const x = bounds.length ? Math.max(...bounds.map(b => b.x + b.width)) + 100 : 100;
  const nodes = graph.nodes.map((n, i) => ({
    id: ids.get(n.id)!, label: n.label, parentId: n.parentId ? ids.get(n.parentId) : undefined, sourcePage: Number.isInteger(n.sourcePage) && n.sourcePage! > 0 ? n.sourcePage : undefined,
    sourceDocumentId: n.sourceDocumentId ?? graph.sourceDocumentId,
    x: x + (i % 3) * 250, y: 100 + Math.floor(i / 3) * 130, width: 190, height: 76, color: i === 0 ? "#e1e7ff" : "#ffffff",
  }));
  const edges = graph.edges.map(e => ({ id: crypto.randomUUID(), source: ids.get(e.source)!, target: ids.get(e.target)!, label: e.label, ...(e.kind ? { kind: e.kind } : {}) }));
  // Prefer explicit hierarchy for placement, retain the provider's cross-links.
  const hierarchy = graph.nodes.filter(n => n.parentId && ids.has(n.parentId) && n.parentId !== n.id).map(n => ({ id: crypto.randomUUID(), source: ids.get(n.parentId!)!, target: ids.get(n.id)!, kind: "branch" as const }));
  for (const edge of hierarchy) if (!edges.some(e => e.source === edge.source && e.target === edge.target && e.kind !== "relation")) edges.push({ ...edge, label: undefined });
  const layoutEdges = [...hierarchy, ...edges];
  const sourceDocuments = graph.sourceDocumentId ? [...(board.sourceDocuments ?? []).filter(document => document.id !== graph.sourceDocumentId), { id: graph.sourceDocumentId, name: graph.sourceDocumentName ?? "PDF" }] : board.sourceDocuments;
  return { ...board, sourceDocuments, nodes: [...board.nodes, ...layoutMindMap(nodes, layoutEdges, { x, y: 100 })], edges: [...board.edges, ...edges] };
}

export function arrangeMindMap(board: BoardState): BoardState {
  if (!board.nodes.length) return board;
  const other = (["shapes", "texts", "drawings", "media", "embeds"] as const).flatMap(kind => board[kind].map(e => elementBounds(board, { kind, id: e.id })!));
  const x = other.length ? Math.max(...other.map(b => b.x + b.width)) + 100 : Math.min(...board.nodes.map(n => n.x));
  return { ...board, nodes: layoutMindMap(board.nodes, board.edges, { x, y: Math.min(...board.nodes.map(n => n.y)) }) };
}

export function arrangeMindMapTwoSided(board: BoardState): { board: BoardState; summary: MindMapLayoutSummary } {
  if (!board.nodes.length) return { board, summary: { rootId: "", rootLabel: "", left: [], right: [] } };
  const other = (["shapes", "texts", "drawings", "media", "embeds"] as const).flatMap(kind => board[kind].map(e => elementBounds(board, { kind, id: e.id })!));
  const minX = Math.min(...board.nodes.map(node => node.x));
  const maxX = Math.max(...board.nodes.map(node => node.x + node.width));
  const x = other.length ? Math.max(...other.map(bounds => bounds.x + bounds.width)) + 100 : (minX + maxX) / 2 - 130;
  const result = layoutMindMapTwoSided(board.nodes, board.edges, { x, y: Math.min(...board.nodes.map(node => node.y)) });
  return { board: { ...board, nodes: result.nodes }, summary: result.summary };
}

export function arrangeMindMapMultiSided(board: BoardState, rootId?: string, sideCount = 4, mode: MindMapLayoutMode = "radial"): { board: BoardState; summary: MindMapMultiLayoutSummary } {
  if (!board.nodes.length) return { board, summary: layoutMindMapMultiSided([], [], undefined, sideCount, mode).summary };
  const selectedRoot = rootId ? board.nodes.find(node => node.id === rootId) : undefined;
  const included = new Set<string>();
  if (selectedRoot) {
    const hierarchy = getMindMapHierarchy(board.nodes, board.edges);
    for (const id of collectMindMapSubtree(hierarchy, selectedRoot.id)) included.add(id);
  } else board.nodes.forEach(node => included.add(node.id));
  const nodes = board.nodes.filter(node => included.has(node.id));
  const edges = board.edges.filter(edge => included.has(edge.source) && included.has(edge.target));
  const other = (selectedRoot ? [] : ["shapes", "texts", "drawings", "media", "embeds"] as const).flatMap(kind => board[kind].map(element => elementBounds(board, { kind, id: element.id })!));
  const minX = nodes.length ? Math.min(...nodes.map(node => node.x)) : 100;
  const minY = nodes.length ? Math.min(...nodes.map(node => node.y)) : 100;
  const origin = selectedRoot ? { x: selectedRoot.x, y: selectedRoot.y } : { x: other.length ? Math.max(...other.map(bounds => bounds.x + bounds.width)) + 100 : minX, y: minY };
  const result = layoutMindMapMultiSided(nodes, edges, origin, sideCount, mode, selectedRoot?.id);
  const positioned = new Map(result.nodes.map(node => [node.id, node]));
  return { board: { ...board, nodes: board.nodes.map(node => positioned.get(node.id) ?? node) }, summary: result.summary };
}

/** Missing metadata means an older project: keep its original free-placement behavior. */
export function mindMapLayoutBehavior(board: BoardState): MindMapLayoutBehavior {
  return board.layoutMeta?.mindMapBehavior ?? "free";
}

function validAiLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 10_000;
}

/**
 * Apply an AI-proposed branch patch atomically. The AI can edit only the
 * selected hierarchy subtree; coordinates are never accepted from the model.
 * After the content/relationship patch, the deterministic layout engine owns
 * all positions and keeps the selected root fixed.
 */
export function applyMindMapAiOperations(board: BoardState, rootId: string, operations: MindMapAiOperation[], colors = { fill: "#ffffff" }): BoardState {
  if (!board.nodes.some(node => node.id === rootId) || !Array.isArray(operations) || operations.length < 1 || operations.length > 100) return board;
  const initialHierarchy = getMindMapHierarchy(board.nodes, board.edges);
  const allowed = collectMindMapSubtree(initialHierarchy, rootId);
  const tempIds = new Map<string, string>();
  const addedIds = new Set<string>();
  const resolveId = (value: string | undefined) => value ? tempIds.get(value) ?? value : undefined;
  let next: BoardState = { ...board, nodes: [...board.nodes], edges: [...board.edges] };
  const fail = () => board;
  const isAllowed = (id: string | undefined): id is string => !!id && (allowed.has(id) || addedIds.has(id));
  const colorFor = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : colors.fill;

  for (const operation of operations) {
    if (!operation || typeof operation !== "object" || typeof operation.op !== "string") return fail();
    if (operation.op === "add") {
      if (!validAiLabel(operation.label) || !operation.id || operation.id.length > 120 || tempIds.has(operation.id) || next.nodes.some(node => node.id === operation.id)) return fail();
      const parentId = resolveId(operation.parentId) ?? rootId;
      if (!isAllowed(parentId)) return fail();
      const id = crypto.randomUUID();
      tempIds.set(operation.id, id);
      addedIds.add(id);
      const parent = next.nodes.find(node => node.id === parentId)!;
      if (!parent) return fail();
      const node = { id, label: operation.label.trim(), parentId, x: parent.x + parent.width + 120, y: parent.y, width: 240, height: nodeHeight(operation.label, 240), color: colorFor(operation.color) };
      next = { ...next, nodes: [...next.nodes, node], edges: [...next.edges, { id: crypto.randomUUID(), source: parentId, target: id, kind: "branch" as const }] };
      continue;
    }
    if (operation.op === "update") {
      const id = resolveId(operation.id);
      if (!isAllowed(id) || !next.nodes.some(node => node.id === id)) return fail();
      if (operation.label !== undefined && !validAiLabel(operation.label)) return fail();
      // The selected root defines the scope boundary. Its parent may live
      // outside that scope, so an AI patch must not detach or reparent it.
      if (id === rootId && operation.parentId !== undefined) return fail();
      const requestedParent = operation.parentId === undefined ? undefined : resolveId(operation.parentId ?? undefined);
      if (operation.parentId !== undefined && requestedParent !== undefined && !isAllowed(requestedParent)) return fail();
      if (requestedParent === id) return fail();
      const beforeHierarchy = getMindMapHierarchy(next.nodes, next.edges);
      if (requestedParent && collectMindMapSubtree(beforeHierarchy, id).has(requestedParent)) return fail();
      const oldParent = beforeHierarchy.parent.get(id);
      next = { ...next, nodes: next.nodes.map(node => node.id !== id ? node : {
        ...node,
        ...(operation.label !== undefined ? { label: operation.label.trim(), height: Math.max(node.height, nodeHeight(operation.label, node.width, node.sourcePage, node.collapsed)) } : {}),
        ...(operation.parentId !== undefined ? { parentId: requestedParent } : {}),
      }) };
      if (operation.parentId !== undefined && oldParent !== requestedParent) {
        const branchIds = beforeHierarchy.branchEdges;
        const edges = next.edges.filter(edge => !(edge.target === id && branchIds.has(edge.id)));
        next = { ...next, edges: requestedParent ? [...edges, { id: crypto.randomUUID(), source: requestedParent, target: id, kind: "branch" as const }] : edges };
        // Re-check parent metadata after the change so an AI patch cannot
        // introduce a cycle through a sequence of updates.
        const after = getMindMapHierarchy(next.nodes, next.edges);
        if (after.parent.get(id) !== requestedParent) return fail();
      }
      continue;
    }
    if (operation.op === "remove") {
      const id = resolveId(operation.id);
      if (!isAllowed(id) || id === rootId || !next.nodes.some(node => node.id === id)) return fail();
      const removeIds = collectMindMapSubtree(getMindMapHierarchy(next.nodes, next.edges), id);
      removeIds.delete(rootId);
      next = { ...next, nodes: next.nodes.filter(node => !removeIds.has(node.id)), edges: next.edges.filter(edge => !removeIds.has(edge.source) && !removeIds.has(edge.target)) };
      removeIds.forEach(removedId => addedIds.delete(removedId));
      continue;
    }
    if (operation.op === "link") {
      const source = resolveId(operation.source), target = resolveId(operation.target);
      if (!isAllowed(source) || !isAllowed(target) || source === target || !next.nodes.some(node => node.id === source) || !next.nodes.some(node => node.id === target) || !validAiLabel(operation.label ?? "relation")) return fail();
      if (next.edges.some(edge => edge.source === source && edge.target === target)) continue;
      next = { ...next, edges: [...next.edges, { id: crypto.randomUUID(), source, target, label: operation.label?.trim() || undefined, kind: "relation" as const }] };
    }
  }
  return arrangeMindMapMultiSided(next, rootId, 4, "organic").board;
}

const obj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 10000000;
const string = (v: unknown, max = 10000) => typeof v === "string" && v.length <= max;
function isCanvasBackgroundMedia(value: unknown): value is CanvasBackgroundMedia {
  if (!obj(value) || !["image", "video"].includes(value.kind) || !string(value.src, MAX_BACKGROUND_MEDIA_DATA_URL_LENGTH)) return false;
  const sourceType = /^data:(image|video)\/[a-z0-9.+-]+(?:;[^,]*)?,/i.exec(value.src)?.[1]?.toLowerCase();
  if (sourceType ? sourceType !== value.kind : !/^https?:\/\//i.test(value.src)) return false;
  if (value.name !== undefined && !string(value.name, 500)) return false;
  if (value.mimeType !== undefined && (!string(value.mimeType, 120) || !value.mimeType.toLowerCase().startsWith(`${value.kind}/`))) return false;
  if (value.opacity !== undefined && (!number(value.opacity) || value.opacity < 0 || value.opacity > 1)) return false;
  if (value.blur !== undefined && (!number(value.blur) || value.blur < 0 || value.blur > 40)) return false;
  if (value.brightness !== undefined && (!number(value.brightness) || value.brightness < 0 || value.brightness > 2)) return false;
  if (value.fit !== undefined && !["cover", "contain"].includes(value.fit)) return false;
  if (value.position !== undefined && !string(value.position, 80)) return false;
  if (value.overlay !== undefined && (typeof value.overlay !== "string" || !/^#[0-9a-f]{6}$/i.test(value.overlay))) return false;
  return true;
}
export function parseBoard(value: unknown): BoardState {
  if (!obj(value)) throw new Error("Invalid board");
  // Media was added after the original board format. Treat a missing field as
  // an empty collection so older projects remain importable.
  const b = Object.assign({}, value, { media: value.media === undefined ? [] : value.media, embeds: value.embeds === undefined ? [] : value.embeds }) as Record<string, any>;
  if (!string(b.id, 200) || !string(b.title, 500) || !string(b.updatedAt, 100) || !Number.isFinite(Date.parse(b.updatedAt))
    || !obj(b.viewport) || !number(b.viewport.x) || !number(b.viewport.y) || !number(b.viewport.scale) || b.viewport.scale < .01 || b.viewport.scale > 10) throw new Error("Invalid board metadata");
  if (b.layoutMeta !== undefined && (!obj(b.layoutMeta) || b.layoutMeta.mindMapBehavior !== undefined && !["auto", "assist", "free"].includes(b.layoutMeta.mindMapBehavior))) throw new Error("Invalid layout metadata");
  if (b.background !== undefined && !(typeof b.background === "string" ? CANVAS_BACKGROUNDS.includes(b.background as CanvasBackgroundPattern) : isCanvasBackgroundMedia(b.background))) throw new Error("Invalid canvas background");
  if (b.sourceDocuments !== undefined) {
    if (!Array.isArray(b.sourceDocuments) || b.sourceDocuments.length > 100) throw new Error("Invalid source documents");
    const documentIds = new Set<string>();
    for (const document of b.sourceDocuments) {
      if (!obj(document) || !string(document.id, 200) || !string(document.name, 500) || documentIds.has(document.id)) throw new Error("Invalid source document");
      documentIds.add(document.id);
    }
  }
  const ids = new Set<string>();
  let points = 0;
  for (const kind of ["nodes", "texts", "shapes", "drawings", "media", "embeds", "edges"] as const) {
    if (!Array.isArray(b[kind]) || b[kind].length > 5000) throw new Error("Invalid elements");
    for (const el of b[kind]) {
      if (!obj(el) || !string(el.id, 200) || ids.has(el.id)) throw new Error("Invalid element id");
      ids.add(el.id);
      if (el.rotation !== undefined && (!number(el.rotation) || el.rotation < -3600 || el.rotation > 3600) || el.hidden !== undefined && typeof el.hidden !== "boolean" || el.locked !== undefined && typeof el.locked !== "boolean") throw new Error("Invalid element flags");
      if (el.opacity !== undefined && (!number(el.opacity) || el.opacity < 0 || el.opacity > 1)) throw new Error("Invalid opacity");
      if (el.color !== undefined && (typeof el.color !== "string" || !/^#[0-9a-f]{6}$/i.test(el.color))) throw new Error("Invalid color");
      if (kind === "edges") {
        if (!string(el.source, 200) || !string(el.target, 200) || (el.kind !== undefined && !["branch", "relation"].includes(el.kind))) throw new Error("Invalid connection");
        continue;
      }
      if (kind === "drawings") {
        if (!Array.isArray(el.points) || !el.points.length || el.points.length > 20000 || !el.points.every(p => obj(p) && number(p.x) && number(p.y))
          || !number(el.opacity) || el.opacity < 0 || el.opacity > 1 || !number(el.width) || el.width <= 0) throw new Error("Invalid stroke");
        points += el.points.length; continue;
      }
      if (kind === "media") {
        const mediaType = el.kind;
        const sourceType = typeof el.src === "string" ? /^data:(image|video|audio)\/[a-z0-9.+-]+(?:;[^,]*)?,/i.exec(el.src)?.[1]?.toLowerCase() : undefined;
        if (![
          "image", "video", "audio",
        ].includes(mediaType) || !string(el.src, MAX_MEDIA_DATA_URL_LENGTH) || !sourceType || sourceType !== mediaType
          || !string(el.name, 500) || (el.mimeType !== undefined && (!string(el.mimeType, 120) || !el.mimeType.toLowerCase().startsWith(`${mediaType}/`)))) throw new Error("Invalid media");
        if (el.crop !== undefined && (!obj(el.crop) || !["top", "right", "bottom", "left"].every(edge => number(el.crop[edge]))
          || ["top", "right", "bottom", "left"].some(edge => el.crop[edge] < 0 || el.crop[edge] > 90)
          || el.crop.top + el.crop.bottom >= 100 || el.crop.left + el.crop.right >= 100)) throw new Error("Invalid media crop");
        if ((el.trimStart !== undefined && (!number(el.trimStart) || el.trimStart < 0))
          || (el.trimEnd !== undefined && (!number(el.trimEnd) || el.trimEnd < 0))
          || (el.trimStart !== undefined && el.trimEnd !== undefined && el.trimEnd <= el.trimStart)) throw new Error("Invalid media trim");
      }
      if (kind === "embeds") {
        let validUrl = false;
        try { const parsed = new URL(el.url); validUrl = parsed.protocol === "http:" || parsed.protocol === "https:"; } catch { /* invalid URL */ }
        if (!["web", "youtube", "video"].includes(el.kind) || !string(el.url, 4000) || !validUrl
          || (el.title !== undefined && !string(el.title, 500))) throw new Error("Invalid embed");
      }
      if (!number(el.x) || !number(el.y) || !number(el.width) || el.width <= 0 || (kind !== "texts" && (!number(el.height) || el.height <= 0))) throw new Error("Invalid geometry");
      if (kind === "texts" && (!string(el.text) || (el.fontSize !== undefined && (!number(el.fontSize) || el.fontSize < 8 || el.fontSize > 200))
        || (el.backgroundColor !== undefined && (typeof el.backgroundColor !== "string" || !/^#[0-9a-f]{6}$/i.test(el.backgroundColor)))
        || (el.bold !== undefined && typeof el.bold !== "boolean") || (el.italic !== undefined && typeof el.italic !== "boolean")
        || (el.underline !== undefined && typeof el.underline !== "boolean") || (el.textAlign !== undefined && !["left", "center", "right"].includes(el.textAlign)))) throw new Error("Invalid text");
      if (kind === "nodes" && (!string(el.label) || (el.sourceDocumentId !== undefined && !string(el.sourceDocumentId, 200)))) throw new Error("Invalid label");
      if (kind === "shapes" && !["rect", "ellipse", "triangle"].includes(el.kind)) throw new Error("Invalid shape");
    }
  }
  if (points > 200000 || b.edges.some((e: any) => !ids.has(e.source) || !ids.has(e.target))) throw new Error("Invalid graph");
  if (b.layerOrder !== undefined && (!Array.isArray(b.layerOrder) || b.layerOrder.length > ids.size || new Set(b.layerOrder).size !== b.layerOrder.length || b.layerOrder.some((id: unknown) => typeof id !== "string" || !ids.has(id)))) throw new Error("Invalid layers");
  if (b.groups !== undefined) {
    if (!Array.isArray(b.groups) || b.groups.length > 5000) throw new Error("Invalid groups");
    const grouped = new Set<string>(), groupIds = new Set<string>();
    for (const g of b.groups) {
      if (!obj(g) || !string(g.id, 200) || groupIds.has(g.id) || !Array.isArray(g.elementIds) || g.elementIds.length < 2) throw new Error("Invalid group");
      groupIds.add(g.id);
      for (const id of g.elementIds) { if (!ids.has(id) || grouped.has(id)) throw new Error("Invalid group member"); grouped.add(id); }
    }
  }
  if (b.nodes.some((n: any) => n.parentId !== undefined && (!string(n.parentId, 200) || !b.nodes.some((p: any) => p.id === n.parentId) || n.parentId === n.id))) throw new Error("Invalid parent");
  return structuredClone(b) as BoardState;
}
export function exportBoard(board: BoardState) {
  const blob = new Blob([JSON.stringify({ format: "mindcanvas", version: 1, board }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = (board.title.replace(/[<>:"/\\|?*]/g, "_").slice(0, 100) || "canvas") + ".mindcanvas.json";
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importBoard(file: File): Promise<BoardState> {
  if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error("File too large");
  const data = JSON.parse(await file.text());
  if (data.format !== "mindcanvas" || data.version !== 1) throw new Error("Invalid format");
  return { ...parseBoard(data.board), id: crypto.randomUUID(), updatedAt: new Date().toISOString() };
}
