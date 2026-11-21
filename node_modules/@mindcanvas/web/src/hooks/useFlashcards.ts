import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createDeck as makeDeck,
  createFlashcard as makeCard,
  createStudyPlan as makeStudyPlan,
  applyStudyEventToTasks,
  computeStreak,
  dueCards,
  isStudyDayComplete,
  studyContextKey,
  studyPlanDayFor,
  vietnamStudyDate,
  type StudyDayProgress,
  type StudyEvent,
  type StudyPlan,
  scheduleReview,
  type Flashcard,
  type FlashcardDeck,
  type FlashcardRating,
  type FlashcardStorage,
} from "../lib/flashcards";
import {
  deleteFlashcard,
  deleteFlashcardDeck,
  fetchFlashcardDecks,
  fetchFlashcards,
  fetchStudyDays,
  fetchStudyPlans,
  upsertStudyDay,
  upsertStudyPlan,
  recordFlashcardStudy,
  saveStudyDay,
  upsertFlashcard,
  upsertFlashcards,
  upsertFlashcardDeck,
} from "../lib/projectStore";
import { listMyLearningCopySources } from "../lib/learningShare";

export type FlashcardPatch = Partial<Pick<Flashcard, "front" | "back" | "sourcePage">>;

export function useFlashcards(owner: string | null) {
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageMode, setStorageMode] = useState<FlashcardStorage>(owner ? "cloud" : "local");
  const [studyPlans, setStudyPlans] = useState<StudyPlan[]>([]);
  const [studyDays, setStudyDays] = useState<StudyDayProgress[]>([]);
  const [studyLoading, setStudyLoading] = useState(true);
  const [studySource, setStudySource] = useState<FlashcardStorage>(owner ? "cloud" : "local");

  const selectedDeck = useMemo(() => decks.find(deck => deck.id === selectedDeckId) ?? null, [decks, selectedDeckId]);
  const today = vietnamStudyDate();
  const activeStudyPlan = useMemo(() => studyPlans.find(plan => plan.status === "active" && plan.startDate <= today) ?? null, [studyPlans, today]);
  const todayStudyDay = useMemo(() => {
    const context = studyContextKey(activeStudyPlan?.id);
    return studyDays.find(day => day.studyDate === today && day.contextKey === context) ?? null;
  }, [activeStudyPlan?.id, studyDays, today]);
  const streak = useMemo(() => computeStreak(studyDays, new Date(), activeStudyPlan?.id ?? null), [activeStudyPlan?.id, studyDays, today]);

  const refreshDecks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [result, savedSources] = await Promise.all([
        fetchFlashcardDecks(owner), owner ? listMyLearningCopySources().catch(() => []) : Promise.resolve([]),
      ]);
      const sources = new Map(savedSources.filter(item => item.kind === "flashcard").map(item => [item.copy_id, { title: item.source_title, ownerName: item.owner_name }]));
      const decksWithSources = result.items.map(item => ({ ...item, savedFrom: sources.get(item.id) }));
      setDecks(decksWithSources);
      setStorageMode(result.source);
      setSelectedDeckId(current => decksWithSources.some(deck => deck.id === current) ? current : decksWithSources[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load flashcards.");
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => { void refreshDecks(); }, [refreshDecks]);

  const refreshStudy = useCallback(async () => {
    setStudyLoading(true);
    try {
      const [plans, days] = await Promise.all([fetchStudyPlans(owner), fetchStudyDays(owner)]);
      setStudyPlans(plans.items);
      setStudyDays(days.items);
      setStudySource(plans.source === "cloud" || days.source === "cloud" ? "cloud" : "local");
    } finally {
      setStudyLoading(false);
    }
  }, [owner]);

  useEffect(() => { void refreshStudy(); }, [refreshStudy]);

  useEffect(() => {
    let alive = true;
    if (!selectedDeckId) { setCards([]); setCardsLoading(false); return () => { alive = false; }; }
    setCardsLoading(true);
    setError("");
    void fetchFlashcards(owner, selectedDeckId).then(result => {
      if (!alive) return;
      setCards(result.items);
      setStorageMode(result.source);
    }).catch(err => { if (alive) setError(err instanceof Error ? err.message : "Could not load cards."); })
      .finally(() => { if (alive) setCardsLoading(false); });
    return () => { alive = false; };
  }, [owner, selectedDeckId]);

  const createDeck = useCallback(async (name: string, projectId: string | null = null, folderId: string | null = null) => {
    const deck = makeDeck(name, projectId, folderId);
    setBusy(true); setError("");
    try {
      const source = await upsertFlashcardDeck(owner, deck);
      setStorageMode(source);
      setDecks(items => [{ ...deck, source }, ...items]);
      setSelectedDeckId(deck.id);
      return deck;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create deck.");
      throw err;
    } finally { setBusy(false); }
  }, [owner]);

  const renameDeck = useCallback(async (deck: FlashcardDeck, name: string) => {
    const next = { ...deck, name: name.trim(), updatedAt: new Date().toISOString() };
    setBusy(true); setError("");
    try {
      const source = await upsertFlashcardDeck(owner, next);
      setStorageMode(source);
      setDecks(items => items.map(item => item.id === deck.id ? { ...next, source } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename deck.");
      throw err;
    } finally { setBusy(false); }
  }, [owner]);

  const removeDeck = useCallback(async (deck: FlashcardDeck) => {
    setBusy(true); setError("");
    try {
      const source = await deleteFlashcardDeck(owner, deck.id);
      setStorageMode(source);
      setDecks(items => {
        const next = items.filter(item => item.id !== deck.id);
        setSelectedDeckId(current => current === deck.id ? next[0]?.id ?? null : current);
        return next;
      });
      if (selectedDeckId === deck.id) setCards([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete deck.");
      throw err;
    } finally { setBusy(false); }
  }, [owner, selectedDeckId]);

  const createCardsForDeck = useCallback(async (deckId: string, inputs: Array<{ front: string; back: string; sourcePage?: number | null }>) => {
    const deck = decks.find(item => item.id === deckId);
    if (!deck) throw new Error("Choose a deck first.");
    if (!inputs.length) return [];
    const cards = inputs.map(input => makeCard(deck.id, input.front, input.back, deck.projectId, input.sourcePage ?? null));
    setBusy(true); setError("");
    try {
      const source = await upsertFlashcards(owner, cards);
      const saved = cards.map(card => ({ ...card, source }));
      setStorageMode(source);
      if (deck.id === selectedDeckId) setCards(items => [...items, ...saved]);
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create cards.");
      throw err;
    } finally { setBusy(false); }
  }, [decks, owner, selectedDeckId]);

  const createCards = useCallback(async (inputs: Array<{ front: string; back: string; sourcePage?: number | null }>) => {
    if (!selectedDeck) throw new Error("Choose a deck first.");
    return createCardsForDeck(selectedDeck.id, inputs);
  }, [createCardsForDeck, selectedDeck]);

  const createCard = useCallback(async (front: string, back: string, sourcePage: number | null = null) => {
    const [card] = await createCards([{ front, back, sourcePage }]);
    return card;
  }, [createCards]);

  const updateCard = useCallback(async (card: Flashcard, patch: FlashcardPatch) => {
    const next = { ...card, ...patch, front: patch.front?.trim() ?? card.front, back: patch.back?.trim() ?? card.back, updatedAt: new Date().toISOString() };
    setBusy(true); setError("");
    try {
      const source = await upsertFlashcard(owner, next);
      setStorageMode(source);
      setCards(items => items.map(item => item.id === card.id ? { ...next, source } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update card.");
      throw err;
    } finally { setBusy(false); }
  }, [owner]);

  const removeCard = useCallback(async (card: Flashcard) => {
    setBusy(true); setError("");
    try {
      const source = await deleteFlashcard(owner, card);
      setStorageMode(source);
      setCards(items => items.filter(item => item.id !== card.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete card.");
      throw err;
    } finally { setBusy(false); }
  }, [owner]);

  const reviewCard = useCallback(async (card: Flashcard, rating: FlashcardRating) => {
    const next = scheduleReview(card, rating);
    setBusy(true); setError("");
    try {
      const source = await upsertFlashcard(owner, next);
      setStorageMode(source);
      setCards(items => items.map(item => item.id === card.id ? { ...next, source } : item));
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save review.");
      throw err;
    } finally { setBusy(false); }
  }, [owner]);

  const loadCardsForDecks = useCallback(async (deckIds: string[]) => {
    const uniqueIds = [...new Set(deckIds)].filter(id => decks.some(deck => deck.id === id));
    const results = await Promise.all(uniqueIds.map(id => fetchFlashcards(owner, id)));
    if (results.some(result => result.source === "cloud")) setStorageMode("cloud");
    return results.flatMap(result => result.items);
  }, [decks, owner]);

  const saveStudyPlan = useCallback(async (input: {
    name: string;
    sourceType: StudyPlan["sourceType"];
    deckIds: string[];
    sourceDocumentId?: string | null;
    dailyTarget: number;
    dailyMinutes: number;
    assignedCardIds: string[];
    mode?: StudyPlan["mode"];
    schedule?: StudyPlan["schedule"];
    taskCardIds?: Record<string, string[]>;
  }) => {
    const plan = makeStudyPlan(input);
    const previous = studyPlans.find(item => item.status === "active" && item.id !== plan.id);
    setBusy(true); setError("");
    try {
      if (previous) {
        const paused = { ...previous, status: "paused" as const, updatedAt: new Date().toISOString() };
        await upsertStudyPlan(owner, paused);
        setStudyPlans(items => items.map(item => item.id === paused.id ? paused : item));
      }
      const source = await upsertStudyPlan(owner, plan);
      setStudySource(source);
      const timestamp = new Date().toISOString();
      const assigned = [...new Set(input.assignedCardIds)];
      const scheduleDay = studyPlanDayFor(plan, plan.startDate);
      const taskIds = scheduleDay?.tasks.map(task => task.id) ?? [];
      const taskCardIds = input.taskCardIds ?? {};
      const day: StudyDayProgress = {
        studyDate: plan.startDate,
        contextKey: studyContextKey(plan.id),
        planId: plan.id,
        targetCount: Math.max(1, Math.min(plan.dailyTarget, assigned.length || plan.dailyTarget)),
        reviewedCount: 0,
        retryCount: 0,
        assignedCardIds: assigned,
        reviewedCardIds: [],
        forgottenCardIds: [],
        completed: scheduleDay?.restDay === true || (!scheduleDay && assigned.length === 0),
        firstReviewAt: null,
        lastReviewAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        taskIds,
        completedTaskIds: [],
        taskCardIds,
        taskCount: taskIds.length || undefined,
        completedTaskCount: 0,
        restDay: scheduleDay?.restDay ?? false,
      };
      const savedDay = await upsertStudyDay(owner, day);
      setStudyPlans(items => [plan, ...items.filter(item => item.id !== plan.id)]);
      setStudyDays(items => [savedDay.item, ...items.filter(item => studyDayKey(item) !== studyDayKey(savedDay.item))]);
      return plan;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create study plan.");
      throw err;
    } finally {
      setBusy(false);
    }
  }, [owner, studyPlans]);

  const ensureStudyPlanDay = useCallback(async (plan: StudyPlan, sourceCards: Flashcard[]) => {
    const existing = studyDays.find(day => day.studyDate === today && day.contextKey === studyContextKey(plan.id));
    if (existing) return existing;
    const scheduleDay = studyPlanDayFor(plan, today);
    const due = dueCards(sourceCards);
    const difficult = sourceCards.filter(card => card.lapses > 0).sort((a, b) => b.lapses - a.lapses);
    const remaining = sourceCards.filter(card => !due.some(item => item.id === card.id) && !difficult.some(item => item.id === card.id));
    const ranked = [...new Map([...due, ...difficult, ...remaining].map(card => [card.id, card])).values()];
    const taskCardIds: Record<string, string[]> = {};
    const taskIds = scheduleDay?.tasks.map(task => task.id) ?? [];
    let assigned: string[] = [];
    if (scheduleDay) {
      for (const task of scheduleDay.tasks) {
        if (task.kind !== "flashcards") continue;
        const allowedDecks = task.deckIds?.length ? new Set(task.deckIds) : null;
        const limit = Math.max(1, Math.min(500, task.targetCount ?? plan.dailyTarget));
        const taskCards = ranked.filter(card => (!allowedDecks || allowedDecks.has(card.deckId)) && !assigned.includes(card.id)).slice(0, limit);
        taskCardIds[task.id] = taskCards.map(card => card.id);
        assigned = [...assigned, ...taskCards.map(card => card.id)];
      }
    } else {
      assigned = ranked.slice(0, plan.dailyTarget).map(card => card.id);
    }
    const target = scheduleDay?.tasks.filter(task => task.kind === "flashcards").reduce((sum, task) => sum + (taskCardIds[task.id]?.length ?? 0), 0) || (assigned.length || plan.dailyTarget);
    const restDay = scheduleDay?.restDay ?? false;
    const timestamp = new Date().toISOString();
    const day: StudyDayProgress = {
      studyDate: today,
      contextKey: studyContextKey(plan.id),
      planId: plan.id,
      targetCount: Math.max(1, Math.min(plan.dailyTarget, target)),
      reviewedCount: 0,
      retryCount: 0,
      assignedCardIds: assigned,
      reviewedCardIds: [],
      forgottenCardIds: [],
      completed: restDay || (!scheduleDay && !taskIds.length && assigned.length === 0),
      firstReviewAt: null,
      lastReviewAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      taskIds,
      completedTaskIds: [],
      taskCardIds,
      taskCount: taskIds.length || undefined,
      completedTaskCount: 0,
      restDay,
    };
    const saved = await upsertStudyDay(owner, day);
    setStudyDays(items => [saved.item, ...items.filter(item => studyDayKey(item) !== studyDayKey(saved.item))]);
    setStudySource(saved.source);
    return saved.item;
  }, [owner, studyDays, today]);

  const recordStudy = useCallback(async (event: StudyEvent) => {
    const result = await recordFlashcardStudy(owner, event);
    const previous = studyDays.find(day => studyDayKey(day) === studyDayKey(result.item));
    const taskAware = applyStudyEventToTasks(previous ? { ...result.item, taskIds: result.item.taskIds?.length ? result.item.taskIds : previous.taskIds, completedTaskIds: result.item.completedTaskIds?.length ? result.item.completedTaskIds : previous.completedTaskIds, taskCardIds: Object.keys(result.item.taskCardIds ?? {}).length ? result.item.taskCardIds : previous.taskCardIds, taskCount: result.item.taskCount ?? previous.taskCount, completedTaskCount: result.item.completedTaskCount ?? previous.completedTaskCount, restDay: result.item.restDay ?? previous.restDay } : result.item, event);
    const needsTaskSave = !!taskAware.taskIds?.length || !!taskAware.restDay;
    const saved = needsTaskSave ? await saveStudyDay(owner, { ...taskAware, updatedAt: new Date().toISOString() }) : { item: taskAware, source: result.source };
    setStudyDays(items => [saved.item, ...items.filter(item => studyDayKey(item) !== studyDayKey(saved.item))]);
    setStudySource(saved.source);
    return saved.item;
  }, [owner, studyDays]);

  const completeStudyTask = useCallback(async (taskId: string, studyDate = today) => {
    const plan = studyPlans.find(item => item.status === "active" && item.startDate <= studyDate);
    if (!plan) throw new Error("No active study plan.");
    let day = studyDays.find(item => item.studyDate === studyDate && item.contextKey === studyContextKey(plan.id));
    if (!day) {
      const sourceCards = await loadCardsForDecks(plan.deckIds);
      if (studyDate !== today) throw new Error("Open this study day before marking its tasks complete.");
      day = await ensureStudyPlanDay(plan, sourceCards);
    }
    if (day.taskIds?.length && !day.taskIds.includes(taskId)) throw new Error("This task is not part of the selected study day.");
    const completedTaskIds = [...new Set([...(day.completedTaskIds ?? []), taskId])];
    const next = { ...day, completedTaskIds, completedTaskCount: completedTaskIds.length, completed: isStudyDayComplete({ ...day, completedTaskIds }), updatedAt: new Date().toISOString() };
    const saved = await saveStudyDay(owner, next);
    setStudyDays(items => [saved.item, ...items.filter(item => studyDayKey(item) !== studyDayKey(saved.item))]);
    setStudySource(saved.source);
    return saved.item;
  }, [ensureStudyPlanDay, loadCardsForDecks, owner, studyDays, studyPlans, today]);

  return {
    decks,
    selectedDeck,
    selectedDeckId,
    setSelectedDeckId,
    cards,
    due: dueCards(cards),
    loading,
    cardsLoading,
    busy,
    error,
    setError,
    storageMode,
    studyPlans,
    activeStudyPlan,
    studyDays,
    todayStudyDay,
    streak,
    studyLoading,
    studySource,
    refreshDecks,
    refreshStudy,
    createDeck,
    renameDeck,
    removeDeck,
    createCard,
    createCards,
    createCardsForDeck,
    updateCard,
    removeCard,
    reviewCard,
    loadCardsForDecks,
    saveStudyPlan,
    ensureStudyPlanDay,
    recordStudy,
    completeStudyTask,
  };
}

export type FlashcardStore = ReturnType<typeof useFlashcards>;

function studyDayKey(day: Pick<StudyDayProgress, "studyDate" | "contextKey">) {
  return `${day.studyDate}:${day.contextKey}`;
}
