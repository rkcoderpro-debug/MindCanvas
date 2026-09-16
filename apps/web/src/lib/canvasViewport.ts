export type CanvasViewport = { x: number; y: number; scale: number };
export type ViewportAnchor = { x: number; y: number };

/** The editor deliberately allows a very wide map to be overviewed at 1%. */
export const MIN_CANVAS_SCALE = 0.01;
export const MAX_CANVAS_SCALE = 4;

/** Convert line/page wheel units to a predictable pixel-like distance. */
export function normalizeWheelDelta(deltaX: number, deltaY: number, deltaMode: number) {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1;
  return { x: deltaX * unit, y: deltaY * unit };
}

/**
 * Keep the canvas wheel contract predictable across mouse wheels and
 * touchpads. A traditional wheel normally reports only deltaY, while a
 * touchpad reports both axes for a free two-finger pan. Preserve both values
 * whenever they are present; Alt remains a compatibility shortcut for
 * forcing a vertical wheel onto the horizontal axis.
 */
export function wheelPanDelta(delta: { x: number; y: number }, altKey = false) {
  const x = Number.isFinite(delta.x) ? delta.x : 0;
  const y = Number.isFinite(delta.y) ? delta.y : 0;
  return altKey ? { x: x || y, y: 0 } : { x, y };
}

export function panViewport(viewport: CanvasViewport, dx: number, dy: number): CanvasViewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

/**
 * Return a viewport translation for marquee auto-pan. A positive screen-space
 * edge pressure moves the viewport in the opposite direction so the user
 * keeps revealing the world under the pointer (dragging toward the bottom
 * reveals lower canvas content instead of reversing the selection).
 */
export function autoPanViewportDelta(
  clientX: number,
  clientY: number,
  rect: { left: number; right: number; top: number; bottom: number },
  elapsedMs: number,
  edge = 64,
  maxSpeed = 22,
) {
  const speed = (distance: number) => distance < edge ? ((edge - Math.max(0, distance)) / edge) ** 2 * maxSpeed : 0;
  const left = speed(clientX - rect.left), right = speed(rect.right - clientX);
  const top = speed(clientY - rect.top), bottom = speed(rect.bottom - clientY);
  const factor = Math.min(2.5, Math.max(0.5, elapsedMs / 16.67));
  return { x: (left - right) * factor, y: (top - bottom) * factor };
}

/** Zoom around a screen-space point so the point under the cursor stays fixed. */
export function zoomViewportAtPoint(viewport: CanvasViewport, deltaY: number, anchor: ViewportAnchor, sensitivity = 0.0018): CanvasViewport {
  const scale = Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, viewport.scale * Math.exp(-deltaY * sensitivity)));
  if (scale === viewport.scale) return viewport;
  const worldX = (anchor.x - viewport.x) / viewport.scale;
  const worldY = (anchor.y - viewport.y) / viewport.scale;
  return { scale, x: anchor.x - worldX * scale, y: anchor.y - worldY * scale };
}
