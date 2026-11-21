import { MusicPage } from "./MusicPlayer";
import { Music2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { BarChart3, Beaker, BookOpen, CalendarDays, Check, CheckCircle2, ArrowLeft, ArrowRight, ChevronDown, ClipboardList, FileText, Flame, Gauge, GraduationCap, Layers3, ListChecks, Plus, Sparkles, Trophy, Users, WandSparkles } from "lucide-react";
import type { Project } from "../lib/projectStore";
import type { AccountPlan } from "../lib/account";
import { useLanguage } from "../lib/i18n";
import { isStudyDayComplete, recommendDailyTarget, studyPlanDayFor, vietnamStudyDate, type Flashcard, type StudyPlanDay, type StudyPlanMode, type StudyPlanTask, type StudyTaskKind } from "../lib/flashcards";
import { useFlashcards, type FlashcardStore } from "../hooks/useFlashcards";
import { useQuizzes, type QuizStore } from "../hooks/useQuizzes";
import FlashcardsPage from "./FlashcardsPage";
import QuizPage from "./QuizPage";
import LabPage from "./LabPage";
import SharedLearningTab, { InboxBoundary } from "./SharedLearningTab";
const DocumentCreatorPage = lazy(() => import("./DocumentCreatorPage"));
import ConnectionsPage from "./ConnectionsPage";
import ClassroomsPage from "./ClassroomsPage";
import StudyPlanDialog from "./StudyPlanDialog";
import { generateFlashcardsFromFile, recommendStudyPlan, type GeneratedFlashcardsFromFile, type StudyPlanRecommendation } from "../lib/api";
import { MAX_FILE_BYTES } from "../lib/board";
import { saveDocumentToStorage } from "../lib/supabase";
import type { AiGenerationOptions } from "../lib/aiOptions";
import { emitGuideAction, GUIDE_REQUEST_EVENT } from "../lib/featureGuides";
import DocumentToolsPage from "./DocumentToolsPage";
import type { UploadedDocument } from "../lib/documentStore";
import { LearningNavigationProvider, LearningToolScope, useLearningNavigation, type HubTab } from "../lib/learningNavigation";

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

type LearningHubProps = { owner: string | null; projects: Project[]; documents?: UploadedDocument[]; onDocumentsChanged?: () => void; accountPlan?: AccountPlan; initialTab?: HubTab; initialPeerId?: string; initialClassId?: string };
export default function LearningHubPage(props: LearningHubProps) {
  return <LearningNavigationProvider key={props.owner ?? "guest"} owner={props.owner} initialTab={props.initialTab}><LearningSpace {...props}/></LearningNavigationProvider>;
}
function LearningSpace({ owner, projects, documents = [], onDocumentsChanged = () => undefined, accountPlan, initialPeerId, initialClassId }: LearningHubProps) {
  const { t, language } = useLanguage();
  const flashcards = useFlashcards(owner);
  const quizzes = useQuizzes(owner);
  const navigation = useLearningNavigation(), tab = navigation.route.tab;
  const [openAiPlan, setOpenAiPlan] = useState(false);
  const pickerRef = useRef<HTMLDetailsElement>(null), rootRef = useRef<HTMLElement>(null);
  const today = vietnamStudyDate();
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root || document.querySelector("dialog[open]")) return;
      root.scrollIntoView?.({ block: "start" });
      const scope = tab === "overview" ? root : root.querySelector(`[data-learning-tool="${tab}"]`);
      const heading = scope?.querySelector<HTMLElement>("h1,h2");
      heading?.setAttribute("tabindex", "-1"); heading?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tab]);

  useEffect(() => {
    const close = (event: Event) => {
      const picker = pickerRef.current;
      if (!picker?.open) return;
      if (event instanceof KeyboardEvent && event.key === "Escape") { picker.open = false; picker.querySelector<HTMLElement>("summary")?.focus(); }
      else if (event.type === "pointerdown" && event.target instanceof Node && !picker.contains(event.target)) picker.open = false;
    };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);

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
    { id: "exams", label: language === "vi" ? "Tạo tài liệu" : "Create documents", icon: FileText },
    { id: "plan", label: t("studyPlan"), icon: CalendarDays },
    { id: "progress", label: t("progress"), icon: BarChart3 },
    { id: "lab", label: t("labNav"), icon: Beaker },
    { id: "tools", label: language === "vi" ? "Tài liệu" : "Documents", icon: FileText },
    { id: "shared", label: language === "vi" ? "Được chia sẻ với tôi" : "Shared with me", icon: BookOpen },
    { id: "connections", label: language === "vi" ? "Bạn bè & tin nhắn" : "Friends & messages", icon: Users },
    { id: "classrooms", label: language === "vi" ? "Lớp học" : "Classrooms", icon: GraduationCap },
    { id: "music", label: language === "vi" ? "Nhạc tập trung" : "Focus music", icon: Music2 },
  ];
  const pickTab = (id: HubTab) => {
    navigation.go(id);
    if (pickerRef.current) pickerRef.current.open = false;
    emitGuideAction(`learning:tab:${id}`);
    if (id === "tools") window.dispatchEvent(new CustomEvent(GUIDE_REQUEST_EVENT, { detail: { guideId: "document-tools" } }));
  };
  const tabGroups: Array<{ title: string; ids: HubTab[] }> = [
    { title: language === "vi" ? "Học" : "Study", ids: ["overview", "flashcards", "quiz", "exams", "lab"] },
    { title: language === "vi" ? "Tài nguyên" : "Resources", ids: ["tools", "shared"] },
    { title: language === "vi" ? "Lịch học" : "Schedule", ids: ["plan", "progress", "music"] },
    { title: language === "vi" ? "Cộng tác" : "Collaborate", ids: ["connections", "classrooms"] },
  ];

  const renderTool = (id: HubTab) => {
    switch (id) {
      case "flashcards": return <FlashcardsPage owner={owner} projects={projects} accountPlan={accountPlan} store={flashcards}/>;
      case "quiz": return <QuizPage owner={owner} store={quizzes} accountPlan={accountPlan} onQuizCompleted={onQuizCompleted}/>;
      case "exams": return <InboxBoundary key={owner} fallback={<section role="alert"><p>{language === "vi" ? "Không thể tải mục tạo tài liệu." : "Could not load document studio."}</p><button className="secondary-button" onClick={() => window.location.reload()}>{t("retry")}</button></section>}><Suspense fallback={<p role="status">{t("loading")}</p>}><DocumentCreatorPage key={owner} owner={owner} documents={documents} onDocumentsChanged={onDocumentsChanged} quizzes={quizzes} accountPlan={accountPlan} onOpenQuiz={() => pickTab("quiz")}/></Suspense></InboxBoundary>;
      case "plan": return <StudyPlannerPanel owner={owner} maxCards={accountPlan?.maxCards ?? 50} openAiPlan={openAiPlan} onAiPlanOpened={() => setOpenAiPlan(false)} flashcards={flashcards} quizzes={quizzes} language={language} t={t}/>;
      case "progress": return <ProgressPanel flashcards={flashcards} quizzes={quizzes} language={language} t={t}/>;
      case "lab": return <LabPage owner={owner} embedded accountPlan={accountPlan}/>;
      case "tools": return <DocumentToolsPage owner={owner} documents={documents} onDocumentsChanged={onDocumentsChanged} accountPlan={accountPlan}/>;
      case "music": return <MusicPage/>;
      case "connections": return <ConnectionsPage owner={owner} initialPeerId={initialPeerId} onOpenShared={() => pickTab("shared")}/>;
      case "classrooms": return <ClassroomsPage owner={owner} initialClassId={initialClassId} quizzes={quizzes.quizzes}/>;
      case "shared": return <SharedLearningTab owner={owner} onSaved={kind => {
        if (kind === "quiz") void quizzes.refresh();
        if (kind === "flashcard") void flashcards.refreshDecks();
        if (kind === "document") onDocumentsChanged();
      }}/>;
      default: return null;
    }
  };
  return <section ref={rootRef} className={`learning-hub-page learning-space ${tab === "overview" ? "learning-space-home" : "learning-space-tool"}`}>
    {tab === "overview" ? <>
      <header className="learning-space-heading"><div><h1>{t("learningHub")}</h1><p>{language === "vi" ? "Hôm nay bạn muốn học gì?" : "What would you like to learn today?"}</p></div><div className="learning-space-streak"><Flame size={17}/><span>{flashcards.streak.current} {t("streakDays")}</span></div></header>
      <HubOverview flashcards={flashcards} quizzes={quizzes} onTab={pickTab} lastTool={navigation.lastTool} onOpenAiPlan={() => { setOpenAiPlan(true); pickTab("plan"); }} t={t} language={language}/>
    </> : <div className="learning-space-toolbar">
      <button type="button" className="learning-space-back" onClick={() => pickTab("overview")}><ArrowLeft size={16}/>{language === "vi" ? "Về không gian học tập" : "Back to Learning Space"}</button>
      <details ref={pickerRef} className="learning-tool-picker"><summary>{language === "vi" ? "Công cụ" : "Tools"}<ChevronDown size={15}/></summary><nav aria-label={language === "vi" ? "Chuyển công cụ học tập" : "Switch learning tools"}>{tabGroups.map(group => <section key={group.title}><strong>{group.title}</strong>{group.ids.filter(id => id !== "overview").map(id => { const item = tabs.find(candidate => candidate.id === id)!; return <button type="button" key={id} className={id === "tools" ? "learning-tools-tab" : ""} data-guide-tab={id} data-help-id={`learning-tab-${id}`} aria-current={tab === id ? "page" : undefined} onClick={() => pickTab(id)}><item.icon size={16}/>{item.label}</button>; })}</section>)}</nav></details>
    </div>}
    {tabs.filter(item => item.id !== "overview" && navigation.visited.has(item.id)).map(item => <LearningToolScope key={item.id} tab={item.id} active={tab === item.id}>{renderTool(item.id)}</LearningToolScope>)}
  </section>;
}

