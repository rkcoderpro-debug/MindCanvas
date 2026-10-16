import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Code2, Download, FileUp, Save, Sparkles, Trash2 } from "lucide-react";
import { validateExamSources, type ExamSource } from "@mindcanvas/shared";
import { NOTE_VISUALS, validateNoteResult, type NoteSettings } from "../../../../packages/shared/src/takenotes.js";
import { consumeAiManualUsage, generateTakenote, readExamFile } from "../lib/api";
import { fileToDataUrl, readDocument, saveDocument, type UploadedDocument } from "../lib/documentStore";
import { useLearningTool } from "../lib/learningNavigation";
import { noteFileName, noteManualPrompt, noteMarkdownHtml, noteBodyMarkdown } from "../lib/takenote";
import { emptyNoteWorkspace, loadNoteWorkspace, persistNoteWorkspace, saveNote, type NoteWorkspace, type SavedNote } from "../lib/takenoteStore";
import { buildTakenoteDocx, downloadNoteMarkdown, exportTakenotePdf } from "../lib/takenoteExport";
import { htmlDocumentWarnings, textFromDataUrl, validateHtmlDocument } from "../lib/htmlDocument";
import { writeClipboardText } from "../lib/aiSource";
import { downloadManualFile, readLocalBytes } from "../lib/examManualSource";
import { getStudioOriginal, saveStudioOriginalBatch, validateStudioDocx } from "../lib/examStudioStore";
import { originalArchivePath } from "../lib/examStudioPrompt";
import HtmlDocumentViewer from "./HtmlDocumentViewer";
import DocxViewer from "./DocxViewer";
import ExamModeSwitch from "./ExamModeSwitch";
import ManualAiProviderLinks from "./ManualAiProviderLinks";

