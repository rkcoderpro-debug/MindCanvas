import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, CalendarDays, Check, CheckCircle2, ClipboardList, Flame, Gauge, Layers3, ListChecks, Plus, Sparkles, Target, Trophy, WandSparkles } from "lucide-react";
import type { Project } from "../lib/projectStore";
import type { AccountPlan } from "../lib/account";
import { useLanguage } from "../lib/i18n";
import { isStudyDayComplete, recommendDailyTarget, studyPlanDayFor, vietnamStudyDate, type Flashcard, type StudyPlanDay, type StudyPlanMode, type StudyPlanTask, type StudyTaskKind } from "../lib/flashcards";
import { useFlashcards, type FlashcardStore } from "../hooks/useFlashcards";
import { useQuizzes, type QuizStore } from "../hooks/useQuizzes";
import FlashcardsPage from "./FlashcardsPage";
import QuizPage from "./QuizPage";
import StudyPlanDialog from "./StudyPlanDialog";
import { generateFlashcardsFromFile, recommendStudyPlan, type GeneratedFlashcardsFromFile, type StudyPlanRecommendation } from "../lib/api";
import { MAX_FILE_BYTES } from "../lib/board";
import { saveDocumentToStorage } from "../lib/supabase";
import type { AiGenerationOptions } from "../lib/aiOptions";

type HubTab = "overview" | "flashcards" | "quiz" | "plan" | "progress";

function addDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function nextStudyDates() {
  const today = vietnamStudyDate();
  return Array.from({ length: 7 }, (_, index) => addDate(today, index));
}

function formatDay(value: string, language: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US", { weekday: "short", day: "numeric", month: "short" });
}

function taskIcon(kind: StudyTaskKind) {
  return kind === "flashcards" ? <BookOpen size={16}/> : kind === "quiz" ? <ClipboardList size={16}/> : kind === "focus" ? <Gauge size={16}/> : <ListChecks size={16}/>;
}

export default function LearningHubPage({ owner, projects, accountPlan }: { owner: string | null; projects: Project[]; accountPlan?: AccountPlan }) {
  const { t, language } = useLanguage();
  const flashcards = useFlashcards(owner);
  const quizzes = useQuizzes(owner);
  const [tab, setTab] = useState<HubTab>("overview");
  const [openAiPlan, setOpenAiPlan] = useState(false);
  const today = vietnamStudyDate();

  useEffect(() => {
    const plan = flashcards.activeStudyPlan;
    if (!plan || flashcards.todayStudyDay || flashcards.studyLoading) return;
    let alive = true;
    void flashcards.loadCardsForDecks(plan.deckIds).then(cards => { if (alive) void flashcards.ensureStudyPlanDay(plan, cards); }).catch(() => undefined);
    return () => { alive = false; };
  }, [flashcards.activeStudyPlan, flashcards.ensureStudyPlanDay, flashcards.loadCardsForDecks, flashcards.studyLoading, flashcards.todayStudyDay]);

  const onQuizCompleted = async (quizId: string) => {
    const plan = flashcards.activeStudyPlan;
    const planDay = plan ? studyPlanDayFor(plan, today) : null;
    const task = planDay?.tasks.find(item => item.kind === "quiz" && item.quizId === quizId);
    let day = flashcards.todayStudyDay;
    if (task && plan && !day) {
      const cards = await flashcards.loadCardsForDecks(plan.deckIds);
      day = await flashcards.ensureStudyPlanDay(plan, cards);
    }
    if (task && day && !day.completedTaskIds?.includes(task.id)) await flashcards.completeStudyTask(task.id);
  };

  const tabs: Array<{ id: HubTab; label: string; icon: typeof BookOpen }> = [
    { id: "overview", label: t("overview"), icon: Layers3 },
    { id: "flashcards", label: t("flashcards"), icon: BookOpen },
    { id: "quiz", label: t("quiz"), icon: ClipboardList },
    { id: "plan", label: t("studyPlan"), icon: CalendarDays },
    { id: "progress", label: t("progress"), icon: BarChart3 },
  ];

  return <section className="learning-hub-page">
    <header className="learning-hub-header"><div><span className="eyebrow">LEARNING HUB</span><h1>{t("learningHub")}</h1><p>{t("learningHubHint")}</p></div><div className="learning-hub-header-badge"><Flame size={18}/><strong>{flashcards.streak.current}</strong><span>{t("streakDays")}</span></div></header>
    <nav className="learning-hub-nav" aria-label={t("learningHub")} role="tablist">{tabs.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={17}/><span>{label}</span>{id === "quiz" && quizzes.quizzes.length > 0 && <small>{quizzes.quizzes.length}</small>}</button>)}</nav>
    {tab === "overview" && <HubOverview flashcards={flashcards} quizzes={quizzes} onTab={setTab} onOpenAiPlan={() => { setOpenAiPlan(true); setTab("plan"); }} t={t} language={language}/>}
    {tab === "flashcards" && <FlashcardsPage owner={owner} projects={projects} accountPlan={accountPlan} store={flashcards}/>}
    {tab === "quiz" && <QuizPage owner={owner} store={quizzes} accountPlan={accountPlan} onQuizCompleted={onQuizCompleted}/>}
    {tab === "plan" && <StudyPlannerPanel owner={owner} maxCards={accountPlan?.maxCards ?? 50} openAiPlan={openAiPlan} onAiPlanOpened={() => setOpenAiPlan(false)} flashcards={flashcards} quizzes={quizzes} language={language} t={t}/>}
    {tab === "progress" && <ProgressPanel flashcards={flashcards} quizzes={quizzes} language={language} t={t}/>}
  </section>;
}

