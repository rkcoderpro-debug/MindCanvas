const delay = 330;
const margin = 8;

/** Keep native titles in the markup; substitute one themed tooltip while the
 * associated control is being hovered or focused. Works for lazy views and dialogs. */
export function installThemeTooltips(doc: Document) {
  const win = doc.defaultView!;
  const tooltip = doc.createElement("div");
  tooltip.className = "theme-tooltip";
  tooltip.id = "mindcanvas-theme-tooltip";
  tooltip.setAttribute("role", "tooltip");
  let anchor: HTMLElement | null = null;
  let original = "";
  let temporaryName = false;
  let focusAnchor = false;
  let timer: number | undefined;

  const describedByWithoutTip = (element: HTMLElement) =>
    (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(id => id && id !== tooltip.id);
  const observeTitle = new MutationObserver(() => {
    if (!anchor) return;
    // A live control can change labels without being replaced.
    const target = anchor, focused = focusAnchor;
    hide(false);
    if (target.isConnected) enter(target, focused);
  });

  function hide(restore = true) {
    win.clearTimeout(timer);
    observeTitle.disconnect();
    tooltip.remove();
    if (!anchor) return;
    const descriptions = describedByWithoutTip(anchor);
    if (descriptions.length) anchor.setAttribute("aria-describedby", descriptions.join(" "));
    else anchor.removeAttribute("aria-describedby");
    if (temporaryName && anchor.getAttribute("aria-label") === original) anchor.removeAttribute("aria-label");
    if (restore && anchor.getAttribute("title") === "") anchor.setAttribute("title", original);
    anchor = null;
    temporaryName = false;
  }

  function place() {
    if (!anchor || !tooltip.isConnected) return;
    const bounds = anchor.getBoundingClientRect();
    const width = doc.documentElement.clientWidth || win.innerWidth;
    const height = doc.documentElement.clientHeight || win.innerHeight;
    if (!anchor.isConnected || (!bounds.width && !bounds.height) || bounds.bottom < 0 || bounds.top > height || bounds.right < 0 || bounds.left > width) { hide(); return; }
    const { width: tipWidth, height: tipHeight } = tooltip.getBoundingClientRect();
    const useTop = bounds.top - tipHeight - margin * 2 >= 0 || bounds.bottom + margin * 2 + tipHeight > height;
    tooltip.dataset.side = useTop ? "top" : "bottom";
    const x = bounds.left + (bounds.width - tipWidth) / 2;
    const y = useTop ? bounds.top - tipHeight - margin : bounds.bottom + margin;
    tooltip.style.left = `${Math.max(margin, Math.min(x, width - tipWidth - margin))}px`;
    tooltip.style.top = `${Math.max(margin, Math.min(y, height - tipHeight - margin))}px`;
  }

  function enter(target: EventTarget | null, focused = false) {
    if (!(target instanceof Element) || tooltip.contains(target)) return;
    const element = target.closest("[title]");
    if (anchor && element === anchor) {
      if (focused) focusAnchor = true;
      return;
    }
    if (!(element instanceof HTMLElement) || element instanceof HTMLIFrameElement) return;
    const title = element.getAttribute("title");
    if (!title?.trim()) return;
    hide();
    anchor = element;
    original = title;
    focusAnchor = focused;
    if (element.matches("button, a[href], [role='button']") && !element.textContent?.trim() &&
        !element.hasAttribute("aria-label") && !element.hasAttribute("aria-labelledby") && !element.querySelector("img[alt]")) {
      element.setAttribute("aria-label", title);
      temporaryName = true;
    }
    element.setAttribute("title", "");
    observeTitle.observe(element, { attributes: true, attributeFilter: ["title"] });
    timer = win.setTimeout(() => {
      if (!anchor?.isConnected) { hide(); return; }
      tooltip.textContent = original;
      (anchor.closest("dialog[open]") ?? doc.fullscreenElement ?? doc.body).append(tooltip);
      if (anchor.matches("button, a[href], input, [tabindex], summary") && anchor.getAttribute("aria-label") !== original) {
        anchor.setAttribute("aria-describedby", [...describedByWithoutTip(anchor), tooltip.id].join(" "));
      }
      place();
    }, delay);
  }

  function over(event: PointerEvent) { if (event.pointerType !== "touch") enter(event.target); }
  function out(event: PointerEvent) {
    const next = event.relatedTarget;
    if (!anchor || !(event.target instanceof Node) || (!anchor.contains(event.target) && !tooltip.contains(event.target))) return;
    if (next instanceof Node && (anchor.contains(next) || tooltip.contains(next))) return;
    if (!focusAnchor) hide();
  }
  function focus(event: FocusEvent) {
    if (event.target instanceof HTMLElement && event.target.matches(":focus-visible")) enter(event.target, true);
  }
  function blur(event: FocusEvent) { if (event.target instanceof Node && anchor?.contains(event.target)) hide(); }
  function key(event: KeyboardEvent) { if (event.key === "Escape") hide(); }
  const dismiss = () => hide();
  doc.addEventListener("pointerover", over, true);
  doc.addEventListener("pointerout", out, true);
  doc.addEventListener("pointerdown", dismiss, true);
  doc.addEventListener("focusin", focus);
  doc.addEventListener("focusout", blur);
  doc.addEventListener("keydown", key);
  doc.addEventListener("scroll", place, true);
  win.addEventListener("resize", place);
  win.addEventListener("blur", dismiss);
  return () => {
    hide();
    doc.removeEventListener("pointerover", over, true);
    doc.removeEventListener("pointerout", out, true);
    doc.removeEventListener("pointerdown", dismiss, true);
    doc.removeEventListener("focusin", focus);
    doc.removeEventListener("focusout", blur);
    doc.removeEventListener("keydown", key);
    doc.removeEventListener("scroll", place, true);
    win.removeEventListener("resize", place);
    win.removeEventListener("blur", dismiss);
  };
}
