import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Beaker, Cloud, Download, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { type LabProject } from "../lib/lab";
import { cleanLabViewer, LAB_MODES, labModeInfo, type LabMode } from "../lib/labModes";
import { canShare, deletePublishedLab, listMyLearningCopySources, listPublishedLabProjects, publishLab, publishedLabToLocal, type PublishedLabProject } from "../lib/learningShare";
import type { AccountPlan } from "../lib/account";
import { LearningShareButton } from "./LearningShareDialog";
import { mergeStoredLabs, readStoredLabs, saveStoredLab, deleteStoredLab, saveStoredLabThumbnail } from "../lib/labStorage";
import LabEditorDialog from "./LabEditorDialog";
import LabViewer from "./LabViewer";
import Dialog from "./Dialog";

function downloadBlob(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function matchesCloud(lab: LabProject, row: PublishedLabProject) {
  const restored = publishedLabToLocal(row);
  const fields = ["request", "sourceFileName", "sourceText", "designPrompt", "planPrompt", "programPrompt", "visualStyle"] as const;
  return fields.every(field => (lab[field] ?? (field === "visualStyle" ? "2d" : "")) === restored[field]) && lab.programHtml === row.program_html && lab.title === row.title && lab.allowExternalResources === row.allow_external_resources
    && (lab.mode ?? "freeform") === (row.lab_mode ?? "freeform") && (lab.thumbnail ?? null) === (row.thumbnail ?? null)
    && JSON.stringify(cleanLabViewer(lab.viewerConfig)) === JSON.stringify(cleanLabViewer(row.viewer_config));
}

export default function LabPage({ owner, onOpenLearning, embedded = false, accountPlan }: { owner: string | null; onOpenLearning?: () => void; embedded?: boolean; accountPlan?: AccountPlan }) {
  const { language } = useLanguage(), vi = language === "vi";
  const [labs, setLabs] = useState<LabProject[]>([]), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null), [editor, setEditor] = useState<{ initial?: LabProject } | null>(null);
  const [deleting, setDeleting] = useState<LabProject | null>(null), [query, setQuery] = useState(""), [filter, setFilter] = useState<"all" | LabMode>("all");
  const [subject, setSubject] = useState("all"), [sort, setSort] = useState("updated"), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [published, setPublished] = useState<string[]>([]), [sources, setSources] = useState<Record<string, string>>({});
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const importRef = useRef<HTMLInputElement>(null), operationLock = useRef(false);
  const cloudAllowed = !!owner && canShare("lab", accountPlan?.effectivePlanId);
  const active = labs.find(lab => lab.id === activeId);
  const visible = labs.filter(lab => (subject === "all" || lab.subject === subject) && (filter === "all" || (lab.mode ?? "freeform") === filter) && (!query.trim() || `${lab.title} ${labModeInfo(lab.mode ?? "freeform", language).label}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, language) : b.updatedAt.localeCompare(a.updatedAt));
  useEffect(() => {
    let alive = true; setReady(false); setBusy(false); setDeleting(null); setActiveId(null); setEditor(null); setLabs([]); setPublished([]); setSources({}); setError(""); setNotice("");
    void (async () => {
      try {
        const local = await readStoredLabs(owner); if (!alive) return; setLabs(local); setReady(true);
        if (owner) {
          try {
            const [remote, copies] = await Promise.all([listPublishedLabProjects(owner), listMyLearningCopySources().catch(() => [])]);
            if (!alive) return;
            const merged = await mergeStoredLabs(owner, remote.map(publishedLabToLocal)); if (!alive) return;
            // Read again after recovery: an editor may have saved while the cloud request was pending.
            const next = await readStoredLabs(owner); if (!alive) return;
            setLabs(next); setPublished(remote.filter(row => next.some(lab => lab.id === row.id && matchesCloud(lab, row))).map(row => row.id));
            setSources(Object.fromEntries(copies.filter(copy => copy.kind === "lab").map(copy => [copy.copy_id, copy.owner_name])));
            if (merged.conflicts) setNotice(vi ? "Đã giữ các bản Lab trên thiết bị có thay đổi riêng." : "Local Labs with separate changes have been preserved.");
          } catch (e) { if (alive) setNotice(e instanceof Error ? e.message : (vi ? "Chưa kết nối được cloud. Lab trên thiết bị vẫn dùng được." : "Cloud unavailable. Device Labs are still available.")); }
        }
      } catch { if (alive) setError(vi ? "Không thể mở nơi lưu Lab. Hãy kiểm tra quyền lưu dữ liệu của trình duyệt rồi tải lại." : "Lab storage could not open. Check browser storage permissions and reload."); }
    })();
    return () => { alive = false; };
  }, [owner, vi]);
  // Close card menus on Escape or clicks outside; menus never open a Lab.
  useEffect(() => {
    const close = (event: Event) => document.querySelectorAll<HTMLDetailsElement>(".lab-card-menu[open]").forEach(menu => { if (event instanceof KeyboardEvent ? event.key === "Escape" : !menu.contains(event.target as Node)) menu.open = false; });
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  async function save(draft: LabProject) {
    const account = owner;
    const saved = await saveStoredLab(account, { ...draft, id: draft.id || undefined });
    if (ownerRef.current !== account) return;
    setLabs(await readStoredLabs(account)); setPublished(ids => ids.filter(id => id !== saved.id));
    setNotice(vi ? "Đã lưu Lab trên thiết bị." : "Lab saved on this device."); setError("");
    if (activeId === draft.id) setActiveId(saved.id);
    if (cloudAllowed && account && !draft.systemDemo) {
      void publishLab(saved, account).then(async () => { const current = (await readStoredLabs(account)).find(lab => lab.id === saved.id); if (ownerRef.current === account && current?.updatedAt === saved.updatedAt) { setPublished(ids => [...new Set([...ids, saved.id])]); setNotice(vi ? "Đã lưu Lab và đồng bộ cloud." : "Lab saved and synced to cloud."); } })
        .catch(e => { if (ownerRef.current === account) setNotice(`${vi ? "Đã lưu trên thiết bị; cloud chưa đồng bộ." : "Saved on device; cloud pending."} ${e.message}`); });
    }
  }
  async function cacheCover(lab: LabProject, image: string) {
    const account = owner;
    try {
      const updated = await saveStoredLabThumbnail(account, lab.id, lab.programHtml, image);
      if (!updated || ownerRef.current !== account) return;
      setLabs(rows => rows.map(row => row.id === updated.id && row.programHtml === updated.programHtml && !row.thumbnail ? { ...row, thumbnail: updated.thumbnail } : row));
      if (account && cloudAllowed && published.includes(updated.id)) {
        setPublished(ids => ids.filter(id => id !== updated.id));
        await publishLab(updated, account);
        const latest = (await readStoredLabs(account)).find(row => row.id === updated.id);
        if (ownerRef.current === account && latest?.updatedAt === updated.updatedAt && latest.thumbnail === updated.thumbnail) setPublished(ids => [...new Set([...ids, updated.id])]);
      }
    } catch { /* A missing cover never blocks use or saving of the Lab. */ }
  }
  async function syncAll() {
    if (!owner || !cloudAllowed || operationLock.current) return;
    const account = owner; operationLock.current = true; setBusy(true); setError(""); setNotice(vi ? "Đang đồng bộ Lab…" : "Syncing Labs…");
    let uploaded = 0, failed = 0; let lastError = "";
    try {
      const local = (await readStoredLabs(account)).filter(lab => !lab.systemDemo && lab.programHtml.trim());
      for (const lab of local) { if (ownerRef.current !== account) return; try { await publishLab(lab, account); uploaded++; } catch (e) { failed++; lastError = e instanceof Error ? e.message : String(e); } }
      const remote = await listPublishedLabProjects(account); const current = await readStoredLabs(account);
      if (ownerRef.current !== account) return;
      setPublished(remote.filter(row => current.some(lab => lab.id === row.id && matchesCloud(lab, row))).map(row => row.id));
      setNotice(vi ? `Đã đồng bộ ${uploaded} Lab${failed ? `; ${failed} Lab chưa đồng bộ. ${lastError}` : "."}` : `Synced ${uploaded} Labs${failed ? `; ${failed} pending. ${lastError}` : "."}`);
    } catch (e) { if (ownerRef.current === account) setError(e instanceof Error ? e.message : "Cloud unavailable"); }
    finally { operationLock.current = false; if (ownerRef.current === account) setBusy(false); }
  }
  async function remove() {
    if (!deleting || operationLock.current) return;
    const lab = deleting, account = owner; operationLock.current = true; setBusy(true); setError("");
    try {
      if (account) await deletePublishedLab(lab.id, account);
      await deleteStoredLab(account, lab.id);
      if (ownerRef.current !== account) return;
      setLabs(await readStoredLabs(account)); setPublished(ids => ids.filter(id => id !== lab.id)); setDeleting(null); if (activeId === lab.id) setActiveId(null);
      setNotice(vi ? "Đã xóa Lab." : "Lab deleted.");
    } catch (e) { if (ownerRef.current === account) setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { operationLock.current = false; if (ownerRef.current === account) setBusy(false); }
  }
  async function importBackup(file?: File) {
    if (!file || operationLock.current) return;
    const account = owner; operationLock.current = true; setBusy(true); setError("");
    try {
      if (file.size > 50_000_000) throw new Error(vi ? "Bản sao lưu vượt 50 MB." : "Backup exceeds 50 MB.");
      const data = JSON.parse(await file.text());
      const rows = Array.isArray(data) ? data : data.format === "mindcanvas-labs-backup" && (data.version === 1 || data.version === 2) && Array.isArray(data.labs) ? data.labs : null;
      if (!rows) throw new Error(vi ? "Tệp không đúng định dạng sao lưu Lab." : "Invalid Lab backup.");
      const result = await mergeStoredLabs(account, rows); const next = await readStoredLabs(account);
      if (ownerRef.current !== account) return;
      setLabs(next); setNotice(vi ? `Đã nhập ${result.added} Lab; giữ ${result.conflicts} bản có thay đổi riêng.` : `Imported ${result.added} Labs; preserved ${result.conflicts} conflicts.`);
    } catch (e) { if (ownerRef.current === account) setError(e instanceof Error ? e.message : "Import failed"); }
    finally { operationLock.current = false; if (ownerRef.current === account) setBusy(false); }
  }
  function downloadHtml(lab: LabProject) { downloadBlob(lab.programHtml, `${lab.title.replace(/[^\p{L}\p{N}_-]+/gu, "-") || "mindcanvas-lab"}.html`, "text/html;charset=utf-8"); }
  const menu = (lab: LabProject) => <details className="lab-card-menu"><summary aria-label={`${vi ? "Tùy chọn" : "Options"}: ${lab.title}`}><MoreHorizontal size={21}/></summary><div className="lab-card-menu-items">
    <button type="button" onClick={() => setEditor({ initial: lab })}><Pencil size={16}/>{vi ? "Chỉnh sửa" : "Edit"}{lab.systemDemo ? (vi ? " bản sao" : " a copy") : ""}</button>
    {!lab.systemDemo && <LearningShareButton kind="lab" id={lab.id} title={lab.title} plan={accountPlan} available={published.includes(lab.id)}/>}
    <button type="button" onClick={() => downloadHtml(lab)}><Download size={16}/>{vi ? "Tải HTML" : "Download HTML"}</button>
    {!lab.systemDemo && <button type="button" className="text-danger-button" disabled={busy} onClick={() => { setDeleting(lab); setError(""); }}><Trash2 size={16}/>{vi ? "Xóa Lab" : "Delete Lab"}</button>}
  </div></details>;
  return <section className={`lab-page lab-library ${embedded ? "lab-page-embedded" : ""}`}>
    <header className="lab-library-header"><div><span className="eyebrow">LEARNING HUB · LAB</span><h1><Beaker size={26}/>{vi ? "Lab của tôi" : "My Labs"}</h1><p>{vi ? "Mở Lab để khám phá, thực hành và học theo cách của bạn." : "Explore, practice and learn with your interactive Labs."}</p></div><div className="lab-library-actions">
      {!embedded && onOpenLearning && <button className="secondary-button" onClick={onOpenLearning}>{vi ? "Trung tâm học tập" : "Learning Hub"}</button>}
      <button className="primary-button lab-add-button" disabled={!ready || busy} onClick={() => setEditor({})}><Plus size={18}/>{vi ? "Thêm Lab" : "Add Lab"}</button>
      <details className="lab-library-tools"><summary aria-label={vi ? "Công cụ Lab" : "Lab tools"}><MoreHorizontal size={20}/></summary><div>{cloudAllowed && <button className="secondary-button" disabled={busy} onClick={() => void syncAll()}><Cloud size={16}/>{vi ? "Đồng bộ Lab" : "Sync Labs"}</button>}<button className="secondary-button" disabled={!ready || busy} onClick={() => void readStoredLabs(owner).then(rows => downloadBlob(JSON.stringify({ format: "mindcanvas-labs-backup", version: 2, labs: rows.filter(lab => !lab.systemDemo) }), "mindcanvas-labs-backup.json", "application/json")).catch(() => setError(vi ? "Không xuất được bản sao lưu." : "Backup failed."))}><Download size={16}/>{vi ? "Xuất sao lưu" : "Export backup"}</button><button className="secondary-button" disabled={!ready || busy} onClick={() => importRef.current?.click()}><Upload size={16}/>{vi ? "Nhập sao lưu" : "Import backup"}</button></div></details>
      <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e => { void importBackup(e.target.files?.[0]); e.target.value = ""; }}/>
    </div></header>
    {error && <p className="form-error lab-library-message" role="alert">{error}</p>}{notice && <p className="lab-library-message" role="status">{notice}</p>}
    {!ready && !error && <p role="status">{vi ? "Đang tải thư viện Lab…" : "Loading Labs…"}</p>}
    {active ? <main className="lab-detail"><header><button className="secondary-button" onClick={() => setActiveId(null)}><ArrowLeft size={17}/>{vi ? "Thư viện Lab" : "Lab library"}</button><div><h2>{active.title}</h2><small>{labModeInfo(active.mode ?? "freeform", language).label}</small></div>{menu(active)}</header><LabViewer key={active.id} html={active.programHtml} title={active.title} allowExternalResources={active.allowExternalResources} viewerConfig={active.viewerConfig} onThumbnail={!active.thumbnail && !active.systemDemo ? image => void cacheCover(active, image) : undefined}/></main>
      : ready && <><div className="lab-library-filters"><label className="lab-library-search"><Search size={19}/><input aria-label={vi ? "Tìm Lab" : "Search Labs"} placeholder={vi ? "Tìm Lab…" : "Search Labs…"} value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label={vi ? "Lọc chế độ" : "Filter modes"} value={filter} onChange={e => setFilter(e.target.value as "all" | LabMode)}><option value="all">{vi ? "Tất cả chế độ" : "All modes"}</option>{LAB_MODES.map(mode => <option value={mode} key={mode}>{labModeInfo(mode, language).label}</option>)}</select><select aria-label={vi ? "Lọc môn" : "Filter subject"} value={subject} onChange={e => setSubject(e.target.value)}><option value="all">{vi ? "Tất cả môn" : "All subjects"}</option><option value="physics">{vi ? "Vật lý" : "Physics"}</option><option value="chemistry">{vi ? "Hóa học" : "Chemistry"}</option><option value="other">{vi ? "Khác" : "Other"}</option></select><select aria-label={vi ? "Sắp xếp Lab" : "Sort Labs"} value={sort} onChange={e => setSort(e.target.value)}><option value="updated">{vi ? "Cập nhật gần nhất" : "Recently updated"}</option><option value="title">{vi ? "Tên Lab" : "Name"}</option></select></div>
      <div className="lab-library-count">{visible.length} {vi ? "Lab" : "Labs"}</div>
      {visible.length ? <div className="lab-library-grid">{visible.map(lab => <article className="lab-library-card" key={lab.id}>
        <button className={`lab-card-open lab-cover-${lab.mode ?? "freeform"}`} aria-label={`${vi ? "Mở Lab" : "Open Lab"}: ${lab.title}`} onClick={() => { setActiveId(lab.id); setError(""); }}><div className="lab-card-cover">{lab.thumbnail ? <img src={lab.thumbnail} alt="" loading="lazy"/> : <div className="lab-card-placeholder"><Beaker size={46}/><span>{labModeInfo(lab.mode ?? "freeform", language).label}</span></div>}</div><div className="lab-card-description"><h2>{lab.title}</h2><span>{labModeInfo(lab.mode ?? "freeform", language).label}</span><small>{new Date(lab.updatedAt).toLocaleDateString(vi ? "vi-VN" : "en-US")}{lab.systemDemo ? " · Demo" : ""}</small>{sources[lab.id] && <small>{vi ? "Đã lưu từ" : "Saved from"} {sources[lab.id]}</small>}</div></button>{menu(lab)}<span className={`lab-sync-state ${published.includes(lab.id) ? "synced" : ""}`}>{lab.systemDemo ? (vi ? "Lab mẫu" : "Example") : published.includes(lab.id) ? (vi ? "Đã đồng bộ" : "Synced") : (vi ? "Trên thiết bị" : "On device")}</span>
      </article>)}</div> : <div className="lab-library-empty"><Beaker size={42}/><h2>{vi ? "Chưa có Lab phù hợp" : "No matching Labs"}</h2><p>{vi ? "Đổi bộ lọc hoặc thêm Lab từ tệp HTML của bạn." : "Change filters or add your HTML Lab."}</p><button className="primary-button" onClick={() => setEditor({})}><Plus size={17}/>{vi ? "Thêm Lab" : "Add Lab"}</button></div>}</>}
    {editor && <LabEditorDialog key={`${owner}:${editor.initial?.id ?? "new"}`} owner={owner} initial={editor.initial} onClose={() => setEditor(null)} onSave={save}/>}
    {deleting && <Dialog title={vi ? "Xóa Lab?" : "Delete Lab?"} dismissible={!busy} onClose={() => setDeleting(null)}><p>{deleting.title}</p><p>{vi ? "Lab sẽ được xóa khỏi thiết bị và cloud. Người được chia sẻ sẽ mất quyền xem bản gốc; bản sao họ đã lưu vẫn còn." : "Remove this Lab from device and cloud. Shared access to the original ends; saved copies remain."}</p>{error && <p role="alert" className="form-error">{error}</p>}<div className="lab-actions"><button className="secondary-button" disabled={busy} onClick={() => setDeleting(null)}>{vi ? "Hủy" : "Cancel"}</button><button className="danger-button" disabled={busy} onClick={() => void remove()}>{busy ? (vi ? "Đang xóa…" : "Deleting…") : (vi ? "Xóa Lab" : "Delete Lab")}</button></div></Dialog>}
  </section>;
}
