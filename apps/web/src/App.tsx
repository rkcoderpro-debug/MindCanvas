import { MusicProvider, MusicIsland } from "./components/MusicPlayer";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ProjectFolder } from "./lib/projectStore";
import { ArrowLeft, CircleHelp, Cloud, Crown, Download, Focus, FolderPlus, Gift, History, LayoutGrid, MoreHorizontal, Redo2, RefreshCw, Save, Search, Share2, Smartphone, Sparkles, Undo2, Upload, X } from "lucide-react";
import WorkspaceHome from "./components/WorkspaceHome";
import Dialog from "./components/Dialog";
import FloatingTimer from "./components/FloatingTimer";
import PetCompanion from "./components/PetCompanion";
import PlusTrialPopup from "./components/PlusTrialPopup";
import ThemePicker from "./components/ThemePicker";
import CommandPalette from "./components/CommandPalette";
import TopbarProfile from "./components/TopbarProfile";
import CollaboratorPresence from "./components/CollaboratorPresence";
import AppSidebar, { type SidebarView } from "./components/AppSidebar";
import { LanguageProvider, useLanguage, useTheme, type MessageKey } from "./lib/i18n";
import { getCurrentSession, hasRememberedAuthUser, isSupabaseConfigured, signInWithGoogle, signOut, supabase } from "./lib/supabase";
import { acceptProjectInvitation } from "./lib/collaboration";
import { acceptLearning } from "./lib/learningShare";
import { applyGraph, blankBoard, exportBoard, exportCanvasPngFile, exportCanvasSvgFile, importBoard } from "./lib/board";
import { useWorkspace } from "./hooks/useWorkspace";
import { usePwaInstall } from "./lib/pwa";
import { isToolbarPosition, TOOLBAR_POSITIONS, type ToolbarPosition } from "./lib/editorPreferences";
import { readToolbarToolVisibility, saveToolbarToolVisibility } from "./lib/toolbarPreferences";
import { SIDEBAR_DEFAULT_WIDTH, clampSidebarWidth } from "./lib/sidebarLayout";
import { getAccountPlan, getAdminStatus } from "./lib/api";
import { readFocusTimerVisibility, readMobileZoomControlsVisibility, saveFocusTimerVisibility, saveMobileZoomControlsVisibility } from "./lib/uiPreferences";
import { FREE_ACCOUNT_PLAN, type AccountPlan } from "./lib/account";
import { activatePlusTrial, getPlusTrial, type PlusTrialState } from "./lib/plusTrial";
import { errorMessage } from "./lib/errors";
import { isIOSDevice } from "./lib/canvasInput";
import ShareInbox from "./components/ShareInbox";
import ToolbarCustomization from "./components/ToolbarCustomization";
import WebBackgroundControls from "./components/WebBackgroundControls";
import { readWebBackground, saveWebBackground, type WebBackground } from "./lib/webBackground";
import { listDocuments, saveDocument, type UploadedDocument } from "./lib/documentStore";
import FeatureGuideManager from "./components/FeatureGuideManager";
import PageHelpPanel from "./components/PageHelpPanel";
import { emitGuideAction, GUIDE_PROGRESS_EVENT, pageHelpIsUnlocked, readGuideProgress, type PageHelpScope } from "./lib/featureGuides";
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
const FeatureGuidePage = lazy(() => import("./components/FeatureGuidePage"));

