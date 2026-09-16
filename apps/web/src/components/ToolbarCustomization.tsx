import { RotateCcw } from "lucide-react";
import type { ToolMode } from "@mindcanvas/shared";
import { useLanguage, type MessageKey } from "../lib/i18n";
import { CANVAS_TOOL_IDS, normalizeVisibleToolIds } from "../lib/toolbarPreferences";

const GROUPS: Array<{ labelKey: MessageKey; ids: readonly ToolMode[] }> = [
  { labelKey: "toolbarGroupNavigation", ids: ["select", "hand"] },
  { labelKey: "toolbarGroupDrawing", ids: ["pen", "highlighter", "eraser", "line"] },
  { labelKey: "toolbarGroupShapes", ids: ["rect", "ellipse", "triangle"] },
  { labelKey: "toolbarGroupInsert", ids: ["text", "connector"] },
];

export default function ToolbarCustomization({ visibleToolIds, onChange }: { visibleToolIds: ToolMode[]; onChange: (next: ToolMode[]) => void }) {
  const { t } = useLanguage();
  const toggle = (id: ToolMode) => onChange(normalizeVisibleToolIds(visibleToolIds.includes(id) ? visibleToolIds.filter(item => item !== id) : [...visibleToolIds, id]));
  return <div className="toolbar-customization">
    <p className="field-hint">{t("toolbarCustomizeHint")}</p>
    <div className="toolbar-tool-groups">
      {GROUPS.map(group => <fieldset className="toolbar-tool-group" key={group.labelKey}>
        <legend>{t(group.labelKey)}</legend>
        {group.ids.map(id => <label className="settings-toggle" key={id}>
          <input type="checkbox" checked={visibleToolIds.includes(id)} onChange={() => toggle(id)} aria-label={t(id)}/>
          <span>{t(id)}</span>
        </label>)}
      </fieldset>)}
    </div>
    <button type="button" className="secondary-button" onClick={() => onChange([...CANVAS_TOOL_IDS])}><RotateCcw size={15}/>{t("restoreToolbarDefaults")}</button>
  </div>;
}
