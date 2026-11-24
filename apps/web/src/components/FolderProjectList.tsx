import { useState } from "react";
import { FileText, MoreHorizontal } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import type { Project, ProjectFolder, ProjectPatch } from "../lib/projectStore";
import Dialog from "./Dialog";
import { folderTrail } from "./WorkspaceFolderArea";

type Props = {
  folderId: string | null;
  projects: Project[];
  folders: ProjectFolder[];
  loading: boolean;
  onOpen: (project: Project) => void;
  onManage: (project: Project, patch: ProjectPatch) => Promise<void>;
  onDuplicate: (project: Project, title: string, folder: string | null) => Promise<void>;
};
export default function FolderProjectList({folderId,projects,folders,loading,onOpen,onManage,onDuplicate}: Props) {
  const {t,language} = useLanguage();
  const [action,setAction] = useState<{project: Project; kind: "rename" | "move" | "duplicate"} | null>(null);
  const [value,setValue] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const list = projects.filter(p => !p.deletedAt && !p.shared && (p.folderId ?? null) === folderId);
  const perform = async () => {
    if (!action || busy || (action.kind !== "move" && !value.trim())) return;
    setBusy(true); setError("");
    try {
      if (action.kind === "duplicate") await onDuplicate(action.project,value.trim(),folderId);
      else await onManage(action.project,action.kind === "move" ? {folderId:value || null} : {title:value.trim()});
      setAction(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("error")); }
    finally { setBusy(false); }
  };
  return <section className="workspace-file-box folder-project-list">
    <header><h2>{t("projects")}</h2><span className="folder-section-count">{list.length}</span></header>
    {loading ? <p role="status">{t("loading")}</p> : list.length === 0 ? <p>{language === "vi" ? "Chưa có project ở cấp này." : "No projects at this level."}</p> :
      <ul className="workspace-file-list">{list.map(project => <li key={project.id}>
        <FileText size={18} aria-hidden="true"/>
        <button className="workspace-file-open workspace-file-name" type="button" onClick={() => onOpen(project)}>
          <strong title={project.title}>{project.title}{(project.thumbnail?.format === "a4" || project.board?.a4) && <span className="project-a4-badge">A4</span>}</strong>
          <small>{new Date(project.updatedAt).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US")}</small>
        </button>
        <details className="folder-more-menu">
          <summary className="icon-button" aria-label={`${t("projectActions")}: ${project.title}`}><MoreHorizontal size={17}/></summary>
          <div>{(["rename","move","duplicate"] as const).map(kind => <button type="button" key={kind} onClick={event => {
            event.currentTarget.closest("details")?.removeAttribute("open");
            setError("");
            setValue(kind === "move" ? project.folderId ?? "" : kind === "duplicate" ? `${project.title} — ${t("copySuffix")}` : project.title);
            setAction({project,kind});
          }}>{t(kind)}</button>)}</div>
        </details>
      </li>)}</ul>}
    {action && <Dialog title={t(action.kind)} onClose={() => setAction(null)} dismissible={!busy}>
      <form onSubmit={event => { event.preventDefault(); void perform(); }}>
        <label>{action.kind === "move" ? t("folders") : t("name")}
          {action.kind === "move" ? <select value={value} onChange={event => setValue(event.target.value)}>
            <option value="">{t("noFolder")}</option>
            {folders.map(f => <option value={f.id} key={f.id}>{folderTrail(folders,f.id).map(folder=>folder.name).join(" › ")}</option>)}
          </select> : <input value={value} required autoFocus maxLength={120} onChange={event => setValue(event.target.value)}/>}
        </label>
        {error && <p role="alert">{error}</p>}
        <footer className="actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setAction(null)}>{t("cancel")}</button>
          <button className="primary-button" type="submit" disabled={busy || (action.kind !== "move" && !value.trim())}>{busy ? t("saving") : t("save")}</button></footer>
      </form>
    </Dialog>}
  </section>;
}
