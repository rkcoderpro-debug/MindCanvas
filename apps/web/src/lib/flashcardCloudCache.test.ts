// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeck, createFlashcard } from "./flashcards";
import { fetchFlashcardDecks, fetchFlashcards, readFlashcardDecks, readFlashcards, upsertFlashcardDeck, upsertFlashcard, upsertFlashcards } from "./projectStore";

const { remoteDeck, remoteCard, cloudState } = vi.hoisted(() => ({
  cloudState: { error: null as null | { code: string; message: string } },
  remoteDeck: {
    id: "cloud-deck",
    name: "Cloud deck",
    project_id: null,
    folder_id: null,
    created_at: "2026-09-23T00:00:00.000Z",
    updated_at: "2026-09-23T00:00:00.000Z",
  },
  remoteCard: {
    id: "cloud-card",
    deck_id: "cloud-deck",
    project_id: null,
    front: "Question",
    back: "Answer",
    source_page: null,
    due_at: "2026-09-23T00:00:00.000Z",
    interval_days: 0,
    ease: 2.5,
    repetitions: 0,
    lapses: 0,
    created_at: "2026-09-23T00:00:00.000Z",
    updated_at: "2026-09-23T00:00:00.000Z",
  },
}));

vi.mock("./supabase", () => ({
  getCurrentSession: async () => ({ user: { id: "quota-owner" } }),
  requestTimeoutSignal: () => new AbortController().signal,
  supabase: {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        abortSignal: () => Promise.resolve({
          data: table === "flashcard_decks" ? [remoteDeck] : [remoteCard],
          error: cloudState.error,
        }),
        upsert: () => builder,
        delete: () => builder,
      };
      return builder;
    },
  },
}));

const owner = "quota-owner";
const nativeSetItem = Storage.prototype.setItem;

beforeEach(() => {
  cloudState.error = null;
  localStorage.clear();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
    if (key.startsWith("mindcanvas:flashcards:v1:")) {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    }
    return nativeSetItem.call(this, key, value);
  });
});

afterEach(() => vi.restoreAllMocks());

describe("cloud flashcards when the browser cache is full", () => {
  it("returns cloud decks instead of stale local data when caching fails", async () => {
    await expect(fetchFlashcardDecks(owner)).resolves.toMatchObject({
      source: "cloud",
      items: [expect.objectContaining({ id: "cloud-deck", name: "Cloud deck" })],
    });
    expect(readFlashcardDecks(owner)).toEqual([expect.objectContaining({ id: "cloud-deck", source: "cloud" })]);
  });

  it("returns cloud cards instead of treating a cache quota error as a fetch failure", async () => {
    await expect(fetchFlashcards(owner, "cloud-deck")).resolves.toMatchObject({
      source: "cloud",
      items: [expect.objectContaining({ id: "cloud-card", front: "Question", back: "Answer" })],
    });
    expect(readFlashcards(owner, "cloud-deck")).toEqual([expect.objectContaining({ id: "cloud-card", source: "cloud" })]);
  });

  it("reports a cloud deck save as successful when only the local cache write fails", async () => {
    const deck = createDeck("New deck");
    await expect(upsertFlashcardDeck(owner, deck)).resolves.toBe("cloud");
  });

  it("reports a cloud flashcard batch save as successful when its cache cannot be written", async () => {
    const cards = [createFlashcard("cloud-deck", "New question", "New answer")];
    await expect(upsertFlashcards(owner, cards)).resolves.toBe("cloud");
  });

  it("does not claim an offline deck was saved when its persistent cache is full", async () => {
    const deck = createDeck("Offline deck");
    await expect(upsertFlashcardDeck(null, deck)).rejects.toThrow("trình duyệt đã đầy");
  });
});


describe("cloud rejection diagnostics", () => {
  it.each(["deck", "card", "batch"])("preserves the server error when %s fallback storage also fails", async (kind) => {
    cloudState.error = { code: "23514", message: 'new row violates check constraint "flashcards_front_check"' };
    const card = createFlashcard("cloud-deck", "Question", "Answer");
    const save = kind === "deck" ? upsertFlashcardDeck(owner, createDeck("Deck"))
      : kind === "card" ? upsertFlashcard(owner, card) : upsertFlashcards(owner, [card]);
    await expect(save).rejects.toThrow(/23514.*flashcards_front_check.*chưa được lưu bền vững/);
  });

  it("reports a rejected cloud write even if its recovery copy fits locally", async () => {
    vi.restoreAllMocks();
    cloudState.error = { code: "23503", message: "foreign key violation" };
    await expect(upsertFlashcards(owner, [createFlashcard("cloud-deck", "Q", "A")]))
      .rejects.toThrow(/23503.*Đã lưu bản dự phòng.*chưa đồng bộ/);
  });
});
