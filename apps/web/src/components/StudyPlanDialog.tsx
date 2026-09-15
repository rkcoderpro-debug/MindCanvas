import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, ClipboardPaste, FileUp, Sparkles, Trash2 } from "lucide-react";
import type { Flashcard, FlashcardDeck, StudyPlan, StudyPlanDay, StudyPlanMode, StudyPlanTask } from "../lib/flashcards";
import { dueCards, recommendDailyTarget, vietnamStudyDate } from "../lib/flashcards";
import { useLanguage } from "../lib/i18n";
import type { StudyPlanRecommendation } from "../lib/api";
import { consumeAiManualUsage } from "../lib/api";
import Dialog from "./Dialog";
import AiQualityControls from "./AiQualityControls";
import { DEFAULT_AI_OPTIONS, type AiGenerationOptions } from "../lib/aiOptions";
import { buildStudyPlanPrompt, ManualAiValidationError, parseManualStudyPlan } from "../lib/manualAi";
import { writeClipboardText } from "../lib/aiSource";
import { AiModeSwitch, type AiMode, ManualSteps } from "./AiModeSwitch";
import ManualAiProviderLinks from "./ManualAiProviderLinks";

type PreviewCard = { id: string; front: string; back: string; sourcePage: number | null };
type GeneratedFilePreview = { title: string; sourceDocumentId?: string; cards: PreviewCard[] };
type PlanActivity = "flashcards" | "quiz" | "focus";
type QuizChoice = { id: string; title: string };
type AiPlanDraft = {
  mode: "ai" | "manual";
  recommendation: StudyPlanRecommendation;
  sourceType: StudyPlan["sourceType"];
  sourceDocumentId: string | null;
  deckIds: string[];
  target: number;
  dailyMinutes: number;
  schedule: StudyPlanDay[];
  assignedCardIds: string[];
  taskCardIds: Record<string, string[]>;
};

type Props = {
  owner: string | null;
  decks: FlashcardDeck[];
  quizzes?: QuizChoice[];
  selectedDeckId: string | null;
  maxCards: number;
  onClose: () => void;
  onLoadCards: (deckIds: string[]) => Promise<Flashcard[]>;
  onGenerateFile: (file: File, maxCards: number, targetDeckId: string, options: AiGenerationOptions) => Promise<GeneratedFilePreview>;
  onCreateCards: (deckId: string, cards: Array<{ front: string; back: string; sourcePage?: number | null }>) => Promise<Flashcard[]>;
  onRecommend: (cards: Flashcard[], dailyMinutes: number, options: AiGenerationOptions) => Promise<StudyPlanRecommendation>;
  onSavePlan: (input: {
    name: string;
    sourceType: StudyPlan["sourceType"];
    deckIds: string[];
    sourceDocumentId?: string | null;
    dailyTarget: number;
    dailyMinutes: number;
    assignedCardIds: string[];
    mode?: StudyPlanMode;
    schedule?: StudyPlanDay[];
    taskCardIds?: Record<string, string[]>;
  }) => Promise<StudyPlan>;
};

function addCalendarDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatPlanDate(value: string, language: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US", { weekday: "short", day: "numeric", month: "short" });
}

function assignmentFor(cards: Flashcard[], target: number) {
  const difficult = cards.filter(card => card.lapses > 0).sort((a, b) => b.lapses - a.lapses);
  const ordered = [...dueCards(cards), ...difficult, ...cards];
  return [...new Map(ordered.map(card => [card.id, card])).values()].slice(0, target).map(card => card.id);
}

