export type FlashcardRating = "again" | "hard" | "good" | "easy";
export type FlashcardStorage = "cloud" | "local";
export type StudyPlanSourceType = "decks" | "document" | "mixed";
export type StudyPlanStatus = "active" | "paused";
export type StudyPlanMode = "ai" | "manual" | "hybrid";
export type StudyTaskKind = "flashcards" | "quiz" | "focus" | "custom";

export type StudyPlanTask = {
  id: string;
  kind: StudyTaskKind;
  title: string;
  deckIds?: string[];
  quizId?: string | null;
  targetCount?: number;
  minutes?: number;
};

export type StudyPlanDay = {
  studyDate: string;
  tasks: StudyPlanTask[];
  restDay?: boolean;
};

export type FlashcardDeck = {
  id: string;
  name: string;
  projectId: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  source?: FlashcardStorage;
  savedFrom?: { title: string; ownerName: string };
};

export type Flashcard = {
  id: string;
  deckId: string;
  projectId: string | null;
  front: string;
  back: string;
  sourcePage: number | null;
  dueAt: string;
  intervalDays: number;
  ease: number;
  repetitions: number;
  lapses: number;
  createdAt: string;
  updatedAt: string;
  source?: FlashcardStorage;
};

export type StudyPlan = {
  id: string;
  name: string;
  sourceType: StudyPlanSourceType;
  deckIds: string[];
  sourceDocumentId: string | null;
  dailyTarget: number;
  dailyMinutes: number;
  timezone: "Asia/Ho_Chi_Minh" | string;
  startDate: string;
  status: StudyPlanStatus;
  mode?: StudyPlanMode;
  schedule?: StudyPlanDay[];
  createdAt: string;
  updatedAt: string;
  source?: FlashcardStorage;
};

export type StudyDayProgress = {
  studyDate: string;
  contextKey: string;
  planId: string | null;
  targetCount: number;
  reviewedCount: number;
  retryCount: number;
  assignedCardIds: string[];
  reviewedCardIds: string[];
  forgottenCardIds: string[];
  completed: boolean;
  firstReviewAt: string | null;
  lastReviewAt: string | null;
  createdAt: string;
  updatedAt: string;
  taskIds?: string[];
  completedTaskIds?: string[];
  taskCardIds?: Record<string, string[]>;
  taskCount?: number;
  completedTaskCount?: number;
  restDay?: boolean;
  source?: FlashcardStorage;
};

export type StudyEvent = {
  eventId: string;
  studyDate: string;
  contextKey: string;
  planId: string | null;
  cardId: string | null;
  rating: FlashcardRating;
  /** A plan counts a card once; retry ratings use 0. Manual study uses 1. */
  goalUnit: 0 | 1;
  targetCount: number;
  createdAt?: string;
};

export type StreakStats = {
  current: number;
  best: number;
  lastStudyDate: string | null;
  today: string;
  todayCompleted: boolean;
  todayTarget: number;
  todayProgress: number;
  todayRetryCount: number;
  todayTaskCount: number;
  todayCompletedTaskCount: number;
};

function createId() {
  return crypto.randomUUID();
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000).toISOString();
}

export function createDeck(name: string, projectId: string | null = null, folderId: string | null = null, now = new Date()): FlashcardDeck {
  const timestamp = now.toISOString();
  return { id: createId(), name: name.trim(), projectId, folderId, createdAt: timestamp, updatedAt: timestamp };
}

export function createFlashcard(deckId: string, front: string, back: string, projectId: string | null = null, sourcePage: number | null = null, now = new Date()): Flashcard {
  const timestamp = now.toISOString();
  return { id: createId(), deckId, projectId, front: front.trim(), back: back.trim(), sourcePage, dueAt: timestamp, intervalDays: 0, ease: 2.5, repetitions: 0, lapses: 0, createdAt: timestamp, updatedAt: timestamp };
}

export function isDue(card: Flashcard, now = new Date()) {
  return new Date(card.dueAt).getTime() <= now.getTime();
}

export function dueCards(cards: Flashcard[], now = new Date()) {
  return cards.filter(card => isDue(card, now)).sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.createdAt.localeCompare(b.createdAt));
}

/** Returns the calendar day in which a learner studies, independent of UTC. */
export function vietnamStudyDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function studyContextKey(planId: string | null | undefined) {
  return planId ? `plan:${planId}` : "manual";
}

