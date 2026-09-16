import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Check, Crown } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { useTheme } from "../lib/i18n";
import { THEME_OPTIONS, type Theme } from "../lib/theme";

type Props = {
  theme: Theme;
  onChange: (theme: Theme) => void;
  canUsePremium?: boolean;
  onLocked?: () => void;
};

export default function ThemePicker({ theme, onChange, canUsePremium = false, onLocked }: Props) {
  const { t } = useLanguage();
  const { previewTheme, preview, clearPreview } = useTheme();
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearPreview(), [clearPreview]);
  const clearPreviewIfLeavingPicker = (event: ReactPointerEvent<HTMLDivElement>) => {
    const related = event.relatedTarget;
    const staysInside = typeof Node !== "undefined" && related instanceof Node && !!pickerRef.current?.contains(related);
    if (!staysInside) clearPreview();
  };
  const clearPreviewIfFocusLeavesPicker = (related: EventTarget | null) => {
    const staysInside = typeof Node !== "undefined" && related instanceof Node && !!pickerRef.current?.contains(related);
    if (!staysInside) clearPreview();
  };

  return <div ref={pickerRef} className="theme-picker" role="group" aria-label={t("themeChoose")} onPointerLeave={clearPreviewIfLeavingPicker}>
    {(["light", "dark"] as const).map(tone => <section className="theme-group" key={tone} aria-labelledby={`theme-group-${tone}`}>
      <div className="theme-group-heading" id={`theme-group-${tone}`}><span>{t(tone === "light" ? "themeLightCollection" : "themeDarkCollection")}</span><small>{THEME_OPTIONS.filter(option => option.tone === tone).length}</small></div>
      <div className="theme-options-grid">{THEME_OPTIONS.filter(option => option.tone === tone).map(option => {
        const selected = option.id === theme;
        const locked = option.access === "plus" && !canUsePremium;
        const previewStyle = { "--preview-app": option.browserColor, "--preview-surface": option.tone === "dark" ? "#1e293b" : "#fffdfd", "--preview-card": option.tone === "dark" ? "#2b3953" : "#ffffff", "--preview-line": option.tone === "dark" ? "#516481" : "#d9d2e3", "--preview-accent": option.gradient[0], "--preview-accent-2": option.gradient[1] } as CSSProperties;
        return <button key={option.id} type="button" className={`theme-option ${selected ? "selected" : ""} ${locked ? "locked" : ""} ${option.access === "plus" ? "premium" : ""} ${previewTheme === option.id ? "previewing" : ""}`} aria-pressed={selected} aria-disabled={locked} title={locked ? t("themeLockedHint") : undefined} onPointerEnter={() => preview(option.id)} onPointerDown={() => preview(option.id)} onFocus={() => preview(option.id)} onBlur={event => clearPreviewIfFocusLeavesPicker(event.relatedTarget)} onClick={() => { if (locked) { clearPreview(); onLocked?.(); } else onChange(option.id); }}>
          <span className="theme-preview" data-preview-theme={option.id} style={previewStyle} aria-hidden="true">
            <span className="theme-preview-sidebar"/>
            <span className="theme-preview-card"/>
            <span className="theme-preview-accent"/>
          </span>
          <span className="theme-option-copy">
            <strong>{t(option.labelKey)}</strong>
            <small>{t(option.descriptionKey)}</small>
            {option.access === "plus" && <span className="theme-access-badge"><Crown size={11}/>{t("themePremium")}</span>}
          </span>
          <span className="theme-check" aria-hidden="true"><Check size={14}/></span>
        </button>;
      })}</div>
    </section>)}
  </div>;
}