function HubOverview({ flashcards, quizzes, onTab, onOpenAiPlan, t, language }: { flashcards: FlashcardStore; quizzes: QuizStore; onTab: (tab: HubTab) => void; onOpenAiPlan: () => void; t: ReturnType<typeof useLanguage>["t"]; language: string }) {
  const plan = flashcards.activeStudyPlan;
  const today = vietnamStudyDate();
  const planDay = plan ? studyPlanDayFor(plan, today) : null;
  const day = flashcards.todayStudyDay;
  const tasks = planDay?.tasks ?? [];
  return <div className="learning-hub-overview">
    <div className="learning-hero"><div className="learning-hero-copy"><span className="eyebrow">{plan ? t("todayPlan") : t("quickStart")}</span><h2>{plan ? plan.name : t("continueLearning")}</h2><p>{plan ? t("manualPlanStreakHint") : t("noPlanFallbackHint")}</p><div className="learning-hero-actions"><button className="primary-button" onClick={() => onTab(plan ? "plan" : "flashcards")}><Sparkles size={17}/>{plan ? t("openTodayPlan") : t("startLearning")}</button><button className="secondary-button learning-hub-ai-action" onClick={onOpenAiPlan}><WandSparkles size={16}/>{t("aiStudyPlan")}</button></div></div><div className="learning-hero-orbit"><Trophy size={32}/><strong>{flashcards.streak.current}</strong><span>{t("streakDays")}</span></div></div>
    <div className="learning-stats-grid"><article><span><Flame size={16}/>{t("streak")}</span><strong>{flashcards.streak.current}</strong><small>{t("bestStreak")}: {flashcards.streak.best}</small></article><article><span><Target size={16}/>{t("todayGoal")}</span><strong>{flashcards.streak.todayProgress} / {flashcards.streak.todayTarget}</strong><small>{flashcards.streak.todayCompleted ? t("streakEarned") : t("streakLocked")}</small></article><article><span><BookOpen size={16}/>{t("flashcards")}</span><strong>{flashcards.cards.length}</strong><small>{t("dueCount", { count: flashcards.due.length })}</small></article><article><span><ClipboardList size={16}/>{t("quiz")}</span><strong>{quizzes.quizzes.length}</strong><small>{t("quizTestsSaved")}</small></article></div>
    <div className="learning-overview-columns"><section className="learning-card learning-today-card"><div className="learning-card-heading"><div><span className="eyebrow">{t("today")}</span><h3>{plan ? t("dailyTasks") : t("quickStart")}</h3></div><button className="text-button" onClick={() => onTab(plan ? "plan" : "flashcards")}>{t("viewDetails")}</button></div>{plan && tasks.length ? <div className="task-checklist">{tasks.map(task => { const done = !!day?.completedTaskIds?.includes(task.id); return <div className={`task-check-row ${done ? "done" : ""}`} key={task.id}><span className="task-check-icon">{done ? <CheckCircle2 size={18}/> : taskIcon(task.kind)}</span><span><strong>{task.title}</strong><small>{task.kind === "flashcards" && task.targetCount ? `${task.targetCount} ${t("targetCards").toLocaleLowerCase()}` : task.minutes ? `${task.minutes} ${t("minutes")}` : t("taskPending")}</small></span>{done && <Check size={16}/>}</div>; })}</div> : <div className="learning-empty-state"><WandSparkles size={26}/><p>{t("noTasksToday")}</p><button className="secondary-button" onClick={() => onTab("plan")}><Plus size={15}/>{t("createManualPlan")}</button></div>}</section><section className="learning-card learning-quick-actions"><div className="learning-card-heading"><div><span className="eyebrow">{t("studyTools")}</span><h3>{t("chooseStudyMode")}</h3></div></div><button onClick={() => onTab("flashcards")}><span className="quick-action-icon purple"><BookOpen size={20}/></span><span><strong>{t("flashcards")}</strong><small>{t("flashcardQuickHint")}</small></span></button><button onClick={() => onTab("quiz")}><span className="quick-action-icon blue"><ClipboardList size={20}/></span><span><strong>{t("quiz")}</strong><small>{t("quizQuickHint")}</small></span></button><button onClick={() => onTab("plan")}><span className="quick-action-icon orange"><CalendarDays size={20}/></span><span><strong>{t("studyPlan")}</strong><small>{t("planQuickHint")}</small></span></button></section></div>
  </div>;
}

