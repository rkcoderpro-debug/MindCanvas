import { Check } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { THEME_OPTIONS, type Theme } from "../lib/theme";

export default function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const { t } = useLanguage();

  return <div className="theme-picker" role="group" aria-label={t("themeChoose")}>
    {THEME_OPTIONS.map(option => {
      const selected = option.id === theme;
      return <button key={option.id} type="button" className={`theme-option ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={() => onChange(option.id)}>
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
    })}
  </div>;
}
