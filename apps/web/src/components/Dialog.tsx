import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../lib/i18n";
export default function Dialog({ title, children, onClose, dismissible = true }: { title: string; children: ReactNode; onClose: () => void; dismissible?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  const { t } = useLanguage();
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => { ref.current?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} className="dialog" aria-labelledby={id} onCancel={e => { e.preventDefault(); if (dismissible) onClose(); }}>
    <header><h2 id={id}>{title}</h2>{dismissible && <button className="icon-button" aria-label={t("close")} onClick={onClose}><X size={20}/></button>}</header>{children}
  </dialog>;
}
