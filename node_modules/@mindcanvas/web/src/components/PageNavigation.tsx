import { ArrowLeft, Search } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../lib/i18n";
import { useLearningActive } from "../lib/learningNavigation";
import type { ButtonHTMLAttributes, ComponentPropsWithRef, ReactNode, Ref } from "react";

export function BackButton({ children, className = "", buttonRef, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; buttonRef?: Ref<HTMLButtonElement> }) {
  return <button {...props} ref={buttonRef} type="button" className={`page-back-button ${className}`}><ArrowLeft size={17} aria-hidden="true"/><span>{children}</span></button>;
}

type BackEntry = { id: symbol; label: string; priority: number; disabled: boolean; run: () => void };
const ShellBackContext = createContext<{ entries: BackEntry[]; register: (entry: BackEntry) => () => void } | null>(null);
const QuickActionsContext = createContext<(() => void) | null>(null);

export function PageChromeProvider({ children, openQuickActions }: { children: ReactNode; openQuickActions: () => void }) {
  const [entries, setEntries] = useState<BackEntry[]>([]);
  const register = useCallback((entry: BackEntry) => {
    setEntries(current => [...current, entry]);
    return () => setEntries(current => current.filter(item => item.id !== entry.id));
  }, []);
  const value = useMemo(() => ({ entries, register }), [entries, register]);
  return <QuickActionsContext.Provider value={openQuickActions}><ShellBackContext.Provider value={value}>{children}</ShellBackContext.Provider></QuickActionsContext.Provider>;
}

export function ShellBack({ fallback }: { fallback?: { label: string; run: () => void } }) {
  const entries = useContext(ShellBackContext)?.entries ?? [];
  const selected = entries.reduce<BackEntry | undefined>((best, entry) => !best || best.priority <= entry.priority ? entry : best, undefined);
  const back = selected ?? fallback;
  return back ? <BackButton className="shell-back" title={back.label} disabled={selected?.disabled} onClick={back.run}>{back.label}</BackButton> : null;
}

/** Register a contextual destination in the shell; standalone tools keep their own button. */
export function PageBack({ children, onBack, active = true, priority = 10, disabled = false, className }: { children: string; onBack: () => void; active?: boolean; priority?: number; disabled?: boolean; className?: string }) {
  const register = useContext(ShellBackContext)?.register;
  const visible = useLearningActive() && active;
  const handler = useRef(onBack);
  useLayoutEffect(() => { handler.current = onBack; }, [onBack]);
  useLayoutEffect(() => {
    if (visible && register) return register({ id: Symbol(), label: children, priority, disabled, run: () => handler.current() });
  }, [visible, register, children, priority, disabled]);
  if (!visible || register) return null;
  return <BackButton className={className} disabled={disabled} onClick={onBack}>{children}</BackButton>;
}

export function useQuickActions() { return useContext(QuickActionsContext); }

export function PageNavigation({ back, title, context, actions, quickActions = false }: { back?: ReactNode; title: string; context?: ReactNode; actions?: ReactNode; quickActions?: boolean }) {
  const openQuickActions = useQuickActions();
  const { t } = useLanguage();
  const search = quickActions && openQuickActions && <button type="button" className="icon-button command-trigger" aria-label={t("commandPalette")} title={t("commandPalette")} onClick={openQuickActions}><Search size={18}/></button>;
  return <header className="page-navigation">
    {back && <div className="page-navigation-start">{back}</div>}
    <div className="page-navigation-identity"><h2 title={title}>{title}</h2>{context && <div className="page-navigation-context">{context}</div>}</div>
    {(actions || search) && <div className="page-navigation-actions">{search}{actions}</div>}
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
    const focusSelector = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, iframe, [tabindex='0']";
    const visible = (element: HTMLElement) => (element.offsetParent !== null || element.getClientRects().length > 0) && !element.closest("[hidden], [inert]");
    area.querySelector<HTMLElement>(".page-back-button")?.focus({ preventScroll: true });
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || area.closest("[hidden]") || document.querySelector("dialog[open]")) return;
      const options = [...area.querySelectorAll<HTMLElement>(focusSelector)].filter(visible);
      const outside = [...document.querySelectorAll<HTMLElement>("[data-study-island], [data-study-island-media]")]
        .flatMap(container => [...container.querySelectorAll<HTMLElement>(focusSelector)]).filter(visible);
      const first = options[0], last = options.at(-1), startIsland = outside[0], endIsland = outside.at(-1);
      if (!first || !last) return;
      const focus = document.activeElement as HTMLElement | null;
      let destination: HTMLElement | undefined;
      if (!focus || (!area.contains(focus) && !outside.includes(focus))) destination = event.shiftKey ? (endIsland ?? last) : first;
      else if (event.shiftKey) {
        if (focus === first) destination = endIsland ?? last;
        else if (focus === startIsland) destination = last;
      } else {
        if (focus === last) destination = startIsland ?? first;
        else if (focus === endIsland) destination = first;
      }
      if (destination) { event.preventDefault(); destination.focus(); }
    };
    window.addEventListener("keydown", onTab);
    return () => { window.removeEventListener("keydown", onTab); if (prior?.isConnected) prior.focus({ preventScroll: true }); };
  }, [active]);
  return ref;
}
