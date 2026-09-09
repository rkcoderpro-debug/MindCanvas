import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ChevronDown, ChevronRight, Circle, Cloud, FileText, Folder, FolderPlus, Highlighter, LogIn, LogOut, MousePointer2, PenLine, Plus, Redo2, Settings2, Share2, Sparkles, Square, StickyNote, Undo2, Upload, ZoomIn } from "lucide-react";
import type { BoardState, StructuredMindMap, ToolMode } from "@mindcanvas/shared";
import CanvasBoard from "./components/CanvasBoard";
import { generateMindMap, uploadPdf } from "./lib/api";
import { assignProjectToFolder, createBlankBoard, createFolder, createProject, getCurrentUser, isSupabaseConfigured, listFolders, listProjects, loadLatestBoardNote, loadProject, saveBoardNote, saveDocumentToStorage, signInWithGoogle, signOut, supabase, type FolderSummary, type ProjectSummary } from "./lib/supabase";

const toolItems: Array<{ id: ToolMode; label: string; icon: typeof MousePointer2 }> = [
  { id: "select", label: "Chọn", icon: MousePointer2 }, { id: "text", label: "Text", icon: StickyNote }, { id: "pen", label: "Bút", icon: PenLine }, { id: "highlighter", label: "Highlight", icon: Highlighter }, { id: "rect", label: "Hình chữ nhật", icon: Square }, { id: "ellipse", label: "Hình tròn", icon: Circle }, { id: "connector", label: "Connector", icon: ArrowDown },
];

function loadBoard(userId?: string) {
  try { const saved = localStorage.getItem(`mindcanvas:board:v2:${userId ?? "guest"}`); return saved ? JSON.parse(saved) as BoardState : createBlankBoard(); } catch { return createBlankBoard(); }
}

type SessionUser = { id: string; email?: string; user_metadata?: { full_name?: string; name?: string; avatar_url?: string } };

