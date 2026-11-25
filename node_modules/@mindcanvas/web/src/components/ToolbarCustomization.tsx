import { Circle, Eraser, Hand, Highlighter, Minus, MousePointer2, PenLine, RotateCcw, Square, Triangle, Type, Waypoints, type LucideIcon } from "lucide-react";
import type { ToolMode } from "@mindcanvas/shared";
import { useLanguage, type MessageKey } from "../lib/i18n";
import { CANVAS_TOOL_IDS, normalizeVisibleToolIds } from "../lib/toolbarPreferences";

const GROUPS: Array<{ labelKey: MessageKey; ids: readonly ToolMode[] }> = [
  { labelKey: "toolbarGroupNavigation", ids: ["select", "hand"] },
  { labelKey: "toolbarGroupDrawing", ids: ["pen", "highlighter", "eraser", "line"] },
  { labelKey: "toolbarGroupShapes", ids: ["rect", "ellipse", "triangle"] },
  { labelKey: "toolbarGroupInsert", ids: ["text", "connector"] },
];
const ICONS: Partial<Record<ToolMode, LucideIcon>> = {
  select: MousePointer2, hand: Hand, pen: PenLine, highlighter: Highlighter, eraser: Eraser,
  line: Minus, rect: Square, ellipse: Circle, triangle: Triangle, text: Type, connector: Waypoints,
};

export default function ToolbarCustomization({ visibleToolIds, onChange }: { visibleToolIds: ToolMode[]; onChange: (next: ToolMode[]) => void }) {
  const { t, language } = useLanguage();
  const visibleCount = CANVAS_TOOL_IDS.filter(id => visibleToolIds.includes(id)).length;
  const toggle = (id: ToolMode) => onChange(normalizeVisibleToolIds(visibleToolIds.includes(id) ? visibleToolIds.filter(item => item !== id) : [...visibleToolIds, id]));
  return <div className="toolbar-customization">
    <div className="toolbar-customization-intro">
      <p className="field-hint">{t("toolbarCustomizeHint")}</p>
      <small>{language === "vi" ? "Đang hiện" : "Visible"} {visibleCount}/{CANVAS_TOOL_IDS.length}</small>
    </div>
    <div className="toolbar-tool-groups">
      {GROUPS.map(group => <fieldset className="toolbar-tool-group" key={group.labelKey}>
        <legend>{t(group.labelKey)}</legend>
        {group.ids.map(id => { const Icon = ICONS[id]; return <label className="settings-toggle" key={id}>
          <input type="checkbox" checked={visibleToolIds.includes(id)} onChange={() => toggle(id)} aria-label={t(id)}/>
          {Icon && <Icon size={16} aria-hidden="true"/>}
          <span>{t(id)}</span>
        </label>; })}
      </fieldset>)}
    </div>
    <button type="button" className="secondary-button toolbar-reset" onClick={() => onChange([...CANVAS_TOOL_IDS])}><RotateCcw size={15}/>{t("restoreToolbarDefaults")}</button>
  </div>;
}
