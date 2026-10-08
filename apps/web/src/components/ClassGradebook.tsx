import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, History, RefreshCw } from "lucide-react";
import {
  listAssignmentGradebook, listClassGradeHistory, recordClassGrade, reviewClassQuizSubmission,
  type ClassAssignment, type ClassGradeEvent, type ClassQuizReviewQuestion, type GradebookEntry,
} from "../lib/classrooms";
import { GRADEBOOK_HEADERS, gradebookCsv, gradebookDisplayRows } from "../lib/gradebookExport";
import FormulaText from "./FormulaText";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const safeName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,60) || "bai-tap";

export default function ClassGradebook({ assignment }: { assignment: ClassAssignment }) {
  const [entries, setEntries] = useState<GradebookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { points: string; feedback: string; reason: string }>>({});
  const [history, setHistory] = useState<{ studentId: string; entries: ClassGradeEvent[] } | null>(null);
  const [review, setReview] = useState<{ studentId: string; questions: ClassQuizReviewQuestion[] } | null>(null);
  const displayRows = useMemo(() => gradebookDisplayRows(entries, assignment.max_points), [entries, assignment.max_points]);
  const editDraft = (entry: GradebookEntry, patch: Partial<{ points: string; feedback: string; reason: string }>) =>
    setDrafts(current => ({ ...current, [entry.student_id]: {
      ...(current[entry.student_id] ?? { points: String(entry.points ?? ""), feedback: entry.feedback ?? "", reason: "" }),
      ...patch,
    } }));
  const refresh = async () => { setEntries(await listAssignmentGradebook(assignment.id)); };
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(""); setHistory(null); setReview(null); setEntries([]); setDrafts({});
    void listAssignmentGradebook(assignment.id).then(rows => { if (alive) setEntries(rows); })
      .catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [assignment.id]);
  const perform = async (job: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await job(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể thực hiện."); }
    finally { setBusy(false); }
  };
  const saveGrade = (event: FormEvent, entry: GradebookEntry) => {
    event.preventDefault();
    const draft = drafts[entry.student_id] ?? { points: String(entry.points ?? ""), feedback: entry.feedback ?? "", reason: "" };
    void perform(async () => {
      if (!draft.points.trim() || !Number.isInteger(Number(draft.points)) || Number(draft.points)<0 || Number(draft.points)>assignment.max_points)
        throw new Error("Điểm phải là số nguyên trong thang điểm của bài.");
      if (entry.status === "graded" && draft.reason.trim().length<10)
        throw new Error("Sửa điểm cần ghi lý do ít nhất 10 ký tự.");
      await recordClassGrade(assignment.id, entry.student_id, Number(draft.points), draft.feedback, draft.reason.trim());
      await refresh();
      if (history?.studentId === entry.student_id) setHistory({ studentId: entry.student_id, entries: await listClassGradeHistory(assignment.id, entry.student_id) });
      setDrafts(current => { const next = { ...current }; delete next[entry.student_id]; return next; });
      setNotice("Đã lưu điểm và ghi nhật ký.");
    });
  };
  const openHistory = (studentId: string) => void perform(async () => {
    if (history?.studentId === studentId) { setHistory(null); return; }
    setHistory({ studentId, entries: await listClassGradeHistory(assignment.id, studentId) });
  });
  const openReview = (studentId: string) => void perform(async () => {
    if (review?.studentId === studentId) { setReview(null); return; }
    setReview({ studentId, questions: await reviewClassQuizSubmission(assignment.id, studentId) });
  });
  const exportCsv = () => download(new Blob([gradebookCsv(displayRows)], { type: "text/csv;charset=utf-8" }), `so-diem-${safeName(assignment.title)}.csv`);
  const exportExcel = () => void perform(async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([Array.from(GRADEBOOK_HEADERS), ...displayRows.map(row => row.cells)]);
    // Always serialize imported names and notes as text cells, never formulas.
    for (const cell of Object.values(sheet)) if (cell && typeof cell === "object" && "t" in cell) {
      cell.t = "s"; delete cell.f;
    }
    sheet["!cols"] = [24,14,20,36,12,12,12,14,36].map(wch => ({ wch }));
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,sheet,"Sổ điểm");
    const bytes = XLSX.write(book,{ bookType:"xlsx", type:"array" }) as ArrayBuffer;
    download(new Blob([bytes],{ type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),`so-diem-${safeName(assignment.title)}.xlsx`);
  });
  return <section className="learning-card class-gradebook" aria-label="Sổ điểm">
    <header><div><span className="eyebrow">SỔ ĐIỂM</span><h3>{assignment.title}</h3><p>Mỗi hàng là một học trò của bài tập này. Điểm Quiz được máy chấm; điểm chấm có thể điều chỉnh và lưu lịch sử.</p></div><button type="button" disabled={busy} onClick={() => void perform(refresh)}><RefreshCw size={15}/>Làm mới</button></header>
    <div className="class-gradebook-actions"><button type="button" disabled={loading || busy || !entries.length} onClick={exportCsv}><Download size={15}/>Xuất CSV</button><button type="button" disabled={loading || busy || !entries.length} onClick={exportExcel}><Download size={15}/>Xuất Excel</button></div>
    {loading && <p>Đang tải sổ điểm…</p>}{error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    {!loading && <div className="class-gradebook-scroll"><table><thead><tr>{GRADEBOOK_HEADERS.map(header => <th key={header} scope="col">{header}</th>)}<th scope="col">Thao tác</th></tr></thead><tbody>{entries.map((entry,index) => {
      const draft = drafts[entry.student_id] ?? { points: String(entry.points ?? ""), feedback: entry.feedback ?? "", reason: "" };
      return <tr key={entry.student_id}>{displayRows[index].cells.map((cell,n) => <td key={GRADEBOOK_HEADERS[n]}>{cell}</td>)}<td>{entry.status !== "not_submitted" && <div className="class-gradebook-row-actions"><button type="button" onClick={() => openHistory(entry.student_id)}><History size={14}/>Lịch sử</button>{entry.quiz_total !== null && <button type="button" onClick={() => openReview(entry.student_id)}>Xem câu sai</button>}</div>}</td></tr>;
    })}</tbody></table>{!entries.length && <p>Chưa có học trò hoặc bài nộp.</p>}</div>}
    {entries.map(entry => entry.status !== "not_submitted" && <details className="class-gradebook-grade" key={entry.student_id}><summary>Chấm bài: {entry.name} · {entry.points ?? "Chưa có điểm"}/{assignment.max_points}</summary><p>Bài nộp: {entry.note || "Không có ghi chú."}</p><form onSubmit={event => saveGrade(event,entry)}><label>Điểm<input type="number" min={0} max={assignment.max_points} step={1} required value={drafts[entry.student_id]?.points ?? String(entry.points ?? "")} onChange={event => editDraft(entry,{ points:event.target.value })}/></label><label>Nhận xét<textarea maxLength={4000} value={drafts[entry.student_id]?.feedback ?? entry.feedback ?? ""} onChange={event => editDraft(entry,{ feedback:event.target.value })}/></label><label>{entry.status === "graded" ? "Lý do sửa điểm (bắt buộc)" : "Lý do chấm (tùy chọn)"}<textarea maxLength={500} minLength={entry.status === "graded" ? 10 : undefined} required={entry.status === "graded"} value={drafts[entry.student_id]?.reason ?? ""} onChange={event => editDraft(entry,{ reason:event.target.value })}/></label><button disabled={busy}>Lưu điểm</button></form></details>)}
    {history && <section className="class-gradebook-detail"><h4>Lịch sử điểm · {entries.find(entry => entry.student_id===history.studentId)?.name}</h4>{history.entries.map((event,index) => <article key={`${event.created_at}-${index}`}><strong>{new Date(event.created_at).toLocaleString("vi-VN")} · {event.actor_name}</strong><p>{event.old_points ?? "—"} → {event.new_points ?? "—"} điểm · {event.reason}</p>{event.old_feedback !== event.new_feedback && <p>Nhận xét: {event.old_feedback || "—"} → {event.new_feedback || "—"}</p>}</article>)}{!history.entries.length && <p>Chưa có thay đổi điểm.</p>}</section>}
    {review && <section className="class-gradebook-detail"><h4>Bài Quiz đã nộp · {entries.find(entry => entry.student_id===review.studentId)?.name}</h4>{review.questions.map(question => <article key={question.number}><strong>Câu {question.number} · {question.correct ? "Đúng" : "Sai"}</strong><p><FormulaText text={question.prompt}/></p><p>Đã chọn: {question.answer === null ? "Bỏ trống" : <FormulaText text={question.options[question.answer] ?? ""}/>}</p>{!question.correct && <p>Đáp án đúng: <FormulaText text={question.options[question.correct_index] ?? ""}/></p>}{question.explanation && <p>Giải thích: <FormulaText text={question.explanation}/></p>}</article>)}{!review.questions.length && <p>Không có lượt Quiz đã nộp.</p>}</section>}
  </section>;
}
