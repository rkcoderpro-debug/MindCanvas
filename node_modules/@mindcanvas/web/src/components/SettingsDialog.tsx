import { ArrowLeft, ChevronRight, CircleHelp, Focus, Globe2, Palette, PenTool, Pin, Search, Smartphone, UserRound, X } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage, type MessageKey } from "../lib/i18n";
import type { ToolMode } from "@mindcanvas/shared";
import type { Theme } from "../lib/theme";
import type { AccountPlan } from "../lib/account";
import type { WebBackground } from "../lib/webBackground";
import { TOOLBAR_POSITIONS, type ToolbarPosition } from "../lib/editorPreferences";
import { normalizeQuickSearch } from "../lib/learningCommands";
import Dialog from "./Dialog";
import ThemePicker from "./ThemePicker";
import ToolbarCustomization from "./ToolbarCustomization";
import WebBackgroundControls from "./WebBackgroundControls";
import FilePicker from "./FilePicker";

const groups = [
  { id: "account", title: "settingsAccount", description: "settingsAccountDescription", Icon: UserRound },
  { id: "appearance", title: "settingsAppearance", description: "settingsAppearanceDescription", Icon: Palette },
  { id: "canvas", title: "settingsCanvas", description: "settingsCanvasDescription", Icon: PenTool },
  { id: "focus", title: "settingsFocus", description: "settingsFocusDescription", Icon: Focus },
  { id: "language", title: "language", description: "settingsLanguageDescription", Icon: Globe2 },
  { id: "help", title: "settingsHelpInstall", description: "settingsHelpDescription", Icon: CircleHelp },
] as const;
type Category = typeof groups[number]["id"];
type Preference<T> = { value: T; change: (value: T) => void };
const toolbarLabels: Record<ToolbarPosition, MessageKey> = { top: "toolbarTop", bottom: "toolbarBottom", left: "toolbarLeft", right: "toolbarRight" };

type Props = {
  onClose: () => void;
  profile: { name: string; email?: string; open: () => void } | null;
  signIn: (() => void) | null;
  plan: AccountPlan;
  openPlans: () => void;
  theme: Preference<Theme>;
  background: Preference<WebBackground | null>;
  stickyTopbar: Preference<boolean>;
  toolbarPosition: Preference<ToolbarPosition>;
  visibleTools: Preference<ToolMode[]>;
  mobileZoom: Preference<boolean>;
  focusMode: Preference<boolean>;
  focusTimer: Preference<boolean>;
  pet: Preference<boolean>;
  installed: boolean;
  openInstall: () => void;
  importProject: (file: File) => void;
};

function Switch({ label, detail, preference }: { label: string; detail?: string; preference: Preference<boolean> }) {
  const descriptionId = useId();
  return <label className="settings-option-switch">
    <span><strong>{label}</strong>{detail && <small id={descriptionId}>{detail}</small>}</span>
    <input type="checkbox" role="switch" aria-label={label} aria-describedby={detail ? descriptionId : undefined}
      checked={preference.value} onChange={event => preference.change(event.target.checked)}/>
  </label>;
}

