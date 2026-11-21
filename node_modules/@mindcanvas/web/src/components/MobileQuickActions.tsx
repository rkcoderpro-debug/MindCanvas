import { ClipboardPaste, Copy, MoreHorizontal, Redo2, Trash2, Undo2, X } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "../lib/i18n";

type Action = () => void | Promise<void>;

type Props = {
  hasSelection: boolean;
  canEditSelection?: boolean;
  canPaste?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onCopy: Action;
  onPaste: Action;
  onDuplicate: Action;
  onDelete: Action;
  onUndo: Action;
  onRedo: Action;
};

export default function MobileQuickActions({ hasSelection, canEditSelection = hasSelection, canPaste = true, canUndo = false, canRedo = false, onCopy, onPaste, onDuplicate, onDelete, onUndo, onRedo }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const run = async (action: Action) => {
    await action();
    setOpen(false);
  };
  return <div className={`mobile-quick-actions ${open ? "is-open" : ""}`} onPointerDown={event => event.stopPropagation()}>
    <button type="button" className="mobile-quick-actions-trigger" aria-label={t("quickActions")} title={t("quickActionsHint")} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? <X size={20}/> : <MoreHorizontal size={21}/>}</button>
    {open && <div className="mobile-quick-actions-menu" role="menu" aria-label={t("quickActions")}>
      <button type="button" role="menuitem" disabled={!hasSelection} onClick={() => void run(onCopy)}><Copy size={17}/><span>{t("copyElements")}</span></button>
      <button type="button" role="menuitem" disabled={!canPaste} onClick={() => void run(onPaste)}><ClipboardPaste size={17}/><span>{t("pasteElements")}</span></button>
      <button type="button" role="menuitem" disabled={!canEditSelection} onClick={() => void run(onDuplicate)}><Copy size={17}/><span>{t("duplicate")}</span></button>
      <button type="button" role="menuitem" className="danger" disabled={!canEditSelection} onClick={() => void run(onDelete)}><Trash2 size={17}/><span>{t("delete")}</span></button>
      <button type="button" role="menuitem" disabled={!canUndo} onClick={() => void run(onUndo)}><Undo2 size={17}/><span>{t("undo")}</span></button>
      <button type="button" role="menuitem" disabled={!canRedo} onClick={() => void run(onRedo)}><Redo2 size={17}/><span>{t("redo")}</span></button>
    </div>}
  </div>;
}