/**
 * Suggest a realistic daily target from the source size, due pressure and the
 * learner's available time. The result is deliberately bounded so a plan
 * never creates an intimidating first session.
 */
export function recommendDailyTarget(cards: Flashcard[], dailyMinutes = 20, now = new Date()) {
  if (!cards.length) return 0;
  const minutes = Math.max(5, Math.min(180, Math.round(dailyMinutes) || 20));
  const due = cards.filter(card => isDue(card, now)).length;
  const newCount = cards.filter(card => card.repetitions === 0).length;
  const difficult = cards.filter(card => card.lapses > 0).length;
  const pressure = Math.max(1, Math.round(due * 1.2 + newCount * 0.8 + difficult * 0.5));
  const timeBudget = Math.max(1, Math.round(minutes * 1.25));
  return Math.min(cards.length, Math.max(1, Math.min(50, Math.max(pressure, timeBudget))));
}

function dateOrdinal(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, (month || 1) - 1, day || 1) / 86_400_000;
}

function previousDate(value: string) {
  const date = new Date(dateOrdinal(value) * 86_400_000);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function qualifiedDay(days: StudyDayProgress[], date: string, activePlanId?: string | null) {
  const onDate = days.filter(day => day.studyDate === date);
  if (activePlanId) {
    // An active AI plan is the source of truth for that day. Missing plan
    // progress is incomplete; a manual review must not silently satisfy it.
    return onDate.some(day => day.planId === activePlanId && isStudyDayComplete(day));
  }
  // When no plan is active, only the explicit manual context qualifies.
  return onDate.some(day => !day.planId && isStudyDayComplete(day));
}

/** A plan day is complete only after every assigned task is complete. */
export function isStudyDayComplete(day: Pick<StudyDayProgress, "completed" | "taskIds" | "completedTaskIds" | "forgottenCardIds" | "restDay">) {
  if (day.restDay) return true;
  const taskIds = day.taskIds ?? [];
  if (taskIds.length) {
    const completed = new Set(day.completedTaskIds ?? []);
    return taskIds.every(id => completed.has(id)) && (day.forgottenCardIds ?? []).length === 0;
  }
  return day.completed === true;
}

export function studyPlanMode(plan: Pick<StudyPlan, "mode"> | null | undefined): StudyPlanMode {
  return plan?.mode === "manual" || plan?.mode === "hybrid" ? plan.mode : "ai";
}

export function studyPlanDayFor(plan: Pick<StudyPlan, "schedule"> | null | undefined, studyDate: string): StudyPlanDay | null {
  return plan?.schedule?.find(day => day.studyDate === studyDate) ?? null;
}

/** Recomputes flashcard task completion after a review event. */
export function applyStudyEventToTasks(day: StudyDayProgress, event: Pick<StudyEvent, "cardId" | "rating">): StudyDayProgress {
  if (!day.taskIds?.length || !event.cardId) return day;
  const reviewed = new Set(day.reviewedCardIds);
  const forgotten = new Set(day.forgottenCardIds);
  if (event.rating === "again") forgotten.add(event.cardId);
  else forgotten.delete(event.cardId);
  const completed = new Set(day.completedTaskIds ?? []);
  for (const taskId of day.taskIds) {
    const cardIds = day.taskCardIds?.[taskId] ?? [];
    if (cardIds.length && cardIds.every(id => reviewed.has(id)) && cardIds.every(id => !forgotten.has(id))) completed.add(taskId);
  }
  const completedTaskIds = [...completed];
  const next = { ...day, completedTaskIds, completedTaskCount: completedTaskIds.length, forgottenCardIds: [...forgotten] };
  return { ...next, completed: isStudyDayComplete(next) };
}

function dayForStats(days: StudyDayProgress[], date: string, activePlanId?: string | null) {
  const onDate = days.filter(day => day.studyDate === date);
  return activePlanId
    ? onDate.find(day => day.planId === activePlanId) ?? null
    : onDate.find(day => !day.planId) ?? null;
}

export function computeStreak(days: StudyDayProgress[], now = new Date(), activePlanId?: string | null): StreakStats {
  const today = vietnamStudyDate(now);
  const validDays = days.filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day.studyDate));
  const qualifyingDates = [...new Set(validDays.filter(day => qualifiedDay(validDays, day.studyDate, activePlanId)).map(day => day.studyDate))].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of qualifyingDates) {
    run = previous && dateOrdinal(date) === dateOrdinal(previous) + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  let current = 0;
  let cursor = qualifiedDay(validDays, today, activePlanId) ? today : previousDate(today);
  while (qualifiedDay(validDays, cursor, activePlanId)) {
    current += 1;
    cursor = previousDate(cursor);
  }
  const todayDay = dayForStats(validDays, today, activePlanId);
  return {
    current,
    best,
    lastStudyDate: qualifyingDates[qualifyingDates.length - 1] ?? null,
    today,
    todayCompleted: qualifiedDay(validDays, today, activePlanId),
    todayTarget: todayDay?.taskCount ?? todayDay?.targetCount ?? 1,
    todayProgress: todayDay?.taskCount ? todayDay.completedTaskCount ?? 0 : todayDay?.reviewedCount ?? 0,
    todayRetryCount: todayDay?.retryCount ?? 0,
    todayTaskCount: todayDay?.taskCount ?? 0,
    todayCompletedTaskCount: todayDay?.completedTaskCount ?? 0,
  };
}

