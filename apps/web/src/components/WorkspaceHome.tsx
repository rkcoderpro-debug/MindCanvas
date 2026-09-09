import { useState } from "react";
import { FilePlus2, FileText, FolderOpen, Search, Upload } from "lucide-react";
import type { Project } from "../lib/projectStore";
import { useLanguage } from "../lib/i18n";
import { elementBounds } from "../lib/board";
function previewBox(p: Project) {
  if (!p.board) return "0 0 500 240";
  const board = p.board;
  const rects = (["nodes", "texts", "shapes", "drawings"] as const).flatMap(kind => board[kind].map(el => elementBounds(board, { kind, id: el.id })!));
  if (!rects.length) return "0 0 500 240";
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
  const width = Math.max(200, Math.max(...rects.map(r => r.x + r.width)) - x);
  const height = Math.max(100, Math.max(...rects.map(r => r.y + r.height)) - y);
  return `${x - 30} ${y - 30} ${width + 60} ${height + 60}`;
}
export default function WorkspaceHome({ projects, title, loading, onOpen, onCreate, onImport }: {
  projects: Project[]; title: string; loading: boolean; onOpen: (p: Project) => void; onCreate: () => void; onImport: () => void;
}) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState(""), [sort, setSort] = useState("newest");
  const visible = projects.filter(p => p.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => sort === "newest" ? b.updatedAt.localeCompare(a.updatedAt) : a.title.localeCompare(b.title, language));
  return <section className="workspace-home">
    <div className="home-heading"><div><span className="eyebrow">MINDCANVAS</span><h1>{title}</h1></div>
      <div className="actions"><button className="secondary-button" onClick={onImport}><Upload size={18}/>{t("import")}</button>
        <button className="primary-button" onClick={onCreate}><FilePlus2 size={18}/>{t("newProject")}</button></div></div>
    <div className="home-controls"><label className="search-field"><Search size={18}/><input aria-label={t("search")} placeholder={t("search")} value={query} onChange={e => setQuery(e.target.value)}/></label>
      <select aria-label={t("newest")} value={sort} onChange={e => setSort(e.target.value)}><option value="newest">{t("newest")}</option><option value="name">{t("alphabetical")}</option></select></div>
    {loading ? <p role="status">{t("loading")}</p> : !visible.length ? <div className="empty-state"><FolderOpen size={42}/><h2>{query ? t("noResults") : t("empty")}</h2><p>{t("emptyHint")}</p><button className="primary-button" onClick={onCreate}>{t("newProject")}</button></div> :
      <div className="project-grid">{visible.map(p => <button className="project-card" key={p.id} onClick={() => onOpen(p)}>
        <div className="project-preview" aria-hidden="true">{p.board ? <svg width="100%" height="100%" viewBox={previewBox(p)}>
          <g>{p.board.shapes.slice(0, 40).map(s => s.kind === "rect" ? <rect key={s.id} x={s.x} y={s.y} width={s.width} height={s.height} rx="6" fill={s.color}/> : <ellipse key={s.id} cx={s.x+s.width/2} cy={s.y+s.height/2} rx={s.width/2} ry={s.height/2} fill={s.color}/>)}
          {p.board.drawings.slice(0, 40).map(s => <polyline key={s.id} points={s.points.map(v => `${v.x},${v.y}`).join(" ")} fill="none" stroke={s.color} strokeWidth={s.width} opacity={s.opacity}/>)}
          {p.board.nodes.slice(0, 40).map(n => <g key={n.id}><rect x={n.x} y={n.y} width={n.width} height={n.height} rx="10" fill={n.color ?? "#e1e7ff"} stroke="#a5b4ef"/><text x={n.x + 10} y={n.y + 28} fontSize="16">{n.label.slice(0, 28)}</text></g>)}
          {p.board.texts.slice(0, 40).map(n => <text key={n.id} x={n.x} y={n.y} fontSize={n.fontSize ?? 16}>{n.text.slice(0, 60)}</text>)}</g>
        </svg> : <FileText size={44}/>}</div>
        <div className="project-meta"><FileText size={19}/><div><strong>{p.title}</strong><small>{t("updated")} · {new Date(p.updatedAt).toLocaleString(language === "vi" ? "vi-VN" : "en-US")}</small>{p.pending && <small>{t("unsaved")}</small>}</div></div>
      </button>)}</div>}
  </section>;
}