const SOURCE_ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp";
const visualNames: Record<string, string> = { auto: "AI tự chọn", diagram: "Sơ đồ", steps: "Diễn tiến từng bước", simulation: "Mô phỏng", examples: "Ví dụ tương tác", review: "Tự kiểm tra" };
type Props = { owner: string | null; documents: UploadedDocument[]; onDocumentsChanged: () => void; onSaved: () => void; openNote?: SavedNote | null };
export default function TakenoteBuilderPage({ owner, documents, onDocumentsChanged, onSaved, openNote }: Props) {
  const [work, setWork] = useState<NoteWorkspace>(emptyNoteWorkspace), [ready, setReady] = useState(false), [showResult, setShowResult] = useState(false);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [storageError, setStorageError] = useState("");
  const [editing, setEditing] = useState(false), [revision, setRevision] = useState(""), [documentId, setDocumentId] = useState("");
  const alive = useRef(true), locked = useRef(false), controller = useRef<AbortController | null>(null), saveQueue = useRef<Promise<void>>(Promise.resolve());
  const hydrated = useRef<NoteWorkspace | null>(null), manualPending = useRef<Promise<string> | null>(null);
  const navigation = useLearningTool(), settings = work.settings, result = work.result;
  const persist = (value: NoteWorkspace) => { const next = saveQueue.current.catch(() => {}).then(() => persistNoteWorkspace(owner, value)); saveQueue.current = next; return next; };
  useEffect(() => {
    alive.current = true; let current = true;
    void loadNoteWorkspace(owner).then(value => { if (current) { hydrated.current = value; setWork(value); setReady(true); } }).catch(() => { if (current) { hydrated.current = work; setStorageError("Không khôi phục được bản nháp Takenote. Hãy kiểm tra quyền lưu trữ của trình duyệt."); setReady(true); } });
    return () => { current = false; alive.current = false; controller.current?.abort(); };
  }, [owner]);
  useEffect(() => { if (ready && work !== hydrated.current) void persist(work).then(() => { if (alive.current) setStorageError(""); }).catch(() => { if (alive.current) setStorageError("Chưa lưu được bản nháp. Hãy giữ tab này và tải tài liệu về trước khi rời đi."); }); }, [work, ready]);
  const show = () => { if (navigation) navigation.open("takenote-result", () => setShowResult(true), () => setShowResult(false)); else setShowResult(true); };
  const back = () => { setShowResult(false); setEditing(false); navigation?.back(); };
  useEffect(() => { if (ready && openNote) { setWork(current => ({ ...current, settings: openNote.settings, mode: openNote.generationMode ?? "manual", sources: openNote.sources ?? [], result: openNote })); setEditing(false); show(); } }, [openNote, ready]);
  const patch = (change: Partial<NoteSettings>) => setWork(current => ({ ...current, settings: { ...current.settings, ...change } }));
  const prompt = useMemo(() => noteManualPrompt(settings, work.manualOutput) + (work.manualSources?.length ? `\n\nOriginal attachment list (metadata only): ${JSON.stringify(work.manualSources.map((source, index) => ({ name: source.name, path: originalArchivePath(source, index) })))}` : ""), [settings, work.manualOutput, work.manualSources]);
  async function run(label: string, job: (signal: AbortSignal) => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(label); setError(""); setNotice(""); const request = new AbortController(); controller.current = request;
    try { await job(request.signal); }
    catch (cause) { if (alive.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "Không hoàn tất được thao tác."); }
    finally { locked.current = false; if (alive.current) setBusy(""); }
  }
  const readSources = (files: File[]) => run("Đang đọc nguồn…", async signal => {
    if (!owner) throw new Error("Đăng nhập để đọc nguồn bằng AI Auto.");
    if (work.sources.length + files.length > 6) throw new Error("Mỗi tài liệu dùng tối đa 6 nguồn.");
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: tối đa 10 MB mỗi file.`);
      const source = await readExamFile(file, signal);
      if (alive.current && !signal.aborted) setWork(current => ({ ...current, sources: [...current.sources, { ...source, role: "material" }] }));
    }
  });
  const saveResult = async (note: SavedNote) => {
    const saved = await saveNote(owner, note);
    if (alive.current) { setWork(current => ({ ...current, result: saved })); setEditing(false); onSaved(); }
    return saved;
  };
  const generate = (revise = false) => run(revise ? "Đang chỉnh lại tài liệu…" : "Đang tạo Takenote…", async signal => {
    if (!owner) throw new Error("Đăng nhập để tạo tài liệu bằng AI Auto.");
    let sources = revise && result?.sources ? result.sources : work.sources;
    if (!revise && work.sourceText.trim()) sources = [...sources, { id: crypto.randomUUID(), name: "Nội dung đã nhập", role: "material", text: work.sourceText, warnings: [] }];
    sources = validateExamSources(sources, "materials");
    if (sources.some(source => source.text.includes("[UNREADABLE]"))) throw new Error("Hãy bổ sung phần [UNREADABLE] trong nguồn trước khi tạo tài liệu.");
    const currentSettings = revise && result ? result.settings : settings;
    // Keep the submitted source available if generation fails or the browser is reloaded.
    setWork(current => ({ ...current, sources, sourceText: "" }));
    const response = await generateTakenote(currentSettings, sources, signal, revise ? revision : "", revise ? result?.content ?? "" : "");
    const content = validateNoteResult(response.note, currentSettings.format);
    if (currentSettings.format === "html") { validateHtmlDocument(content.content); if (htmlDocumentWarnings(content.content).length) throw new Error("HTML AI tạo còn phụ thuộc tài nguyên bên ngoài. Hãy thử lại và yêu cầu tài liệu tự chứa."); }
    if (!alive.current || signal.aborted) return;
    await saveResult({ ...content, id: revise && result ? result.id : crypto.randomUUID(), owner: owner ?? "guest", format: currentSettings.format, sources, generationMode: "auto", settings: currentSettings, updatedAt: new Date().toISOString() });
    if (!alive.current || signal.aborted) return;
    show(); setRevision(""); setNotice("Đã lưu Takenote. Hãy xem lại kiến thức và thử các tương tác trước khi sử dụng.");
  });
  function activateManual(): Promise<string> {
    if (manualPending.current) return manualPending.current;
    const pending = activateManualOnce(); manualPending.current = pending;
    void pending.finally(() => { if (manualPending.current === pending) manualPending.current = null; }).catch(() => {});
    return pending;
  }
  async function activateManualOnce() {
    if (!owner) throw new Error("Đăng nhập để dùng AI Manual theo tài khoản.");
    const signature = prompt, existing = work.manualSession;
    const session = existing?.signature === signature ? existing : { id: crypto.randomUUID(), signature, consumed: false };
    if (!session.consumed) {
      const pending = { ...work, manualSession: session }; await persist(pending); if (alive.current) setWork(current => ({ ...current, manualSession: session }));
      await consumeAiManualUsage(session.id);
      const consumed = { ...pending, manualSession: { ...session, consumed: true } }; await persist(consumed);
      if (alive.current) setWork(current => ({ ...current, manualSession: consumed.manualSession }));
    }
    return signature;
  }
  const importText = () => run("Đang nhập Takenote…", async () => {
    let content = work.importText.trim().replace(/^```(?:markdown|md|html)?\s*\n([\s\S]*?)\n```$/i, "$1").trim();
    if (!content || content.length > 1500000) throw new Error("Nhập nội dung Takenote, tối đa 1,5 triệu ký tự.");
    let title = /^#\s+(.+)$/m.exec(content)?.[1] ?? "Takenote mới";
    if (settings.format === "html") { content = validateHtmlDocument(content); const parsed = new DOMParser().parseFromString(content, "text/html"); title = parsed.querySelector("h1")?.textContent || parsed.title || title; }
    await activateManual();
    if (!alive.current) return;
    await saveResult({ title: title.slice(0, 240), content, warnings: settings.format === "html" ? htmlDocumentWarnings(content) : [], id: crypto.randomUUID(), owner: owner ?? "guest", format: settings.format, generationMode: "manual", settings: structuredClone(settings), updatedAt: new Date().toISOString() }); show();
  });
  const importFile = (file?: File) => run("Đang đọc kết quả…", async () => {
    if (!file) return;
    if (settings.format === "knowledge" && work.manualOutput === "docx") {
      await validateStudioDocx(file); const dataUrl = await fileToDataUrl(file); await activateManual();
      if (!alive.current) return;
      await saveResult({ title: file.name.replace(/\.docx$/i, ""), content: "", warnings: [], id: crypto.randomUUID(), owner: owner ?? "guest", format: "docx", docxDataUrl: dataUrl, generationMode: "manual", settings: structuredClone(settings), updatedAt: new Date().toISOString() }); show();
    } else {
      if (file.size > 1500000 || !(settings.format === "html" ? /\.html?$/i : /\.(md|txt)$/i).test(file.name)) throw new Error("Chọn đúng định dạng kết quả, tối đa 1,5 MB.");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await readLocalBytes(file));
      if (settings.format === "html") validateHtmlDocument(text);
      if (alive.current) setWork(current => ({ ...current, importText: text }));
      setNotice("Đã đọc file. Bấm Nhập & xem để lưu tài liệu.");
    }
  });
  const addManualSources = (files: File[]) => run("Đang lưu file gốc…", async () => {
    if ((work.manualSources?.length ?? 0) + files.length > 6) throw new Error("Tối đa 6 file gốc.");
    const sources = await saveStudioOriginalBatch(owner, files, "material");
    if (alive.current) setWork(current => ({ ...current, manualSources: [...current.manualSources ?? [], ...sources] }));
  });
  const bundle = () => run("Đang tạo gói…", async () => {
    const text = await activateManual(), JSZip = (await import("jszip")).default, zip = new JSZip(); zip.file("prompt.txt", text);
    for (const [index, source] of (work.manualSources ?? []).entries()) { const file = await getStudioOriginal(owner, source.id); if (!file) throw new Error(`Không tìm thấy file gốc ${source.name}. Hãy chọn lại file.`); zip.file(originalArchivePath(source, index), await readLocalBytes(file)); }
    downloadManualFile(await zip.generateAsync({ type: "blob" }), "takenote-ai-manual.zip");
  });
  const saveToDocuments = () => run("Đang lưu vào Tài liệu…", async () => {
    if (!result) return;
    let blob: Blob, extension: string;
    if (result.format === "html") { validateHtmlDocument(result.content); blob = new Blob([result.content], { type: "text/html;charset=utf-8" }); extension = "html"; }
    else if (result.format === "docx") { blob = await fetch(result.docxDataUrl!).then(response => response.blob()); extension = "docx"; }
    else { blob = await buildTakenoteDocx(result.content, result.title); extension = "docx"; }
    const dataUrl = await fileToDataUrl(blob), name = `${noteFileName(result.title)}.${extension}`;
    const previous = await readDocument(owner, result.documentId ?? result.id);
    // Stored/cloud originals remain immutable when a note's contents change.
    const documentId = previous && (previous.dataUrl !== dataUrl || previous.name !== name) ? crypto.randomUUID() : result.documentId ?? result.id;
    await saveDocument(owner, { id: documentId, name, mimeType: blob.type, size: blob.size, kind: extension as "html" | "docx", dataUrl, folderId: null, generatedKind: "takenote" });
    await saveResult({ ...result, documentId });
    onDocumentsChanged(); onSaved(); setNotice("Đã lưu. Bạn có thể mở lại trong mục Tài liệu.");
  });
  const editResult = (change: Partial<SavedNote>) => setWork(current => current.result ? { ...current, result: { ...current.result, ...change } } : current);
  if (!ready) return <p role="status">Đang khôi phục Takenote…</p>;
  return <section className="takenote-builder">
    {error && <p role="alert" className="form-error">{error}</p>}{storageError && <p role="alert" className="form-error">{storageError}</p>}{notice && <p role="status" className="lab-notice">{notice}</p>}{busy && <p role="status">{busy}</p>}
    <div hidden={showResult && !!result}>
      <header className="document-create-heading"><span className="document-create-symbol"><BookOpen size={22}/></span><div><h1>Tạo Takenote</h1><p>Tổng hợp kiến thức hoặc biến bài học thành tài liệu trực quan.</p></div></header>
      <fieldset className="note-format-options" disabled={!!busy}><legend>Cách trình bày</legend><button type="button" className={settings.format === "knowledge" ? "active" : ""} aria-pressed={settings.format === "knowledge"} onClick={() => patch({ format: "knowledge" })}><BookOpen size={20}/><strong>Takenote kiến thức</strong><small>Đọc, chỉnh sửa, xuất Word / PDF</small></button><button type="button" className={settings.format === "html" ? "active" : ""} aria-pressed={settings.format === "html"} onClick={() => patch({ format: "html" })}><Code2 size={20}/><strong>Takenote trực quan HTML</strong><small>Sơ đồ, diễn tiến và tương tác</small></button></fieldset>
      <ExamModeSwitch documentMode mode={work.mode} disabled={!!busy} onChange={mode => setWork(current => ({ ...current, mode }))}/>
      <fieldset className="note-settings" disabled={!!busy}><legend>Thuộc tính tài liệu</legend><div className="note-settings-grid"><label>Mức độ chi tiết<select value={settings.detail} onChange={event => patch({ detail: event.target.value as NoteSettings["detail"] })}><option value="concise">Ngắn gọn</option><option value="balanced">Cân bằng</option><option value="detailed">Đầy đủ</option></select></label><label>Sắp xếp theo<select value={settings.organization} onChange={event => patch({ organization: event.target.value as NoteSettings["organization"] })}><option value="topic">Chủ đề</option><option value="chapter">Chương / bài</option></select></label></div>
        <div className="note-checks">{(["formulas", "tables", "examples", "review"] as const).map((key, index) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={event => patch({ [key]: event.target.checked })}/>{["Công thức", "Bảng so sánh", "Ví dụ", "Câu hỏi tự ôn"][index]}</label>)}</div>
        {settings.format === "html" && <div className="note-visual-options" role="group" aria-label="Cách học trực quan">{NOTE_VISUALS.map(visual => <button type="button" key={visual} className={settings.visuals.includes(visual) ? "active" : ""} aria-pressed={settings.visuals.includes(visual)} onClick={() => { const values = visual === "auto" ? ["auto"] : settings.visuals.includes(visual) ? settings.visuals.filter(item => item !== visual && item !== "auto") : [...settings.visuals.filter(item => item !== "auto"), visual]; patch({ visuals: values.length ? values : ["auto"] }); }}>{visualNames[visual]}</button>)}</div>}
        <details><summary>Tùy chọn nâng cao</summary><div className="note-settings-grid"><label>Môn học<input maxLength={160} value={settings.subject} onChange={event => patch({ subject: event.target.value })} placeholder="Theo tài liệu"/></label><label>Lớp / trình độ<input maxLength={160} value={settings.level} onChange={event => patch({ level: event.target.value })} placeholder="Theo tài liệu"/></label><label>Ngôn ngữ<select value={settings.language} onChange={event => patch({ language: event.target.value as "vi" | "en" })}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label></div><label>Yêu cầu thêm<textarea maxLength={2000} value={settings.instructions} onChange={event => patch({ instructions: event.target.value })}/></label></details>
      </fieldset>
      {work.mode === "auto" ? <fieldset disabled={!!busy} className="note-source-panel"><legend>Nội dung cần tạo</legend><p>Tải tài liệu hoặc nhập nội dung kiến thức. AI sẽ dựa trên nguồn này để tạo Takenote.</p><label className="note-file-button"><FileUp size={17}/>Tải file nguồn<input aria-label="File nguồn Takenote" multiple type="file" accept={SOURCE_ACCEPT} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void readSources(files); }}/></label><small>Tối đa 6 nguồn · 10 MB/file · tổng nội dung 120.000 ký tự</small>
        {documents.filter(item => ["pdf", "docx", "pptx"].includes(item.kind)).length > 0 && <div className="note-settings-grid"><select aria-label="Nguồn từ Tài liệu" value={documentId} onChange={event => setDocumentId(event.target.value)}><option value="">Chọn tài liệu đã lưu…</option>{documents.filter(item => ["pdf", "docx", "pptx"].includes(item.kind)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="secondary-button" disabled={!documentId} onClick={() => { const source = documents.find(item => item.id === documentId); if (source) void run("Đang mở nguồn…", async () => { const blob = await fetch(source.dataUrl).then(response => response.blob()); const file = new File([blob], source.name, { type: source.mimeType }); if (file.size > 10 * 1024 * 1024 || work.sources.length >= 6) throw new Error("Tối đa 6 nguồn, 10 MB/file."); if (!owner) throw new Error("Đăng nhập để đọc nguồn."); const extracted = await readExamFile(file); if (alive.current) setWork(current => ({ ...current, sources: [...current.sources, { ...extracted, role: "material" }] })); }); }}>Dùng tài liệu</button></div>}
        <label>Nội dung kiến thức<textarea aria-label="Nội dung nguồn Takenote" rows={7} maxLength={120000} value={work.sourceText} onChange={event => setWork(current => ({ ...current, sourceText: event.target.value }))} placeholder="Dán nội dung bài học, ghi chép hoặc thông tin cần tổng hợp…"/></label>
        {work.sources.map(source => <details key={source.id} className="note-source-item"><summary>{source.name}{source.warnings.length ? " · Cần kiểm tra" : ""}</summary>{source.warnings.map((warning, index) => <p key={index} className="field-hint">{warning}</p>)}<textarea aria-label={`Nội dung ${source.name}`} maxLength={120000} rows={6} value={source.text} onChange={event => setWork(current => ({ ...current, sources: current.sources.map(item => item.id === source.id ? { ...item, text: event.target.value } : item) }))}/><button className="text-button" onClick={() => setWork(current => ({ ...current, sources: current.sources.filter(item => item.id !== source.id) }))}><Trash2 size={14}/>Bỏ nguồn</button></details>)}
        <button className="primary-button" disabled={!work.sourceText.trim() && !work.sources.length} onClick={() => void generate()}><Sparkles size={17}/>Tạo Takenote bằng AI</button>
      </fieldset> : <>
        {settings.format === "knowledge" && <label className="note-manual-output">Đầu ra Manual<select value={work.manualOutput} onChange={event => setWork(current => ({ ...current, manualOutput: event.target.value as "markdown" | "docx" }))}><option value="markdown">Markdown — xem và chỉnh sửa trên web</option><option value="docx">Word — file DOCX dùng ngay</option></select></label>}
        <fieldset className="note-prompt-panel" disabled={!!busy}><legend>Prompt của bạn</legend><div className="exam-prompt-heading"><p>Prompt tự cập nhật theo thuộc tính. Gửi kèm file gốc hoặc nội dung trong tin nhắn riêng cho AI.</p><button className="primary-button" onClick={() => void run("Đang sao chép…", async () => { const text = await activateManual(); await writeClipboardText(text); setNotice("Đã sao chép prompt. Đính kèm file gốc trực tiếp trên AI ngoài."); })}>Sao chép prompt</button></div><ManualAiProviderLinks prompt={prompt} onPrepare={activateManual} disabled={!!busy || !owner}/><textarea aria-label="Prompt Takenote" rows={11} value={prompt} readOnly/>
          <details><summary>Gói prompt và file gốc (tùy chọn)</summary><label>Thêm file gốc<input aria-label="File gốc Takenote Manual" type="file" multiple accept={SOURCE_ACCEPT} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void addManualSources(files); }}/></label>{(work.manualSources ?? []).map(source => <div key={source.id} className="actions"><span>{source.name}</span><button className="text-button" onClick={() => setWork(current => ({ ...current, manualSources: (current.manualSources ?? []).filter(item => item.id !== source.id) }))}>Bỏ file</button></div>)}<button className="secondary-button" onClick={() => void bundle()}><Download size={15}/>Tải gói gửi AI</button><p className="field-hint">Gói chỉ có prompt và nguyên file gốc; không tạo bản trích xuất thay thế.</p></details>
        </fieldset>
        <fieldset className="note-import-panel" disabled={!!busy}><legend>Nhập kết quả từ AI</legend><label>File kết quả<input aria-label="File kết quả Takenote" type="file" accept={settings.format === "html" ? ".html,.htm,text/html" : work.manualOutput === "docx" ? ".docx" : ".md,.txt,text/markdown"} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void importFile(file); }}/></label>{(settings.format === "html" || work.manualOutput === "markdown") && <><label>{settings.format === "html" ? "Hoặc dán HTML" : "Hoặc dán Markdown"}<textarea aria-label="Nội dung kết quả Takenote" rows={7} maxLength={1500000} value={work.importText} onChange={event => setWork(current => ({ ...current, importText: event.target.value }))}/></label><button className="primary-button" disabled={!work.importText.trim()} onClick={() => void importText()}>Nhập & xem</button></>}</fieldset>
      </>}
      {result && <button className="secondary-button" onClick={show}>Mở kết quả gần nhất</button>}
    </div>
    {result && <div hidden={!showResult} className="note-result"><header className="note-result-toolbar"><button className="text-button" onClick={back}><ArrowLeft size={16}/>Quay lại thiết lập</button><div className="actions"><button className="secondary-button" disabled={!!busy} onClick={() => void saveToDocuments()}><Save size={15}/>Lưu vào Tài liệu</button><button className="secondary-button" disabled={!!busy} onClick={() => void run("Đang tải tài liệu…", async () => { if (result.format === "html") downloadManualFile(new Blob([result.content], { type: "text/html;charset=utf-8" }), `${noteFileName(result.title)}.html`); else if (result.format === "docx") downloadManualFile(await fetch(result.docxDataUrl!).then(response => response.blob()), `${noteFileName(result.title)}.docx`); else downloadManualFile(await buildTakenoteDocx(result.content, result.title), `${noteFileName(result.title)}.docx`); })}><Download size={15}/>{result.format === "html" ? "Tải HTML" : "Tải Word"}</button>{result.format === "knowledge" && <><button className="secondary-button" onClick={() => void run("Đang mở bản in…", async () => exportTakenotePdf(result.title, result.content))}>Xuất PDF</button><button className="text-button" onClick={() => downloadNoteMarkdown(result.content, `${noteFileName(result.title)}.md`)}>Tải Markdown</button></>}{result.format !== "docx" && <button className="secondary-button" onClick={() => setEditing(value => !value)}>{editing ? "Xem tài liệu" : result.format === "html" ? "Sửa HTML" : "Chỉnh sửa"}</button>}</div></header>
      {result.warnings.length > 0 && <details className="note-result-warnings"><summary>Lưu ý về tài liệu ({result.warnings.length})</summary>{result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}
      {editing ? <fieldset disabled={!!busy} className="note-editor"><legend>Chỉnh sửa tài liệu</legend><label>Tên tài liệu<input value={result.title} maxLength={240} onChange={event => editResult({ title: event.target.value })}/></label><textarea aria-label="Chỉnh sửa nội dung Takenote" rows={22} maxLength={1500000} value={result.content} onChange={event => editResult({ content: event.target.value })}/><button className="primary-button" onClick={() => void run("Đang lưu thay đổi…", async () => { if (result.format === "html") validateHtmlDocument(result.content); await saveResult(result); setNotice("Đã lưu thay đổi."); })}>Lưu thay đổi</button></fieldset>
        : result.format === "html" ? <HtmlDocumentViewer html={result.content} title={result.title}/>
        : result.format === "docx" ? <DocxViewer dataUrl={result.docxDataUrl!}/>
        : <article className="takenote-content"><h1>{result.title}</h1><div dangerouslySetInnerHTML={{ __html: noteMarkdownHtml(noteBodyMarkdown(result.content, result.title)) }}/></article>}
      {result.generationMode === "auto" && !!result.sources?.length && result.format !== "docx" && <fieldset className="note-revision" disabled={!!busy}><legend>Nhờ AI chỉnh lại</legend><label>Phần cần thay đổi<textarea maxLength={2000} value={revision} onChange={event => setRevision(event.target.value)} placeholder="Ví dụ: thêm ví dụ từng bước cho phần 2…"/></label><button className="secondary-button" disabled={!revision.trim()} onClick={() => void generate(true)}>Cập nhật bằng AI</button></fieldset>}
    </div>}
  </section>;
}
