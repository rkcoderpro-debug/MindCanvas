import { useLayoutEffect, type ComponentPropsWithoutRef, type RefObject } from "react";
import { createPortal } from "react-dom";

type Props = ComponentPropsWithoutRef<"section"> & {
  anchor: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLElement | null>;
};

export default function TopbarPopover({ anchor, panelRef, className = "", ...props }: Props) {
  const header = anchor.current?.closest<HTMLElement>(".topbar");
  const shell = header?.closest<HTMLElement>(".app-shell");

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !header || !shell) return;
    const viewport = window.visualViewport;
    const content = header.parentElement;
    const measure = () => {
      const bar = header.getBoundingClientRect();
      const dock = shell.querySelector(":scope > .mobile-compact-nav")?.getBoundingClientRect();
      const visibleTop = viewport?.offsetTop ?? 0;
      const visibleLeft = viewport?.offsetLeft ?? 0;
      const right = Math.min(bar.right, visibleLeft + (viewport?.width ?? window.innerWidth));
      const left = Math.max(bar.left, visibleLeft) + 8;
      const visibleBottom = visibleTop + (viewport?.height ?? window.innerHeight);
      const bottom = Math.min(visibleBottom, dock?.height ? dock.top : visibleBottom) - 8;
      // Keep a useful portion of the panel within the visible window even
      // when the header sits low in a shallow landscape window.
      const top = Math.max(visibleTop + 8, Math.min(bar.bottom + 8, bottom - 200));

      panel.style.setProperty("--popover-top", top + "px");
      panel.style.setProperty("--popover-right", Math.max(8, window.innerWidth - right + 8) + "px");
      panel.style.setProperty("--popover-width", Math.max(0, right - left - 8) + "px");
      panel.style.setProperty("--popover-height", Math.max(0, bottom - top) + "px");
    };
    measure();
    panel.focus({ preventScroll: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(header);
    const shellObserver = new MutationObserver(measure);
    shellObserver.observe(shell, { childList: true });
    content?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    return () => {
      observer?.disconnect();
      shellObserver.disconnect();
      content?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
    };
  }, [header, panelRef, shell]);

  const panel = <section {...props} ref={panelRef} tabIndex={-1} className={className + " topbar-popover"}/>;
  return shell ? createPortal(panel, shell) : panel;
}
