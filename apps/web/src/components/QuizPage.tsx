import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Award, Check, CheckCircle2, ClipboardList, FileUp, Play, RotateCcw, Trash2, Upload, X } from "lucide-react";
import type { AccountPlan } from "../lib/account";
import { useLanguage } from "../lib/i18n";
import { consumeAiManualUsage, generateQuizFromFile, type GeneratedQuizFromFile } from "../lib/api";
import { aiErrorMessage } from "../lib/aiErrors";
import { MAX_FILE_BYTES } from "../lib/board";
import { allowsQuizNavigation, buildQuizPrompt, formatQuizPercent, parseManualQuiz, prepareQuizQuestions, revealsQuizAnswer, QuizValidationError, scoreQuiz, type QuizMode, type QuizOrder, type QuizQuestion, type QuizTest } from "../lib/quiz";
import { formatTimerTime } from "../lib/timer";
import type { QuizStore } from "../hooks/useQuizzes";
import { AiModeSwitch, type AiMode } from "./AiModeSwitch";
import AiQualityControls from "./AiQualityControls";
import Dialog from "./Dialog";
import { writeClipboardText } from "../lib/aiSource";
import { saveDocumentToStorage } from "../lib/supabase";
import { DEFAULT_AI_OPTIONS, type AiGenerationOptions } from "../lib/aiOptions";
import ManualAiProviderLinks from "./ManualAiProviderLinks";
import { LearningShareButton } from "./LearningShareDialog";

type QuizDraft = { title: string; description: string; questions: QuizQuestion[]; provider: string; model: string; sourceDocumentId?: string | null };

function draftFrom(value: { title: string; description: string; questions: Array<{ id?: string; prompt: string; options: [string, string, string, string]; correctIndex: 0 | 1 | 2 | 3; explanation: string; sourcePage?: number | null; topic?: string }>; provider: string; model: string; sourceDocumentId?: string | null }) {
  return { title: value.title, description: value.description, questions: value.questions.map((question, index) => ({ ...question, id: question.id || `question-${index + 1}-${crypto.randomUUID()}`, sourcePage: question.sourcePage ?? null })), provider: value.provider, model: value.model, sourceDocumentId: value.sourceDocumentId } satisfies QuizDraft;
}

function modeLabel(t: ReturnType<typeof useLanguage>["t"], mode: QuizMode) {
  return mode === "learn" ? t("quizModeLearn") : mode === "practice" ? t("quizModePractice") : mode === "exam" ? t("quizModeExam") : t("quizModeReview");
}

