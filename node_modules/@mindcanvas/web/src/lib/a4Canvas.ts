import type { A4CanvasLayout, BoardState, CanvasPage, DrawingPath, Vec2 } from "@mindcanvas/shared";

export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;
export const A4_GAP = 28;
export const A4_MARGIN = 64;
export const A4_FONT = 17;
export const A4_LINE = 27;
export const A4_COLS = 64;
export const A4_LINES = Math.floor((A4_HEIGHT - A4_MARGIN * 2) / A4_LINE);
export const A4_MAX_PAGES = 200;
const MAX_TEXT = 40_000;
const geometry = ["texts", "shapes", "media", "embeds"] as const;

export const newA4Page = (text = "", flows = false): CanvasPage => ({ id: crypto.randomUUID(), text, ...(flows ? { flows } : {}) });
export const newA4Layout = (): A4CanvasLayout => ({ mode: "separate", paper: "plain", pages: [newA4Page()] });
export const pageStride = (layout: A4CanvasLayout) => A4_HEIGHT + (layout.mode === "separate" ? A4_GAP : 0);
export const a4PageIndex = (y: number) => Math.max(0, Math.floor(y / A4_HEIGHT));
export const a4ViewY = (y: number, stride: number) => y + a4PageIndex(y) * (stride - A4_HEIGHT);
export function a4WorldY(y: number, stride: number) {
  if (y < 0) return y;
  const page = Math.floor(y / stride);
  return page * A4_HEIGHT + Math.min(A4_HEIGHT - .00001, y - page * stride);
}
export function isA4Layout(value: unknown): value is A4CanvasLayout {
  const a4 = value as A4CanvasLayout | null;
  if (!a4 || !["separate", "continuous"].includes(a4.mode) || !["plain", "ruled", "grid"].includes(a4.paper) ||
      !Array.isArray(a4.pages) || !a4.pages.length || a4.pages.length > A4_MAX_PAGES) return false;
  const ids = new Set<string>();
  return a4.pages.every(page => {
    if (!page || typeof page.id !== "string" || !page.id || page.id.length > 200 || ids.has(page.id) ||
        typeof page.text !== "string" || page.text.length > MAX_TEXT || (page.flows !== undefined && typeof page.flows !== "boolean")) return false;
    ids.add(page.id);
    return true;
  });
}

/** Offsets remain offsets into the original string so pagination never changes the text. */
export function ruledLines(text: string): { start: number; end: number; display: string }[] {
  const result: { start: number; end: number; display: string }[] = [];
  let start = 0, offset = 0, columns = 0, space = -1;
  const push = (end: number) => result.push({ start, end, display: text.slice(start, end).replace(/\n$/, "") });
  for (const char of text) {
    if (char === "\n") { offset++; push(offset); start = offset; columns = 0; space = -1; continue; }
    if (columns >= A4_COLS && !/\p{Mark}/u.test(char)) {
      const end = space > start ? space : offset;
      push(end); start = end; columns = Array.from(text.slice(start, offset)).length; space = -1;
    }
    offset += char.length;
    if (!/\p{Mark}/u.test(char)) columns++;
    if (char === " " || char === "\t") space = offset;
  }
  push(text.length);
  return result;
}

export function updateA4Text(layout: A4CanvasLayout, index: number, input: string, caret: number) {
  const pages = [...layout.pages];
  if (index >= A4_MAX_PAGES || input.length > MAX_TEXT) return null;
  if (!pages[index]) pages.push(newA4Page());
  let end = index + 1;
  while (pages[end]?.flows) end++;
  const text = input + pages.slice(index + 1, end).map(page => page.text).join("");
  const lines = ruledLines(text);
  const chunks: string[] = [];
  const from: number[] = [];
  for (let i = 0; i < lines.length; i += A4_LINES) {
    from.push(lines[i].start);
    const chunk = text.slice(lines[i].start, lines[i + A4_LINES]?.start ?? text.length);
    chunks.push(chunk);
  }
  // Keep the pages where annotations were placed. If a flowing chapter needs
  // more paper, insert new pages ahead of the next explicit page break.
  const existing = pages.slice(index, end);
  const count = Math.max(chunks.length, existing.length);
  if (pages.length - existing.length + count > A4_MAX_PAGES) return null;
  const replacement = Array.from({ length: count }, (_, i) => ({
    ...(existing[i] ?? newA4Page("", true)), text: chunks[i] ?? "", ...(i ? { flows: true } : {}),
  }));
  let cursorPage = 0;
  while (cursorPage + 1 < from.length && from[cursorPage + 1] <= caret) cursorPage++;
  return { pages: [...pages.slice(0, index), ...replacement, ...pages.slice(end)], caretPage: index + cursorPage, caret: caret - from[cursorPage], insertedAt: end, inserted: count - existing.length };
}

