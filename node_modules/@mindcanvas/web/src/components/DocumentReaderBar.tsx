import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FileText, MoreHorizontal, type LucideIcon } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { useLearningActive } from "../lib/learningNavigation";

export type ReaderAction = { id: string; label: string; icon: LucideIcon; danger?: boolean; disabled?: boolean; prominent?: boolean } &
  ({ run: () => void } | { href: string; download: string });

const readerFrameSelector = ".document-reading-view, .workspace-direct-document .compact-file-preview, .shared-document-reader";

function ReaderActionMenu({ actions }: { actions: ReaderAction[] }) {
  const { language } = useLanguage();
  const label = language === "vi" ? "Thao tác tài liệu" : "Document actions";
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = menu.current;
    const bar = root.current?.closest<HTMLElement>(".document-reader-bar");
    const frame = bar?.closest<HTMLElement>(".document-reader, .compact-file-reader");
    if (!open || !panel || !bar || !frame) return;
    const viewport = window.visualViewport;
    const area = bar.closest(".main-area");
    const measure = () => {
      const box = bar.getBoundingClientRect();
      const visibleTop = viewport?.offsetTop ?? 0;
      const bottom = Math.min(frame.getBoundingClientRect().bottom, visibleTop + (viewport?.height ?? window.innerHeight)) - 6;
      const minTop = Math.max(box.top + 4, visibleTop + 4);
      const top = Math.max(minTop, Math.min(box.bottom + 4, bottom - 104));
      panel.style.setProperty("--reader-menu-top", (top - box.top) + "px");
      panel.style.setProperty("--reader-menu-height", Math.max(0, bottom - top) + "px");
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(bar); observer?.observe(frame);
    area?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    return () => {
      observer?.disconnect();
      area?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const close = () => { setOpen(false); toggle.current?.focus({ preventScroll: true }); };
  return <div className="reader-more" ref={root}
    onKeyDown={event => { if (event.key === "Escape" && open) { event.stopPropagation(); close(); } }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" className="reader-icon reader-more-toggle" ref={toggle} title={label} aria-label={label} aria-expanded={open}
      aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}><MoreHorizontal size={20}/></button>
    {open && <div className="reader-more-panel" ref={menu} id={id} role="group" aria-label={label}>
      {actions.map(action => {
        const content = <><action.icon size={16} aria-hidden="true"/><span>{action.label}</span></>;
        if ("href" in action) return <a key={action.id} href={action.href} download={action.download} onClick={close}>{content}</a>;
        return <button key={action.id} type="button" className={action.danger ? "reader-action-danger" : undefined}
          disabled={action.disabled} onClick={() => { close(); action.run(); }}>{content}</button>;
      })}
    </div>}
  </div>;
}

export default function DocumentReaderBar({ title, kind, caption, children, actions = [] }: {
  title: string; kind?: string; caption?: string; children?: ReactNode; actions?: ReaderAction[];
}) {
  const bar = useRef<HTMLElement>(null);
  const active = useLearningActive();
  useLayoutEffect(() => {
    if (!active) return;
    const frame = bar.current?.closest<HTMLElement>(readerFrameSelector);
    const area = frame?.closest<HTMLElement>(".main-area");
    if (!frame || !area) return;
    const measure = () => {
      if (!frame.getClientRects().length) return;
      const paddingBottom = parseFloat(getComputedStyle(area).paddingBottom) || 0;
      const top = frame.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop;
      const height = Math.floor(area.clientHeight - top - paddingBottom);
      const value = Math.max(0, height) + "px";
      if (frame.style.getPropertyValue("--reader-available-height") !== value) frame.style.setProperty("--reader-available-height", value);
      frame.setAttribute("data-reader-fitted", "");
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(area); observer?.observe(frame);
    for (const sibling of area.children) {
      if (!sibling.contains(frame) && sibling.getClientRects().length) observer?.observe(sibling);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      frame.style.removeProperty("--reader-available-height");
      frame.removeAttribute("data-reader-fitted");
    };
  }, [active]);

  const prominent = actions.filter(action => action.prominent && "run" in action);
  const more = actions.filter(action => !prominent.includes(action));
  return <header ref={bar} className="document-reader-bar">
    <div className="document-reader-identity">
      <span className="document-reader-icon" aria-hidden="true"><FileText size={18}/></span>
      <div><div className="document-reader-title"><h2 title={title} tabIndex={-1}>{title}</h2>{kind && <span>{kind.toUpperCase()}</span>}</div>
        {caption && <small title={caption}>{caption}</small>}</div>
    </div>
    <div className="document-reader-controls">{children}
      {prominent.map(action => "run" in action && <button key={action.id} type="button" className="reader-icon reader-primary-action"
        title={action.label} disabled={action.disabled} onClick={action.run}><action.icon size={17} aria-hidden="true"/><span>{action.label}</span></button>)}
      {more.length > 0 && <ReaderActionMenu actions={more}/>}
    </div>
  </header>;
}
