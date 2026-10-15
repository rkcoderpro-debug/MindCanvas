import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FileUp, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { examQuestionCount, validateExamSettings, validateExamSources, validateExamBlueprint, validateExamDraft, type ExamBlueprint, type ExamQuestion, type ExamSettings, type ExamSource, type SavedExam } from "@mindcanvas/shared";
import type { AccountPlan } from "../lib/account";
import type { UploadedDocument } from "../lib/documentStore";
import type { QuizStore } from "../hooks/useQuizzes";
import { analyzeExamSources, generateExamDraft, readExamFile } from "../lib/api";
import { emptyManualExam } from "../lib/examManual";
import ExamManualStudio from "./ExamManualStudio";
import { emptyExamWorkspace, examAsQuiz, loadExamWorkspace, persistExamWorkspace } from "../lib/examWorkspace";
import { deleteExam, listSavedExams, saveExam } from "../lib/examStore";
import { createQuizTest } from "../lib/quiz";
import { exportExamPdf } from "../lib/examPdf";
import ExamPaper from "./ExamPaper";
import ExamDraftEditor from "./ExamDraftEditor";
import ExamPlanEditor from "./ExamPlanEditor";

export const EXAM_FILE_ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp";
const MAX_FILE = 10 * 1024 * 1024;
export default function ExamBuilderPage({ owner, documents = [], quizzes, accountPlan, onOpenQuiz }: { owner: string | null; documents?: UploadedDocument[]; quizzes: QuizStore; accountPlan?: AccountPlan; onOpenQuiz: () => void }) {
  const initial = useMemo(() => { try { return { work: loadExamWorkspace(owner), error: "" }; } catch { return { work: emptyExamWorkspace(), error: "Không thể khôi phục bản nháp trên thiết bị. Hãy kiểm tra quyền lưu trữ của trình duyệt." }; } }, [owner]);
  const [work, setWork] = useState(initial.work);
  const [error, setError] = useState(initial.error), [notice, setNotice] = useState("");
  const [persistError, setPersistError] = useState("");
  const [busy, setBusy] = useState("");
  const [library, setLibrary] = useState<SavedExam[]>([]);
  const [answers, setAnswers] = useState(false), [editing, setEditing] = useState(false);
  const [sourceRole, setSourceRole] = useState<ExamSource["role"]>("material");
  const [documentId, setDocumentId] = useState("");
  const [paste, setPaste] = useState(""), [pasteName, setPasteName] = useState("Văn bản");
  const [reference, setReference] = useState<{ sourceId: string; page: number | null } | null>(null);
  const locked = useRef(false), alive = useRef(true), controller = useRef<AbortController | null>(null);
  const maxQuestions = Math.min(100, accountPlan?.maxCards ?? 50);
  const result = work.result;
  const isManual = work.aiMode === "manual";
  useEffect(() => {
    alive.current = true;
    void listSavedExams(owner).then(items => { if (alive.current) setLibrary(items); }).catch(() => { if (alive.current) setPersistError("Chưa đọc được thư viện đề trên thiết bị. Bản nháp hiện tại vẫn dùng được."); });
    return () => { alive.current = false; controller.current?.abort(); };
  }, [owner]);
  useEffect(() => {
    if (work === initial.work) return;
    try { persistExamWorkspace(owner, work); setPersistError(""); }
    catch { setPersistError("Không thể tự lưu bản nháp trên thiết bị. Giữ tab này mở và thử nút Lưu đề."); }
  }, [initial.work, owner, work]);
  async function run(label: string, job: (signal: AbortSignal) => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(label); setError(""); setNotice("");
    const request = new AbortController(); controller.current = request;
    try { await job(request.signal); }
    catch (cause) { if (alive.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "Không thể hoàn tất thao tác. Hãy thử lại."); }
    finally { locked.current = false; if (alive.current && !request.signal.aborted) setBusy(""); }
  }
  const setting = (change: Partial<ExamSettings>) => {
    if (change.mode === "materials") setSourceRole("material");
    setWork(current => ({ ...current, settings: { ...current.settings, ...change }, blueprint: null, sourceConfirmed: false, planConfirmed: false, ...(change.mode ? { manual: { ...(current.manual ?? emptyManualExam()), attributes: change.mode === "template" ? { questionCount: null, durationMinutes: null, pointsPerQuestion: null, instructions: (current.manual ?? emptyManualExam()).attributes.instructions } : emptyManualExam().attributes } } : {}) }));
  };
  const addSource = (source: ExamSource) => setWork(current => ({ ...current, sources: source.role === "template" ? [...current.sources.filter(item => item.role !== "template"), source] : [...current.sources, source], blueprint: null, sourceConfirmed: false, planConfirmed: false }));
  async function read(files: File[], role: ExamSource["role"]) {
    await run("Đang đọc tài liệu…", async signal => {
      if (!owner) throw new Error("Đăng nhập để đọc file và tạo đề bằng AI.");
      if (role === "template" && files.length !== 1) throw new Error("Chọn một đề mẫu mỗi lần.");
      if (work.sources.filter(source => source.role !== "template" || role !== "template").length + files.length > 6) throw new Error("Mỗi đề dùng tối đa 6 nguồn.");
      for (const file of files) {
        if (file.size > MAX_FILE) throw new Error(`${file.name}: tối đa 10 MB mỗi file.`);
        const source = await readExamFile(file, signal);
        if (!alive.current || signal.aborted) return;
        addSource({ ...source, role, warnings: source.warnings ?? [] });
      }
    });
  }
  const verified = () => {
    if (!owner) throw new Error("Đăng nhập để tạo đề bằng AI.");
    if (!work.sourceConfirmed) throw new Error("Hãy kiểm tra và xác nhận nội dung nguồn trước.");
    const settings = validateExamSettings(work.settings), sources = validateExamSources(work.sources, settings.mode);
    if (sources.some(source => source.text.includes("[UNREADABLE]"))) throw new Error("Hãy bổ sung phần [UNREADABLE] trong nguồn trước khi tạo đề.");
    return { settings, sources };
  };
  const analyze = () => run("Đang phân tích cấu trúc…", async signal => {
    const input = verified(), response = await analyzeExamSources(input.settings, input.sources, signal);
    const blueprint = validateExamBlueprint(response.blueprint, input.settings.format);
    if (alive.current && !signal.aborted) setWork(current => ({ ...current, blueprint, planConfirmed: false }));
  });
  const generate = () => run("Đang tạo đề và kiểm tra lời giải…", async signal => {
    const input = verified();
    if (!work.planConfirmed) throw new Error("Hãy xác nhận cấu trúc đề trước khi tạo.");
    const blueprint = validateExamBlueprint(work.blueprint, input.settings.format);
    if (examQuestionCount(blueprint) > maxQuestions) throw new Error(`Gói hiện tại cho phép tối đa ${maxQuestions} câu mỗi lần tạo.`);
    const response = await generateExamDraft(input.settings, input.sources, blueprint, [], signal);
    const draft = validateExamDraft(response.draft, blueprint, input.sources, input.settings.format);
    if (!alive.current || signal.aborted) return;
    const exam: SavedExam = { id: crypto.randomUUID(), owner: owner ?? "guest", updatedAt: new Date().toISOString(), ...structuredClone(input), blueprint, draft, generationMode: "auto" };
    setWork(current => ({ ...current, result: exam })); setAnswers(false); setEditing(false); setReference(null);
    setNotice("Đã tạo bản nháp. Hãy xem lại đề, đáp án và lời giải trước khi sử dụng.");
  });
  const updatePlan = (change: Partial<ExamBlueprint>) => setWork(current => ({ ...current, blueprint: current.blueprint ? { ...current.blueprint, ...change } : null, planConfirmed: false }));
  const manualPlan = () => setWork(current => ({ ...current, blueprint: { title: "Đề thi mới", durationMinutes: 45, warnings: [], sections: [{ id: crypto.randomUUID(), title: "Phần I", instructions: "", type: "mcq", count: 10, points: 1 }] }, planConfirmed: false }));
  function editQuestion(sectionIndex: number, questionIndex: number, change: Partial<ExamQuestion>) {
    setWork(current => current.result ? { ...current, result: { ...current.result, draft: { ...current.result.draft, sections: current.result.draft.sections.map((section, index) => index === sectionIndex ? { ...section, questions: section.questions.map((question, index) => index === questionIndex ? { ...question, ...change } : question) } : section) } } } : current);
  }
  function moveQuestion(sectionIndex: number, index: number, offset: number) {
    if (!result) return; const sections = structuredClone(result.draft.sections), questions = sections[sectionIndex].questions;
    [questions[index], questions[index + offset]] = [questions[index + offset], questions[index]];
    setWork(current => ({ ...current, result: { ...result, draft: { ...result.draft, sections } } }));
  }
  const regenerate = (sectionIndex: number, questionIndex: number) => run("Đang tạo lại một câu…", async signal => {
    if (!result || !owner) throw new Error("Đăng nhập để tạo lại câu.");
    const section = result.blueprint.sections[sectionIndex], question = result.draft.sections[sectionIndex].questions[questionIndex];
    const blueprint = { ...result.blueprint, sections: [{ ...section, count: 1 }] };
    const response = await generateExamDraft(result.settings, result.sources, blueprint, result.draft.sections.flatMap(section => section.questions.map(question => question.prompt)), signal);
    const one = validateExamDraft(response.draft, blueprint, result.sources, result.settings.format).sections[0].questions[0];
    if (alive.current && !signal.aborted) editQuestion(sectionIndex, questionIndex, { ...one, id: question.id });
  });
  const save = (quiz: boolean) => run("Đang lưu…", async () => {
    if (!result) return;
    validateExamDraft(result.draft, result.blueprint, result.sources, result.settings.format);
    let saved = result;
    if (quiz) {
      if (!owner) throw new Error("Đăng nhập để lưu vào Quiz.");
      const id = result.quizId ?? result.id, previous = quizzes.quizzes.find(quiz => quiz.id === id);
      const item = await quizzes.saveQuiz({ ...createQuizTest({ title: result.draft.title, description: result.draft.description, questions: examAsQuiz(result) }), id, createdAt: previous?.createdAt ?? result.updatedAt });
      saved = { ...result, quizId: item.id };
      if (alive.current) setWork(current => ({ ...current, result: saved }));
    }
    saved = await saveExam(owner, saved);
    if (!alive.current) return;
    setWork(current => ({ ...current, result: saved })); setLibrary(items => [saved, ...items.filter(item => item.id !== saved.id)]);
    setNotice(quiz ? "Đã lưu vào Quiz và thư viện đề trên thiết bị." : "Đã lưu đề trên thiết bị này.");
  });
  const selectedReference = result?.sources.find(source => source.id === reference?.sourceId);
  if (isManual) return <ExamManualStudio key={owner} owner={owner} documents={documents} accountPlan={accountPlan} onAuto={() => setWork(current => ({ ...current, aiMode: "auto" }))}/>;
  return <section className="exam-builder-page">
    <header className="exam-builder-heading"><div><span className="eyebrow">EXAM STUDIO</span><h1>Tạo đề thi bằng AI</h1><p>Theo đề mẫu hoặc tài liệu của bạn · Dễ, Vừa, Khó</p></div><button className="secondary-button" disabled={!!busy} onClick={() => { setWork(emptyExamWorkspace()); setAnswers(false); setReference(null); setError(""); }}>Tạo đề mới</button></header>
    {error && <p role="alert" className="form-error">{error}</p>}{persistError && <p role="alert" className="form-error">{persistError}</p>}{notice && <p role="status" className="lab-notice">{notice}</p>}{busy && <p role="status" className="exam-busy"><RefreshCw size={16}/>{busy}</p>}
    <details className="exam-library"><summary><BookOpen size={16}/>Thư viện đề trên thiết bị này ({library.length})</summary><p>Đề và bản nháp được lưu riêng theo tài khoản trên trình duyệt này. Quiz dùng thư viện Quiz hiện có.</p><div>{library.map(exam => <article key={exam.id}><button disabled={!!busy} onClick={() => { setWork({ settings: exam.settings, sources: exam.sources, blueprint: exam.blueprint, result: structuredClone(exam), sourceConfirmed: true, planConfirmed: true, aiMode: exam.generationMode ?? "auto", manual: emptyManualExam() }); setAnswers(false); setEditing(false); setReference(null); }}>{exam.draft.title}<small>{exam.settings.format === "quiz" ? "Quiz" : "Đề nhiều dạng"} · {new Date(exam.updatedAt).toLocaleDateString("vi-VN")}</small></button><button className="icon-button" aria-label={`Xóa ${exam.draft.title}`} disabled={!!busy} onClick={() => void run("Đang xóa…", async () => { await deleteExam(owner, exam.id); if (alive.current) setLibrary(items => items.filter(item => item.id !== exam.id)); })}><Trash2 size={16}/></button></article>)}</div></details>
    <div className="exam-builder-layout"><aside className="exam-builder-controls"><fieldset disabled={!!busy}>
      <legend>1. Hình thức & nguồn</legend>
      <label>Chế độ AI<select aria-label="Chế độ AI đề thi" value={work.aiMode ?? "auto"} onChange={event => { setWork(current => ({ ...current, aiMode: event.target.value as "auto" | "manual" })); setError(""); setNotice(""); }}><option value="auto">AI Auto</option><option value="manual">AI Manual — gửi AI bên ngoài</option></select></label>
      <label>Hình thức đề<select aria-label="Hình thức đề" value={work.settings.format} onChange={event => setting({ format: event.target.value as ExamSettings["format"], ...(event.target.value === "paper" ? { mode: "template" } : {}) })}><option value="quiz">Quiz thông thường · 4 lựa chọn</option><option value="paper">Đề nhiều dạng · theo mẫu · PDF</option></select></label>
      <label>Cách tạo<select value={work.settings.mode} onChange={event => setting({ mode: event.target.value as ExamSettings["mode"] })}><option value="materials" disabled={work.settings.format === "paper"}>Theo tài liệu</option><option value="template">Tương tự đề mẫu</option></select></label>
      <label>Độ khó<select aria-label="Độ khó" value={work.settings.difficulty} onChange={event => setting({ difficulty: event.target.value as ExamSettings["difficulty"] })}><option value="easy">Dễ · nhận biết, áp dụng trực tiếp</option><option value="medium">Vừa · hiểu và vận dụng</option><option value="hard">Khó · suy luận nhiều bước</option></select></label>
      <div className="exam-fields"><label>Môn học<input value={work.settings.subject} maxLength={160} onChange={event => setting({ subject: event.target.value })}/></label><label>Lớp / trình độ<input value={work.settings.level} maxLength={160} onChange={event => setting({ level: event.target.value })}/></label></div>
      <label>Ngôn ngữ đề<select value={work.settings.language} onChange={event => setting({ language: event.target.value as "vi" | "en" })}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label>
      {work.settings.mode === "template" && <label className="exam-upload"><FileUp size={17}/>Chọn đề mẫu<input aria-label="Chọn đề mẫu" type="file" accept={EXAM_FILE_ACCEPT} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void read(files, "template"); }}/></label>}
      <label className="exam-upload"><FileUp size={17}/>{work.settings.mode === "template" ? "Tài liệu kiến thức bổ sung" : "Tải tài liệu"}<input aria-label="Tải tài liệu" type="file" multiple accept={EXAM_FILE_ACCEPT} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void read(files, "material"); }}/></label>
      <p className="exam-hint">Tối đa 6 nguồn, 10 MB/file, 120.000 ký tự tổng nội dung. Đọc ảnh/PDF scan, phân tích, tạo và tạo lại câu dùng hạn mức AI hiện có.</p>
      <details><summary>Chọn tài liệu đã lưu hoặc dán văn bản</summary><label>Vai trò<select aria-label="Vai trò nguồn" value={sourceRole} onChange={event => setSourceRole(event.target.value as ExamSource["role"])}><option value="material">Tài liệu kiến thức</option><option value="template" disabled={work.settings.mode !== "template"}>Đề mẫu</option></select></label>
        <select aria-label="Tài liệu đã lưu" value={documentId} onChange={event => setDocumentId(event.target.value)}><option value="">Chọn tài liệu đã lưu</option>{documents.filter(document => document.kind !== "xlsx").map(document => <option key={document.id} value={document.id}>{document.name}</option>)}</select><button type="button" className="secondary-button" disabled={!documentId || work.sources.length >= 6} onClick={() => { const document = documents.find(item => item.id === documentId); if (document) void run("Đang đọc tài liệu đã lưu…", async signal => { if (!owner) throw new Error("Đăng nhập để đọc tài liệu."); const response = await fetch(document.dataUrl, { signal }); const blob = await response.blob(); if (blob.size > MAX_FILE) throw new Error("Tối đa 10 MB mỗi file."); const file = new File([blob], document.name, { type: document.mimeType }); const source = await readExamFile(file, signal); if (alive.current && !signal.aborted) addSource({ ...source, role: sourceRole }); }); }}>Đọc tài liệu đã chọn</button>
        <label>Tên nguồn<input value={pasteName} maxLength={250} onChange={event => setPasteName(event.target.value)}/></label><textarea aria-label="Văn bản nguồn" rows={5} value={paste} maxLength={120000} onChange={event => setPaste(event.target.value)} placeholder="Dán nội dung đề mẫu hoặc tài liệu…"/><button type="button" className="secondary-button" disabled={!paste.trim() || work.sources.length >= 6} onClick={() => { addSource({ id: crypto.randomUUID(), name: pasteName || "Văn bản", role: sourceRole, text: paste, warnings: [] }); setPaste(""); }}>Thêm văn bản</button>
      </details>
      {work.sources.map(source => <details className="exam-source-preview" key={source.id}><summary>{source.role === "template" ? "Đề mẫu" : "Tài liệu"}: {source.name}</summary>{source.warnings.map((warning, index) => <p className="exam-warning" key={index}>{warning}</p>)}<textarea aria-label={`Nội dung ${source.name}`} rows={8} value={source.text} maxLength={120000} onChange={event => setWork(current => ({ ...current, sources: current.sources.map(item => item.id === source.id ? { ...item, text: event.target.value } : item), sourceConfirmed: false, planConfirmed: false }))}/><small>{source.text.length.toLocaleString()} ký tự</small><button className="text-button danger" onClick={() => setWork(current => ({ ...current, sources: current.sources.filter(item => item.id !== source.id), blueprint: null, sourceConfirmed: false, planConfirmed: false }))}>Bỏ nguồn này</button></details>)}
      <label className="exam-confirm"><input type="checkbox" checked={work.sourceConfirmed} onChange={event => setWork(current => ({ ...current, sourceConfirmed: event.target.checked, planConfirmed: false }))}/>Tôi đã kiểm tra nội dung, công thức và các cảnh báo của nguồn.</label>
      <div className="actions"><button className="primary-button" disabled={!work.sourceConfirmed || !work.sources.length || !owner} onClick={() => void analyze()}><Sparkles size={16}/>Phân tích cấu trúc</button><button className="secondary-button" disabled={!work.sourceConfirmed || !work.sources.length} onClick={manualPlan}>Tự nhập cấu trúc</button></div>
      {!owner && <p className="exam-warning">Đăng nhập để đọc file và dùng AI.</p>}
    </fieldset>
    {work.blueprint && <ExamPlanEditor plan={work.blueprint} format={work.settings.format} maxQuestions={maxQuestions} busy={!!busy} confirmed={work.planConfirmed} canGenerate={work.sourceConfirmed && !!owner} onChange={updatePlan} onConfirm={value => setWork(current => ({ ...current, planConfirmed: value }))} onGenerate={() => void generate()}/>}
    </aside><main className="exam-result-view">{result ? <>
      <div className="exam-result-toolbar"><button className="secondary-button" aria-expanded={answers} onClick={() => { setAnswers(value => !value); setReference(null); }}>{answers ? "Xem đề" : "Đáp án & lời giải"}</button><button className="secondary-button" disabled={!!busy} aria-pressed={editing} onClick={() => setEditing(value => !value)}>{editing ? "Xong chỉnh sửa" : "Chỉnh sửa đề"}</button><button className="secondary-button" disabled={!!busy} onClick={() => void save(false)}><Save size={16}/>Lưu đề</button>
        {result.settings.format === "quiz" ? <><button className="primary-button" disabled={!!busy || quizzes.busy || quizzes.loading} onClick={() => void save(true)}>Lưu vào Quiz</button>{result.quizId && <button className="secondary-button" onClick={onOpenQuiz}>Đi tới Quiz</button>}</> : <button className="primary-button" disabled={!!busy} onClick={() => void run("Đang chuẩn bị PDF…", async () => { await exportExamPdf(result); if (alive.current) setNotice("Trong hộp thoại in, chọn Lưu thành PDF. Đề ở trước; đáp án và lời giải bắt đầu ở phần riêng phía sau."); })}>Xuất PDF</button>}
      </div>
      {result.draft.warnings.map((warning, index) => <p className="exam-warning" key={index}>{warning}</p>)}
      {editing && <ExamDraftEditor exam={result} busy={!!busy} canRegenerate={!!owner} onTitle={title => setWork(current => ({ ...current, result: { ...result, draft: { ...result.draft, title } } }))} onDescription={description => setWork(current => ({ ...current, result: { ...result, draft: { ...result.draft, description } } }))} onQuestion={editQuestion} onMove={moveQuestion} onRegenerate={(section, question) => void regenerate(section, question)}/>}
      {selectedReference && <aside className="exam-reference-panel"><button className="text-button" onClick={() => setReference(null)}>Đóng nguồn</button><h3>{selectedReference.name}{reference?.page ? ` · trang ${reference.page}` : ""}</h3><pre>{reference?.page ? selectedReference.text.split(`[PAGE ${reference.page}]`)[1]?.split(/\[PAGE \d+\]/)[0] : selectedReference.text}</pre></aside>}
      <ExamPaper exam={result} answers={answers} onReference={(sourceId, page) => setReference({ sourceId, page })}/>
    </> : <div className="exam-result-empty"><BookOpen size={44}/><h2>Đề thi của bạn sẽ xuất hiện ở đây</h2><p>Chọn hình thức, kiểm tra nguồn và xác nhận cấu trúc để bắt đầu.</p></div>}</main></div>
  </section>;
}
