import { useEffect, useRef, useState } from "react";
import { Check, Clipboard, Code2, FileUp, ImagePlus, Play, Save, Sparkles } from "lucide-react";
import Dialog from "./Dialog";
import LabViewer from "./LabViewer";
import { buildLabPlanPrompt, cleanLab, LAB_LIMITS, validateLabHtml, type LabProject } from "../lib/lab";
import { DEFAULT_LAB_VIEWER, LAB_MODES, labModeInfo, type LabMode } from "../lib/labModes";
import { labCoverFromFile } from "../lib/labPreview";
import { readLabDraft, writeLabDraft } from "../lib/labStorage";
import { emitGuideAction } from "../lib/featureGuides";
import { useLanguage } from "../lib/i18n";
import { copyTextWithFallback } from "../lib/share";

export function emptyLabEditor(): LabProject {
  return { id: "", title: "", mode: "freeform", visualStyle: "2d", viewerConfig: DEFAULT_LAB_VIEWER, subject: "other", learnerLevel: "", sourceFileName: "", sourceText: "", request: "", designPrompt: "", planPrompt: "", programPrompt: "", programHtml: "", allowExternalResources: false, design: null, createdAt: "", updatedAt: "" };
}
export default function LabEditorDialog({ owner, initial, onClose, onSave }: { owner: string | null; initial?: LabProject; onClose: () => void; onSave: (draft: LabProject) => Promise<void> }) {
  const { language } = useLanguage(), vi = language === "vi";
  const [draft, setDraft] = useState<LabProject>(initial ?? emptyLabEditor());
  const [workflow, setWorkflow] = useState<"import" | "ai">("import"), [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [filename, setFilename] = useState(""), [preview, setPreview] = useState<LabProject | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [visual, setVisual] = useState<"2d" | "3d">(initial?.visualStyle ?? "2d");
  const [restored, setRestored] = useState(false), [ready, setReady] = useState(false);
  const initialSnapshot = useRef(JSON.stringify(initial ?? emptyLabEditor())), saveLock = useRef(false), draftWrites = useRef(Promise.resolve());
  const restoreRef = useRef<LabProject | null>(null);
  const dirty = JSON.stringify(draft) !== initialSnapshot.current;
  const update = <K extends keyof LabProject>(key: K, value: LabProject[K]) => setDraft(old => ({ ...old, [key]: value }));
  useEffect(() => {
    let alive = true;
    void readLabDraft<Record<string, unknown>>(owner).then(saved => {
      if (!alive) return;
      // Preserve old editor backups, including HTML-only unsaved work.
      const legacy = saved?.draft && typeof saved.draft === "object" ? { ...emptyLabEditor(), ...saved.draft, ...saved, id: saved.selectedId ?? "" } : null;
      const candidate = cleanLab(saved?.editor ?? legacy);
      if (candidate && ((initial && candidate.id === initial.id) || (!initial && !candidate.id)) && saved?.pending !== false) restoreRef.current = candidate;
      setRestored(!!restoreRef.current); setReady(true);
    }).catch(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [owner, initial]);
  useEffect(() => {
    if (!ready || restored || busy) return;
    const timer = window.setTimeout(() => {
      draftWrites.current = draftWrites.current.then(() => writeLabDraft(owner, { editor: draft, workflow, visual, pending: dirty })).then(() => {}).catch(() => setError(vi ? "Không giữ được bản nháp. Hãy tải HTML xuống trước khi đóng trang." : "Draft storage failed. Download your HTML before leaving."));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [owner, ready, draft, dirty, workflow, visual, restored, busy, vi]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const close = () => { if (!busy && (!dirty || window.confirm(vi ? "Đóng mà chưa lưu thay đổi vào Lab? Bản đã lưu vẫn được giữ." : "Close without saving these changes to the Lab?"))) onClose(); };
  async function chooseHtml(file?: File) {
    if (!file) return;
    setError("");
    if (!/\.html?$/i.test(file.name)) { setError(vi ? "Chọn tệp .html hoặc .htm." : "Choose an .html or .htm file."); return; }
    if (file.size > LAB_LIMITS.maxHtml) { setError(vi ? "HTML vượt giới hạn 1,5 MB." : "HTML exceeds the 1.5 MB limit."); return; }
    try {
      const html = await file.text();
      setDraft(old => ({ ...old, programHtml: html, title: old.title || file.name.replace(/\.html?$/i, ""), thumbnail: undefined }));
      setFilename(file.name); setPreview(null); emitGuideAction("lab:html-input");
    } catch { setError(vi ? "Không đọc được tệp HTML." : "Could not read the HTML file."); }
  }
  function checkHtml(): boolean {
    const check = validateLabHtml(draft.programHtml, { allowExternalResources: draft.allowExternalResources });
    if (!check.ok) { setError(check.code === "emptyHtml" ? (vi ? "Thêm tệp hoặc dán HTML trước khi lưu." : "Import or paste HTML before saving.") : check.code === "htmlTooLarge" ? (vi ? "HTML vượt giới hạn 1,5 MB." : "HTML is too large.") : `${vi ? "HTML có tài nguyên chưa được phép hoặc thao tác không an toàn." : "HTML contains unapproved resources or unsafe actions."} ${check.warnings.join(" · ")}`); return false; }
    setError(""); return true;
  }
  async function save() {
    if (saveLock.current || !checkHtml()) return;
    if (!draft.title.trim()) { setError(vi ? "Nhập tên Lab." : "Enter a Lab name."); return; }
    saveLock.current = true; setBusy(true);
    try {
      await draftWrites.current;
      await onSave({ ...draft, title: draft.title.trim() });
      await writeLabDraft(owner, { pending: false }).catch(() => {});
      emitGuideAction("lab:save"); onClose();
    } catch (e) { setError(e instanceof DOMException && e.name === "QuotaExceededError" ? (vi ? "Dung lượng lưu trữ đã đầy. HTML vẫn được giữ; hãy xuất sao lưu và giải phóng dung lượng." : "Storage is full. HTML is preserved; export a backup and free space.") : e instanceof Error ? e.message : (vi ? "Lưu thất bại. Nội dung vẫn được giữ trong hộp thoại." : "Save failed. Your content is still in the editor.")); }
    finally { saveLock.current = false; setBusy(false); }
  }
  const mode = draft.mode ?? "freeform", info = labModeInfo(mode, language);
  return <Dialog title={initial ? (vi ? "Chỉnh sửa Lab" : "Edit Lab") : (vi ? "Thêm Lab" : "Add Lab")} onClose={close} dismissible={!busy}>
    <div className="lab-editor lab-step-card">
      {restored && <div className="lab-draft-recovery"><span>{vi ? "Có bản nháp chưa lưu." : "An unsaved draft is available."}</span><button className="secondary-button" onClick={() => { if (restoreRef.current) { setDraft(restoreRef.current); setVisual(restoreRef.current.visualStyle ?? "2d"); setInputMode("paste"); } setRestored(false); }}>{vi ? "Khôi phục bản nháp" : "Restore draft"}</button><button className="secondary-button" onClick={() => setRestored(false)}>{vi ? "Bỏ qua" : "Dismiss"}</button></div>}
      <div className="lab-editor-tabs" role="tablist" aria-label={vi ? "Cách tạo Lab" : "Creation method"}><button role="tab" aria-selected={workflow === "import"} onClick={() => setWorkflow("import")}><FileUp size={18}/>{vi ? "Tôi đã có HTML" : "Import HTML"}</button><button role="tab" aria-selected={workflow === "ai"} onClick={() => { setWorkflow("ai"); if (mode === "freeform" && !draft.request) update("mode", "animation"); }}><Sparkles size={18}/>{vi ? "Tạo bằng AI" : "Create with AI"}</button></div>
      <label>{vi ? "Tên Lab" : "Lab name"}<input autoFocus value={draft.title} maxLength={200} onChange={e => update("title", e.target.value)} placeholder={vi ? "Ví dụ: Quá trình điện phân" : "Example: Electrolysis"}/></label>
      {workflow === "ai" && <section className="lab-ai-setup"><h3>{vi ? "Bạn muốn người học trải nghiệm gì?" : "What will learners experience?"}</h3><div className="lab-mode-grid">{LAB_MODES.map(item => { const data = labModeInfo(item, language); return <button type="button" className={`lab-mode-option ${mode === item ? "selected" : ""}`} aria-pressed={mode === item} key={item} onClick={() => update("mode", item)}><span>{data.label}{mode === item && <Check size={16}/>}</span><small>{data.hint}</small></button>; })}</div>
        <div className="lab-mode-example"><strong>{vi ? "Ví dụ" : "Example"}</strong><p>{info.example}</p><button className="secondary-button" onClick={() => { if (!draft.request || window.confirm(vi ? "Thay yêu cầu hiện tại bằng ví dụ?" : "Replace the current request with this example?")) update("request", info.example); }}>{vi ? "Dùng ví dụ" : "Use example"}</button></div>
        <div className="lab-editor-fields"><label>{vi ? "Trình độ người học" : "Learner level"}<input value={draft.learnerLevel} maxLength={120} onChange={e => update("learnerLevel", e.target.value)} placeholder={vi ? "Ví dụ: lớp 9" : "Example: grade 9"}/></label><label>{vi ? "Cách thể hiện" : "Visual style"}<select value={visual} onChange={e => { const value = e.target.value as "2d" | "3d"; setVisual(value); update("visualStyle", value); }}><option value="2d">2D</option><option value="3d">3D</option></select></label></div>
        <label>{vi ? "Mục tiêu và yêu cầu tương tác" : "Learning goals and interactions"}<textarea rows={4} maxLength={12000} value={draft.request} onChange={e => update("request", e.target.value)} placeholder={info.example}/></label>
        <details><summary>{vi ? "Tài liệu nguồn và ghi chú" : "Source material and notes"}</summary><label className="lab-file-drop">{vi ? "Thêm tài liệu nguồn" : "Add source material"}<input type="file" accept=".pdf,.docx,.pptx,.txt,.md,.json,.csv" onChange={e => { const file = e.target.files?.[0]; if (!file) return; update("sourceFileName", file.name); if (/\.(txt|md|json|csv)$/i.test(file.name) && file.size <= LAB_LIMITS.maxSourceText) void file.text().then(text => update("sourceText", text)).catch(() => setError(vi ? "Không đọc được nguồn." : "Could not read source.")); }}/></label><small>{draft.sourceFileName} · {vi ? "Với PDF/DOCX/PPTX, gửi tệp gốc cùng prompt cho AI." : "For PDF/DOCX/PPTX, upload the original to your AI provider."}</small><label>{vi ? "Văn bản tham khảo" : "Reference text"}<textarea rows={3} maxLength={LAB_LIMITS.maxSourceText} value={draft.sourceText} onChange={e => update("sourceText", e.target.value)}/></label></details>
        <div className="lab-actions"><button className="primary-button" onClick={() => { if (!draft.request.trim()) { setError(vi ? "Nhập mục tiêu và yêu cầu trước." : "Enter goals and requirements first."); return; } const prompt = buildLabPlanPrompt({ ...draft, language, mode, visualStyle: visual }); setDraft(old => ({ ...old, designPrompt: prompt, programPrompt: prompt })); setError(""); emitGuideAction("lab:prompt"); }}><Sparkles size={17}/>{vi ? "Tạo prompt HTML" : "Create HTML prompt"}</button>{draft.designPrompt && <button className="secondary-button" onClick={() => void copyTextWithFallback(draft.designPrompt).then(ok => { setCopied(ok); if (!ok) setError(vi ? "Hãy mở prompt và sao chép thủ công." : "Open the prompt and copy manually."); })}><Clipboard size={17}/>{copied ? (vi ? "Đã sao chép" : "Copied") : (vi ? "Sao chép prompt" : "Copy prompt")}</button>}</div>
        {draft.designPrompt && <details className="lab-prompt-output"><summary>{vi ? "Xem prompt đã tạo" : "View generated prompt"}</summary><textarea rows={8} aria-label="Prompt" readOnly value={draft.designPrompt}/></details>}
        <p className="lab-editor-help">{vi ? "Gửi prompt và tài liệu cho AI bạn chọn, rồi thêm HTML trả về ở bên dưới. MindCanvas chưa tạo HTML trực tiếp." : "Send the prompt and source to your AI provider, then import the returned HTML below."}</p>
      </section>}
      <section className="lab-run-card"><div className="lab-input-switch"><button className="secondary-button" aria-pressed={inputMode === "file"} onClick={() => setInputMode("file")}><FileUp size={16}/>{vi ? "Tải tệp HTML" : "Upload HTML"}</button><button className="secondary-button" aria-pressed={inputMode === "paste"} onClick={() => setInputMode("paste")}><Code2 size={16}/>{vi ? "Dán / sửa HTML" : "Paste / edit HTML"}</button></div>
        {inputMode === "file" ? <label className="lab-file-drop"><FileUp size={28}/><strong>{filename || (draft.programHtml ? (vi ? "Đã có HTML · chọn tệp để thay" : "HTML ready · choose a replacement") : (vi ? "Chọn tệp .html hoặc .htm" : "Choose an .html or .htm file"))}</strong><span>{vi ? "Tối đa 1,5 MB" : "Up to 1.5 MB"}</span><input type="file" accept=".html,.htm,text/html" disabled={busy} onChange={e => { void chooseHtml(e.target.files?.[0]); e.target.value = ""; }}/></label>
          : <label>{vi ? "Nội dung HTML" : "HTML content"}<textarea className="lab-html-code" aria-label="HTML" rows={10} maxLength={LAB_LIMITS.maxHtml} value={draft.programHtml} onChange={e => { setDraft(old => ({ ...old, programHtml: e.target.value, thumbnail: undefined })); setFilename(""); if (e.target.value.trim()) emitGuideAction("lab:html-input"); }}/></label>}
      </section>
      <details className="lab-editor-options"><summary>{vi ? "Phân loại, khung xem và ảnh bìa" : "Category, layout and cover"}</summary><div className="lab-editor-fields"><label>{vi ? "Chế độ" : "Mode"}<select value={mode} onChange={e => update("mode", e.target.value as LabMode)}>{LAB_MODES.map(item => <option key={item} value={item}>{labModeInfo(item, language).label}</option>)}</select></label><label>{vi ? "Môn" : "Subject"}<select value={draft.subject} onChange={e => update("subject", e.target.value as LabProject["subject"])}><option value="physics">{vi ? "Vật lý" : "Physics"}</option><option value="chemistry">{vi ? "Hóa học" : "Chemistry"}</option><option value="other">{vi ? "Khác" : "Other"}</option></select></label><label>{vi ? "Khung xem" : "Layout"}<select value={draft.viewerConfig?.presentation ?? "auto"} onChange={e => update("viewerConfig", { ...(draft.viewerConfig ?? DEFAULT_LAB_VIEWER), presentation: e.target.value as "auto" | "scene" | "document" })}><option value="auto">{vi ? "Tự điều chỉnh" : "Automatic"}</option><option value="scene">{vi ? "Cảnh / mô hình" : "Scene / model"}</option><option value="document">{vi ? "Nội dung dài" : "Long content"}</option></select></label>{draft.viewerConfig?.presentation === "scene" && <label>{vi ? "Tỷ lệ" : "Aspect ratio"}<select value={draft.viewerConfig.aspectRatio} onChange={e => update("viewerConfig", { ...draft.viewerConfig!, aspectRatio: e.target.value as "16:9" | "4:3" | "1:1" })}><option>16:9</option><option>4:3</option><option>1:1</option></select></label>}</div>
        <label className="lab-cover-upload"><ImagePlus size={18}/>{vi ? "Chọn ảnh bìa" : "Upload cover"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void labCoverFromFile(file).then(image => update("thumbnail", image)).catch(e => setError(e.message)); }}/></label>{draft.thumbnail && <div className="lab-editor-cover"><img src={draft.thumbnail} alt={vi ? "Ảnh bìa Lab" : "Lab cover"}/><button className="secondary-button" onClick={() => update("thumbnail", undefined)}>{vi ? "Bỏ ảnh bìa" : "Remove cover"}</button></div>}
      </details>
      <label className="lab-cdn-option"><input type="checkbox" checked={draft.allowExternalResources} onChange={e => update("allowExternalResources", e.target.checked)}/><span>{vi ? "Cho phép thư viện CDN đã được phê duyệt" : "Allow approved CDN libraries"}<small>{vi ? "Cần Internet. Các kết nối API và quyền đọc dữ liệu MindCanvas vẫn bị chặn." : "Internet required. API calls and access to MindCanvas data remain blocked."}</small></span></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {preview && <LabViewer html={preview.programHtml} title={preview.title || "Preview"} allowExternalResources={preview.allowExternalResources} viewerConfig={preview.viewerConfig} onThumbnail={(image, manual) => setDraft(old => old.programHtml === preview.programHtml && (!old.thumbnail || manual) ? { ...old, thumbnail: image } : old)}/>}
    </div>
    <footer className="lab-editor-footer lab-footer-actions"><button className="secondary-button" disabled={busy} onClick={close}>{vi ? "Hủy" : "Cancel"}</button><div className="lab-actions"><button className="secondary-button" disabled={busy} onClick={() => { if (checkHtml()) { setPreview({ ...draft }); emitGuideAction("lab:run"); } }}><Play size={16}/>{vi ? "Xem thử" : "Preview"}</button><button className="primary-button" disabled={busy} onClick={() => void save()}><Save size={17}/>{busy ? (vi ? "Đang lưu…" : "Saving…") : (vi ? "Lưu Lab" : "Save Lab")}</button></div></footer>
  </Dialog>;
}
