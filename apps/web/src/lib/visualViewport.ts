/** Match fixed overlays to the part of the page visible above the keyboard. */
export function observeVisualViewport(element: HTMLElement) {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const measure = () => {
    if (viewport.width <= 0 || viewport.height <= 0) return;
    const top = Math.max(0, viewport.offsetTop);
    const left = Math.max(0, viewport.offsetLeft);
    const bottom = Math.max(0, window.innerHeight - viewport.height - top);
    const right = Math.max(0, window.innerWidth - viewport.width - left);
    const values = { top, left, bottom, right, width: viewport.width, height: viewport.height };
    for (const [key, value] of Object.entries(values)) element.style.setProperty(`--visible-${key}`, `${value}px`);
    element.toggleAttribute("data-viewport-adjusted", Math.max(top, left, bottom, right) > 2);
  };
  measure();
  viewport.addEventListener("resize", measure);
  viewport.addEventListener("scroll", measure);
  window.addEventListener("resize", measure);
  window.addEventListener("pageshow", measure);
  return () => {
    viewport.removeEventListener("resize", measure);
    viewport.removeEventListener("scroll", measure);
    window.removeEventListener("resize", measure);
    window.removeEventListener("pageshow", measure);
    element.removeAttribute("data-viewport-adjusted");
    for (const key of ["top", "left", "bottom", "right", "width", "height"]) element.style.removeProperty(`--visible-${key}`);
  };
}
