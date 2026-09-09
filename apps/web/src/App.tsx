import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ChevronDown, ChevronRight, Circle, Cloud, FileText, Folder, FolderPlus, Highlighter, LogIn, MousePointer2, PenLine, Plus, Redo2, Search, Settings2, Share2, Sparkles, Square, StickyNote, Undo2, Upload, ZoomIn } from "lucide-react";
import type { BoardState, StructuredMindMap, ToolMode } from "@mindcanvas/shared";
import CanvasBoard from "./components/CanvasBoard";
import { generateMindMap, uploadPdf } from "./lib/api";
import { getCurrentUser, isSupabaseConfigured, loadLatestBoardNote, saveBoardNote, saveDocumentToStorage, signInWithGoogle, supabase } from "./lib/supabase";

const demoBoard: BoardState = {
  id: "demo-board", title: "Sinh học tế bào", updatedAt: new Date().toISOString(), viewport: { x: 72, y: 80, scale: 1 },
  texts: [{ id: "text-1", text: "Ghi chú nhanh: tập trung vào mối quan hệ giữa cấu trúc và chức năng.", x: 80, y: 450, width: 300 }],
  shapes: [{ id: "shape-1", kind: "rect", x: 670, y: 390, width: 230, height: 95, color: "#fff8df" }], drawings: [],
  nodes: [
    { id: "node-root", label: "Tế bào", x: 430, y: 170, width: 170, height: 66, color: "#dce5ff" },
    { id: "node-1", label: "Màng tế bào", x: 160, y: 75, width: 180, height: 58, color: "#ffffff", sourcePage: 2 },
    { id: "node-2", label: "Nhân tế bào", x: 160, y: 280, width: 180, height: 58, color: "#ffffff", sourcePage: 3 },
    { id: "node-3", label: "Ti thể", x: 720, y: 80, width: 150, height: 58, color: "#ffffff", sourcePage: 4 },
    { id: "node-4", label: "Tạo năng lượng", x: 930, y: 190, width: 175, height: 58, color: "#ffffff" },
  ],
  edges: [{ id: "edge-1", source: "node-root", target: "node-3" }, { id: "edge-2", source: "node-root", target: "node-4" }, { id: "edge-3", source: "node-1", target: "node-root" }, { id: "edge-4", source: "node-2", target: "node-root" }],
};

const toolItems: Array<{ id: ToolMode; label: string; icon: typeof MousePointer2 }> = [
  { id: "select", label: "Chọn", icon: MousePointer2 }, { id: "text", label: "Text", icon: StickyNote }, { id: "pen", label: "Bút", icon: PenLine }, { id: "highlighter", label: "Highlight", icon: Highlighter }, { id: "rect", label: "Hình chữ nhật", icon: Square }, { id: "ellipse", label: "Hình tròn", icon: Circle }, { id: "connector", label: "Connector", icon: ArrowDown },
];

function loadBoard() { try { const saved = localStorage.getItem("mindcanvas:board:v1"); return saved ? JSON.parse(saved) as BoardState : demoBoard; } catch { return demoBoard; } }

