export type CanvasViewport = { x: number; y: number; scale: number };
export type ViewportAnchor = { x: number; y: number };

export const MIN_CANVAS_SCALE = 0.2;
export const MAX_CANVAS_SCALE = 4;

/** Convert line/page wheel units to a predictable pixel-like distance. */
export function normalizeWheelDelta(deltaX: number, deltaY: number, deltaMode: number) {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1;
  return { x: deltaX * unit, y: deltaY * unit };
}

export function panViewport(viewport: CanvasViewport, dx: number, dy: number): CanvasViewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

/** Zoom around a screen-space point so the point under the cursor stays fixed. */
export function zoomViewportAtPoint(viewport: CanvasViewport, deltaY: number, anchor: ViewportAnchor, sensitivity = 0.0018): CanvasViewport {
  const scale = Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, viewport.scale * Math.exp(-deltaY * sensitivity)));
  if (scale === viewport.scale) return viewport;
  const worldX = (anchor.x - viewport.x) / viewport.scale;
  const worldY = (anchor.y - viewport.y) / viewport.scale;
  return { scale, x: anchor.x - worldX * scale, y: anchor.y - worldY * scale };
}