export default function App() { return <LanguageProvider><AuthenticatedApp/></LanguageProvider>; }
function AuthenticatedApp() {
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(null), [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState("");
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
  // Keying by identity prevents account A's boards/history from appearing for account B.
  return <MusicProvider key={user?.id ?? "guest"} owner={user?.id ?? null}><Workspace user={user} authError={error} onClearAuthError={() => setError("")}/></MusicProvider>;
}
function Workspace({ user, authError, onClearAuthError }: { user: User | null; authError: string; onClearAuthError: () => void }) {
  const { t, language, setLanguage } = useLanguage(), { selectedTheme, setTheme } = useTheme(), ws = useWorkspace(user?.id ?? null), pwa = usePwaInstall();
  const iosDevice = isIOSDevice();
  const [modal, setModal] = useState<"project" | "folder" | "move" | "settings" | "versions" | "sync" | "install" | "plans" | "share" | null>(null);
  const [name, setName] = useState(""), [folder, setFolder] = useState(""), [filter, setFilter] = useState<string | null>(null), [folderAction, setFolderAction] = useState<{ folder: ProjectFolder; kind: "rename" | "delete" } | null>(null);
  const [recent, setRecent] = useState(false), [working, setWorking] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem("mindcanvas:sidebar-collapsed") === "true"; } catch { return false; } });
  const [petVisible, setPetVisible] = useState(() => { try { return localStorage.getItem("mindcanvas:pet-visible") !== "false"; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem("mindcanvas:pet-visible", String(petVisible)); } catch {} }, [petVisible]);
  const [sidebarWidth, setSidebarWidth] = useState(() => { try { const raw = localStorage.getItem("mindcanvas:sidebar-width"); const saved = raw?.trim() ? Number(raw) : NaN; return Number.isFinite(saved) ? clampSidebarWidth(saved) : SIDEBAR_DEFAULT_WIDTH; } catch { return SIDEBAR_DEFAULT_WIDTH; } });
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
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [manualGuideId, setManualGuideId] = useState<string | null>(null);
  const [guideProgress, setGuideProgress] = useState(() => readGuideProgress(user?.id ?? null));
  const [pageHelpOpen, setPageHelpOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const message = ws.error || authError;
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
    setMobileProjectMenuOpen(false);
    setAiPanelMode("closed");
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    void ws.home(); setFilter(null); setRecent(false); setCanvasFullscreen(false);
  };
  const askName = (kind: "project" | "folder") => { setName(kind === "project" ? t("untitled") : ""); setModal(kind); };
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return; setWorking(true);
    try {
      if (modal === "project") {
        const created = await ws.create(name.trim(), undefined, filter && !filter.startsWith("__") ? filter : null);
        emitGuideAction("canvas:practice-created", { projectId: created.id, title: created.title });
        emitGuideAction("workspace:project-created", { projectId: created.id, title: created.title });
      } else {
        const created = await ws.newFolder(name.trim());
        emitGuideAction("folder:created", { folderId: created.id, name: created.name });
      }
      setModal(null);
    }
    finally { setWorking(false); }
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
      void ws.refresh();
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
  const openView = (view: SidebarView) => { void ws.home(); if (view === "recent") { setFilter(null); setRecent(true); } else { setFilter(view); setRecent(false); } };
  const openFolder = (folderId: string) => { void ws.home(); setFilter(folderId); setRecent(false); };
  const openFlashcards = () => openView("__learning");
  const openAdmin = () => { void ws.home(); setFilter("__admin"); setRecent(false); };
  const runGuide = (guideId: string) => {
    // A guide launched from the Wiki must prepare the page that owns its
    // target before the overlay starts asking the user to click it. This
    // prevents the "open the indicated area" dead-end seen on the Wiki page.
    setManualGuideId(guideId);
    setRecent(false);
    switch (guideId) {
      case "lab-simulation":
        void ws.home(); setFilter("__lab");
        break;
      case "document-library":
      case "pdf-annotation":
        void ws.home(); setFilter("__manager");
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
  const guideTrigger = ws.board ? "canvas" : filter === "__learning" || filter === "__flashcards" ? "learning" : filter === "__lab" ? "lab" : filter === "__manager" ? "documents" : !recent && !filter ? "workspace" : null;
  const pageHelpScope: PageHelpScope | null = ws.board ? "canvas" : filter === "__manager" ? "folders" : filter === "__learning" || filter === "__flashcards" || filter === "__lab" ? "learning" : filter === "__guides" || filter === "__admin" ? null : "workspace";
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

  return <div className={`app-shell ${ws.board ? "canvas-open-mode" : ""} ${canvasFullscreen ? "canvas-fullscreen-mode" : ""} ${focusMode ? "focus-mode" : ""} ${iosDevice ? "ios-device" : ""} ${webBackground ? "web-background-active" : ""}`}>
    {webBackground && <div className="web-background-layer" aria-hidden="true">{webBackground.kind === "video" ? <video src={webBackground.src} muted autoPlay loop playsInline style={{ objectFit: webBackground.fit ?? "cover", objectPosition: webBackground.position ?? "center", opacity: webBackground.opacity ?? 1, filter: `blur(${webBackground.blur ?? 0}px) brightness(${webBackground.brightness ?? 1})` }}/> : <img src={webBackground.src} alt="" style={{ objectFit: webBackground.fit ?? "cover", objectPosition: webBackground.position ?? "center", opacity: webBackground.opacity ?? 1, filter: `blur(${webBackground.blur ?? 0}px) brightness(${webBackground.brightness ?? 1})` }}/>}<span style={{ background: webBackground.overlay ?? "#000000" }}/></div>}
    <AppSidebar projects={ws.projects} folders={ws.folders} boardOpen={!!ws.board} recent={recent} filter={filter} sidebarCollapsed={sidebarCollapsed} sidebarWidth={sidebarWidth} language={language} selectedTheme={selectedTheme} onHome={home} onOpenView={openView} onOpenFolder={openFolder} onOpenProject={project => void ws.open(project)} onDropProject={dropProjectInto} onNewFolder={() => askName("folder")} onFolderAction={folder => { setName(folder.name); setFolderAction({ folder, kind: "rename" }); }} onManageFolders={() => { void ws.home(); setFilter("__manager"); setRecent(false); }} onLanguageChange={setLanguage} onThemeChange={setTheme} canUsePremiumTheme={accountPlan.effectivePlanId !== "free"} onLockedTheme={openPlans} onSettings={() => setModal("settings")} onToggleCollapsed={() => setSidebarCollapsed(value => !value)} onResizeStart={resizeSidebar} onResetWidth={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}/>
    <main className={`main-area ${modal === "share" ? "share-open-mode" : ""}`}>
      <header className={`topbar ${ws.board ? "canvas-desktop-topbar" : ""}`}><div className="breadcrumbs"><button onClick={home}>{ws.board ? <ArrowLeft size={17}/> : <LayoutGrid size={17}/>} {t("workspace")}</button>{ws.board && <span>/ {ws.board.title}</span>}</div>
        <div className="actions"><button className="icon-button command-trigger" aria-label={t("commandPalette")} title={`${t("commandPalette")} · Ctrl/⌘ K`} onClick={() => setCommandOpen(true)}><Search size={18}/></button><button className={`icon-button focus-mode-toggle ${focusMode ? "active" : ""}`} aria-label={t(focusMode ? "exitFocusMode" : "focusMode")} aria-pressed={focusMode} title={`${t(focusMode ? "exitFocusMode" : "focusMode")} · Ctrl/⌘ Shift F`} onClick={() => setFocusMode(value => !value)}><Focus size={18}/></button>{ws.board && <><CollaboratorPresence projectId={ws.board.id} user={user} role={readOnly ? "viewer" : currentProject?.accessRole ?? "owner"}/><button role="status" className={`save-status ${ws.status}`} title={t("syncCenter")} onClick={() => setModal("sync")}>{t(ws.status)}{ws.pendingCount > 0 && <span>{ws.pendingCount}</span>}</button>{!readOnly && <><button className="icon-button" aria-label={t("save")} title={t("save")} onClick={() => void ws.saveCheckpoint(t("saveCheckpoint")).catch(err => ws.setError(errorMessage(err, t("error"))))}><Save size={18}/></button><button className="icon-button" aria-label={t("versionHistory")} title={t("versionHistory")} onClick={() => { setModal("versions"); void ws.loadVersions(); }}><History size={18}/></button><button className="icon-button" aria-label={t("undo")} title={t("undo")} disabled={!ws.canUndo} onClick={ws.undo}><Undo2 size={18}/></button><button className="icon-button" aria-label={t("redo")} title={t("redo")} disabled={!ws.canRedo} onClick={ws.redo}><Redo2 size={18}/></button></>}</>}
        {!ws.board && <button className="icon-button" aria-label={t("refresh")} onClick={() => void ws.refresh()}><RefreshCw size={18}/></button>}
        {pageHelpScope && pageHelpUnlocked && <button type="button" className="icon-button page-help-trigger" aria-label={language === "vi" ? "Trợ giúp trang này" : "Help for this page"} title={language === "vi" ? "Trợ giúp trang này" : "Help for this page"} aria-expanded={pageHelpOpen} onClick={() => setPageHelpOpen(value => !value)}><CircleHelp size={19}/></button>}
        <div className="topbar-account-actions">{plusTrial?.eligible && !plusTrial.consumed && !plusTrial.active && <button type="button" className="topbar-trial-button" aria-label="Kích hoạt 3 ngày Plus miễn phí" title="3 ngày Plus miễn phí" onClick={() => { setTrialActivated(false); setTrialError(""); setTrialOpen(true); }}><Gift size={15}/><span>3 ngày Plus</span></button>}<button type="button" className="topbar-plan-button" aria-label={`${t("currentPlan")}: ${accountPlan.name}`} title={t("planUpgradeTitle")} onClick={openPlans}><Crown size={15}/><span>{accountPlan.name}</span></button><TopbarProfile user={user} accountName={accountName} working={working} canSignIn={!!user || isSupabaseConfigured} onAuth={() => void auth()} isAdmin={isAdmin} onAdmin={openAdmin}/></div></div>
      </header>
      {ws.board && <header className="mobile-canvas-header">
        <button type="button" className="icon-button mobile-canvas-back" aria-label={t("workspace")} title={t("workspace")} onClick={home}><ArrowLeft size={20}/></button>
        <div className="mobile-canvas-title" title={ws.board.title}><strong>{ws.board.title}</strong><small>{currentProject?.cloudOffline ? t("sharedOffline") : readOnly ? t("viewerProject") : "Canvas"}</small></div>
        <button type="button" role="status" className={`mobile-save-status ${ws.status}`} aria-label={t(ws.status)} title={t(ws.status)} onClick={() => setModal("sync")}><Cloud size={19}/><span>{t(ws.status)}</span></button>
        <button type="button" className="icon-button mobile-project-menu-trigger" aria-label={t("projectActions")} aria-expanded={mobileProjectMenuOpen} title={t("projectActions")} onClick={() => setMobileProjectMenuOpen(value => !value)}><MoreHorizontal size={21}/></button>
      </header>}
      {pwa.updateReady && <div className="update-banner" role="status"><span>{t("updateReady")}</span><button onClick={pwa.applyUpdate}>{t("updateNow")}</button></div>}
      {message && !ws.conflict && <div className="error-banner" role="alert"><span>{t("error")}: {message}</span><button onClick={() => { ws.setError(""); onClearAuthError(); void ws.flush().then(saved => { if (saved) void ws.refresh(); }); }}>{t("retry")}</button><button aria-label={t("close")} onClick={() => { ws.setError(""); onClearAuthError(); }}><X size={16}/></button></div>}
      {inviteState === "waiting" && <div className="invite-banner" role="status"><span><strong>{t("invitePendingTitle")}</strong><small>{t("invitePendingHint")}</small></span><button className="primary-button" onClick={() => void auth()}>{t("login")}</button></div>}
      {learningInvite && !user && <div className="invite-banner" role="status"><span><strong>Lời mời học liệu</strong><small>Đăng nhập bằng email được mời để nhận quyền học.</small></span><button className="primary-button" onClick={() => void auth()}>Đăng nhập</button></div>}
      {learningInvite && learningInviteState === "accepted" && <div className="invite-banner success" role="status">Đã nhận học liệu. Mở mục “Được chia sẻ với tôi” trong Trung tâm học tập.</div>}
      {learningInvite && learningInviteState === "error" && <div className="invite-banner error" role="alert">{learningInviteError}</div>}
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
        <CanvasBoard key={ws.board.id} board={ws.board} documents={documents} onChange={ws.change} onDraftChange={ws.checkpointDraft} onViewportChange={ws.navigate} onUndo={readOnly ? () => {} : ws.undo} onRedo={readOnly ? () => {} : ws.redo} canUndo={!readOnly && ws.canUndo} canRedo={!readOnly && ws.canRedo} onSave={readOnly ? () => {} : () => void ws.flush()} canUseAi={!!user && !readOnly} canUseCanvasBackground={accountPlan.effectivePlanId === "pro" || accountPlan.effectivePlanId === "max"} onRequestCanvasBackgroundUpgrade={openPlans} readOnly={readOnly} isFullscreen={canvasFullscreen} onToggleFullscreen={toggleCanvasFullscreen} toolbarPosition={toolbarPosition} timerVisible={timerVisible} onToggleTimer={() => setTimerVisible(value => !value)} showMobileZoomControls={mobileZoomControlsVisible} visibleToolIds={visibleToolIds} onDocumentSaved={saveCanvasDocument}/>
      </> : filter === "__admin" && isAdmin ? <AdminDashboard onBack={home} ownerId={user?.id ?? null} onRunGuide={runGuide}/> : filter === "__guides" ? <FeatureGuidePage ownerId={user?.id ?? null} onRunGuide={runGuide}/> : filter === "__manager" ? <FolderManager owner={user?.id ?? null} projects={ws.projects} folders={ws.folders} documents={documents} onDocumentsChanged={() => void listDocuments(user?.id ?? null).then(setDocuments)} onOpen={p=>void ws.open(p)} onManage={ws.manageProject} onDuplicate={ws.duplicateProject} onRenameFolder={ws.renameFolder} onDeleteFolder={ws.removeFolder} onCreateFolder={()=>askName("folder")}/> : filter === "__lab" ? <LearningHubPage owner={user?.id ?? null} projects={ws.projects} documents={documents} onDocumentsChanged={() => void listDocuments(user?.id ?? null).then(setDocuments)} accountPlan={accountPlan} initialTab="lab"/> : filter === "__learning" || filter === "__flashcards" ? <LearningHubPage owner={user?.id ?? null} projects={ws.projects} documents={documents} onDocumentsChanged={() => void listDocuments(user?.id ?? null).then(setDocuments)} accountPlan={accountPlan} initialTab={learningInviteState === "accepted" ? "shared" : undefined}/> : <WorkspaceHome projects={visible} title={pageTitle} loading={ws.loading} folders={ws.folders} onManage={ws.manageProject} onDuplicate={ws.duplicateProject} onLoadThumbnail={ws.loadThumbnail} trash={filter === "__trash"} onOpen={p => void ws.open(p)} onCreate={() => askName("project")} onImport={() => fileInput.current?.click()}/>}</Suspense>
      </main>
    <input ref={fileInput} hidden type="file" accept=".json,.mindcanvas" onChange={e => void importFile(e.target.files?.[0])}/>
    <FloatingTimer visible={timerVisible}/>
    <MusicIsland/>
    <PetCompanion visible={petVisible} owner={user?.id ?? null} active={Boolean(ws.board || filter === "__learning" || filter === "__flashcards" || filter === "__lab")} activityType={filter === "__flashcards" ? "flashcard" : filter === "__lab" ? "lab" : filter === "__learning" ? "quiz" : "workspace"}/>
    <FeatureGuideManager key={user?.id ?? "guest"} ownerId={user?.id ?? null} trigger={guideTrigger} manualGuideId={manualGuideId} onManualConsumed={() => setManualGuideId(null)} onPracticeDecision={decideCanvasPractice} blocked={focusMode || modal !== null}/>
    {pageHelpOpen && pageHelpScope && pageHelpUnlocked && <PageHelpPanel scope={pageHelpScope} onClose={() => setPageHelpOpen(false)}/>}
   {trialOpen && plusTrial && <PlusTrialPopup trial={plusTrial} working={trialWorking} activated={trialActivated} error={trialError} onActivate={() => void startTrial()} onClose={closeTrial}/>}
   {(modal === "project" || modal === "folder") && <Dialog title={t(modal === "project" ? "newProject" : "newFolder")} onClose={() => { if (!working) setModal(null); }}><form onSubmit={e => void create(e)}>
      <label>{t("name")}<input className={modal === "project" ? "guide-project-name-input" : "guide-folder-name-input"} autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} onFocus={e => e.target.select()}/></label>
      <footer className="actions"><button type="button" className="secondary-button" disabled={working} onClick={() => setModal(null)}>{t("cancel")}</button><button className={`primary-button ${modal === "project" ? "guide-project-create-submit" : "guide-folder-create-submit"}`} disabled={!name.trim() || working}>{working ? t("saving") : t("create")}</button></footer></form></Dialog>}
    {folderAction?.kind === "rename" && <Dialog title={t("renameFolder")} onClose={() => setFolderAction(null)}><form onSubmit={e => { e.preventDefault(); const n = name.trim(); if (n) void ws.renameFolder(folderAction.folder, n).then(() => { emitGuideAction("folder:renamed", { folderId: folderAction.folder.id, name: n }); setFolderAction(null); }); }}><label>{t("name")}<input autoFocus required maxLength={80} defaultValue={folderAction.folder.name} onChange={e => setName(e.target.value)}/></label><footer className="actions"><button type="button" className="secondary-button" onClick={() => setFolderAction(null)}>{t("cancel")}</button><button className="primary-button">{t("save")}</button></footer></form><button className="text-danger-button" onClick={() => setFolderAction({ ...folderAction, kind: "delete" })}>{t("deleteFolder")}</button></Dialog>}
    {folderAction?.kind === "delete" && <Dialog title={t("deleteFolder")} onClose={() => setFolderAction(null)}><p>{t("deleteFolderHint")}</p><footer className="actions"><button className="secondary-button" onClick={() => setFolderAction(null)}>{t("cancel")}</button><button className="danger-button" onClick={() => void ws.removeFolder(folderAction.folder).then(() => { emitGuideAction("folder:deleted", { folderId: folderAction.folder.id }); if (filter === folderAction.folder.id) setFilter(null); setFolderAction(null); })}>{t("deleteFolder")}</button></footer></Dialog>}
    {modal === "move" && <Dialog title={t("move")} onClose={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); ws.move(folder || null); setModal(null); }}><label>{t("folders")}<select value={folder} onChange={e => setFolder(e.target.value)}><option value="">{t("noFolder")}</option>{ws.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><footer className="actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>{t("cancel")}</button><button className="primary-button">{t("save")}</button></footer></form></Dialog>}
    {modal === "settings" && <Dialog title={t("settings")} onClose={() => setModal(null)}><div className="settings-layout"><section className="settings-section"><label>{t("language")}<select value={language} onChange={e => setLanguage(e.target.value as "vi" | "en")}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("theme")}</strong><small>{t("themeChoose")}</small></div><ThemePicker theme={selectedTheme} onChange={setTheme} canUsePremium={accountPlan.effectivePlanId !== "free"} onLocked={openPlans}/></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("webBackground")}</strong><small>{t("webBackgroundHint")}</small></div><WebBackgroundControls background={webBackground} canUseUpload={accountPlan.effectivePlanId === "pro" || accountPlan.effectivePlanId === "max"} onLocked={openPlans} onChange={setWebBackground}/></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("toolbarPosition")}</strong><small>{t("toolbarPositionHint")}</small></div><div className="toolbar-position-options" role="radiogroup" aria-label={t("toolbarPosition")}>{TOOLBAR_POSITIONS.map(position => <button type="button" key={position} className={toolbarPosition === position ? "selected" : ""} aria-pressed={toolbarPosition === position} onClick={() => setToolbarPosition(position)}><span className={`toolbar-position-preview ${position}`} aria-hidden="true"/><span>{t(TOOLBAR_LABELS[position])}</span></button>)}</div></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("toolbarCustomize")}</strong><small>{t("toolbarCustomizeHint")}</small></div><ToolbarCustomization visibleToolIds={visibleToolIds} onChange={setVisibleToolIds}/></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("mobileZoomControls")}</strong><small>{t("mobileZoomControlsHint")}</small></div><label className="settings-toggle"><input type="checkbox" checked={mobileZoomControlsVisible} onChange={event => setMobileZoomControlsVisible(event.target.checked)}/><span>{t("showMobileZoomControls")}</span></label></section><section className="settings-section"><strong>{language === "vi" ? "Thú cưng" : "Pet"}</strong><label className="settings-toggle"><input type="checkbox" checked={petVisible} onChange={event => setPetVisible(event.target.checked)}/><span>{language === "vi" ? "Hiển thị thú cưng" : "Show pet"}</span></label><button className="secondary-button" onClick={() => window.dispatchEvent(new Event("mindcanvas:reset-pet-position"))}>{language === "vi" ? "Đặt lại vị trí thú cưng" : "Reset pet position"}</button></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("focusTimerVisibility")}</strong><small>{t("focusTimerVisibilityHint")}</small></div><label className="settings-toggle"><input type="checkbox" checked={timerVisible} onChange={event => setTimerVisible(event.target.checked)}/><span>{t("showFocusTimer")}</span></label></section><section className="settings-section"><div className="settings-section-heading"><strong>{t("installApp")}</strong><small>{t("pwaOfflineHint")}</small></div><button className="secondary-button" onClick={() => setModal("install")}><Smartphone size={17}/>{t(pwa.installed ? "appInstalled" : "installApp")}</button></section><section className="settings-section settings-help"><p>{t("accountHint")}</p><h3>{t("help")}</h3><p>{t("helpText")}</p><button className="secondary-button" onClick={() => { setModal(null); fileInput.current?.click(); }}><Upload size={17}/>{t("import")}</button></section></div></Dialog>}
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
    {ws.conflict && <CloudConflictDialog conflict={ws.conflict} autoResolveCloud onResolve={resolution => ws.resolveConflict(resolution, t("copySuffix"))}/>}
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
