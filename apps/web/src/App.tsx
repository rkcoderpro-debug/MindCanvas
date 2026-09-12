import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ProjectFolder } from "./lib/projectStore";
import { ArrowLeft, Download, FolderPlus, History, LayoutGrid, Redo2, RefreshCw, Save, Search, Smartphone, Sparkles, Undo2, Upload, X } from "lucide-react";
import CanvasBoard from "./components/CanvasBoard";
import WorkspaceHome from "./components/WorkspaceHome";
import FolderManager from "./components/FolderManager";
import Dialog from "./components/Dialog";
import AiPanel from "./components/AiPanel";
import VersionHistory from "./components/VersionHistory";
import FlashcardsPage from "./components/FlashcardsPage";
import CloudConflictDialog from "./components/CloudConflictDialog";
import ThemePicker from "./components/ThemePicker";
import CommandPalette from "./components/CommandPalette";
import SyncCenter from "./components/SyncCenter";
import AppSidebar, { type SidebarView } from "./components/AppSidebar";
import { LanguageProvider, useLanguage, useTheme } from "./lib/i18n";
import { getCurrentUser, isSupabaseConfigured, signInWithGoogle, signOut, supabase } from "./lib/supabase";
import { applyGraph, blankBoard, exportBoard, exportCanvasPngFile, exportCanvasSvgFile, importBoard } from "./lib/board";
import { useWorkspace } from "./hooks/useWorkspace";
import { usePwaInstall } from "./lib/pwa";

const SIDEBAR_DEFAULT_WIDTH = 280;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 380;

