import type { BoardState, Vec2 } from "@mindcanvas/shared";

type Stroke = BoardState["drawings"][number];
type ScreenSample = { clientX: number; clientY: number };
const SVG = "http://www.w3.org/2000/svg";
const POINT_LIMIT = 20000;
const SEGMENTS_PER_PATH = 128;
const MAX_CORNER_VERTICES = 5;

const mix = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Finalize one bend as soon as its next real sample arrives. Tolerances are in CSS px. */
function appendBend(out: Vec2[], a: Vec2, b: Vec2, c: Vec2, scale: number, noisePx: number) {
  const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
  const dot = ux * vx + uy * vy;
  const turn = ux * vy - uy * vx;
  const inLength = Math.hypot(ux, uy), outLength = Math.hypot(vx, vy);
  if ((dot >= 0 && Math.abs(turn) <= dot * .0175) || !inLength || !outLength) {
    out.push(b);
    return;
  }

  // Suppress small zigzags along the direction of travel, without pulling back a hook or cusp.
  if (Math.max(inLength, outLength) * scale <= 14) {
    const dx = c.x - a.x, dy = c.y - a.y;
    const along = ux * dx + uy * dy;
    const chordSq = dx * dx + dy * dy;
    if (along > 0 && along < chordSq && Math.abs(turn) * scale <= noisePx * Math.sqrt(chordSq)) {
      out.push(mix(b, mix(a, c, along / chordSq), .78));
      return;
    }
  }

  const cosine = dot / (inLength * outLength);
  const trim = Math.min(.43 * Math.min(inLength, outLength), 12 / scale);
  const sagittaPx = trim * .5 * Math.sqrt(Math.max(0, (1 - cosine) * .5)) * scale;
  // A clear corner stays sharp. The trim also keeps curves on adjacent samples from overlapping.
  if (cosine <= .30 || sagittaPx < .18 || out.length > POINT_LIMIT - 1 - MAX_CORNER_VERTICES) {
    out.push(b);
    return;
  }

  const entry = mix(b, a, trim / inLength);
  const exit = mix(b, c, trim / outLength);
  const steps = Math.min(MAX_CORNER_VERTICES - 1, Math.max(2, Math.ceil(Math.sqrt(sagittaPx / .24))));
  out.push(entry);
  for (let step = 1; step < steps; step++) {
    const t = step / steps;
    out.push(mix(mix(entry, b, t), mix(b, exit, t), t));
  }
  out.push(exit);
}

/** Mutable input buffer used only while drawing; published snapshots own their points. */
export class LiveInk {
  private readonly stablePoints: Vec2[];
  private previous: Vec2 | undefined;
  private tip: Vec2;
  private paintedTip: Vec2 | undefined;
  private readonly noisePx: number;
  private rendered = 0;
  private path: SVGPathElement | undefined;
  private commands = "";
  lastInputAt = performance.now();

  constructor(private stroke: Stroke, private viewport: BoardState["viewport"]) {
    this.stablePoints = stroke.points.slice(0, -1);
    this.previous = this.stablePoints.at(-1);
    this.tip = stroke.points.at(-1)!;
    this.noisePx = Math.max(.8, Math.min(1.8, stroke.width * viewport.scale * .43));
  }

  get count() { return this.stablePoints.length + 1; }

  append(sample: ScreenSample, rect: { left: number; top: number }, final = false) {
    const x = (sample.clientX - rect.left - this.viewport.x) / this.viewport.scale;
    const y = (sample.clientY - rect.top - this.viewport.y) / this.viewport.scale;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const last = this.tip;
    if ((last.x === x && last.y === y) || (!final && this.count >= POINT_LIMIT - 1)) return false;
    const next = { x, y };
    if (this.count < POINT_LIMIT) {
      // A regular sample leaves room for the release position, even at the limit.
      if (this.previous && (final || this.count <= POINT_LIMIT - 1 - MAX_CORNER_VERTICES)) {
        appendBend(this.stablePoints, this.previous, last, next, this.viewport.scale, this.noisePx);
      } else this.stablePoints.push(last);
      this.previous = last;
    }
    this.tip = next;
    this.lastInputAt = performance.now();
    return true;
  }

  snapshot(base: BoardState): BoardState {
    return { ...base, drawings: [...base.drawings, { ...this.stroke, points: [...this.stablePoints, this.tip] }] };
  }

  begin(layer: SVGGElement) {
    layer.replaceChildren();
    const { x, y, scale } = this.viewport;
    layer.setAttribute("transform", `translate(${x} ${y}) scale(${scale})`);
    layer.setAttribute("stroke", this.stroke.color);
    layer.setAttribute("stroke-width", String(this.stroke.width));
    // Composite highlighter opacity once, including where segments meet.
    layer.setAttribute("opacity", String(this.stroke.opacity));
    this.paint(layer);
  }

  paint(layer: SVGGElement) {
    if (this.tip === this.paintedTip) return;
    const stableCount = this.stablePoints.length;
    for (let index = this.rendered; index < stableCount; index++) {
      const p = this.stablePoints[index];
      if (index === 0 || (index > 1 && (index - 1) % SEGMENTS_PER_PATH === 0)) {
        if (index > 0 || !this.path) {
          if (this.path) this.path.setAttribute("d", this.commands);
          this.path = layer.ownerDocument.createElementNS(SVG, "path");
          layer.appendChild(this.path);
        }
        const start = index === 0 ? p : this.stablePoints[index - 1];
        this.commands = `M${start.x},${start.y}`;
      }
      if (index > 0) this.commands += ` L${p.x},${p.y}`;
    }
    // Only the very end is provisional. The tip always tracks the actual pointer.
    const { x, y } = this.tip;
    if (stableCount === 0 && !this.path) {
      this.path = layer.ownerDocument.createElementNS(SVG, "path");
      layer.appendChild(this.path);
    }
    this.path?.setAttribute("d", stableCount ? `${this.commands} L${x},${y}` : `M${x},${y} l0.01,0.01`);
    this.rendered = stableCount;
    this.paintedTip = this.tip;
  }
}

/** Browsers can bundle several tablet samples into one pointermove. */
export function actualPointerSamples(event: PointerEvent): readonly ScreenSample[] {
  try {
    const batch = event.getCoalescedEvents?.();
    if (batch?.length) {
      const last = batch[batch.length - 1];
      return last.clientX === event.clientX && last.clientY === event.clientY ? batch : [...batch, event];
    }
  } catch { /* Use the dispatched position when a browser cannot supply samples. */ }
  return [event];
}
