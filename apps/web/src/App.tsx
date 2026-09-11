import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ProjectFolder } from "./lib/projectStore";
import { ArrowLeft, Clock3, Download, FileText, Folder, FolderPlus, FolderCog, Globe2, LayoutGrid, LogIn, LogOut, MoreHorizontal, Plus, Redo2, RefreshCw, Save, Settings2, Sparkles, Undo2, Upload, X, Star, Trash2 } from "lucide-react";
import CanvasBoard from "./components/CanvasBoard";
import WorkspaceHome from "./components/WorkspaceHome";
import FolderManager from "./components/FolderManager";
import Dialog from "./components/Dialog";
import AiPanel from "./components/AiPanel";
import { LanguageProvider, useLanguage, useTheme } from "./lib/i18n";
import { getCurrentUser, isSupabaseConfigured, signInWithGoogle, signOut, supabase } from "./lib/supabase";
import { applyGraph, blankBoard, exportBoard, importBoard } from "./lib/board";
import { useWorkspace } from "./hooks/useWorkspace";

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
  const { t, language, setLanguage } = useLanguage(), { theme, setTheme } = useTheme(), ws = useWorkspace(user?.id ?? null);
  const [modal, setModal] = useState<"project" | "folder" | "move" | "settings" | "ai" | null>(null);
  const [name, setName] = useState(""), [folder, setFolder] = useState(""), [filter, setFilter] = useState<string | null>(null), [folderAction, setFolderAction] = useState<{ folder: ProjectFolder; kind: "rename" | "delete" } | null>(null);
  const [recent, setRecent] = useState(false), [working, setWorking] = useState(false);
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

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={home}><span className="brand-mark"><Sparkles size={20}/></span>MindCanvas<span className="beta">V2.2</span></button>
      <div className="profile-card"><div className="avatar">{user?.user_metadata.avatar_url ? <img src={user.user_metadata.avatar_url} alt=""/> : String(accountName)[0]}</div><div><strong>{accountName}</strong><small>{user ? t("cloud") : t("local")}</small></div></div>
      <nav aria-label={t("workspace")} className="nav-list">
        <button className={!ws.board && !recent && !filter ? "active" : ""} onDragOver={e => e.preventDefault()} onDrop={e => dropProjectInto(e, null)} onClick={home}><LayoutGrid size={18}/>{t("workspace")}</button>
        <button className={!ws.board && recent ? "active" : ""} onClick={() => { void ws.home(); setFilter(null); setRecent(true); }}><Clock3 size={18}/>{t("recent")}<span>{ws.projects.filter(p => !p.deletedAt).length}</span></button>
        <button className={!ws.board && filter === "__favorites" ? "active" : ""} onClick={() => { void ws.home(); setFilter("__favorites"); setRecent(false); }}><Star size={18}/>{t("favorites")}</button>
        <button className={!ws.board && filter === "__trash" ? "active" : ""} onClick={() => { void ws.home(); setFilter("__trash"); setRecent(false); }}><Trash2 size={18}/>{t("trash")}</button>
      </nav>
      <div className="section-label">{t("folders")}<button className="icon-button" aria-label={t("newFolder")} onClick={() => askName("folder")}><Plus size={17}/></button></div>
      <div className="folder-list">{ws.folders.map(f => <div className={`folder-row ${filter === f.id && !ws.board ? "active" : ""}`} key={f.id} onDragOver={e => e.preventDefault()} onDrop={e => dropProjectInto(e, f.id)}><button className="folder-open" onClick={() => { void ws.home(); setFilter(f.id); setRecent(false); }}><Folder size={17}/><span>{f.name}</span></button><button className="folder-more" aria-label={`${t("folderActions")}: ${f.name}`} onClick={() => { setName(f.name); setFolderAction({ folder: f, kind: "rename" }); }}><MoreHorizontal size={16}/></button><div className="folder-dropdown">{ws.projects.filter(p=>p.folderId===f.id&&!p.deletedAt).slice(0,5).map(p=><button key={p.id} onClick={()=>void ws.open(p)}><FileText size={14}/>{p.title}</button>)}</div></div>)}{!ws.folders.length && <small>{t("noFolders")}</small>}</div>
      <button className="manage-folders-button" onClick={() => { void ws.home(); setFilter("__manager"); setRecent(false); }}><FolderCog size={17}/>{t("manageFolders")}</button>
      <div className="sidebar-bottom">
        <label className="language-control"><Globe2 size={17}/><select aria-label={t("language")} value={language} onChange={e => setLanguage(e.target.value as "vi" | "en")}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label>
        <label className="language-control"><Sparkles size={17}/><select aria-label={t("theme")} value={theme} onChange={e => setTheme(e.target.value as "light" | "dark")}><option value="light">{t("themeLight")}</option><option value="dark">{t("themeDark")}</option></select></label>
        <button onClick={() => setModal("settings")}><Settings2 size={17}/>{t("settings")}</button>
        <button disabled={working || (!user && !isSupabaseConfigured)} onClick={() => void auth()}>{user ? <LogOut size={17}/> : <LogIn size={17}/>} {user ? t("logout") : t("login")}</button>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><button onClick={home}>{ws.board ? <ArrowLeft size={17}/> : <LayoutGrid size={17}/>} {t("workspace")}</button>{ws.board && <span>/ {ws.board.title}</span>}</div>
        <div className="actions">{ws.board && <><span role="status" className={`save-status ${ws.status}`}>{t(ws.status)}</span><button className="icon-button" aria-label={t("save")} title={t("save")} onClick={() => void ws.flush()}><Save size={18}/></button><button className="icon-button" aria-label={t("undo")} title={t("undo")} disabled={!ws.canUndo} onClick={ws.undo}><Undo2 size={18}/></button><button className="icon-button" aria-label={t("redo")} title={t("redo")} disabled={!ws.canRedo} onClick={ws.redo}><Redo2 size={18}/></button></>}
        {!ws.board && <button className="icon-button" aria-label={t("refresh")} onClick={() => void ws.refresh()}><RefreshCw size={18}/></button>}
        <span className="account-badge">{user ? accountName : t("local")}</span></div>
      </header>
      {message && <div className="error-banner" role="alert"><span>{t("error")}: {message}</span><button onClick={() => { ws.setError(""); void ws.flush(); void ws.refresh(); }}>{t("retry")}</button><button aria-label={t("close")} onClick={() => ws.setError("")}><X size={16}/></button></div>}
      {ws.board ? <>
        <div className="editor-heading"><TitleInput key={ws.board.id} value={ws.board.title} label={t("rename")} onCommit={title => ws.change({ ...ws.board!, title })}/><div className="actions">
          <button className="secondary-button" onClick={() => { setFolder(ws.projects.find(p => p.id === ws.board!.id)?.folderId ?? ""); setModal("move"); }}><FolderPlus size={17}/>{t("move")}</button>
          <button className="secondary-button" title={t("exportHint")} onClick={() => exportBoard(ws.board!)}><Download size={17}/>{t("export")}</button>
          <button className="primary-button" onClick={() => setModal("ai")}><Sparkles size={17}/>{t("ai")}</button></div></div>
        <CanvasBoard key={ws.board.id} board={ws.board} onChange={ws.change} onUndo={ws.undo} onRedo={ws.redo} onSave={() => void ws.flush()}/>
      </> : filter === "__manager" ? <FolderManager projects={ws.projects} folders={ws.folders} onOpen={p=>void ws.open(p)} onManage={ws.manageProject} onDuplicate={ws.duplicateProject} onRenameFolder={ws.renameFolder} onDeleteFolder={ws.removeFolder} onCreateFolder={()=>askName("folder")}/> : <WorkspaceHome projects={visible} title={pageTitle} loading={ws.loading} folders={ws.folders} onManage={ws.manageProject} onDuplicate={ws.duplicateProject} trash={filter === "__trash"} onOpen={p => void ws.open(p)} onCreate={() => askName("project")} onImport={() => fileInput.current?.click()}/>} 
    </main>
    <input ref={fileInput} hidden type="file" accept=".json,.mindcanvas" onChange={e => void importFile(e.target.files?.[0])}/>
    {(modal === "project" || modal === "folder") && <Dialog title={t(modal === "project" ? "newProject" : "newFolder")} onClose={() => { if (!working) setModal(null); }}><form onSubmit={e => void create(e)}>
      <label>{t("name")}<input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} onFocus={e => e.target.select()}/></label>
      <footer className="actions"><button type="button" className="secondary-button" disabled={working} onClick={() => setModal(null)}>{t("cancel")}</button><button className="primary-button" disabled={!name.trim() || working}>{working ? t("saving") : t("create")}</button></footer></form></Dialog>}
    {folderAction?.kind === "rename" && <Dialog title={t("renameFolder")} onClose={() => setFolderAction(null)}><form onSubmit={e => { e.preventDefault(); const n = name.trim(); if (n) void ws.renameFolder(folderAction.folder, n).then(() => setFolderAction(null)); }}><label>{t("name")}<input autoFocus required maxLength={80} defaultValue={folderAction.folder.name} onChange={e => setName(e.target.value)}/></label><footer className="actions"><button type="button" className="secondary-button" onClick={() => setFolderAction(null)}>{t("cancel")}</button><button className="primary-button">{t("save")}</button></footer></form><button className="text-danger-button" onClick={() => setFolderAction({ ...folderAction, kind: "delete" })}>{t("deleteFolder")}</button></Dialog>}
    {folderAction?.kind === "delete" && <Dialog title={t("deleteFolder")} onClose={() => setFolderAction(null)}><p>{t("deleteFolderHint")}</p><footer className="actions"><button className="secondary-button" onClick={() => setFolderAction(null)}>{t("cancel")}</button><button className="danger-button" onClick={() => void ws.removeFolder(folderAction.folder).then(() => { if (filter === folderAction.folder.id) setFilter(null); setFolderAction(null); })}>{t("deleteFolder")}</button></footer></Dialog>}
    {modal === "move" && <Dialog title={t("move")} onClose={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); ws.move(folder || null); setModal(null); }}><label>{t("folders")}<select value={folder} onChange={e => setFolder(e.target.value)}><option value="">{t("noFolder")}</option>{ws.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><footer className="actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>{t("cancel")}</button><button className="primary-button">{t("save")}</button></footer></form></Dialog>}
    {modal === "settings" && <Dialog title={t("settings")} onClose={() => setModal(null)}><label>{t("language")}<select value={language} onChange={e => setLanguage(e.target.value as "vi" | "en")}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label><label>{t("theme")}<select value={theme} onChange={e => setTheme(e.target.value as "light" | "dark")}><option value="light">{t("themeLight")}</option><option value="dark">{t("themeDark")}</option></select></label><p>{t("accountHint")}</p><h3>{t("help")}</h3><p>{t("helpText")}</p><button className="secondary-button" onClick={() => { setModal(null); fileInput.current?.click(); }}><Upload size={17}/>{t("import")}</button></Dialog>}
    {modal === "ai" && ws.board && <AiPanel key={ws.board.id} projectId={ws.board.id} canUse={!!user} beforeGenerate={ws.flush} onClose={() => setModal(null)} onApply={(graph, mode) => { try { if (mode === "new") { const next = applyGraph(blankBoard(graph.title), graph); void ws.create(next.title, next).then(() => setModal(null)); } else { ws.change(applyGraph(ws.board!, graph)); setModal(null); } } catch { ws.setError(t("aiError")); setModal(null); } }}/>} 
  </div>;
}
function TitleInput({ value, label, onCommit }: { value: string; label: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input className="title-input" aria-label={label} value={draft} maxLength={120} onChange={e => setDraft(e.target.value)}
    onBlur={() => { if (draft.trim()) { if(draft.trim() !== value) onCommit(draft.trim()); } else setDraft(value); }}
    onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setDraft(value); }}/>;
}