export default function App() { return <LanguageProvider><AuthenticatedApp/></LanguageProvider>; }
function AuthenticatedApp() {
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(null), [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supabase) return;
    let alive = true, receivedEvent = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedEvent = true;
      if (alive) { setUser(session?.user ?? null); setLoading(false); }
    });
    void getCurrentUser().then(u => { if (alive && !receivedEvent) { setUser(u); setLoading(false); } })
      .catch(err => { if (alive) { setError(err instanceof Error ? err.message : t("error")); setLoading(false); } });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  if (loading) return <main className="auth-loading" role="status"><Sparkles/>{t("checking")}</main>;
  // Keying by identity prevents account A's boards/history from appearing for account B.
  return <Workspace key={user?.id ?? "guest"} user={user} authError={error}/>;
}
function Workspace({ user, authError }: { user: User | null; authError: string }) {
  const { t, language, setLanguage } = useLanguage(), { selectedTheme, setTheme } = useTheme(), ws = useWorkspace(user?.id ?? null), pwa = usePwaInstall();
  const [modal, setModal] = useState<"project" | "folder" | "move" | "settings" | "ai" | "versions" | "sync" | "install" | null>(null);
  const [name, setName] = useState(""), [folder, setFolder] = useState(""), [filter, setFilter] = useState<string | null>(null), [folderAction, setFolderAction] = useState<{ folder: ProjectFolder; kind: "rename" | "delete" } | null>(null);
  const [recent, setRecent] = useState(false), [working, setWorking] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem("mindcanvas:sidebar-collapsed") === "true"; } catch { return false; } });
  const [sidebarWidth, setSidebarWidth] = useState(() => { try { const saved = Number(localStorage.getItem("mindcanvas:sidebar-width")); return Number.isFinite(saved) ? Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, saved)) : SIDEBAR_DEFAULT_WIDTH; } catch { return SIDEBAR_DEFAULT_WIDTH; } });
  const [commandOpen, setCommandOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const message = ws.error || authError;
  const home = () => { void ws.home(); setFilter(null); setRecent(false); };
  const askName = (kind: "project" | "folder") => { setName(kind === "project" ? t("untitled") : ""); setModal(kind); };
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return; setWorking(true);
    try { if (modal === "project") await ws.create(name.trim(), undefined, filter && !filter.startsWith("__") ? filter : null); else await ws.newFolder(name.trim()); setModal(null); }
    finally { setWorking(false); }
  };
  const dropProjectInto = (e: React.DragEvent, folderId: string | null) => { e.preventDefault(); const id = e.dataTransfer.getData("text/mindcanvas-project"); const project = ws.projects.find(p => p.id === id); if (project && project.folderId !== folderId) void ws.manageProject(project, { folderId }); };
  const auth = async () => {
    setWorking(true);
    try {
      if (!await ws.flush()) return;
      if (user) await signOut(); else { const result = await signInWithGoogle(); if (result.error) throw result.error; }
    } catch (err) { ws.setError(err instanceof Error ? err.message : t("error")); }
    finally { setWorking(false); }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try { const next = await importBoard(file); await ws.create(next.title, next); }
    catch { ws.setError(t("importError")); }
    if (fileInput.current) fileInput.current.value = "";
  };
  const accountName = user?.user_metadata.full_name ?? user?.user_metadata.name ?? user?.email ?? t("guest");
  const visible = ws.projects.filter(p => filter === "__trash" ? !!p.deletedAt : !p.deletedAt && (filter === "__favorites" ? p.favorite : !filter || p.folderId === filter));
  const pageTitle = filter === "__trash" ? t("trash") : filter === "__favorites" ? t("favorites") : filter ? ws.folders.find(f => f.id === filter)?.name ?? t("projects") : recent ? t("recent") : t("workspace");
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") { event.preventDefault(); setCommandOpen(value => !value); }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLocaleLowerCase() === "b") { event.preventDefault(); setSidebarCollapsed(value => !value); }
    };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => { try { localStorage.setItem("mindcanvas:sidebar-collapsed", String(sidebarCollapsed)); } catch {} }, [sidebarCollapsed]);
  useEffect(() => { try { localStorage.setItem("mindcanvas:sidebar-width", String(sidebarWidth)); } catch {} }, [sidebarWidth]);
  const resizeSidebar = (event: React.PointerEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return;
    event.preventDefault();
    const startX = event.clientX, startWidth = sidebarWidth;
    const move = (nextEvent: PointerEvent) => setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, startWidth + nextEvent.clientX - startX)));
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", stop);
  };
  const openView = (view: SidebarView) => { void ws.home(); if (view === "recent") { setFilter(null); setRecent(true); } else { setFilter(view); setRecent(false); } };
  const openFolder = (folderId: string) => { void ws.home(); setFilter(folderId); setRecent(false); };
  const openFlashcards = () => openView("__flashcards");

  return <div className="app-shell">
    <AppSidebar user={user} accountName={accountName} projects={ws.projects} folders={ws.folders} boardOpen={!!ws.board} recent={recent} filter={filter} working={working} sidebarCollapsed={sidebarCollapsed} sidebarWidth={sidebarWidth} language={language} selectedTheme={selectedTheme} pwaInstalled={pwa.installed} canSignIn={!!user || isSupabaseConfigured} onHome={home} onOpenView={openView} onOpenFolder={openFolder} onOpenProject={project => void ws.open(project)} onDropProject={dropProjectInto} onNewFolder={() => askName("folder")} onFolderAction={folder => { setName(folder.name); setFolderAction({ folder, kind: "rename" }); }} onManageFolders={() => { void ws.home(); setFilter("__manager"); setRecent(false); }} onLanguageChange={setLanguage} onThemeChange={setTheme} onInstall={() => setModal("install")} onSettings={() => setModal("settings")} onAuth={() => void auth()} onToggleCollapsed={() => setSidebarCollapsed(value => !value)} onResizeStart={resizeSidebar} onResetWidth={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}/>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><button onClick={home}>{ws.board ? <ArrowLeft size={17}/> : <LayoutGrid size={17}/>} {t("workspace")}</button>{ws.board && <span>/ {ws.board.title}</span>}</div>
        <div className="actions"><button className="icon-button command-trigger" aria-label={t("commandPalette")} title={`${t("commandPalette")} · Ctrl/⌘ K`} onClick={() => setCommandOpen(true)}><Search size={18}/></button>{ws.board && <><button role="status" className={`save-status ${ws.status}`} title={t("syncCenter")} onClick={() => setModal("sync")}>{t(ws.status)}{ws.pendingCount > 0 && <span>{ws.pendingCount}</span>}</button><button className="icon-button" aria-label={t("save")} title={t("save")} onClick={() => void ws.saveCheckpoint(t("saveCheckpoint")).catch(err => ws.setError(err instanceof Error ? err.message : t("error")))}><Save size={18}/></button><button className="icon-button" aria-label={t("versionHistory")} title={t("versionHistory")} onClick={() => { setModal("versions"); void ws.loadVersions(); }}><History size={18}/></button><button className="icon-button" aria-label={t("undo")} title={t("undo")} disabled={!ws.canUndo} onClick={ws.undo}><Undo2 size={18}/></button><button className="icon-button" aria-label={t("redo")} title={t("redo")} disabled={!ws.canRedo} onClick={ws.redo}><Redo2 size={18}/></button></>}
        {!ws.board && <button className="icon-button" aria-label={t("refresh")} onClick={() => void ws.refresh()}><RefreshCw size={18}/></button>}
        <span className="account-badge">{user ? accountName : t("local")}</span></div>
      </header>
      {pwa.updateReady && <div className="update-banner" role="status"><span>{t("updateReady")}</span><button onClick={pwa.applyUpdate}>{t("updateNow")}</button></div>}
      {message && <div className="error-banner" role="alert"><span>{t("error")}: {message}</span><button onClick={() => { ws.setError(""); void ws.flush().then(saved => { if (saved) void ws.refresh(); }); }}>{t("retry")}</button><button aria-label={t("close")} onClick={() => ws.setError("")}><X size={16}/></button></div>}
      {ws.board ? <>
        <div className="editor-heading"><TitleInput key={ws.board.id} value={ws.board.title} label={t("rename")} onCommit={title => ws.change({ ...ws.board!, title })}/><div className="actions">
          <button className="secondary-button" onClick={() => { setFolder(ws.projects.find(p => p.id === ws.board!.id)?.folderId ?? ""); setModal("move"); }}><FolderPlus size={17}/>{t("move")}</button>
          <button className="secondary-button" title={t("exportHint")} onClick={() => exportBoard(ws.board!)}><Download size={17}/>{t("export")}</button><button className="secondary-button" title={t("exportSvgHint")} onClick={() => exportCanvasSvgFile(ws.board!)}><Download size={17}/>{t("exportSvg")}</button><button className="secondary-button" title={t("exportPngHint")} onClick={() => void exportCanvasPngFile(ws.board!).catch(err => ws.setError(err instanceof Error ? err.message : t("error")))}><Download size={17}/>{t("exportPng")}</button>
          <button className="primary-button" onClick={() => setModal("ai")}><Sparkles size={17}/>{t("ai")}</button></div></div>
        <CanvasBoard key={ws.board.id} board={ws.board} onChange={ws.change} onUndo={ws.undo} onRedo={ws.redo} onSave={() => void ws.flush()} canUseAi={!!user}/>
      </> : filter === "__manager" ? <FolderManager projects={ws.projects} folders={ws.folders} onOpen={p=>void ws.open(p)} onManage={ws.manageProject} onDuplicate={ws.duplicateProject} onRenameFolder={ws.renameFolder} onDeleteFolder={ws.removeFolder} onCreateFolder={()=>askName("folder")}/> : filter === "__flashcards" ? <FlashcardsPage owner={user?.id ?? null} projects={ws.projects}/> : <WorkspaceHome projects={visible} title={pageTitle} loading={ws.loading} folders={ws.folders} onManage={ws.manageProject} onDuplicate={ws.duplicateProject} trash={filter === "__trash"} onOpen={p => void ws.open(p)} onCreate={() => askName("project")} onImport={() => fileInput.current?.click()}/>} 
    </main>
    <input ref={fileInput} hidden type="file" accept=".json,.mindcanvas" onChange={e => void importFile(e.target.files?.[0])}/>
    {(modal === "project" || modal === "folder") && <Dialog title={t(modal === "project" ? "newProject" : "newFolder")} onClose={() => { if (!working) setModal(null); }}><form onSubmit={e => void create(e)}>
      <label>{t("name")}<input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} onFocus={e => e.target.select()}/></label>
      <footer className="actions"><button type="button" className="secondary-button" disabled={working} onClick={() => setModal(null)}>{t("cancel")}</button><button className="primary-button" disabled={!name.trim() || working}>{working ? t("saving") : t("create")}</button></footer></form></Dialog>}
    {folderAction?.kind === "rename" && <Dialog title={t("renameFolder")} onClose={() => setFolderAction(null)}><form onSubmit={e => { e.preventDefault(); const n = name.trim(); if (n) void ws.renameFolder(folderAction.folder, n).then(() => setFolderAction(null)); }}><label>{t("name")}<input autoFocus required maxLength={80} defaultValue={folderAction.folder.name} onChange={e => setName(e.target.value)}/></label><footer className="actions"><button type="button" className="secondary-button" onClick={() => setFolderAction(null)}>{t("cancel")}</button><button className="primary-button">{t("save")}</button></footer></form><button className="text-danger-button" onClick={() => setFolderAction({ ...folderAction, kind: "delete" })}>{t("deleteFolder")}</button></Dialog>}
    {folderAction?.kind === "delete" && <Dialog title={t("deleteFolder")} onClose={() => setFolderAction(null)}><p>{t("deleteFolderHint")}</p><footer className="actions"><button className="secondary-button" onClick={() => setFolderAction(null)}>{t("cancel")}</button><button className="danger-button" onClick={() => void ws.removeFolder(folderAction.folder).then(() => { if (filter === folderAction.folder.id) setFilter(null); setFolderAction(null); })}>{t("deleteFolder")}</button></footer></Dialog>}
    {modal === "move" && <Dialog title={t("move")} onClose={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); ws.move(folder || null); setModal(null); }}><label>{t("folders")}<select value={folder} onChange={e => setFolder(e.target.value)}><option value="">{t("noFolder")}</option>{ws.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><footer className="actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>{t("cancel")}</button><button className="primary-button">{t("save")}</button></footer></form></Dialog>}
    {modal === "settings" && <Dialog title={t("settings")} onClose={() => setModal(null)}><div className="settings-layout"><section className="settings-section"><label>{t("language")}<select value={language} onChange={e => setLanguage(e.target.value as "vi" | "en")}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("theme")}</strong><small>{t("themeChoose")}</small></div><ThemePicker theme={selectedTheme} onChange={setTheme}/></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("installApp")}</strong><small>{t("pwaOfflineHint")}</small></div><button className="secondary-button" onClick={() => setModal("install")}><Smartphone size={17}/>{t(pwa.installed ? "appInstalled" : "installApp")}</button></section><section className="settings-section settings-help"><p>{t("accountHint")}</p><h3>{t("help")}</h3><p>{t("helpText")}</p><button className="secondary-button" onClick={() => { setModal(null); fileInput.current?.click(); }}><Upload size={17}/>{t("import")}</button></section></div></Dialog>}
    {modal === "install" && <Dialog title={t("installAppTitle")} onClose={() => setModal(null)}><div className="install-app-dialog"><Smartphone size={38}/><p>{t(pwa.installed ? "appInstalledHint" : "installAppHint")}</p>{pwa.ios && <p className="install-instruction">{t("iosInstallHint")}</p>}{!pwa.installed && !pwa.canInstall && !pwa.ios && <p className="install-instruction">{t("browserInstallHint")}</p>}<small>{t("pwaOfflineHint")}</small></div><footer className="actions"><button className="secondary-button" onClick={() => setModal(null)}>{t("close")}</button>{pwa.canInstall && <button className="primary-button" disabled={working} onClick={() => { setWorking(true); void pwa.install().then(installed => { if (installed) setModal(null); }).finally(() => setWorking(false)); }}><Download size={17}/>{t("installNow")}</button>}</footer></Dialog>}
    {modal === "sync" && <SyncCenter owner={user?.id ?? null} online={ws.online} status={ws.status} projects={ws.projects} working={working} onClose={() => setModal(null)} onRetry={async () => { setWorking(true); try { const saved = await ws.flush(); if (saved) await ws.refresh(); } finally { setWorking(false); } }}/>} 
    {modal === "versions" && ws.board && <VersionHistory versions={ws.versions} loading={ws.versionLoading} working={working} onClose={() => { if (!working) setModal(null); }} onCheckpoint={async () => { setWorking(true); try { await ws.saveCheckpoint(t("saveCheckpoint")); } catch (err) { ws.setError(err instanceof Error ? err.message : t("error")); } finally { setWorking(false); } }} onRestore={async version => { setWorking(true); try { await ws.restoreVersion(version); setModal(null); } catch (err) { ws.setError(err instanceof Error ? err.message : t("error")); } finally { setWorking(false); } }}/>} 
    {modal === "ai" && ws.board && <AiPanel key={ws.board.id} projectId={ws.board.id} canUse={!!user} beforeGenerate={ws.flush} onClose={() => setModal(null)} onApply={(graph, mode) => { try { if (mode === "new") { const next = applyGraph(blankBoard(graph.title), graph); void ws.create(next.title, next).then(() => setModal(null)); } else { ws.change(applyGraph(ws.board!, graph)); setModal(null); } } catch { ws.setError(t("aiError")); setModal(null); } }}/>} 
    {commandOpen && <CommandPalette projects={ws.projects} onClose={() => setCommandOpen(false)} onOpenProject={project => void ws.open(project)} onCreateProject={() => askName("project")} onOpenFlashcards={openFlashcards} onOpenSettings={() => setModal("settings")} onImport={() => fileInput.current?.click()}/>} 
    {ws.conflict && <CloudConflictDialog conflict={ws.conflict} working={working} onResolve={async resolution => { setWorking(true); try { await ws.resolveConflict(resolution, t("copySuffix")); } finally { setWorking(false); } }}/>} 
  </div>;
}
function TitleInput({ value, label, onCommit }: { value: string; label: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input className="title-input" aria-label={label} value={draft} maxLength={120} onChange={e => setDraft(e.target.value)}
    onBlur={() => { if (draft.trim()) { if(draft.trim() !== value) onCommit(draft.trim()); } else setDraft(value); }}
    onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setDraft(value); }}/>;
}
