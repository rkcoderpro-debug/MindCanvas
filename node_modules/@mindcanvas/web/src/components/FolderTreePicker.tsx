import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import "./folderTreePicker.css";

export type FolderTreeNode = { id: string; name: string; parentId?: string | null };

export function folderAncestors<T extends FolderTreeNode>(folders: readonly T[], id: string | null): T[] {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const seen = new Set<string>();
  const trail: T[] = [];
  let folder = id ? byId.get(id) : undefined;
  while (folder && !seen.has(folder.id)) {
    trail.unshift(folder);
    seen.add(folder.id);
    folder = folder.parentId ? byId.get(folder.parentId) : undefined;
  }
  return trail;
}

export default function FolderTreePicker({ folders, selected, onSelect, label, rootLabel, disabled = false }: {
  folders: readonly FolderTreeNode[];
  selected: string | null | undefined;
  onSelect: (id: string | null) => void;
  label: string;
  rootLabel?: string;
  disabled?: boolean;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const root = rootLabel ?? (vi ? "Ngoài thư mục" : "No folder");
  const path = folderAncestors(folders, selected ?? null);
  const title = selected === undefined ? (vi ? "Chọn thư mục" : "Choose a folder") : path.length ? path.map(folder => folder.name).join(" › ") : root;
  const groups = new Map<string | null, FolderTreeNode[]>();
  const ids = new Set(folders.map(folder => folder.id));
  for (const folder of folders) {
    const parent = folder.parentId && ids.has(folder.parentId) ? folder.parentId : null;
    const siblings = groups.get(parent) ?? [];
    siblings.push(folder);
    groups.set(parent, siblings);
  }
  for (const siblings of groups.values()) siblings.sort((a, b) => a.name.localeCompare(b.name, language));

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const choose = (folder: string | null) => {
    onSelect(folder);
    setOpen(false);
    toggle.current?.focus();
  };
  const renderChildren = (parent: string | null, depth: number): React.ReactNode =>
    depth > 16 ? null : (groups.get(parent) ?? []).map(folder => {
      const hasChildren = groups.has(folder.id);
      const isExpanded = expanded.has(folder.id);
      const isSelected = selected === folder.id;
      return <li key={folder.id}>
        <div className="folder-tree-row">
          {hasChildren ? <button type="button" className="icon-button folder-tree-expand" aria-expanded={isExpanded}
            aria-label={`${isExpanded ? (vi ? "Thu gọn" : "Collapse") : (vi ? "Mở rộng" : "Expand")} ${folder.name}`}
            onClick={() => setExpanded(current => {
              const next = new Set(current);
              if (isExpanded) next.delete(folder.id);
              else next.add(folder.id);
              return next;
            })}>{isExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</button> : <span className="folder-tree-spacer"/>}
          <button type="button" className="folder-tree-choice" aria-pressed={isSelected} onClick={() => choose(folder.id)}>
            {isExpanded ? <FolderOpen size={17}/> : <Folder size={17}/>}<span>{folder.name}</span>{isSelected && <Check size={16}/>}
          </button>
        </div>
        {isExpanded && <ul>{renderChildren(folder.id, depth + 1)}</ul>}
      </li>;
    });

  return <div className="folder-tree-picker" ref={container} onKeyDown={event => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    toggle.current?.focus();
  }}>
    <span id={id}>{label}</span>
    <button type="button" className="folder-tree-trigger" ref={toggle} disabled={disabled}
      aria-labelledby={`${id} ${id}-selection`} aria-controls={`${id}-choices`} aria-expanded={open && !disabled}
      onClick={() => {
        if (!open) setExpanded(new Set(path.slice(0, -1).map(folder => folder.id)));
        setOpen(!open);
      }}><span id={`${id}-selection`}>{title}</span><ChevronDown size={17}/></button>
    {open && !disabled && <div className="folder-tree-options" id={`${id}-choices`}>
      <ul><li><button type="button" className="folder-tree-choice folder-tree-root" aria-pressed={selected === null}
        onClick={() => choose(null)}><span>{root}</span>{selected === null && <Check size={16}/>}</button></li>
        {renderChildren(null, 1)}</ul>
    </div>}
  </div>;
}
