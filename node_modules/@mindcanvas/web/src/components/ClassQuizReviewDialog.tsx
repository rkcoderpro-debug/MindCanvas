import { useEffect, useRef } from "react";
import { Award, CheckCircle2, CircleHelp, X, XCircle } from "lucide-react";
import { formatQuizPercent } from "../lib/quiz";
import type { OwnClassQuizReview } from "../lib/classrooms";
import FormulaText from "./FormulaText";

export default function ClassQuizReviewDialog({ title, review, onClose }: { title: string; review: OwnClassQuizReview; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const correct = review.questions.filter(question => question.correct).length;
  const skipped = review.questions.filter(question => question.answer === null).length;
  const wrong = review.questions.length - correct - skipped;
  const percent = formatQuizPercent(review.score, review.total);
  const rank = percent >= 90 ? "Xuất sắc" : percent >= 75 ? "Tốt" : percent >= 50 ? "Đạt" : "Cần luyện tập thêm";

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, []);

  return <div className="class-review-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="class-review-dialog" role="dialog" aria-modal="true" aria-labelledby="class-review-title" onKeyDown={event => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled])');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
      <header><div><span className="eyebrow">KẾT QUẢ LƯỢT LÀM</span><h2 id="class-review-title">{title}</h2><small>{new Date(review.completed_at).toLocaleString("vi-VN")}</small></div><button ref={closeRef} type="button" className="icon-button" aria-label="Đóng kết quả" onClick={onClose}><X size={20}/></button></header>
      <div className="class-review-hero"><Award size={32}/><strong>{percent}%</strong><span>{review.score}/{review.total} câu đúng · {rank}</span><small>Nhận xét tự động theo kết quả Quiz; điểm bài tập do giáo viên chấm riêng.</small></div>
      <div className="class-review-stats"><div><CheckCircle2 size={19}/><strong>{correct}</strong><span>Đúng</span></div><div><XCircle size={19}/><strong>{wrong}</strong><span>Sai</span></div><div><CircleHelp size={19}/><strong>{skipped}</strong><span>Bỏ trống</span></div></div>
      <details className="class-review-details"><summary>Xem lại từng câu</summary><div className="quiz-answer-review">{review.questions.map(question => <article key={question.number}><div><strong>#{question.number}</strong><span className={question.correct ? "correct" : "incorrect"}><FormulaText text={question.prompt}/></span></div><p><b>Bạn chọn:</b> {question.answer === null ? "Chưa trả lời" : <FormulaText text={question.options[question.answer] ?? ""}/>}</p>{!question.correct && <p><b>Đáp án đúng:</b> <FormulaText text={question.options[question.correct_index] ?? ""}/></p>}{question.explanation && <p><b>Giải thích:</b> <FormulaText text={question.explanation}/></p>}</article>)}</div></details>
      <footer><button type="button" className="primary-button" onClick={onClose}>Quay lại bài tập</button></footer>
    </div>
  </div>;
}
