import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { BookOpen, ChevronDown, ChevronRight, CircleHelp, Clock3, File, FileText, Folder, FolderCog, FolderOpen, LayoutGrid, Menu, MoreHorizontal, Plus, Settings2, Sparkles, Star, Trash2, Users, X } from "lucide-react";
import type { WorkspaceFile } from "../lib/workspaceFiles";
import type { Project, ProjectFolder } from "../lib/projectStore";
import type { Theme } from "../lib/theme";
import { useLanguage } from "../lib/i18n";
import { SIDEBAR_MIN_WIDTH, sidebarDensityFor } from "../lib/sidebarLayout";
import SidebarAppearanceControls from "./SidebarAppearanceControls";
import { emitGuideAction } from "../lib/featureGuides";
import { APP_VERSION_LABEL } from "../lib/appVersion";
import "./workspaceFolders.css";

export type SidebarView = "recent" | "__favorites" | "__trash" | "__learning" | "__flashcards" | "__shared" | "__lab" | "__guides";

type Props = {
  projects: Project[];
  folders: ProjectFolder[];
  files: WorkspaceFile[];
  activeFileId: string | null;
  onOpenFile: (id: string) => void;
  onBrowseFiles: () => void;
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
  canUsePremiumTheme?: boolean;
  onLockedTheme?: () => void;
  onSettings: () => void;
  onToggleCollapsed: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResetWidth: () => void;
};

