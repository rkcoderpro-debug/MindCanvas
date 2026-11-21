// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applyStudyEventToTasks, computeStreak, createFlashcard, dueCards, isStudyDayComplete, recommendDailyTarget, scheduleReview, vietnamStudyDate, type StudyDayProgress, type StudyEvent } from "./flashcards";
import { deleteFlashcard, deleteFlashcardDeck, fetchFlashcardDecks, fetchFlashcards, fetchStudyDays, recordFlashcardStudy, upsertFlashcard, upsertFlashcardDeck, upsertStudyDay } from "./projectStore";

beforeEach(() => localStorage.clear());

describe("flashcard scheduler", () => {
  const now = new Date("2026-09-11T12:00:00.000Z");

  it("creates a new due card and schedules a good review", () => {
    const card = createFlashcard("deck", "Question", "Answer", null, 3, now);
    expect(dueCards([card], now)).toEqual([card]);
    const reviewed = scheduleReview(card, "good", now);
    expect(reviewed.repetitions).toBe(1);
    expect(reviewed.intervalDays).toBe(1);
    expect(reviewed.dueAt).toBe("2026-09-12T12:00:00.000Z");
    expect(dueCards([reviewed], now)).toEqual([]);
  });

  it("makes again cards due soon and increases lapses", () => {
    const card = { ...createFlashcard("deck", "Q", "A", null, null, now), repetitions: 3, intervalDays: 7 };
    const reviewed = scheduleReview(card, "again", now);
    expect(reviewed.lapses).toBe(1);
    expect(reviewed.repetitions).toBe(0);
    expect(reviewed.dueAt).toBe("2026-09-11T12:10:00.000Z");
  });
});

describe("local flashcard repository", () => {
  it("keeps decks and cards owner-scoped and supports CRUD", async () => {
    const deck = { id: "deck-a", name: "Biology", projectId: null, folderId: null, createdAt: "2026-09-11T12:00:00.000Z", updatedAt: "2026-09-11T12:00:00.000Z" };
    const card = { ...createFlashcard(deck.id, "Cell?", "Basic unit", null, 4, new Date("2026-09-11T12:00:00.000Z")), id: "card-a" };
    expect(await upsertFlashcardDeck("user-a", deck)).toBe("local");
    expect(await upsertFlashcard("user-a", card)).toBe("local");
    expect((await fetchFlashcardDecks("user-a")).items.map(item => item.name)).toEqual(["Biology"]);
    expect((await fetchFlashcards("user-a", deck.id)).items[0].front).toBe("Cell?");
    expect((await fetchFlashcardDecks("user-b")).items).toEqual([]);
    await deleteFlashcard("user-a", card);
    expect((await fetchFlashcards("user-a", deck.id)).items).toEqual([]);
    await deleteFlashcardDeck("user-a", deck.id);
    expect((await fetchFlashcardDecks("user-a")).items).toEqual([]);
  });

  it("keeps study events idempotent in the offline queue", async () => {
    const event: StudyEvent = { eventId: "event-a", studyDate: "2026-09-13", contextKey: "manual", planId: null, cardId: "card-a", rating: "good", goalUnit: 1, targetCount: 1, createdAt: "2026-09-13T10:00:00.000Z" };
    const first = await recordFlashcardStudy("user-a", event);
    const second = await recordFlashcardStudy("user-a", event);
    expect(first.item.reviewedCount).toBe(1);
    expect(second.item.reviewedCount).toBe(1);
    expect(second.item.completed).toBe(true);
  });

  it("requires forgotten plan cards to be remembered before completion", async () => {
    const day: StudyDayProgress = { studyDate: "2026-09-13", contextKey: "plan:plan-a", planId: "plan-a", targetCount: 1, reviewedCount: 0, retryCount: 0, assignedCardIds: ["card-a"], reviewedCardIds: [], forgottenCardIds: [], completed: false, firstReviewAt: null, lastReviewAt: null, createdAt: "2026-09-13T10:00:00.000Z", updatedAt: "2026-09-13T10:00:00.000Z" };
    await upsertStudyDay("user-a", day);
    const forgotten = await recordFlashcardStudy("user-a", { eventId: "event-forgot", studyDate: day.studyDate, contextKey: day.contextKey, planId: day.planId, cardId: "card-a", rating: "again", goalUnit: 1, targetCount: 1, createdAt: "2026-09-13T10:01:00.000Z" });
    expect(forgotten.item.reviewedCount).toBe(1);
    expect(forgotten.item.forgottenCardIds).toEqual(["card-a"]);
    expect(forgotten.item.completed).toBe(false);
    const remembered = await recordFlashcardStudy("user-a", { eventId: "event-good", studyDate: day.studyDate, contextKey: day.contextKey, planId: day.planId, cardId: "card-a", rating: "good", goalUnit: 0, targetCount: 1, createdAt: "2026-09-13T10:02:00.000Z" });
    expect(remembered.item.forgottenCardIds).toEqual([]);
    expect(remembered.item.completed).toBe(true);
    expect((await fetchStudyDays("user-a")).items[0].completed).toBe(true);
  });
});