function projectInk(points: Vec2[], stride: number) {
  const view: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const next = points[i], previous = points[i - 1];
    if (previous && next.y !== previous.y) {
      const dir = next.y > previous.y ? 1 : -1;
      const start = a4PageIndex(previous.y), end = a4PageIndex(next.y);
      for (let page = start; page !== end; page += dir) {
        const boundary = (page + (dir === 1 ? 1 : 0)) * A4_HEIGHT;
        const x = previous.x + (next.x - previous.x) * (boundary - previous.y) / (next.y - previous.y);
        const low = a4ViewY(boundary - .00001, stride), high = a4ViewY(boundary, stride);
        view.push({ x, y: dir === 1 ? low : high }, { x, y: dir === 1 ? high : low });
      }
    }
    view.push({ x: next.x, y: a4ViewY(next.y, stride) });
  }
  return view;
}

export function projectA4Board(board: BoardState, viewport: BoardState["viewport"]): BoardState {
  const stride = board.a4 ? pageStride(board.a4) : A4_HEIGHT;
  const map = <T extends { y: number }>(items: T[]) => stride === A4_HEIGHT ? items : items.map(item => ({ ...item, y: a4ViewY(item.y, stride) }));
  return {
    ...board, viewport,
    texts: map(board.texts), shapes: map(board.shapes), media: map(board.media), embeds: map(board.embeds),
    drawings: stride === A4_HEIGHT ? board.drawings : board.drawings.map(item => ({ ...item, points: projectInk(item.points, stride) })),
  };
}

function hasPaperPoint(point: Vec2, stride: number, pages: number) {
  return point.x >= 0 && point.x <= A4_WIDTH && point.y >= 0 && point.y < stride * pages && point.y % stride < A4_HEIGHT;
}

export function unprojectA4Board(old: BoardState, presented: BoardState, changed: BoardState, phantom: boolean): BoardState {
  const stride = pageStride(old.a4!), pages = old.a4!.pages;
  const allowed = pages.length + (phantom ? 1 : 0);
  let used = pages.length;
  const preserve = <T extends { id: string; x: number; y: number; width: number; height?: number }>(data: T[], original: T[], shown: T[]) => {
    const before = new Map(original.map(item => [item.id, item]));
    const visible = new Map(shown.map(item => [item.id, item]));
    return data.flatMap(item => {
      const originalItem = before.get(item.id), view = visible.get(item.id);
      if (item === view && originalItem) return [originalItem];
      if (!hasPaperPoint({ x: item.x + item.width / 2, y: item.y + 0.01 }, stride, allowed) && !originalItem) return [];
      const y = originalItem && view?.y === item.y ? originalItem.y : Math.min(allowed * A4_HEIGHT - 1, Math.max(0, a4WorldY(item.y, stride)));
      used = Math.max(used, a4PageIndex(y) + 1);
      const x = Math.min(A4_WIDTH - Math.min(item.width, 24), Math.max(0, item.x));
      // Ordinary objects have a home page; only freehand strokes flow
      // over the page boundary. Preserve the aspect ratio of placed media.
      const availableHeight = Math.max(1, A4_HEIGHT - y % A4_HEIGHT);
      const availableWidth = A4_WIDTH - x;
      const reshape = !originalItem || view?.x !== item.x || view?.y !== item.y || view?.width !== item.width || view?.height !== item.height;
      if (!reshape) return [{ ...item, x, y }];
      const factor = "src" in item && item.height ? Math.min(1, availableWidth / item.width, availableHeight / item.height) : 1;
      return [{ ...item, x, y, width: Math.max(1, Math.min(item.width * factor, availableWidth)),
        ...(item.height === undefined ? {} : { height: Math.max(1, Math.min(item.height * factor, availableHeight)) }) }];
    });
  };
  const originalInk = new Map(old.drawings.map(item => [item.id, item]));
  const visibleInk = new Map(presented.drawings.map(item => [item.id, item]));
  const drawings = changed.drawings.flatMap(item => {
    const view = visibleInk.get(item.id), original = originalInk.get(item.id);
    if (view === item && original) return [original];
    if (view?.points === item.points && original) return [{ ...item, points: original.points }];
    if (!original && !item.points.some(p => hasPaperPoint(p, stride, allowed))) return [];
    const points = stride === A4_HEIGHT && item.points.every(p => p.y >= 0 && p.y < allowed * A4_HEIGHT) ? item.points :
      item.points.map(p => ({ x: p.x, y: Math.max(0, Math.min(allowed * A4_HEIGHT - .00001, a4WorldY(p.y, stride))) }));
    const maxPage = points.reduce((max, point) => hasPaperPoint(point, A4_HEIGHT, allowed) ? Math.max(max, a4PageIndex(point.y) + 1) : max, 0);
    used = Math.max(used, maxPage);
    return [{ ...item, points }];
  });
  const result = {
    ...changed, viewport: old.viewport, background: changed.background,
    texts: preserve(changed.texts, old.texts, presented.texts), shapes: preserve(changed.shapes, old.shapes, presented.shapes),
    media: preserve(changed.media, old.media, presented.media), embeds: preserve(changed.embeds, old.embeds, presented.embeds), drawings,
    nodes: [], a4: old.a4,
  };
  const endpoints = new Set(result.shapes.map(shape => shape.id));
  result.edges = result.edges.filter(edge => edge.kind === "relation" && endpoints.has(edge.source) && endpoints.has(edge.target));
  const validIds = new Set([...geometry.flatMap(kind => result[kind].map(item => item.id)), ...result.drawings.map(item => item.id), ...result.edges.map(item => item.id)]);
  if (result.layerOrder) result.layerOrder = result.layerOrder.filter(id => validIds.has(id));
  if (result.groups) result.groups = result.groups.map(group => ({ ...group, elementIds: group.elementIds.filter(id => validIds.has(id)) })).filter(group => group.elementIds.length > 1);
  if (used > pages.length) result.a4 = { ...old.a4!, pages: [...pages, newA4Page()] };
  return result;
}

