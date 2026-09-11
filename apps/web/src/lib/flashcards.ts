export type FlashcardRating = "again" | "hard" | "good" | "easy";
export type FlashcardStorage = "cloud" | "local";

export type FlashcardDeck = {
  id: string;
  name: string;
  projectId: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  source?: FlashcardStorage;
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

