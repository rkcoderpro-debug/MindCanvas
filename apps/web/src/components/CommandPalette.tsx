import { useMemo, useState } from "react";
import { BookOpen, FilePlus2, FileText, Search, Settings2, Upload } from "lucide-react";
import type { Project } from "../lib/projectStore";
import { useLanguage, type MessageKey } from "../lib/i18n";
import Dialog from "./Dialog";

function searchableProject(project: Project) {
  const board = project.board;
  return [project.title, ...(board?.texts.map(item => item.text) ?? []), ...(board?.nodes.map(item => item.label) ?? []), ...(board?.edges.map(item => item.label ?? "") ?? [])].join(" ").toLocaleLowerCase();
}

export default function CommandPalette({ projects, onClose, onOpenProject, onCreateProject, onOpenFlashcards, onOpenSettings, onImport }: {
  projects: Project[];
  onClose: () => void;
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
  onOpenFlashcards: () => void;
  onOpenSettings: () => void;
  onImport: () => void;
}) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase();
  const actions: Array<{ key: MessageKey; icon: typeof Search; run: () => void }> = [
    { key: "newProject", icon: FilePlus2, run: onCreateProject },
    { key: "goToFlashcards", icon: BookOpen, run: onOpenFlashcards },
    { key: "openSettings", icon: Settings2, run: onOpenSettings },
    { key: "importProject", icon: Upload, run: onImport },
  ];
  const visibleActions = actions.filter(action => !normalized || t(action.key).toLocaleLowerCase().includes(normalized));
  const visibleProjects = useMemo(() => projects.filter(project => !project.deletedAt && (!normalized || searchableProject(project).includes(normalized))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12), [projects, normalized]);
  const run = (action: () => void) => { onClose(); action(); };
  return <Dialog title={t("commandPalette")} onClose={onClose}>
    <label className="command-search"><Search size={19}/><input autoFocus aria-label={t("commandSearch")} placeholder={t("commandSearch")} value={query} onChange={event => setQuery(event.target.value)}/><kbd>⌘ K</kbd></label>
    {!visibleActions.length && !visibleProjects.length ? <div className="command-empty">{t("noCommands")}</div> : <div className="command-results">
      {!!visibleActions.length && <section><small>{t("commandPalette")}</small>{visibleActions.map(({ key, icon: Icon, run: action }) => <button key={key} onClick={() => run(action)}><span className="command-icon"><Icon size={17}/></span><strong>{t(key)}</strong></button>)}</section>}
      {!!visibleProjects.length && <section><small>{t("projects")}</small>{visibleProjects.map(project => <button key={project.id} onClick={() => run(() => onOpenProject(project))}><span className="command-icon"><FileText size={17}/></span><span><strong>{project.title}</strong><small>{new Date(project.updatedAt).toLocaleString(language === "vi" ? "vi-VN" : "en-US")}</small></span></button>)}</section>}
    </div>}
    <div className="command-footer"><span>{t("commandHint")}</span><span>Esc · {t("close")}</span></div>
  </Dialog>;
}