export default function App() {
  const [board, setBoard] = useState<BoardState>(() => loadBoard());
  const [history, setHistory] = useState<BoardState[]>([]);
  const [future, setFuture] = useState<BoardState[]>([]);
  const [tool, setTool] = useState<ToolMode>("select");
  const [activeNav, setActiveNav] = useState("workspace");
  const [showAi, setShowAi] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline" | "error">("saved");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState("Canvas đang trống. Tải PDF để tạo mind map có thể chỉnh sửa.");
  const [aiGraph, setAiGraph] = useState<StructuredMindMap | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [cloudReady, setCloudReady] = useState(!isSupabaseConfigured);
  const [cloudNoteId, setCloudNoteId] = useState<string | undefined>();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void getCurrentUser().then((user) => { if (!cancelled) setSessionUser(user); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSessionUser(session?.user ?? null));
    return () => { cancelled = true; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!sessionUser) { setCloudReady(true); setCloudNoteId(undefined); setBoard(loadBoard()); return; }
    let cancelled = false; setCloudReady(false);
    void Promise.all([loadLatestBoardNote(), listProjects(), listFolders()]).then(([saved, nextProjects, nextFolders]) => {
      if (cancelled) return;
      setBoard(saved?.board ?? createBlankBoard()); setCloudNoteId(saved?.id); setProjects(nextProjects); setFolders(nextFolders); setCloudReady(true);
    }).catch(() => { if (!cancelled) { setBoard(createBlankBoard()); setCloudReady(true); setAiMessage("Không đọc được dữ liệu cloud; canvas trắng vẫn sẵn sàng."); } });
    return () => { cancelled = true; };
  }, [sessionUser?.id]);

  useEffect(() => {
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      localStorage.setItem(`mindcanvas:board:v2:${sessionUser?.id ?? "guest"}`, JSON.stringify(board));
      if (sessionUser && cloudReady) void saveBoardNote(board, cloudNoteId).then((id) => { setCloudNoteId(id); setProjects((items) => [{ id: id ?? board.id, title: board.title, folderId: items.find((item) => item.id === id)?.folderId ?? null, updatedAt: board.updatedAt }, ...items.filter((item) => item.id !== id && item.id !== board.id)]); }).then(() => setSaveState("saved")).catch(() => setSaveState("error"));
      else setSaveState(navigator.onLine ? "saved" : "offline");
    }, 700);
    return () => window.clearTimeout(timer);
  }, [board, sessionUser, cloudReady, cloudNoteId]);

  useEffect(() => { const onOffline = () => setSaveState("offline"); const onOnline = () => setSaveState("saved"); window.addEventListener("offline", onOffline); window.addEventListener("online", onOnline); return () => { window.removeEventListener("offline", onOffline); window.removeEventListener("online", onOnline); }; }, []);

  const status = useMemo(() => saveState === "saving" ? "Đang lưu" : saveState === "offline" ? "Offline · đã lưu trên máy" : saveState === "error" ? "Lỗi lưu · bản máy đã giữ" : "Đã lưu", [saveState]);
  const updateBoard = (next: BoardState) => { setHistory((items) => [...items.slice(-29), board]); setFuture([]); setBoard(next); };
  const undo = () => { const previous = history.at(-1); if (!previous) return; setHistory((items) => items.slice(0, -1)); setFuture((items) => [board, ...items.slice(0, 29)]); setBoard(previous); };
  const redo = () => { const next = future[0]; if (!next) return; setFuture((items) => items.slice(1)); setHistory((items) => [...items.slice(-29), board]); setBoard(next); };
  const signIn = async () => { const result = await signInWithGoogle(); if (result.error) setAiMessage(result.error.message); };
  const handleSignOut = async () => { try { await signOut(); } catch (error) { setAiMessage(error instanceof Error ? error.message : "Không thể đăng xuất."); } };
  const refreshProjects = async () => { if (!sessionUser) return; const [nextProjects, nextFolders] = await Promise.all([listProjects(), listFolders()]); setProjects(nextProjects); setFolders(nextFolders); };
  const newProject = async () => { const title = window.prompt("Tên project mới", "Untitled canvas")?.trim(); if (!title) return; try { const created = await createProject(title); setBoard(createBlankBoard(created.id, created.title)); setCloudNoteId(created.id); setHistory([]); setFuture([]); await refreshProjects(); } catch (error) { setAiMessage(error instanceof Error ? error.message : "Không thể tạo project."); } };
  const openProject = async (project: ProjectSummary) => { try { const opened = await loadProject(project.id); if (opened) { setBoard(opened.board); setCloudNoteId(opened.id); setHistory([]); setFuture([]); setActiveNav("workspace"); } } catch (error) { setAiMessage(error instanceof Error ? error.message : "Không thể mở project."); } };
  const newFolder = async () => { const name = window.prompt("Tên folder mới")?.trim(); if (!name) return; try { await createFolder(name); await refreshProjects(); } catch (error) { setAiMessage(error instanceof Error ? error.message : "Không thể tạo folder."); } };
  const moveProject = async () => { if (!sessionUser || !cloudNoteId) { setAiMessage("Hãy đăng nhập và lưu project trước khi di chuyển."); return; } const options = folders.map((folder, index) => `${index + 1}. ${folder.name}`).join("\n"); const choice = window.prompt(`Nhập số folder (để trống để bỏ folder):\n${options}`); const index = choice ? Number(choice) - 1 : -1; const folderId = Number.isInteger(index) && folders[index] ? folders[index].id : null; try { await assignProjectToFolder(cloudNoteId, folderId); await refreshProjects(); setAiMessage(folderId ? "Đã chuyển project vào folder." : "Đã bỏ project khỏi folder."); } catch (error) { setAiMessage(error instanceof Error ? error.message : "Không thể di chuyển project."); } };
  const shareProject = async () => { try { await navigator.clipboard.writeText(window.location.href); setAiMessage("Đã copy link project. Quyền truy cập vẫn theo tài khoản Supabase."); } catch { setAiMessage("Không thể copy link trên trình duyệt này."); } };

  const handlePdf = async () => {
    if (!file) return; setBusy(true); setAiMessage("Đang đọc tài liệu và chuẩn bị cấu trúc mind map…");
    try { const document = await uploadPdf(file); if (sessionUser) await saveDocumentToStorage(file, document.id, document.text, document.pageCount); const result = await generateMindMap(document.text, document.id); setAiGraph(result.graph); setAiMessage(`Đã tạo bản nháp từ ${result.provider}. Kiểm tra graph rồi bấm Apply để thêm vào canvas.`); }
    catch (error) { setAiMessage(error instanceof Error ? `${error.message} Canvas hiện tại vẫn được giữ nguyên.` : "Không thể xử lý PDF."); } finally { setBusy(false); }
  };

  const visibleProjects = projects.filter((project) => !activeFolderId || project.folderId === activeFolderId);
  const userInitial = sessionUser?.user_metadata?.name?.[0] ?? sessionUser?.user_metadata?.full_name?.[0] ?? sessionUser?.email?.[0]?.toUpperCase() ?? "G";
  const avatar = (small = false) => <div className={`avatar${small ? " small" : ""}`}>{sessionUser?.user_metadata?.avatar_url ? <img src={sessionUser.user_metadata.avatar_url} alt="" /> : userInitial}</div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={17} /></div><span>MindCanvas</span><span className="beta">V1</span></div>
      <div className="workspace-switcher">{avatar()}<div><strong>Không gian học</strong><small>{sessionUser ? "Cloud workspace" : "Local workspace"}</small></div><ChevronDown size={16} /></div>
      <nav className="nav-list" aria-label="Điều hướng chính"><button className={activeNav === "workspace" ? "active" : ""} onClick={() => setActiveNav("workspace")}><Archive size={17} /> Workspace</button><button className={activeNav === "recent" ? "active" : ""} onClick={() => setActiveNav("recent")}><FileText size={17} /> Gần đây <span className="nav-count">{projects.length}</span></button></nav>
      <div className="section-label">FOLDERS <button aria-label="Tạo folder" onClick={() => void newFolder()}><Plus size={14} /></button></div>
      <div className="folder-list">{folders.map((folder) => <button key={folder.id} className={activeFolderId === folder.id ? "folder-active" : ""} onClick={() => setActiveFolderId(activeFolderId === folder.id ? null : folder.id)}><Folder size={16} /> {folder.name}</button>)}{sessionUser && !folders.length && <span className="empty-sidebar">Chưa có folder</span>}</div>
      <div className="sidebar-projects">{(activeNav === "recent" ? visibleProjects : visibleProjects.slice(0, 6)).map((project) => <button key={project.id} onClick={() => void openProject(project)} title={project.title}><FileText size={14} /> <span>{project.title}</span></button>)}{sessionUser && !visibleProjects.length && <span className="empty-sidebar">Chưa có project</span>}</div>
      <div className="sidebar-bottom"><button onClick={() => setShowSettings(true)}><Settings2 size={17} /> Cài đặt</button><button onClick={() => void shareProject()}><Share2 size={17} /> Chia sẻ workspace</button><div className="profile-card">{avatar(true)}<div><strong>{sessionUser?.user_metadata?.full_name ?? sessionUser?.user_metadata?.name ?? "Khách"}</strong><small>{sessionUser ? (sessionUser.email ?? "Google account") : "Chưa đăng nhập"}</small></div>{sessionUser ? <button className="profile-action" aria-label="Đăng xuất" onClick={() => void handleSignOut()}><LogOut size={15} /></button> : <ChevronRight size={15} />}</div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={15} /><strong>{board.title}</strong></div><div className="top-actions"><div className={`save-status ${saveState}`}><Cloud size={15} /> {status}</div><button className="icon-button" aria-label="Hoàn tác" onClick={undo} disabled={!history.length}><Undo2 size={18} /></button><button className="icon-button" aria-label="Làm lại" onClick={redo} disabled={!future.length}><Redo2 size={18} /></button><button className="login-button" onClick={sessionUser ? () => void handleSignOut() : signIn}><LogIn size={16} /> {sessionUser ? `Đã đăng nhập · ${sessionUser.email ?? "Google"}` : isSupabaseConfigured ? "Đăng nhập Google" : "Local mode"}</button></div></header>
      <div className="editor-heading"><div><div className="eyebrow">NOTE · EDITABLE CANVAS</div><h1>{board.title}</h1><p>{sessionUser ? "Project riêng của bạn · dữ liệu được lưu trên Supabase." : "Canvas trắng · đăng nhập Google để lưu và mở project trên cloud."}</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => void newProject()}><Plus size={16} /> Project mới</button><button className="secondary-button" onClick={() => void moveProject()}><FolderPlus size={16} /> Di chuyển</button><button className="secondary-button" onClick={() => void shareProject()}><Share2 size={16} /> Chia sẻ</button><button className="primary-button" onClick={() => setShowAi(true)}><Sparkles size={16} /> Ask AI</button></div></div>
      <div className="editor-frame"><div className="drawing-toolbar" role="toolbar" aria-label="Công cụ vẽ">{toolItems.map(({ id, label, icon: Icon }) => <button key={id} className={tool === id ? "selected" : ""} onClick={() => setTool(id)} title={label} aria-label={label}><Icon size={18} /></button>)}<span className="toolbar-divider" /><button title="Tải tài liệu" aria-label="Tải tài liệu" onClick={() => setShowAi(true)}><Upload size={18} /></button><button title="Phóng to" aria-label="Phóng to" onClick={() => setBoard((current) => ({ ...current, viewport: { ...current.viewport, scale: Math.min(2.2, current.viewport.scale + 0.1) } }))}><ZoomIn size={18} /></button></div><CanvasBoard board={board} tool={tool} onChange={updateBoard} /><div className="canvas-legend"><span><span className="legend-dot indigo" /> Mind map</span><span><span className="legend-dot yellow" /> Ghi chú cá nhân</span></div></div>
      <div className="bottom-note"><span>Canvas mới · dùng công cụ trên thanh nổi để bắt đầu.</span><button onClick={() => setShowAi(true)}><Sparkles size={15} /> Tạo mind map từ tài liệu</button></div>
    </main>
    {showAi && <div className="modal-backdrop" onClick={() => setShowAi(false)}><section className="ai-panel" onClick={(event) => event.stopPropagation()}><div className="panel-header"><div><div className="eyebrow">AI WORKFLOW</div><h2>Biến PDF thành mind map</h2></div><button className="close-button" onClick={() => setShowAi(false)}>×</button></div><p className="panel-copy">Tải lên tài liệu, AI sẽ trích xuất ý chính thành graph có thể kéo, sửa, nối và hoàn tác.</p><label className="upload-drop"><Upload size={22} /><strong>{file ? file.name : "Chọn file PDF"}</strong><span>{file ? "Sẵn sàng xử lý" : "Tối đa 10 MB · Gemini xử lý ở server"}</span><input type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><div className="ai-note"><Sparkles size={16} /><span>{aiMessage}</span></div>{aiGraph && <div className="graph-preview"><strong>{aiGraph.title}</strong><span>{aiGraph.nodes.length} nodes · {aiGraph.edges.length} edges</span><button className="secondary-button" onClick={() => { const nodes = aiGraph.nodes.map((node, index) => ({ id: node.id, label: node.label, x: 320 + (index % 3) * 220, y: 150 + Math.floor(index / 3) * 110, width: 165, height: 58, color: index === 0 ? "#dce5ff" : "#ffffff", sourcePage: node.sourcePage })); updateBoard({ ...board, title: aiGraph.title, nodes: [...board.nodes, ...nodes], edges: [...board.edges, ...aiGraph.edges] }); setAiMessage("Đã Apply graph vào canvas. Bạn có thể kéo, sửa và Undo."); setAiGraph(null); }}>Apply vào canvas</button></div>}<div className="panel-footer"><span className="provider-pill">Provider: Gemini</span><button className="primary-button" disabled={!file || busy} onClick={handlePdf}>{busy ? "Đang xử lý…" : "Tạo bản nháp"}</button></div></section></div>}
    {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><section className="settings-panel" onClick={(event) => event.stopPropagation()}><div className="panel-header"><div><div className="eyebrow">SETTINGS</div><h2>Cài đặt workspace</h2></div><button className="close-button" onClick={() => setShowSettings(false)}>×</button></div><p className="panel-copy">{sessionUser ? `Tài khoản: ${sessionUser.email ?? "Google account"}. Các project và PDF chỉ hiển thị theo quyền của tài khoản này.` : "Bạn đang ở local mode. Đăng nhập Google để đồng bộ project và PDF trên cloud."}</p><button className="secondary-button" onClick={() => { localStorage.removeItem("mindcanvas:board:v1"); setShowSettings(false); setAiMessage("Đã xóa dữ liệu demo cũ khỏi trình duyệt."); }}>Xóa dữ liệu demo cũ</button></section></div>}
  </div>;
}
