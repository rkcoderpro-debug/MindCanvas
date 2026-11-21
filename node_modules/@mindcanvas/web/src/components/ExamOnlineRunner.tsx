import { useEffect, useRef, useState } from "react";
import { gradeOnlineQuestion, onlineAttemptResult, type OnlineAttempt, type OnlineExam, type OnlineQuestion, type OnlineResponse } from "../lib/examOnline";
import { loadOnlineAttempt, saveOnlineAttempt } from "../lib/examStudioStore";
import FormulaText from "./FormulaText";
const scoreText = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
const typeNames = { mcq: "Trắc nghiệm", blank: "Điền khuyết", numeric: "Tính toán", short: "Trả lời ngắn", essay: "Tự luận" };
function QuestionPrompt({ question }: { question: OnlineQuestion }) {
  const text = question.type === "blank" ? question.prompt.replace(/\{\{([^{}]+)\}\}/g, (_, id: string) => `［${question.blanks.find(blank => blank.id === id)?.label ?? id}］`) : question.prompt;
  return <FormulaText text={text}/>;
}
export function OnlineExamPreview({ exam }: { exam: OnlineExam }) {
  return <article className="exam-paper"><h1>{exam.title}</h1><p>{exam.description}</p>{exam.questions.map((question, index) => <section className="exam-question" key={question.id}>{question.section && <h2>{question.section}</h2>}<h3>Câu {index + 1} · {typeNames[question.type]} · {scoreText(question.points)} điểm</h3><p><QuestionPrompt question={question}/></p>{question.type === "mcq" && <ol type="A">{question.options.map((option, index) => <li key={index}><FormulaText text={option}/></li>)}</ol>}</section>)}</article>;
}
export default function ExamOnlineRunner({ owner, exam, onBack, onReference }: { owner: string | null; exam: OnlineExam; onBack: () => void; onReference: (id: string) => void }) {
  const [attempt, setAttempt] = useState<OnlineAttempt | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [now, setNow] = useState(Date.now()), [leaving, setLeaving] = useState(false);
  const alive = useRef(true), latest = useRef<OnlineAttempt | null>(null), queue = useRef(Promise.resolve()), submitting = useRef(false);
  const writeFailed = useRef(false);
  const leavingRef = useRef(false);
  const persist = (value: OnlineAttempt) => {
    latest.current = value; setAttempt(value);
    queue.current = queue.current.catch(() => {}).then(() => saveOnlineAttempt(owner, exam, value)).then(() => { writeFailed.current = false; if (alive.current) setError(""); }).catch(() => { writeFailed.current = true; if (alive.current) setError("Chưa lưu được bài làm trên thiết bị. Giữ trang mở; kiểm tra quyền lưu trữ và thử lưu lại."); });
  };
  useEffect(() => {
    alive.current = true;
    void loadOnlineAttempt(owner, exam).then(value => { if (alive.current) { latest.current = value; setAttempt(value); } }).catch(cause => { if (alive.current) setError(cause instanceof Error ? cause.message : "Không khôi phục được bài làm."); }).finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
  }, [owner, exam.id, exam.revision]);
  const submit = () => {
    const value = latest.current; if (!value || value.submittedAt || submitting.current) return;
    submitting.current = true; persist({ ...value, submittedAt: Math.max(Date.now(), value.startedAt) }); submitting.current = false;
  };
  useEffect(() => {
    if (!attempt || attempt.submittedAt || attempt.endsAt === null) return;
    const tick = () => { setNow(Date.now()); if (latest.current?.endsAt && Date.now() >= latest.current.endsAt) submit(); };
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [attempt?.startedAt, attempt?.submittedAt, attempt?.endsAt]);
  const start = () => { if (loading) return; const startedAt = Date.now(); persist({ examId: exam.id, revision: exam.revision, startedAt, endsAt: exam.durationMinutes ? startedAt + exam.durationMinutes * 60000 : null, submittedAt: null, responses: {}, selfScores: {} }); setNow(startedAt); };
  const update = (id: string, patch: Partial<OnlineResponse>) => { const current = latest.current; if (!current || current.submittedAt || leavingRef.current) return; if (current.endsAt && Date.now() >= current.endsAt) { submit(); return; } persist({ ...current, responses: { ...current.responses, [id]: { ...current.responses[id], ...patch, ...(patch.blanks ? { blanks: { ...current.responses[id]?.blanks, ...patch.blanks } } : {}) } } }); };
  const submitted = !!attempt?.submittedAt, results = submitted && attempt ? onlineAttemptResult(exam, attempt) : null;
  const leave = () => {
    if (leavingRef.current) return; leavingRef.current = true; setLeaving(true);
    void (async () => { let pending: Promise<void>; do { pending = queue.current; await pending; } while (pending !== queue.current); if (!alive.current) return; if (!writeFailed.current) onBack(); else { leavingRef.current = false; setLeaving(false); } })();
  };
  const remaining = attempt?.endsAt ? Math.max(0, Math.ceil((attempt.endsAt - now) / 1000)) : null;
  return <section className="exam-online-runner">
    <header className="exam-builder-heading"><div><span className="eyebrow">LÀM BÀI TRÊN MINDCANVAS</span><h1>{exam.title}</h1><p>{exam.description}</p></div><button className="secondary-button" disabled={leaving} onClick={leave}>Quay lại thư viện đề</button></header>
    {error && <div role="alert" className="form-error">{error}{attempt && <button className="secondary-button" disabled={leaving} onClick={() => persist(attempt)}>Thử lưu lại bài làm</button>}</div>}
    {loading ? <p role="status">Đang khôi phục bài làm…</p> : !attempt ? <><p>Đáp án và lời giải xuất hiện sau khi nộp bài. Câu trả lời được lưu trên thiết bị theo tài khoản.</p><button className="primary-button" disabled={leaving} onClick={start}>Bắt đầu làm bài</button><OnlineExamPreview exam={exam}/></> : <>
      {!submitted && <div className="exam-runner-toolbar"><p>{remaining === null ? "Không giới hạn thời gian" : `Còn ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`} · Đáp án hiện sau khi nộp</p><button className="primary-button" disabled={leaving} onClick={submit}>Nộp bài</button></div>}
      {results && <section role="status" className="exam-score-summary"><h2>Kết quả bài làm</h2><p>Điểm tự động: {scoreText(results.autoScore)} / {scoreText(results.autoTotal)}</p><p>{results.pending ? `Điểm hiện có: ${scoreText(results.score)} / ${scoreText(results.total)} · Còn ${results.pending} câu cần tự chấm theo hướng dẫn.` : `Tổng điểm: ${scoreText(results.score)} / ${scoreText(results.total)}`}</p><button className="secondary-button" disabled={leaving} onClick={start}>Làm lượt mới</button></section>}
      <article className="exam-paper">{exam.questions.map((question, index) => {
        const response = attempt.responses[question.id] ?? {}, grade = submitted ? gradeOnlineQuestion(question, response, attempt.selfScores[question.id]) : null;
        return <section className="exam-question" key={question.id}>{question.section && <h2>{question.section}</h2>}<h3>Câu {index + 1} · {typeNames[question.type]} · {scoreText(question.points)} điểm</h3><p><QuestionPrompt question={question}/></p>
          <fieldset disabled={submitted || leaving} className="exam-response-fields"><legend>Trả lời câu {index + 1}</legend>
            {question.type === "mcq" && question.options.map((option, choice) => <label className="exam-choice" key={choice}><input type="radio" name={`answer-${question.id}`} aria-label={`Câu ${index + 1}, lựa chọn ${String.fromCharCode(65 + choice)}`} checked={response.choice === choice} onChange={() => update(question.id, { choice })}/><span>{String.fromCharCode(65 + choice)}. <FormulaText text={option}/></span></label>)}
            {question.type === "blank" && question.blanks.map(blank => <label key={blank.id}>{blank.label}<input aria-label={`Câu ${index + 1}, ${blank.label}`} maxLength={2000} value={response.blanks?.[blank.id] ?? ""} onChange={event => update(question.id, { blanks: { [blank.id]: event.target.value } })}/></label>)}
            {question.type === "numeric" && <div className="exam-fields"><label>Kết quả<input aria-label={`Kết quả câu ${index + 1}`} inputMode="decimal" maxLength={20000} value={response.text ?? ""} onChange={event => update(question.id, { text: event.target.value })} placeholder="Số thập phân hoặc ký hiệu khoa học"/></label>{!!question.numeric?.units.length && <label>Đơn vị<input aria-label={`Đơn vị câu ${index + 1}`} maxLength={80} value={response.unit ?? ""} onChange={event => update(question.id, { unit: event.target.value })}/></label>}</div>}
            {(question.type === "short" || question.type === "essay") && <label>Bài làm<textarea aria-label={`Bài làm câu ${index + 1}`} rows={question.type === "essay" ? 7 : 3} maxLength={20000} value={response.text ?? ""} onChange={event => update(question.id, { text: event.target.value })}/></label>}
          </fieldset>
          {submitted && grade && <div className="exam-submitted-solution"><p><strong>{grade.pending ? "Cần tự chấm" : `${scoreText(grade.score)} / ${scoreText(grade.max)} điểm`}</strong></p><p><strong>Đáp án: </strong><FormulaText text={question.answer}/></p><p><strong>Lời giải: </strong><FormulaText text={question.explanation}/></p>
            {question.rubric.length > 0 && <ul>{question.rubric.map((part, n) => <li key={n}><FormulaText text={part.criterion}/> · {scoreText(part.points)} điểm</li>)}</ul>}
            {grade.manual && <label>Tự chấm câu {index + 1} (0–{scoreText(question.points)})<input aria-label={`Tự chấm câu ${index + 1}`} disabled={leaving} type="number" min={0} max={question.points} step="any" value={attempt.selfScores[question.id] ?? ""} onChange={event => { const value = event.target.value, current = latest.current; if (!current?.submittedAt || leavingRef.current) return; const selfScores = { ...current.selfScores }; if (value === "") delete selfScores[question.id]; else { const score = Number(value); if (!Number.isFinite(score) || score < 0 || score > question.points) { setError(`Điểm tự chấm cần từ 0 đến ${question.points}.`); return; } selfScores[question.id] = score; } persist({ ...current, selfScores }); }}/></label>}
            {question.references.map((reference, n) => <div key={n}><button className="text-button" onClick={() => onReference(reference.fileId)}>{exam.sources.find(source => source.id === reference.fileId)?.name ?? reference.fileId}{reference.page ? ` · trang ${reference.page}` : ""}</button>{reference.excerpt && <blockquote>{reference.excerpt}</blockquote>}</div>)}
          </div>}
        </section>;
      })}</article>
    </>}
  </section>;
}
