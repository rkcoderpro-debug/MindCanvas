import { useMemo, useState } from "react";
import { FilePlus2, FileText, Search, Settings2, Upload } from "lucide-react";
import type { Project } from "../lib/projectStore";
import { useLanguage } from "../lib/i18n";
import { LEARNING_TABS, type HubTab } from "../lib/learningNavigation";
import { learningCommands, normalizeQuickSearch } from "../lib/learningCommands";
import Dialog from "./Dialog";
import { emitGuideAction } from "../lib/featureGuides";

function searchableProject(project: Project) {
  const board = project.board;
  return normalizeQuickSearch([project.title, ...(board?.texts.map(item => item.text) ?? []), ...(board?.nodes.map(item => item.label) ?? []), ...(board?.media.map(item => item.name) ?? []), ...(board?.embeds.map(item => `${item.title ?? ""} ${item.url}`) ?? []), ...(board?.edges.map(item => item.label ?? "") ?? [])].join(" "));
}

export default function CommandPalette({ projects, onClose, onOpenProject, onCreateProject, onOpenLearningTool, onOpenSettings, onImport }: {
  projects: Project[];
  onClose: () => void;
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
  onOpenLearningTool: (tab: HubTab) => void;
  onOpenSettings: () => void;
  onImport: () => void;
}) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
  const normalized = normalizeQuickSearch(query);
  const [cursor, setCursor] = useState(0);
  const learning = learningCommands(t, language);
  const actions = [
    { key: "newProject", label: t("newProject"), icon: FilePlus2, words: "new project canvas dự án", run: onCreateProject },
    { key: "settings", label: t("openSettings"), icon: Settings2, words: "settings cài đặt", run: onOpenSettings },
    { key: "import", label: t("importProject"), icon: Upload, words: "import nhập tệp tải file", run: onImport },
    ...LEARNING_TABS.map(tab => {
      const [label, icon, words] = learning[tab];
      return { key: tab, label, icon, words, run: () => onOpenLearningTool(tab) };
    }),
  ];
  const visibleActions = actions.filter(action => normalizeQuickSearch(`${action.label} ${action.words}`).includes(normalized))
    .sort((a, b) => Number(normalizeQuickSearch(b.label).startsWith(normalized)) - Number(normalizeQuickSearch(a.label).startsWith(normalized)));
  const visibleProjects = useMemo(() => projects.filter(project => !project.deletedAt && (!normalized || searchableProject(project).includes(normalized))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12), [projects, normalized]);
  const run = (action: () => void) => { onClose(); emitGuideAction("ai:action"); action(); };
  const count = visibleActions.length + visibleProjects.length;
  return <Dialog title={t("commandPalette")} onClose={onClose}>
    <label className="command-search"><Search size={19}/><input autoFocus aria-label={t("commandSearch")} placeholder={t("commandSearch")} value={query} onChange={event => { setQuery(event.target.value); setCursor(0); if (event.target.value.trim()) emitGuideAction("ai:search"); }} onKeyDown={event => {
      if (!count || event.nativeEvent.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        const index = Math.min(cursor, count - 1);
        run(index < visibleActions.length ? visibleActions[index].run : () => onOpenProject(visibleProjects[index - visibleActions.length]));
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const index = (Math.min(cursor, count - 1) + (event.key === "ArrowDown" ? 1 : count - 1)) % count;
        setCursor(index);
        event.currentTarget.closest(".dialog")?.querySelector(`[data-command-index="${index}"]`)?.scrollIntoView?.({ block: "nearest" });
      }
    }}/><kbd>Ctrl/⌘ K</kbd></label>
    {!count ? <div className="command-empty">{t("noCommands")}</div> : <div className="command-results">
      {!!visibleActions.length && <section><small>{t("commandPalette")}</small>{visibleActions.map(({ key, label, icon: Icon, run: action }, index) => <button key={key} type="button" data-guide-tab={key} data-command-index={index} data-current={cursor === index || undefined} onClick={() => run(action)}><span className="command-icon"><Icon size={17}/></span><strong>{label}</strong></button>)}</section>}
      {!!visibleProjects.length && <section><small>{t("projects")}</small>{visibleProjects.map((project, index) => <button key={project.id} type="button" data-command-index={visibleActions.length + index} data-current={cursor === visibleActions.length + index || undefined} onClick={() => run(() => onOpenProject(project))}><span className="command-icon"><FileText size={17}/></span><span><strong>{project.title}</strong><small>{new Date(project.updatedAt).toLocaleString(language === "vi" ? "vi-VN" : "en-US")}</small></span></button>)}</section>}
    </div>}
    <div className="command-footer"><span>{t("commandHint")}</span><span>Esc · {t("close")}</span></div>
  </Dialog>;
}
