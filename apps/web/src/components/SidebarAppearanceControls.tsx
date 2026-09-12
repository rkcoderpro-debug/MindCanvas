import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Globe2, Sparkles } from "lucide-react";
import { useLanguage, useTheme } from "../lib/i18n";
import { THEME_OPTIONS, type Theme } from "../lib/theme";

type AppearancePanel = "language" | "theme" | null;

type Props = {
  collapsed: boolean;
  language: "vi" | "en";
  selectedTheme: Theme;
  onLanguageChange: (language: "vi" | "en") => void;
  onThemeChange: (theme: Theme) => void;
};

export default function SidebarAppearanceControls({ collapsed, language, selectedTheme, onLanguageChange, onThemeChange }: Props) {
  const { t } = useLanguage();
  const { preview, clearPreview } = useTheme();
  const [open, setOpen] = useState<AppearancePanel>(null);
  const root = useRef<HTMLDivElement>(null);
  const selected = THEME_OPTIONS.find(option => option.id === selectedTheme) ?? THEME_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const pointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("keydown", keydown);
    };
  }, [open]);

  useEffect(() => () => clearPreview(), [clearPreview]);

  const toggle = (panel: Exclude<AppearancePanel, null>) => setOpen(current => current === panel ? null : panel);
  const chooseLanguage = (next: "vi" | "en") => {
    onLanguageChange(next);
    setOpen(null);
  };
  const chooseTheme = (next: Theme) => {
    onThemeChange(next);
    clearPreview();
    setOpen(null);
  };

  return <div ref={root} className={`sidebar-appearance ${collapsed ? "appearance-collapsed" : ""}`}>
    <button className="sidebar-control-button" aria-label={t("language")} aria-expanded={open === "language"} title={t("language")} onClick={() => toggle("language")}>
      <Globe2 size={17}/><span className="sidebar-control-value">{language === "vi" ? "VI" : "EN"}</span><ChevronRight className="sidebar-control-chevron" size={15}/>
    </button>
    {open === "language" && <div className="sidebar-appearance-popover language-popover" role="dialog" aria-label={t("language")}>
      <strong>{t("language")}</strong>
      <button className={language === "vi" ? "selected" : ""} aria-pressed={language === "vi"} onClick={() => chooseLanguage("vi")}><span>Tiếng Việt</span>{language === "vi" && <Check size={15}/>}</button>
      <button className={language === "en" ? "selected" : ""} aria-pressed={language === "en"} onClick={() => chooseLanguage("en")}><span>English</span>{language === "en" && <Check size={15}/>}</button>
    </div>}

    <button className="sidebar-control-button" aria-label={t("theme")} aria-expanded={open === "theme"} title={t("theme")} onClick={() => toggle("theme")}>
      <Sparkles size={17}/><span className="sidebar-control-value">{t(selected.labelKey)}</span><ChevronRight className="sidebar-control-chevron" size={15}/>
    </button>
    {open === "theme" && <div className="sidebar-appearance-popover theme-popover" role="dialog" aria-label={t("theme")}>
      <strong>{t("theme")}</strong>
      <div className="sidebar-theme-list">
        {THEME_OPTIONS.map(option => <button key={option.id} className={selectedTheme === option.id ? "selected" : ""} aria-pressed={selectedTheme === option.id} onPointerEnter={() => preview(option.id)} onPointerLeave={clearPreview} onFocus={() => preview(option.id)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearPreview(); }} onClick={() => chooseTheme(option.id)}>
          <span className="sidebar-theme-dot" style={{ background: option.browserColor }}><span/></span><span className="sidebar-theme-label">{t(option.labelKey)}</span>{selectedTheme === option.id && <Check size={15}/>} 
        </button>)}
      </div>
    </div>}
  </div>;
}
