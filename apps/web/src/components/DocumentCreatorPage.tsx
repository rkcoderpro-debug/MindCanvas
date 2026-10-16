import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, ClipboardList, Code2, Download, FileText, Search, Trash2 } from "lucide-react";
import type { SavedExam } from "@mindcanvas/shared";
import type { AccountPlan } from "../lib/account";
import type { QuizStore } from "../hooks/useQuizzes";
import { fileToDataUrl, type UploadedDocument } from "../lib/documentStore";
import { deleteNote, listNotes, type SavedNote } from "../lib/takenoteStore";
import { listSavedExams } from "../lib/examStore";
import { getStudioOriginal, listStudioItems, type StudioItem } from "../lib/examStudioStore";
import { downloadManualFile } from "../lib/examManualSource";
import { exportExamPdf } from "../lib/examPdf";
import { useLearningTool } from "../lib/learningNavigation";
import { useLanguage } from "../lib/i18n";
import ExamBuilderPage from "./ExamBuilderPage";
import TakenoteBuilderPage from "./TakenoteBuilderPage";
import ExamPaper from "./ExamPaper";
import FormulaText from "./FormulaText";
import DocxViewer from "./DocxViewer";
import ExamOnlineRunner, { OnlineExamPreview } from "./ExamOnlineRunner";

