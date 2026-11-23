import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLearningActive } from "../lib/learningNavigation";
import type { ButtonHTMLAttributes, ComponentPropsWithRef, ReactNode, Ref } from "react";

export function BackButton({ children, className = "", buttonRef, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; buttonRef?: Ref<HTMLButtonElement> }) {
  return <button {...props} ref={buttonRef} type="button" className={`page-back-button ${className}`}><ArrowLeft size={17} aria-hidden="true"/><span>{children}</span></button>;
}

export function PageNavigation({ back, title, context, actions }: { back: ReactNode; title: string; context?: ReactNode; actions?: ReactNode }) {
  return <header className="page-navigation">
    <div className="page-navigation-start">{back}</div>
    <div className="page-navigation-identity"><h2 title={title}>{title}</h2>{context && <div className="page-navigation-context">{context}</div>}</div>
    {actions && <div className="page-navigation-actions">{actions}</div>}
  </header>;
}

/** Fixed panels must not inherit the animated/transformed Learning Hub's bounds. */
export function ActivityViewport({ as: Tag = "section", inline = false, ...props }: ComponentPropsWithRef<"section"> & { as?: "section" | "main"; inline?: boolean }) {
  const active = useLearningActive();
  if (inline) return <Tag {...props}/>;
  return createPortal(<Tag {...props} data-learning-viewport="" hidden={!active} inert={!active}/>, document.body);
}

/** Keep the reader's place even when a detail view temporarily replaces the list. */
export function useListScrollReturn() {
  const previous = useRef<{ area: HTMLElement; top: number } | null>(null);
  const remember = () => {
    const area = document.querySelector<HTMLElement>(".main-area");
    if (area) previous.current = { area, top: area.scrollTop };
  };
  const restore = () => {
    const position = previous.current;
    if (position) requestAnimationFrame(() => { if (position.area.isConnected) position.area.scrollTop = position.top; });
  };
  return { remember, restore };
}

export function useActivityFocus(active: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const area = ref.current;
    if (!active || !area || area.closest("[hidden]")) return;
    const prior = document.activeElement as HTMLElement | null;
    const tabbable = () => [...area.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, iframe, [tabindex='0']")].filter(el => el.offsetParent !== null && !el.closest("[hidden], [inert]"));
    area.querySelector<HTMLElement>(".page-back-button")?.focus({ preventScroll: true });
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || area.closest("[hidden]") || document.querySelector("dialog[open]")) return;
      const options = tabbable(), first = options[0], last = options.at(-1);
      const focus = document.activeElement;
      if (first && last && (!area.contains(focus) || (event.shiftKey ? focus === first : focus === last))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener("keydown", onTab);
    return () => { window.removeEventListener("keydown", onTab); if (prior?.isConnected) prior.focus({ preventScroll: true }); };
  }, [active]);
  return ref;
}
