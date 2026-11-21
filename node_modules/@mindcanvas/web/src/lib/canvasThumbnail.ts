import type { BoardState, CanvasThumbnail, CanvasThumbnailItem, CanvasBackgroundPattern } from "@mindcanvas/shared";

const MAX_THUMBNAIL_ITEMS = 50;
const MAX_LABEL_LENGTH = 90;

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function label(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH) || undefined;
}

function bounds(item: CanvasThumbnailItem) {
  if (item.points?.length) {
    const xs = item.points.map(point => point.x), ys = item.points.map(point => point.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(1, Math.max(...xs) - Math.min(...xs)), height: Math.max(1, Math.max(...ys) - Math.min(...ys)) };
  }
  return { x: item.x, y: item.y, width: Math.max(1, item.width), height: Math.max(1, item.height) };
}

function push(items: CanvasThumbnailItem[], item: CanvasThumbnailItem) {
  if (items.length < MAX_THUMBNAIL_ITEMS) items.push(item);
}

export function createCanvasThumbnail(board: BoardState): CanvasThumbnail {
  const items: CanvasThumbnailItem[] = [];
  for (const node of board.nodes) push(items, { kind: "node", x: finite(node.x), y: finite(node.y), width: finite(node.width, 180), height: finite(node.height, 70), color: node.color, label: label(node.label) });
  for (const text of board.texts) push(items, { kind: "text", x: finite(text.x), y: finite(text.y), width: finite(text.width, 180), height: finite(text.height, 44), color: text.color, label: label(text.text) });
  for (const shape of board.shapes) push(items, { kind: "shape", x: finite(shape.x), y: finite(shape.y), width: finite(shape.width, 100), height: finite(shape.height, 70), color: shape.color });
  for (const drawing of board.drawings) push(items, { kind: "drawing", x: 0, y: 0, width: 1, height: 1, color: drawing.color, points: drawing.points.slice(0, 80).map(point => ({ x: finite(point.x), y: finite(point.y) })) });
  const elements = new Map([...board.nodes, ...board.shapes].map(item => [item.id, item]));
  for (const edge of board.edges) {
    const source = elements.get(edge.source), target = elements.get(edge.target);
    if (!source || !target) continue;
    const from = { x: finite(source.x + source.width / 2), y: finite(source.y + source.height / 2) }, to = { x: finite(target.x + target.width / 2), y: finite(target.y + target.height / 2) };
    push(items, { kind: "edge", x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.max(1, Math.abs(to.x - from.x)), height: Math.max(1, Math.abs(to.y - from.y)), color: "var(--connector)", label: label(edge.label), source: from, target: to });
  }
  for (const media of board.media) push(items, { kind: "media", x: finite(media.x), y: finite(media.y), width: finite(media.width, 180), height: finite(media.height, 110), label: label(media.name) ?? media.kind });
  for (const embed of board.embeds) push(items, { kind: "embed", x: finite(embed.x), y: finite(embed.y), width: finite(embed.width, 240), height: finite(embed.height, 140), label: label(embed.title) ?? (embed.kind === "youtube" ? "YouTube" : "Web") });
  const allBounds = items.map(bounds);
  const left = allBounds.length ? Math.min(...allBounds.map(item => item.x)) : 0;
  const top = allBounds.length ? Math.min(...allBounds.map(item => item.y)) : 0;
  const right = allBounds.length ? Math.max(...allBounds.map(item => item.x + item.width)) : 500;
  const bottom = allBounds.length ? Math.max(...allBounds.map(item => item.y + item.height)) : 240;
  const background: CanvasBackgroundPattern = typeof board.background === "string" ? board.background : "plain";
  return { version: 1, background, items, bounds: { x: left - 40, y: top - 40, width: Math.max(200, right - left + 80), height: Math.max(120, bottom - top + 80) } };
}

export function isCanvasThumbnail(value: unknown): value is CanvasThumbnail {
  if (!value || typeof value !== "object") return false;
  const thumbnail = value as Partial<CanvasThumbnail>;
  const boundsValue = thumbnail.bounds;
  const validKinds = new Set<CanvasThumbnailItem["kind"]>(["node", "text", "shape", "drawing", "edge", "media", "embed"]);
  const validBackgrounds = new Set<CanvasBackgroundPattern>(["dots", "grid", "ruled", "graph", "isometric", "plain"]);
  return thumbnail.version === 1
    && typeof thumbnail.background === "string"
    && validBackgrounds.has(thumbnail.background as CanvasBackgroundPattern)
    && Array.isArray(thumbnail.items)
    && thumbnail.items.length <= MAX_THUMBNAIL_ITEMS
    && thumbnail.items.every(item => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as CanvasThumbnailItem;
      return validKinds.has(candidate.kind)
        && [candidate.x, candidate.y, candidate.width, candidate.height].every(Number.isFinite)
        && (!candidate.points || candidate.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
    })
    && !!boundsValue
    && [boundsValue.x, boundsValue.y, boundsValue.width, boundsValue.height].every(Number.isFinite)
    && boundsValue.width > 0
    && boundsValue.height > 0;
}

export function thumbnailItemBounds(item: CanvasThumbnailItem) {
  return bounds(item);
}