function HubOverview({ flashcards, quizzes, onTab, lastTool, onOpenAiPlan, t, language }: { flashcards: FlashcardStore; quizzes: QuizStore; onTab: (tab: HubTab) => void; lastTool: HubTab | null; onOpenAiPlan: () => void; t: ReturnType<typeof useLanguage>["t"]; language: string }) {
  const vi = language === "vi", plan = flashcards.activeStudyPlan;
  const planDay = plan ? studyPlanDayFor(plan, vietnamStudyDate()) : null;
  const tasks = planDay?.tasks ?? [], done = flashcards.todayStudyDay?.completedTaskIds ?? [];
  const primary = [
    { id: "flashcards" as const, title: t("flashcards"), description: vi ? "Ghi nhớ kiến thức qua các bộ thẻ." : "Remember more with your flashcard decks.", icon: BookOpen, count: flashcards.decks.length },
    { id: "quiz" as const, title: t("quiz"), description: vi ? "Luyện tập và tự kiểm tra kiến thức." : "Practice and test your understanding.", icon: ClipboardList, count: quizzes.quizzes.length },
    { id: "exams" as const, title: vi ? "Tạo tài liệu" : "Create documents", description: vi ? "Takenote, bài học HTML và đề thi bằng AI." : "Create notes, HTML lessons and exams with AI.", icon: FileText },
    { id: "lab" as const, title: t("labNav"), description: vi ? "Khám phá kiến thức bằng thực hành." : "Explore ideas through hands-on learning.", icon: Beaker },
  ];
  const secondary = [
    { title: vi ? "Tài nguyên" : "Resources", items: [{ id: "tools" as const, title: vi ? "Tài liệu" : "Documents", icon: FileText }, { id: "shared" as const, title: vi ? "Được chia sẻ với tôi" : "Shared with me", icon: BookOpen }] },
    { title: vi ? "Kế hoạch & tiến độ" : "Plan & progress", items: [{ id: "plan" as const, title: t("studyPlan"), icon: CalendarDays }, { id: "progress" as const, title: t("progress"), icon: BarChart3 }, { id: "music" as const, title: vi ? "Nhạc tập trung" : "Focus music", icon: Music2 }] },
    { title: vi ? "Kết nối" : "Connect", items: [{ id: "classrooms" as const, title: vi ? "Lớp học" : "Classrooms", icon: GraduationCap }, { id: "connections" as const, title: vi ? "Bạn bè & tin nhắn" : "Friends & messages", icon: Users }] },
  ];
  const names: Record<HubTab, string> = { overview: t("learningHub"), flashcards: t("flashcards"), quiz: t("quiz"), exams: vi ? "Tạo tài liệu" : "Create documents", lab: t("labNav"), tools: vi ? "Tài liệu" : "Documents", shared: vi ? "Được chia sẻ" : "Shared", plan: t("studyPlan"), progress: t("progress"), music: vi ? "Nhạc" : "Music", connections: vi ? "Bạn bè" : "Friends", classrooms: vi ? "Lớp học" : "Classrooms" };
  return <div className="learning-space-home-content">
    {lastTool && <section className="learning-resume"><div><span>{vi ? "MỞ GẦN ĐÂY" : "RECENTLY OPENED"}</span><h2>{names[lastTool]}</h2></div><button className="primary-button" onClick={() => onTab(lastTool)}>{vi ? "Tiếp tục" : "Continue"}<ArrowRight size={17}/></button></section>}
    {plan && tasks.length > 0 && <section className="learning-today"><div className="learning-today-heading"><div><span>{t("today")}</span><h2>{plan.name}</h2></div><button className="text-button" onClick={() => onTab("plan")}>{t("viewDetails")}</button></div><ul>{tasks.map(task => <li key={task.id}>{done.includes(task.id) ? <CheckCircle2 size={17}/> : taskIcon(task.kind)}<span>{task.title}</span>{done.includes(task.id) && <small>{t("completed")}</small>}</li>)}</ul></section>}
    <section className="learning-primary-tools" aria-label={vi ? "Công cụ học tập" : "Learning tools"}>{primary.map(item => <button type="button" key={item.id} data-guide-tab={item.id} data-help-id={`learning-tab-${item.id}`} onClick={() => onTab(item.id)}><span className={`learning-tool-icon ${item.id}`}><item.icon size={23}/></span><h2>{item.title}</h2><p>{item.description}</p><span className="learning-tool-footer">{item.count !== undefined && item.count > 0 ? `${item.count} ${item.id === "quiz" ? (vi ? "đề đã lưu" : "saved quizzes") : (vi ? "bộ thẻ" : "decks")}` : (vi ? "Mở công cụ" : "Open tool")}<ArrowRight size={17}/></span></button>)}</section>
    <div className="learning-secondary-groups">{secondary.map(group => <section key={group.title}><h2>{group.title}</h2>{group.items.map(item => <button type="button" key={item.id} className={item.id === "tools" ? "learning-tools-tab" : ""} data-guide-tab={item.id} data-help-id={`learning-tab-${item.id}`} onClick={() => onTab(item.id)}><item.icon size={18}/><span>{item.title}</span><ArrowRight size={15}/></button>)}</section>)}</div>
    {!plan && <button className="text-button learning-plan-link" onClick={onOpenAiPlan}><WandSparkles size={16}/>{vi ? "Lên kế hoạch học với AI" : "Plan your learning with AI"}</button>}
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
    <form className="study-planner-form" onSubmit={event => void save(event)}><div className="planner-form-grid"><label>{t("studyPlanName")}<input value={name} maxLength={160} onChange={event => setName(event.target.value)} placeholder={t("manualPlan")}/></label><label>{t("planMode")}<select value={mode} onChange={event => setMode(event.target.value as StudyPlanMode)}><option value="manual">{t("manualPlan")}</option><option value="hybrid">{t("hybridPlan")}</option></select></label></div><fieldset className="planner-decks"><legend>{t("chooseStudyDecks")}</legend>{flashcards.decks.map(deck => <label key={deck.id}><input type="checkbox" checked={deckIds.includes(deck.id)} onChange={() => setDeckIds(ids => ids.includes(deck.id) ? ids.filter(id => id !== deck.id) : [...ids, deck.id])}/><span>{deck.name}</span></label>)}{!flashcards.decks.length && <p className="field-hint">{t("noDecks")}</p>}</fieldset><div className="planner-date-strip">{dates.map(date => <button type="button" key={date} className={selectedDate === date ? "active" : ""} onClick={() => setSelectedDate(date)}><strong>{date === dates[0] ? t("today") : formatDay(date, language)}</strong><small>{days.find(day => day.studyDate === date)?.tasks.length ?? 0} {t("tasksShort")}</small></button>)}</div><section className="planner-day-editor"><div className="planner-day-heading"><div><span className="eyebrow">{formatDay(selectedDate, language)}</span><h3>{t("whatWillYouStudy")}</h3></div><label className="rest-day-toggle"><input type="checkbox" checked={!!selectedDay.restDay} onChange={event => updateSelectedDay({ restDay: event.target.checked, tasks: event.target.checked ? [] : selectedDay.tasks })}/>{t("restDay")}</label></div><div className="planner-task-options"><label className={hasTask("flashcards") ? "selected" : ""}><input type="checkbox" checked={hasTask("flashcards")} onChange={() => toggleTask("flashcards")}/><BookOpen size={19}/><span><strong>{t("taskFlashcards")}</strong><small>{t("taskFlashcardsHint")}</small></span></label><label className={hasTask("quiz") ? "selected" : ""}><input type="checkbox" checked={hasTask("quiz")} onChange={() => toggleTask("quiz")}/><ClipboardList size={19}/><span><strong>{t("taskQuiz")}</strong><small>{t("taskQuizHint")}</small></span></label><label className={hasTask("focus") ? "selected" : ""}><input type="checkbox" checked={hasTask("focus")} onChange={() => toggleTask("focus")}/><Gauge size={19}/><span><strong>{t("taskFocus")}</strong><small>{t("taskFocusHint")}</small></span></label><label className={hasTask("custom") ? "selected" : ""}><input type="checkbox" checked={hasTask("custom")} onChange={() => toggleTask("custom")}/><ListChecks size={19}/><span><strong>{t("taskCustom")}</strong><small>{t("taskCustomHint")}</small></span></label></div>{hasTask("flashcards") && <div className="planner-task-settings"><label>{t("taskQuantity")}<input type="number" min="1" max={maxCards} value={selectedDay.tasks.find(task => task.kind === "flashcards")?.targetCount ?? targetCount} onChange={event => { const value = Math.max(1, Math.min(maxCards, Number(event.target.value) || 1)); setTargetCount(value); updateFlashcardTask({ targetCount: value, deckIds }); }}/></label><small>{t("flashcardTaskPlanHint")}</small></div>}{hasTask("quiz") && <label>{t("chooseQuiz")}<select value={selectedDay.tasks.find(task => task.kind === "quiz")?.quizId ?? ""} onChange={event => updateQuizTask(event.target.value)}><option value="">{quizzes.quizzes.length ? t("chooseQuiz") : t("noQuizzes")}</option>{quizzes.quizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}</select></label>}{hasTask("custom") && <label>{t("taskTitle")}<input value={selectedDay.tasks.find(task => task.kind === "custom" )?.title ?? customTitle} onChange={event => { setCustomTitle(event.target.value); updateSelectedDay({ tasks: selectedDay.tasks.map(task => task.kind === "custom" ? { ...task, title: event.target.value } : task) }); }}/></label>}</section>{error && <p className="form-error" role="alert">{error}</p>}{saved && <p className="form-success" role="status">{t("planSaved")}</p>}<footer className="actions"><button className="primary-button" disabled={flashcards.busy}>{flashcards.busy ? t("saving") : t("savePlan")}</button></footer></form>
    {aiPlanDialog && <StudyPlanDialog owner={owner} decks={flashcards.decks} quizzes={quizzes.quizzes} selectedDeckId={flashcards.selectedDeckId} maxCards={maxCards} onClose={() => setAiPlanDialog(false)} onLoadCards={flashcards.loadCardsForDecks} onGenerateFile={generatePlanFile} onCreateCards={flashcards.createCardsForDeck} onRecommend={recommendPlan} onSavePlan={flashcards.saveStudyPlan}/>}
  </section>;
}