function StudyPlannerPanel({ owner, maxCards, openAiPlan, onAiPlanOpened, flashcards, quizzes, language, t }: { owner: string | null; maxCards: number; openAiPlan: boolean; onAiPlanOpened: () => void; flashcards: FlashcardStore; quizzes: QuizStore; language: string; t: ReturnType<typeof useLanguage>["t"] }) {
  const dates = useMemo(nextStudyDates, []);
  const existingPlan = flashcards.activeStudyPlan;
  const [mode, setMode] = useState<StudyPlanMode>(existingPlan?.mode === "hybrid" ? "hybrid" : "manual");
  const [name, setName] = useState(existingPlan?.name ?? "");
  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const [days, setDays] = useState<StudyPlanDay[]>(() => dates.map(studyDate => ({ studyDate, tasks: existingPlan?.schedule?.find(day => day.studyDate === studyDate)?.tasks ?? [], restDay: existingPlan?.schedule?.find(day => day.studyDate === studyDate)?.restDay ?? false })));
  const [deckIds, setDeckIds] = useState<string[]>(existingPlan?.deckIds ?? (flashcards.selectedDeckId ? [flashcards.selectedDeckId] : []));
  const [targetCount, setTargetCount] = useState(10);
  const [customTitle, setCustomTitle] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [aiPlanDialog, setAiPlanDialog] = useState(false);

  useEffect(() => {
    if (!existingPlan) return;
    setMode(existingPlan.mode === "hybrid" ? "hybrid" : "manual");
    setName(existingPlan.name);
    setDeckIds(existingPlan.deckIds);
    setDays(dates.map(studyDate => ({ studyDate, tasks: existingPlan.schedule?.find(day => day.studyDate === studyDate)?.tasks ?? [], restDay: existingPlan.schedule?.find(day => day.studyDate === studyDate)?.restDay ?? false })));
  }, [dates, existingPlan?.id]);

  useEffect(() => {
    if (!openAiPlan) return;
    setAiPlanDialog(true);
    onAiPlanOpened();
  }, [onAiPlanOpened, openAiPlan]);

  const selectedDay = days.find(day => day.studyDate === selectedDate) ?? { studyDate: selectedDate, tasks: [], restDay: false };
  const updateSelectedDay = (update: Partial<StudyPlanDay>) => setDays(items => items.map(day => day.studyDate === selectedDate ? { ...day, ...update } : day));
  const toggleTask = (kind: StudyTaskKind) => {
    if (selectedDay.restDay) updateSelectedDay({ restDay: false });
    const existing = selectedDay.tasks.find(task => task.kind === kind);
    if (existing) updateSelectedDay({ tasks: selectedDay.tasks.filter(task => task.id !== existing.id) });
    else {
      const task: StudyPlanTask = kind === "flashcards"
        ? { id: `flashcards-${selectedDate}`, kind, title: t("taskFlashcards"), deckIds: deckIds.length ? deckIds : flashcards.selectedDeckId ? [flashcards.selectedDeckId] : [], targetCount }
        : kind === "quiz"
          ? { id: `quiz-${selectedDate}`, kind, title: quizzes.quizzes[0]?.title ?? t("taskQuiz"), quizId: quizzes.quizzes[0]?.id ?? null }
          : kind === "focus"
            ? { id: `focus-${selectedDate}`, kind, title: t("taskFocus"), minutes: 25 }
            : { id: `custom-${selectedDate}`, kind, title: customTitle.trim() || t("taskCustom") };
      updateSelectedDay({ tasks: [...selectedDay.tasks, task] });
    }
  };
  const hasTask = (kind: StudyTaskKind) => selectedDay.tasks.some(task => task.kind === kind);
  const updateFlashcardTask = (patch: Partial<StudyPlanTask>) => updateSelectedDay({ tasks: selectedDay.tasks.map(task => task.kind === "flashcards" ? { ...task, ...patch } : task) });
  const updateQuizTask = (quizId: string) => { const quiz = quizzes.quizzes.find(item => item.id === quizId); updateSelectedDay({ tasks: selectedDay.tasks.map(task => task.kind === "quiz" ? { ...task, quizId: quiz?.id ?? null, title: quiz?.title ?? t("taskQuiz") } : task) }); };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(""); setSaved(false);
    const schedule = days.map(day => ({ ...day, tasks: day.restDay ? [] : day.tasks }));
    const selectedDecks = [...new Set(schedule.flatMap(day => day.tasks.flatMap(task => task.kind === "flashcards" ? task.deckIds ?? [] : [])))];
    if (!schedule.some(day => day.restDay || day.tasks.length)) { setError(t("planNeedsTask")); return; }
    if (schedule.some(day => day.tasks.some(task => task.kind === "flashcards" && !task.deckIds?.length))) { setError(t("chooseStudyDecks")); return; }
    if (schedule.some(day => day.tasks.some(task => task.kind === "quiz" && !task.quizId))) { setError(t("chooseQuiz")); return; }
    try {
      const todaySchedule = schedule.find(day => day.studyDate === vietnamStudyDate());
      const sourceCards = selectedDecks.length ? await flashcards.loadCardsForDecks(selectedDecks) : [];
      const ranked = [...flashcards.due, ...sourceCards.filter(card => !flashcards.due.some(item => item.id === card.id))].filter((card, index, items) => items.findIndex(item => item.id === card.id) === index);
      let assignedCardIds: string[] = [];
      const taskCardIds: Record<string, string[]> = {};
      for (const task of todaySchedule?.tasks ?? []) {
        if (task.kind !== "flashcards") continue;
        const allowed = new Set(task.deckIds ?? selectedDecks);
        const selected = ranked.filter(card => allowed.has(card.deckId) && !assignedCardIds.includes(card.id)).slice(0, task.targetCount ?? 10);
        taskCardIds[task.id] = selected.map(card => card.id);
        assignedCardIds = [...assignedCardIds, ...selected.map(card => card.id)];
      }
      await flashcards.saveStudyPlan({ name: name.trim() || t("manualPlan"), sourceType: selectedDecks.length ? "decks" : "mixed", deckIds: selectedDecks, dailyTarget: Math.max(1, ...schedule.flatMap(day => day.tasks.filter(task => task.kind === "flashcards").map(task => task.targetCount ?? 1))), dailyMinutes: Math.max(5, ...schedule.flatMap(day => day.tasks.map(task => task.minutes ?? 5))), assignedCardIds, mode, schedule, taskCardIds });
      setSaved(true);
    } catch (err) { setError(err instanceof Error ? err.message : t("planSaveError")); }
  };

  const todayDay = flashcards.todayStudyDay;
  const todayPlanDay = existingPlan ? studyPlanDayFor(existingPlan, vietnamStudyDate()) : null;
  const completeTask = async (taskId: string) => { try { await flashcards.completeStudyTask(taskId); } catch (err) { setError(err instanceof Error ? err.message : t("taskCompleteError")); } };

  const generatePlanFile = async (file: File, maxCards: number, targetDeckId: string, options: AiGenerationOptions) => {
    if (!owner) throw new Error(t("loginRequired"));
    if (file.size > MAX_FILE_BYTES) throw new Error(t("fileTooLarge"));
    const result = await generateFlashcardsFromFile(file, maxCards, undefined, options);
    if (result.provider === "demo" || !result.cards?.length) throw new Error(t("aiDemo"));
    const targetDeck = flashcards.decks.find(deck => deck.id === targetDeckId);
    const fileResult = result as GeneratedFlashcardsFromFile;
    await saveDocumentToStorage(file, fileResult.source.id, fileResult.source.text, fileResult.source.pageCount, targetDeck?.projectId ?? undefined);
    return { title: result.title, sourceDocumentId: result.sourceDocumentId ?? fileResult.source.id, cards: result.cards.map(card => ({ ...card, id: crypto.randomUUID(), sourcePage: card.sourcePage ?? null })) };
  };
  const recommendPlan = async (cards: Flashcard[], dailyMinutes: number, options: AiGenerationOptions): Promise<StudyPlanRecommendation> => {
    const fallback = { provider: "local", model: "heuristic", dailyTarget: recommendDailyTarget(cards, dailyMinutes), focus: "balanced" as const, rationale: "Safe local recommendation" };
    if (!owner) return fallback;
    try {
      return await recommendStudyPlan(cards.map(card => ({ due: new Date(card.dueAt).getTime() <= Date.now(), repetitions: card.repetitions, lapses: card.lapses, intervalDays: card.intervalDays })), dailyMinutes, language === "vi" ? "vi" : "en", undefined, options);
    } catch {
      return fallback;
    }
  };

  return <section className="study-planner-panel"><div className="learning-section-heading"><div><span className="eyebrow">{t("studyPlan")}</span><h2>{t("designYourPath")}</h2><p>{t("manualPlanHint")}</p></div><div className="learning-section-actions">{existingPlan && <span className="plan-mode-pill">{existingPlan.mode === "hybrid" ? t("hybridPlan") : existingPlan.mode === "manual" ? t("manualPlan") : t("aiStudyPlan")}</span>}<button className="primary-button learning-hub-ai-action" onClick={() => setAiPlanDialog(true)}><Sparkles size={16}/>{t("aiStudyPlan")}</button></div></div>
    {existingPlan && todayPlanDay && <section className="today-task-editor"><div className="learning-card-heading"><div><span className="eyebrow">{t("today")}</span><h3>{t("dailyTasks")}</h3></div><strong>{todayDay?.completedTaskCount ?? 0} / {todayDay?.taskCount ?? todayPlanDay.tasks.length}</strong></div><div className="task-checklist">{todayPlanDay.tasks.map(task => { const done = !!todayDay?.completedTaskIds?.includes(task.id); const canMark = !done && task.kind !== "flashcards"; return <div className={`task-check-row ${done ? "done" : ""}`} key={task.id}><span className="task-check-icon">{done ? <CheckCircle2 size={18}/> : taskIcon(task.kind)}</span><span><strong>{task.title}</strong><small>{task.kind === "flashcards" ? `${todayDay?.taskCardIds?.[task.id]?.length ?? task.targetCount ?? 0} ${t("targetCards").toLocaleLowerCase()}` : task.minutes ? `${task.minutes} ${t("minutes")}` : t("manualTaskCompleteHint")}</small></span>{done ? <Check size={16}/> : task.kind === "flashcards" ? <small className="task-card-completion-hint">{t("taskFlashcardsHint")}</small> : <button className="secondary-button" disabled={!canMark || flashcards.busy} onClick={() => void completeTask(task.id)}>{t("markComplete")}</button>}</div>; })}</div></section>}
    <form className="study-planner-form" onSubmit={event => void save(event)}><div className="planner-form-grid"><label>{t("studyPlanName")}<input value={name} maxLength={160} onChange={event => setName(event.target.value)} placeholder={t("manualPlan")}/></label><label>{t("planMode")}<select value={mode} onChange={event => setMode(event.target.value as StudyPlanMode)}><option value="manual">{t("manualPlan")}</option><option value="hybrid">{t("hybridPlan")}</option></select></label></div><fieldset className="planner-decks"><legend>{t("chooseStudyDecks")}</legend>{flashcards.decks.map(deck => <label key={deck.id}><input type="checkbox" checked={deckIds.includes(deck.id)} onChange={() => setDeckIds(ids => ids.includes(deck.id) ? ids.filter(id => id !== deck.id) : [...ids, deck.id])}/><span>{deck.name}</span></label>)}{!flashcards.decks.length && <p className="field-hint">{t("noDecks")}</p>}</fieldset><div className="planner-date-strip">{dates.map(date => <button type="button" key={date} className={selectedDate === date ? "active" : ""} onClick={() => setSelectedDate(date)}><strong>{date === dates[0] ? t("today") : formatDay(date, language)}</strong><small>{days.find(day => day.studyDate === date)?.tasks.length ?? 0} {t("tasksShort")}</small></button>)}</div><section className="planner-day-editor"><div className="planner-day-heading"><div><span className="eyebrow">{formatDay(selectedDate, language)}</span><h3>{t("whatWillYouStudy")}</h3></div><label className="rest-day-toggle"><input type="checkbox" checked={!!selectedDay.restDay} onChange={event => updateSelectedDay({ restDay: event.target.checked, tasks: event.target.checked ? [] : selectedDay.tasks })}/>{t("restDay")}</label></div><div className="planner-task-options"><label className={hasTask("flashcards") ? "selected" : ""}><input type="checkbox" checked={hasTask("flashcards")} onChange={() => toggleTask("flashcards")}/><BookOpen size={19}/><span><strong>{t("taskFlashcards")}</strong><small>{t("taskFlashcardsHint")}</small></span></label><label className={hasTask("quiz") ? "selected" : ""}><input type="checkbox" checked={hasTask("quiz")} onChange={() => toggleTask("quiz")}/><ClipboardList size={19}/><span><strong>{t("taskQuiz")}</strong><small>{t("taskQuizHint")}</small></span></label><label className={hasTask("focus") ? "selected" : ""}><input type="checkbox" checked={hasTask("focus")} onChange={() => toggleTask("focus")}/><Gauge size={19}/><span><strong>{t("taskFocus")}</strong><small>{t("taskFocusHint")}</small></span></label><label className={hasTask("custom") ? "selected" : ""}><input type="checkbox" checked={hasTask("custom")} onChange={() => toggleTask("custom")}/><ListChecks size={19}/><span><strong>{t("taskCustom")}</strong><small>{t("taskCustomHint")}</small></span></label></div>{hasTask("flashcards") && <div className="planner-task-settings"><label>{t("taskQuantity")}<input type="number" min="1" max={maxCards} value={selectedDay.tasks.find(task => task.kind === "flashcards")?.targetCount ?? targetCount} onChange={event => { const value = Math.max(1, Math.min(maxCards, Number(event.target.value) || 1)); setTargetCount(value); updateFlashcardTask({ targetCount: value, deckIds }); }}/></label><small>{t("flashcardTaskPlanHint")}</small></div>}{hasTask("quiz") && <label>{t("chooseQuiz")}<select value={selectedDay.tasks.find(task => task.kind === "quiz")?.quizId ?? ""} onChange={event => updateQuizTask(event.target.value)}><option value="">{quizzes.quizzes.length ? t("chooseQuiz") : t("noQuizzes")}</option>{quizzes.quizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}</select></label>}{hasTask("custom") && <label>{t("taskTitle")}<input value={selectedDay.tasks.find(task => task.kind === "custom")?.title ?? customTitle} onChange={event => { setCustomTitle(event.target.value); updateSelectedDay({ tasks: selectedDay.tasks.map(task => task.kind === "custom" ? { ...task, title: event.target.value } : task) }); }}/></label>}</section>{error && <p className="form-error" role="alert">{error}</p>}{saved && <p className="form-success" role="status">{t("planSaved")}</p>}<footer className="actions"><button className="primary-button" disabled={flashcards.busy}>{flashcards.busy ? t("saving") : t("savePlan")}</button></footer></form>
  </section>;
}