export default function App() {
  const [board, setBoard] = useState<BoardState>(loadBoard);
  const [history, setHistory] = useState<BoardState[]>([]);
  const [future, setFuture] = useState<BoardState[]>([]);
  const [tool, setTool] = useState<ToolMode>("select");
  const [activeNav, setActiveNav] = useState("workspace");
  const [showAi, setShowAi] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline">("saved");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState("Upload PDF để tạo mind map có thể chỉnh sửa.");
  const [aiGraph, setAiGraph] = useState<StructuredMindMap | null>(null);
  const [sessionUser, setSessionUser] = useState<{ id: string; email?: string; user_metadata?: { full_name?: string; name?: string; avatar_url?: string } } | null>(null);
  const [cloudReady, setCloudReady] = useState(!isSupabaseConfigured);
  const [cloudNoteId, setCloudNoteId] = useState<string | undefined>();

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void getCurrentUser().then((user) => { if (!cancelled) setSessionUser(user); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSessionUser(session?.user ?? null));
    return () => { cancelled = true; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!sessionUser) { setCloudReady(true); return; }
    let cancelled = false; setCloudReady(false);
    void loadLatestBoardNote().then((saved) => { if (cancelled) return; if (saved?.board?.nodes) { setBoard(saved.board); setCloudNoteId(saved.id); } setCloudReady(true); }).catch(() => { if (!cancelled) { setCloudReady(true); setAiMessage("Không đọc được note cloud; app vẫn giữ bản local."); } });
    return () => { cancelled = true; };
  }, [sessionUser?.id]);
  useEffect(() => {
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      localStorage.setItem("mindcanvas:board:v1", JSON.stringify(board));
      if (sessionUser && cloudReady) void saveBoardNote(board, cloudNoteId).then(setCloudNoteId).then(() => setSaveState("saved")).catch(() => setSaveState("offline"));
      else setSaveState(navigator.onLine ? "saved" : "offline");
    }, 700);
    return () => window.clearTimeout(timer);
  }, [board, sessionUser, cloudReady, cloudNoteId]);
  useEffect(() => { const onOffline = () => setSaveState("offline"); const onOnline = () => setSaveState("saved"); window.addEventListener("offline", onOffline); window.addEventListener("online", onOnline); return () => { window.removeEventListener("offline", onOffline); window.removeEventListener("online", onOnline); }; }, []);

  const status = useMemo(() => saveState === "saving" ? "Đang lưu" : saveState === "offline" ? "Offline · đã lưu trên máy" : "Đã lưu", [saveState]);

  const updateBoard = (next: BoardState) => { setHistory((items) => [...items.slice(-29), board]); setFuture([]); setBoard(next); };
  const undo = () => { const previous = history.at(-1); if (!previous) return; setHistory((items) => items.slice(0, -1)); setFuture((items) => [board, ...items.slice(0, 29)]); setBoard(previous); };
  const redo = () => { const next = future[0]; if (!next) return; setFuture((items) => items.slice(1)); setHistory((items) => [...items.slice(-29), board]); setBoard(next); };

  const signIn = async () => { const result = await signInWithGoogle(); if (result.error) setAiMessage(result.error.message); };

  const handlePdf = async () => {
    if (!file) return;
    setBusy(true); setAiMessage("Đang đọc tài liệu và chuẩn bị cấu trúc mind map…");
    try {
      const document = await uploadPdf(file);
      if (sessionUser) await saveDocumentToStorage(file, document.id, document.text, document.pageCount);
      const result = await generateMindMap(document.text, document.id);
      setAiGraph(result.graph);
      setAiMessage(`Đã tạo bản nháp từ ${result.provider}. Kiểm tra graph rồi bấm Apply để thêm vào canvas.`);
    } catch (error) {
      setAiMessage(error instanceof Error ? `${error.message} Demo vẫn hoạt động với dữ liệu local.` : "Không thể xử lý PDF.");
    } finally { setBusy(false); }
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={17} /></div><span>MindCanvas</span><span className="beta">V1</span></div>
      <div className="workspace-switcher"><div className="avatar">{sessionUser?.user_metadata?.name?.[0] ?? sessionUser?.user_metadata?.full_name?.[0] ?? "T"}</div><div><strong>Không gian học</strong><small>{sessionUser ? "Cloud workspace" : "Personal workspace"}</small></div><ChevronDown size={16} /></div>
      <nav className="nav-list" aria-label="Điều hướng chính">
        <button className={activeNav === "workspace" ? "active" : ""} onClick={() => setActiveNav("workspace")}><Archive size={17} /> Workspace</button>
        <button className={activeNav === "recent" ? "active" : ""} onClick={() => setActiveNav("recent")}><FileText size={17} /> Gần đây <span className="nav-count">4</span></button>
      </nav>
      <div className="section-label">FOLDERS <button aria-label="Tạo folder"><Plus size={14} /></button></div>
      <div className="folder-list"><button><Folder size={16} /> Môn học</button><button><Folder size={16} /> Tài liệu PDF</button><button><Folder size={16} /> Ý tưởng</button></div>
      <div className="sidebar-bottom"><button><Settings2 size={17} /> Cài đặt</button><button><Share2 size={17} /> Chia sẻ workspace</button><div className="profile-card"><div className="avatar small">{sessionUser?.user_metadata?.name?.[0] ?? "T"}</div><div><strong>{sessionUser?.user_metadata?.full_name ?? sessionUser?.user_metadata?.name ?? "Tiến"}</strong><small>{sessionUser ? (sessionUser.email ?? "Google account") : "Demo mode"}</small></div><ChevronRight size={15} /></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={15} /><strong>{board.title}</strong></div><div className="top-actions"><div className={`save-status ${saveState}`}><Cloud size={15} /> {status}</div><button className="icon-button" aria-label="Hoàn tác" onClick={undo} disabled={!history.length}><Undo2 size={18} /></button><button className="icon-button" aria-label="Làm lại" onClick={redo} disabled={!future.length}><Redo2 size={18} /></button><button className="login-button" onClick={signIn}><LogIn size={16} /> {isSupabaseConfigured ? "Đăng nhập Google" : "Demo mode"}</button></div></header>
      <div className="editor-heading"><div><div className="eyebrow">NOTE · EDITABLE CANVAS</div><h1>{board.title}</h1><p>Mind map và ghi chú của bạn trong một không gian trực quan.</p></div><div className="heading-actions"><button className="secondary-button"><FolderPlus size={16} /> Di chuyển</button><button className="secondary-button"><Share2 size={16} /> Chia sẻ</button><button className="primary-button" onClick={() => setShowAi(true)}><Sparkles size={16} /> Ask AI</button></div></div>
      <div className="editor-frame">
        <div className="drawing-toolbar" role="toolbar" aria-label="Công cụ vẽ">{toolItems.map(({ id, label, icon: Icon }) => <button key={id} className={tool === id ? "selected" : ""} onClick={() => setTool(id)} title={label} aria-label={label}><Icon size={18} /></button>)}<span className="toolbar-divider" /><button title="Tải tài liệu" aria-label="Tải tài liệu" onClick={() => setShowAi(true)}><Upload size={18} /></button><button title="Phóng to" aria-label="Phóng to"><ZoomIn size={18} /></button></div>
        <CanvasBoard board={board} tool={tool} onChange={updateBoard} />
        <div className="canvas-legend"><span><span className="legend-dot indigo" /> Mind map</span><span><span className="legend-dot yellow" /> Ghi chú cá nhân</span></div>
      </div>
      <div className="bottom-note"><span>Tip: dùng connector để nối các ý; edge sẽ tự bám theo node khi bạn kéo.</span><button onClick={() => setShowAi(true)}><Sparkles size={15} /> Tạo mind map từ tài liệu</button></div>
    </main>

    {showAi && <div className="modal-backdrop" onClick={() => setShowAi(false)}><section className="ai-panel" onClick={(event) => event.stopPropagation()}><div className="panel-header"><div><div className="eyebrow">AI WORKFLOW</div><h2>Biến PDF thành mind map</h2></div><button className="close-button" onClick={() => setShowAi(false)}>×</button></div><p className="panel-copy">Tải lên tài liệu, AI sẽ trích xuất ý chính thành graph có thể kéo, sửa, nối và hoàn tác.</p><label className="upload-drop"><Upload size={22} /><strong>{file ? file.name : "Chọn file PDF"}</strong><span>{file ? "Sẵn sàng xử lý" : "Tối đa 10 MB · bản preview V1"}</span><input type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><div className="ai-note"><Sparkles size={16} /><span>{aiMessage}</span></div>{aiGraph && <div className="graph-preview"><strong>{aiGraph.title}</strong><span>{aiGraph.nodes.length} nodes · {aiGraph.edges.length} edges</span><button className="secondary-button" onClick={() => { const nodes = aiGraph.nodes.map((node, index) => ({ id: node.id, label: node.label, x: 320 + (index % 3) * 220, y: 150 + Math.floor(index / 3) * 110, width: 165, height: 58, color: index === 0 ? "#dce5ff" : "#ffffff", sourcePage: node.sourcePage })); updateBoard({ ...board, title: aiGraph.title, nodes: [...board.nodes, ...nodes], edges: [...board.edges, ...aiGraph.edges] }); setAiMessage("Đã Apply graph vào canvas. Bạn có thể kéo, sửa và Undo."); setAiGraph(null); }}>Apply vào canvas</button></div>}<div className="panel-footer"><span className="provider-pill">Provider: Experiential Labs → Gemini fallback</span><button className="primary-button" disabled={!file || busy} onClick={handlePdf}>{busy ? "Đang xử lý…" : "Tạo bản nháp"}</button></div></section></div>}
  </div>;
}
