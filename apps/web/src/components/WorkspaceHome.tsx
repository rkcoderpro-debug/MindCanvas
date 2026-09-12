import { useState } from "react";
import { FilePlus2, FileText, FolderOpen, Search, Upload, Star, MoreHorizontal } from "lucide-react";
import type { Project, ProjectFolder, ProjectPatch } from "../lib/projectStore";
import { useLanguage } from "../lib/i18n";
import { elementBounds, hiddenNodes } from "../lib/board";
import { canvasTextColor, readableTextColor } from "../lib/color";
import { orderedElements, selectionBounds } from "../lib/editorCommands";
import Dialog from "./Dialog";

function Preview({ project }: { project: Project }) {
  const b = project.board; if (!b) return <FileText size={44}/>;
  const hidden = hiddenNodes(b), entries = orderedElements(b).filter(s => !hidden.has(s.id));
  const r = selectionBounds(b, entries), box = r ? `${r.x - 30} ${r.y - 30} ${Math.max(200, r.width) + 60} ${Math.max(100, r.height) + 60}` : "0 0 500 240";
  return <svg width="100%" height="100%" viewBox={box}>{entries.slice(0, 200).map(s => {
    if (s.kind === "shapes") { const n = b.shapes.find(n => n.id === s.id)!; return n.kind === "rect" ? <rect key={n.id} x={n.x} y={n.y} width={n.width} height={n.height} fill={n.color}/> : <ellipse key={n.id} cx={n.x+n.width/2} cy={n.y+n.height/2} rx={n.width/2} ry={n.height/2} fill={n.color}/>; }
    if (s.kind === "drawings") { const n = b.drawings.find(n => n.id === s.id)!; return <polyline key={n.id} points={n.points.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke={n.color} strokeWidth={n.width} opacity={n.opacity}/>; }
    if (s.kind === "edges") { const e = b.edges.find(e => e.id === s.id)!; if (hidden.has(e.source) || hidden.has(e.target)) return null; const source = [...b.nodes,...b.shapes].find(n => n.id === e.source), target = [...b.nodes,...b.shapes].find(n => n.id === e.target); return source && target ? <line key={e.id} x1={source.x+source.width} y1={source.y+source.height/2} x2={target.x} y2={target.y+target.height/2} stroke="var(--connector)" strokeWidth={2}/> : null; }
    if (s.kind === "media") { const n = b.media.find(n => n.id === s.id)!; return <g key={n.id}><rect {...elementBounds(b, s)!} rx={10} fill="var(--surface-raised)" stroke="var(--element-stroke)"/>{n.kind === "image" ? <image href={n.src} x={n.x} y={n.y} width={n.width} height={n.height} preserveAspectRatio="xMidYMid meet"/> : <text x={n.x+n.width/2} y={n.y+n.height/2} textAnchor="middle" fontSize={14} fill="var(--muted)">{n.kind === "video" ? "Video" : "Audio"}</text>}</g>; }
    if (s.kind === "embeds") { const n = b.embeds.find(n => n.id === s.id)!; const r = elementBounds(b, s)!; return <g key={n.id}><rect {...r} rx={10} fill="var(--surface-raised)" stroke="var(--element-stroke)"/><text x={r.x + r.width / 2} y={r.y + r.height / 2} textAnchor="middle" fontSize={14} fill="var(--muted)">{n.title || (n.kind === "youtube" ? "YouTube" : "Web")}</text></g>; }
    const n = b[s.kind].find(n => n.id === s.id)!, r = elementBounds(b,s)!;
    return <g key={n.id}>{s.kind === "nodes" && <rect {...r} fill={n.color ?? "var(--node-fill)"} stroke="var(--element-stroke)" rx={10}/>}<text x={r.x+10} y={r.y+25} fontSize={16} fill={s.kind === "nodes" ? readableTextColor(n.color) : canvasTextColor(n.color)}>{("label" in n ? n.label : n.text).slice(0,28)}</text></g>;
  })}</svg>;
}
function projectSearchText(project: Project) {
  return [project.title, ...(project.board?.texts.map(item => item.text) ?? []), ...(project.board?.nodes.map(item => item.label) ?? []), ...(project.board?.media.map(item => item.name) ?? []), ...(project.board?.embeds.map(item => `${item.title ?? ""} ${item.url}`) ?? []), ...(project.board?.edges.map(item => item.label ?? "") ?? [])].join(" ").toLocaleLowerCase();
}
export default function WorkspaceHome({ projects, title, loading, onOpen, onCreate, onImport, folders = [], onManage, onDuplicate, onDragProject, trash = false }: {
  projects: Project[]; title: string; loading: boolean; onOpen: (p: Project) => void; onCreate: () => void; onImport: () => void;
  folders?: ProjectFolder[]; onManage?: (p: Project, patch: ProjectPatch) => Promise<void>; onDuplicate?: (p: Project, title: string) => Promise<void>; onDragProject?: (p: Project) => void; trash?: boolean;
}) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState(""), [sort, setSort] = useState("newest"), [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string | null>(null), [error, setError] = useState("");
  const [dialog, setDialog] = useState<{ project: Project; kind: "rename" | "move" } | null>(null), [value, setValue] = useState("");
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(""); setMenu(null); try { await action(); setDialog(null); } catch (err) { setError(err instanceof Error ? err.message : t("error")); } finally { setBusy(false); } };
  const visible = projects.filter(p => projectSearchText(p).includes(query.trim().toLocaleLowerCase())).sort((a,b) => sort === "newest" ? b.updatedAt.localeCompare(a.updatedAt) : a.title.localeCompare(b.title,language));
  return <section className="workspace-home">
    <div className="home-heading"><div><span className="eyebrow">MINDCANVAS</span><h1>{title}</h1></div><div className="actions">
      <button className="secondary-button" onClick={onImport}><Upload size={18}/>{t("import")}</button><button className="primary-button" onClick={onCreate}><FilePlus2 size={18}/>{t("newProject")}</button></div></div>
    {trash && <p>{t("trashHint")}</p>}{error && <p role="alert">{error}</p>}
    <div className="home-controls"><label className="search-field"><Search size={18}/><input aria-label={t("search")} placeholder={t("search")} value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label={t("newest")} value={sort} onChange={e => setSort(e.target.value)}><option value="newest">{t("newest")}</option><option value="name">{t("alphabetical")}</option></select></div>
    {loading ? <p role="status">{t("loading")}</p> : !visible.length ? <div className="empty-state"><FolderOpen size={42}/><h2>{query ? t("noResults") : trash ? t("trashEmpty") : t("empty")}</h2>{!trash && <><p>{t("emptyHint")}</p><button className="primary-button" onClick={onCreate}>{t("newProject")}</button></>}</div> : <div className="project-grid">{visible.map(p => <article className="project-card" key={p.id} draggable={!trash} onDragStart={e => { e.dataTransfer.setData("text/mindcanvas-project", p.id); e.dataTransfer.effectAllowed = "move"; onDragProject?.(p); }}>
      <button className="project-open" disabled={trash || busy} onClick={() => onOpen(p)}><div className="project-preview" data-background={p.board?.background ?? "dots"} aria-hidden="true"><Preview project={p}/></div><div className="project-meta"><FileText size={19}/><div><strong>{p.title}</strong><small>{t("updated")} · {new Date(p.updatedAt).toLocaleString(language === "vi" ? "vi-VN" : "en-US")}</small>{p.pending && <small>{t("unsaved")}</small>}</div></div></button>
      <div className="project-card-actions">{!trash && onManage && <button className="icon-button" disabled={busy} aria-label={t(p.favorite ? "unfavorite" : "favorite")} aria-pressed={!!p.favorite} onClick={() => void run(() => onManage(p,{ favorite: !p.favorite }))}><Star size={18} fill={p.favorite ? "#f5c542" : "none"}/></button>}
        <button className="icon-button" disabled={busy} aria-label={t("projectActions") + ": " + p.title} aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}><MoreHorizontal size={20}/></button></div>
      {menu === p.id && <div className="project-menu" onKeyDown={e => { if (e.key === "Escape") setMenu(null); }}>
        {trash ? <button disabled={busy || !onManage} onClick={() => void run(() => onManage!(p,{ deletedAt: null }))}>{t("restore")}</button> : <>
          <button disabled={!onManage} onClick={() => { setValue(p.title); setDialog({ project:p,kind:"rename" }); setMenu(null); }}>{t("rename")}</button>
          <button disabled={!onManage} onClick={() => { setValue(p.folderId ?? ""); setDialog({ project:p,kind:"move" }); setMenu(null); }}>{t("move")}</button>
          <button disabled={!onDuplicate || busy} onClick={() => void run(() => onDuplicate!(p, `${p.title} — ${t("copySuffix")}`))}>{t("duplicate")}</button>
          <button disabled={!onManage || busy} onClick={() => void run(() => onManage!(p,{ deletedAt:new Date().toISOString() }))}>{t("moveToTrash")}</button>
        </>}
      </div>}
    </article>)}</div>}
    {dialog && <Dialog title={t(dialog.kind)} onClose={() => { if (!busy) setDialog(null); }}><form onSubmit={e => { e.preventDefault(); if (!onManage) return; void run(() => onManage(dialog.project,dialog.kind === "rename" ? { title:value.trim() } : { folderId:value || null })); }}><label>{t(dialog.kind === "rename" ? "name" : "folders")}{dialog.kind === "rename" ? <input required autoFocus maxLength={120} value={value} onChange={e => setValue(e.target.value)}/> : <select value={value} onChange={e => setValue(e.target.value)}><option value="">{t("noFolder")}</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}</label><footer className="actions"><button type="button" disabled={busy} onClick={() => setDialog(null)}>{t("cancel")}</button><button className="primary-button" disabled={busy || (dialog.kind === "rename" && !value.trim())}>{t("save")}</button></footer></form></Dialog>}
  </section>;
}
