export type AnnotationPoint = { x: number; y: number };
export type AnnotationTool = "pen" | "highlight";
export type AnnotationStroke = {
  points: AnnotationPoint[];
  color: string;
  width: number;
  tool?: AnnotationTool;
};

const EPSILON = 0.0001;

function clonePoint(point: AnnotationPoint): AnnotationPoint {
  return { x: point.x, y: point.y };
}

export function cloneAnnotationStrokes(strokes: AnnotationStroke[]): AnnotationStroke[] {
  return strokes.map(stroke => ({ ...stroke, points: stroke.points.map(clonePoint) }));
}

export function cloneAnnotationMap(strokes: Record<number, AnnotationStroke[]>): Record<number, AnnotationStroke[]> {
  return Object.fromEntries(Object.entries(strokes).map(([page, pageStrokes]) => [page, cloneAnnotationStrokes(pageStrokes)]));
}

function samePoint(left: AnnotationPoint, right: AnnotationPoint) {
  return Math.abs(left.x - right.x) <= EPSILON && Math.abs(left.y - right.y) <= EPSILON;
}

function lerp(left: AnnotationPoint, right: AnnotationPoint, amount: number): AnnotationPoint {
  return { x: left.x + (right.x - left.x) * amount, y: left.y + (right.y - left.y) * amount };
}

function distanceSquared(left: AnnotationPoint, right: AnnotationPoint) {
  const x = left.x - right.x;
  const y = left.y - right.y;
  return x * x + y * y;
}

function circleIntersections(start: AnnotationPoint, end: AnnotationPoint, center: AnnotationPoint, radius: number) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const a = dx * dx + dy * dy;
  if (a <= EPSILON) return [] as number[];
  const fx = start.x - center.x;
  const fy = start.y - center.y;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant <= 0) return [] as number[];
  const root = Math.sqrt(discriminant);
  const first = (-b - root) / (2 * a);
  const second = (-b + root) / (2 * a);
  return [first, second].filter(value => value > EPSILON && value < 1 - EPSILON).sort((left, right) => left - right);
}

function splitStrokeAroundCircle(stroke: AnnotationStroke, center: AnnotationPoint, radius: number): AnnotationStroke[] {
  const effectiveRadius = radius + Math.max(0, stroke.width) / 2;
  if (stroke.points.length < 2) return distanceSquared(stroke.points[0] ?? center, center) > effectiveRadius * effectiveRadius ? [cloneAnnotationStrokes([stroke])[0]] : [];
  const pieces: AnnotationStroke[] = [];
  let current: AnnotationPoint[] = [];
  const flush = () => {
    if (current.length >= 2) pieces.push({ ...stroke, points: current });
    current = [];
  };
  const addOutsideSegment = (start: AnnotationPoint, end: AnnotationPoint) => {
    if (!current.length) {
      current.push(clonePoint(start), clonePoint(end));
      return;
    }
    const last = current[current.length - 1];
    if (samePoint(last, start)) current.push(clonePoint(end));
    else {
      flush();
      current.push(clonePoint(start), clonePoint(end));
    }
  };
  for (let index = 1; index < stroke.points.length; index += 1) {
    const start = stroke.points[index - 1];
    const end = stroke.points[index];
    const breaks = [0, ...circleIntersections(start, end, center, effectiveRadius), 1];
    for (let breakIndex = 1; breakIndex < breaks.length; breakIndex += 1) {
      const from = breaks[breakIndex - 1];
      const to = breaks[breakIndex];
      const middle = lerp(start, end, (from + to) / 2);
      if (distanceSquared(middle, center) > effectiveRadius * effectiveRadius) addOutsideSegment(lerp(start, end, from), lerp(start, end, to));
      else flush();
    }
  }
  flush();
  return pieces;
}

/** Remove only the portions of annotation strokes touched by the eraser. */
export function eraseAnnotationStrokes(strokes: AnnotationStroke[], center: AnnotationPoint, radius: number): AnnotationStroke[] {
  if (!Number.isFinite(radius) || radius <= 0) return cloneAnnotationStrokes(strokes);
  return strokes.flatMap(stroke => splitStrokeAroundCircle(stroke, center, radius));
}

export function annotationMapsEqual(left: Record<number, AnnotationStroke[]>, right: Record<number, AnnotationStroke[]>) {
  const pages = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const page of pages) {
    const leftStrokes = left[Number(page)] ?? [];
    const rightStrokes = right[Number(page)] ?? [];
    if (leftStrokes.length !== rightStrokes.length) return false;
    for (let index = 0; index < leftStrokes.length; index += 1) {
      const a = leftStrokes[index];
      const b = rightStrokes[index];
      if (a.color !== b.color || a.width !== b.width || (a.tool ?? "pen") !== (b.tool ?? "pen") || a.points.length !== b.points.length) return false;
      if (a.points.some((point, pointIndex) => !samePoint(point, b.points[pointIndex]))) return false;
    }
  }
  return true;
}