function ProgressPanel({ flashcards, quizzes, language, t }: { flashcards: FlashcardStore; quizzes: QuizStore; language: string; t: ReturnType<typeof useLanguage>["t"] }) {
  const quizScore = quizzes.attempts.length ? Math.round(quizzes.attempts.reduce((sum, attempt) => sum + (attempt.total ? attempt.score / attempt.total : 0), 0) / quizzes.attempts.length * 100) : 0;
  const recentDays = flashcards.studyDays.filter(day => day.completed).slice(0, 14);
  return <section className="progress-panel"><div className="learning-section-heading"><div><span className="eyebrow">{t("progress")}</span><h2>{t("progressTitle")}</h2><p>{t("progressHint")}</p></div></div><div className="progress-kpi-grid"><article><Flame size={21}/><strong>{flashcards.streak.current}</strong><span>{t("streak")}</span></article><article><Trophy size={21}/><strong>{flashcards.streak.best}</strong><span>{t("bestStreak")}</span></article><article><BookOpen size={21}/><strong>{flashcards.studyDays.reduce((sum, day) => sum + day.reviewedCount, 0)}</strong><span>{t("cardsReviewed")}</span></article><article><ClipboardList size={21}/><strong>{quizScore}%</strong><span>{t("averageQuizScore")}</span></article></div><div className="progress-columns"><section className="learning-card"><div className="learning-card-heading"><h3>{t("studyHistory")}</h3><span>{recentDays.length}</span></div>{recentDays.length ? <ul className="progress-history">{recentDays.map(day => <li key={`${day.studyDate}-${day.contextKey}`}><span className="history-dot"><Check size={13}/></span><span><strong>{day.studyDate}</strong><small>{day.taskCount ? `${day.completedTaskCount ?? 0}/${day.taskCount} ${t("tasksShort")}` : `${day.reviewedCount} ${t("cardsReviewed").toLocaleLowerCase()}`}</small></span><b>{isStudyDayComplete(day) ? t("completed") : t("inProgress")}</b></li>)}</ul> : <div className="learning-empty-state"><BarChart3 size={26}/><p>{t("noProgressYet")}</p></div>}</section><section className="learning-card"><div className="learning-card-heading"><h3>{t("quizHistory")}</h3><span>{quizzes.attempts.length}</span></div>{quizzes.attempts.length ? <ul className="progress-history">{quizzes.attempts.slice(0, 8).map(attempt => <li key={attempt.id}><span className="history-dot quiz"><ClipboardList size={13}/></span><span><strong>{t("quizAttempt")}</strong><small>{new Date(attempt.completedAt).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US")}</small></span><b>{attempt.score}/{attempt.total}</b></li>)}</ul> : <div className="learning-empty-state"><ClipboardList size={26}/><p>{t("noQuizAttempts")}</p></div>}</section></div></section>;
}