export default function AppSidebar({ projects, folders, files, activeFileId, onOpenFile, onBrowseFiles, boardOpen, recent, filter, sidebarCollapsed, sidebarWidth, language, selectedTheme, onHome, onOpenView, onOpenFolder, onOpenProject, onDropProject, onNewFolder, onFolderAction, onManageFolders, onLanguageChange, onThemeChange, canUsePremiumTheme = false, onLockedTheme, onSettings, onToggleCollapsed, onResizeStart, onResetWidth }: Props) {
  const { t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [showSwipeHint, setShowSwipeHint] = useState(() => { try { return localStorage.getItem("mindcanvas:mobile-nav-swiped:v1") !== "true"; } catch { return true; } });
  const [expandedFolders, setExpandedFolders] = useState(() => new Set<string>());
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 620px)").matches);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === "undefined" ? 1280 : window.innerWidth);
  const closeMobile = () => setMobileOpen(false);
  const goHome = () => { closeMobile(); onHome(); };
  const goView = (view: SidebarView) => { closeMobile(); onOpenView(view); if (view === "recent") emitGuideAction("workspace:recent"); else if (view === "__favorites") emitGuideAction("workspace:favorites"); else if (view === "__trash") emitGuideAction("workspace:trash"); };
  const expand = (folderId: string, toggle = false) => {
    onBrowseFiles();
    setExpandedFolders(previous => {
      if (previous.has(folderId) && !toggle) return previous;
      const next = new Set(previous);
      if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
      return next;
    });
  };
  const openFolder = (folderId: string) => { expand(folderId); closeMobile(); onOpenFolder(folderId); emitGuideAction("workspace:folder", folderId); };
  const handleDrop = (event: DragEvent, folderId: string | null) => { closeMobile(); onDropProject(event, folderId); };
  const renderFolders = (parent: string | null, depth: number): ReactNode => depth >= 16 ? null : folders
    .filter(folder => (folder.parentId ?? null) === parent).map(folder => {
    const childProjects = projects.filter(project => project.folderId === folder.id && !project.deletedAt && !project.shared);
    const childFiles = files.filter(file => file.folderId === folder.id && file.ready);
    const expanded = expandedFolders.has(folder.id);
    const nested = folders.some(child => child.parentId === folder.id);
    const rowId = `workspace-folder-${folder.id}`;
    return <div key={folder.id} className="workspace-tree-branch" data-folder-id={folder.id} style={{ "--folder-depth": Math.min(depth,7) } as CSSProperties}>
      <div className={`folder-row ${filter === folder.id && !boardOpen ? "active" : ""}`}
        onDragOver={event => { if (Array.from(event.dataTransfer.types).includes("text/mindcanvas-project")) event.preventDefault(); }} onDrop={event => handleDrop(event,folder.id)}>
        <button type="button" className="folder-expand-toggle" aria-label={`${expanded ? t("collapseFolder") : t("expandFolder")}: ${folder.name}`}
          aria-expanded={expanded} aria-controls={expanded ? rowId : undefined} onClick={() => expand(folder.id,true)}>{expanded ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}</button>
        <button type="button" className="folder-open" title={folder.name} aria-current={filter === folder.id && !boardOpen ? "page" : undefined} onClick={() => openFolder(folder.id)}>{expanded ? <FolderOpen size={17}/> : <Folder size={17}/>}<span className="nav-label">{folder.name}</span></button>
        <button type="button" className="folder-more" aria-label={`${t("folderActions")}: ${folder.name}`} title={t("folderActions")} onClick={() => { closeMobile(); onFolderAction(folder); }}><MoreHorizontal size={16}/></button>
      </div>
      {expanded && <div className="workspace-tree-children" id={rowId}>
        {nested && renderFolders(folder.id,depth+1)}
        <div className="folder-dropdown">
          {childFiles.map(file => <button type="button" key={file.id} title={file.name} aria-current={activeFileId === file.id && !boardOpen ? "page" : undefined}
            onClick={() => { closeMobile(); onOpenFile(file.id); }}><File size={14}/><span>{file.name}</span></button>)}
          {childProjects.map(project => <button type="button" key={project.id} title={project.title} onClick={() => { closeMobile(); onOpenProject(project); }}><FileText size={14}/><span>{project.title}</span></button>)}
          {!nested && !childFiles.length && !childProjects.length && <small>{t("emptyFolder")}</small>}
        </div>
      </div>}
    </div>;
  });
  // A saved desktop width must not consume the content area on a smaller window.
  const effectiveWidth = Math.min(sidebarWidth, Math.max(SIDEBAR_MIN_WIDTH, Math.floor(viewportWidth * .28)));
  const style = { "--sidebar-width": `${sidebarCollapsed ? 74 : effectiveWidth}px` } as CSSProperties;
  const density = sidebarDensityFor(effectiveWidth, sidebarCollapsed);

  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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
    const parents = new Map(folders.map(folder => [folder.id,folder.parentId ?? null]));
    setExpandedFolders(previous => {
      const next = new Set([...previous].filter(id => parents.has(id)));
      for (let ancestor = filter && parents.has(filter) ? filter : null, depth = 0; ancestor && depth < 16; ancestor = parents.get(ancestor) ?? null, depth++) next.add(ancestor);
      return next.size === previous.size && [...next].every(id => previous.has(id)) ? previous : next;
    });
  }, [filter, folders]);


  useEffect(() => {
    if (!isMobile) return;
    const active = navRef.current?.querySelector<HTMLElement>("button.active");
    active?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [boardOpen, filter, isMobile, recent]);

  const markNavDiscovered = () => {
    if (!showSwipeHint) return;
    setShowSwipeHint(false);
    try { localStorage.setItem("mindcanvas:mobile-nav-swiped:v1", "true"); } catch {}
  };
  const toggleNavigation = () => {
    if (isMobile) setMobileOpen(value => !value);
    else onToggleCollapsed();
  };
  const toggleLabel = isMobile ? (mobileOpen ? t("close") : t("mobileMenu")) : t(sidebarCollapsed ? "sidebarExpand" : "sidebarCollapse");

  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);
  return <>
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} data-sidebar-density={density} style={style}>
      <div className="sidebar-header">
      <button className="brand" onClick={goHome}><span className="brand-mark"><Sparkles size={20}/></span><span className="brand-copy"><span className="brand-name">MindCanvas</span><span className="beta">{APP_VERSION_LABEL}</span></span></button>
        <button className="sidebar-toggle-button icon-button" aria-label={toggleLabel} title={toggleLabel} aria-expanded={isMobile ? mobileOpen : !sidebarCollapsed} onClick={toggleNavigation}>{isMobile && mobileOpen ? <X size={21}/> : <Menu size={21}/>}</button>
      </div>
      <nav ref={navRef} aria-label={t("workspace")} className="nav-list" onScroll={markNavDiscovered} onPointerDown={markNavDiscovered}>
        <div className="workspace-nav-row"><button className={!boardOpen && !recent && !filter ? "active" : ""} title={t("workspace")} onDragOver={event => event.preventDefault()} onDrop={event => handleDrop(event, null)} onClick={goHome}><LayoutGrid size={18}/><span className="nav-label">{t("workspace")}</span></button><button className="workspace-expand" aria-label={language === "vi" ? "Mở/đóng các mục Workspace" : "Toggle Workspace items"} aria-expanded={workspaceExpanded} onClick={() => setWorkspaceExpanded(value => !value)}>{workspaceExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</button></div>
        {workspaceExpanded && <div className="workspace-subnav">
        <button className={!boardOpen && recent ? "active" : ""} title={t("recent")} onClick={() => goView("recent")}><Clock3 size={18}/><span className="nav-label">{t("recent")}</span><span className="nav-count">{projects.filter(project => !project.deletedAt).length}</span></button>
        <button className={!boardOpen && filter === "__favorites" ? "active" : ""} title={t("favorites")} onClick={() => goView("__favorites")}><Star size={18}/><span className="nav-label">{t("favorites")}</span></button>
        <button className={!boardOpen && filter === "__trash" ? "active" : ""} title={t("trash")} onClick={() => goView("__trash")}><Trash2 size={18}/><span className="nav-label">{t("trash")}</span></button>
        </div>}
        <button type="button" className={`manage-folders-button ${!boardOpen && (filter === "__manager" || filter === "__documents" || folders.some(folder => folder.id === filter)) ? "active" : ""}`} title={t("manageFolders")} aria-current={!boardOpen && filter === "__manager" ? "page" : undefined} onClick={() => { closeMobile(); onManageFolders(); emitGuideAction("workspace:folder-manager"); }}><FolderCog size={18}/><span className="nav-label">{t("manageFolders")}</span></button>
        <button className={!boardOpen && filter === "__shared" ? "active" : ""} title={t("sharedWithMe")} onClick={() => goView("__shared")}><Users size={18}/><span className="nav-label">{t("sharedWithMe")}</span><span className="nav-count">{projects.filter(project => project.shared && !project.deletedAt).length}</span></button>
        <button className={`nav-learning ${!boardOpen && (filter === "__learning" || filter === "__flashcards") ? "active" : ""}`} aria-current={!boardOpen && (filter === "__learning" || filter === "__flashcards") ? "page" : undefined} title={t("learningHub")} onClick={() => goView("__learning")}><BookOpen size={18}/><span className="nav-label">{t("learningHub")}</span></button>
        <button className={!boardOpen && filter === "__guides" ? "active" : ""} aria-current={!boardOpen && filter === "__guides" ? "page" : undefined} title={t("guides")} onClick={() => goView("__guides")}><CircleHelp size={18}/><span className="nav-label">{t("guides")}</span></button>
      </nav>
      {isMobile && showSwipeHint && <div className="mobile-nav-swipe-hint" role="status">{t("swipeForMore")}</div>}
      <div className="section-label"><span>{t("folders")}</span><button type="button" className="icon-button" aria-label={t("newFolder")} title={t("newFolder")} onClick={() => { closeMobile(); onNewFolder(); }}><Plus size={17}/></button></div>
      <div className="folder-list" aria-label={t("folders")}>
        {renderFolders(null,0)}
        {!folders.length && <small>{t("noFolders")}</small>}
      </div>
      <div className="sidebar-bottom">
      <SidebarAppearanceControls collapsed={sidebarCollapsed} language={language} selectedTheme={selectedTheme} onLanguageChange={onLanguageChange} onThemeChange={onThemeChange} canUsePremium={canUsePremiumTheme} onLockedTheme={onLockedTheme}/>
        <button title={t("settings")} onClick={() => { closeMobile(); onSettings(); }}><Settings2 size={17}/><span className="nav-label">{t("settings")}</span></button>
      </div>
      <div className="sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label={t("resizeSidebar")} title={`${t("resizeSidebar")} · ${t("resetSidebarWidth")}`} onPointerDown={onResizeStart} onDoubleClick={onResetWidth}/>
    </aside>
    {isMobile && <nav className="mobile-compact-nav" aria-label={t("workspace")}>
      <button className={!boardOpen && !recent && !filter ? "active" : ""} onClick={goHome}><LayoutGrid size={20}/><span>{t("workspace")}</span></button>
      <button className={boardOpen ? "active" : ""} onClick={() => { if (!boardOpen) goView("recent"); else closeMobile(); }}><FileText size={20}/><span>Canvas</span></button>
      <button className={!boardOpen && (filter === "__learning" || filter === "__flashcards") ? "active" : ""} onClick={() => goView("__learning")}><BookOpen size={20}/><span>{t("learningHub")}</span></button>
      <button aria-expanded={mobileOpen} className={mobileOpen ? "active" : ""} onClick={() => setMobileOpen(value => !value)}><MoreHorizontal size={20}/><span>{t("moreTools")}</span></button>
    </nav>}
    {mobileOpen && <button className="sidebar-backdrop" aria-label={t("close")} onClick={closeMobile}/>} 
  </>;
}
