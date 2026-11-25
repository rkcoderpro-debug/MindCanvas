import { useState } from "react";
import { FileText, MoreHorizontal, Share2, Trash2 } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import type { Project, ProjectFolder, ProjectPatch } from "../lib/projectStore";
import Dialog from "./Dialog";
import { folderTrail } from "./WorkspaceFolderArea";
import { WorkspaceShareSettings } from "./WorkspaceShareDialog";

type Props = {
  folderId: string | null;
  projects: Project[];
  folders: ProjectFolder[];
  loading: boolean;
  onOpen: (project: Project) => void;
  onManage: (project: Project, patch: ProjectPatch) => Promise<void>;
  onDuplicate: (project: Project, title: string, folder: string | null) => Promise<void>;
  prepareSharing?: (project: Project) => Promise<void>;
  onSignIn?: () => void;
};
export default function FolderProjectList({folderId,projects,folders,loading,onOpen,onManage,onDuplicate,prepareSharing,onSignIn}: Props) {
  const {t,language} = useLanguage();
  const [action,setAction] = useState<{project: Project; kind: "rename" | "move" | "duplicate" | "delete"} | null>(null);
  const [sharing,setSharing] = useState<Project | null>(null);
  const [value,setValue] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const list = projects.filter(p => !p.deletedAt && !p.shared && (p.folderId ?? null) === folderId);
  const needsName = action?.kind === "rename" || action?.kind === "duplicate";
  const perform = async () => {
    if (!action || busy || (needsName && !value.trim())) return;
    setBusy(true); setError("");
    try {
      if (action.kind === "duplicate") await onDuplicate(action.project,value.trim(),folderId);
      else if (action.kind === "delete") await onManage(action.project, { deletedAt: new Date().toISOString() });
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
          }}>{t(kind)}</button>)}
          {(!project.accessRole || project.accessRole === "owner") && !project.cloudOffline && <>
            <button type="button" onClick={event => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              setSharing(project);
            }}><Share2 size={16} aria-hidden="true"/>{t("shareProject")}</button>
            <button type="button" className="folder-project-menu-delete" onClick={event => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              setError(""); setAction({project,kind:"delete"});
            }}><Trash2 size={16} aria-hidden="true"/>{t("delete")}</button>
          </>}
          </div>
        </details>
      </li>)}</ul>}
    {sharing && <Dialog workspace className="workspace-share-dialog" title={`${t("shareProject")}: ${sharing.title}`} onClose={() => setSharing(null)}>
      <WorkspaceShareSettings item={{kind:"canvas",id:sharing.id,title:sharing.title}} available={!!prepareSharing}
        prepare={prepareSharing ? () => prepareSharing(sharing) : undefined}/>
      {!prepareSharing && onSignIn && <button type="button" className="primary-button" onClick={onSignIn}>{t("login")}</button>}
    </Dialog>}
    {action && <Dialog title={t(action.kind === "delete" ? "moveToTrash" : action.kind)} onClose={() => setAction(null)} dismissible={!busy}>
      <form onSubmit={event => { event.preventDefault(); void perform(); }}>
        {action.kind === "delete" ? <>
          <p className="workspace-file-status"><strong>{action.project.title}</strong></p>
          <p>{language === "vi" ? "Bạn có thể khôi phục project này từ Thùng rác." : "You can restore this project from Trash."}</p>
        </> : <label>{action.kind === "move" ? t("folders") : t("name")}
          {action.kind === "move" ? <select value={value} onChange={event => setValue(event.target.value)}>
            <option value="">{t("noFolder")}</option>
            {folders.map(f => <option value={f.id} key={f.id}>{folderTrail(folders,f.id).map(folder=>folder.name).join(" › ")}</option>)}
          </select> : <input value={value} required autoFocus maxLength={120} onChange={event => setValue(event.target.value)}/>}
        </label>}
        {error && <p role="alert">{error}</p>}
        <footer className="actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setAction(null)}>{t("cancel")}</button>
          <button className={action.kind === "delete" ? "danger-button" : "primary-button"} type="submit" disabled={busy || (needsName && !value.trim())}>{busy ? t("saving") : t(action.kind === "delete" ? "moveToTrash" : "save")}</button></footer>
      </form>
    </Dialog>}
  </section>;
}
