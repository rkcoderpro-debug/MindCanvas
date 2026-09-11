// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createFlashcard, dueCards, scheduleReview } from "./flashcards";
import { deleteFlashcard, deleteFlashcardDeck, fetchFlashcardDecks, fetchFlashcards, upsertFlashcard, upsertFlashcardDeck } from "./projectStore";

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
});

