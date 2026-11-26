import { useStudyFolders } from "../hooks/useStudyFolders";
import { StudyFolderControls, StudyFolderMoveButton } from "./StudyFolders";
import { WorkspaceShareButton } from "./WorkspaceShareDialog";
import { useLearningActive, useLearningTool } from "../lib/learningNavigation";
import { useEffect, useRef, useState } from "react";
import { ClipboardList, FileUp, Play, Trash2, X } from "lucide-react";
import type { AccountPlan } from "../lib/account";
import { useLanguage } from "../lib/i18n";
import { allowsQuizNavigation, prepareQuizQuestions, scoreQuiz, type QuizMode, type QuizOrder, type QuizTest } from "../lib/quiz";
import { formatTimerTime } from "../lib/timer";
import type { QuizStore } from "../hooks/useQuizzes";
import { ActivityViewport, BackButton, PageNavigation, useActivityFocus, useListScrollReturn } from "./PageNavigation";
import QuizRunner, { QuizResult } from "./QuizRunner";
import QuizCreateDialog from "./QuizCreateDialog";

type AnswerReveal = "instant" | "submit";

function modeLabel(t: ReturnType<typeof useLanguage>["t"], mode: QuizMode) {
  return mode === "learn" ? t("quizModeLearn") : mode === "practice" ? t("quizModePractice") : mode === "exam" ? t("quizModeExam") : t("quizModeReview");
}

