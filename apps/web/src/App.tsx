import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ProjectFolder } from "./lib/projectStore";
import { ArrowLeft, Cloud, Crown, Download, Focus, FolderPlus, History, LayoutGrid, MoreHorizontal, Redo2, RefreshCw, Save, Search, Share2, Smartphone, Sparkles, Undo2, Upload, X } from "lucide-react";
import WorkspaceHome from "./components/WorkspaceHome";
import Dialog from "./components/Dialog";
import FloatingTimer from "./components/FloatingTimer";
import ThemePicker from "./components/ThemePicker";
import CommandPalette from "./components/CommandPalette";
import TopbarProfile from "./components/TopbarProfile";
import CollaboratorPresence from "./components/CollaboratorPresence";
import AppSidebar, { type SidebarView } from "./components/AppSidebar";
import { LanguageProvider, useLanguage, useTheme, type MessageKey } from "./lib/i18n";
import { getCurrentUser, isSupabaseConfigured, signInWithGoogle, signOut, supabase } from "./lib/supabase";
import { acceptProjectInvitation } from "./lib/collaboration";
import { applyGraph, blankBoard, exportBoard, exportCanvasPngFile, exportCanvasSvgFile, importBoard } from "./lib/board";
import { useWorkspace } from "./hooks/useWorkspace";
import { usePwaInstall } from "./lib/pwa";
import { isToolbarPosition, TOOLBAR_POSITIONS, type ToolbarPosition } from "./lib/editorPreferences";
import { readToolbarToolVisibility, saveToolbarToolVisibility } from "./lib/toolbarPreferences";
import { SIDEBAR_DEFAULT_WIDTH, clampSidebarWidth } from "./lib/sidebarLayout";
import { getAccountPlan, getAdminStatus } from "./lib/api";
import { readFocusTimerVisibility, readMobileZoomControlsVisibility, saveFocusTimerVisibility, saveMobileZoomControlsVisibility } from "./lib/uiPreferences";
import { FREE_ACCOUNT_PLAN, type AccountPlan } from "./lib/account";
import { errorMessage } from "./lib/errors";
import { isIOSDevice } from "./lib/canvasInput";
import ShareInbox from "./components/ShareInbox";
import ToolbarCustomization from "./components/ToolbarCustomization";
import WebBackgroundControls from "./components/WebBackgroundControls";
import { readWebBackground, saveWebBackground, type WebBackground } from "./lib/webBackground";
const TOOLBAR_LABELS: Record<ToolbarPosition, MessageKey> = { top: "toolbarTop", bottom: "toolbarBottom", left: "toolbarLeft", right: "toolbarRight" };
const CanvasBoard = lazy(() => import("./components/CanvasBoard"));
const FolderManager = lazy(() => import("./components/FolderManager"));
const AiPanel = lazy(() => import("./components/AiPanel"));
const VersionHistory = lazy(() => import("./components/VersionHistory"));
const LearningHubPage = lazy(() => import("./components/LearningHubPage"));
const CloudConflictDialog = lazy(() => import("./components/CloudConflictDialog"));
const SyncCenter = lazy(() => import("./components/SyncCenter"));
const PlanUpgradeDialog = lazy(() => import("./components/PlanUpgradeDialog"));
const AdminDashboard = lazy(() => import("./components/AdminDashboard"));
const ShareDialog = lazy(() => import("./components/ShareDialog"));

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
      .catch(err => { if (alive) { setError(errorMessage(err, t("error"))); setLoading(false); } });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  if (loading) return <main className="auth-loading" role="status"><Sparkles/>{t("checking")}</main>;
  // Keying by identity prevents account A's boards/history from appearing for account B.
  return <Workspace key={user?.id ?? "guest"} user={user} authError={error}/>;
}
function Workspace({ user, authError }: { user: User | null; authError: string }) {
  const { t, language, setLanguage } = useLanguage(), { selectedTheme, setTheme } = useTheme(), ws = useWorkspace(user?.id ?? null), pwa = usePwaInstall();
  const iosDevice = isIOSDevice();
  const [modal, setModal] = useState<"project" | "folder" | "move" | "settings" | "versions" | "sync" | "install" | "plans" | "share" | null>(null);
  const [name, setName] = useState(""), [folder, setFolder] = useState(""), [filter, setFilter] = useState<string | null>(null), [folderAction, setFolderAction] = useState<{ folder: ProjectFolder; kind: "rename" | "delete" } | null>(null);
  const [recent, setRecent] = useState(false), [working, setWorking] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem("mindcanvas:sidebar-collapsed") === "true"; } catch { return false; } });
  const [sidebarWidth, setSidebarWidth] = useState(() => { try { const saved = Number(localStorage.getItem("mindcanvas:sidebar-width")); return Number.isFinite(saved) ? clampSidebarWidth(saved) : SIDEBAR_DEFAULT_WIDTH; } catch { return SIDEBAR_DEFAULT_WIDTH; } });
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileProjectMenuOpen, setMobileProjectMenuOpen] = useState(false);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(() => {
    try { return localStorage.getItem("mindcanvas:focus-mode") === "true"; } catch { return false; }
  });
  const [timerVisible, setTimerVisible] = useState(readFocusTimerVisibility);
  const [mobileZoomControlsVisible, setMobileZoomControlsVisible] = useState(readMobileZoomControlsVisibility);
  const [visibleToolIds, setVisibleToolIds] = useState(readToolbarToolVisibility);
  const [aiPanelMode, setAiPanelMode] = useState<"closed" | "open" | "minimized">("closed");
  const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition>(() => {
    try {
      const saved = localStorage.getItem("mindcanvas:toolbar-position");
      return isToolbarPosition(saved) ? saved : "top";
    } catch { return "top"; }
  });
  const [accountPlan, setAccountPlan] = useState<AccountPlan>(FREE_ACCOUNT_PLAN);
  const [webBackground, setWebBackground] = useState<WebBackground | null>(readWebBackground);
  const [isAdmin, setIsAdmin] = useState(false);
  const [inviteToken] = useState(() => {
    const queryToken = new URLSearchParams(window.location.search).get("invite");
    if (queryToken) return queryToken;
    try { return localStorage.getItem("mindcanvas:pending-invite") ?? ""; } catch { return ""; }
  });
  const [inviteState, setInviteState] = useState<"idle" | "waiting" | "accepting" | "accepted" | "error">(inviteToken ? "waiting" : "idle");
  const [inviteError, setInviteError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const message = ws.error || authError;
  const home = () => {
    setMobileProjectMenuOpen(false);
    setAiPanelMode("closed");
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    void ws.home(); setFilter(null); setRecent(false); setCanvasFullscreen(false);
  };
  const askName = (kind: "project" | "folder") => { setName(kind === "project" ? t("untitled") : ""); setModal(kind); };
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return; setWorking(true);
    try { if (modal === "project") await ws.create(name.trim(), undefined, filter && !filter.startsWith("__") ? filter : null); else await ws.newFolder(name.trim()); setModal(null); }
    finally { setWorking(false); }
  };
  const dropProjectInto = (e: React.DragEvent, folderId: string | null) => { e.preventDefault(); const id = e.dataTransfer.getData("text/mindcanvas-project"); const project = ws.projects.find(p => p.id === id); if (project && project.accessRole !== "viewer" && project.folderId !== folderId) void ws.manageProject(project, { folderId }); };
  const auth = async () => {
    setWorking(true);
    try {
      // Logging out must remain available when the current canvas cannot be
      // uploaded (for example because Supabase rejected its RLS policy). A
      // failed flush keeps the draft in the account-scoped local cache; it
      // must not trap the user in the current session.
      if (user) {
        await signOut();
        return;
      }
      if (!await ws.flush()) return;
      const result = await signInWithGoogle();
      if (result.error) throw result.error;
    } catch (err) { ws.setError(errorMessage(err, t("error"))); }
    finally { setWorking(false); }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try { const next = await importBoard(file); await ws.create(next.title, next); }
    catch { ws.setError(t("importError")); }
    if (fileInput.current) fileInput.current.value = "";
  };
  const accountName = user?.user_metadata.full_name ?? user?.user_metadata.name ?? user?.email ?? t("guest");
  const visible = ws.projects.filter(p => filter === "__trash" ? !!p.deletedAt : !p.deletedAt && (filter === "__favorites" ? p.favorite : filter === "__shared" ? p.shared : !filter || p.folderId === filter));
  const pageTitle = filter === "__trash" ? t("trash") : filter === "__favorites" ? t("favorites") : filter === "__shared" ? t("sharedWithMe") : filter ? ws.folders.find(f => f.id === filter)?.name ?? t("projects") : recent ? t("recent") : t("workspace");
  const currentProject = ws.board ? ws.projects.find(project => project.id === ws.board!.id) : undefined;
  const readOnly = currentProject?.accessRole === "viewer" || !!currentProject?.cloudOffline;
  // The mobile project sheet also needs to expose Share for local/guest
  // projects so the feature is not missing on Android. Authenticated cloud
  // projects still remain owner-only; guests receive the sign-in path.
  const mobileShareVisible = !readOnly && (currentProject?.accessRole === "owner" || !currentProject?.accessRole);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") { event.preventDefault(); setCommandOpen(value => !value); }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLocaleLowerCase() === "f") { event.preventDefault(); setFocusMode(value => !value); }
    };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => { try { localStorage.setItem("mindcanvas:sidebar-collapsed", String(sidebarCollapsed)); } catch {} }, [sidebarCollapsed]);
  useEffect(() => { try { localStorage.setItem("mindcanvas:sidebar-width", String(sidebarWidth)); } catch {} }, [sidebarWidth]);
  useEffect(() => { try { localStorage.setItem("mindcanvas:toolbar-position", toolbarPosition); } catch {} }, [toolbarPosition]);
  useEffect(() => { try { localStorage.setItem("mindcanvas:focus-mode", String(focusMode)); } catch {} }, [focusMode]);
  useEffect(() => { saveFocusTimerVisibility(timerVisible); }, [timerVisible]);
  useEffect(() => { saveMobileZoomControlsVisibility(mobileZoomControlsVisible); }, [mobileZoomControlsVisible]);
  useEffect(() => { saveToolbarToolVisibility(visibleToolIds); }, [visibleToolIds]);
  useEffect(() => { setAiPanelMode("closed"); }, [ws.board?.id]);
  useEffect(() => {
    let alive = true;
    setAccountPlan(FREE_ACCOUNT_PLAN); setIsAdmin(false);
    if (!user) return () => { alive = false; };
    void getAccountPlan().then(plan => { if (alive) setAccountPlan(plan); }).catch(() => {});
    void getAdminStatus().then(result => { if (alive) setIsAdmin(result.isAdmin); }).catch(() => {});
    return () => { alive = false; };
  }, [user]);
  useEffect(() => {
    if (!inviteToken || !user || inviteState === "accepted" || inviteState === "accepting") return;
    let alive = true;
    setInviteState("accepting");
    setInviteError("");
    void acceptProjectInvitation(inviteToken).then(result => {
      if (!alive) return;
      setInviteState("accepted");
      try { localStorage.removeItem("mindcanvas:pending-invite"); } catch {}
      setFilter(null);
      setRecent(false);
      window.history.replaceState({}, "", window.location.pathname);
      void ws.refresh();
      void ws.open({ id: result.projectId, title: result.title || t("sharedProject"), folderId: null, updatedAt: new Date().toISOString(), shared: true, accessRole: result.role });
    }).catch(err => {
      if (!alive) return;
      setInviteState("error");
      setInviteError(errorMessage(err, t("error")));
    });
    return () => { alive = false; };
  }, [inviteToken, user]);
  const resizeSidebar = (event: React.PointerEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return;
    event.preventDefault();
    const startX = event.clientX, startWidth = sidebarWidth;
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
    const move = (nextEvent: PointerEvent) => {
      setSidebarWidth(clampSidebarWidth(startWidth + nextEvent.clientX - startX));
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", stop);
  };
  const openView = (view: SidebarView) => { void ws.home(); if (view === "recent") { setFilter(null); setRecent(true); } else { setFilter(view); setRecent(false); } };
  const openFolder = (folderId: string) => { void ws.home(); setFilter(folderId); setRecent(false); };
  const openFlashcards = () => openView("__learning");
  const openAdmin = () => { void ws.home(); setFilter("__admin"); setRecent(false); };
  const openPlans = () => {
    setModal("plans");
    if (user) void getAccountPlan().then(setAccountPlan).catch(() => {});
  };
  useEffect(() => { saveWebBackground(webBackground); }, [webBackground]);

  useEffect(() => { setMobileProjectMenuOpen(false); }, [ws.board?.id, canvasFullscreen]);
  useEffect(() => {
    const syncFullscreen = () => { if (!document.fullscreenElement) setCanvasFullscreen(false); };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  useEffect(() => {
    if (!mobileProjectMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileProjectMenuOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileProjectMenuOpen]);
  const toggleCanvasFullscreen = () => {
    setMobileProjectMenuOpen(false);
    const next = !canvasFullscreen;
    setCanvasFullscreen(next);
    const mobile = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 620px)").matches;
    if (!mobile) return;
    if (next && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    if (!next && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };

  return <div className={`app-shell ${ws.board ? "canvas-open-mode" : ""} ${canvasFullscreen ? "canvas-fullscreen-mode" : ""} ${focusMode ? "focus-mode" : ""} ${iosDevice ? "ios-device" : ""} ${webBackground ? "web-background-active" : ""}`}>
    {webBackground && <div className="web-background-layer" aria-hidden="true">{webBackground.kind === "video" ? <video src={webBackground.src} muted autoPlay loop playsInline style={{ objectFit: webBackground.fit ?? "cover", objectPosition: webBackground.position ?? "center", opacity: webBackground.opacity ?? 1, filter: `blur(${webBackground.blur ?? 0}px) brightness(${webBackground.brightness ?? 1})` }}/> : <img src={webBackground.src} alt="" style={{ objectFit: webBackground.fit ?? "cover", objectPosition: webBackground.position ?? "center", opacity: webBackground.opacity ?? 1, filter: `blur(${webBackground.blur ?? 0}px) brightness(${webBackground.brightness ?? 1})` }}/>}<span style={{ background: webBackground.overlay ?? "#000000" }}/></div>}
    <AppSidebar projects={ws.projects} folders={ws.folders} boardOpen={!!ws.board} recent={recent} filter={filter} sidebarCollapsed={sidebarCollapsed} sidebarWidth={sidebarWidth} language={language} selectedTheme={selectedTheme} onHome={home} onOpenView={openView} onOpenFolder={openFolder} onOpenProject={project => void ws.open(project)} onDropProject={dropProjectInto} onNewFolder={() => askName("folder")} onFolderAction={folder => { setName(folder.name); setFolderAction({ folder, kind: "rename" }); }} onManageFolders={() => { void ws.home(); setFilter("__manager"); setRecent(false); }} onLanguageChange={setLanguage} onThemeChange={setTheme} canUsePremiumTheme={accountPlan.effectivePlanId !== "free"} onLockedTheme={openPlans} onSettings={() => setModal("settings")} onToggleCollapsed={() => setSidebarCollapsed(value => !value)} onResizeStart={resizeSidebar} onResetWidth={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}/>
    <main className={`main-area ${modal === "share" ? "share-open-mode" : ""}`}>
      <header className={`topbar ${ws.board ? "canvas-desktop-topbar" : ""}`}><div className="breadcrumbs"><button onClick={home}>{ws.board ? <ArrowLeft size={17}/> : <LayoutGrid size={17}/>} {t("workspace")}</button>{ws.board && <span>/ {ws.board.title}</span>}</div>
        <div className="actions"><button className="icon-button command-trigger" aria-label={t("commandPalette")} title={`${t("commandPalette")} · Ctrl/⌘ K`} onClick={() => setCommandOpen(true)}><Search size={18}/></button><button className={`icon-button focus-mode-toggle ${focusMode ? "active" : ""}`} aria-label={t(focusMode ? "exitFocusMode" : "focusMode")} aria-pressed={focusMode} title={`${t(focusMode ? "exitFocusMode" : "focusMode")} · Ctrl/⌘ Shift F`} onClick={() => setFocusMode(value => !value)}><Focus size={18}/></button>{ws.board && <><CollaboratorPresence projectId={ws.board.id} user={user} role={readOnly ? "viewer" : currentProject?.accessRole ?? "owner"}/><button role="status" className={`save-status ${ws.status}`} title={t("syncCenter")} onClick={() => setModal("sync")}>{t(ws.status)}{ws.pendingCount > 0 && <span>{ws.pendingCount}</span>}</button>{!readOnly && <><button className="icon-button" aria-label={t("save")} title={t("save")} onClick={() => void ws.saveCheckpoint(t("saveCheckpoint")).catch(err => ws.setError(errorMessage(err, t("error"))))}><Save size={18}/></button><button className="icon-button" aria-label={t("versionHistory")} title={t("versionHistory")} onClick={() => { setModal("versions"); void ws.loadVersions(); }}><History size={18}/></button><button className="icon-button" aria-label={t("undo")} title={t("undo")} disabled={!ws.canUndo} onClick={ws.undo}><Undo2 size={18}/></button><button className="icon-button" aria-label={t("redo")} title={t("redo")} disabled={!ws.canRedo} onClick={ws.redo}><Redo2 size={18}/></button></>}</>}
        {!ws.board && <button className="icon-button" aria-label={t("refresh")} onClick={() => void ws.refresh()}><RefreshCw size={18}/></button>}
        <div className="topbar-account-actions"><button type="button" className="topbar-plan-button" aria-label={`${t("currentPlan")}: ${accountPlan.name}`} title={t("planUpgradeTitle")} onClick={openPlans}><Crown size={15}/><span>{accountPlan.name}</span></button><TopbarProfile user={user} accountName={accountName} working={working} canSignIn={!!user || isSupabaseConfigured} onAuth={() => void auth()} isAdmin={isAdmin} onAdmin={openAdmin}/></div></div>
      </header>
      {ws.board && <header className="mobile-canvas-header">
        <button type="button" className="icon-button mobile-canvas-back" aria-label={t("workspace")} title={t("workspace")} onClick={home}><ArrowLeft size={20}/></button>
        <div className="mobile-canvas-title" title={ws.board.title}><strong>{ws.board.title}</strong><small>{currentProject?.cloudOffline ? t("sharedOffline") : readOnly ? t("viewerProject") : "Canvas"}</small></div>
        <button type="button" role="status" className={`mobile-save-status ${ws.status}`} aria-label={t(ws.status)} title={t(ws.status)} onClick={() => setModal("sync")}><Cloud size={19}/><span>{t(ws.status)}</span></button>
        <button type="button" className="icon-button mobile-project-menu-trigger" aria-label={t("projectActions")} aria-expanded={mobileProjectMenuOpen} title={t("projectActions")} onClick={() => setMobileProjectMenuOpen(value => !value)}><MoreHorizontal size={21}/></button>
      </header>}
      {pwa.updateReady && <div className="update-banner" role="status"><span>{t("updateReady")}</span><button onClick={pwa.applyUpdate}>{t("updateNow")}</button></div>}
      {message && <div className="error-banner" role="alert"><span>{t("error")}: {message}</span><button onClick={() => { ws.setError(""); void ws.flush().then(saved => { if (saved) void ws.refresh(); }); }}>{t("retry")}</button><button aria-label={t("close")} onClick={() => ws.setError("")}><X size={16}/></button></div>}
      {inviteState === "waiting" && <div className="invite-banner" role="status"><span><strong>{t("invitePendingTitle")}</strong><small>{t("invitePendingHint")}</small></span><button className="primary-button" onClick={() => void auth()}>{t("login")}</button></div>}
      {inviteState === "accepting" && <div className="invite-banner" role="status"><span><strong>{t("invitePendingTitle")}</strong><small>{t("acceptInviteLoading")}</small></span></div>}
      {inviteState === "accepted" && <div className="invite-banner success" role="status"><span><strong>{t("inviteAccepted")}</strong></span><button className="icon-button" aria-label={t("close")} onClick={() => setInviteState("idle")}><X size={16}/></button></div>}
      {inviteState === "error" && inviteError && <div className="invite-banner error" role="alert"><span><strong>{t("error")}</strong><small>{inviteError}</small></span><button className="icon-button" aria-label={t("close")} onClick={() => setInviteState("idle")}><X size={16}/></button></div>}
      {user && <ShareInbox onAccepted={(projectId, title, role) => { setFilter("__shared"); setRecent(false); void ws.refresh(); void ws.open({ id: projectId, title, folderId: null, updatedAt: new Date().toISOString(), shared: true, accessRole: role }); }} />}
      <Suspense fallback={<RouteLoading/>}>{modal === "share" && ws.board ? <ShareDialog projectId={ws.board.id} title={ws.board.title} isAuthenticated={!!user} onSignIn={isSupabaseConfigured ? () => void auth() : undefined} onClose={() => setModal(null)}/> : ws.board ? <>
        <div className="editor-heading canvas-editor-heading"><TitleInput key={ws.board.id} value={ws.board.title} label={t("rename")} disabled={readOnly} onCommit={title => ws.change({ ...ws.board!, title })}/><div className="actions">
          {!readOnly && <button className="secondary-button" onClick={() => { setFolder(ws.projects.find(p => p.id === ws.board!.id)?.folderId ?? ""); setModal("move"); }}><FolderPlus size={17}/>{t("move")}</button>}
          {ws.projects.find(project => project.id === ws.board!.id)?.accessRole === "owner" && <button className="secondary-button" onClick={() => setModal("share")}><Share2 size={17}/>{t("shareProject")}</button>}<button className="secondary-button" title={t("exportHint")} onClick={() => exportBoard(ws.board!)}><Download size={17}/>{t("export")}</button><button className="secondary-button" title={t("exportSvgHint")} onClick={() => exportCanvasSvgFile(ws.board!)}><Download size={17}/>{t("exportSvg")}</button><button className="secondary-button" title={t("exportPngHint")} onClick={() => void exportCanvasPngFile(ws.board!).catch(err => ws.setError(errorMessage(err, t("error"))))}><Download size={17}/>{t("exportPng")}</button>
          {!readOnly && <button className="primary-button" onClick={() => setAiPanelMode("open")}><Sparkles size={17}/>{t("ai")}</button>}</div></div>
        {readOnly && <div className="shared-readonly-banner">{currentProject?.cloudOffline ? t("sharedOffline") : t("viewerProject")}</div>}
        {mobileProjectMenuOpen && <div className="mobile-project-sheet-backdrop" role="presentation" onClick={() => setMobileProjectMenuOpen(false)}><aside className="mobile-project-sheet" role="dialog" aria-modal="true" aria-label={t("projectActions")} onClick={event => event.stopPropagation()}>
          <header><div><strong>{ws.board.title}</strong><small>{t(ws.status)}</small></div><button type="button" className="icon-button" aria-label={t("close")} onClick={() => setMobileProjectMenuOpen(false)}><X size={20}/></button></header>
          {!readOnly && <TitleInput key={`mobile-${ws.board.id}`} value={ws.board.title} label={t("rename")} onCommit={title => ws.change({ ...ws.board!, title })}/>}
          <div className="mobile-project-sheet-grid">
            {!readOnly && <button type="button" disabled={!ws.canUndo} onClick={() => { ws.undo(); setMobileProjectMenuOpen(false); }}><Undo2 size={19}/><span>{t("undo")}</span></button>}
            {!readOnly && <button type="button" disabled={!ws.canRedo} onClick={() => { ws.redo(); setMobileProjectMenuOpen(false); }}><Redo2 size={19}/><span>{t("redo")}</span></button>}
            {iosDevice && !readOnly && <button type="button" disabled={working} onClick={() => { setWorking(true); void ws.saveCheckpoint(t("saveCheckpoint")).catch(err => ws.setError(errorMessage(err, t("error")))).finally(() => { setWorking(false); setMobileProjectMenuOpen(false); }); }}><Save size={19}/><span>{working ? t("saving") : t("saveCheckpoint")}</span></button>}
            {!readOnly && <button type="button" onClick={() => { setMobileProjectMenuOpen(false); setModal("versions"); void ws.loadVersions(); }}><History size={19}/><span>{t("versionHistory")}</span></button>}
            {!readOnly && <button type="button" onClick={() => { setFolder(ws.projects.find(p => p.id === ws.board!.id)?.folderId ?? ""); setMobileProjectMenuOpen(false); setModal("move"); }}><FolderPlus size={19}/><span>{t("move")}</span></button>}
            {mobileShareVisible && <button type="button" onClick={() => { setMobileProjectMenuOpen(false); setModal("share"); }}><Share2 size={19}/><span>{t("shareProject")}</span></button>}
            <button type="button" onClick={() => { exportBoard(ws.board!); setMobileProjectMenuOpen(false); }}><Download size={19}/><span>{t("export")}</span></button>
            <button type="button" onClick={() => { exportCanvasSvgFile(ws.board!); setMobileProjectMenuOpen(false); }}><Download size={19}/><span>{t("exportSvg")}</span></button>
            <button type="button" onClick={() => { void exportCanvasPngFile(ws.board!).catch(err => ws.setError(errorMessage(err, t("error")))); setMobileProjectMenuOpen(false); }}><Download size={19}/><span>{t("exportPng")}</span></button>
            {!readOnly && <button type="button" className="mobile-project-ai-action" onClick={() => { setMobileProjectMenuOpen(false); setAiPanelMode("open"); }}><Sparkles size={19}/><span>{t("ai")}</span></button>}
          </div>
        </aside></div>}
        <CanvasBoard key={ws.board.id} board={ws.board} onChange={ws.change} onViewportChange={ws.navigate} onUndo={readOnly ? () => {} : ws.undo} onRedo={readOnly ? () => {} : ws.redo} canUndo={!readOnly && ws.canUndo} onSave={readOnly ? () => {} : () => void ws.flush()} canUseAi={!!user && !readOnly} canUseCanvasBackground={accountPlan.effectivePlanId === "pro" || accountPlan.effectivePlanId === "max"} onRequestCanvasBackgroundUpgrade={openPlans} readOnly={readOnly} isFullscreen={canvasFullscreen} onToggleFullscreen={toggleCanvasFullscreen} toolbarPosition={toolbarPosition} timerVisible={timerVisible} onToggleTimer={() => setTimerVisible(value => !value)} showMobileZoomControls={mobileZoomControlsVisible} visibleToolIds={visibleToolIds}/>
      </> : filter === "__admin" && isAdmin ? <AdminDashboard onBack={home}/> : filter === "__manager" ? <FolderManager projects={ws.projects} folders={ws.folders} onOpen={p=>void ws.open(p)} onManage={ws.manageProject} onDuplicate={ws.duplicateProject} onRenameFolder={ws.renameFolder} onDeleteFolder={ws.removeFolder} onCreateFolder={()=>askName("folder")}/> : filter === "__learning" || filter === "__flashcards" ? <LearningHubPage owner={user?.id ?? null} projects={ws.projects} accountPlan={accountPlan}/> : <WorkspaceHome projects={visible} title={pageTitle} loading={ws.loading} folders={ws.folders} onManage={ws.manageProject} onDuplicate={ws.duplicateProject} onLoadThumbnail={ws.loadThumbnail} trash={filter === "__trash"} onOpen={p => void ws.open(p)} onCreate={() => askName("project")} onImport={() => fileInput.current?.click()}/>}</Suspense>
      </main>
    <input ref={fileInput} hidden type="file" accept=".json,.mindcanvas" onChange={e => void importFile(e.target.files?.[0])}/>
    <FloatingTimer visible={timerVisible}/>
    {(modal === "project" || modal === "folder") && <Dialog title={t(modal === "project" ? "newProject" : "newFolder")} onClose={() => { if (!working) setModal(null); }}><form onSubmit={e => void create(e)}>
      <label>{t("name")}<input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} onFocus={e => e.target.select()}/></label>
      <footer className="actions"><button type="button" className="secondary-button" disabled={working} onClick={() => setModal(null)}>{t("cancel")}</button><button className="primary-button" disabled={!name.trim() || working}>{working ? t("saving") : t("create")}</button></footer></form></Dialog>}
    {folderAction?.kind === "rename" && <Dialog title={t("renameFolder")} onClose={() => setFolderAction(null)}><form onSubmit={e => { e.preventDefault(); const n = name.trim(); if (n) void ws.renameFolder(folderAction.folder, n).then(() => setFolderAction(null)); }}><label>{t("name")}<input autoFocus required maxLength={80} defaultValue={folderAction.folder.name} onChange={e => setName(e.target.value)}/></label><footer className="actions"><button type="button" className="secondary-button" onClick={() => setFolderAction(null)}>{t("cancel")}</button><button className="primary-button">{t("save")}</button></footer></form><button className="text-danger-button" onClick={() => setFolderAction({ ...folderAction, kind: "delete" })}>{t("deleteFolder")}</button></Dialog>}
    {folderAction?.kind === "delete" && <Dialog title={t("deleteFolder")} onClose={() => setFolderAction(null)}><p>{t("deleteFolderHint")}</p><footer className="actions"><button className="secondary-button" onClick={() => setFolderAction(null)}>{t("cancel")}</button><button className="danger-button" onClick={() => void ws.removeFolder(folderAction.folder).then(() => { if (filter === folderAction.folder.id) setFilter(null); setFolderAction(null); })}>{t("deleteFolder")}</button></footer></Dialog>}
    {modal === "move" && <Dialog title={t("move")} onClose={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); ws.move(folder || null); setModal(null); }}><label>{t("folders")}<select value={folder} onChange={e => setFolder(e.target.value)}><option value="">{t("noFolder")}</option>{ws.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><footer className="actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>{t("cancel")}</button><button className="primary-button">{t("save")}</button></footer></form></Dialog>}
    {modal === "settings" && <Dialog title={t("settings")} onClose={() => setModal(null)}><div className="settings-layout"><section className="settings-section"><label>{t("language")}<select value={language} onChange={e => setLanguage(e.target.value as "vi" | "en")}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("theme")}</strong><small>{t("themeChoose")}</small></div><ThemePicker theme={selectedTheme} onChange={setTheme} canUsePremium={accountPlan.effectivePlanId !== "free"} onLocked={openPlans}/></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("webBackground")}</strong><small>{t("webBackgroundHint")}</small></div><WebBackgroundControls background={webBackground} canUseUpload={accountPlan.effectivePlanId === "pro" || accountPlan.effectivePlanId === "max"} onLocked={openPlans} onChange={setWebBackground}/></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("toolbarPosition")}</strong><small>{t("toolbarPositionHint")}</small></div><div className="toolbar-position-options" role="radiogroup" aria-label={t("toolbarPosition")}>{TOOLBAR_POSITIONS.map(position => <button type="button" key={position} className={toolbarPosition === position ? "selected" : ""} aria-pressed={toolbarPosition === position} onClick={() => setToolbarPosition(position)}><span className={`toolbar-position-preview ${position}`} aria-hidden="true"/><span>{t(TOOLBAR_LABELS[position])}</span></button>)}</div></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("toolbarCustomize")}</strong><small>{t("toolbarCustomizeHint")}</small></div><ToolbarCustomization visibleToolIds={visibleToolIds} onChange={setVisibleToolIds}/></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("mobileZoomControls")}</strong><small>{t("mobileZoomControlsHint")}</small></div><label className="settings-toggle"><input type="checkbox" checked={mobileZoomControlsVisible} onChange={event => setMobileZoomControlsVisible(event.target.checked)}/><span>{t("showMobileZoomControls")}</span></label></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("focusTimerVisibility")}</strong><small>{t("focusTimerVisibilityHint")}</small></div><label className="settings-toggle"><input type="checkbox" checked={timerVisible} onChange={event => setTimerVisible(event.target.checked)}/><span>{t("showFocusTimer")}</span></label></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("installApp")}</strong><small>{t("pwaOfflineHint")}</small></div><button className="secondary-button" onClick={() => setModal("install")}><Smartphone size={17}/>{t(pwa.installed ? "appInstalled" : "installApp")}</button></section><section className="settings-section settings-help"><p>{t("accountHint")}</p><h3>{t("help")}</h3><p>{t("helpText")}</p><button className="secondary-button" onClick={() => { setModal(null); fileInput.current?.click(); }}><Upload size={17}/>{t("import")}</button></section></div></Dialog>}
    <Suspense fallback={null}>
    {modal === "plans" && <PlanUpgradeDialog currentPlan={accountPlan} onClose={() => setModal(null)}/>}
    {modal === "install" && <Dialog title={t("installAppTitle")} onClose={() => setModal(null)}><div className="install-app-dialog"><Smartphone size={38}/><p>{t(pwa.installed ? "appInstalledHint" : "installAppHint")}</p>{pwa.ios && <p className="install-instruction">{t("iosInstallHint")}</p>}{!pwa.installed && !pwa.canInstall && !pwa.ios && <p className="install-instruction">{t("browserInstallHint")}</p>}<small>{t("pwaOfflineHint")}</small></div><footer className="actions"><button className="secondary-button" onClick={() => setModal(null)}>{t("close")}</button>{pwa.canInstall && <button className="primary-button" disabled={working} onClick={() => { setWorking(true); void pwa.install().then(installed => { if (installed) setModal(null); }).finally(() => setWorking(false)); }}><Download size={17}/>{t("installNow")}</button>}</footer></Dialog>}
    {modal === "sync" && <SyncCenter owner={user?.id ?? null} online={ws.online} status={ws.status} projects={ws.projects} working={working} onClose={() => setModal(null)} onRetry={async () => { setWorking(true); try { const saved = await ws.flush(); if (saved) await ws.refresh(); } finally { setWorking(false); } }}/>}
    {modal === "versions" && ws.board && <VersionHistory versions={ws.versions} loading={ws.versionLoading} working={working} onClose={() => { if (!working) setModal(null); }} onCheckpoint={async () => { setWorking(true); try { await ws.saveCheckpoint(t("saveCheckpoint")); } catch (err) { ws.setError(errorMessage(err, t("error"))); } finally { setWorking(false); } }} onRestore={async version => { setWorking(true); try { await ws.restoreVersion(version); setModal(null); } catch (err) { ws.setError(errorMessage(err, t("error"))); } finally { setWorking(false); } }}/>}
    {aiPanelMode !== "closed" && ws.board && <AiPanel
      key={ws.board.id}
      projectId={ws.board.id}
      canUse={!!user}
      canUseUnlimitedMindMap={accountPlan.effectivePlanId === "max"}
      supportContext={{ email: user?.email ?? "", plan: accountPlan.name, projectId: ws.board.id }}
      beforeGenerate={ws.flush}
      minimized={aiPanelMode === "minimized"}
      onMinimize={() => setAiPanelMode("minimized")}
      onRestore={() => setAiPanelMode("open")}
      onClose={() => setAiPanelMode("closed")}
      onApply={(graph, mode) => {
        try {
          if (mode === "new") {
            const next = applyGraph(blankBoard(graph.title), graph);
            void ws.create(next.title, next).then(() => setAiPanelMode("closed"));
          } else {
            ws.change(applyGraph(ws.board!, graph)); setAiPanelMode("closed");
          }
        } catch { ws.setError(t("aiError")); setAiPanelMode("closed"); }
      }}/>} {/* Keep this mounted while minimized so its request survives. */}
    {commandOpen && <CommandPalette projects={ws.projects} onClose={() => setCommandOpen(false)} onOpenProject={project => void ws.open(project)} onCreateProject={() => askName("project")} onOpenFlashcards={openFlashcards} onOpenSettings={() => setModal("settings")} onImport={() => fileInput.current?.click()}/>}
    {ws.conflict && <CloudConflictDialog conflict={ws.conflict} working={working} onResolve={async resolution => { setWorking(true); try { await ws.resolveConflict(resolution, t("copySuffix")); } finally { setWorking(false); } }}/>}
    </Suspense>
  </div>;
}
function RouteLoading() {
  const { t } = useLanguage();
  return <div className="route-loading" role="status"><Sparkles size={18}/><span>{t("loading")}</span></div>;
}
function TitleInput({ value, label, onCommit, disabled = false }: { value: string; label: string; onCommit: (value: string) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input className="title-input" aria-label={label} disabled={disabled} value={draft} maxLength={120} onChange={e => setDraft(e.target.value)}
    onBlur={() => { if (draft.trim()) { if(draft.trim() !== value) onCommit(draft.trim()); } else setDraft(value); }}
    onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setDraft(value); }}/>;
}