export function createStudyPlan(input: {
  name: string;
  sourceType: StudyPlanSourceType;
  deckIds: string[];
  sourceDocumentId?: string | null;
  dailyTarget: number;
  dailyMinutes: number;
  startDate?: string;
  mode?: StudyPlanMode;
  schedule?: StudyPlanDay[];
  now?: Date;
}): StudyPlan {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    name: input.name.trim() || "AI study plan",
    sourceType: input.sourceType,
    deckIds: [...new Set(input.deckIds)],
    sourceDocumentId: input.sourceDocumentId ?? null,
    dailyTarget: Math.max(1, Math.min(500, Math.round(input.dailyTarget))),
    dailyMinutes: Math.max(5, Math.min(180, Math.round(input.dailyMinutes))),
    timezone: "Asia/Ho_Chi_Minh",
    startDate: input.startDate ?? vietnamStudyDate(now),
    status: "active",
    mode: input.mode ?? "ai",
    schedule: input.schedule?.map(day => ({
      studyDate: day.studyDate,
      restDay: !!day.restDay,
      tasks: day.tasks.map(task => ({
        ...task,
        deckIds: task.deckIds ? [...new Set(task.deckIds)] : undefined,
        quizId: task.quizId ?? null,
        targetCount: task.targetCount === undefined ? undefined : Math.max(1, Math.min(500, Math.round(task.targetCount))),
        minutes: task.minutes === undefined ? undefined : Math.max(1, Math.min(240, Math.round(task.minutes))),
      })),
    })) ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * A deliberately small, deterministic scheduler for the first review MVP.
 * It keeps the card data portable and leaves room for a richer scheduler later.
 */
export function scheduleReview(card: Flashcard, rating: FlashcardRating, now = new Date()): Flashcard {
  const ease = Math.max(1.3, card.ease + (rating === "easy" ? 0.15 : rating === "hard" ? -0.15 : rating === "again" ? -0.2 : 0));
  let intervalDays = card.intervalDays;
  let repetitions = card.repetitions;
  let lapses = card.lapses;
  let dueAt: string;

  if (rating === "again") {
    intervalDays = 0;
    repetitions = 0;
    lapses += 1;
    dueAt = addMinutes(now, 10);
  } else if (rating === "hard") {
    intervalDays = Math.max(1, Math.round((card.intervalDays || 1) * 1.2));
    dueAt = addDays(now, intervalDays);
  } else if (rating === "good") {
    intervalDays = Math.max(1, card.repetitions === 0 ? 1 : Math.round((card.intervalDays || 1) * ease));
    repetitions += 1;
    dueAt = addDays(now, intervalDays);
  } else {
    intervalDays = Math.max(2, card.repetitions === 0 ? 3 : Math.round((card.intervalDays || 1) * ease * 1.3));
    repetitions += 1;
    dueAt = addDays(now, intervalDays);
  }

  return { ...card, dueAt, intervalDays, ease: Number(ease.toFixed(2)), repetitions, lapses, updatedAt: now.toISOString() };
}
