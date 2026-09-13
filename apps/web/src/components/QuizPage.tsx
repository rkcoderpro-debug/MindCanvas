import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Award, Check, CheckCircle2, ClipboardList, FileUp, Play, RotateCcw, Trash2, Upload, X } from "lucide-react";
import type { AccountPlan } from "../lib/account";
import { useLanguage } from "../lib/i18n";
import { consumeAiManualUsage, generateQuizFromFile, type GeneratedQuizFromFile } from "../lib/api";
import { aiErrorMessage } from "../lib/aiErrors";
import { MAX_FILE_BYTES } from "../lib/board";
import { buildQuizPrompt, formatQuizPercent, parseManualQuiz, QuizValidationError, scoreQuiz, type QuizQuestion, type QuizTest } from "../lib/quiz";
import type { QuizStore } from "../hooks/useQuizzes";
import { AiModeSwitch, type AiMode } from "./AiModeSwitch";
import Dialog from "./Dialog";
import { GEMINI_WEB_URL } from "../lib/manualAi";
import { writeClipboardText } from "../lib/aiSource";
import { saveDocumentToStorage } from "../lib/supabase";

type QuizDraft = { title: string; description: string; questions: QuizQuestion[]; provider: string; model: string; sourceDocumentId?: string | null };

function draftFrom(value: { title: string; description: string; questions: Array<{ id?: string; prompt: string; options: [string, string, string, string]; correctIndex: 0 | 1 | 2 | 3; explanation: string; sourcePage?: number | null; topic?: string }>; provider: string; model: string; sourceDocumentId?: string | null }) {
  return { title: value.title, description: value.description, questions: value.questions.map((question, index) => ({ ...question, id: question.id || crypto.randomUUID(), sourcePage: question.sourcePage ?? null })), provider: value.provider, model: value.model, sourceDocumentId: value.sourceDocumentId } satisfies QuizDraft;
}

