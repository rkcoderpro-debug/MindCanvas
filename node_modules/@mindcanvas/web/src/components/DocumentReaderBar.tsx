import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FileText, MoreHorizontal, type LucideIcon } from "lucide-react";
import { useLanguage } from "../lib/i18n";

export type ReaderAction = { id: string; label: string; icon: LucideIcon; danger?: boolean; disabled?: boolean; prominent?: boolean } &
  ({ run: () => void } | { href: string; download: string });

function ReaderActionMenu({ actions }: { actions: ReaderAction[] }) {
  const { language } = useLanguage();
  const label = language === "vi" ? "Thao tác tài liệu" : "Document actions";
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const id = useId();
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
    {open && <div className="reader-more-panel" id={id} role="group" aria-label={label}>
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
  const prominent = actions.filter(action => action.prominent && "run" in action);
  const more = actions.filter(action => !prominent.includes(action));
  return <header className="document-reader-bar">
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
