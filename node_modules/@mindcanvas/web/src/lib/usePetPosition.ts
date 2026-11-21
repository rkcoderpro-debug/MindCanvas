import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent } from 'react';
const storageKey = 'mindcanvas:pet-position:v1';
export function usePetPosition() {
  const root = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => {
    try { const p = JSON.parse(localStorage.getItem(storageKey) || 'null'); return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null; } catch { return null; }
  });
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const clamp = (p: { x: number; y: number }) => {
    const box = root.current?.getBoundingClientRect();
    return { x: Math.max(8, Math.min(p.x, window.innerWidth - (box?.width || 120) - 8)), y: Math.max(8, Math.min(p.y, window.innerHeight - (box?.height || 160) - 8)) };
  };
  useEffect(() => {
    const fit = () => setPosition(p => { if (!p) return p; const n = clamp(p); return n.x === p.x && n.y === p.y ? p : n; });
    const reset = () => { setPosition(null); try { localStorage.removeItem(storageKey); } catch {} };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (root.current) observer?.observe(root.current);
    fit(); window.addEventListener('resize', fit); window.addEventListener('mindcanvas:reset-pet-position', reset);
    return () => { observer?.disconnect(); window.removeEventListener('resize', fit); window.removeEventListener('mindcanvas:reset-pet-position', reset); };
  }, []);
  useEffect(() => { if (position) try { localStorage.setItem(storageKey, JSON.stringify(position)); } catch {} }, [position]);
  return {
    ref: root,
    style: position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined,
    onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !(event.target as Element).closest('.pet-interaction-area')) return;
      const box = event.currentTarget.getBoundingClientRect(); suppressClick.current = false;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top, moved: false };
    },
    onPointerMoveCapture: (event: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current; if (!d || event.pointerId !== d.id) return;
      if (!d.moved && Math.hypot(event.clientX-d.x,event.clientY-d.y) < 7) return;
      if (!d.moved) window.dispatchEvent(new Event("mindcanvas:pet-drag"));
      d.moved = true; suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId); event.stopPropagation();
      setPosition(clamp({ x: d.left + event.clientX-d.x, y: d.top + event.clientY-d.y }));
    },
    onPointerUpCapture: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      drag.current = null;
    },
    onPointerCancel: () => { drag.current = null; },
    onClickCapture: (event: MouseEvent<HTMLElement>) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } },
  };
}