export default function QuizPage({ owner, store, accountPlan, onQuizCompleted }: { owner: string | null; store: QuizStore; accountPlan?: AccountPlan; onQuizCompleted?: (quizId: string) => Promise<void> }) {
  const { t, language } = useLanguage();
  const [dialog, setDialog] = useState(false);
  const [mode, setMode] = useState<AiMode>(owner ? "auto" : "manual");
  const [file, setFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState("");
  const [manualJson, setManualJson] = useState("");
  const [maxQuestions, setMaxQuestions] = useState(10);
  const [manualUsageConsumed, setManualUsageConsumed] = useState(false);
  const [manualCopied, setManualCopied] = useState(false);
  const [draft, setDraft] = useState<QuizDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeQuiz, setActiveQuiz] = useState<QuizTest | null>(null);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const maxAllowedQuestions = Math.min(100, Math.max(3, accountPlan?.maxCards ?? 50));
  const manualPrompt = useMemo(() => buildQuizPrompt({ text: manualText || undefined, fileName: file?.name, maxQuestions, language }), [file?.name, language, manualText, maxQuestions]);

  const resetDialog = () => { controller.current?.abort(); setDialog(false); setDraft(null); setError(""); setManualJson(""); setManualText(""); setFile(null); setManualCopied(false); setManualUsageConsumed(false); };
  const openDialog = () => { setMode(owner ? "auto" : "manual"); setMaxQuestions(Math.min(10, maxAllowedQuestions)); setError(""); setDraft(null); setManualJson(""); setManualText(""); setFile(null); setManualUsageConsumed(false); setDialog(true); };
  const switchMode = (next: AiMode) => { setMode(next); setDraft(null); setError(""); setManualJson(""); setManualUsageConsumed(false); };
  const openGemini = () => { const opened = window.open(GEMINI_WEB_URL, "_blank", "noopener,noreferrer"); if (!opened) setError(t("popupBlocked")); };
  const copyPrompt = async () => { try { await writeClipboardText(manualPrompt); setManualCopied(true); window.setTimeout(() => setManualCopied(false), 2000); } catch { setError(t("clipboardWriteError")); } };

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) { setError(t("quizFileRequired")); return; }
    if (file.size > MAX_FILE_BYTES) { setError(t("fileTooLarge")); return; }
    if (!owner) { setError(t("loginRequired")); return; }
    setBusy(true); setError("");
    const request = new AbortController(); controller.current = request;
    try {
      const generated = await generateQuizFromFile(file, maxQuestions, request.signal);
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
      setDraft(draftFrom({ ...parsed, provider: "manual", model: "Gemini Web" }));
    } catch (err) {
      setError(err instanceof QuizValidationError ? t("quizInvalidResult") : aiErrorMessage(err, t, "aiManualQuotaError"));
    } finally { setBusy(false); }
  };

  const updateQuestion = (index: number, patch: Partial<QuizQuestion>) => setDraft(current => current ? { ...current, questions: current.questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question) } : current);
  const updateOption = (index: number, optionIndex: number, value: string) => setDraft(current => current ? { ...current, questions: current.questions.map((question, questionIndex) => { if (questionIndex !== index) return question; const options = [...question.options] as [string, string, string, string]; options[optionIndex] = value; return { ...question, options }; }) } : current);
  const applyDraft = async () => {
    if (!draft) return;
    setBusy(true); setError("");
    try { await store.createQuiz({ title: draft.title, description: draft.description, questions: draft.questions, sourceDocumentId: draft.sourceDocumentId ?? null }); resetDialog(); }
    catch (err) { setError(err instanceof Error ? err.message : t("quizSaveError")); }
    finally { setBusy(false); }
  };

  const startQuiz = (quiz: QuizTest) => { setActiveQuiz(quiz); setAnswers(Array.from({ length: quiz.questions.length }, () => null)); setQuestionIndex(0); setStartedAt(Date.now()); setResult(null); setError(""); };
  const submitQuiz = async () => {
    if (!activeQuiz) return;
    const score = scoreQuiz(activeQuiz, answers);
    setBusy(true); setError("");
    try { await store.saveAttempt({ id: crypto.randomUUID(), quizId: activeQuiz.id, score, total: activeQuiz.questions.length, answers, durationSeconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)), completedAt: new Date().toISOString() }); setResult({ score, total: activeQuiz.questions.length }); if (onQuizCompleted) await onQuizCompleted(activeQuiz.id); }
    catch (err) { setError(err instanceof Error ? err.message : t("quizSaveError")); }
    finally { setBusy(false); }
  };

  if (activeQuiz) {
    const question = activeQuiz.questions[questionIndex];
    return <section className="quiz-page"><div className="quiz-runner-header"><button className="secondary-button" onClick={() => setActiveQuiz(null)}><ArrowLeft size={16}/>{t("backToQuizzes")}</button><span>{activeQuiz.title}</span><small>{questionIndex + 1} / {activeQuiz.questions.length}</small></div>{result ? <QuizResult quiz={activeQuiz} score={result.score} answers={answers} onRetake={() => startQuiz(activeQuiz)} t={t}/> : <div className="quiz-runner"><div className="quiz-progress"><span style={{ width: `${((questionIndex + 1) / activeQuiz.questions.length) * 100}%` }}/></div><article className="quiz-question-card"><span className="quiz-question-kicker">{t("questionNumber", { count: questionIndex + 1 })}</span><h2>{question.prompt}</h2>{question.topic && <small className="quiz-topic">{question.topic}</small>}<div className="quiz-options">{question.options.map((option, optionIndex) => { const selected = answers[questionIndex] === optionIndex; return <button key={`${question.id}-${optionIndex}`} className={selected ? "selected" : ""} onClick={() => setAnswers(current => current.map((answer, index) => index === questionIndex ? optionIndex : answer))}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>; })}</div></article><footer className="quiz-runner-actions"><button className="secondary-button" disabled={questionIndex === 0} onClick={() => setQuestionIndex(index => Math.max(0, index - 1))}>{t("previousQuestion")}</button>{questionIndex < activeQuiz.questions.length - 1 ? <button className="primary-button" disabled={answers[questionIndex] === null} onClick={() => setQuestionIndex(index => index + 1)}>{t("nextQuestion")}<Play size={15}/></button> : <button className="primary-button" disabled={answers[questionIndex] === null || busy} onClick={() => void submitQuiz()}><CheckCircle2 size={16}/>{busy ? t("saving") : t("submitQuiz")}</button>}</footer>{error && <p className="form-error" role="alert">{error}</p>}</div>}</section>;
  }

  return <section className="quiz-page"><header className="quiz-heading"><div><span className="eyebrow">QUIZ STUDIO</span><h2>{t("quiz")}</h2><p>{t("quizHint")}</p></div><button className="primary-button" onClick={openDialog}><FileUp size={17}/>{t("createQuiz")}</button></header>{store.error && <div className="flashcards-error" role="alert"><span>{store.error}</span><button className="icon-button" onClick={() => store.setError("")}><X size={15}/></button></div>}{store.loading ? <p>{t("loading")}</p> : !store.quizzes.length ? <div className="quiz-empty"><ClipboardList size={44}/><h3>{t("noQuizzes")}</h3><p>{t("noQuizzesHint")}</p><button className="secondary-button" onClick={openDialog}><Upload size={16}/>{t("createQuiz")}</button></div> : <div className="quiz-list">{store.quizzes.map(quiz => { const attempts = store.attempts.filter(attempt => attempt.quizId === quiz.id); const best = attempts.reduce((value, attempt) => Math.max(value, attempt.total ? Math.round(attempt.score / attempt.total * 100) : 0), 0); return <article className="quiz-test-card" key={quiz.id}><div className="quiz-card-icon"><ClipboardList size={22}/></div><div className="quiz-card-copy"><h3>{quiz.title}</h3><p>{quiz.description || t("quizQuickHint")}</p><small>{quiz.questions.length} {t("quizQuestions").toLocaleLowerCase()} · {attempts.length} {t("quizAttempts").toLocaleLowerCase()}{best ? ` · ${t("bestScore")}: ${best}%` : ""}</small></div><div className="quiz-card-actions"><button className="primary-button" onClick={() => startQuiz(quiz)}><Play size={16}/>{t("startQuiz")}</button><button className="icon-button danger" aria-label={`${t("deleteQuiz")}: ${quiz.title}`} onClick={() => void store.removeQuiz(quiz)}><Trash2 size={16}/></button></div></article>; })}</div>}{dialog && <Dialog title={t("createQuiz")} onClose={resetDialog}><AiModeSwitch mode={mode} autoAvailable={!!owner} onChange={switchMode}/>{mode === "auto" ? <form className="quiz-create-form" onSubmit={event => void generate(event)}><p>{t("quizAutoHint")}</p><label className="upload-drop quiz-upload"><span><FileUp size={22}/>{t("quizChooseFile")}</span><input type="file" accept=".pdf,.docx,.pptx,.txt,.md,.csv,image/*" disabled={busy} onChange={event => { const next = event.target.files?.[0] ?? null; setFile(next); setError(next && next.size > MAX_FILE_BYTES ? t("fileTooLarge") : ""); }}/>{file && <small>{file.name}</small>}</label><label>{t("maxQuestions")}<input type="number" min="3" max={maxAllowedQuestions} value={maxQuestions} onChange={event => setMaxQuestions(Math.max(3, Math.min(maxAllowedQuestions, Number(event.target.value) || 3)))}/></label>{error && <p className="form-error" role="alert">{error}</p>}<footer className="actions"><button type="button" className="secondary-button" onClick={resetDialog}>{t("cancel")}</button><button className="primary-button" disabled={busy || !file}>{busy ? t("generating") : t("generateQuiz")}</button></footer></form> : !draft ? <div className="quiz-manual-form"><p className="ai-manual-note">{t("aiManualHint")} {t("quizManualHint")}</p><label>{t("quizSourceText")}<textarea rows={7} value={manualText} onChange={event => setManualText(event.target.value)} placeholder={t("quizSourcePlaceholder")}/></label><label className="upload-drop"><span><FileUp size={20}/>{t("quizManualFile")}</span><input type="file" accept=".pdf,.docx,.pptx,.txt,.md,.csv,image/*" onChange={event => setFile(event.target.files?.[0] ?? null)}/>{file && <small>{file.name}</small>}</label><label>{t("maxQuestions")}<input type="number" min="3" max={maxAllowedQuestions} value={maxQuestions} onChange={event => setMaxQuestions(Math.max(3, Math.min(maxAllowedQuestions, Number(event.target.value) || 3)))}/></label><label><span>{t("aiManualPrompt")}</span><textarea readOnly rows={8} value={manualPrompt}/></label><div className="ai-manual-actions"><button type="button" className="secondary-button" onClick={() => void copyPrompt()}><ClipboardList size={15}/>{manualCopied ? t("copiedPrompt") : t("copyPrompt")}</button><button type="button" className="secondary-button" onClick={openGemini}>{t("openGemini")}</button></div><label><span>{t("aiManualJsonLabel")}</span><textarea rows={8} value={manualJson} onChange={event => setManualJson(event.target.value)} placeholder={t("quizJsonPlaceholder")}/></label>{error && <p className="form-error" role="alert">{error}</p>}<footer className="actions"><button type="button" className="secondary-button" onClick={resetDialog}>{t("cancel")}</button><button type="button" className="primary-button" disabled={busy || !manualJson.trim()} onClick={() => void validateManual()}>{busy ? t("validating") : t("validateResult")}</button></footer></div> : <div className="quiz-preview-form"><div className="quiz-preview-heading"><div><span className="eyebrow">{draft.provider}</span><h3>{t("quizPreview")}</h3><small>{draft.model}</small></div><strong>{draft.questions.length} {t("quizQuestions").toLocaleLowerCase()}</strong></div><label>{t("quizTitle")}<input value={draft.title} onChange={event => setDraft(current => current ? { ...current, title: event.target.value } : current)}/></label><label>{t("quizDescription")}<textarea rows={2} value={draft.description} onChange={event => setDraft(current => current ? { ...current, description: event.target.value } : current)}/></label><div className="quiz-preview-list">{draft.questions.map((question, index) => <article className="quiz-preview-question" key={question.id}><div className="quiz-preview-question-header"><strong>#{index + 1}</strong><button className="icon-button danger" type="button" onClick={() => setDraft(current => current ? { ...current, questions: current.questions.filter((_, questionIndex) => questionIndex !== index) } : current)}><Trash2 size={14}/></button></div><label>{t("questionSide")}<textarea rows={2} value={question.prompt} onChange={event => updateQuestion(index, { prompt: event.target.value })}/></label><div className="quiz-option-editor">{question.options.map((option, optionIndex) => <label key={optionIndex}><span>{String.fromCharCode(65 + optionIndex)}</span><input value={option} onChange={event => updateOption(index, optionIndex, event.target.value)}/></label>)}</div><label>{t("correctAnswer")}<select value={question.correctIndex} onChange={event => updateQuestion(index, { correctIndex: Number(event.target.value) as 0 | 1 | 2 | 3 })}>{question.options.map((_, optionIndex) => <option value={optionIndex} key={optionIndex}>{String.fromCharCode(65 + optionIndex)}</option>)}</select></label><label>{t("explanation")}<textarea rows={2} value={question.explanation} onChange={event => updateQuestion(index, { explanation: event.target.value })}/></label></article>)}</div>{error && <p className="form-error" role="alert">{error}</p>}<footer className="actions"><button type="button" className="secondary-button" onClick={() => setDraft(null)}>{t("backToSource")}</button><button type="button" className="primary-button" disabled={busy || !draft.questions.length} onClick={() => void applyDraft()}><Check size={16}/>{busy ? t("saving") : t("saveQuiz")}</button></footer></div>}</Dialog>}</section>;
}

function QuizResult({ quiz, score, answers, onRetake, t }: { quiz: QuizTest; score: number; answers: Array<number | null>; onRetake: () => void; t: ReturnType<typeof useLanguage>["t"] }) {
  return <div className="quiz-result"><div className="quiz-result-badge"><Award size={34}/><strong>{formatQuizPercent(score, quiz.questions.length)}%</strong><span>{score} / {quiz.questions.length}</span></div><h2>{t("quizComplete")}</h2><p>{t("quizReviewHint")}</p><div className="quiz-answer-review">{quiz.questions.map((question, index) => { const correct = answers[index] === question.correctIndex; return <article key={question.id}><div><strong>#{index + 1}</strong><span className={correct ? "correct" : "incorrect"}>{question.prompt}</span></div><p><b>{correct ? t("yourAnswer") : t("correctAnswer")}:</b> {question.options[question.correctIndex]}{question.explanation && ` — ${question.explanation}`}</p></article>; })}</div><button className="primary-button" onClick={onRetake}><RotateCcw size={16}/>{t("retakeQuiz")}</button></div>;
}
