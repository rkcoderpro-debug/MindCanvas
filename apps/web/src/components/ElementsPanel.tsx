import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Circle, Eye, EyeOff, GripVertical, Lock, Network, PenLine, Search, Square, Type, Unlock } from "lucide-react";
import type { BoardState } from "@mindcanvas/shared";
import { orderedElements } from "../lib/editorCommands";
import type { Selection } from "../lib/board";
import { useLanguage, type MessageKey } from "../lib/i18n";

const iconByKind = { nodes: Network, texts: Type, shapes: Square, drawings: PenLine, edges: ArrowUpRight } as const;
const labelKey: Record<Selection["kind"], MessageKey> = { nodes: "node", shapes: "rect", drawings: "pen", texts: "text", edges: "connector" };

export default function ElementsPanel({ board, selections, hiddenElements, onSelect, onMove, onToggleHidden, onToggleLocked }: {
  board: BoardState;
  selections: Selection[];
  hiddenElements: Set<string>;
  onSelect: (selection: Selection, additive: boolean) => void;
  onMove: (sourceId: string, targetId: string) => void;
  onToggleHidden: (selection: Selection, hidden: boolean) => void;
  onToggleLocked: (selection: Selection, locked: boolean) => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const entries = useMemo(() => orderedElements(board).reverse().flatMap(selection => {
    const element = board[selection.kind].find(item => item.id === selection.id);
    if (!element) return [];
    const raw = ("label" in element ? element.label : "text" in element ? element.text : "") || t(labelKey[selection.kind]);
    const name = raw.replace(/\s+/g, " ").trim();
    return !normalized || `${name} ${t(labelKey[selection.kind])}`.toLocaleLowerCase().includes(normalized) ? [{ selection, element, name }] : [];
  }), [board, normalized, t]);

  useEffect(() => {
    if (selections.length !== 1) return;
    [...(list.current?.querySelectorAll<HTMLElement>("[data-element-row]") ?? [])].find(row => row.dataset.elementRow === selections[0].id)?.scrollIntoView?.({ block: "nearest" });
  }, [selections]);

  return <section className="elements-panel" aria-label={t("layers")}>
    <div className="elements-panel-heading"><strong>{t("layers")}</strong><span>{orderedElements(board).length}</span></div>
    <label className="element-search"><Search size={14}/><input aria-label={t("searchElements")} placeholder={t("searchElements")} value={query} onChange={event => setQuery(event.target.value)}/></label>
    <div className="layer-list" ref={list} role="listbox" aria-label={t("layers")}>
      {!entries.length ? <div className="element-list-empty">{normalized ? t("noElementsFound") : t("noElements")}</div> : entries.map(({ selection, element, name }) => {
        const Icon = selection.kind === "shapes" && "kind" in element && element.kind === "ellipse" ? Circle : iconByKind[selection.kind];
        const selected = selections.some(item => item.id === selection.id);
        const hidden = hiddenElements.has(selection.id), directlyHidden = "hidden" in element && !!element.hidden;
        const locked = "locked" in element && !!element.locked;
        const grouped = board.groups?.some(group => group.elementIds.includes(selection.id));
        return <div key={selection.id} data-element-row={selection.id} className={`element-row ${selected ? "active" : ""} ${hidden ? "is-hidden" : ""} ${dragging === selection.id ? "dragging" : ""}`}
          draggable onDragStart={event => { setDragging(selection.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/mindcanvas-layer", selection.id); }}
          onDragEnd={() => setDragging(null)} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
          onDrop={event => { event.preventDefault(); const source = event.dataTransfer.getData("text/mindcanvas-layer") || dragging; setDragging(null); if (source) onMove(source, selection.id); }}>
          <span className="element-drag" aria-hidden="true"><GripVertical size={14}/></span>
          <button className="element-select" role="option" aria-selected={selected} title={name} onClick={event => onSelect(selection, event.shiftKey)}>
            <Icon size={15}/><span><strong>{name}</strong><small>{grouped ? `${t("grouped")} · ` : ""}{t(labelKey[selection.kind])}</small></span>
          </button>
          <button className="element-state" aria-label={`${locked ? t("unlock") : t("lock")}: ${name}`} title={locked ? t("unlock") : t("lock")} onClick={() => onToggleLocked(selection, !locked)}>{locked ? <Lock size={14}/> : <Unlock size={14}/>}</button>
          <button className="element-state" aria-label={`${directlyHidden ? t("show") : t("hide")}: ${name}`} title={directlyHidden ? t("show") : t("hide")} onClick={() => onToggleHidden(selection, !directlyHidden)}>{hidden ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
        </div>;
      })}
    </div>
    <small className="elements-panel-hint">{t("layerDragHint")}</small>
  </section>;
}