describe("study streak rules", () => {
  it("uses Vietnam calendar boundaries and counts consecutive qualifying days", () => {
    expect(vietnamStudyDate(new Date("2026-09-13T16:59:59.000Z"))).toBe("2026-09-13");
    expect(vietnamStudyDate(new Date("2026-09-13T17:00:00.000Z"))).toBe("2026-09-14");
    const days: StudyDayProgress[] = [
      { studyDate: "2026-09-11", contextKey: "manual", planId: null, targetCount: 1, reviewedCount: 1, retryCount: 0, assignedCardIds: [], reviewedCardIds: ["a"], forgottenCardIds: [], completed: true, firstReviewAt: null, lastReviewAt: null, createdAt: "", updatedAt: "" },
      { studyDate: "2026-09-12", contextKey: "manual", planId: null, targetCount: 1, reviewedCount: 1, retryCount: 0, assignedCardIds: [], reviewedCardIds: ["b"], forgottenCardIds: [], completed: true, firstReviewAt: null, lastReviewAt: null, createdAt: "", updatedAt: "" },
      { studyDate: "2026-09-13", contextKey: "manual", planId: null, targetCount: 1, reviewedCount: 0, retryCount: 0, assignedCardIds: [], reviewedCardIds: [], forgottenCardIds: [], completed: false, firstReviewAt: null, lastReviewAt: null, createdAt: "", updatedAt: "" },
    ];
    const streak = computeStreak(days, new Date("2026-09-13T16:00:00.000Z"));
    expect(streak.current).toBe(2);
    expect(streak.best).toBe(2);
    expect(streak.todayCompleted).toBe(false);
  });

  it("does not let manual practice bypass an incomplete active plan", () => {
    const days: StudyDayProgress[] = [
      { studyDate: "2026-09-13", contextKey: "manual", planId: null, targetCount: 1, reviewedCount: 1, retryCount: 0, assignedCardIds: [], reviewedCardIds: ["a"], forgottenCardIds: [], completed: true, firstReviewAt: null, lastReviewAt: null, createdAt: "", updatedAt: "" },
      { studyDate: "2026-09-13", contextKey: "plan:plan-a", planId: "plan-a", targetCount: 5, reviewedCount: 2, retryCount: 0, assignedCardIds: ["a", "b"], reviewedCardIds: ["a", "b"], forgottenCardIds: [], completed: false, firstReviewAt: null, lastReviewAt: null, createdAt: "", updatedAt: "" },
    ];
    expect(computeStreak(days, new Date("2026-09-13T16:00:00.000Z"), "plan-a").todayCompleted).toBe(false);
  });

  it("does not count manual study when the active plan day is missing", () => {
    const days: StudyDayProgress[] = [{ studyDate: "2026-09-13", contextKey: "manual", planId: null, targetCount: 1, reviewedCount: 1, retryCount: 0, assignedCardIds: [], reviewedCardIds: ["a"], forgottenCardIds: [], completed: true, firstReviewAt: null, lastReviewAt: null, createdAt: "", updatedAt: "" }];
    expect(computeStreak(days, new Date("2026-09-13T16:00:00.000Z"), "plan-a").todayCompleted).toBe(false);
  });

  it("requires every manually selected task before awarding a streak", () => {
    const base: StudyDayProgress = { studyDate: "2026-09-13", contextKey: "plan:manual", planId: "manual", targetCount: 1, reviewedCount: 1, retryCount: 0, assignedCardIds: ["card-a"], reviewedCardIds: ["card-a"], forgottenCardIds: [], completed: false, firstReviewAt: null, lastReviewAt: null, createdAt: "", updatedAt: "", taskIds: ["cards", "quiz", "focus"], completedTaskIds: ["cards"], taskCardIds: { cards: ["card-a"] }, taskCount: 3, completedTaskCount: 1 };
    expect(isStudyDayComplete(base)).toBe(false);
    expect(computeStreak([base], new Date("2026-09-13T16:00:00.000Z"), "manual").todayCompleted).toBe(false);
    const completed = { ...base, completedTaskIds: ["cards", "quiz", "focus"], completedTaskCount: 3, completed: true };
    expect(isStudyDayComplete(completed)).toBe(true);
    expect(computeStreak([completed], new Date("2026-09-13T16:00:00.000Z"), "manual").todayCompleted).toBe(true);
  });

  it("marks a flashcard task complete only after all assigned cards are remembered", () => {
    const base: StudyDayProgress = { studyDate: "2026-09-13", contextKey: "plan:manual", planId: "manual", targetCount: 2, reviewedCount: 2, retryCount: 0, assignedCardIds: ["card-a", "card-b"], reviewedCardIds: ["card-a", "card-b"], forgottenCardIds: ["card-b"], completed: false, firstReviewAt: null, lastReviewAt: null, createdAt: "", updatedAt: "", taskIds: ["cards"], completedTaskIds: [], taskCardIds: { cards: ["card-a", "card-b"] }, taskCount: 1, completedTaskCount: 0 };
    const result = applyStudyEventToTasks(base, { cardId: "card-b", rating: "good" });
    expect(result.completedTaskIds).toEqual(["cards"]);
    expect(result.completed).toBe(true);
  });

  it("ignores old plan progress after the plan is paused", () => {
    const days: StudyDayProgress[] = [
      { studyDate: "2026-09-13", contextKey: "plan:old", planId: "old", targetCount: 2, reviewedCount: 2, retryCount: 0, assignedCardIds: ["a", "b"], reviewedCardIds: ["a", "b"], forgottenCardIds: [], completed: true, firstReviewAt: null, lastReviewAt: null, createdAt: "", updatedAt: "" },
      { studyDate: "2026-09-13", contextKey: "manual", planId: null, targetCount: 1, reviewedCount: 1, retryCount: 0, assignedCardIds: [], reviewedCardIds: ["c"], forgottenCardIds: [], completed: true, firstReviewAt: null, lastReviewAt: null, createdAt: "", updatedAt: "" },
    ];
    expect(computeStreak(days, new Date("2026-09-13T16:00:00.000Z"), null).todayCompleted).toBe(true);
  });

  it("suggests a bounded target from card pressure and available time", () => {
    const cards = Array.from({ length: 40 }, (_, index) => createFlashcard("deck", `Q${index}`, `A${index}`, null, null, new Date("2026-09-13T10:00:00.000Z")));
    expect(recommendDailyTarget(cards, 20, new Date("2026-09-13T10:00:00.000Z"))).toBeGreaterThan(0);
    expect(recommendDailyTarget(cards, 180, new Date("2026-09-13T10:00:00.000Z"))).toBeLessThanOrEqual(40);
  });
});
