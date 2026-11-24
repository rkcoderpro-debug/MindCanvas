import { restoreWorkspaceShareSignIn, workspaceShareToken } from "./lib/workspaceShareLinks";
import { ensureCanvasAttachment, ensureCanvasAttachments } from "./lib/shareAttachments";
import { FOLDER_LIBRARY, FOLDER_ROOT, fileIdFromUrl, folderNavigationFromUrl, writeFolderRoute } from "./lib/folderLinks";
import { newA4Layout } from "./lib/a4Canvas";
import { BackButton, PageChromeProvider, ShellBack } from "./components/PageNavigation";
import { enterLearningSpace, leaveLearningSpace, learningTabFromUrl, openLearningTool, type HubTab } from "./lib/learningNavigation";
import { MusicProvider, MusicIsland } from "./components/MusicPlayer";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ProjectFolder } from "./lib/projectStore";
import { CircleHelp, Cloud, Crown, Download, Focus, FolderPlus, Gift, History, Link2, MoreHorizontal, Redo2, RefreshCw, Save, Search, Share2, Smartphone, Sparkles, Undo2, X } from "lucide-react";
import WorkspaceHome from "./components/WorkspaceHome";
import CanvasProjectActions, { type CanvasProjectAction } from "./components/CanvasProjectActions";
import Dialog from "./components/Dialog";
import FloatingTimer from "./components/FloatingTimer";
import PetCompanion from "./components/PetCompanion";
import PlusTrialPopup from "./components/PlusTrialPopup";
import SettingsDialog from "./components/SettingsDialog";
import CommandPalette from "./components/CommandPalette";
import TopbarProfile from "./components/TopbarProfile";
import CollaboratorPresence from "./components/CollaboratorPresence";
import AppSidebar, { type SidebarView } from "./components/AppSidebar";
import { LanguageProvider, useLanguage, useTheme } from "./lib/i18n";
import { getCurrentSession, hasRememberedAuthUser, isSupabaseConfigured, signInWithGoogle, signOut, supabase } from "./lib/supabase";
import { acceptProjectInvitation } from "./lib/collaboration";
import { acceptLearning } from "./lib/learningShare";
import { respondConnectionInvitation } from "./lib/connections";
import { applyGraph, blankBoard, exportBoard, exportCanvasPngFile, exportCanvasSvgFile, importBoard } from "./lib/board";
import { useWorkspace } from "./hooks/useWorkspace";
import { useWorkspaceFiles } from "./hooks/useWorkspaceFiles";
import { useCanvasLinks } from "./hooks/useCanvasLinks";
import { usePersonalProfile } from "./hooks/usePersonalProfile";
import { closeProfileRoute, isProfileRoute, openProfileRoute, PROFILE_ROUTE_EVENT } from "./lib/profileNavigation";
import { canvasPermalink } from "./lib/canvasLinks";
import { usePwaInstall } from "./lib/pwa";
import { isToolbarPosition, type ToolbarPosition } from "./lib/editorPreferences";
import { readToolbarToolVisibility, saveToolbarToolVisibility } from "./lib/toolbarPreferences";
import { SIDEBAR_DEFAULT_WIDTH, clampSidebarWidth } from "./lib/sidebarLayout";
import { getAccountPlan, getAdminStatus } from "./lib/api";
import { readFocusTimerVisibility, readMobileZoomControlsVisibility, readStickyTopbar, saveFocusTimerVisibility, saveMobileZoomControlsVisibility, saveStickyTopbar } from "./lib/uiPreferences";
import { FREE_ACCOUNT_PLAN, type AccountPlan } from "./lib/account";
import { activatePlusTrial, getPlusTrial, type PlusTrialState } from "./lib/plusTrial";
import { errorMessage } from "./lib/errors";
import { isIOSDevice } from "./lib/canvasInput";
import ShareInbox from "./components/ShareInbox";
import AutoResolveCloudConflict from "./components/AutoResolveCloudConflict";
import { readWebBackground, saveWebBackground, type WebBackground } from "./lib/webBackground";
import { listDocuments, saveDocument, type UploadedDocument } from "./lib/documentStore";
import FeatureGuideManager from "./components/FeatureGuideManager";
import PageHelpPanel from "./components/PageHelpPanel";
import NotificationBell from "./components/NotificationBell";
import type { ActivityNotification } from "./lib/activityNotifications";
import { emitGuideAction, GUIDE_PROGRESS_EVENT, GUIDE_REQUEST_EVENT, pageHelpIsUnlocked, readGuideProgress, type PageHelpScope } from "./lib/featureGuides";
const CanvasBoard = lazy(() => import("./components/CanvasBoard"));
const A4CanvasEditor = lazy(() => import("./components/A4CanvasEditor"));
const WorkspaceFolderArea = lazy(() => import("./components/WorkspaceFolderArea"));
const FolderProjectList = lazy(() => import("./components/FolderProjectList"));
const WorkspaceSharedPage = lazy(() => import("./components/WorkspaceSharedPage"));
const WorkspaceSharedInbox = lazy(() => import("./components/WorkspaceSharedInbox"));
const FolderManager = lazy(() => import("./components/FolderManager"));
const AiPanel = lazy(() => import("./components/AiPanel"));
const VersionHistory = lazy(() => import("./components/VersionHistory"));
const LearningHubPage = lazy(() => import("./components/LearningHubPage"));
const SyncCenter = lazy(() => import("./components/SyncCenter"));
const PlanUpgradeDialog = lazy(() => import("./components/PlanUpgradeDialog"));
const AdminDashboard = lazy(() => import("./components/AdminDashboard"));
const PersonalProfilePage = lazy(() => import("./components/PersonalProfilePage"));
const ShareDialog = lazy(() => import("./components/ShareDialog"));
const FeatureGuidePage = lazy(() => import("./components/FeatureGuidePage"));

export default function App() { return <LanguageProvider><AuthenticatedApp/></LanguageProvider>; }
function AuthenticatedApp() {
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(null), [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState("");
  const [shareToken,setShareToken] = useState(() => workspaceShareToken());
  useEffect(()=>{
    if(!loading)restoreWorkspaceShareSignIn();
    const sync=()=>setShareToken(workspaceShareToken());
    sync();window.addEventListener("hashchange",sync);window.addEventListener("popstate",sync);
    return()=>{window.removeEventListener("hashchange",sync);window.removeEventListener("popstate",sync);};
  },[loading,user?.id]);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    let initialEventSeen = false;
    let sessionChecked = false;
    let settled = false;
    const hadPreviousSession = hasRememberedAuthUser();
    const settle = () => {
      if (!alive || settled || !initialEventSeen || !sessionChecked) return;
      settled = true;
      setLoading(false);
    };
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (session?.user) {
        setUser(session.user);
        setError("");
      } else if (event === "INITIAL_SESSION" || event === "SIGNED_OUT") {
        setUser(null);
        if (event === "INITIAL_SESSION" && hadPreviousSession) {
          setError("Phiên đăng nhập trước đó chưa được khôi phục sau khi tải lại. Hãy đăng nhập lại; dữ liệu Lab trên thiết bị vẫn được giữ.");
        }
      }
      if (event === "INITIAL_SESSION") initialEventSeen = true;
      settle();
    });
    // Supabase emits INITIAL_SESSION while it is restoring local storage, but
    // an early null event can race with getSession in some Chromium profiles.
    // Wait for both observations before rendering the Guest workspace so a
    // valid account does not appear logged out for one refresh.
    void getCurrentSession().then(session => {
      if (alive && session?.user) { setUser(session.user); setError(""); }
      else if (alive && hadPreviousSession) setError("Phiên đăng nhập trước đó chưa được khôi phục. Hãy đăng nhập lại; dữ liệu Lab trên thiết bị vẫn được giữ.");
    }).catch(err => {
      if (alive) setError(errorMessage(err, t("error")));
    }).finally(() => {
      if (!alive) return;
      sessionChecked = true;
      settle();
    });
    const timeout = window.setTimeout(() => {
      if (!alive || settled) return;
      settled = true;
      setLoading(false);
      setError("Không thể khôi phục phiên đăng nhập sau khi tải lại. Hãy thử đăng nhập lại; dữ liệu Lab trên thiết bị vẫn được giữ.");
    }, 10_000);
    return () => { alive = false; window.clearTimeout(timeout); data.subscription.unsubscribe(); };
  }, []);
  if (loading) return <main className="auth-loading" role="status"><Sparkles/>{t("checking")}</main>;
  if(shareToken)return <Suspense fallback={<RouteLoading/>}><WorkspaceSharedPage key={shareToken} token={shareToken}
    signedIn={!!user} loginError={error} onSignIn={()=>{void signInWithGoogle().then(result=>{
      if(result.error)setError(result.error.message);
    }).catch(err=>setError(errorMessage(err,t("error"))));}}/></Suspense>;
  // Keying by identity prevents account A's boards/history from appearing for account B.
  return <MusicProvider key={user?.id ?? "guest"} owner={user?.id ?? null}><Workspace user={user} authError={error} onClearAuthError={() => setError("")}/></MusicProvider>;
}
function filterFromLocation() {
  if (learningTabFromUrl()) return "__learning";
  const route = folderNavigationFromUrl();
  return route === FOLDER_ROOT ? "__manager" : route === FOLDER_LIBRARY ? "__documents" : route;
}

