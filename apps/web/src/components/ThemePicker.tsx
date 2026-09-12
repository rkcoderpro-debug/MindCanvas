import { useEffect } from "react";
import { Check } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { useTheme } from "../lib/i18n";
import { THEME_OPTIONS, type Theme } from "../lib/theme";

export default function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const { t } = useLanguage();
  const { previewTheme, preview, clearPreview } = useTheme();
  useEffect(() => () => clearPreview(), [clearPreview]);

  return <div className="theme-picker" role="group" aria-label={t("themeChoose")}>
    {(["light", "dark"] as const).map(tone => <section className="theme-group" key={tone} aria-labelledby={`theme-group-${tone}`}>
      <div className="theme-group-heading" id={`theme-group-${tone}`}><span>{t(tone === "light" ? "themeLightCollection" : "themeDarkCollection")}</span><small>{THEME_OPTIONS.filter(option => option.tone === tone).length}</small></div>
      <div className="theme-options-grid">{THEME_OPTIONS.filter(option => option.tone === tone).map(option => {
        const selected = option.id === theme;
        return <button key={option.id} type="button" className={`theme-option ${selected ? "selected" : ""} ${previewTheme === option.id ? "previewing" : ""}`} aria-pressed={selected} onPointerEnter={() => preview(option.id)} onPointerLeave={clearPreview} onFocus={() => preview(option.id)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearPreview(); }} onClick={() => onChange(option.id)}>
          <span className="theme-preview" data-preview-theme={option.id} aria-hidden="true">
            <span className="theme-preview-sidebar"/>
            <span className="theme-preview-card"/>
            <span className="theme-preview-accent"/>
          </span>
          <span className="theme-option-copy">
            <strong>{t(option.labelKey)}</strong>
            <small>{t(option.descriptionKey)}</small>
          </span>
          <span className="theme-check" aria-hidden="true"><Check size={14}/></span>
        </button>;
      })}</div>
    </section>)}
  </div>;
}
