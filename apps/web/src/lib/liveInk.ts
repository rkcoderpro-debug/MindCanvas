import type { BoardState, Vec2 } from "@mindcanvas/shared";

type Stroke = BoardState["drawings"][number];
type ScreenSample = { clientX: number; clientY: number };
const SVG = "http://www.w3.org/2000/svg";
const POINT_LIMIT = 20000;
const SEGMENTS_PER_PATH = 128;

/** Mutable input buffer used only while drawing; published snapshots own their points. */
export class LiveInk {
  private readonly points: Vec2[];
  private rendered = 0;
  private path: SVGPathElement | undefined;
  private commands = "";
  lastInputAt = performance.now();

  constructor(private stroke: Stroke, private viewport: BoardState["viewport"]) {
    this.points = [...stroke.points];
  }

  get count() { return this.points.length; }

  append(sample: ScreenSample, rect: { left: number; top: number }, final = false) {
    const x = (sample.clientX - rect.left - this.viewport.x) / this.viewport.scale;
    const y = (sample.clientY - rect.top - this.viewport.y) / this.viewport.scale;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const last = this.points[this.points.length - 1];
    if ((last.x === x && last.y === y) || this.points.length >= (final ? POINT_LIMIT : POINT_LIMIT - 1)) return false;
    this.points.push({ x, y });
    this.lastInputAt = performance.now();
    return true;
  }

  snapshot(base: BoardState): BoardState {
    return { ...base, drawings: [...base.drawings, { ...this.stroke, points: this.points.slice() }] };
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
    const count = this.points.length;
    if (count === this.rendered) return;
    for (let index = this.rendered; index < count; index++) {
      const p = this.points[index];
      if (index === 0 || (index > 1 && (index - 1) % SEGMENTS_PER_PATH === 0)) {
        if (this.path) this.path.setAttribute("d", this.commands);
        this.path = layer.ownerDocument.createElementNS(SVG, "path");
        layer.appendChild(this.path);
        const start = index === 0 ? p : this.points[index - 1];
        this.commands = `M${start.x},${start.y}`;
      }
      if (index > 0) this.commands += ` L${p.x},${p.y}`;
    }
    this.path?.setAttribute("d", this.commands + (count === 1 ? " l0.01,0.01" : ""));
    this.rendered = count;
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