export default function QuizPage({ owner, store, accountPlan, onQuizCompleted }: { owner: string | null; store: QuizStore; accountPlan?: AccountPlan; onQuizCompleted?: (quizId: string) => Promise<void> }) {
  const { t, language } = useLanguage();
  const folderItems = store.quizzes.map(quiz => ({ id: quiz.id, title: quiz.title, cloud: quiz.source === "cloud" }));
  const studyFolders = useStudyFolders(owner, "quiz", folderItems.filter(item => item.cloud).map(item => item.id));
  const navigation = useLearningTool();
  const listScroll = useListScrollReturn(), learningActive = useLearningActive();
  const [sessionVisible, setSessionVisible] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [studioSession, setStudioSession] = useState(0);
  const [quizFilter, setQuizFilter] = useState<"all" | "saved">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeQuiz, setActiveQuiz] = useState<QuizTest | null>(null);
  const [activeMode, setActiveMode] = useState<QuizMode | null>(null);
  const [activeOrder, setActiveOrder] = useState<QuizOrder>("sequential");
  const [activeReveal, setActiveReveal] = useState<AnswerReveal>("instant");
  const [launchMode, setLaunchMode] = useState<QuizMode>("learn");
  const [launchOrder, setLaunchOrder] = useState<QuizOrder>("sequential");
  const [launchReveal, setLaunchReveal] = useState<AnswerReveal>("instant");
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [examSeconds, setExamSeconds] = useState(0);
  const [examEndsAt, setExamEndsAt] = useState(0);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const activityFocus = useActivityFocus(learningActive && sessionVisible);
  const answersRef = useRef<Array<number | null>>([]);
  const examSubmittingRef = useRef(false);
  const submitQuizRef = useRef<() => Promise<void>>(async () => undefined);
  const startQuiz = (quiz: QuizTest, requestedMode: QuizMode = launchMode, requestedOrder: QuizOrder = launchOrder) => {
    const questions = prepareQuizQuestions(quiz, requestedMode, requestedOrder, store.attempts);
    if (!questions.length) { setError(""); store.setError(t("quizNoReviewQuestions")); return; }
    if (!sessionVisible) listScroll.remember();
    const session = { ...quiz, questions };
    const initialAnswers = Array.from({ length: questions.length }, () => null as number | null);
    const examDuration = requestedMode === "exam" ? Math.max(60, questions.length * 60) : 0;
    if (navigation) navigation.open("quiz-session", () => setSessionVisible(true), () => { setSessionVisible(false); listScroll.restore(); }); else setSessionVisible(true);
    setActiveQuiz(session); setActiveMode(requestedMode); setActiveOrder(requestedOrder); setActiveReveal(launchReveal); setAnswers(initialAnswers); answersRef.current = initialAnswers; setQuestionIndex(0); setAnswerRevealed(false); setStartedAt(Date.now()); setExamSeconds(examDuration); setExamEndsAt(examDuration ? Date.now() + examDuration * 1_000 : 0); examSubmittingRef.current = false; setResult(null); setError(""); store.setError("");
  };
  const leaveQuiz = () => { listScroll.restore(); if (navigation) { setSessionVisible(false); navigation.back(); return; } setSessionVisible(false); examSubmittingRef.current = false; setActiveQuiz(null); setActiveMode(null); setExamEndsAt(0); setResult(null); setError(""); };
  const selectAnswer = (optionIndex: number) => {
    if (!activeQuiz || activeMode === null || (activeReveal === "instant" && answerRevealed)) return;
    setAnswers(current => { const next = current.map((answer, index) => index === questionIndex ? optionIndex : answer); answersRef.current = next; return next; });
    if (activeReveal === "instant") setAnswerRevealed(true);
  };
  const goToQuestion = (nextIndex: number) => { if (!activeQuiz) return; const next = Math.max(0, Math.min(activeQuiz.questions.length - 1, nextIndex)); setQuestionIndex(next); setAnswerRevealed(activeReveal === "instant" && answersRef.current[next] !== null); };
  const submitQuiz = async () => {
    if (!activeQuiz || !activeMode || result || busy || (activeMode === "exam" && examSubmittingRef.current)) return;
    if (activeMode === "exam") examSubmittingRef.current = true;
    const submittedAnswers = answersRef.current;
    const score = scoreQuiz(activeQuiz, submittedAnswers);
    setBusy(true); setError("");
    try {
      await store.saveAttempt({ id: crypto.randomUUID(), quizId: activeQuiz.id, score, total: activeQuiz.questions.length, answers: submittedAnswers, mode: activeMode, questionIds: activeQuiz.questions.map(question => question.id), durationSeconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)), completedAt: new Date().toISOString() });
      setResult({ score, total: activeQuiz.questions.length });
      if (onQuizCompleted) await onQuizCompleted(activeQuiz.id);
    } catch (err) { if (activeMode === "exam") examSubmittingRef.current = false; setError(err instanceof Error ? err.message : t("quizSaveError")); }
    finally { setBusy(false); }
  };

  submitQuizRef.current = submitQuiz;

  useEffect(() => {
    if (!activeQuiz || activeMode !== "exam" || result || !examEndsAt) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((examEndsAt - Date.now()) / 1_000));
      setExamSeconds(remaining);
      if (remaining === 0) void submitQuizRef.current();
    };
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [activeMode, activeQuiz?.id, examEndsAt, result]);

  if (activeQuiz && sessionVisible) {
    const question = activeQuiz.questions[questionIndex];
    const currentMode = activeMode ?? "learn";
    const immediateFeedback = activeReveal === "instant";
    const freeNavigation = activeReveal === "submit" || allowsQuizNavigation(currentMode);
    const feedbackVisible = immediateFeedback && answerRevealed;
    return <ActivityViewport ref={activityFocus} className="activity-screen activity-quiz" aria-label={activeQuiz.title}>
      <PageNavigation quickActions back={<BackButton onClick={leaveQuiz}>{language === "vi" ? "Danh sách Quiz" : "Quiz list"}</BackButton>} title={activeQuiz.title}
        context={<><span>{modeLabel(t, currentMode)} · {t(activeReveal === "instant" ? "quizRevealInstant" : "quizRevealSubmit")}</span><b>{questionIndex + 1} / {activeQuiz.questions.length}</b>{currentMode === "exam" && !result && <strong className="quiz-exam-clock">{formatTimerTime(examSeconds, true)}</strong>}</>}
        actions={<WorkspaceShareButton item={{kind:"quiz",id:activeQuiz.id,title:activeQuiz.title}} friends={{plan:accountPlan}} available={!!owner && activeQuiz.source === "cloud"}/>}/>
      {result ? <div className="activity-content">
        <QuizResult questions={activeQuiz.questions} score={result.score} answers={answers} onRetake={() => startQuiz(activeQuiz, currentMode, activeOrder)}/>
      </div> : <QuizRunner questions={activeQuiz.questions} answers={answers} index={questionIndex} freeNavigation={freeNavigation}
        feedback={feedbackVisible ? question : undefined} busy={busy} practiceHint={activeReveal === "submit" && currentMode === "practice"}
        examHint={activeReveal === "submit" && currentMode === "exam"} error={error}
        onPick={selectAnswer} onNavigate={goToQuestion} onSubmit={() => void submitQuiz()}/>}
    </ActivityViewport>;
  }

  const visibleQuizzes = store.quizzes.filter(quiz => studyFolders.itemFolder(quiz.id) === studyFolders.folderId && (quizFilter === "all" || !!quiz.savedFrom));
  const savedQuizCount = store.quizzes.filter(quiz => !!quiz.savedFrom).length;

  return <section className="quiz-page"><header className="quiz-heading"><div><span className="eyebrow">QUIZ STUDIO</span><h2>{t("quiz")}</h2><p>{t("quizHint")}</p></div><button className="primary-button" onClick={() => setDialog(true)}><FileUp size={17}/>{t("createQuiz")}</button></header><StudyFolderControls store={studyFolders} items={folderItems} area="quiz" owner={owner} plan={accountPlan}/><div className="learning-copy-filter" aria-label="Lọc Quiz"><button aria-pressed={quizFilter === "all"} onClick={() => setQuizFilter("all")}>Tất cả <small>{store.quizzes.length}</small></button><button aria-pressed={quizFilter === "saved"} onClick={() => setQuizFilter("saved")}>Đã lưu <small>{savedQuizCount}</small></button></div>{store.error && <div className="flashcards-error" role="alert"><span>{store.error}</span><button className="icon-button" onClick={() => store.setError("")}><X size={15}/></button></div>}{store.loading ? <p>{t("loading")}</p> : !store.quizzes.length ? <div className="quiz-empty"><ClipboardList size={44}/><h3>{t("noQuizzes")}</h3><p>{t("noQuizzesHint")}</p></div> : <><section className="quiz-mode-panel"><div><strong>{t("quizHowToStudy")}</strong><small>{launchMode === "review" ? t("quizReviewModeHint") : t("quizModesHint")}</small></div><label>{t("quizMode")}<select value={launchMode} onChange={event => { const next = event.target.value as QuizMode; setLaunchMode(next); setLaunchReveal(next === "learn" || next === "review" ? "instant" : "submit"); }}><option value="learn">{t("quizModeLearn")}</option><option value="practice">{t("quizModePractice")}</option><option value="exam">{t("quizModeExam")}</option><option value="review">{t("quizModeReview")}</option></select></label><label>{t("quizOrder")}<select value={launchOrder} onChange={event => setLaunchOrder(event.target.value as QuizOrder)}><option value="sequential">{t("quizOrderSequential")}</option><option value="random">{t("quizOrderRandom")}</option></select></label><label>{t("quizRevealWhen")}<select value={launchReveal} onChange={event => setLaunchReveal(event.target.value as AnswerReveal)}><option value="instant">{t("quizRevealInstant")}</option><option value="submit">{t("quizRevealSubmit")}</option></select></label></section><div className="quiz-list">{visibleQuizzes.map(quiz => { const attempts = store.attempts.filter(attempt => attempt.quizId === quiz.id); const best = attempts.reduce((value, attempt) => Math.max(value, attempt.total ? Math.round(attempt.score / attempt.total * 100) : 0), 0); return <article className="quiz-test-card" key={quiz.id}><div className="quiz-card-icon"><ClipboardList size={22}/></div><div className="quiz-card-copy"><h3>{quiz.title}</h3><p>{quiz.description || t("quizQuickHint")}</p><small>{quiz.questions.length} {t("quizQuestions").toLocaleLowerCase()} · {attempts.length} {t("quizAttempts").toLocaleLowerCase()}{best ? ` · ${t("bestScore")}: ${best}%` : ""}</small>{quiz.savedFrom && <small className="learning-copy-provenance">Bản lưu từ {quiz.savedFrom.ownerName} · {quiz.savedFrom.title}</small>}</div><div className="quiz-card-actions"><StudyFolderMoveButton store={studyFolders} item={quiz}/><WorkspaceShareButton item={{kind:"quiz",id:quiz.id,title:quiz.title}} friends={{plan:accountPlan}} available={!!owner&&quiz.source==="cloud"} compact/><button className="primary-button" onClick={() => startQuiz(quiz)}><Play size={16}/>{launchMode === "review" ? t("reviewQuiz") : t("startQuiz")}</button><button className="icon-button danger" aria-label={`${t("deleteQuiz")}: ${quiz.title}`} onClick={() => void store.removeQuiz(quiz)}><Trash2 size={16}/></button></div></article>; })}{!visibleQuizzes.length && <p className="learning-copy-empty">{quizFilter === "saved" ? "Chưa có Quiz nào được lưu từ mục chia sẻ." : t("noQuizzesHint")}</p>}</div></>}<QuizCreateDialog key={`${owner ?? "guest"}:${studioSession}`} open={dialog} owner={owner} store={store} accountPlan={accountPlan} onClose={() => setDialog(false)} onCreated={id => {
    setDialog(false);
    setStudioSession(value => value + 1);
    if (id && studyFolders.folderId) void studyFolders.moveItem(id, studyFolders.folderId).catch(() =>
      store.setError(language === "vi" ? "Quiz đã lưu ngoài thư mục. Bạn có thể chuyển Quiz sau." : "Quiz saved at the root. You can move it to a folder."));
  }}/></section>;
}