/** Clip a polyline at a page boundary without dropping the intersecting edge. */
function inkOnPage(points: Vec2[], index: number): Vec2[][] {
  const top = index * A4_HEIGHT, bottom = top + A4_HEIGHT;
  if (points.length === 1) return points[0].y >= top && points[0].y < bottom ? [points] : [];
  const segments: Vec2[][] = [];
  let segment: Vec2[] | undefined;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], delta = b.y - a.y;
    if (!delta && (a.y < top || a.y >= bottom)) { segment = undefined; continue; }
    const from = delta ? Math.max(0, Math.min((top - a.y) / delta, (bottom - a.y) / delta)) : 0;
    const to = delta ? Math.min(1, Math.max((top - a.y) / delta, (bottom - a.y) / delta)) : 1;
    if (from >= to) { segment = undefined; continue; }
    const p = (f: number) => ({ x: a.x + (b.x - a.x) * f, y: Math.min(bottom - .00001, a.y + delta * f) });
    if (!segment || from > 0) { segment = [p(from)]; segments.push(segment); }
    segment.push(p(to));
    if (to < 1) segment = undefined;
  }
  return segments;
}

export function rearrangeA4Pages(board: BoardState, pages: CanvasPage[], explicitBreaks = true): BoardState {
  if (!board.a4) return board;
  const newPositions = new Map(pages.map((page, i) => [page.id, i]));
  const positions = board.a4.pages.map(page => newPositions.get(page.id));
  const yFor = (y: number) => {
    const index = a4PageIndex(y), to = positions[index];
    return to === undefined ? null : y + (to - index) * A4_HEIGHT;
  };
  const map = <T extends { y: number }>(items: T[]) => items.flatMap(item => { const y = yFor(item.y); return y === null ? [] : [{ ...item, y }]; });
  const drawings = board.drawings.flatMap((drawing): DrawingPath[] => {
    if (!drawing.points.length) return [];
    const minIndex = drawing.points.reduce((min, p) => Math.min(min, a4PageIndex(p.y)), Number.POSITIVE_INFINITY);
    const maxIndex = drawing.points.reduce((max, p) => Math.max(max, a4PageIndex(p.y)), 0);
    const first = positions[minIndex];
    if (first !== undefined && positions.slice(minIndex, maxIndex + 1).every((position, i) => position === first + i) && maxIndex < positions.length) {
      const delta = (first - minIndex) * A4_HEIGHT;
      return [delta ? { ...drawing, points: drawing.points.map(p => ({ ...p, y: p.y + delta })) } : drawing];
    }
    const result: DrawingPath[] = [];
    for (let from = minIndex; from <= Math.min(maxIndex, positions.length - 1); from++) {
      const to = positions[from]; if (to === undefined) continue;
      for (const segment of inkOnPage(drawing.points, from)) result.push({
        ...drawing, id: result.length ? crypto.randomUUID() : drawing.id,
        points: segment.map(p => ({ ...p, y: p.y + (to - from) * A4_HEIGHT })),
      });
    }
    return result;
  });
  const result = { ...board, a4: { ...board.a4, pages: explicitBreaks ? pages.map(page => ({ ...page, flows: undefined })) : pages },
    texts: map(board.texts), shapes: map(board.shapes), drawings, media: map(board.media), embeds: map(board.embeds) };
  const endpoints = new Set(result.shapes.map(item => item.id));
  result.edges = board.edges.filter(item => endpoints.has(item.source) && endpoints.has(item.target));
  const ids = new Set([...geometry.flatMap(kind => result[kind].map(item => item.id)), ...drawings.map(item => item.id), ...result.edges.map(item => item.id)]);
  if (result.layerOrder) result.layerOrder = result.layerOrder.filter(id => ids.has(id));
  if (result.groups) result.groups = result.groups.map(group => ({ ...group, elementIds: group.elementIds.filter(id => ids.has(id)) })).filter(group => group.elementIds.length > 1);
  return result;
}
