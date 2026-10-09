import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Award, CheckCircle2, Play } from "lucide-react";
import { formatQuizPercent } from "../lib/quiz";
import type { SharedQuizResult, SharedQuizSession } from "../lib/learningShare";
import FormulaText from "./FormulaText";

type Props = {
  title: string;
  assignmentTitle: string;
  session: SharedQuizSession;
  answers: Array<number | null>;
  result: SharedQuizResult | null;
  busy: boolean;
  error: string;
  onAnswer: (questionIndex: number, optionIndex: number) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export default function ClassroomQuizRunner({ title, assignmentTitle, session, answers, result, busy, error, onAnswer, onSubmit, onClose }: Props) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const total = session.questions.length;
  const question = session.questions[questionIndex];

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);
  useEffect(() => { if (panelRef.current) panelRef.current.scrollTop = 0; }, [questionIndex, result]);

  return <div className="classrooms-quiz-overlay" onKeyDown={event => { if (event.key === "Escape" && !busy) onClose(); }}>
    <div className="classrooms-quiz-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={`Làm Quiz: ${title}`}>
      <div className="quiz-runner-header classrooms-quiz-header">
        <button ref={closeRef} type="button" className="secondary-button" disabled={busy} onClick={onClose}><ArrowLeft size={16}/>Về lớp học</button>
        <span title={title}>{title}</span>
        <small className="quiz-mode-badge">Bài tập · Xem đáp án sau khi nộp</small>
        {!result && <small>{total ? questionIndex + 1 : 0} / {total}</small>}
      </div>
      {result ? <div className="quiz-result">
        <div className="quiz-result-badge"><Award size={34}/><strong>{formatQuizPercent(result.score, result.total)}%</strong><span>{result.score} / {result.total}</span></div>
        <h2 aria-live="polite">Đã hoàn thành Quiz</h2>
        <p>Đã chọn lượt Quiz cho bài tập “{assignmentTitle}”. Hãy quay về lớp và bấm Nộp bài để ghi kết quả.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="quiz-answer-review">{result.questions.map((item, index) => {
          const answer = answers[index];
          const correct = answer === item.correctIndex;
          return <article key={item.id}><div><strong>#{index + 1}</strong><span className={correct ? "correct" : "incorrect"}><FormulaText text={item.prompt}/></span></div>
            <p><b>Đáp án của bạn:</b> {answer === null || answer === undefined ? "Chưa trả lời" : <FormulaText text={item.options[answer]}/>}</p>
            {!correct && <p><b>Đáp án đúng:</b> <FormulaText text={item.options[item.correctIndex]}/></p>}
            {item.explanation && <p><b>Giải thích:</b> <FormulaText text={item.explanation}/></p>}
          </article>;
        })}</div>
        <button type="button" className="primary-button" onClick={onClose}>Về bài tập để nộp</button>
      </div> : <div className="quiz-runner">
        <div className="quiz-progress" role="progressbar" aria-label="Tiến độ câu hỏi" aria-valuenow={total ? questionIndex + 1 : 0} aria-valuemin={0} aria-valuemax={total}><span style={{ width: `${total ? (questionIndex + 1) / total * 100 : 0}%` }}/></div>
        <div className="quiz-question-nav" aria-label="Điều hướng câu hỏi">{session.questions.map((item, index) => <button type="button" key={item.id} className={[index === questionIndex ? "current" : "", answers[index] !== null ? "answered" : ""].filter(Boolean).join(" ")} aria-label={`Câu ${index + 1}${answers[index] !== null ? ", đã trả lời" : ""}`} aria-current={index === questionIndex ? "step" : undefined} onClick={() => setQuestionIndex(index)}>{index + 1}</button>)}</div>
        {question ? <article className="quiz-question-card"><span className="quiz-question-kicker">Câu {questionIndex + 1}</span><h2><FormulaText text={question.prompt}/></h2>
          <div className="quiz-options">{question.options.map((option, optionIndex) => <button type="button" key={`${question.id}-${optionIndex}`} className={answers[questionIndex] === optionIndex ? "selected" : ""} aria-pressed={answers[questionIndex] === optionIndex} disabled={busy} onClick={() => onAnswer(questionIndex, optionIndex)}><span className="quiz-option-label">{String.fromCharCode(65 + optionIndex)}</span><span className="quiz-option-content"><FormulaText text={option}/></span></button>)}</div>
        </article> : <p>Quiz chưa có câu hỏi.</p>}
        <footer className="quiz-runner-actions"><button type="button" className="secondary-button" disabled={busy || questionIndex === 0} onClick={() => setQuestionIndex(index => index - 1)}>Câu trước</button>
          {questionIndex < total - 1 && <button type="button" className="secondary-button quiz-early-submit" disabled={busy} onClick={onSubmit}>Nộp Quiz</button>}
          {questionIndex < total - 1 ? <button type="button" className="primary-button" disabled={busy} onClick={() => setQuestionIndex(index => index + 1)}>Câu tiếp<Play size={15}/></button> : <button type="button" className="primary-button" disabled={busy || !total} onClick={onSubmit}><CheckCircle2 size={16}/>{busy ? "Đang nộp..." : "Nộp Quiz"}</button>}
        </footer>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>}
    </div>
  </div>;
}