export default function QuizPage({ owner, store, accountPlan, onQuizCompleted }: { owner: string | null; store: QuizStore; accountPlan?: AccountPlan; onQuizCompleted?: (quizId: string) => Promise<void> }) {
  const { t, language } = useLanguage();
  const [dialog, setDialog] = useState(false);
  const [mode, setMode] = useState<AiMode>(owner ? "auto" : "manual");
  const [file, setFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState("");
  const [manualJson, setManualJson] = useState("");
  const [maxQuestions, setMaxQuestions] = useState(10);
  const [aiOptions, setAiOptions] = useState<AiGenerationOptions>(DEFAULT_AI_OPTIONS);
  const [manualUsageConsumed, setManualUsageConsumed] = useState(false);
  const [manualCopied, setManualCopied] = useState(false);
  const [draft, setDraft] = useState<QuizDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeQuiz, setActiveQuiz] = useState<QuizTest | null>(null);
  const [activeMode, setActiveMode] = useState<QuizMode | null>(null);
  const [activeOrder, setActiveOrder] = useState<QuizOrder>("sequential");
  const [launchMode, setLaunchMode] = useState<QuizMode>("learn");
  const [launchOrder, setLaunchOrder] = useState<QuizOrder>("sequential");
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [examSeconds, setExamSeconds] = useState(0);
  const [examEndsAt, setExamEndsAt] = useState(0);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const answersRef = useRef<Array<number | null>>([]);
  const examSubmittingRef = useRef(false);
  const submitQuizRef = useRef<() => Promise<void>>(async () => undefined);
  const maxAllowedQuestions = Math.min(100, Math.max(3, accountPlan?.maxCards ?? 50));
  const manualPrompt = useMemo(() => buildQuizPrompt({ text: manualText || undefined, fileName: file?.name, maxQuestions, language, options: aiOptions }), [aiOptions, file?.name, language, manualText, maxQuestions]);

  useEffect(() => () => controller.current?.abort(), []);

  const resetDialog = () => { controller.current?.abort(); setDialog(false); setDraft(null); setError(""); setManualJson(""); setManualText(""); setFile(null); setManualCopied(false); setManualUsageConsumed(false); setAiOptions(DEFAULT_AI_OPTIONS); };
  const openDialog = () => { setMode(owner ? "auto" : "manual"); setMaxQuestions(Math.min(10, maxAllowedQuestions)); setError(""); setDraft(null); setManualJson(""); setManualText(""); setFile(null); setManualUsageConsumed(false); setAiOptions(DEFAULT_AI_OPTIONS); setDialog(true); };
  const switchMode = (next: AiMode) => { setMode(next); setDraft(null); setError(""); setManualJson(""); setManualUsageConsumed(false); };
  const copyPrompt = async () => { try { await writeClipboardText(manualPrompt); setManualCopied(true); window.setTimeout(() => setManualCopied(false), 2000); } catch { setError(t("clipboardWriteError")); } };

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) { setError(t("quizFileRequired")); return; }
    if (file.size > MAX_FILE_BYTES) { setError(t("fileTooLarge")); return; }
    if (!owner) { setError(t("loginRequired")); return; }
    setBusy(true); setError("");
    const request = new AbortController(); controller.current = request;
    try {
      const generated = await generateQuizFromFile(file, maxQuestions, request.signal, aiOptions);
      if (generated.provider === "demo" || !generated.questions?.length) throw new Error(t("quizGenerateError"));
      await saveDocumentToStorage(file, generated.source.id, generated.source.text, generated.source.pageCount);
      setDraft(draftFrom({ ...generated, provider: generated.provider, model: generated.model, sourceDocumentId: (generated as GeneratedQuizFromFile).sourceDocumentId }));
    } catch (err) { if (!request.signal.aborted) setError(aiErrorMessage(err, t, "quizGenerateError")); }
    finally { if (!request.signal.aborted) setBusy(false); }
  };

  const validateManual = async () => {
    if (!owner) { setError(t("manualRequiresLogin")); return; }
    setBusy(true); setError("");
    try {
      const parsed = parseManualQuiz(manualJson, maxQuestions);
      if (!manualUsageConsumed) { await consumeAiManualUsage(); setManualUsageConsumed(true); }
      setDraft(draftFrom({ ...parsed, provider: "manual", model: "Manual AI" }));
    } catch (err) {
      setError(err instanceof QuizValidationError ? t("quizInvalidResult") : aiErrorMessage(err, t, "aiManualQuotaError"));
    } finally { setBusy(false); }
  };

  const updateQuestion = (index: number, patch: Partial<QuizQuestion>) => setDraft(current => current ? { ...current, questions: current.questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question) } : current);
  const updateOption = (index: number, optionIndex: number, value: string) => setDraft(current => current ? { ...current, questions: current.questions.map((question, questionIndex) => { if (questionIndex !== index) return question; const options = [...question.options] as [string, string, string, string]; options[optionIndex] = value; return { ...question, options }; }) } : current);
  const applyDraft = async () => {
    if (!draft) return;
    setBusy(true); setError("");
    try { await store.createQuiz({ title: draft.title.trim(), description: draft.description.trim(), questions: draft.questions, sourceDocumentId: draft.sourceDocumentId ?? null }); resetDialog(); }
    catch (err) { setError(err instanceof Error ? err.message : t("quizSaveError")); }
    finally { setBusy(false); }
  };

  const startQuiz = (quiz: QuizTest, requestedMode: QuizMode = launchMode, requestedOrder: QuizOrder = launchOrder) => {
    const questions = prepareQuizQuestions(quiz, requestedMode, requestedOrder, store.attempts);
    if (!questions.length) { setError(""); store.setError(t("quizNoReviewQuestions")); return; }
    const session = { ...quiz, questions };
    const initialAnswers = Array.from({ length: questions.length }, () => null as number | null);
    const examDuration = requestedMode === "exam" ? Math.max(60, questions.length * 60) : 0;
    setActiveQuiz(session); setActiveMode(requestedMode); setActiveOrder(requestedOrder); setAnswers(initialAnswers); answersRef.current = initialAnswers; setQuestionIndex(0); setAnswerRevealed(false); setStartedAt(Date.now()); setExamSeconds(examDuration); setExamEndsAt(examDuration ? Date.now() + examDuration * 1_000 : 0); examSubmittingRef.current = false; setResult(null); setError(""); store.setError("");
  };
  const leaveQuiz = () => { examSubmittingRef.current = false; setActiveQuiz(null); setActiveMode(null); setExamEndsAt(0); setResult(null); setError(""); };
  const selectAnswer = (optionIndex: number) => {
    if (!activeQuiz || activeMode === null || (revealsQuizAnswer(activeMode) && answerRevealed)) return;
    setAnswers(current => { const next = current.map((answer, index) => index === questionIndex ? optionIndex : answer); answersRef.current = next; return next; });
    if (revealsQuizAnswer(activeMode)) setAnswerRevealed(true);
  };
  const goToQuestion = (nextIndex: number) => { if (!activeQuiz) return; const next = Math.max(0, Math.min(activeQuiz.questions.length - 1, nextIndex)); setQuestionIndex(next); setAnswerRevealed(!!activeMode && revealsQuizAnswer(activeMode) && answersRef.current[next] !== null); };
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

  if (activeQuiz) {
    const question = activeQuiz.questions[questionIndex];
    const currentAnswer = answers[questionIndex];
    const currentMode = activeMode ?? "learn";
    const immediateFeedback = revealsQuizAnswer(currentMode);
    const freeNavigation = allowsQuizNavigation(currentMode);
    const feedbackVisible = immediateFeedback && answerRevealed;
    return <section className="quiz-page">
      <div className="quiz-runner-header"><LearningShareButton kind="quiz" id={activeQuiz.id} title={activeQuiz.title} plan={accountPlan} available={!!owner && activeQuiz.source === "cloud"}/><button className="secondary-button" onClick={leaveQuiz}><ArrowLeft size={16}/>{t("backToQuizzes")}</button><span>{activeQuiz.title}</span><small className="quiz-mode-badge">{modeLabel(t, currentMode)}</small>{currentMode === "exam" && !result && <strong className="quiz-exam-clock">{formatTimerTime(examSeconds, true)}</strong>}<small>{questionIndex + 1} / {activeQuiz.questions.length}</small></div>
      {result ? <QuizResult quiz={activeQuiz} score={result.score} answers={answers} onRetake={() => startQuiz(activeQuiz, currentMode, activeOrder)} t={t}/> : <div className="quiz-runner">
        <div className="quiz-progress"><span style={{ width: `${((questionIndex + 1) / activeQuiz.questions.length) * 100}%` }}/></div>
        {freeNavigation && <div className="quiz-question-nav" aria-label={t("quizQuestionNavigator")}>{activeQuiz.questions.map((item, index) => <button type="button" key={item.id} className={[index === questionIndex ? "current" : "", answers[index] !== null ? "answered" : ""].filter(Boolean).join(" ")} aria-current={index === questionIndex ? "step" : undefined} aria-label={t("questionNumber", { count: index + 1 })} onClick={() => goToQuestion(index)}>{index + 1}</button>)}</div>}
        {freeNavigation && currentMode === "practice" && <small className="quiz-practice-hint">{t("quizPracticeHint")}</small>}
        <article className="quiz-question-card"><span className="quiz-question-kicker">{t("questionNumber", { count: questionIndex + 1 })}</span><h2>{question.prompt}</h2>{question.topic && <small className="quiz-topic">{question.topic}</small>}<div className="quiz-options">{question.options.map((option, optionIndex) => { const selected = currentAnswer === optionIndex; const correct = optionIndex === question.correctIndex; const className = [selected ? "selected" : "", feedbackVisible && correct ? "correct" : "", feedbackVisible && selected && !correct ? "wrong" : ""].filter(Boolean).join(" "); return <button key={`${question.id}-${optionIndex}`} className={className} disabled={feedbackVisible} onClick={() => selectAnswer(optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>; })}</div>{feedbackVisible && <div className={`quiz-feedback ${currentAnswer === question.correctIndex ? "correct" : "wrong"}`}><strong>{currentAnswer === question.correctIndex ? t("quizAnswerCorrect") : t("quizAnswerIncorrect")}</strong>{question.explanation && <p>{question.explanation}</p>}</div>}{currentMode === "exam" && currentAnswer === null && <small className="quiz-exam-hint">{t("quizExamHint")}</small>}</article>
        <footer className="quiz-runner-actions"><button className="secondary-button" disabled={questionIndex === 0} onClick={() => goToQuestion(questionIndex - 1)}>{t("previousQuestion")}</button>{freeNavigation && questionIndex < activeQuiz.questions.length - 1 && <button className="secondary-button quiz-early-submit" disabled={busy} onClick={() => void submitQuiz()}>{t("submitQuiz")}</button>}{questionIndex < activeQuiz.questions.length - 1 ? <button className="primary-button" disabled={!freeNavigation && !feedbackVisible} onClick={() => goToQuestion(questionIndex + 1)}>{t("nextQuestion")}<Play size={15}/></button> : <button className="primary-button" disabled={(!freeNavigation && !feedbackVisible) || busy} onClick={() => void submitQuiz()}><CheckCircle2 size={16}/>{busy ? t("saving") : t("submitQuiz")}</button>}</footer>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>}
    </section>;
  }

  return <section className="quiz-page"><header className="quiz-heading"><div><span className="eyebrow">QUIZ STUDIO</span><h2>{t("quiz")}</h2><p>{t("quizHint")}</p></div><button className="primary-button" onClick={openDialog}><FileUp size={17}/>{t("createQuiz")}</button></header>{store.error && <div className="flashcards-error" role="alert"><span>{store.error}</span><button className="icon-button" onClick={() => store.setError("")}><X size={15}/></button></div>}{store.loading ? <p>{t("loading")}</p> : !store.quizzes.length ? <div className="quiz-empty"><ClipboardList size={44}/><h3>{t("noQuizzes")}</h3><p>{t("noQuizzesHint")}</p><button className="secondary-button" onClick={openDialog}><Upload size={16}/>{t("createQuiz")}</button></div> : <><section className="quiz-mode-panel"><div><strong>{t("quizHowToStudy")}</strong><small>{launchMode === "review" ? t("quizReviewModeHint") : t("quizModesHint")}</small></div><label>{t("quizMode")}<select value={launchMode} onChange={event => setLaunchMode(event.target.value as QuizMode)}><option value="learn">{t("quizModeLearn")}</option><option value="practice">{t("quizModePractice")}</option><option value="exam">{t("quizModeExam")}</option><option value="review">{t("quizModeReview")}</option></select></label><label>{t("quizOrder")}<select value={launchOrder} onChange={event => setLaunchOrder(event.target.value as QuizOrder)}><option value="sequential">{t("quizOrderSequential")}</option><option value="random">{t("quizOrderRandom")}</option></select></label></section><div className="quiz-list">{store.quizzes.map(quiz => { const attempts = store.attempts.filter(attempt => attempt.quizId === quiz.id); const best = attempts.reduce((value, attempt) => Math.max(value, attempt.total ? Math.round(attempt.score / attempt.total * 100) : 0), 0); return <article className="quiz-test-card" key={quiz.id}><div className="quiz-card-icon"><ClipboardList size={22}/></div><div className="quiz-card-copy"><h3>{quiz.title}</h3><p>{quiz.description || t("quizQuickHint")}</p><small>{quiz.questions.length} {t("quizQuestions").toLocaleLowerCase()} · {attempts.length} {t("quizAttempts").toLocaleLowerCase()}{best ? ` · ${t("bestScore")}: ${best}%` : ""}</small></div><div className="quiz-card-actions"><LearningShareButton kind="quiz" id={quiz.id} title={quiz.title} plan={accountPlan} available={!!owner && quiz.source === "cloud"}/><button className="primary-button" onClick={() => startQuiz(quiz)}><Play size={16}/>{launchMode === "review" ? t("reviewQuiz") : t("startQuiz")}</button><button className="icon-button danger" aria-label={`${t("deleteQuiz")}: ${quiz.title}`} onClick={() => void store.removeQuiz(quiz)}><Trash2 size={16}/></button></div></article>; })}</div></>}{dialog && <Dialog title={t("createQuiz")} onClose={resetDialog}><AiModeSwitch mode={mode} autoAvailable={!!owner} onChange={switchMode}/>{mode === "auto" ? <form className="quiz-create-form" onSubmit={event => void generate(event)}><p>{t("quizAutoHint")}</p><AiQualityControls options={aiOptions} onChange={setAiOptions}/><label className="upload-drop quiz-upload"><span><FileUp size={22}/>{t("quizChooseFile")}</span><input type="file" accept=".pdf,.docx,.pptx,.txt,.md,.csv,image/*" disabled={busy} onChange={event => { const next = event.target.files?.[0] ?? null; setFile(next); setError(next && next.size > MAX_FILE_BYTES ? t("fileTooLarge") : ""); }}/>{file && <small>{file.name}</small>}</label><label>{t("maxQuestions")}<input type="number" min="3" max={maxAllowedQuestions} value={maxQuestions} onChange={event => setMaxQuestions(Math.max(3, Math.min(maxAllowedQuestions, Number(event.target.value) || 3)))}/></label>{error && <p className="form-error" role="alert">{error}</p>}<footer className="actions"><button type="button" className="secondary-button" onClick={resetDialog}>{t("cancel")}</button><button className="primary-button" disabled={busy || !file}>{busy ? t("generating") : t("generateQuiz")}</button></footer></form> : !draft ? <div className="quiz-manual-form"><p className="ai-manual-note">{t("aiManualHint")} {t("quizManualHint")}</p><AiQualityControls options={aiOptions} onChange={setAiOptions}/><label>{t("quizSourceText")}<textarea rows={7} value={manualText} onChange={event => setManualText(event.target.value)} placeholder={t("quizSourcePlaceholder")}/></label><label className="upload-drop"><span><FileUp size={20}/>{t("quizManualFile")}</span><input type="file" accept=".pdf,.docx,.pptx,.txt,.md,.csv,image/*" onChange={event => setFile(event.target.files?.[0] ?? null)}/>{file && <small>{file.name}</small>}</label><label>{t("maxQuestions")}<input type="number" min="3" max={maxAllowedQuestions} value={maxQuestions} onChange={event => setMaxQuestions(Math.max(3, Math.min(maxAllowedQuestions, Number(event.target.value) || 3)))}/></label><label><span>{t("aiManualPrompt")}</span><textarea readOnly rows={8} value={manualPrompt}/></label><div className="ai-manual-actions"><button type="button" className="secondary-button" onClick={() => void copyPrompt()}><ClipboardList size={15}/>{manualCopied ? t("copiedPrompt") : t("copyPrompt")}</button><ManualAiProviderLinks onBlocked={() => setError(t("popupBlocked"))}/></div><label><span>{t("aiManualJsonLabel")}</span><textarea rows={8} value={manualJson} onChange={event => setManualJson(event.target.value)} placeholder={t("quizJsonPlaceholder")}/></label>{error && <p className="form-error" role="alert">{error}</p>}<footer className="actions"><button type="button" className="secondary-button" onClick={resetDialog}>{t("cancel")}</button><button type="button" className="primary-button" disabled={busy || !manualJson.trim()} onClick={() => void validateManual()}>{busy ? t("validating") : t("validateResult")}</button></footer></div> : <div className="quiz-preview-form"><div className="quiz-preview-heading"><div><span className="eyebrow">{draft.provider}</span><h3>{t("quizPreview")}</h3><small>{draft.model}</small></div><strong>{draft.questions.length} {t("quizQuestions").toLocaleLowerCase()}</strong></div><label>{t("quizTitle")}<input value={draft.title} onChange={event => setDraft(current => current ? { ...current, title: event.target.value } : current)}/></label><label>{t("quizDescription")}<textarea rows={2} value={draft.description} onChange={event => setDraft(current => current ? { ...current, description: event.target.value } : current)}/></label><div className="quiz-preview-list">{draft.questions.map((question, index) => <article className="quiz-preview-question" key={question.id}><div className="quiz-preview-question-header"><strong>#{index + 1}</strong><button className="icon-button danger" type="button" onClick={() => setDraft(current => current ? { ...current, questions: current.questions.filter((_, questionIndex) => questionIndex !== index) } : current)}><Trash2 size={14}/></button></div><label>{t("questionSide")}<textarea rows={2} value={question.prompt} onChange={event => updateQuestion(index, { prompt: event.target.value })}/></label><div className="quiz-option-editor">{question.options.map((option, optionIndex) => <label key={optionIndex}><span>{String.fromCharCode(65 + optionIndex)}</span><input value={option} onChange={event => updateOption(index, optionIndex, event.target.value)}/></label>)}</div><label>{t("correctAnswer")}<select value={question.correctIndex} onChange={event => updateQuestion(index, { correctIndex: Number(event.target.value) as 0 | 1 | 2 | 3 })}>{question.options.map((_, optionIndex) => <option value={optionIndex} key={optionIndex}>{String.fromCharCode(65 + optionIndex)}</option>)}</select></label><label>{t("explanation")}<textarea rows={2} value={question.explanation} onChange={event => updateQuestion(index, { explanation: event.target.value })}/></label></article>)}</div>{error && <p className="form-error" role="alert">{error}</p>}<footer className="actions"><button type="button" className="secondary-button" onClick={() => setDraft(null)}>{t("backToSource")}</button><button type="button" className="primary-button" disabled={busy || !draft.questions.length} onClick={() => void applyDraft()}><Check size={16}/>{busy ? t("saving") : t("saveQuiz")}</button></footer></div>}</Dialog>}</section>;
}

function QuizResult({ quiz, score, answers, onRetake, t }: { quiz: QuizTest; score: number; answers: Array<number | null>; onRetake: () => void; t: ReturnType<typeof useLanguage>["t"] }) {
  return <div className="quiz-result"><div className="quiz-result-badge"><Award size={34}/><strong>{formatQuizPercent(score, quiz.questions.length)}%</strong><span>{score} / {quiz.questions.length}</span></div><h2>{t("quizComplete")}</h2><p>{t("quizReviewHint")}</p><div className="quiz-answer-review">{quiz.questions.map((question, index) => { const answer = answers[index]; const correct = answer === question.correctIndex; return <article key={question.id}><div><strong>#{index + 1}</strong><span className={correct ? "correct" : "incorrect"}>{question.prompt}</span></div><p><b>{t("yourAnswer")}:</b> {answer === null || answer === undefined ? t("notAnswered") : question.options[answer]}</p>{!correct && <p><b>{t("correctAnswer")}:</b> {question.options[question.correctIndex]}</p>}{question.explanation && <p><b>{t("explanation")}:</b> {question.explanation}</p>}</article>; })}</div><button className="primary-button" onClick={onRetake}><RotateCcw size={16}/>{t("retakeQuiz")}</button></div>;
}
