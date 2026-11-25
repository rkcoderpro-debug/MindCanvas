import { useLayoutEffect, useState } from "react";

export function usePlayerSlot(slot: HTMLElement | null, minHeight = 200) {
  const [position, setPosition] = useState<{ slot: HTMLElement; rect: DOMRect } | null>(null);
  useLayoutEffect(() => {
    if (!slot) { setPosition(null); return; }
    let tick = 0;
    const measure = () => {
      const bounds = slot.getBoundingClientRect();
      let left = Math.max(bounds.left, 0), right = Math.min(bounds.right, window.innerWidth);
      let top = Math.max(bounds.top, 0), bottom = Math.min(bounds.bottom, window.innerHeight);
      // Floating video is aligned over the slot. It must not spill past a scrolling panel.
      for (let el = slot.parentElement; el && el !== document.body; el = el.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(el);
        if (!/(auto|scroll|hidden|clip)/.test(overflowX + overflowY)) continue;
        const clip = el.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
        if (/(auto|scroll|hidden|clip)/.test(overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
      }
      const valid = bounds.width >= 200 && bounds.height >= minHeight &&
        right - left >= bounds.width - 1 && bottom - top >= bounds.height - 1 &&
        (!document.fullscreenElement || document.fullscreenElement.contains(slot));
      setPosition(old => !valid ? null
        : old?.slot === slot && old.rect.x === bounds.x && old.rect.y === bounds.y && old.rect.width === bounds.width && old.rect.height === bounds.height ? old
        : { slot, rect: bounds });
    };
    const queue = () => { cancelAnimationFrame(tick); tick = requestAnimationFrame(measure); };
    const size = typeof ResizeObserver === "function" ? new ResizeObserver(queue) : null;
    size?.observe(slot);
    const intersection = typeof IntersectionObserver === "function" ? new IntersectionObserver(queue, { threshold: [0, .51, 1] }) : null;
    intersection?.observe(slot);
    window.addEventListener("resize", queue);
    document.addEventListener("scroll", queue, true);
    document.addEventListener("fullscreenchange", queue);
    measure();
    return () => {
      cancelAnimationFrame(tick); size?.disconnect(); intersection?.disconnect();
      window.removeEventListener("resize", queue);
      document.removeEventListener("scroll", queue, true);
      document.removeEventListener("fullscreenchange", queue);
    };
  }, [slot, minHeight]);
  return position?.slot === slot ? position.rect : null;
}
