import { Award, CheckCircle2, Play, RotateCcw } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { formatQuizPercent } from "../lib/quiz";
import FormulaText from "./FormulaText";

type Question = { id: string; prompt: string; options: readonly string[]; topic?: string | null };
type Feedback = { correctIndex: number; explanation?: string };

type QuizRunnerProps = {
  questions: readonly Question[];
  answers: ReadonlyArray<number | null>;
  index: number;
  freeNavigation: boolean;
  feedback?: Feedback;
  busy?: boolean;
  lockAnswer?: boolean;
  practiceHint?: boolean;
  examHint?: boolean;
  error?: string;
  onPick: (option: number) => void;
  onNavigate: (index: number) => void;
  onSubmit: () => void;
};

export default function QuizRunner({ questions, answers, index, freeNavigation, feedback, busy, lockAnswer, practiceHint, examHint, error, onPick, onNavigate, onSubmit }: QuizRunnerProps) {
  const { t } = useLanguage();
  const question = questions[index];
  if (!question) return null;
  const answer = answers[index];
  const last = index === questions.length - 1;
  const canAdvance = freeNavigation || !!feedback;
  const correct = answer === feedback?.correctIndex;
  return <div className="quiz-runner">
    <div className="quiz-progress" aria-hidden="true"><span style={{ width: `${(index + 1) / questions.length * 100}%` }}/></div>
    {freeNavigation && <div className="quiz-question-nav" aria-label={t("quizQuestionNavigator")}>
      {questions.map((item, position) => <button type="button" key={item.id}
        className={[position === index ? "current" : "", answers[position] !== null ? "answered" : ""].filter(Boolean).join(" ")}
        aria-current={position === index ? "step" : undefined} aria-label={t("questionNumber", { count: position + 1 })}
        disabled={lockAnswer} onClick={() => onNavigate(position)}>{position + 1}</button>)}
    </div>}
    {practiceHint && <small className="quiz-practice-hint">{t("quizPracticeHint")}</small>}
    <div className="activity-content quiz-question-scroll" tabIndex={0} aria-label={t("questionNumber", { count: index + 1 })} key={question.id}>
      <article className="quiz-question-card">
        <span className="quiz-question-kicker">{t("questionNumber", { count: index + 1 })}</span>
        <h2><FormulaText text={question.prompt}/></h2>
        {question.topic && <small className="quiz-topic">{question.topic}</small>}
        <div className="quiz-options">{question.options.map((option, position) => {
          const selected = answer === position;
          const classes = [selected ? "selected" : "", feedback?.correctIndex === position ? "correct" : "",
            selected && feedback && !correct ? "wrong" : ""].filter(Boolean).join(" ");
          return <button type="button" key={position} aria-pressed={selected} className={classes}
            disabled={lockAnswer || !!feedback} onClick={() => onPick(position)}>
            <span className="quiz-option-label">{String.fromCharCode(65 + position)}</span>
            <span className="quiz-option-content"><FormulaText text={option}/></span>
          </button>;
        })}</div>
        {feedback && <div className={`quiz-feedback ${correct ? "correct" : "wrong"}`} role="status">
          <strong>{t(correct ? "quizAnswerCorrect" : "quizAnswerIncorrect")}</strong>
          {feedback.explanation && (feedback.explanation.length > 160 || feedback.explanation.includes("\n")
            ? <details className="quiz-explanation"><summary>{t("explanation")}</summary><p><FormulaText text={feedback.explanation}/></p></details>
            : <p><FormulaText text={feedback.explanation}/></p>)}
        </div>}
        {examHint && answer === null && <small className="quiz-exam-hint">{t("quizExamHint")}</small>}
      </article>
    </div>
    <footer className="quiz-runner-actions">
      <button type="button" className="secondary-button" disabled={lockAnswer || index === 0} onClick={() => onNavigate(index - 1)}>{t("previousQuestion")}</button>
      {freeNavigation && !last && <button type="button" className="secondary-button quiz-early-submit" disabled={busy} onClick={onSubmit}>{t("submitQuiz")}</button>}
      {last ? <button type="button" className="primary-button" disabled={!canAdvance || busy} onClick={onSubmit}>
        <CheckCircle2 size={16}/>{t(busy ? "saving" : "submitQuiz")}
      </button> : <button type="button" className="primary-button" disabled={lockAnswer || !canAdvance} onClick={() => onNavigate(index + 1)}>{t("nextQuestion")}<Play size={15}/></button>}
    </footer>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

export function QuizResult({ questions, score, answers, onRetake, total = questions.length, busy }: {
  questions: ReadonlyArray<Question & Feedback>;
  score: number;
  total?: number;
  answers: ReadonlyArray<number | null>;
  onRetake: () => void;
  busy?: boolean;
}) {
  const { t } = useLanguage();
  return <div className="quiz-result">
    <div className="quiz-result-badge" role="status"><Award size={34}/><strong>{formatQuizPercent(score, total)}%</strong><span>{score} / {total}</span></div>
    <h2>{t("quizComplete")}</h2><p>{t("quizReviewHint")}</p>
    <div className="quiz-answer-review">{questions.map((question, index) => {
      const answer = answers[index];
      const correct = answer === question.correctIndex;
      return <article key={question.id}>
        <div><strong>#{index + 1}</strong><span className={correct ? "correct" : "incorrect"}><FormulaText text={question.prompt}/></span></div>
        <p><b>{t("yourAnswer")}:</b> {answer == null ? t("notAnswered") : <FormulaText text={question.options[answer] ?? "—"}/>}</p>
        {!correct && <p><b>{t("correctAnswer")}:</b> <FormulaText text={question.options[question.correctIndex] ?? "—"}/></p>}
        {question.explanation && <p><b>{t("explanation")}:</b> <FormulaText text={question.explanation}/></p>}
      </article>;
    })}</div>
    <button type="button" className="primary-button" disabled={busy} onClick={onRetake}><RotateCcw size={16}/>{t("retakeQuiz")}</button>
  </div>;
}
