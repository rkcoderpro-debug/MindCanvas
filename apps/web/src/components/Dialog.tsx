import { useLearningActive } from "../lib/learningNavigation";
import { useEffect, useId, useRef, type PointerEvent, type ReactNode, type RefObject } from "react";
import { Minus, X } from "lucide-react";
import { observeVisualViewport } from "../lib/visualViewport";
import { useLanguage } from "../lib/i18n";

export default function Dialog({ title, children, onClose, onMinimize, dismissible = true, workspace = false, className, toolbar, footer, initialFocus, followFocusedField = false }: {
  title: string; children: ReactNode; onClose: () => void; onMinimize?: () => void; dismissible?: boolean; workspace?: boolean; className?: string; toolbar?: ReactNode; footer?: ReactNode; initialFocus?: RefObject<HTMLElement | null>; followFocusedField?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  const outsidePointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const { t } = useLanguage();
  const learningActive = useLearningActive();
  useEffect(() => {
    const dialog = ref.current;
    if (!learningActive || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    initialFocus?.current?.focus({ preventScroll: true });
    const stopObserving = observeVisualViewport(dialog);
    const viewport = window.visualViewport;
    let frame: number | undefined;
    const keepFieldInView = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        const field = document.activeElement;
        if (field instanceof HTMLElement && dialog.contains(field) && field.matches("textarea, select, input:not([type=file], [type=checkbox], [type=radio])")) {
          field.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        }
      });
    };
    if (followFocusedField) {
      viewport?.addEventListener("resize", keepFieldInView);
      window.addEventListener("resize", keepFieldInView);
    }
    return () => {
      if (followFocusedField) {
        viewport?.removeEventListener("resize", keepFieldInView);
        window.removeEventListener("resize", keepFieldInView);
        if (frame !== undefined) window.cancelAnimationFrame(frame);
      }
      stopObserving();
      dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [followFocusedField, initialFocus, learningActive]);
  function outside(event: PointerEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return false;
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom;
  }
  return <dialog ref={ref} className={`dialog${workspace ? " dialog-workspace" : ""}${className ? ` ${className}` : ""}`} aria-labelledby={id}
    onCancel={event => { event.preventDefault(); if (dismissible) onClose(); }}
    onPointerDown={event => {
      outsidePointer.current = workspace && dismissible && event.button === 0 && outside(event) ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    }}
    onPointerUp={event => {
      const start = outsidePointer.current; outsidePointer.current = null;
      if (workspace && dismissible && start && start.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 9 && outside(event)) onClose();
    }}
    onPointerCancel={() => { outsidePointer.current = null; }}>
    <header className="dialog-titlebar"><h2 id={id}>{title}</h2><div className="dialog-header-actions">{onMinimize && <button type="button" className="icon-button" aria-label={t("minimizeAi")} title={t("minimizeAi")} onClick={onMinimize}><Minus size={20}/></button>}{dismissible && <button type="button" className="icon-button" aria-label={t("close")} title={t("close")} onClick={onClose}><X size={20}/></button>}</div></header>
    {toolbar}
    {workspace ? <div className="dialog-scroll">{children}</div> : children}
    {footer}
  </dialog>;
}
