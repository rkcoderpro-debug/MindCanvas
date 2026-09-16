import type { BoardState, DrawingPath, Vec2 } from "@mindcanvas/shared";

export type DrawingToolName = "pen" | "highlighter" | "eraser";
export type DrawingToolSizes = Record<DrawingToolName, number>;

export const DRAWING_SIZE_RANGES: Record<DrawingToolName, { min: number; max: number; step: number; defaultValue: number }> = {
  pen: { min: 1, max: 40, step: 1, defaultValue: 3 },
  highlighter: { min: 4, max: 80, step: 1, defaultValue: 20 },
  eraser: { min: 4, max: 120, step: 1, defaultValue: 32 },
};

export const DEFAULT_DRAWING_SIZES: DrawingToolSizes = {
  pen: DRAWING_SIZE_RANGES.pen.defaultValue,
  highlighter: DRAWING_SIZE_RANGES.highlighter.defaultValue,
  eraser: DRAWING_SIZE_RANGES.eraser.defaultValue,
};

export const DRAWING_SIZES_KEY = "mindcanvas:drawing-sizes:v1";

export function clampDrawingSize(tool: DrawingToolName, value: number): number {
  const range = DRAWING_SIZE_RANGES[tool];
  if (!Number.isFinite(value)) return range.defaultValue;
  const rounded = Math.round(value / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, rounded));
}

export function readDrawingSizes(): DrawingToolSizes {
  try {
    const raw = localStorage.getItem(DRAWING_SIZES_KEY);
    const value = raw ? JSON.parse(raw) as Partial<DrawingToolSizes> : {};
    return {
      pen: clampDrawingSize("pen", Number(value.pen)),
      highlighter: clampDrawingSize("highlighter", Number(value.highlighter)),
      eraser: clampDrawingSize("eraser", Number(value.eraser)),
    };
  } catch {
    return { ...DEFAULT_DRAWING_SIZES };
  }
}

export function saveDrawingSizes(sizes: DrawingToolSizes) {
  try {
    localStorage.setItem(DRAWING_SIZES_KEY, JSON.stringify({
      pen: clampDrawingSize("pen", sizes.pen),
      highlighter: clampDrawingSize("highlighter", sizes.highlighter),
      eraser: clampDrawingSize("eraser", sizes.eraser),
    }));
  } catch { /* Local UI preferences are optional. */ }
}

function distanceSquared(a: Vec2, b: Vec2) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function segmentDistanceSquared(point: Vec2, start: Vec2, end: Vec2) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return distanceSquared(point, start);
  const projection = Math.min(1, Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distanceSquared(point, { x: start.x + projection * dx, y: start.y + projection * dy });
}

function distanceToPolylineSquared(point: Vec2, path: Vec2[]) {
  if (path.length === 1) return distanceSquared(point, path[0]);
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < path.length; index++) best = Math.min(best, segmentDistanceSquared(point, path[index - 1], path[index]));
  return best;
}

function rotatePoint(point: Vec2, center: Vec2, degrees: number): Vec2 {
  if (!degrees) return point;
  const radians = degrees * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
  return { x: center.x + (point.x - center.x) * cos - (point.y - center.y) * sin, y: center.y + (point.x - center.x) * sin + (point.y - center.y) * cos };
}

function drawingCenter(drawing: DrawingPath): Vec2 {
  const xs = drawing.points.map(point => point.x), ys = drawing.points.map(point => point.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** Add samples to long segments so a fast eraser drag cannot jump over them. */
function samplePolyline(points: Vec2[], step: number): Vec2[] {
  if (points.length < 2) return [...points];
  const samples: Vec2[] = [points[0]];
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1], end = points[index];
    const distance = Math.sqrt(distanceSquared(start, end));
    const count = Math.max(1, Math.ceil(distance / step));
    for (let part = 1; part <= count; part++) {
      const progress = part / count;
      samples.push({ x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress });
    }
  }
  return samples;
}

function samePoint(a: Vec2, b: Vec2) {
  return Math.abs(a.x - b.x) < .0001 && Math.abs(a.y - b.y) < .0001;
}

function splitOutside(points: Vec2[], eraserPath: Vec2[], clearance: number) {
  if (!points.length) return { chunks: [] as Vec2[][], erased: false };
  const samples = samplePolyline(points, Math.max(2, clearance / 2));
  const threshold = clearance * clearance;
  const chunks: Vec2[][] = [];
  let chunk: Vec2[] = [], erased = false;
  for (const point of samples) {
    if (distanceToPolylineSquared(point, eraserPath) <= threshold) {
      erased = true;
      if (chunk.length) { chunks.push(chunk); chunk = []; }
    } else if (!chunk.length || !samePoint(chunk.at(-1)!, point)) {
      chunk.push(point);
    }
  }
  if (chunk.length) chunks.push(chunk);
  return { chunks, erased };
}

function newDrawingId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `drawing-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Erase only the visible vector drawings touched by an eraser polyline.
 * Shapes, nodes, media and connectors are intentionally outside this command.
 */
export function eraseDrawingPaths(board: BoardState, eraserPoints: Vec2[], radius: number): BoardState {
  const path = eraserPoints.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!path.length || !Number.isFinite(radius) || radius <= 0 || !board.drawings.length) return board;

  let changed = false;
  const drawings = board.drawings.flatMap(drawing => {
    if (drawing.hidden || drawing.locked || !drawing.points.length) return [drawing];
    const center = drawingCenter(drawing), rotation = drawing.rotation ?? 0;
    // Drawing points are stored before the optional visual rotation. Convert
    // the eraser into that local space so rotated strokes erase where users see them.
    const localEraser = path.map(point => rotatePoint(point, center, -rotation));
    const result = splitOutside(drawing.points, localEraser, radius + Math.max(0, drawing.width) / 2);
    if (!result.erased) return [drawing];
    changed = true;
    return result.chunks.map((points, index) => ({
      ...drawing,
      id: index === 0 ? drawing.id : newDrawingId(),
      // The renderer rotates each path around its own bounds. Once one
      // rotated path becomes several paths, bake the old transform into the
      // points so the remaining pieces stay exactly where the user saw them.
      ...(rotation ? { points: points.map(point => rotatePoint(point, center, rotation)), rotation: undefined } : { points }),
    }));
  });
  return changed ? { ...board, drawings } : board;
}