function buildSchedule(input: {
  startDate: string;
  durationDays: number;
  daysPerWeek: number;
  activities: PlanActivity[];
  target: number;
  deckIds: string[];
  quizId: string;
  focusMinutes: number;
  titles: { flashcards: string; quiz: string; focus: string };
}) {
  const schedule: StudyPlanDay[] = [];
  for (let index = 0; index < input.durationDays; index += 1) {
    const studyDate = addCalendarDays(input.startDate, index);
    const active = index % 7 < input.daysPerWeek;
    const tasks: StudyPlanTask[] = [];
    if (active && input.activities.includes("flashcards")) tasks.push({ id: `ai-flashcards-${studyDate}`, kind: "flashcards", title: input.titles.flashcards, deckIds: input.deckIds, targetCount: input.target });
    if (active && input.activities.includes("quiz")) tasks.push({ id: `ai-quiz-${studyDate}`, kind: "quiz", title: input.titles.quiz, quizId: input.quizId || null });
    if (active && input.activities.includes("focus")) tasks.push({ id: `ai-focus-${studyDate}`, kind: "focus", title: input.titles.focus, minutes: input.focusMinutes });
    schedule.push({ studyDate, restDay: !active, tasks });
  }
  return schedule;
}

export default function StudyPlanDialog({ owner, decks, quizzes = [], selectedDeckId, maxCards, onClose, onLoadCards, onGenerateFile, onCreateCards, onRecommend, onSavePlan }: Props) {
  const { t, language } = useLanguage();
  const initialDeck = selectedDeckId && decks.some(deck => deck.id === selectedDeckId) ? selectedDeckId : decks[0]?.id ?? "";
  const [deckIds, setDeckIds] = useState<string[]>(initialDeck ? [initialDeck] : []);
  const [targetDeckId, setTargetDeckId] = useState(initialDeck);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("20");
  const [durationDays, setDurationDays] = useState("7");
  const [daysPerWeek, setDaysPerWeek] = useState("7");
  const [activities, setActivities] = useState<PlanActivity[]>(["flashcards"]);
  const [selectedQuizId, setSelectedQuizId] = useState(quizzes[0]?.id ?? "");
  const [focusMinutes, setFocusMinutes] = useState("25");
  const [aiOptions, setAiOptions] = useState<AiGenerationOptions>(DEFAULT_AI_OPTIONS);
  const [aiMode, setAiMode] = useState<AiMode>("auto");
  const [manualJson, setManualJson] = useState("");
  const [manualUsageConsumed, setManualUsageConsumed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceCards, setSourceCards] = useState<Flashcard[]>([]);
  const [preview, setPreview] = useState<GeneratedFilePreview | null>(null);
  const [planDraft, setPlanDraft] = useState<AiPlanDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const minutesValue = Math.max(5, Math.min(180, Number(minutes) || 20));
  const durationValue = Math.max(1, Math.min(30, Number(durationDays) || 7));
  const cadenceValue = Math.max(1, Math.min(7, Number(daysPerWeek) || 7));
  const focusValue = Math.max(5, Math.min(240, Number(focusMinutes) || 25));
  const recommended = useMemo(() => recommendDailyTarget(sourceCards, minutesValue), [minutesValue, sourceCards]);
  const chosenDeckNames = decks.filter(deck => deckIds.includes(deck.id)).map(deck => deck.name).join(", ");
  const manualPrompt = useMemo(() => buildStudyPlanPrompt({
    deckNames: decks.filter(deck => deckIds.includes(deck.id)).map(deck => ({ id: deck.id, name: deck.name, cardCount: sourceCards.filter(card => card.deckId === deck.id).length })),
    quizNames: quizzes,
    language,
    dailyMinutes: minutesValue,
    durationDays: durationValue,
    daysPerWeek: cadenceValue,
    activities,
    fileName: file?.name,
    options: aiOptions,
  }), [aiOptions, activities, cadenceValue, deckIds.join(","), decks, durationValue, file?.name, language, minutesValue, quizzes, sourceCards]);

  useEffect(() => {
    let alive = true;
    if (!deckIds.length) { setSourceCards([]); return () => { alive = false; }; }
    void onLoadCards(deckIds).then(cards => { if (alive) setSourceCards(cards); }).catch(err => { if (alive) setError(err instanceof Error ? err.message : t("studyPlanLoadError")); });
    return () => { alive = false; };
  }, [deckIds.join(","), onLoadCards, t]);

  useEffect(() => {
    if (!selectedQuizId || quizzes.some(quiz => quiz.id === selectedQuizId)) return;
    setSelectedQuizId(quizzes[0]?.id ?? "");
  }, [quizzes, selectedQuizId]);

  const toggleDeck = (deckId: string) => setDeckIds(current => current.includes(deckId) ? current.filter(id => id !== deckId) : [...current, deckId]);
  const toggleActivity = (activity: PlanActivity) => setActivities(current => current.includes(activity) ? current.filter(item => item !== activity) : [...current, activity]);
  const setFileAndReset = (next: File | null) => { setFile(next); setPreview(null); setPlanDraft(null); setError(""); };
  const switchAiMode = (next: AiMode) => { setAiMode(next); setPreview(null); setPlanDraft(null); setManualJson(""); setManualUsageConsumed(false); setError(""); };
  const updatePreviewCard = (id: string, patch: Partial<PreviewCard>) => setPreview(current => current ? { ...current, cards: current.cards.map(card => card.id === id ? { ...card, ...patch } : card) } : current);
  const removePreviewCard = (id: string) => setPreview(current => current ? { ...current, cards: current.cards.filter(card => card.id !== id) } : current);

  const createPlanDraft = async (cards: Flashcard[], sourceDocumentId?: string | null, planDeckIds = deckIds) => {
    if (!cards.length) throw new Error(t("studyPlanNeedsCards"));
    if (!activities.length) throw new Error(t("aiPlanChooseActivity"));
    if (activities.includes("quiz") && !selectedQuizId) throw new Error(t("aiPlanNoQuiz"));
    const recommendation = await onRecommend(cards, minutesValue, aiOptions);
    const target = activities.includes("flashcards") ? Math.max(1, Math.min(cards.length, recommendation.dailyTarget || recommended)) : 1;
    const schedule = buildSchedule({ startDate: vietnamStudyDate(), durationDays: durationValue, daysPerWeek: cadenceValue, activities, target, deckIds: planDeckIds, quizId: selectedQuizId, focusMinutes: focusValue, titles: { flashcards: t("taskFlashcards"), quiz: quizzes.find(quiz => quiz.id === selectedQuizId)?.title ?? t("taskQuiz"), focus: t("taskFocus") } });
    const assignedCardIds = activities.includes("flashcards") ? assignmentFor(cards, target) : [];
    const todayTask = schedule[0]?.tasks.find(task => task.kind === "flashcards");
    setPlanDraft({ mode: "ai", recommendation, sourceType: file ? (sourceCards.length ? "mixed" : "document") : "decks", sourceDocumentId: sourceDocumentId ?? null, deckIds: [...new Set(planDeckIds)], target, dailyMinutes: minutesValue, schedule, assignedCardIds, taskCardIds: todayTask ? { [todayTask.id]: assignedCardIds } : {} });
  };

  const createManualPlanDraft = () => {
    const parsed = parseManualStudyPlan(manualJson, durationValue);
    const allowedDecks = new Set(deckIds);
    const allowedQuizzes = new Set(quizzes.map(quiz => quiz.id));
    const schedule: StudyPlanDay[] = parsed.schedule.map(day => ({
      studyDate: day.studyDate,
      restDay: day.restDay,
      tasks: day.tasks.map(task => {
        if (task.kind === "flashcards") {
          const validDeckIds = (task.deckIds ?? []).filter(id => allowedDecks.has(id));
          if (!validDeckIds.length) throw new Error(t("manualPlanUnknownDeck"));
          return { ...task, deckIds: validDeckIds, targetCount: Math.max(1, Math.min(maxCards, task.targetCount ?? parsed.dailyTarget)) };
        }
        if (task.kind === "quiz") {
          if (!task.quizId || !allowedQuizzes.has(task.quizId)) throw new Error(t("manualPlanUnknownQuiz"));
          return task;
        }
        return task;
      }),
    }));
    const target = Math.max(1, Math.min(maxCards, sourceCards.length ? sourceCards.length : parsed.dailyTarget));
    const assignedCardIds = schedule.some(day => day.tasks.some(task => task.kind === "flashcards")) ? assignmentFor(sourceCards, target) : [];
    const todayTask = schedule[0]?.tasks.find(task => task.kind === "flashcards");
    setPlanDraft({ mode: "manual", recommendation: { provider: "manual", model: "Manual AI", dailyTarget: target, focus: parsed.focus, rationale: parsed.rationale }, sourceType: "decks", sourceDocumentId: null, deckIds: [...allowedDecks], target, dailyMinutes: parsed.dailyMinutes, schedule, assignedCardIds, taskCardIds: todayTask ? { [todayTask.id]: assignedCardIds } : {} });
  };

  const validateManualPlan = async () => {
    if (!owner) { setError(t("manualRequiresLogin")); return; }
    setBusy(true); setError("");
    try {
      createManualPlanDraft();
      if (!manualUsageConsumed) { await consumeAiManualUsage(); setManualUsageConsumed(true); }
    } catch (err) {
      setPlanDraft(null);
      setError(err instanceof ManualAiValidationError ? t("manualInvalidStudyPlan") : err instanceof Error ? err.message : t("aiManualQuotaError"));
    } finally { setBusy(false); }
  };

  const saveDraft = async () => {
    if (!planDraft) return;
    setBusy(true); setError("");
    try {
      await onSavePlan({ name: name.trim() || t("aiStudyPlan"), sourceType: planDraft.sourceType, deckIds: planDraft.deckIds, sourceDocumentId: planDraft.sourceDocumentId, dailyTarget: planDraft.target, dailyMinutes: planDraft.dailyMinutes, assignedCardIds: planDraft.assignedCardIds, mode: planDraft.mode, schedule: planDraft.schedule, taskCardIds: planDraft.taskCardIds });
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : t("studyPlanCreateError")); }
    finally { setBusy(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const planDeckIds = file && targetDeckId ? [...new Set([...deckIds, targetDeckId])] : deckIds;
    if (!planDeckIds.length) { setError(t("chooseStudyDecks")); return; }
    if (!activities.length) { setError(t("aiPlanChooseActivity")); return; }
    if (activities.includes("quiz") && !selectedQuizId) { setError(t("aiPlanNoQuiz")); return; }
    if (file && !targetDeckId) { setError(t("studyPlanTargetDeck")); return; }
    if (aiMode === "manual") { await validateManualPlan(); return; }
    setBusy(true); setError("");
    try {
      if (file && !preview) {
        const generated = await onGenerateFile(file, maxCards, targetDeckId, aiOptions);
        setPreview(generated);
        return;
      }
      if (preview) {
        const inputs = preview.cards.map(card => ({ front: card.front.trim(), back: card.back.trim(), sourcePage: card.sourcePage })).filter(card => card.front && card.back);
        if (!inputs.length) { setError(t("studyPlanPreviewEmpty")); return; }
        const saved = await onCreateCards(targetDeckId, inputs);
        const cards = [...sourceCards, ...saved];
        setSourceCards(cards);
        setFile(null);
        setPreview(null);
        await createPlanDraft(cards, preview.sourceDocumentId, planDeckIds);
      } else {
        await createPlanDraft(sourceCards, null, planDeckIds);
      }
    } catch (err) { setError(err instanceof Error ? err.message : t("studyPlanCreateError")); }
    finally { setBusy(false); }
  };

  return <Dialog title={t("aiStudyPlan")} onClose={() => { if (!busy) onClose(); }}>
    <div className="study-plan-intro"><div className="study-plan-icon"><Sparkles size={20}/></div><div><strong>{t("planSetupRequired")}</strong><p>{t("aiPlanHint")}</p></div></div>
    <AiModeSwitch mode={aiMode} autoAvailable={!!owner} onChange={switchAiMode}/>
    {planDraft ? <div className="study-plan-generated">
      <div className="study-plan-generated-heading"><div><span className="eyebrow">{planDraft.recommendation.provider}</span><h3>{t("aiPlanSchedule")}</h3><p>{t("aiPlanPreviewHint")}</p></div><strong>{planDraft.target} {t("targetCards").toLocaleLowerCase()}</strong></div>
      <div className="study-plan-recommendation"><strong>{t("aiPlanRecommendation")}</strong><span>{planDraft.recommendation.focus} · {planDraft.recommendation.model}</span><p>{planDraft.recommendation.rationale || t("aiPlanRationale")}</p></div>
      <div className="study-plan-schedule-summary"><span>{t("aiPlanDurationDays", { count: planDraft.schedule.length })}</span><span>{t("aiPlanStudyDays", { count: planDraft.schedule.filter(day => !day.restDay).length })}</span></div>
      <div className="study-plan-schedule-list">{planDraft.schedule.slice(0, 7).map(day => <article className={day.restDay ? "rest" : ""} key={day.studyDate}><div><strong>{formatPlanDate(day.studyDate, language)}</strong><small>{day.restDay ? t("aiPlanRestDay") : day.tasks.map(task => task.title).join(" · ")}</small></div><span>{day.restDay ? "—" : `${day.tasks.length} ${t("tasksShort")}`}</span></article>)}</div>
      {planDraft.schedule.length > 7 && <small className="field-hint">{t("aiPlanMoreDays", { count: planDraft.schedule.length - 7 })}</small>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setPlanDraft(null)}>{t("aiPlanBack")}</button><button type="button" className="primary-button" disabled={busy} onClick={() => void saveDraft()}>{busy ? t("saving") : t("aiPlanSave")}</button></footer>
    </div> : !preview ? <form className="study-plan-form" onSubmit={event => void submit(event)}>
      <label>{t("studyPlanName")}<input autoFocus maxLength={160} value={name} onChange={event => setName(event.target.value)} placeholder={t("aiStudyPlan")}/></label>
      <fieldset className="study-deck-picker"><legend>{t("chooseStudyDecks")}</legend>{decks.map(deck => <label key={deck.id}><input type="checkbox" checked={deckIds.includes(deck.id)} onChange={() => toggleDeck(deck.id)}/><span>{deck.name}</span>{deck.id === selectedDeckId && <small>{t("studyDeck")}</small>}</label>)}{!decks.length && <p className="form-error">{t("noDecks")}</p>}</fieldset>
      <div className="study-plan-settings-grid"><label>{t("studyTime")}<select value={minutes} onChange={event => setMinutes(event.target.value)}><option value="10">10 {t("minutes")}</option><option value="20">20 {t("minutes")}</option><option value="30">30 {t("minutes")}</option><option value="45">45 {t("minutes")}</option><option value="60">60 {t("minutes")}</option><option value="90">90 {t("minutes")}</option></select></label><label>{t("aiPlanLength")}<select value={durationDays} onChange={event => setDurationDays(event.target.value)}><option value="7">7 {t("days")}</option><option value="14">14 {t("days")}</option><option value="30">30 {t("days")}</option></select></label><label>{t("aiPlanCadence")}<select value={daysPerWeek} onChange={event => setDaysPerWeek(event.target.value)}><option value="3">3 {t("days")}</option><option value="5">5 {t("days")}</option><option value="7">7 {t("days")}</option></select></label></div>
      <small className="field-hint">{sourceCards.length ? `${t("recommendedByAi")}: ${recommended} ${t("targetCards").toLocaleLowerCase()}` : t("studyPlanNeedsCards")}</small>
      <fieldset className="study-plan-activities"><legend>{t("aiPlanActivities")}</legend>{(["flashcards", "quiz", "focus"] as PlanActivity[]).map(activity => { const checked = activities.includes(activity); const disabled = activity === "quiz" && !quizzes.length; const label = activity === "flashcards" ? t("aiPlanFlashcards") : activity === "quiz" ? t("aiPlanQuiz") : t("aiPlanFocus"); const hint = activity === "flashcards" ? t("taskFlashcardsHint") : activity === "quiz" ? (quizzes.length ? t("taskQuizHint") : t("aiPlanNoQuiz")) : t("taskFocusHint"); return <label className={checked ? "selected" : ""} key={activity}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleActivity(activity)}/><span><strong>{label}</strong><small>{hint}</small></span></label>; })}</fieldset>
      {activities.includes("quiz") && quizzes.length > 0 && <label>{t("aiPlanSelectedQuiz")}<select value={selectedQuizId} onChange={event => setSelectedQuizId(event.target.value)}>{quizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}</select></label>}
      {activities.includes("focus") && <label>{t("aiPlanFocusMinutes")}<input type="number" min="5" max="240" step="5" value={focusMinutes} onChange={event => setFocusMinutes(event.target.value)}/></label>}
      <AiQualityControls options={aiOptions} onChange={setAiOptions}/>
      {aiMode === "manual" && <>
        <ManualSteps current={manualJson.trim() ? "result" : "prompt"}/>
        <div className="ai-manual-plan-box"><p className="ai-manual-note">{t("aiManualPlanHint")}</p><label>{t("aiManualPrompt")}<textarea rows={9} readOnly value={manualPrompt}/></label><div className="ai-manual-actions"><button type="button" className="secondary-button" onClick={() => void writeClipboardText(manualPrompt).catch(() => setError(t("clipboardWriteError")))}><ClipboardPaste size={15}/>{t("copyPrompt")}</button></div><ManualAiProviderLinks onBlocked={() => setError(t("popupBlocked"))}/><label>{t("aiManualJsonLabel")}<textarea rows={9} value={manualJson} onChange={event => setManualJson(event.target.value)} placeholder={t("aiManualStudyPlanPlaceholder")}/></label><label className="upload-drop"><span><FileUp size={18}/>{t("uploadJsonFile")}</span><input type="file" accept="application/json,.json" disabled={busy} onChange={event => { const selected = event.target.files?.[0]; event.target.value = ""; if (!selected) return; void selected.text().then(setManualJson).catch(() => setError(t("manualJsonFileError"))); }}/></label></div>
      </>}
      <label className="upload-drop study-plan-upload"><span><FileUp size={20}/>{aiMode === "manual" ? t("manualFileSelected") : t("uploadMaterialForPlan")}</span><input type="file" accept=".pdf,.docx,.pptx,.txt,.md,.csv,image/*" disabled={busy} onChange={event => setFileAndReset(event.target.files?.[0] ?? null)}/><small>{aiMode === "manual" ? t("aiManualUploadHint") : t("planFileHint")}</small>{file && <small>{file.name}</small>}</label>
      {file && <label>{t("studyPlanTargetDeck")}<select value={targetDeckId} onChange={event => { const next = event.target.value; setTargetDeckId(next); setDeckIds(current => current.includes(next) ? current : [...current, next]); }}>{decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select><small className="field-hint">{t("planFileCreatesCards")}</small></label>}
      {chosenDeckNames && <div className="study-plan-selection"><Check size={15}/><span>{chosenDeckNames}</span></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{t("cancel")}</button><button className="primary-button" disabled={busy || !deckIds.length || (aiMode === "manual" && !manualJson.trim())}>{busy ? t("aiPlanGenerating") : aiMode === "manual" ? t("validateResult") : file ? t("generateAndPlan") : t("aiPlanSchedule")}</button></footer>
    </form> : <form className="study-plan-preview" onSubmit={event => void submit(event)}>
      <div className="study-plan-preview-heading"><div><strong>{preview.title || t("flashcardSetTitle")}</strong><small>{t("planPreviewHint")}</small></div><span>{preview.cards.length} / {maxCards}</span></div>
      <p className="field-hint">{t("aiPreviewHint")}</p>
      <div className="ai-flashcards-preview">{preview.cards.map((card, index) => <article className="ai-preview-card" key={card.id}><div className="ai-preview-card-heading"><strong>#{index + 1}</strong><button type="button" className="icon-button danger" aria-label={t("removePreviewCard")} onClick={() => removePreviewCard(card.id)}><Trash2 size={15}/></button></div><label>{t("questionSide")}<textarea rows={2} value={card.front} onChange={event => updatePreviewCard(card.id, { front: event.target.value })}/></label><label>{t("answerSide")}<textarea rows={3} value={card.back} onChange={event => updatePreviewCard(card.id, { back: event.target.value })}/></label></article>)}</div>
      {!preview.cards.length && <p className="form-error">{t("studyPlanPreviewEmpty")}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => { setPreview(null); setFile(null); setError(""); }}>{t("backToSource")}</button><button type="submit" className="primary-button" disabled={busy || !preview.cards.length}>{busy ? t("aiPlanGenerating") : t("aiPlanSchedule")}</button></footer>
    </form>}
  </Dialog>;
}