function Workspace({ user, authError, onClearAuthError }: { user: User | null; authError: string; onClearAuthError: () => void }) {
  const { t, language, setLanguage } = useLanguage(), { selectedTheme, setTheme } = useTheme(), ws = useWorkspace(user?.id ?? null), pwa = usePwaInstall();
  const iosDevice = isIOSDevice();
  const personalProfile = usePersonalProfile(user?.id ?? null);
  const [profileOpen, setProfileOpen] = useState(() => isProfileRoute());
  useEffect(() => {
    const sync = () => setProfileOpen(isProfileRoute());
    window.addEventListener(PROFILE_ROUTE_EVENT, sync); window.addEventListener("popstate", sync);
    return () => { window.removeEventListener(PROFILE_ROUTE_EVENT, sync); window.removeEventListener("popstate", sync); };
  }, []);
  const [modal, setModal] = useState<"project" | "folder" | "move" | "settings" | "versions" | "sync" | "install" | "plans" | "share" | null>(null);
  const [notificationDestination, setNotificationDestination] = useState<{ tab: "connections" | "shared" | "classrooms"; peerId?: string; classId?: string; nonce: number } | null>(null);
  const [name, setName] = useState(""), [folder, setFolder] = useState(""), [filter, setFilter] = useState<string | null>(filterFromLocation), [folderAction, setFolderAction] = useState<{ folder: ProjectFolder; kind: "rename" | "delete" } | null>(null);
  const [recent, setRecent] = useState(false), [working, setWorking] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem("mindcanvas:sidebar-collapsed") === "true"; } catch { return false; } });
  const [petVisible, setPetVisible] = useState(() => { try { return localStorage.getItem("mindcanvas:pet-visible") !== "false"; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem("mindcanvas:pet-visible", String(petVisible)); } catch {} }, [petVisible]);
  const [sidebarWidth, setSidebarWidth] = useState(() => { try { const raw = localStorage.getItem("mindcanvas:sidebar-width"); const saved = raw?.trim() ? Number(raw) : NaN; return Number.isFinite(saved) ? clampSidebarWidth(saved) : SIDEBAR_DEFAULT_WIDTH; } catch { return SIDEBAR_DEFAULT_WIDTH; } });
  const [commandOpen, setCommandOpen] = useState(false);
  const showQuickActions = useCallback(() => setCommandOpen(true), []);
  const [mobileProjectMenuOpen, setMobileProjectMenuOpen] = useState(false);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(() => {
    try { return localStorage.getItem("mindcanvas:focus-mode") === "true"; } catch { return false; }
  });
  const [timerVisible, setTimerVisible] = useState(readFocusTimerVisibility);
  const [stickyTopbar, setStickyTopbar] = useState(readStickyTopbar);
  const changeStickyTopbar = (pinned: boolean) => { setStickyTopbar(pinned); saveStickyTopbar(pinned); };
  const [mobileZoomControlsVisible, setMobileZoomControlsVisible] = useState(readMobileZoomControlsVisibility);
  const [visibleToolIds, setVisibleToolIds] = useState(readToolbarToolVisibility);
  const [aiPanelMode, setAiPanelMode] = useState<"unopened" | "closed" | "open" | "minimized">("unopened");
  const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition>(() => {
    try {
      const saved = localStorage.getItem("mindcanvas:toolbar-position");
      return isToolbarPosition(saved) ? saved : "top";
    } catch { return "top"; }
  });
  const [accountPlan, setAccountPlan] = useState<AccountPlan>(FREE_ACCOUNT_PLAN);
  const [plusTrial, setPlusTrial] = useState<PlusTrialState | null>(null);
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialWorking, setTrialWorking] = useState(false);
  const [trialActivated, setTrialActivated] = useState(false);
  const [trialError, setTrialError] = useState("");
  const [webBackground, setWebBackground] = useState<WebBackground | null>(readWebBackground);
  const [isAdmin, setIsAdmin] = useState(false);
  const [inviteToken] = useState(() => {
    const queryToken = new URLSearchParams(window.location.search).get("invite");
    if (queryToken) return queryToken;
    try { return localStorage.getItem("mindcanvas:pending-invite") ?? ""; } catch { return ""; }
  });
  const [inviteState, setInviteState] = useState<"idle" | "waiting" | "accepting" | "accepted" | "error">(inviteToken ? "waiting" : "idle");
  const [inviteError, setInviteError] = useState("");
  const [learningInvite] = useState(() => new URLSearchParams(window.location.search).get("learning_invite") || (() => { try { return localStorage.getItem("mindcanvas:pending-learning-invite") ?? ""; } catch { return ""; } })());
  const [learningInviteState, setLearningInviteState] = useState<"waiting" | "accepting" | "accepted" | "error">("waiting");
  const [learningInviteError, setLearningInviteError] = useState("");
  const [connectionInvite] = useState(() => new URLSearchParams(window.location.search).get("connection_invite") || (() => { try { return localStorage.getItem("mindcanvas:pending-connection-invite") ?? ""; } catch { return ""; } })());
  const [connectionInviteState, setConnectionInviteState] = useState<"waiting" | "accepting" | "accepted" | "error">("waiting");
  const [connectionInviteError, setConnectionInviteError] = useState("");
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [activeFileId,setActiveFileId] = useState<string | null>(() => fileIdFromUrl());
  const [browseFiles,setBrowseFiles] = useState(false);
  const folderView = filter === "__manager" || (!!filter && !filter.startsWith("__"));
  const workspaceFiles = useWorkspaceFiles(user?.id ?? null, browseFiles || folderView);
  // File bookmarks use the ID alone, so they follow a file when it moves.
  const linkedFile = workspaceFiles.files.find(file => file.id === activeFileId);
  const currentFolderId = activeFileId ? linkedFile?.folderId ?? null : folderView && filter !== "__manager" ? filter : null;
  const [manualGuideId, setManualGuideId] = useState<string | null>(null);
  const [guideProgress, setGuideProgress] = useState(() => readGuideProgress(user?.id ?? null));
  const [pageHelpOpen, setPageHelpOpen] = useState(false);
  const [copiedCanvas, setCopiedCanvas] = useState<{ id: string; ok: boolean } | null>(null);
  const canvasLinks = useCanvasLinks({
    authenticated: !!user,
    blockedByInvite: inviteState === "waiting" || inviteState === "accepting" ||
      (!!learningInvite && learningInviteState === "waiting") || (!!connectionInvite && connectionInviteState === "waiting"),
    activeId: ws.board?.id ?? null,
    loading: ws.loading,
    projects: ws.projects,
    open: ws.open,
    home: ws.home,
    resetView: canvas => {
      const learning = !canvas && learningTabFromUrl();
      if (learning && ["__learning", "__flashcards", "__lab"].includes(filter ?? "") && !ws.board) return;
      setFilter(filterFromLocation()); setActiveFileId(canvas ? null : fileIdFromUrl()); setRecent(false); setNotificationDestination(null);
      setMobileProjectMenuOpen(false); setCanvasFullscreen(false); setModal(null);
    },
  });
  const copyCanvasLink = async () => {
    const id = ws.board?.id; if (!id) return;
    try {
      await navigator.clipboard.writeText(canvasPermalink(id));
      setCopiedCanvas({ id, ok: true });
    } catch { setCopiedCanvas({ id, ok: false }); }
  };
  const fileInput = useRef<HTMLInputElement>(null);
  // Sync conflicts are reported in the small save badge and Sync Center.
  // They must not open a full-width banner after every autosave.
  const message = ws.conflict ? authError : ws.error || authError;
  useEffect(() => { let alive = true; void listDocuments(user?.id ?? null).then(rows => { if (alive) setDocuments(rows); }).catch(err => ws.setError(errorMessage(err, "Không thể mở thư viện tài liệu."))); return () => { alive = false; }; }, [user?.id]);
  useEffect(() => {
    const sync = () => setGuideProgress(readGuideProgress(user?.id ?? null));
    sync();
    window.addEventListener(GUIDE_PROGRESS_EVENT, sync);
    return () => window.removeEventListener(GUIDE_PROGRESS_EVENT, sync);
  }, [user?.id]);
  const saveCanvasDocument = async (file: { name: string; mimeType: string; kind: UploadedDocument["kind"]; size: number; dataUrl: string }) => {
    try { const project = ws.projects.find(item => item.id === ws.board?.id); const saved = await saveDocument(user?.id ?? null, { ...file, folderId: project?.folderId ?? null }); setDocuments(rows => [saved, ...rows.filter(item => item.id !== saved.id)]); return saved; }
    catch (err) { ws.setError(errorMessage(err, "Không thể lưu tài liệu vào thư viện.")); return undefined; }
  };
  const home = () => {
    canvasLinks.leaveUnopenedLink();
    leaveLearningSpace();
    writeFolderRoute(null);
    setActiveFileId(null);
    setMobileProjectMenuOpen(false);
    setAiPanelMode("closed");
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    void ws.home(); setFilter(null); setRecent(false); setCanvasFullscreen(false); setNotificationDestination(null);
  };
  const [projectType, setProjectType] = useState<"infinite" | "a4">("infinite");
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const askName = (kind: "project" | "folder", parentId: string | null = null) => { if (kind === "project") setProjectType("infinite"); else setNewFolderParent(parentId); setName(kind === "project" ? t("untitled") : ""); setModal(kind); };
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return; setWorking(true);
    try {
      if (modal === "project") {
        const created = await ws.create(name.trim(), projectType === "a4" ? { ...blankBoard(name.trim()), a4: newA4Layout() } : undefined, currentFolderId);
        emitGuideAction("canvas:practice-created", { projectId: created.id, title: created.title });
        emitGuideAction("workspace:project-created", { projectId: created.id, title: created.title });
      } else {
        const created = await ws.newFolder(name.trim(),newFolderParent);
        emitGuideAction("folder:created", { folderId: created.id, name: created.name });
      }
      setModal(null);
    } catch (err) {
      if ((err as { message?: string })?.message === "WORKSPACE_FOLDER_PARENT") ws.setError(language === "vi" ? "Không tìm thấy thư mục cha hoặc đã đạt độ sâu tối đa." : "The parent folder is unavailable or the nesting limit was reached.");
    } finally { setWorking(false); }
  };
  const decideCanvasPractice = async (decision: "keep" | "trash", projectId: string) => {
    const project = ws.projects.find(item => item.id === projectId);
    if (!project) return;
    if (!await ws.flush(projectId)) throw new Error(t("saveBeforeLeave"));
    if (decision === "trash") {
      await ws.manageProject(project, { deletedAt: new Date().toISOString() });
      if (ws.board?.id === projectId) home();
    }
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
    try { const next = await importBoard(file); await ws.create(next.title, next, currentFolderId); }
    catch { ws.setError(t("importError")); }
    if (fileInput.current) fileInput.current.value = "";
  };
  const accountName = personalProfile.profile?.display_name ?? user?.user_metadata.full_name ?? user?.user_metadata.name ?? user?.email ?? t("guest");
  const selectedFolder = ws.folders.find(f => f.id === currentFolderId);
  const folderUnavailable = !!currentFolderId && !activeFileId && !selectedFolder;
  const visible = ws.projects.filter(p => filter === "__trash" ? !!p.deletedAt : !p.deletedAt && (filter === "__favorites" ? p.favorite : filter === "__shared" ? p.shared : !filter || p.folderId === filter));
  const pageTitle = filter === "__trash" ? t("trash") : filter === "__favorites" ? t("favorites") : filter === "__shared" ? t("sharedWithMe") : filter ? ws.folders.find(f => f.id === filter)?.name ?? t("projects") : recent ? t("recent") : t("workspace");
  const currentProject = ws.board ? ws.projects.find(project => project.id === ws.board!.id) : undefined;
  const isA4 = !!ws.board?.a4;
  const CanvasEditor = isA4 ? A4CanvasEditor : CanvasBoard;
  const readOnly = currentProject?.accessRole === "viewer" || !!currentProject?.cloudOffline;
  // The mobile project sheet also needs to expose Share for local/guest
  // projects so the feature is not missing on Android. Authenticated cloud
  // projects still remain owner-only; guests receive the sign-in path.
  const mobileShareVisible = !readOnly && (currentProject?.accessRole === "owner" || !currentProject?.accessRole);
  const canvasProjectActions: CanvasProjectAction[] = [];
  if (ws.board) {
    const currentBoard = ws.board;
    if (!readOnly) canvasProjectActions.push({ id: "move", label: t("move"), icon: <FolderPlus size={17}/>,
      run: () => { setFolder(currentProject?.folderId ?? ""); setModal("move"); } });
    if (currentProject?.accessRole === "owner") canvasProjectActions.push({ id: "share", label: t("shareProject"), icon: <Share2 size={17}/>,
      run: () => setModal("share") });
    canvasProjectActions.push(
      { id: "link", label: t(copiedCanvas?.id === currentBoard.id && copiedCanvas.ok ? "shareCopied" : "copyCanvasLink"), icon: <Link2 size={17}/>,
        title: t(!user || currentProject?.revision === undefined ? "canvasLinkLocalHint" : "copyCanvasLink"), run: () => void copyCanvasLink() },
      { id: "export", label: t("export"), icon: <Download size={17}/>, title: t("exportHint"), run: () => exportBoard(currentBoard) },
    );
  }

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k" && !isProfileRoute()) { event.preventDefault(); setCommandOpen(value => !value); }
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
  useEffect(() => { setAiPanelMode("unopened"); }, [ws.board?.id]);
  useEffect(() => {
    let alive = true;
    setAccountPlan(FREE_ACCOUNT_PLAN); setIsAdmin(false); setPlusTrial(null); setTrialOpen(false); setTrialActivated(false); setTrialError("");
    if (!user) return () => { alive = false; };
    void getAccountPlan().then(plan => { if (alive) setAccountPlan(plan); }).catch(() => {});
    void getAdminStatus().then(result => { if (alive) setIsAdmin(result.isAdmin); }).catch(() => {});
    void getPlusTrial().then(trial => {
      if (!alive) return;
      setPlusTrial(trial);
      if (trial.eligible && !trial.consumed && !trial.active) {
        let dismissed = false;
        try { dismissed = sessionStorage.getItem(`mindcanvas:plus-trial-dismissed:${user.id}`) === "true"; } catch {}
        if (!dismissed) setTrialOpen(true);
      }
    }).catch(() => { /* v5.3 migration may not be deployed yet; account remains usable */ });
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
      void ws.refresh(true);
      void ws.open({ id: result.projectId, title: result.title || t("sharedProject"), folderId: null, updatedAt: new Date().toISOString(), shared: true, accessRole: result.role });
    }).catch(err => {
      if (!alive) return;
      setInviteState("error");
      setInviteError(errorMessage(err, t("error")));
    });
    return () => { alive = false; };
  }, [inviteToken, user]);
  useEffect(() => {
    if (!learningInvite || !user || learningInviteState !== "waiting") return;
    let alive = true;
    setLearningInviteState("accepting");
    void acceptLearning(learningInvite).then(() => {
      if (!alive) return;
      try { localStorage.removeItem("mindcanvas:pending-learning-invite"); } catch {}
      window.history.replaceState({}, "", window.location.pathname);
      void ws.home(); setFilter("__learning"); setRecent(false); setLearningInviteState("accepted");
    }).catch(e => { if (alive) { setLearningInviteError(e instanceof Error ? e.message : "Không thể nhận lời mời."); setLearningInviteState("error"); } });
    return () => { alive = false; };
  }, [learningInvite, user]);
  useEffect(() => {
    if (!connectionInvite || !user || connectionInviteState !== "waiting") return;
    let alive = true;
    setConnectionInviteState("accepting");
    void respondConnectionInvitation(connectionInvite, "accepted").then(() => {
      if (!alive) return;
      try { localStorage.removeItem("mindcanvas:pending-connection-invite"); } catch {}
      window.history.replaceState({}, "", window.location.pathname);
      void ws.home(); setFilter("__learning"); setRecent(false); setConnectionInviteState("accepted");
    }).catch(cause => { if (alive) { setConnectionInviteError(cause instanceof Error ? cause.message : "Không thể nhận lời mời kết nối."); setConnectionInviteState("error"); } });
    return () => { alive = false; };
  }, [connectionInvite, user]);
  const closeTrial = () => {
    if (trialWorking) return;
    setTrialOpen(false);
    if (!trialActivated && user) { try { sessionStorage.setItem(`mindcanvas:plus-trial-dismissed:${user.id}`, "true"); } catch {} }
  };
  const startTrial = async () => {
    if (!user || trialWorking) return;
    setTrialWorking(true); setTrialError("");
    try {
      const trial = await activatePlusTrial();
      setPlusTrial(trial); setTrialActivated(true); setTrialOpen(true);
      const plan = await getAccountPlan();
      setAccountPlan(plan);
      try { sessionStorage.removeItem(`mindcanvas:plus-trial-dismissed:${user.id}`); } catch {}
    } catch (err) { setTrialError(errorMessage(err, "Không thể kích hoạt Plus miễn phí.")); }
    finally { setTrialWorking(false); }
  };
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
  const openView = (view: SidebarView) => { canvasLinks.leaveUnopenedLink(); setActiveFileId(null); writeFolderRoute(null,"replace"); if (view === "__learning" || view === "__flashcards" || view === "__lab") enterLearningSpace(view === "__lab" ? "lab" : view === "__flashcards" ? "flashcards" : "overview"); else leaveLearningSpace(); void ws.home(); setNotificationDestination(null); if (view === "recent") { setFilter(null); setRecent(true); } else { setFilter(view); setRecent(false); } };
  const openNotification = (item: ActivityNotification) => {
    setActiveFileId(null); writeFolderRoute(null,"replace"); void ws.home(); setRecent(false);
    if (item.target === "workspace") { setFilter(null); setNotificationDestination(null); return; }
    const tab = item.target;
    setFilter("__learning");
    setNotificationDestination(previous => ({ tab, peerId:tab === "connections" && item.kind === "message" ? item.actor_id : undefined,
      classId:tab === "classrooms" ? item.target_id ?? undefined : undefined, nonce:(previous?.nonce ?? 0) + 1 }));
  };
  const goToFolder = (route: string, mode: "push" | "replace" = "push") => {
    canvasLinks.leaveUnopenedLink();
    writeFolderRoute(route,mode);
    setActiveFileId(null);
    void ws.home();
    setFilter(route === FOLDER_ROOT ? "__manager" : route === FOLDER_LIBRARY ? "__documents" : route);
    setRecent(false); setNotificationDestination(null);
  };
  const openFolder = (id: string) => goToFolder(id);
  const manageFolders = () => goToFolder(FOLDER_ROOT);
  const openDocumentLibrary = () => { goToFolder(FOLDER_LIBRARY); emitGuideAction("documents:library"); };
  const openWorkspaceFile = (id: string | null) => {
    if (!id) {
      if (activeFileId && window.history.state?.mindcanvasFileEntry === activeFileId) window.history.back();
      else goToFolder(selectedFolder?.id ?? FOLDER_ROOT,"replace");
      return;
    }
    canvasLinks.leaveUnopenedLink();
    writeFolderRoute(FOLDER_ROOT,"push",id);
    setActiveFileId(id);
    setFilter("__manager"); setRecent(false); setNotificationDestination(null);
    void ws.home();
  };
  useEffect(() => { if (ws.board) setActiveFileId(null); }, [ws.board?.id]);
  const openQuickLearning = (tab: HubTab) => {
    if (!ws.board && !!learningTabFromUrl() && ["__learning", "__flashcards", "__lab"].includes(filter ?? "")) {
      openLearningTool(tab);
    } else {
      canvasLinks.leaveUnopenedLink();
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      void ws.home();
      setActiveFileId(null); writeFolderRoute(null,"replace");
      openLearningTool(tab);
      setFilter("__learning"); setRecent(false); setCanvasFullscreen(false); setNotificationDestination(null);
    }
    emitGuideAction(`learning:tab:${tab}`);
    if (tab === "tools") window.dispatchEvent(new CustomEvent(GUIDE_REQUEST_EVENT, { detail: { guideId: "document-tools" } }));
  };
  const openAdmin = () => { setActiveFileId(null); writeFolderRoute(null,"replace"); leaveLearningSpace(); void ws.home(); setFilter("__admin"); setRecent(false); };
  const runGuide = (guideId: string) => {
    // A guide launched from the Wiki must prepare the page that owns its
    // target before the overlay starts asking the user to click it. This
    // prevents the "open the indicated area" dead-end seen on the Wiki page.
    setActiveFileId(null); writeFolderRoute(null,"replace");
    setManualGuideId(guideId);
    setRecent(false);
    switch (guideId) {
      case "lab-simulation":
        void ws.home(); setFilter("__lab");
        break;
      case "document-library":
      case "pdf-annotation":
        manageFolders();
        break;
      case "document-tools":
        void ws.home(); setFilter("__learning");
        break;
      case "workspace-navigation":
      case "canvas-controls":
      case "learning-hub":
      case "folder-manager":
        // These core guides begin at a visible sidebar/control on the real
        // workspace. Returning home is essential when the guide was launched
        // from Wiki/Admin; otherwise the overlay would wait for a target that
        // is not mounted on the guide page.
        void ws.home(); setFilter(null); setRecent(false);
        break;
      case "ai-workflow":
      case "tool-hold-shortcuts":
      default:
        void ws.home(); setFilter(null);
        break;
    }
  };
  const openPlans = () => {
    setModal("plans");
    if (user) void getAccountPlan().then(setAccountPlan).catch(() => {});
  };
  useEffect(() => { saveWebBackground(webBackground); }, [webBackground]);
  const guideTrigger = ws.board ? "canvas" : filter === "__learning" || filter === "__flashcards" ? "learning" : filter === "__lab" ? "lab" : (folderView || filter === "__documents") ? "documents" : !recent && !filter ? "workspace" : null;
  const pageHelpScope: PageHelpScope | null = ws.board ? "canvas" : (folderView || filter === "__documents") ? "folders" : filter === "__learning" || filter === "__flashcards" || filter === "__lab" ? "learning" : filter === "__guides" || filter === "__admin" ? null : "workspace";
  const pageHelpUnlocked = pageHelpScope ? pageHelpIsUnlocked(guideProgress, pageHelpScope) : false;
  useEffect(() => setPageHelpOpen(false), [pageHelpScope]);

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

  const workspaceBackLabel = language === "vi" ? "Về Workspace" : "Back to Workspace";
  const canvasBackLabel = modal === "share" ? (language === "vi" ? "Về canvas" : "Back to canvas") : selectedFolder ? selectedFolder.name : workspaceBackLabel;
  const backFromCanvas = () => { if (modal === "share") { setModal(null); return; } setMobileProjectMenuOpen(false); setAiPanelMode("closed"); setCanvasFullscreen(false); void ws.home(); };
  const workspaceFolderArea = (current: ProjectFolder | null) => <div className="workspace-folder-browser">
    <WorkspaceFolderArea key={current?.id ?? FOLDER_ROOT} owner={user?.id ?? null} current={current} folders={ws.folders}
      repository={workspaceFiles} activeFileId={activeFileId} onOpenFile={openWorkspaceFile} onSignIn={!user && isSupabaseConfigured ? () => void auth() : undefined}
      onFolder={openFolder} onRoot={manageFolders} onNewFolder={() => askName("folder",current?.id ?? null)}
      onNewProject={() => askName("project")} onImportProject={() => fileInput.current?.click()} onLibrary={openDocumentLibrary}
      projectList={<FolderProjectList folderId={current?.id ?? null} projects={ws.projects} folders={ws.folders} loading={ws.loading}
        onOpen={project => void ws.open(project)} onManage={ws.manageProject} onDuplicate={ws.duplicateProject}/>}/>
  </div>;
  return <PageChromeProvider openQuickActions={showQuickActions}><div inert={profileOpen} aria-hidden={profileOpen || undefined} className={`app-shell ${ws.board ? "canvas-open-mode" : ""} ${canvasFullscreen ? "canvas-fullscreen-mode" : ""} ${focusMode ? "focus-mode" : ""} ${iosDevice ? "ios-device" : ""} ${webBackground ? "web-background-active" : ""}`}>
    {webBackground && <div className="web-background-layer" aria-hidden="true">{webBackground.kind === "video" ? <video src={webBackground.src} muted autoPlay loop playsInline style={{ objectFit: webBackground.fit ?? "cover", objectPosition: webBackground.position ?? "center", opacity: webBackground.opacity ?? 1, filter: `blur(${webBackground.blur ?? 0}px) brightness(${webBackground.brightness ?? 1})` }}/> : <img src={webBackground.src} alt="" style={{ objectFit: webBackground.fit ?? "cover", objectPosition: webBackground.position ?? "center", opacity: webBackground.opacity ?? 1, filter: `blur(${webBackground.blur ?? 0}px) brightness(${webBackground.brightness ?? 1})` }}/>}<span style={{ background: webBackground.overlay ?? "#000000" }}/></div>}
    <AppSidebar projects={ws.projects} folders={ws.folders} files={workspaceFiles.files}
      activeFileId={activeFileId} onBrowseFiles={() => setBrowseFiles(true)} onOpenFile={openWorkspaceFile} boardOpen={!!ws.board} recent={recent} filter={selectedFolder?.id ?? filter} sidebarCollapsed={sidebarCollapsed} sidebarWidth={sidebarWidth} language={language} selectedTheme={selectedTheme} onHome={home} onOpenView={openView} onOpenFolder={openFolder} onOpenProject={project => void ws.open(project)} onDropProject={dropProjectInto} onNewFolder={() => askName("folder")} onFolderAction={folder => { setName(folder.name); setFolderAction({ folder, kind: "rename" }); }} onManageFolders={manageFolders} onLanguageChange={setLanguage} onThemeChange={setTheme} canUsePremiumTheme={accountPlan.effectivePlanId !== "free"} onLockedTheme={openPlans} onSettings={() => setModal("settings")} onToggleCollapsed={() => setSidebarCollapsed(value => !value)} onResizeStart={resizeSidebar} onResetWidth={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}/>
    <main className={`main-area ${modal === "share" ? "share-open-mode" : ""}`} data-topbar-pinned={stickyTopbar}>
      <header className={`topbar ${ws.board ? "canvas-desktop-topbar" : ""}`}><div className="topbar-location"><ShellBack fallback={ws.board ? { label: canvasBackLabel, run: backFromCanvas }
        : filter === "__documents" ? { label: t("manageFolders"), run: manageFolders }
        : filter || recent ? { label: workspaceBackLabel, run: home } : undefined}/>{ws.board && <span className="topbar-canvas-title" title={ws.board.title}>{ws.board.title}</span>}</div>
        <div className="actions"><button className="icon-button command-trigger" aria-label={t("commandPalette")} title={`${t("commandPalette")} · Ctrl/⌘ K`} onClick={showQuickActions}><Search size={18}/></button><button className={`icon-button focus-mode-toggle ${focusMode ? "active" : ""}`} aria-label={t(focusMode ? "exitFocusMode" : "focusMode")} aria-pressed={focusMode} title={`${t(focusMode ? "exitFocusMode" : "focusMode")} · Ctrl/⌘ Shift F`} onClick={() => setFocusMode(value => !value)}><Focus size={18}/></button>{ws.board && <><CollaboratorPresence projectId={ws.board.id} user={user} role={readOnly ? "viewer" : currentProject?.accessRole ?? "owner"}/><button role="status" className={`save-status ${ws.status}`} title={ws.conflict?.error || t("syncCenter")} onClick={() => setModal("sync")}>{t(ws.status)}{ws.pendingCount > 0 && <span>{ws.pendingCount}</span>}</button>{!readOnly && <><button className="icon-button" aria-label={t("save")} title={t("save")} onClick={() => void ws.flush(ws.board?.id)}><Save size={18}/></button><button className="icon-button" aria-label={t("versionHistory")} title={t("versionHistory")} onClick={() => { setModal("versions"); void ws.loadVersions(); }}><History size={18}/></button><button className="icon-button" aria-label={t("undo")} title={t("undo")} disabled={!ws.canUndo} onClick={ws.undo}><Undo2 size={18}/></button><button className="icon-button" aria-label={t("redo")} title={t("redo")} disabled={!ws.canRedo} onClick={ws.redo}><Redo2 size={18}/></button></>}</>}
        {!ws.board && <button className="icon-button" aria-label={t("refresh")} onClick={() => void ws.refresh()}><RefreshCw size={18}/></button>}
        <NotificationBell owner={user?.id ?? null} onNavigate={openNotification}/>
        {pageHelpScope && pageHelpUnlocked && <button type="button" className="icon-button page-help-trigger" aria-label={language === "vi" ? "Trợ giúp trang này" : "Help for this page"} title={language === "vi" ? "Trợ giúp trang này" : "Help for this page"} aria-expanded={pageHelpOpen} onClick={() => setPageHelpOpen(value => !value)}><CircleHelp size={19}/></button>}
        <div className="topbar-account-actions">{plusTrial?.eligible && !plusTrial.consumed && !plusTrial.active && <button type="button" className="topbar-trial-button" aria-label="Kích hoạt 3 ngày Plus miễn phí" title="3 ngày Plus miễn phí" onClick={() => { setTrialActivated(false); setTrialError(""); setTrialOpen(true); }}><Gift size={15}/><span>3 ngày Plus</span></button>}<button type="button" className="topbar-plan-button" aria-label={`${t("currentPlan")}: ${accountPlan.name}`} title={t("planUpgradeTitle")} onClick={openPlans}><Crown size={15}/><span>{accountPlan.name}</span></button><TopbarProfile user={user} accountName={accountName} customAvatarUrl={personalProfile.profile?.signedAvatarUrl} onProfile={openProfileRoute} working={working} canSignIn={!!user || isSupabaseConfigured} onAuth={() => void auth()} isAdmin={isAdmin} onAdmin={openAdmin}/></div></div>
      </header>
      {ws.board && <header className="mobile-canvas-header">
        <BackButton className="mobile-canvas-back" aria-label={canvasBackLabel} title={canvasBackLabel} onClick={backFromCanvas}><span className="sr-only">{canvasBackLabel}</span></BackButton>
        <div className="mobile-canvas-title" title={ws.board.title}><strong>{ws.board.title}</strong><small>{currentProject?.cloudOffline ? t("sharedOffline") : readOnly ? t("viewerProject") : "Canvas"}</small></div>
        <button type="button" role="status" className={`mobile-save-status ${ws.status}`} aria-label={t(ws.status)} title={ws.conflict?.error || t(ws.status)} onClick={() => setModal("sync")}><Cloud size={19}/><span>{t(ws.status)}</span></button>
        <button type="button" className="icon-button command-trigger" aria-label={t("commandPalette")} onClick={showQuickActions}><Search size={17}/></button>
        <button type="button" className="icon-button mobile-project-menu-trigger" aria-label={t("projectActions")} aria-expanded={mobileProjectMenuOpen} title={t("projectActions")} onClick={() => setMobileProjectMenuOpen(value => !value)}><MoreHorizontal size={21}/></button>
      </header>}
      {pwa.updateReady && <div className="update-banner" role="status"><span>{t("updateReady")}</span><button onClick={pwa.applyUpdate}>{t("updateNow")}</button></div>}
      {ws.conflict && <AutoResolveCloudConflict conflict={ws.conflict} onResolve={() => ws.resolveConflict("cloud", t("copySuffix"))}/>}
      {message && <div className="error-banner" role="alert"><span>{t("error")}: {message}</span><button onClick={() => { ws.setError(""); onClearAuthError(); if (ws.conflict) void ws.resolveConflict("cloud", t("copySuffix")); else void ws.flush().then(saved => { if (saved) void ws.refresh(); }); }}>{t("retry")}</button>{!ws.conflict && <button aria-label={t("close")} onClick={() => { ws.setError(""); onClearAuthError(); }}><X size={16}/></button>}</div>}
      {canvasLinks.guestCanvasLink && !ws.board && <div className="invite-banner" role="status"><span>{t(isSupabaseConfigured ? "canvasLinkSignIn" : "canvasLinkUnavailable")}</span>{isSupabaseConfigured && <button className="primary-button" onClick={() => void auth()}>{t("login")}</button>}</div>}
      {inviteState === "waiting" && <div className="invite-banner" role="status"><span><strong>{t("invitePendingTitle")}</strong><small>{t("invitePendingHint")}</small></span><button className="primary-button" onClick={() => void auth()}>{t("login")}</button></div>}
      {learningInvite && !user && <div className="invite-banner" role="status"><span><strong>Lời mời học liệu</strong><small>Đăng nhập bằng email được mời để nhận quyền học.</small></span><button className="primary-button" onClick={() => void auth()}>Đăng nhập</button></div>}
      {learningInvite && learningInviteState === "accepted" && <div className="invite-banner success" role="status">Đã nhận học liệu. Mở mục “Được chia sẻ với tôi” trong Không gian học tập.</div>}
      {learningInvite && learningInviteState === "error" && <div className="invite-banner error" role="alert">{learningInviteError}</div>}
      {connectionInvite && connectionInviteState === "accepted" && <div className="invite-banner success" role="status">Đã kết nối. Mở “Bạn bè & tin nhắn” trong Không gian học tập.</div>}
      {connectionInvite && connectionInviteState === "error" && <div className="invite-banner error" role="alert">{connectionInviteError}</div>}
      {inviteState === "accepting" && <div className="invite-banner" role="status"><span><strong>{t("invitePendingTitle")}</strong><small>{t("acceptInviteLoading")}</small></span></div>}
      {inviteState === "accepted" && <div className="invite-banner success" role="status"><span><strong>{t("inviteAccepted")}</strong></span><button className="icon-button" aria-label={t("close")} onClick={() => setInviteState("idle")}><X size={16}/></button></div>}
      {inviteState === "error" && inviteError && <div className="invite-banner error" role="alert"><span><strong>{t("error")}</strong><small>{inviteError}</small></span><button className="icon-button" aria-label={t("close")} onClick={() => setInviteState("idle")}><X size={16}/></button></div>}
      {user && <ShareInbox owner={user.id} onAccepted={(projectId, title, role) => { setFilter("__shared"); setRecent(false); void ws.refresh(true); void ws.open({ id: projectId, title, folderId: null, updatedAt: new Date().toISOString(), shared: true, accessRole: role }); }} />}
      <Suspense fallback={<RouteLoading/>}>{modal === "share" && ws.board ? <ShareDialog shellBack projectId={ws.board.id} title={ws.board.title} isAuthenticated={!!user} attachmentEmbeds={ws.board.embeds.filter(embed=>embed.kind==="document")}
        prepareSharing={user ? async()=>{const snapshot=ws.board;if(!snapshot||!await ws.flush(snapshot.id))throw new Error(t("saveBeforeLeave"));await ensureCanvasAttachments(user.id,snapshot);} : undefined}
        prepareAttachment={user ? async embed=>{const snapshot=ws.board;if(!snapshot||!await ws.flush(snapshot.id))throw new Error(t("saveBeforeLeave"));return ensureCanvasAttachment(user.id,snapshot,embed);} : undefined}
        onSignIn={isSupabaseConfigured ? () => void auth() : undefined} onClose={() => setModal(null)}/> : ws.board ? <>
        <div className="editor-heading canvas-editor-heading"><TitleInput key={ws.board.id} value={ws.board.title} label={t("rename")} disabled={readOnly} onCommit={title => ws.change({ ...ws.board!, title })}/><div className="actions">
          <CanvasProjectActions key={ws.board.id} actions={canvasProjectActions}/>
          {!isA4 && <><button className="secondary-button" title={t("exportSvgHint")} onClick={() => exportCanvasSvgFile(ws.board!)}><Download size={17}/>{t("exportSvg")}</button><button className="secondary-button" title={t("exportPngHint")} onClick={() => void exportCanvasPngFile(ws.board!).catch(err => ws.setError(errorMessage(err, t("error"))))}><Download size={17}/>{t("exportPng")}</button></>}
          {!readOnly && !isA4 && <button className="primary-button" onClick={() => setAiPanelMode("open")}><Sparkles size={17}/>{t("ai")}</button>}</div></div>
        {copiedCanvas?.id === ws.board.id && <div className="shared-readonly-banner" role="status">{t(copiedCanvas.ok ? (!user || currentProject?.revision === undefined ? "canvasLinkLocalHint" : "canvasLinkCopied") : "canvasLinkCopyFallback")}</div>}
        {readOnly && <div className="shared-readonly-banner">{currentProject?.cloudOffline ? t("sharedOffline") : t("viewerProject")}</div>}
        {mobileProjectMenuOpen && <div className="mobile-project-sheet-backdrop" role="presentation" onClick={() => setMobileProjectMenuOpen(false)}><aside className="mobile-project-sheet" role="dialog" aria-modal="true" aria-label={t("projectActions")} onClick={event => event.stopPropagation()}>
          <header><div><strong>{ws.board.title}</strong><small>{t(ws.status)}</small></div><button type="button" className="icon-button" aria-label={t("close")} onClick={() => setMobileProjectMenuOpen(false)}><X size={20}/></button></header>
          {!readOnly && <TitleInput key={`mobile-${ws.board.id}`} value={ws.board.title} label={t("rename")} onCommit={title => ws.change({ ...ws.board!, title })}/>}
          <div className="mobile-project-sheet-grid">
            {!readOnly && <button type="button" disabled={!ws.canUndo} onClick={() => { ws.undo(); setMobileProjectMenuOpen(false); }}><Undo2 size={19}/><span>{t("undo")}</span></button>}
            {!readOnly && <button type="button" disabled={!ws.canRedo} onClick={() => { ws.redo(); setMobileProjectMenuOpen(false); }}><Redo2 size={19}/><span>{t("redo")}</span></button>}
            {iosDevice && !readOnly && <button type="button" disabled={working} onClick={() => { setWorking(true); void ws.flush(ws.board?.id).finally(() => { setWorking(false); setMobileProjectMenuOpen(false); }); }}><Save size={19}/><span>{working ? t("saving") : t("save")}</span></button>}
            {!readOnly && <button type="button" onClick={() => { setMobileProjectMenuOpen(false); setModal("versions"); void ws.loadVersions(); }}><History size={19}/><span>{t("versionHistory")}</span></button>}
            {!readOnly && <button type="button" onClick={() => { setFolder(ws.projects.find(p => p.id === ws.board!.id)?.folderId ?? ""); setMobileProjectMenuOpen(false); setModal("move"); }}><FolderPlus size={19}/><span>{t("move")}</span></button>}
            <button type="button" onClick={() => { void copyCanvasLink(); setMobileProjectMenuOpen(false); }}><Link2 size={19}/><span>{t("copyCanvasLink")}</span></button>
            {mobileShareVisible && <button type="button" onClick={() => { setMobileProjectMenuOpen(false); setModal("share"); }}><Share2 size={19}/><span>{t("shareProject")}</span></button>}
            <button type="button" onClick={() => { exportBoard(ws.board!); setMobileProjectMenuOpen(false); }}><Download size={19}/><span>{t("export")}</span></button>
            {!isA4 && <>
            <button type="button" onClick={() => { exportCanvasSvgFile(ws.board!); setMobileProjectMenuOpen(false); }}><Download size={19}/><span>{t("exportSvg")}</span></button>
            <button type="button" onClick={() => { void exportCanvasPngFile(ws.board!).catch(err => ws.setError(errorMessage(err, t("error")))); setMobileProjectMenuOpen(false); }}><Download size={19}/><span>{t("exportPng")}</span></button></>}
            {!readOnly && !isA4 && <button type="button" className="mobile-project-ai-action" onClick={() => { setMobileProjectMenuOpen(false); setAiPanelMode("open"); }}><Sparkles size={19}/><span>{t("ai")}</span></button>}
          </div>
        </aside></div>}
        <CanvasEditor key={ws.board.id} board={ws.board} documents={documents} onChange={ws.change} onDraftChange={ws.checkpointDraft} onViewportChange={ws.navigate} onUndo={readOnly ? () => {} : ws.undo} onRedo={readOnly ? () => {} : ws.redo} canUndo={!readOnly && ws.canUndo} canRedo={!readOnly && ws.canRedo} onSave={readOnly ? () => {} : () => void ws.flush(ws.board?.id)} canUseAi={!!user && !readOnly} canUseCanvasBackground={accountPlan.effectivePlanId === "pro" || accountPlan.effectivePlanId === "max"} onRequestCanvasBackgroundUpgrade={openPlans} readOnly={readOnly} isFullscreen={canvasFullscreen} onToggleFullscreen={toggleCanvasFullscreen} toolbarPosition={toolbarPosition} timerVisible={timerVisible} onToggleTimer={() => setTimerVisible(value => !value)} showMobileZoomControls={mobileZoomControlsVisible} visibleToolIds={visibleToolIds} onDocumentSaved={saveCanvasDocument}/>
      </> : filter === "__admin" && isAdmin ? <AdminDashboard onBack={home} ownerId={user?.id ?? null} onRunGuide={runGuide}/> : filter === "__guides" ? <FeatureGuidePage ownerId={user?.id ?? null} onRunGuide={runGuide}/> : filter === "__documents" ? <FolderManager owner={user?.id ?? null} documents={documents} onDocumentsChanged={() => void listDocuments(user?.id ?? null).then(setDocuments).catch(err => ws.setError(errorMessage(err, "Không thể mở thư viện tài liệu.")))} /> : filter === "__lab" ? <LearningHubPage owner={user?.id ?? null} projects={ws.projects} documents={documents} onDocumentsChanged={() => void listDocuments(user?.id ?? null).then(setDocuments).catch(err => ws.setError(errorMessage(err, "Không thể mở thư viện tài liệu.")))} accountPlan={accountPlan} initialTab="lab"/> : filter === "__learning" || filter === "__flashcards" ? <LearningHubPage key={notificationDestination?.nonce ?? "learning"} owner={user?.id ?? null} projects={ws.projects} documents={documents} onDocumentsChanged={() => void listDocuments(user?.id ?? null).then(setDocuments).catch(err => ws.setError(errorMessage(err, "Không thể mở thư viện tài liệu.")))} accountPlan={accountPlan} initialTab={notificationDestination?.tab ?? (connectionInviteState === "accepted" ? "connections" : learningInviteState === "accepted" ? "shared" : undefined)} initialPeerId={notificationDestination?.peerId} initialClassId={notificationDestination?.classId} onSignIn={isSupabaseConfigured ? () => void auth() : undefined}/> : folderUnavailable && !ws.loading ? <div className="empty-state workspace-folder-unavailable"><h1>{language === "vi" ? "Không mở được thư mục" : "Folder unavailable"}</h1><p>{language === "vi" ? "Thư mục không còn tồn tại hoặc không thuộc tài khoản này." : "This folder is missing or does not belong to this account."}</p><div className="actions"><button className="secondary-button" onClick={manageFolders}>{t("manageFolders")}</button>{!user && isSupabaseConfigured && <button className="primary-button" onClick={() => void auth()}>{language === "vi" ? "Đăng nhập" : "Sign in"}</button>}</div></div> : folderView ? (folderUnavailable ? <RouteLoading/> : workspaceFolderArea(selectedFolder ?? null)) : <>{filter === "__shared" && <WorkspaceSharedInbox owner={user?.id ?? null}/>}<WorkspaceHome projects={visible} title={pageTitle} loading={ws.loading} folders={ws.folders} onManage={ws.manageProject} onDuplicate={ws.duplicateProject} onLoadThumbnails={ws.loadThumbnails} trash={filter === "__trash"} onOpen={p => void ws.open(p)} onCreate={() => askName("project")} onImport={() => fileInput.current?.click()}/></>}</Suspense>
      <PetCompanion inline={filter === "__learning" || filter === "__flashcards" || filter === "__lab"} visible={petVisible} owner={user?.id ?? null} active={Boolean(ws.board || filter === "__learning" || filter === "__flashcards" || filter === "__lab")} activityType={filter === "__flashcards" ? "flashcard" : filter === "__lab" ? "lab" : filter === "__learning" ? "quiz" : "workspace"}/>
      </main>
    <input ref={fileInput} hidden type="file" accept=".json,.mindcanvas" onChange={e => void importFile(e.target.files?.[0])}/>
    <FloatingTimer visible={timerVisible}/>
    <MusicIsland/>
    <FeatureGuideManager key={user?.id ?? "guest"} ownerId={user?.id ?? null} trigger={guideTrigger} manualGuideId={manualGuideId} onManualConsumed={() => setManualGuideId(null)} onPracticeDecision={decideCanvasPractice} blocked={focusMode || modal !== null || profileOpen}/>
    {pageHelpOpen && pageHelpScope && pageHelpUnlocked && <PageHelpPanel scope={pageHelpScope} onClose={() => setPageHelpOpen(false)}/>}
   {trialOpen && plusTrial && <PlusTrialPopup trial={plusTrial} working={trialWorking} activated={trialActivated} error={trialError} onActivate={() => void startTrial()} onClose={closeTrial}/>}
   {(modal === "project" || modal === "folder") && <Dialog title={t(modal === "project" ? "newProject" : "newFolder")} onClose={() => { if (!working) setModal(null); }}><form onSubmit={e => void create(e)}>
      {modal === "project" && <fieldset className="new-canvas-types"><legend>{t("canvasProjectType")}</legend>
        <label><input type="radio" name="canvasType" checked={projectType === "infinite"} onChange={() => setProjectType("infinite")}/>
          <span><strong>{t("canvasInfinite")}</strong><small>{t("canvasInfiniteHint")}</small></span></label>
        <label><input type="radio" name="canvasType" checked={projectType === "a4"} onChange={() => setProjectType("a4")}/>
          <span><strong>{t("canvasA4")}</strong><small>{t("canvasA4Hint")}</small></span></label>
      </fieldset>}
      <label>{t("name")}<input className={modal === "project" ? "guide-project-name-input" : "guide-folder-name-input"} autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} onFocus={e => e.target.select()}/></label>
      <footer className="actions"><button type="button" className="secondary-button" disabled={working} onClick={() => setModal(null)}>{t("cancel")}</button><button className={`primary-button ${modal === "project" ? "guide-project-create-submit" : "guide-folder-create-submit"}`} disabled={!name.trim() || working}>{working ? t("saving") : t("create")}</button></footer></form></Dialog>}
    {folderAction?.kind === "rename" && <Dialog title={t("renameFolder")} onClose={() => setFolderAction(null)}><form onSubmit={e => { e.preventDefault(); const n = name.trim(); if (n) void ws.renameFolder(folderAction.folder, n).then(() => { emitGuideAction("folder:renamed", { folderId: folderAction.folder.id, name: n }); setFolderAction(null); }); }}><label>{t("name")}<input autoFocus required maxLength={80} defaultValue={folderAction.folder.name} onChange={e => setName(e.target.value)}/></label><footer className="actions"><button type="button" className="secondary-button" onClick={() => setFolderAction(null)}>{t("cancel")}</button><button className="primary-button">{t("save")}</button></footer></form><button className="text-danger-button" onClick={() => setFolderAction({ ...folderAction, kind: "delete" })}>{t("deleteFolder")}</button></Dialog>}
    {folderAction?.kind === "delete" && <Dialog title={t("deleteFolder")} onClose={() => setFolderAction(null)}><p>{t("deleteFolderHint")}</p><footer className="actions"><button className="secondary-button" onClick={() => setFolderAction(null)}>{t("cancel")}</button><button className="danger-button" onClick={() => void ws.removeFolder(folderAction.folder).then(() => { emitGuideAction("folder:deleted", { folderId: folderAction.folder.id }); if (filter === folderAction.folder.id) goToFolder(folderAction.folder.parentId ?? FOLDER_ROOT,"replace"); setFolderAction(null); })}>{t("deleteFolder")}</button></footer></Dialog>}
    {modal === "move" && <Dialog title={t("move")} onClose={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); ws.move(folder || null); setModal(null); }}><label>{t("folders")}<select value={folder} onChange={e => setFolder(e.target.value)}><option value="">{t("noFolder")}</option>{ws.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><footer className="actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>{t("cancel")}</button><button className="primary-button">{t("save")}</button></footer></form></Dialog>}
    {modal === "settings" && <SettingsDialog onClose={() => setModal(null)}
      profile={user ? { name: accountName, email: user.email, open: () => { setModal(null); openProfileRoute(); } } : null}
      signIn={isSupabaseConfigured ? () => { setModal(null); void auth(); } : null}
      plan={accountPlan} openPlans={openPlans}
      theme={{ value: selectedTheme, change: setTheme }} background={{ value: webBackground, change: setWebBackground }}
      stickyTopbar={{ value: stickyTopbar, change: changeStickyTopbar }} toolbarPosition={{ value: toolbarPosition, change: setToolbarPosition }}
      visibleTools={{ value: visibleToolIds, change: setVisibleToolIds }} mobileZoom={{ value: mobileZoomControlsVisible, change: setMobileZoomControlsVisible }}
      focusMode={{ value: focusMode, change: setFocusMode }} focusTimer={{ value: timerVisible, change: setTimerVisible }} pet={{ value: petVisible, change: setPetVisible }}
      installed={pwa.installed} openInstall={() => setModal("install")} importProject={file => { setModal(null); void importFile(file); }}/>}
    <Suspense fallback={null}>
    {modal === "plans" && <PlanUpgradeDialog currentPlan={accountPlan} onClose={() => setModal(null)}/>}
    {modal === "install" && <Dialog title={t("installAppTitle")} onClose={() => setModal(null)}><div className="install-app-dialog"><Smartphone size={38}/><p>{t(pwa.installed ? "appInstalledHint" : "installAppHint")}</p>{pwa.ios && <p className="install-instruction">{t("iosInstallHint")}</p>}{!pwa.installed && !pwa.canInstall && !pwa.ios && <p className="install-instruction">{t("browserInstallHint")}</p>}<small>{t("pwaOfflineHint")}</small></div><footer className="actions"><button className="secondary-button" onClick={() => setModal(null)}>{t("close")}</button>{pwa.canInstall && <button className="primary-button" disabled={working} onClick={() => { setWorking(true); void pwa.install().then(installed => { if (installed) setModal(null); }).finally(() => setWorking(false)); }}><Download size={17}/>{t("installNow")}</button>}</footer></Dialog>}
    {modal === "sync" && <SyncCenter owner={user?.id ?? null} online={ws.online} status={ws.status} projects={ws.projects} working={working} error={ws.conflict?.error} onClose={() => setModal(null)} onRetry={async () => { setWorking(true); try { const saved = ws.conflict ? await ws.resolveConflict("cloud", t("copySuffix")) : await ws.flush(); if (saved) await ws.refresh(); } finally { setWorking(false); } }}/>} 
    {modal === "versions" && ws.board && <VersionHistory versions={ws.versions} loading={ws.versionLoading} working={working} onClose={() => { if (!working) setModal(null); }} onCheckpoint={async () => { setWorking(true); try { await ws.saveCheckpoint(t("saveCheckpoint")); } catch (err) { ws.setError(errorMessage(err, t("error"))); } finally { setWorking(false); } }} onRestore={async version => { setWorking(true); try { await ws.restoreVersion(version); setModal(null); } catch (err) { ws.setError(errorMessage(err, t("error"))); } finally { setWorking(false); } }}/>}
    {aiPanelMode !== "unopened" && ws.board && !isA4 && <AiPanel
      visible={aiPanelMode !== "closed"}
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
            void ws.create(next.title, next).then(() => setAiPanelMode("unopened"));
          } else {
            ws.change(applyGraph(ws.board!, graph)); setAiPanelMode("unopened");
          }
        } catch { ws.setError(t("aiError")); setAiPanelMode("closed"); }
      }}/>} {/* Keep this mounted while minimized so its request survives. */}
    {commandOpen && <CommandPalette projects={ws.projects} onClose={() => setCommandOpen(false)} onOpenProject={project => void ws.open(project)} onCreateProject={() => askName("project")} onOpenLearningTool={openQuickLearning} onOpenSettings={() => setModal("settings")} onImport={() => fileInput.current?.click()}/>}
    </Suspense>
  </div>{profileOpen && <Suspense fallback={<div className="profile-screen"><RouteLoading/></div>}><PersonalProfilePage state={personalProfile} signedIn={!!user} onBack={closeProfileRoute} onSignIn={isSupabaseConfigured ? () => void auth() : undefined}/></Suspense>}</PageChromeProvider>;
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
