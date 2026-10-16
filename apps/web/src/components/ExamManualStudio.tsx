import { useLearningTool } from "../lib/learningNavigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AccountPlan } from "../lib/account";
import type { UploadedDocument } from "../lib/documentStore";
import { fileToDataUrl } from "../lib/documentStore";
import { consumeAiManualUsage } from "../lib/api";
import { writeClipboardText } from "../lib/aiSource";
import { downloadManualFile, MANUAL_EXAM_ACCEPT, readLocalBytes } from "../lib/examManualSource";
import { ONLINE_TYPES, parseOnlineExam, type OnlineExam, type OnlineType, type OriginalInfo } from "../lib/examOnline";
import { createStudioPrompt, emptyStudioConfig, type StudioConfig } from "../lib/examStudioPrompt";
import { buildStudioBundle, deleteStudioItem, emptyStudioWorkspace, getStudioOriginal, listStudioItems, loadStudioWorkspace, persistStudioWorkspace, saveStudioItem, saveStudioOriginal, saveStudioOriginalBatch, validateStudioDocx, type StudioItem } from "../lib/examStudioStore";
import { listSavedExams } from "../lib/examStore";
import type { SavedExam } from "@mindcanvas/shared";
import DocxViewer from "./DocxViewer";
import ExamModeSwitch from "./ExamModeSwitch";
import ExamOnlineRunner, { OnlineExamPreview } from "./ExamOnlineRunner";
const labels: Record<OnlineType, string> = { mcq: "4 lựa chọn", blank: "Điền vào ô trống", numeric: "Tính toán / nhập kết quả", short: "Trả lời ngắn", essay: "Tự luận" };
export function onlineExamPayload(exam: OnlineExam) { return { schemaVersion: 1, title: exam.title, description: exam.description, durationMinutes: exam.durationMinutes, questions: exam.questions, warnings: exam.warnings }; }
function legacyOnlineExam(saved: SavedExam): OnlineExam {
  return { id: `legacy-${saved.id}`, revision: saved.updatedAt, title: saved.draft.title, description: saved.draft.description, durationMinutes: saved.blueprint.durationMinutes, createdAt: saved.updatedAt, warnings: saved.draft.warnings, sources: saved.sources.map(source => ({ id: source.id, name: source.name, mimeType: "", size: 0, role: source.role, textOnly: true })), questions: saved.draft.sections.flatMap(section => section.questions.map(question => ({ ...question, section: section.title, type: question.type === "mcq" ? "mcq" as const : question.type === "short" ? "short" as const : "essay" as const, acceptedAnswers: [], caseSensitive: false, blanks: [], numeric: null, references: question.references.map(ref => ({ fileId: ref.sourceId, page: ref.page, excerpt: ref.excerpt })) }))) };
}
export default function ExamManualStudio({ owner, documents = [], accountPlan, onAuto }: { owner: string | null; documents?: UploadedDocument[]; accountPlan?: AccountPlan; onAuto: () => void }) {
  const initial = useMemo(() => { try { return { work: loadStudioWorkspace(owner), error: "" }; } catch (cause) { return { work: emptyStudioWorkspace(), error: cause instanceof Error ? cause.message : "Không khôi phục được bản nháp." }; } }, [owner]);
  const [work, setWork] = useState(initial.work), [error, setError] = useState(initial.error), [notice, setNotice] = useState(""), [storageError, setStorageError] = useState("");
  const [view, setView] = useState<"create" | "result">("create");
  const navigation = useLearningTool();
  const showExam = () => { if (navigation) navigation.open("manual-result", () => { setView("result"); setPlaying(false); }, () => setView("create")); else setView("result"); };
  const backToSetup = () => { setView("create"); navigation?.back(); };
  const playExam = () => { if (navigation) navigation.open("online-runner", () => { setView("result"); setPlaying(true); }, () => setPlaying(false)); else setPlaying(true); };
  const backFromRunner = () => { setPlaying(false); navigation?.back(); };
  const [busy, setBusy] = useState(""), [items, setItems] = useState<StudioItem[]>([]), [legacy, setLegacy] = useState<SavedExam[]>([]), [selected, setSelected] = useState<StudioItem | null>(null), [playing, setPlaying] = useState(false);
  const [wordFiles, setWordFiles] = useState<{ exam: File | null; answers: File | null }>({ exam: null, answers: null }), [wordAnswers, setWordAnswers] = useState(false), [wordUrl, setWordUrl] = useState(""), [wordLoading, setWordLoading] = useState(false);
  const [documentId, setDocumentId] = useState(""), [separateText, setSeparateText] = useState(work.separateText ?? "");
  const locked = useRef(false), alive = useRef(true), controller = useRef<AbortController | null>(null);
  const maxQuestions = Math.min(100, accountPlan?.maxCards ?? 50), config = work.config;
  const prepared = useMemo(() => {
    try {
      const same = work.session && JSON.stringify(work.session.config) === JSON.stringify(config) && JSON.stringify(work.session.sources) === JSON.stringify(work.sources);
      return { session: same ? work.session! : createStudioPrompt(config, work.sources, maxQuestions), error: "" };
    } catch (cause) { return { session: null, error: (cause as Error).message }; }
  }, [config, work.sources, work.session, maxQuestions]);
  useEffect(() => {
    alive.current = true;
    void listStudioItems(owner).then(rows => { if (alive.current) { setItems(rows); const previous = rows.find(item => item.id === initial.work.selectedId) ?? null; setSelected(previous); } }).catch(() => { if (alive.current) setStorageError("Không đọc được thư viện đề trên thiết bị. Kiểm tra quyền lưu trữ trình duyệt."); });
    void listSavedExams(owner).then(rows => { if (alive.current) setLegacy(rows); }).catch(() => {});
    return () => { alive.current = false; controller.current?.abort(); };
  }, [owner]);
  useEffect(() => { if (work === initial.work) return; try { persistStudioWorkspace(owner, work); setStorageError(""); } catch (cause) { setStorageError(cause instanceof Error ? cause.message : "Không tự lưu được bản nháp."); } }, [work, owner]);
  useEffect(() => {
    let current = true; setWordUrl("");
    if (selected?.kind !== "word") { setWordLoading(false); return; }
    const fileId = wordAnswers ? selected.answerFileId : selected.examFileId; if (!fileId) return;
    setWordLoading(true);
    void getStudioOriginal(owner, fileId).then(file => { if (!file) throw new Error("File Word không còn trên thiết bị. Hãy tải lại file kết quả."); return fileToDataUrl(file); }).then(url => { if (current) setWordUrl(url); }).catch(cause => { if (current) setError((cause as Error).message); }).finally(() => { if (current) setWordLoading(false); });
    return () => { current = false; };
  }, [selected?.id, selected?.kind === "word" ? selected.examFileId : "", selected?.kind === "word" ? selected.answerFileId : "", wordAnswers, owner]);
  async function run(label: string, job: (signal: AbortSignal) => Promise<void>) {
    if (locked.current) return; locked.current = true; setBusy(label); setError(""); setNotice(""); const request = new AbortController(); controller.current = request;
    try { await job(request.signal); } catch (cause) { if (alive.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "Không hoàn tất được thao tác."); }
    finally { locked.current = false; if (alive.current && !request.signal.aborted) setBusy(""); }
  }
  const patch = (change: Partial<StudioConfig>) => setWork(current => ({ ...current, config: { ...current.config, ...change }, ...(change.output ? { session: null, config: { ...current.config, ...change, questionCount: change.output === "word" ? null : Math.min(10, maxQuestions) } } : {}) }));
  const select = (item: StudioItem) => { showExam(); setSelected(item); setWordAnswers(false); setPlaying(false); setWork(current => ({ ...current, selectedId: item.id })); };
  const addFiles = (files: File[], role: OriginalInfo["role"]) => run("Đang lưu file gốc.", async signal => {
    if (!owner) throw new Error("Đăng nhập để lưu file và dùng AI Manual.");
    if (role === "template" && files.length !== 1) throw new Error("Chọn một file đề mẫu mỗi lần.");
    const retained = work.sources.filter(source => role !== "template" || source.role !== "template"); if (retained.length + files.length > 6) throw new Error("Mỗi đề dùng tối đa 6 nguồn.");
    for (const file of files) {
      if (!/\.(pdf|docx|txt|md|csv|png|jpe?g|webp)$/i.test(file.name)) throw new Error("Chọn PDF, DOCX, TXT/MD/CSV hoặc PNG/JPG/WEBP.");
    }
    const next = await saveStudioOriginalBatch(owner, files, role); if (signal.aborted || !alive.current) return;
    setWork(current => ({ ...current, sources: [...retained, ...next] })); setNotice("Đã lưu nguyên file gốc trên thiết bị. Không trích xuất nội dung vào prompt.");
  });
  async function activatePrompt(signal: AbortSignal) {
    if (!owner) throw new Error("Đăng nhập để sao chép prompt và lưu đề theo tài khoản.");
    const session = prepared.session ? { ...prepared.session } : null;
    if (!session) throw new Error(prepared.error);
    // Persist the request ID before quota consumption so a retry is idempotent.
    setWork(current => ({ ...current, session }));
    if (session.config.output === "word" && !session.consumed) {
      await consumeAiManualUsage(session.id, signal);
      session.consumed = true;
    }
    if (signal.aborted || !alive.current) return null;
    setWork(current => ({ ...current, session: { ...session } }));
    return session;
  }
  const copy = () => run("Đang sao chép prompt.", async signal => {
    const session = await activatePrompt(signal); if (!session) return;
    try { await writeClipboardText(session.prompt); setNotice("Đã sao chép prompt. Đính kèm tài liệu gốc trực tiếp khi gửi AI ngoài."); }
    catch { throw new Error("Trình duyệt chưa cho phép sao chép. Chọn nội dung ô prompt để sao chép thủ công, hoặc tải gói gửi AI."); }
  });
  const bundle = () => run("Đang tạo gói prompt và file gốc.", async signal => {
    const session = await activatePrompt(signal); if (!session) return;
    const blob = await buildStudioBundle(owner, session); if (!alive.current || signal.aborted) return;
    downloadManualFile(blob, "mindcanvas-ai-input.zip"); setNotice("Đã tải gói gửi AI. Đính kèm thêm file gốc nếu bạn chưa chọn file cho gói.");
  });
  const download = (id: string) => run("Đang mở file gốc.", async signal => { const file = await getStudioOriginal(owner, id); if (!file) throw new Error("File gốc không còn trên thiết bị. Hãy chọn lại file; đề cũ trước phiên bản này có thể chưa lưu file gốc."); if (!signal.aborted && alive.current) downloadManualFile(file, file.name); });
  const importOnline = () => run("Đang kiểm tra đề tương tác.", async signal => {
    if (!owner) throw new Error("Đăng nhập để nhập đề AI Manual.");
    const session = work.session?.config.output === "online" ? work.session : null, sources = session?.sources ?? work.sources;
    const parsed = parseOnlineExam(work.importText, sources, maxQuestions), preferences = session?.config;
    if (preferences) {
      if (preferences.questionCount !== null && parsed.questions.length !== preferences.questionCount) throw new Error(`Cần ${preferences.questionCount} câu, nhận được ${parsed.questions.length}.`);
      if (preferences.durationMinutes !== null && parsed.durationMinutes !== preferences.durationMinutes) throw new Error(`Thời gian phải là ${preferences.durationMinutes} phút.`);
      if (preferences.pointsPerQuestion !== null && parsed.questions.some(q => Math.abs(q.points - preferences.pointsPerQuestion!) > .001)) throw new Error("Điểm câu không khớp thuộc tính đã chọn.");
      if (parsed.questions.some(q => !preferences.types.includes(q.type)) || preferences.types.some(type => !parsed.questions.some(q => q.type === type))) throw new Error("Các dạng bài không khớp lựa chọn trong prompt.");
    }
    const id = work.editingId ?? session?.resultId ?? crypto.randomUUID(), previous = items.find(item => item.id === id), oldExam = previous?.kind === "online" ? previous.exam : null;
    const requestId = session?.id ?? work.importRequestId ?? crypto.randomUUID();
    if (!session) setWork(current => ({ ...current, importRequestId: requestId }));
    if (session ? !session.consumed : !work.importConsumed) await consumeAiManualUsage(requestId, signal);
    if (!alive.current || signal.aborted) return;
    const consumed = session ? { ...session, consumed: true, resultId: id } : null;
    setWork(current => ({ ...current, session: consumed, selectedId: id, editingId: id, ...(session ? {} : { importRequestId: requestId, importConsumed: true }) }));
    const same = oldExam && JSON.stringify(onlineExamPayload(oldExam)) === JSON.stringify({ schemaVersion: 1, ...parsed });
    const exam: OnlineExam = { ...parsed, id, revision: same ? oldExam.revision : crypto.randomUUID(), createdAt: oldExam?.createdAt ?? new Date().toISOString(), sources: structuredClone(sources) };
    const item: StudioItem = { id, owner, title: exam.title, updatedAt: new Date().toISOString(), kind: "online", exam };
    setSelected(item); showExam(); setWordAnswers(false); await saveStudioItem(owner, item); if (!alive.current) return;
    setItems(rows => [item, ...rows.filter(row => row.id !== id)]); setNotice("Đã lưu đề. Bấm Làm bài trên MindCanvas; đáp án và lời giải hiện sau khi nộp.");
  });
  const importWord = () => run("Đang lưu đề Word.", async signal => {
    if (!owner || !wordFiles.exam) throw new Error("Đăng nhập và chọn file Word đề để lưu.");
    for (const file of [wordFiles.exam, wordFiles.answers]) if (file) await validateStudioDocx(file);
    const stored = await saveStudioOriginalBatch(owner, [wordFiles.exam, ...(wordFiles.answers ? [wordFiles.answers] : [])], "material"), exam = stored[0], answers = stored[1] ?? null;
    if (!alive.current || signal.aborted) return;
    const item: StudioItem = { id: crypto.randomUUID(), owner, title: wordFiles.exam.name.replace(/\.docx$/i, ""), updatedAt: new Date().toISOString(), kind: "word", examFileId: exam.id, answerFileId: answers?.id ?? null, sources: work.session?.sources ?? work.sources };
    await saveStudioItem(owner, item); if (!alive.current) return;
    setItems(rows => [item, ...rows]); select(item); setWordFiles({ exam: null, answers: null }); setNotice("Đã lưu nguyên file Word. Bạn có thể tải dùng ngay hoặc xem đề và đáp án riêng trên web.");
  });
  if (playing && selected?.kind === "online") return <>{error && <p role="alert" className="form-error">{error}</p>}<ExamOnlineRunner key={`${owner}:${selected.exam.id}:${selected.exam.revision}`} owner={owner} exam={selected.exam} onBack={backFromRunner} onReference={id => void download(id)}/></>;
  return <section className="exam-builder-page exam-manual-studio" aria-busy={!!busy}>
    <header className="exam-builder-heading"><div><span className="eyebrow">EXAM STUDIO · AI MANUAL</span><h1>Tạo đề thi bằng AI</h1><p>Chọn thuộc tính, sao chép prompt và gửi AI bạn muốn dùng.</p></div><div className="actions">{selected && view === "create" && <button className="secondary-button" disabled={!!busy} onClick={showExam}>Xem đề đã nhập</button>}<button className="secondary-button" disabled={!!busy} onClick={() => { setView("create"); setWork(emptyStudioWorkspace()); setSeparateText(""); setSelected(null); setWordFiles({ exam: null, answers: null }); setError(""); }}>Tạo đề mới</button></div></header>
    <ExamModeSwitch mode="manual" disabled={!!busy} onChange={mode => { if (mode === "auto") onAuto(); }}/>
    {error && <p role="alert" className="form-error">{error}</p>}{storageError && <p role="alert" className="form-error">{storageError}</p>}{notice && <p role="status" className="lab-notice">{notice}</p>}{busy && <p role="status">{busy}</p>}
    <div className="exam-builder-layout exam-creation-layout"><div className="exam-builder-controls" hidden={view !== "create" && !!selected}><fieldset disabled={!!busy}>
      <legend>Thuộc tính đề thi</legend><div className="exam-setup-grid">
      <label>Chế độ đề<select aria-label="Chế độ đề Manual" value={config.output} onChange={event => patch({ output: event.target.value as StudioConfig["output"] })}><option value="word">Word theo mẫu — dùng ngay</option><option value="online">Làm trực tiếp trên MindCanvas</option></select></label>
      <label>Mức độ<select aria-label="Mức độ Manual" value={config.difficulty} onChange={event => patch({ difficulty: event.target.value as StudioConfig["difficulty"] })}><option value="easy">Dễ</option><option value="medium">Vừa</option><option value="hard">Khó</option></select></label>
      </div>

      {config.output === "online" && <div className="exam-online-settings"><label>Số câu<input aria-label="Số câu đề tương tác" type="number" min={1} max={maxQuestions} value={config.questionCount ?? ""} onChange={event => patch({ questionCount: event.target.value === "" ? null : Number(event.target.value) })}/></label><fieldset><legend>Dạng bài</legend>{ONLINE_TYPES.map(type => <label className="exam-confirm" key={type}><input aria-label={`Chọn dạng ${type}`} type="checkbox" checked={config.types.includes(type)} onChange={event => patch({ types: event.target.checked ? [...config.types, type] : config.types.filter(item => item !== type) })}/>{labels[type]}</label>)}</fieldset></div>}
      <details><summary>Tùy chọn nâng cao</summary><label>Môn học<input aria-label="Môn học Manual" maxLength={160} placeholder="Theo tài liệu" value={config.subject} onChange={event => patch({ subject: event.target.value })}/></label><label>Lớp / trình độ<input maxLength={160} placeholder="Theo tài liệu" value={config.level} onChange={event => patch({ level: event.target.value })}/></label><label>Ngôn ngữ<select value={config.language} onChange={event => patch({ language: event.target.value as "vi" | "en" })}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label>{config.output === "word" && <label>Số câu (để trống giữ theo mẫu)<input aria-label="Số câu Word" type="number" min={1} max={maxQuestions} value={config.questionCount ?? ""} onChange={event => patch({ questionCount: event.target.value === "" ? null : Number(event.target.value) })}/></label>}<label>Thời gian (phút)<input aria-label="Thời gian Studio" type="number" min={1} max={300} placeholder="Theo mẫu / không giới hạn" value={config.durationMinutes ?? ""} onChange={event => patch({ durationMinutes: event.target.value === "" ? null : Number(event.target.value) })}/></label><label>Điểm mỗi câu<input type="number" min={.01} max={100} step="any" placeholder="Theo mẫu / AI chọn" value={config.pointsPerQuestion ?? ""} onChange={event => patch({ pointsPerQuestion: event.target.value === "" ? null : Number(event.target.value) })}/></label><label>Yêu cầu thêm<textarea maxLength={2000} value={config.instructions} onChange={event => patch({ instructions: event.target.value })}/></label></details>
      {config.output === "online" && <details><summary>Văn bản gửi AI riêng (tùy chọn)</summary><p>Phần này không gắn vào prompt và không tạo thêm file source. Hãy gửi riêng cho AI sau khi gửi prompt.</p><textarea aria-label="Văn bản gửi riêng" rows={5} maxLength={120000} value={separateText} onChange={event => { setSeparateText(event.target.value); setWork(current => ({ ...current, separateText: event.target.value })); }}/><button className="secondary-button" disabled={!separateText.trim() || work.sources.length >= 6} onClick={() => { if (!work.sources.some(source => source.textOnly)) setWork(current => ({ ...current, sources: [...current.sources, { id: crypto.randomUUID(), name: "Văn bản gửi riêng", mimeType: "text/plain", size: 0, role: "material", textOnly: true }] })); }}>Dùng văn bản này làm nguồn gửi riêng</button><button className="secondary-button" disabled={!separateText} onClick={() => void run("Đang sao chép văn bản riêng.", async () => { await writeClipboardText(separateText); setNotice("Gửi văn bản này trong tin nhắn riêng cho AI, cùng với prompt."); })}>Sao chép văn bản riêng</button></details>}
      {!owner && <p className="exam-warning">Đăng nhập để sao chép prompt và lưu đề theo tài khoản.</p>}
    </fieldset>
    <fieldset disabled={!!busy} className="exam-manual-panel"><legend>Prompt của bạn</legend>
      <div className="exam-prompt-heading"><p>Prompt tự cập nhật theo thuộc tính. Sao chép rồi gửi cùng file gốc cho AI ngoài.</p><button className="primary-button" disabled={!owner || !prepared.session} onClick={() => void copy()}>Sao chép prompt</button></div>
      {prepared.error && <p role="alert" className="form-error">{prepared.error}</p>}
      <textarea aria-label="Prompt Studio" rows={12} readOnly value={prepared.session?.prompt ?? ""}/>
      <small>{config.output === "word" ? "AI xuất de-thi.docx và dap-an-loi-giai.docx riêng để dùng ngay." : "AI xuất JSON để nhập vào MindCanvas và làm bài trực tiếp."}</small>
    </fieldset>
    <fieldset disabled={!!busy}><legend>Công cụ bổ sung</legend>      <details className="exam-secondary-tools"><summary>Gói gửi AI và file gốc (tùy chọn)</summary><p className="exam-hint">Bạn có thể đính kèm file trực tiếp khi gửi AI ngoài. Chỉ chọn file ở đây nếu muốn tải chung trong một gói.</p>
      {config.output === "word" && <label className="exam-upload">Chọn file đề mẫu<input aria-label="File đề mẫu Manual" type="file" accept={MANUAL_EXAM_ACCEPT} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void addFiles(files, "template"); }}/></label>}
      <label className="exam-upload">{config.output === "word" ? "Tài liệu bổ sung (tùy chọn)" : "Chọn tài liệu"}<input aria-label="File tài liệu Manual" type="file" multiple accept={MANUAL_EXAM_ACCEPT} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void addFiles(files, "material"); }}/></label>
      <details><summary>Chọn tài liệu đã lưu</summary><select aria-label="Tài liệu đã lưu Manual" value={documentId} onChange={event => setDocumentId(event.target.value)}><option value="">Chọn tài liệu</option>{documents.filter(document => ["pdf", "docx"].includes(document.kind)).map(document => <option key={document.id} value={document.id}>{document.name}</option>)}</select><button className="secondary-button" disabled={!documentId} onClick={() => void run("Đang lấy file gốc đã lưu.", async signal => { const document = documents.find(item => item.id === documentId); if (!document) return; const response = await fetch(document.dataUrl, { signal }), blob = await response.blob(); const file = new File([blob], document.name, { type: document.mimeType }); if (signal.aborted || !alive.current) return; if (work.sources.filter(source => config.output !== "word" || source.role !== "template").length >= 6) throw new Error("Tối đa 6 nguồn."); const role = config.output === "word" ? "template" : "material", source = await saveStudioOriginal(owner, file, role); if (!alive.current || signal.aborted) return; setWork(current => ({ ...current, sources: [...current.sources.filter(item => role !== "template" || item.role !== "template"), source] })); })}>Thêm file đã chọn</button></details>
      <ul className="exam-original-list">{work.sources.map(source => <li key={source.id}><span>{source.role === "template" ? "Mẫu: " : "Tài liệu: "}{source.name}{source.textOnly ? " · gửi văn bản riêng" : ` · ${(source.size / 1024).toFixed(0)} KB`}</span><button className="text-button" onClick={() => setWork(current => ({ ...current, sources: current.sources.filter(item => item.id !== source.id) }))}>Bỏ khỏi đề</button>{!source.textOnly && <button className="text-button" onClick={() => void download(source.id)}>Tải file gốc</button>}</li>)}</ul>
      <p className="exam-hint">Tối đa 6 file, 10 MB/file. AI ngoài đọc trực tiếp file gốc, gồm cả ảnh/PDF scan. Prompt không chứa nội dung trích xuất; gói chỉ gồm prompt và originals/.</p>
      <button className="secondary-button" disabled={!prepared.session || !owner} onClick={() => void bundle()}>Tải gói gửi AI</button></details></fieldset>
    <details className="exam-secondary-tools"><summary>Nhập kết quả từ AI</summary>
    <fieldset disabled={!!busy}><legend>{config.output === "word" ? "Xem lại Word trên web (tùy chọn)" : "Nhập đề để làm trên web"}</legend>
      {config.output === "word" ? <><p>Bạn có thể dùng Word do AI tạo ngay. Nếu muốn lưu và xem trên MindCanvas, chọn file đề và file đáp án riêng.</p><label>File Word đề<input aria-label="Word đề kết quả" type="file" accept=".docx" onChange={event => { const file = event.target.files?.[0] ?? null; event.target.value = ""; setWordFiles(current => ({ ...current, exam: file })); }}/></label>{wordFiles.exam && <small>{wordFiles.exam.name}</small>}<label>File Word đáp án & lời giải<input aria-label="Word đáp án kết quả" type="file" accept=".docx" onChange={event => { const file = event.target.files?.[0] ?? null; event.target.value = ""; setWordFiles(current => ({ ...current, answers: file })); }}/></label>{wordFiles.answers && <small>{wordFiles.answers.name}</small>}<button className="primary-button" disabled={!wordFiles.exam || !owner} onClick={() => void importWord()}>Lưu & xem Word</button></> : <><label>JSON đề từ AI<textarea aria-label="JSON đề tương tác" rows={10} maxLength={2000000} value={work.importText} onChange={event => setWork(current => ({ ...current, importText: event.target.value }))}/></label><label>Chọn file JSON<input aria-label="File JSON tương tác" type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; void run("Đang đọc JSON.", async signal => { if (file.size > 2000000) throw new Error("JSON vượt 2 MB."); const text = new TextDecoder("utf-8", { fatal: true }).decode(await readLocalBytes(file)); if (!alive.current || signal.aborted) return; setWork(current => ({ ...current, importText: text })); }); }}/></label><button className="primary-button" disabled={!work.importText.trim() || !owner} onClick={() => void importOnline()}>Nhập đề tương tác</button><p className="exam-hint">Trắc nghiệm, điền khuyết và tính toán có thể chấm tự động. Tự luận hoặc câu trả lời mở dùng đáp án mẫu và hướng dẫn tự chấm sau khi nộp.</p></>}
      <p className="exam-hint">Manual dùng hạn mức hiện có: Word tính khi sao chép prompt hoặc tải gói; đề tương tác tính khi nhập kết quả hợp lệ. Tài liệu không được gửi tới API AI của MindCanvas.</p>
    </fieldset></details></div>
    {selected && <main className="exam-result-view" hidden={view !== "result"}><button className="secondary-button exam-back-button" disabled={!!busy} onClick={backToSetup}>Quay lại thiết lập</button>{selected.kind === "word" ? <><div className="exam-result-toolbar"><button className="secondary-button" aria-expanded={wordAnswers} disabled={!selected.answerFileId || !!busy} onClick={() => setWordAnswers(value => !value)}>{wordAnswers ? "Xem đề Word" : "Đáp án & lời giải Word"}</button><button className="primary-button" disabled={!!busy} onClick={() => void download(selected.examFileId)}>Tải Word đề</button>{selected.answerFileId && <button className="secondary-button" disabled={!!busy} onClick={() => void download(selected.answerFileId!)}>Tải Word đáp án</button>}</div><h2>{selected.title}{wordAnswers ? " · Đáp án & lời giải" : ""}</h2>{wordLoading && <p role="status">Đang mở Word…</p>}{wordUrl && <DocxViewer key={wordUrl} dataUrl={wordUrl}/>}</> : <><div className="exam-result-toolbar"><button className="primary-button" disabled={!!busy} onClick={playExam}>Làm bài trên MindCanvas</button><button className="secondary-button" disabled={!!busy} onClick={() => { setWork(current => ({ ...current, config: { ...emptyStudioConfig(), output: "online", questionCount: selected.exam.questions.length, types: Array.from(new Set(selected.exam.questions.map(q => q.type))) }, sources: selected.exam.sources, session: null, editingId: selected.id.startsWith("legacy-") ? null : selected.id, importText: JSON.stringify(onlineExamPayload(selected.exam), null, 2), importRequestId: crypto.randomUUID(), importConsumed: false })); setView("create"); }}>Chỉnh sửa đề JSON</button></div>{selected.exam.warnings.map((warning, index) => <p className="exam-warning" key={index}>{warning}</p>)}<OnlineExamPreview exam={selected.exam}/></>}</main>}</div>
    <details className="exam-library"><summary>Thư viện đề trên thiết bị ({items.length + legacy.length})</summary><p>File gốc, đề và bài làm được lưu theo tài khoản trên trình duyệt này.</p><div>{items.map(item => <article key={item.id}><button disabled={!!busy} onClick={() => select(item)}>{item.title}<small>{item.kind === "word" ? "Word theo mẫu" : "Làm trên MindCanvas"}</small></button><button className="secondary-button" disabled={!!busy} aria-label={`Xóa ${item.title}`} onClick={() => void run("Đang xóa đề.", async () => { await deleteStudioItem(owner, item.id); if (!alive.current) return; setItems(rows => rows.filter(row => row.id !== item.id)); if (selected?.id === item.id) { setView("create"); setSelected(null); setWork(current => ({ ...current, selectedId: null })); } })}>Xóa</button></article>)}{legacy.map(item => <article key={`old-${item.id}`}><button disabled={!!busy} onClick={() => select({ id: `legacy-${item.id}`, owner: owner ?? "guest", title: item.draft.title, updatedAt: item.updatedAt, kind: "online", exam: legacyOnlineExam(item) })}>{item.draft.title}<small>Đề đã lưu từ phiên bản trước · làm trên web</small></button></article>)}</div></details>
  </section>;
}
