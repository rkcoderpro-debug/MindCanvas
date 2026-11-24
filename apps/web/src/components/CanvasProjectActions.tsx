import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Ellipsis } from "lucide-react";
import { useLanguage } from "../lib/i18n";

export type CanvasProjectAction = { id: string; label: string; icon: ReactNode; title?: string; run: () => void };

export default function CanvasProjectActions({ actions }: { actions: CanvasProjectAction[] }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const list = useId();
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !host.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return <div ref={host} className="canvas-project-actions" onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className="secondary-button" aria-expanded={open} aria-controls={list} onClick={() => setOpen(value => !value)}>
      <Ellipsis size={17} aria-hidden="true"/>{t("projectActions")}<ChevronDown size={14} aria-hidden="true"/>
    </button>
    <div id={list} hidden={!open} className="canvas-project-action-list">
      {actions.map(action => <button type="button" key={action.id} title={action.title} onClick={() => {
        setOpen(false); trigger.current?.focus(); action.run();
      }}>{action.icon}{action.label}</button>)}
    </div>
  </div>;
}
