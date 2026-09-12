import { useEffect, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { BookOpen, ChevronDown, ChevronRight, Clock3, FileText, Folder, FolderCog, LayoutGrid, Menu, MoreHorizontal, Plus, Settings2, Sparkles, Star, Trash2, X } from "lucide-react";
import type { Project, ProjectFolder } from "../lib/projectStore";
import type { Theme } from "../lib/theme";
import { useLanguage } from "../lib/i18n";
import SidebarAppearanceControls from "./SidebarAppearanceControls";

export type SidebarView = "recent" | "__favorites" | "__trash" | "__flashcards";

type Props = {
  projects: Project[];
  folders: ProjectFolder[];
  boardOpen: boolean;
  recent: boolean;
  filter: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  language: "vi" | "en";
  selectedTheme: Theme;
  onHome: () => void;
  onOpenView: (view: SidebarView) => void;
  onOpenFolder: (folderId: string) => void;
  onOpenProject: (project: Project) => void;
  onDropProject: (event: DragEvent, folderId: string | null) => void;
  onNewFolder: () => void;
  onFolderAction: (folder: ProjectFolder) => void;
  onManageFolders: () => void;
  onLanguageChange: (language: "vi" | "en") => void;
  onThemeChange: (theme: Theme) => void;
  onSettings: () => void;
  onToggleCollapsed: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResetWidth: () => void;
};

export default function AppSidebar({ projects, folders, boardOpen, recent, filter, sidebarCollapsed, sidebarWidth, language, selectedTheme, onHome, onOpenView, onOpenFolder, onOpenProject, onDropProject, onNewFolder, onFolderAction, onManageFolders, onLanguageChange, onThemeChange, onSettings, onToggleCollapsed, onResizeStart, onResetWidth }: Props) {
  const { t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 620px)").matches);
  const closeMobile = () => setMobileOpen(false);
  const goHome = () => { closeMobile(); onHome(); };
  const goView = (view: SidebarView) => { closeMobile(); onOpenView(view); };
  const openFolder = (folderId: string) => { closeMobile(); onOpenFolder(folderId); };
  const handleDrop = (event: DragEvent, folderId: string | null) => { closeMobile(); onDropProject(event, folderId); };
  const style = { "--sidebar-width": `${sidebarCollapsed ? 74 : sidebarWidth}px` } as CSSProperties;

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 620px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") closeMobile(); };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [mobileOpen]);

  useEffect(() => {
    if (!isMobile && mobileOpen) setMobileOpen(false);
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (expandedFolderId && !folders.some(folder => folder.id === expandedFolderId)) setExpandedFolderId(null);
  }, [expandedFolderId, folders]);

  const toggleNavigation = () => {
    if (isMobile) setMobileOpen(value => !value);
    else onToggleCollapsed();
  };
  const toggleLabel = isMobile ? (mobileOpen ? t("close") : t("mobileMenu")) : t(sidebarCollapsed ? "sidebarExpand" : "sidebarCollapse");

  return <>
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} style={style}>
      <div className="sidebar-header">
        <button className="brand" onClick={goHome}><span className="brand-mark"><Sparkles size={20}/></span><span className="brand-name">MindCanvas</span><span className="beta">V3.8.1</span></button>
        <button className="sidebar-toggle-button icon-button" aria-label={toggleLabel} title={`${toggleLabel}${isMobile ? "" : " · Ctrl/⌘+Shift+B"}`} aria-expanded={isMobile ? mobileOpen : !sidebarCollapsed} onClick={toggleNavigation}>{isMobile && mobileOpen ? <X size={21}/> : <Menu size={21}/>}</button>
      </div>
      <nav aria-label={t("workspace")} className="nav-list">
        <button className={!boardOpen && !recent && !filter ? "active" : ""} title={t("workspace")} onDragOver={event => event.preventDefault()} onDrop={event => handleDrop(event, null)} onClick={goHome}><LayoutGrid size={18}/><span className="nav-label">{t("workspace")}</span></button>
        <button className={!boardOpen && recent ? "active" : ""} title={t("recent")} onClick={() => goView("recent")}><Clock3 size={18}/><span className="nav-label">{t("recent")}</span><span className="nav-count">{projects.filter(project => !project.deletedAt).length}</span></button>
        <button className={!boardOpen && filter === "__favorites" ? "active" : ""} title={t("favorites")} onClick={() => goView("__favorites")}><Star size={18}/><span className="nav-label">{t("favorites")}</span></button>
        <button className={!boardOpen && filter === "__trash" ? "active" : ""} title={t("trash")} onClick={() => goView("__trash")}><Trash2 size={18}/><span className="nav-label">{t("trash")}</span></button>
        <button className={`nav-flashcards ${!boardOpen && filter === "__flashcards" ? "active" : ""}`} title={t("flashcards")} onClick={() => goView("__flashcards")}><BookOpen size={18}/><span className="nav-label">{t("flashcards")}</span></button>
      </nav>
      <div className="section-label"><span>{t("folders")}</span><button className="icon-button" aria-label={t("newFolder")} title={t("newFolder")} onClick={onNewFolder}><Plus size={17}/></button></div>
      <div className="folder-list">
        {folders.map(folder => {
          const children = projects.filter(project => project.folderId === folder.id && !project.deletedAt);
          const expanded = expandedFolderId === folder.id;
          return <div className={`folder-row ${filter === folder.id && !boardOpen ? "active" : ""}`} key={folder.id} onDragOver={event => event.preventDefault()} onDrop={event => handleDrop(event, folder.id)}>
            <button className="folder-open" title={folder.name} onClick={() => openFolder(folder.id)}><Folder size={17}/><span className="nav-label">{folder.name}</span></button>
            <button className="folder-expand-toggle" aria-label={`${expanded ? t("collapseFolder") : t("expandFolder")}: ${folder.name}`} aria-expanded={expanded} title={expanded ? t("collapseFolder") : t("expandFolder")} onClick={event => { event.stopPropagation(); setExpandedFolderId(current => current === folder.id ? null : folder.id); }}>{expanded ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}</button>
            <button className="folder-more" aria-label={`${t("folderActions")}: ${folder.name}`} title={t("folderActions")} onClick={event => { event.stopPropagation(); closeMobile(); onFolderAction(folder); }}><MoreHorizontal size={16}/></button>
            {expanded && <div className="folder-dropdown">
              {children.slice(0, 8).map(project => <button key={project.id} title={project.title} onClick={() => { closeMobile(); onOpenProject(project); }}><FileText size={14}/><span>{project.title}</span></button>)}
              {!children.length && <small>{t("emptyFolder")}</small>}
              {children.length > 8 && <small>+{children.length - 8} {t("projects").toLocaleLowerCase()}</small>}
            </div>}
          </div>;
        })}
        {!folders.length && <small>{t("noFolders")}</small>}
      </div>
      <button className="manage-folders-button" title={t("manageFolders")} onClick={() => { closeMobile(); onManageFolders(); }}><FolderCog size={17}/><span className="nav-label">{t("manageFolders")}</span></button>
      <div className="sidebar-bottom">
        <SidebarAppearanceControls collapsed={sidebarCollapsed} language={language} selectedTheme={selectedTheme} onLanguageChange={onLanguageChange} onThemeChange={onThemeChange}/>
        <button title={t("settings")} onClick={() => { closeMobile(); onSettings(); }}><Settings2 size={17}/><span className="nav-label">{t("settings")}</span></button>
      </div>
      <div className="sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label={t("resizeSidebar")} title={`${t("resizeSidebar")} · ${t("resetSidebarWidth")}`} onPointerDown={onResizeStart} onDoubleClick={onResetWidth}/>
    </aside>
    {mobileOpen && <button className="sidebar-backdrop" aria-label={t("close")} onClick={closeMobile}/>} 
  </>;
}