type Entry = { type: "note"; note: SavedNote } | { type: "auto"; exam: SavedExam } | { type: "manual"; item: StudioItem };
type Props = { owner: string | null; documents?: UploadedDocument[]; onDocumentsChanged: () => void; quizzes: QuizStore; accountPlan?: AccountPlan; onOpenQuiz: () => void };
const titleOf = (entry: Entry) => entry.type === "note" ? entry.note.title : entry.type === "auto" ? entry.exam.draft.title : entry.item.title;
const dateOf = (entry: Entry) => entry.type === "note" ? entry.note.updatedAt : entry.type === "auto" ? entry.exam.updatedAt : entry.item.updatedAt;
const idOf = (entry: Entry) => entry.type === "note" ? entry.note.id : entry.type === "auto" ? entry.exam.id : entry.item.id;
export default function DocumentCreatorPage({ owner, documents = [], onDocumentsChanged, quizzes, accountPlan, onOpenQuiz }: Props) {
  const { language } = useLanguage(), vi = language === "vi";
  const [choice, setChoice] = useState<"note" | "exam" | null>(null), [visited, setVisited] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<Entry[]>([]), [filter, setFilter] = useState("all"), [query, setQuery] = useState(""), [version, setVersion] = useState(0);
  const [openNote, setOpenNote] = useState<SavedNote | null>(null), [preview, setPreview] = useState<Exclude<Entry, { type: "note" }> | null>(null), [previewVisible, setPreviewVisible] = useState(false), [error, setError] = useState("");
  const navigation = useLearningTool();
  const refresh = () => setVersion(value => value + 1);
  useEffect(() => {
    let alive = true;
    void Promise.allSettled([listNotes(owner), listSavedExams(owner), listStudioItems(owner)]).then(results => {
      if (!alive) return;
      const next: Entry[] = [];
      results.forEach((result, index) => { if (result.status === "fulfilled") { if (index === 0) next.push(...(result.value as SavedNote[]).map(note => ({ type: "note" as const, note }))); else if (index === 1) next.push(...(result.value as SavedExam[]).map(exam => ({ type: "auto" as const, exam }))); else next.push(...(result.value as StudioItem[]).map(item => ({ type: "manual" as const, item }))); } });
      setEntries(next.sort((a, b) => dateOf(b).localeCompare(dateOf(a))));
      setError(results.some(result => result.status === "rejected") ? "Chưa đọc được một phần thư viện trên thiết bị. Các tài liệu đọc được vẫn hiển thị bên dưới." : "");
    });
    return () => { alive = false; };
  }, [owner, version, choice]);
  const choose = (next: "note" | "exam") => { setVisited(current => new Set([...current, next])); setChoice(next); setPreviewVisible(false); };
  const select = (entry: Entry) => {
    if (entry.type === "note") { choose("note"); setOpenNote({ ...entry.note }); }
    else { setPreview(entry); if (navigation) navigation.open("created-exam", () => setPreviewVisible(true), () => setPreviewVisible(false)); else setPreviewVisible(true); }
  };
  const backFromPreview = () => { setPreviewVisible(false); navigation?.back(); };
  const visible = entries.filter(entry => (filter === "all" || (filter === "note" ? entry.type === "note" : entry.type !== "note")) && titleOf(entry).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="document-creator-page">
    <div hidden={!!choice || previewVisible}>
      <header className="document-create-heading"><span className="document-create-symbol"><FileText size={24}/></span><div><h1>{vi ? "Tạo tài liệu" : "Create documents"}</h1><p>{vi ? "Bạn muốn tạo tài liệu gì hôm nay?" : "What would you like to create?"}</p></div></header>
      <div className="document-type-cards"><button onClick={() => choose("note")}><span className="document-type-icon"><BookOpen size={28}/></span><h2>Takenote</h2><p>{vi ? "Tổng hợp kiến thức, ví dụ và bài học trực quan có tương tác." : "Study notes, worked examples and interactive visual lessons."}</p><span className="document-type-tags">Word · PDF · HTML</span><strong>{vi ? "Tạo Takenote" : "Create notes"} →</strong></button><button onClick={() => choose("exam")}><span className="document-type-icon exam"><ClipboardList size={28}/></span><h2>{vi ? "Đề thi & bài tập" : "Exams & exercises"}</h2><p>{vi ? "Tạo đề theo mẫu hoặc bài tập nhiều dạng, có đáp án và lời giải." : "Template-based papers or interactive questions with worked solutions."}</p><span className="document-type-tags">Word · PDF · {vi ? "Làm bài trên web" : "Online exam"}</span><strong>{vi ? "Tạo đề thi" : "Create an exam"} →</strong></button></div>
      <section className="created-document-library"><header><h2>{vi ? "Tài liệu đã tạo" : "Created documents"}</h2><button className="text-button" onClick={refresh}>{vi ? "Làm mới" : "Refresh"}</button></header>{error && <p role="alert" className="form-error">{error}</p>}<div className="created-library-controls"><div className="note-visual-options" role="group" aria-label="Lọc tài liệu đã tạo">{[["all", vi ? "Tất cả" : "All"], ["note", "Takenote"], ["exam", vi ? "Đề thi" : "Exams"]].map(([id, name]) => <button key={id} aria-pressed={filter === id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{name}</button>)}</div><label className="document-search"><Search size={16}/><input aria-label="Tìm tài liệu đã tạo" value={query} onChange={event => setQuery(event.target.value)} placeholder={vi ? "Tìm tài liệu…" : "Search documents…"}/></label></div>
        <div className="created-document-list">{visible.map(entry => <div key={`${entry.type}:${idOf(entry)}`}><button className="created-document-open" onClick={() => select(entry)}>{entry.type === "note" && entry.note.format === "html" ? <Code2 size={20}/> : <FileText size={20}/>}<span><strong>{titleOf(entry)}</strong><small>{entry.type === "note" ? `Takenote · ${entry.note.format === "html" ? "HTML tương tác" : entry.note.format === "docx" ? "Word" : "Kiến thức"}` : entry.type === "auto" ? "Đề thi · AI Auto" : `Đề thi · ${entry.item.kind === "word" ? "Word" : "Tương tác"}`} · {new Date(dateOf(entry)).toLocaleDateString(vi ? "vi-VN" : "en-US")}</small></span></button>{entry.type === "note" && <button className="icon-button" aria-label={`Xóa ${entry.note.title}`} onClick={() => { void deleteNote(owner, entry.note.id).then(refresh).catch(cause => setError((cause as Error).message)); }}><Trash2 size={15}/></button>}</div>)}</div>{!visible.length && <p className="field-hint">{vi ? "Chưa có tài liệu phù hợp. Chọn một loại phía trên để bắt đầu." : "Choose a document type above to get started."}</p>}
      </section>
    </div>
    <div hidden={!choice || previewVisible}>
      <button className="text-button document-type-back" onClick={() => { setChoice(null); refresh(); }}><ArrowLeft size={16}/>{vi ? "Đổi loại tài liệu" : "Change document type"}</button>
      {visited.has("note") && <div hidden={choice !== "note"} inert={choice !== "note"}><TakenoteBuilderPage key={owner} owner={owner} documents={documents} onDocumentsChanged={onDocumentsChanged} onSaved={refresh} openNote={openNote}/></div>}
      {visited.has("exam") && <div hidden={choice !== "exam"} inert={choice !== "exam"}><ExamBuilderPage key={owner} owner={owner} documents={documents} quizzes={quizzes} accountPlan={accountPlan} onOpenQuiz={onOpenQuiz}/></div>}
    </div>
    {preview && <div hidden={!previewVisible}><CreatedExamViewer owner={owner} entry={preview} onBack={backFromPreview}/></div>}
  </section>;
}
function CreatedExamViewer({ owner, entry, onBack }: { owner: string | null; entry: Exclude<Entry, { type: "note" }>; onBack: () => void }) {
  const [answers, setAnswers] = useState(false), [playing, setPlaying] = useState(false), [wordUrl, setWordUrl] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    setWordUrl(""); setAnswers(false); setPlaying(false); setError("");
  }, [idOf(entry)]);
  const word = entry.type === "manual" && entry.item.kind === "word" ? entry.item : null;
  useEffect(() => {
    let alive = true; setWordUrl("");
    const id = word && (answers ? word.answerFileId : word.examFileId);
    if (id) void getStudioOriginal(owner, id).then(file => { if (!file) throw new Error("Không tìm thấy file Word trên thiết bị."); return fileToDataUrl(file); }).then(url => { if (alive) setWordUrl(url); }).catch(cause => { if (alive) setError((cause as Error).message); });
    return () => { alive = false; };
  }, [word?.id, answers, owner]);
  if (playing && entry.type === "manual" && entry.item.kind === "online") return <ExamOnlineRunner owner={owner} exam={entry.item.exam} onBack={() => setPlaying(false)} onReference={id => { void getStudioOriginal(owner, id).then(file => { if (file) downloadManualFile(file, file.name); else setError("Không tìm thấy nguồn gốc trên thiết bị."); }).catch(cause => setError(cause.message)); }}/>;
  return <section className="created-exam-preview"><header className="note-result-toolbar"><button className="text-button" onClick={onBack}><ArrowLeft size={16}/>Tài liệu đã tạo</button><div className="actions"><button className="secondary-button" disabled={!!word && !word.answerFileId} onClick={() => setAnswers(value => !value)}>{answers ? "Xem đề" : "Đáp án & lời giải"}</button>{entry.type === "auto" ? <button className="secondary-button" onClick={() => void exportExamPdf(entry.exam).catch(cause => setError(cause.message))}>Xuất PDF</button> : entry.item.kind === "online" ? <button className="primary-button" onClick={() => setPlaying(true)}>Làm bài</button> : <button className="secondary-button" onClick={() => { const fileId = answers ? word!.answerFileId : word!.examFileId; if (fileId) void getStudioOriginal(owner, fileId).then(file => { if (file) downloadManualFile(file, file.name); }).catch(cause => setError(cause.message)); }}><Download size={15}/>Tải Word</button>}</div></header>{error && <p role="alert" className="form-error">{error}</p>}{entry.type === "auto" ? <ExamPaper exam={entry.exam} answers={answers}/> : entry.item.kind === "online" ? <><OnlineExamPreview exam={entry.item.exam}/>{answers && <article className="takenote-content">{entry.item.exam.questions.map((question, index) => <section key={question.id}><h3>Câu {index + 1}</h3><p><FormulaText text={question.answer}/></p><p><FormulaText text={question.explanation}/></p></section>)}</article>}</> : wordUrl ? <DocxViewer dataUrl={wordUrl}/> : <p role="status">Đang mở Word…</p>}</section>;
}
