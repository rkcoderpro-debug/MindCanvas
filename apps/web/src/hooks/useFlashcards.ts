import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createDeck as makeDeck,
  createFlashcard as makeCard,
  dueCards,
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
  upsertFlashcard,
  upsertFlashcardDeck,
} from "../lib/projectStore";

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

  const selectedDeck = useMemo(() => decks.find(deck => deck.id === selectedDeckId) ?? null, [decks, selectedDeckId]);

  const refreshDecks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchFlashcardDecks(owner);
      setDecks(result.items);
      setStorageMode(result.source);
      setSelectedDeckId(current => result.items.some(deck => deck.id === current) ? current : result.items[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load flashcards.");
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => { void refreshDecks(); }, [refreshDecks]);

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

  const createCards = useCallback(async (inputs: Array<{ front: string; back: string; sourcePage?: number | null }>) => {
    if (!selectedDeck) throw new Error("Choose a deck first.");
    if (!inputs.length) return [];
    const cards = inputs.map(input => makeCard(selectedDeck.id, input.front, input.back, selectedDeck.projectId, input.sourcePage ?? null));
    setBusy(true); setError("");
    try {
      const saved: Flashcard[] = [];
      let source: FlashcardStorage = owner ? "cloud" : "local";
      for (const card of cards) {
        source = await upsertFlashcard(owner, card);
        saved.push({ ...card, source });
      }
      setStorageMode(source);
      setCards(items => [...items, ...saved]);
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create cards.");
      throw err;
    } finally { setBusy(false); }
  }, [owner, selectedDeck]);

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
    refreshDecks,
    createDeck,
    renameDeck,
    removeDeck,
    createCard,
    createCards,
    updateCard,
    removeCard,
    reviewCard,
  };
}