function ProgressPanel({ flashcards, quizzes, language, t }: { flashcards: FlashcardStore; quizzes: QuizStore; language: string; t: ReturnType<typeof useLanguage>["t"] }) {
  const quizScore = quizzes.attempts.length ? Math.round(quizzes.attempts.reduce((sum, attempt) => sum + (attempt.total ? attempt.score / attempt.total : 0), 0) / quizzes.attempts.length * 100) : 0;
  const recentDays = flashcards.studyDays.filter(day => day.completed).slice(0, 14);
  return <section className="progress-panel"><div className="learning-section-heading"><div><span className="eyebrow">{t("progress")}</span><h2>{t("progressTitle")}</h2><p>{t("progressHint")}</p></div></div><div className="progress-kpi-grid"><article><Flame size={21}/><strong>{flashcards.streak.current}</strong><span>{t("streak")}</span></article><article><Trophy size={21}/><strong>{flashcards.streak.best}</strong><span>{t("bestStreak")}</span></article><article><BookOpen size={21}/><strong>{flashcards.studyDays.reduce((sum, day) => sum + day.reviewedCount, 0)}</strong><span>{t("cardsReviewed")}</span></article><article><ClipboardList size={21}/><strong>{quizScore}%</strong><span>{t("averageQuizScore")}</span></article></div><div className="progress-columns"><section className="learning-card"><div className="learning-card-heading"><h3>{t("studyHistory")}</h3><span>{recentDays.length}</span></div>{recentDays.length ? <ul className="progress-history">{recentDays.map(day => <li key={`${day.studyDate}-${day.contextKey}`}><span className="history-dot"><Check size={13}/></span><span><strong>{day.studyDate}</strong><small>{day.taskCount ? `${day.completedTaskCount ?? 0}/${day.taskCount} ${t("tasksShort")}` : `${day.reviewedCount} ${t("cardsReviewed").toLocaleLowerCase()}`}</small></span><b>{isStudyDayComplete(day) ? t("completed") : t("inProgress")}</b></li>)}</ul> : <div className="learning-empty-state"><BarChart3 size={26}/><p>{t("noProgressYet")}</p></div>}</section><section className="learning-card"><div className="learning-card-heading"><h3>{t("quizHistory")}</h3><span>{quizzes.attempts.length}</span></div>{quizzes.attempts.length ? <ul className="progress-history">{quizzes.attempts.slice(0, 8).map(attempt => <li key={attempt.id}><span className="history-dot quiz"><ClipboardList size={13}/></span><span><strong>{t("quizAttempt")}</strong><small>{new Date(attempt.completedAt).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US")}</small></span><b>{attempt.score}/{attempt.total}</b></li>)}</ul> : <div className="learning-empty-state"><ClipboardList size={26}/><p>{t("noQuizAttempts")}</p></div>}</section></div></section>;
}