export default function SettingsDialog(props: Props) {
  const { t, language, setLanguage } = useLanguage();
  const [category, setCategory] = useState<Category>("appearance");
  const [mobileDetail, setMobileDetail] = useState(false);
  const [query, setQuery] = useState("");
  const [navigation, setNavigation] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const focusAfterNavigation = useRef<string | "category" | null>(null);
  const id = useId();

  const options: { key: string; group: Category; title: MessageKey; keywords: string; content: ReactNode }[] = [
    { key: "profile", group: "account", title: "settingsPersonalProfile", keywords: "account tài khoản hồ sơ avatar ảnh đại diện username biệt danh email profile sign in đăng nhập", content: <>
      {props.profile ? <><p className="settings-account-name">{props.profile.name}</p>{props.profile.email && <p className="field-hint">{props.profile.email}</p>}<button type="button" className="secondary-button" onClick={props.profile.open}><UserRound size={16}/>{t("settingsOpenProfile")}</button></>
        : <><p className="field-hint">{t("accountHint")}</p>{props.signIn && <button type="button" className="secondary-button" onClick={props.signIn}>{t("login")}</button>}</>}
    </> },
    { key: "plan", group: "account", title: "currentPlan", keywords: "gói nâng cấp plan subscription free plus pro max", content: <><p className="settings-account-name">{props.plan.name}</p><button type="button" className="secondary-button" onClick={props.openPlans}>{t("settingsManagePlan")}</button></> },
    { key: "sticky-topbar", group: "appearance", title: "settingsPinTopbar", keywords: "thanh trên ghim dính cố định cuộn header sticky top bar topbar pin scrolling", content: <Switch label={t("settingsPinTopbar")} detail={t("settingsPinTopbarHint")} preference={props.stickyTopbar}/> },
    { key: "theme", group: "appearance", title: "theme", keywords: "theme giao diện màu sáng tối chủ đề dark light color", content: <><p className="field-hint">{t("themeChoose")}</p><ThemePicker theme={props.theme.value} onChange={props.theme.change} canUsePremium={props.plan.effectivePlanId !== "free"} onLocked={props.openPlans}/></> },
    { key: "background", group: "appearance", title: "webBackground", keywords: "hình nền ảnh video trang web background wallpaper", content: <WebBackgroundControls background={props.background.value}
      canUseUpload={props.plan.effectivePlanId === "pro" || props.plan.effectivePlanId === "max"} onLocked={props.openPlans} onChange={props.background.change}/> },
    { key: "toolbar-position", group: "canvas", title: "toolbarPosition", keywords: "toolbar công cụ thanh vẽ vị trí location position top bottom trái phải", content: <>
      <p className="field-hint">{t("toolbarPositionHint")}</p><div className="toolbar-position-options" role="group" aria-label={t("toolbarPosition")}>{TOOLBAR_POSITIONS.map(position =>
        <button type="button" key={position} className={props.toolbarPosition.value === position ? "selected" : ""} aria-pressed={props.toolbarPosition.value === position} onClick={() => props.toolbarPosition.change(position)}>
          <span className={`toolbar-position-preview ${position}`} aria-hidden="true"/><span>{t(toolbarLabels[position])}</span>
        </button>)}</div></> },
    { key: "toolbar-tools", group: "canvas", title: "toolbarCustomize", keywords: "thanh công cụ vẽ tùy chỉnh tool toolbar customize pencil", content: <>
      <ToolbarCustomization visibleToolIds={props.visibleTools.value} onChange={props.visibleTools.change}/>
    </> },
    { key: "mobile-zoom", group: "canvas", title: "mobileZoomControls", keywords: "zoom phóng to thu nhỏ cảm ứng mobile điện thoại", content: <Switch label={t("showMobileZoomControls")} detail={t("mobileZoomControlsHint")} preference={props.mobileZoom}/> },
    { key: "focus-mode", group: "focus", title: "focusMode", keywords: "tập trung chế độ focus mode ẩn thanh bên sidebar", content: <Switch label={t("focusMode")} detail={t("settingsFocusModeHint")} preference={props.focusMode}/> },
    { key: "focus-timer", group: "focus", title: "focusTimerVisibility", keywords: "hẹn giờ đồng hồ timer pomodoro tập trung", content: <Switch label={t("showFocusTimer")} detail={t("focusTimerVisibilityHint")} preference={props.focusTimer}/> },
    { key: "pet", group: "focus", title: "settingsPetLabel", keywords: "thú cưng pet hamster vị trí", content: <>
      <Switch label={t("settingsShowPet")} preference={props.pet}/><button type="button" className="secondary-button" onClick={() => window.dispatchEvent(new Event("mindcanvas:reset-pet-position"))}>{t("settingsResetPet")}</button>
    </> },
    { key: "language", group: "language", title: "language", keywords: "ngôn ngữ tiếng Việt English language giao diện", content:
      <label className="settings-language"><span>{t("settingsLanguageDescription")}</span><select value={language} onChange={event => setLanguage(event.target.value as "vi" | "en")}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label> },
    { key: "help", group: "help", title: "help", keywords: "help trợ giúp hướng dẫn hỗ trợ", content: <p className="field-hint">{t("helpText")}</p> },
    { key: "install", group: "help", title: "installApp", keywords: "install cài ứng dụng PWA offline ngoại tuyến", content: <>
      <p className="field-hint">{t("pwaOfflineHint")}</p><button type="button" className="secondary-button" onClick={props.openInstall}><Smartphone size={17}/>{t(props.installed ? "appInstalled" : "installApp")}</button>
    </> },
    { key: "import", group: "help", title: "import", keywords: "nhập tệp file project json canvas restore import", content:
      <FilePicker aria-label={t("import")} accept=".json,.mindcanvas" description={t("filePickerCanvasFormats")} onChange={event => {
        const file = event.currentTarget.files?.[0]; if (file) props.importProject(file);
      }}/>,
    },
  ];

  const activeGroup = groups.find(group => group.id === category)!;
  const words = normalizeQuickSearch(query).split(/\s+/).filter(Boolean);
  const results = words.length ? options.map(option => {
    const title = normalizeQuickSearch(t(option.title));
    const keys = normalizeQuickSearch(`${option.keywords} ${t(groups.find(group => group.id === option.group)!.title)}`);
    if (!words.every(word => title.includes(word) || keys.includes(word))) return null;
    return { option, score: words.reduce((score, word) => score + (title.includes(word) ? 2 : 1), 0) };
  }).filter(result => !!result).sort((a, b) => b.score - a.score).map(({ option }) => option) : [];
  const searching = words.length > 0;
  // On desktop users can see the best matching control immediately. Search
  // results themselves also serve as direct jumps, including on mobile.
  const preview = searching ? results[0] : undefined;
  const displayedGroup = preview ? groups.find(group => group.id === preview.group)! : activeGroup;
  const displayedOptions = searching ? (preview ? [preview] : []) : options.filter(option => option.group === category);
  const open = (next: Category, target?: string) => {
    focusAfterNavigation.current = target ?? "category";
    setQuery(""); setCategory(next); setMobileDetail(true); setNavigation(value => value + 1);
  };
  // A search jump scrolls and focuses an actual preference rather than
  // sending the user to the beginning of a potentially long section.
  useLayoutEffect(() => {
    const pending = focusAfterNavigation.current;
    if (!pending || searching) return;
    focusAfterNavigation.current = null;
    const panel = container.current?.querySelector<HTMLElement>(".settings-content");
    const target = pending === "category" ? panel?.querySelector<HTMLElement>(".settings-content-title") : panel?.querySelector<HTMLElement>(`[data-setting="${pending}"]`);
    if (target) {
      const control = pending === "category" ? target : target.querySelector<HTMLElement>('[role="switch"], select') ?? target;
      control.focus({ preventScroll: true });
      if (pending === "category") { if (panel) panel.scrollTop = 0; }
      else target.scrollIntoView?.({ block: "nearest" });
    }
  }, [navigation, searching]);

  return <Dialog workspace className="preferences-dialog" title={t("settings")} onClose={props.onClose} toolbar={
    <div className="settings-search-bar">
      <label htmlFor={`${id}-search`}><Search size={18} aria-hidden="true"/><span className="sr-only">{t("settingsSearch")}</span></label>
      <input ref={search} id={`${id}-search`} type="search" placeholder={t("settingsSearch")} value={query}
        onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing && results[0]) { event.preventDefault(); open(results[0].group, results[0].key); }
        }}/>
      {query && <button type="button" className="icon-button" aria-label={t("settingsClearSearch")} onClick={() => { setQuery(""); search.current?.focus(); }}><X size={16}/></button>}
    </div>
  }>
    <div ref={container} className={`preferences-layout${mobileDetail && !searching ? " settings-show-detail" : ""}`}>
      <nav className="settings-categories" aria-label={t("settingsCategories")}>
        {searching ? results.length ? results.map(result => <button key={result.key} className="settings-category" type="button" onClick={() => open(result.group, result.key)}>
          {result.key === "sticky-topbar" ? <Pin size={17} aria-hidden="true"/> : <Search size={17} aria-hidden="true"/>}
          <span><strong>{t(result.title)}</strong><small>{t(groups.find(group => group.id === result.group)!.title)}</small></span><ChevronRight size={15} aria-hidden="true"/>
        </button>) : <p className="settings-empty" role="status">{t("settingsNoResults")}</p> : groups.map(group =>
          <button key={group.id} className="settings-category" type="button" aria-current={group.id === category ? "true" : undefined} onClick={() => open(group.id)}>
            <group.Icon size={19} aria-hidden="true"/><span><strong>{t(group.title)}</strong><small>{t(group.description)}</small></span><ChevronRight size={16} aria-hidden="true"/>
          </button>
        )}
      </nav>
      <div className="settings-content" role="region" aria-label={t(displayedGroup.title)}>
        <button type="button" className="settings-mobile-back secondary-button" onClick={() => { setMobileDetail(false); search.current?.focus(); }}><ArrowLeft size={17}/>{t("settingsBackToCategories")}</button>
        {(displayedOptions.length > 0) && <>
          <div className="settings-content-intro"><displayedGroup.Icon size={20} aria-hidden="true"/><div>
            <h3 className="settings-content-title" tabIndex={-1}>{t(displayedGroup.title)}</h3><p>{t(displayedGroup.description)}</p>
          </div></div>
          {displayedOptions.map(option => <section className="settings-card" key={option.key} tabIndex={-1} data-setting={option.key}>
            {option.key !== "sticky-topbar" && option.key !== "focus-mode" && <h4>{t(option.title)}</h4>}
            {option.content}
          </section>)}
        </>}
      </div>
    </div>
  </Dialog>;
}
