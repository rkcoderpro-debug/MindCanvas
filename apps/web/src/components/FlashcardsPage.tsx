import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BookOpen, CalendarClock, CheckCircle2, ClipboardPaste, Cloud, FileText, Flame, HardDrive, Layers3, ListOrdered, Pencil, Play, Plus, RotateCcw, Search, Shuffle, Sparkles, Target, Trash2, Upload, Zap, X } from "lucide-react";
import type { BoardState } from "@mindcanvas/shared";
import type { Project } from "../lib/projectStore";
import type { AccountPlan } from "../lib/account";
import { fetchBoard, readCache } from "../lib/projectStore";
import { dueCards, recommendDailyTarget, studyContextKey, vietnamStudyDate, type Flashcard, type FlashcardDeck, type FlashcardRating, type StudyEvent } from "../lib/flashcards";
import { aiErrorMessage } from "../lib/aiErrors";
import { useFlashcards, type FlashcardStore } from "../hooks/useFlashcards";
import { useLanguage } from "../lib/i18n";
import { consumeAiManualUsage, generateFlashcards, generateFlashcardsFromFile, recommendStudyPlan, type GeneratedFlashcard, type GeneratedFlashcardsFromFile, type StudyPlanRecommendation } from "../lib/api";
import { getDocumentSource, saveDocumentToStorage } from "../lib/supabase";
import { AI_FILE_ACCEPT, readClipboardSource, writeClipboardText } from "../lib/aiSource";
import { MAX_FILE_BYTES } from "../lib/board";
import Dialog from "./Dialog";
import { AiModeSwitch, type AiMode } from "./AiModeSwitch";
import SourceDocumentPanel, { type SourceDocumentView } from "./SourceDocumentPanel";
import StudyPlanDialog from "./StudyPlanDialog";
import { buildFlashcardsPrompt, ManualAiValidationError, MAX_FLASHCARDS, parseManualFlashcards } from "../lib/manualAi";
import { DEFAULT_AI_OPTIONS, type AiGenerationOptions } from "../lib/aiOptions";
import AiQualityControls from "./AiQualityControls";
import ManualAiProviderLinks from "./ManualAiProviderLinks";
import { LearningShareButton } from "./LearningShareDialog";

type DeckDialog = { kind: "create" | "rename"; deck?: FlashcardDeck };
type CardDialog = { kind: "create" | "edit"; card?: Flashcard };
type AiSource = "text" | "project" | "file" | "deck";
type AiPreviewCard = Omit<GeneratedFlashcard, "sourcePage"> & { id: string; sourcePage: number | null };
type AiPreview = { title: string; provider: string; model: string; cards: AiPreviewCard[]; sourceDocumentId?: string };
const DEFAULT_FLASHCARD_LIMIT = 50;

function parseFlashcardLimit(value: string, maximum = MAX_FLASHCARDS): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 3 && parsed <= maximum ? parsed : null;
}

function formatDate(value: string, language: string) {
  return new Date(value).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US", { day: "numeric", month: "short", year: "numeric" });
}

function boardToStudyText(board: BoardState) {
  const lines = [`Title: ${board.title}`];
  board.texts.filter(item => !item.hidden).forEach(item => lines.push(`Text: ${item.text}`));
  board.nodes.filter(item => !item.hidden).forEach(item => lines.push(`Mind-map node${item.parentId ? ` (child of ${item.parentId})` : ""}: ${item.label}${item.sourcePage ? ` [PAGE ${item.sourcePage}]` : ""}`));
  board.edges.filter(item => !item.hidden && item.label).forEach(item => lines.push(`Connection: ${item.source} -> ${item.target}: ${item.label}`));
  return lines.join("\n").slice(0, 120_000);
}

function cardsToStudyText(cards: Flashcard[]) {
  return cards.map((card, index) => `Existing card ${index + 1}\nQ: ${card.front}\nA: ${card.back}`).join("\n\n").slice(0, 120_000);
}

function deckExpansionSource(cards: Flashcard[]) {
  return `Existing flashcard set:\n${cardsToStudyText(cards)}\n\nCreate additional cards that test related ideas. Do not repeat or lightly rephrase the existing cards.`;
}

function cardQuestionKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function StorageBadge({ mode }: { mode: "cloud" | "local" }) {
  const { t } = useLanguage();
  return <span className={`flashcard-storage ${mode}`} title={mode === "cloud" ? t("flashcardCloudHint") : t("flashcardLocalHint")}>
    {mode === "cloud" ? <Cloud size={14}/> : <HardDrive size={14}/>} {mode === "cloud" ? t("cloud") : t("local")}
  </span>;
}

export default function FlashcardsPage({ owner, projects, accountPlan, store }: { owner: string | null; projects: Project[]; accountPlan?: AccountPlan; store?: FlashcardStore }) {
  const { t, language } = useLanguage();
  const localFlashcards = useFlashcards(owner);
  const flashcards = store ?? localFlashcards;
  const [panel, setPanel] = useState<"cards" | "review">("cards");
  const [deckFilter, setDeckFilter] = useState<"all" | "saved">("all");
  const [deckDialog, setDeckDialog] = useState<DeckDialog | null>(null);
  const [deckName, setDeckName] = useState("");
  const [deckProjectId, setDeckProjectId] = useState("");
  const [cardDialog, setCardDialog] = useState<CardDialog | null>(null);
  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");
  const [cardPage, setCardPage] = useState("");
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FlashcardDeck | null>(null);
  const [reviewQueue, setReviewQueue] = useState<string[]>([]);
  const [reviewCards, setReviewCards] = useState<Flashcard[]>([]);
  const [reviewContext, setReviewContext] = useState<{ planId: string | null; contextKey: string; targetCount: number } | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const ratingBusyRef = useRef(false);
  const [cardQuery, setCardQuery] = useState("");
  const [sourceView, setSourceView] = useState<SourceDocumentView | null>(null);
  const [studyPlanDialog, setStudyPlanDialog] = useState(false);
  const [aiDialog, setAiDialog] = useState(false);
  const [aiSource, setAiSource] = useState<AiSource>("text");
  const [aiMode, setAiMode] = useState<AiMode>(owner ? "auto" : "manual");
  const [aiText, setAiText] = useState("");
  const [aiProjectId, setAiProjectId] = useState("");
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiMaxCards, setAiMaxCards] = useState(String(DEFAULT_FLASHCARD_LIMIT));
  const [aiOptions, setAiOptions] = useState<AiGenerationOptions>(DEFAULT_AI_OPTIONS);
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [manualPrompt, setManualPrompt] = useState(""), [manualJson, setManualJson] = useState(""), [manualCopied, setManualCopied] = useState(false), [manualUsageConsumed, setManualUsageConsumed] = useState(false);
  const aiController = useRef<AbortController | null>(null);
  useEffect(() => () => aiController.current?.abort(), []);

  const availableProjects = useMemo(() => projects.filter(project => !project.deletedAt).sort((a, b) => a.title.localeCompare(b.title, language)), [projects, language]);
  const selectedProject = availableProjects.find(project => project.id === deckProjectId);
  const aiProject = availableProjects.find(project => project.id === aiProjectId);
  const maxCardsLimit = Math.min(MAX_FLASHCARDS, Math.max(3, accountPlan?.maxCards ?? DEFAULT_FLASHCARD_LIMIT));
  const maxCardsError = () => t("aiMaxCardsInvalid").replace("500", String(maxCardsLimit));
  useEffect(() => {
    setAiMaxCards(value => {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= 3 && parsed <= maxCardsLimit ? value : String(maxCardsLimit);
    });
  }, [maxCardsLimit]);
  const due = flashcards.due;
  const newCards = flashcards.cards.filter(card => card.repetitions === 0);
  const difficultCards = flashcards.cards.filter(card => card.lapses > 0).sort((a, b) => b.lapses - a.lapses);
  const learnedCards = flashcards.cards.filter(card => card.repetitions >= 2);
  const filteredCards = flashcards.cards.filter(card => `${card.front} ${card.back}`.toLocaleLowerCase().includes(cardQuery.trim().toLocaleLowerCase()));
  const reviewTarget = reviewQueue[reviewIndex] ? reviewCards.find(card => card.id === reviewQueue[reviewIndex]) ?? null : null;
  const reviewFinished = panel === "review" && reviewQueue.length > 0 && reviewIndex >= reviewQueue.length;

  useEffect(() => {
    const plan = flashcards.activeStudyPlan;
    if (!plan || flashcards.todayStudyDay || flashcards.studyLoading) return;
    let alive = true;
    void flashcards.loadCardsForDecks(plan.deckIds).then(cards => { if (alive) return flashcards.ensureStudyPlanDay(plan, cards); }).catch(() => undefined);
    return () => { alive = false; };
  }, [flashcards.activeStudyPlan, flashcards.ensureStudyPlanDay, flashcards.loadCardsForDecks, flashcards.studyLoading, flashcards.todayStudyDay]);

  const openCreateDeck = () => { setDeckName(""); setDeckProjectId(""); setFormError(""); setDeckDialog({ kind: "create" }); };
  const openRenameDeck = (deck: FlashcardDeck) => { setDeckName(deck.name); setDeckProjectId(deck.projectId ?? ""); setFormError(""); setDeckDialog({ kind: "rename", deck }); };
  const openCreateCard = () => { setCardFront(""); setCardBack(""); setCardPage(""); setFormError(""); setCardDialog({ kind: "create" }); };
  const openEditCard = (card: Flashcard) => { setCardFront(card.front); setCardBack(card.back); setCardPage(card.sourcePage ? String(card.sourcePage) : ""); setFormError(""); setCardDialog({ kind: "edit", card }); };
  const openAiGenerator = () => {
    const linkedProject = flashcards.selectedDeck?.projectId ?? "";
    const nextMode = owner ? "auto" : "manual";
    const defaultMaxCards = Math.min(DEFAULT_FLASHCARD_LIMIT, maxCardsLimit);
    const source: AiSource = flashcards.cards.length ? "deck" : linkedProject ? "project" : "text";
    setAiMode(nextMode); setAiSource(source); setAiProjectId(linkedProject); setAiText(""); setAiFile(null); setAiMaxCards(String(defaultMaxCards)); setAiOptions(DEFAULT_AI_OPTIONS); setAiPreview(null); setManualPrompt(nextMode === "manual" ? buildFlashcardsPrompt({ maxCards: defaultMaxCards, language, options: DEFAULT_AI_OPTIONS, text: source === "deck" ? deckExpansionSource(flashcards.cards) : undefined }) : ""); setManualJson(""); setManualCopied(false); setManualUsageConsumed(false); setAiError(""); setAiDialog(true);
  };
  const closeAiGenerator = () => { if (aiBusy) return; aiController.current?.abort(); setAiDialog(false); setAiPreview(null); setManualPrompt(""); setManualJson(""); setManualCopied(false); setManualUsageConsumed(false); setAiError(""); };
  const changeAiMode = (nextMode: AiMode) => { const maxCards = parseFlashcardLimit(aiMaxCards, maxCardsLimit) ?? Math.min(DEFAULT_FLASHCARD_LIMIT, maxCardsLimit); setAiMode(nextMode); if (nextMode === "manual") setAiMaxCards(String(maxCards)); setAiPreview(null); setManualPrompt(nextMode === "manual" ? buildFlashcardsPrompt({ maxCards, language, options: aiOptions, text: aiSource === "deck" ? deckExpansionSource(flashcards.cards) : undefined }) : ""); setManualJson(""); setManualCopied(false); setManualUsageConsumed(false); setAiError(""); };
  const sourceForAi = async (signal: AbortSignal) => {
    if (aiSource === "text") {
      const text = aiText.trim();
      if (!text) throw new Error(t("aiTextRequired"));
      return { text, documentId: undefined as string | undefined, file: undefined as File | undefined };
    }
    if (aiSource === "project") {
      if (!aiProjectId) throw new Error(t("aiProjectRequired"));
      const cachedEntry = readCache(owner).find(project => project.id === aiProjectId);
      const board = cachedEntry && (cachedEntry.pending || !navigator.onLine)
        ? cachedEntry.board
        : owner
          ? await fetchBoard(owner, aiProjectId)
          : cachedEntry?.board ?? aiProject?.board ?? null;
      if (!board) throw new Error(t("aiProjectEmpty"));
      const text = boardToStudyText(board);
      if (!text.trim() || text.trim() === `Title: ${board.title}`) throw new Error(t("aiProjectEmpty"));
      return { text, documentId: undefined as string | undefined, file: undefined as File | undefined };
    }
    if (aiSource === "deck") {
      if (!flashcards.cards.length) throw new Error(t("aiDeckEmpty"));
      return { text: deckExpansionSource(flashcards.cards), documentId: undefined as string | undefined, file: undefined as File | undefined };
    }
    if (!aiFile) throw new Error(t("aiFileRequired"));
    if (aiFile.size > MAX_FILE_BYTES) throw new Error(t("fileTooLarge"));
    return { text: "", documentId: undefined as string | undefined, file: aiFile };
  };
  const copyManualPrompt = async () => {
    if (!manualPrompt) { setAiError(maxCardsError()); return; }
    const prompt = manualPrompt;
    try { await writeClipboardText(prompt); setManualCopied(true); setAiError(""); window.setTimeout(() => setManualCopied(false), 2200); }
    catch { setAiError(t("clipboardWriteError")); }
  };
  const validateManualResult = async () => {
    const maxCards = parseFlashcardLimit(aiMaxCards, maxCardsLimit);
    if (!maxCards) { setAiError(maxCardsError()); return; }
    if (!owner) { setAiError(t("manualRequiresLogin")); return; }
    let parsed: ReturnType<typeof parseManualFlashcards>;
    try {
      parsed = parseManualFlashcards(manualJson, maxCards);
    } catch (error) {
      setAiPreview(null);
      setAiError(error instanceof ManualAiValidationError && error.code === "INVALID_JSON" ? t("manualInvalidJson") : t("manualInvalidFlashcards"));
      return;
    }
    const existingQuestions = new Set(flashcards.cards.map(card => cardQuestionKey(card.front)));
    const parsedCards = aiSource === "deck" ? parsed.cards.filter(card => !existingQuestions.has(cardQuestionKey(card.front))) : parsed.cards;
    if (!parsedCards.length) { setAiPreview(null); setAiError(t("aiFlashcardError")); return; }
    if (!manualUsageConsumed) {
      setAiBusy(true);
      try { await consumeAiManualUsage(); setManualUsageConsumed(true); }
      catch (error) { setAiPreview(null); setAiError(aiErrorMessage(error, t, "aiManualQuotaError")); return; }
      finally { setAiBusy(false); }
    }
    setAiPreview({ title: parsed.title, provider: "manual", model: "Manual AI", cards: parsedCards.map(card => ({ ...card, id: crypto.randomUUID() })) });
    setAiError("");
  };
  const generateAiPreview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (aiBusy) return;
    if (aiMode === "manual") return;
    if (!owner) return;
    const maxCards = parseFlashcardLimit(aiMaxCards, maxCardsLimit);
    if (maxCards === null) { setAiError(maxCardsError()); return; }
    const request = new AbortController(); aiController.current = request; setAiBusy(true); setAiError(""); setAiPreview(null);
    try {
      const source = await sourceForAi(request.signal);
      if (request.signal.aborted) return;
      const result = source.file
        ? await generateFlashcardsFromFile(source.file, maxCards, request.signal, aiOptions)
        : await generateFlashcards(source.text, source.documentId, maxCards, request.signal, aiOptions);
      if (request.signal.aborted) return;
      const existingQuestions = new Set(flashcards.cards.map(card => cardQuestionKey(card.front)));
      const generatedCards = aiSource === "deck" ? result.cards.filter(card => !existingQuestions.has(cardQuestionKey(card.front))) : result.cards;
      if (result.provider === "demo" || !generatedCards.length || generatedCards.length > maxCardsLimit) throw new Error(aiSource === "deck" ? t("aiFlashcardError") : t("aiDemo"));
      if (source.file) { const fileResult = result as GeneratedFlashcardsFromFile; await saveDocumentToStorage(source.file, fileResult.source.id, fileResult.source.text, fileResult.source.pageCount, flashcards.selectedDeck?.projectId ?? undefined); }
      setAiPreview({ title: result.title, provider: result.provider, model: result.model, sourceDocumentId: result.sourceDocumentId, cards: generatedCards.map(card => ({ ...card, id: crypto.randomUUID(), sourcePage: card.sourcePage ?? null })) });
    } catch (err) { if (!request.signal.aborted) setAiError(aiErrorMessage(err, t, "aiFlashcardError")); }
    finally { if (!request.signal.aborted) setAiBusy(false); }
  };
  const updateAiCard = (id: string, patch: Partial<AiPreviewCard>) => setAiPreview(current => current ? { ...current, cards: current.cards.map(card => card.id === id ? { ...card, ...patch } : card) } : current);
  const addAiCard = () => setAiPreview(current => current && current.cards.length < maxCardsLimit ? { ...current, cards: [...current.cards, { id: crypto.randomUUID(), front: "", back: "", sourcePage: null }] } : current);
  const removeAiCard = (id: string) => setAiPreview(current => current ? { ...current, cards: current.cards.filter(card => card.id !== id) } : current);
  const importManualJsonFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error("EMPTY_JSON_FILE");
      setManualJson(text); setAiPreview(null); setAiError("");
    } catch { setAiError(t("manualJsonFileError")); }
  };
  const updateManualCardLimit = (value: string) => {
    const maxCards = parseFlashcardLimit(value, maxCardsLimit);
    setAiMaxCards(value);
    setManualPrompt(maxCards ? buildFlashcardsPrompt({ maxCards, language, options: aiOptions, text: aiSource === "deck" ? deckExpansionSource(flashcards.cards) : undefined }) : "");
    setManualJson(""); setAiPreview(null); setManualCopied(false); setAiError(value && !maxCards ? maxCardsError() : "");
  };
  const applyAiPreview = async () => {
    if (!aiPreview) return;
    const existingQuestions = new Set(flashcards.cards.map(card => cardQuestionKey(card.front)));
    const seenQuestions = new Set<string>();
    const cards = aiPreview.cards.map(card => ({ front: card.front.trim(), back: card.back.trim(), sourcePage: card.sourcePage })).filter(card => {
      const key = cardQuestionKey(card.front);
      if (!card.front || !card.back || (aiSource === "deck" && existingQuestions.has(key)) || seenQuestions.has(key)) return false;
      seenQuestions.add(key);
      return true;
    });
    if (!cards.length || cards.length > maxCardsLimit) { setAiError(aiSource === "deck" ? t("aiFlashcardError") : t("manualInvalidFlashcards")); return; }
    setAiBusy(true); setAiError("");
    try { await flashcards.createCards(cards); setAiDialog(false); setAiPreview(null); }
    catch (err) { setAiError(err instanceof Error ? err.message : t("aiFlashcardError")); }
    finally { setAiBusy(false); }
  };

  const submitDeck = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = deckName.trim();
    if (!name) { setFormError(t("flashcardNameRequired")); return; }
    try {
      if (deckDialog?.kind === "create") await flashcards.createDeck(name, selectedProject?.id ?? null, selectedProject?.folderId ?? null);
      else if (deckDialog?.deck) {
        await flashcards.renameDeck(deckDialog.deck, name);
      }
      setDeckDialog(null);
    } catch (err) { setFormError(err instanceof Error ? err.message : t("error")); }
  };

  const submitCard = async (event: React.FormEvent) => {
    event.preventDefault();
    const front = cardFront.trim(), back = cardBack.trim();
    if (!front || !back) { setFormError(t("flashcardSidesRequired")); return; }
    const parsedPage = cardPage.trim() ? Number.parseInt(cardPage, 10) : null;
    if (parsedPage !== null && (!Number.isInteger(parsedPage) || parsedPage < 1)) { setFormError(t("flashcardPageInvalid")); return; }
    try {
      if (cardDialog?.kind === "create") await flashcards.createCard(front, back, parsedPage);
      else if (cardDialog?.card) await flashcards.updateCard(cardDialog.card, { front, back, sourcePage: parsedPage });
      setCardDialog(null);
    } catch (err) { setFormError(err instanceof Error ? err.message : t("error")); }
  };

  const shuffleCards = (cards: Flashcard[]) => {
    const shuffled = [...cards];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return shuffled;
  };
  const beginReview = (cards: Flashcard[], context: { planId: string | null; contextKey: string; targetCount: number }, random = false) => {
    const ordered = random ? shuffleCards(cards) : cards;
    setReviewCards(ordered); setReviewQueue(ordered.map(card => card.id)); setReviewContext(context);
    setReviewIndex(0); setShowAnswer(false); setPanel("review");
  };
  const startReview = (mode: "due" | "new" | "difficult" | "all" | "random" = "due") => {
    const cards = mode === "new" ? newCards : mode === "difficult" ? difficultCards : mode === "due" ? dueCards(flashcards.cards) : flashcards.cards;
    beginReview(cards, { planId: null, contextKey: studyContextKey(null), targetCount: 1 }, mode === "random");
  };
  const startPlanReview = async () => {
    const plan = flashcards.activeStudyPlan;
    if (!plan) return;
    setFormError("");
    try {
      const cards = await flashcards.loadCardsForDecks(plan.deckIds);
      const day = flashcards.todayStudyDay ?? await flashcards.ensureStudyPlanDay(plan, cards);
      const cardById = new Map(cards.map(card => [card.id, card]));
      const ids = [...new Set([...day.forgottenCardIds, ...day.assignedCardIds.filter(id => !day.reviewedCardIds.includes(id))])];
      const assigned = ids.map(id => cardById.get(id)).filter((card): card is Flashcard => !!card);
      if (!assigned.length) { setFormError(t("noCardsForPlan")); return; }
      beginReview(assigned, { planId: plan.id, contextKey: studyContextKey(plan.id), targetCount: day.targetCount });
    } catch (err) { setFormError(err instanceof Error ? err.message : t("studyPlanLoadError")); }
  };

  const rateReview = async (rating: Extract<FlashcardRating, "again" | "good">) => {
    if (!reviewTarget || ratingBusyRef.current) return;
    ratingBusyRef.current = true;
    setRatingBusy(true);
    const studyDate = vietnamStudyDate();
    const context = reviewContext ?? { planId: null, contextKey: studyContextKey(null), targetCount: 1 };
    const currentDay = flashcards.studyDays.find(day => day.studyDate === studyDate && day.contextKey === context.contextKey);
    const goalUnit: 0 | 1 = context.planId && currentDay?.reviewedCardIds.includes(reviewTarget.id) ? 0 : 1;
    const event: StudyEvent = { eventId: crypto.randomUUID(), studyDate, contextKey: context.contextKey, planId: context.planId, cardId: reviewTarget.id, rating, goalUnit, targetCount: context.targetCount, createdAt: new Date().toISOString() };
    try {
      await flashcards.reviewCard(reviewTarget, rating);
      await flashcards.recordStudy(event);
      if (rating === "again") setReviewQueue(queue => [...queue, reviewTarget.id]);
      setShowAnswer(false); setReviewIndex(index => index + 1);
    } catch { /* the hook keeps the visible error and the card stays on screen */ }
    finally { ratingBusyRef.current = false; setRatingBusy(false); }
  };
  const openCardSource = async (card: Flashcard) => {
    if (!card.sourcePage || !flashcards.selectedDeck?.projectId) return;
    setFormError("");
    try { const source = await getDocumentSource({ projectId: flashcards.selectedDeck.projectId }); setSourceView({ url: source.url, name: source.name, page: card.sourcePage }); }
    catch { setFormError(t("sourceError")); }
  };
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
      return await recommendStudyPlan(cards.map(card => ({ due: new Date(card.dueAt).getTime() <= Date.now(), repetitions: card.repetitions, lapses: card.lapses, intervalDays: card.intervalDays })), dailyMinutes, language, undefined, options);
    } catch {
      return fallback;
    }
  };

  return <section className="flashcards-page">
    <div className="flashcards-heading">
      <div><span className="eyebrow">STUDY TOOLS</span><h1>{t("flashcards")}</h1><p>{t("flashcardsHint")}</p></div>
      <div className="actions"><StorageBadge mode={flashcards.storageMode}/><button className="primary-button" onClick={openCreateDeck}><Plus size={17}/>{t("newDeck")}</button></div>
    </div>
    {(flashcards.error || formError) && <div className="flashcards-error" role="alert"><span>{flashcards.error || formError}</span><button className="icon-button" aria-label={t("close")} onClick={() => { flashcards.setError(""); setFormError(""); }}><X size={16}/></button></div>}
    <div className="flashcards-layout">
      <aside className="flashcards-decks">
        <div className="flashcards-decks-heading"><strong>{t("decks")}</strong><button className="icon-button" aria-label={t("newDeck")} onClick={openCreateDeck}><Plus size={17}/></button></div>
        {flashcards.loading ? <p>{t("loading")}</p> : !flashcards.decks.length ? <div className="flashcards-empty-small"><BookOpen size={25}/><span>{t("noDecks")}</span></div> : <><div className="learning-copy-filter compact" aria-label="Lọc bộ Flashcard"><button aria-pressed={deckFilter === "all"} onClick={() => setDeckFilter("all")}>Tất cả <small>{flashcards.decks.length}</small></button><button aria-pressed={deckFilter === "saved"} onClick={() => setDeckFilter("saved")}>Đã lưu <small>{flashcards.decks.filter(deck => !!deck.savedFrom).length}</small></button></div><div className="deck-list">{flashcards.decks.filter(deck => deckFilter === "all" || !!deck.savedFrom).length ? flashcards.decks.filter(deck => deckFilter === "all" || !!deck.savedFrom).map(deck => <div className={`deck-item ${deck.id === flashcards.selectedDeckId ? "active" : ""}`} key={deck.id}>
          <button className="deck-select" onClick={() => { flashcards.setSelectedDeckId(deck.id); setPanel("cards"); }}><BookOpen size={17}/><span>{deck.name}</span><small>{flashcards.selectedDeckId === deck.id ? flashcards.cards.length : ""}</small></button>
          <button className="icon-button deck-action" aria-label={`${t("renameDeck")}: ${deck.name}`} onClick={() => openRenameDeck(deck)}><Pencil size={14}/></button>
        </div>) : <p className="learning-copy-empty">Chưa có bộ thẻ nào được lưu từ mục chia sẻ.</p>}</div></>}
      </aside>
      <section className="flashcards-content">
        {!flashcards.selectedDeck ? <div className="flashcards-empty"><BookOpen size={48}/><h2>{t("chooseDeck")}</h2><p>{t("chooseDeckHint")}</p><button className="primary-button" onClick={openCreateDeck}><Plus size={17}/>{t("newDeck")}</button></div> : <>
          <header className="flashcards-content-heading">
            <div><div className="flashcards-title-line"><BookOpen size={21}/><h2>{flashcards.selectedDeck.name}</h2></div>{flashcards.selectedDeck.savedFrom && <small className="learning-copy-provenance">Đã lưu từ {flashcards.selectedDeck.savedFrom.ownerName} · {flashcards.selectedDeck.savedFrom.title}</small>}<div className="flashcards-meta"><span>{t("cardCount", { count: flashcards.cards.length })}</span><span>·</span><span>{t("dueCount", { count: due.length })}</span>{flashcards.selectedDeck.projectId && <><span>·</span><span><FileText size={13}/>{availableProjects.find(project => project.id === flashcards.selectedDeck?.projectId)?.title ?? t("linkedProject")}</span></>}</div></div>
            <div className="actions"><LearningShareButton kind="flashcard" id={flashcards.selectedDeck.id} title={flashcards.selectedDeck.name} plan={accountPlan} available={!!owner && flashcards.selectedDeck.source === "cloud" && flashcards.cards.every(card => card.source === "cloud")}/><button className="icon-button danger" aria-label={t("deleteDeck")} title={t("deleteDeck")} onClick={() => setDeleteTarget(flashcards.selectedDeck)}><Trash2 size={17}/></button><button className="secondary-button" disabled={flashcards.busy || aiBusy} title={!owner ? t("aiManualHint") : t("generateFlashcards")} onClick={openAiGenerator}><Sparkles size={16}/>{t("generateFlashcards")}</button><button className="secondary-button" disabled={flashcards.busy || aiBusy} onClick={() => setStudyPlanDialog(true)}><CalendarClock size={16}/>{flashcards.activeStudyPlan ? t("manageStudyPlan") : t("createStudyPlan")}</button>{flashcards.activeStudyPlan && <button className="primary-button" disabled={flashcards.busy || aiBusy || !flashcards.todayStudyDay || flashcards.todayStudyDay.completed} onClick={() => void startPlanReview()}><Play size={16}/>{t("startPlanReview")}</button>}<button className="secondary-button" disabled={!due.length || flashcards.busy || aiBusy} onClick={() => startReview("due")}><Play size={16}/>{t("startReview")}</button><button className="primary-button" disabled={flashcards.busy || aiBusy} onClick={openCreateCard}><Plus size={16}/>{t("newCard")}</button></div>
          </header>
          <div className="study-overview">
            <button disabled={!due.length} onClick={() => startReview("due")}><span><RotateCcw size={16}/>{t("reviewDue")}</span><strong>{due.length}</strong></button>
            <button disabled={!newCards.length} onClick={() => startReview("new")}><span><Zap size={16}/>{t("newCards")}</span><strong>{newCards.length}</strong></button>
            <button disabled={!difficultCards.length} onClick={() => startReview("difficult")}><span><Target size={16}/>{t("difficultCards")}</span><strong>{difficultCards.length}</strong></button>
            <div><span><CheckCircle2 size={16}/>{t("learnedCards")}</span><strong>{learnedCards.length}</strong></div>
          </div>
          <div className={`study-plan-banner ${flashcards.activeStudyPlan ? "has-plan" : "manual-mode"}`}><div className="study-plan-banner-main"><span className="streak-flame"><Flame size={19}/></span><div><span className="study-plan-kicker">{flashcards.activeStudyPlan ? t("aiPlanToday") : t("manualPractice")}</span><strong>{flashcards.streak.current} {t("streakDays")}</strong><small>{flashcards.activeStudyPlan ? `${flashcards.streak.todayProgress} / ${flashcards.streak.todayTarget} ${t("targetCards").toLocaleLowerCase()}` : t("manualStreakHint")}</small></div></div><div className="study-plan-banner-progress"><div><span>{flashcards.activeStudyPlan ? flashcards.activeStudyPlan.name : t("streak")}</span><b>{flashcards.streak.todayCompleted ? t("streakEarned") : flashcards.activeStudyPlan ? t("streakLocked") : t("studyOneCard")}</b></div><progress value={Math.min(flashcards.streak.todayProgress, Math.max(1, flashcards.streak.todayTarget))} max={Math.max(1, flashcards.streak.todayTarget)}/></div><div className="streak-best"><span>{t("bestStreak")}</span><strong>{flashcards.streak.best}</strong></div></div>
          <div className="study-mode-toolbar"><span><Target size={16}/>{t("studyMode")}</span><button className="secondary-button" disabled={!flashcards.cards.length || flashcards.busy || aiBusy} onClick={() => startReview("all")}><ListOrdered size={15}/>{t("studyOrder")}</button><button className="secondary-button" disabled={!flashcards.cards.length || flashcards.busy || aiBusy} onClick={() => startReview("random")}><Shuffle size={15}/>{t("random")}</button><button className="secondary-button" disabled={!flashcards.cards.length || flashcards.busy || aiBusy} onClick={() => startReview("new")}><Zap size={15}/>{t("studyNew")}</button></div>
          <div className="flashcard-tabs" role="tablist"><button role="tab" aria-selected={panel === "cards"} className={panel === "cards" ? "active" : ""} onClick={() => setPanel("cards")}>{t("allCards")}</button><button role="tab" aria-selected={panel === "review"} className={panel === "review" ? "active" : ""} onClick={() => startReview("due")}><RotateCcw size={15}/>{t("review")}{due.length > 0 && <span>{due.length}</span>}</button></div>
          {panel === "review" ? <ReviewPanel target={reviewTarget} finished={reviewFinished} index={reviewIndex} total={reviewQueue.length} forgottenCount={flashcards.todayStudyDay?.forgottenCardIds.length ?? 0} dailyCurrent={flashcards.streak.todayProgress} dailyGoal={flashcards.streak.todayTarget} planMode={!!reviewContext?.planId} ratingBusy={ratingBusy} showAnswer={showAnswer} onToggleAnswer={() => setShowAnswer(value => !value)} onRate={rating => void rateReview(rating)} onBack={() => setPanel("cards")} t={t}/> : flashcards.cardsLoading ? <p className="flashcards-loading">{t("loading")}</p> : !flashcards.cards.length ? <div className="flashcards-empty cards"><BookOpen size={38}/><h3>{t("noCards")}</h3><p>{t("noCardsHint")}</p><button className="secondary-button" onClick={openCreateCard}><Plus size={16}/>{t("newCard")}</button></div> : <><label className="card-search"><Search size={16}/><input aria-label={t("cardSearch")} placeholder={t("cardSearch")} value={cardQuery} onChange={event => setCardQuery(event.target.value)}/></label>{!filteredCards.length ? <div className="command-empty">{t("noResults")}</div> : <div className="cards-list">{filteredCards.map(card => <CardRow key={card.id} card={card} language={language} onEdit={() => openEditCard(card)} onDelete={() => void flashcards.removeCard(card)} onOpenSource={card.sourcePage && flashcards.selectedDeck?.projectId ? () => void openCardSource(card) : undefined} busy={flashcards.busy} t={t}/>)}</div>}</>}
        </>}
      </section>
    </div>
    {deckDialog && <Dialog key={`${deckDialog.kind}-${deckDialog.deck?.id ?? "new"}`} title={t(deckDialog.kind === "create" ? "newDeck" : "renameDeck")} onClose={() => { if (!flashcards.busy) setDeckDialog(null); }}><form onSubmit={event => void submitDeck(event)}>
      <label>{t("deckName")}<input autoFocus required maxLength={120} value={deckName} onChange={event => setDeckName(event.target.value)}/></label>
      {deckDialog.kind === "create" && <label>{t("linkProject")}<select value={deckProjectId} onChange={event => setDeckProjectId(event.target.value)}><option value="">{t("noLinkedProject")}</option>{availableProjects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>}
      <footer className="actions"><button type="button" className="secondary-button" disabled={flashcards.busy} onClick={() => setDeckDialog(null)}>{t("cancel")}</button><button className="primary-button" disabled={flashcards.busy || !deckName.trim()}>{flashcards.busy ? t("saving") : t("save")}</button></footer>
    </form></Dialog>}
    {cardDialog && <Dialog key={`${cardDialog.kind}-${cardDialog.card?.id ?? "new"}`} title={t(cardDialog.kind === "create" ? "newCard" : "editCard")} onClose={() => { if (!flashcards.busy) setCardDialog(null); }}><form onSubmit={event => void submitCard(event)}>
      <label>{t("questionSide")}<textarea autoFocus required rows={4} maxLength={20_000} value={cardFront} onChange={event => setCardFront(event.target.value)} placeholder={t("questionPlaceholder")}/></label>
      <label>{t("answerSide")}<textarea required rows={5} maxLength={20_000} value={cardBack} onChange={event => setCardBack(event.target.value)} placeholder={t("answerPlaceholder")}/></label>
      <label>{t("sourcePage")}<input type="number" min="1" step="1" value={cardPage} onChange={event => setCardPage(event.target.value)} placeholder={t("optional")}/></label>
      <footer className="actions"><button type="button" className="secondary-button" disabled={flashcards.busy} onClick={() => setCardDialog(null)}>{t("cancel")}</button><button className="primary-button" disabled={flashcards.busy || !cardFront.trim() || !cardBack.trim()}>{flashcards.busy ? t("saving") : t("save")}</button></footer>
    </form></Dialog>}
    {aiDialog && <Dialog title={t("generateFlashcards")} onClose={closeAiGenerator}>
      <AiModeSwitch mode={aiMode} autoAvailable={!!owner} onChange={changeAiMode}/>
      {aiMode === "manual" ? <p className="ai-manual-note">{t("aiManualHint")} {t("aiManualUsageHint")} {t("manualNoLoginHint")}</p> : !owner && <p className="form-error" role="alert">{t("loginRequired")}</p>}
      {!aiPreview ? <form onSubmit={event => void generateAiPreview(event)}>
      {aiMode === "auto" ? <>
        <p>{t("aiFlashcardHint")}</p><small className="field-hint">{t("aiFileHint")}</small>
        <label>{t("aiSource")}<select value={aiSource} disabled={aiBusy} onChange={event => { const next = event.target.value as AiSource; setAiSource(next); setManualPrompt(next === "deck" ? buildFlashcardsPrompt({ maxCards: parseFlashcardLimit(aiMaxCards, maxCardsLimit) ?? DEFAULT_FLASHCARD_LIMIT, language, options: aiOptions, text: deckExpansionSource(flashcards.cards) }) : ""); setManualJson(""); setAiError(""); }}><option value="text">{t("aiSourceText")}</option><option value="deck" disabled={!flashcards.cards.length}>{t("aiSourceDeck")}</option><option value="project" disabled={!availableProjects.length}>{t("aiSourceProject")}</option><option value="file">{t("aiSourceFile")}</option></select></label>
        {aiSource === "text" && <div className="ai-text-source"><label>{t("sourceText")}<textarea autoFocus required rows={9} maxLength={120_000} value={aiText} onChange={event => { setAiText(event.target.value); setManualPrompt(""); setManualJson(""); }} placeholder={t("sourceTextPlaceholder")}/></label><button type="button" className="secondary-button clipboard-button" disabled={aiBusy} onClick={() => void (async () => { try { const pasted = await readClipboardSource(); if (pasted.kind === "image") { setAiSource("file"); setAiFile(pasted.file); } else setAiText(pasted.text); setManualPrompt(""); setManualJson(""); setAiError(""); } catch (err) { setAiError(err instanceof Error && err.message === "CLIPBOARD_EMPTY" ? t("clipboardEmpty") : t("clipboardReadError")); } })()}><ClipboardPaste size={16}/>{t("pasteFromClipboard")}</button><small className="field-hint">{t("clipboardSourceHint")}</small></div>}
        {aiSource === "project" && <label>{t("sourceProject")}<select required value={aiProjectId} disabled={aiBusy || !availableProjects.length} onChange={event => { setAiProjectId(event.target.value); setManualPrompt(""); setManualJson(""); }}><option value="">{t("chooseProject")}</option>{availableProjects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select><small>{t("sourceProjectHint")}</small></label>}
        {aiSource === "deck" && <div className="ai-deck-source"><Layers3 size={17}/><span>{t("aiExpandDeckHint", { count: flashcards.cards.length })}</span></div>}
        {aiSource === "file" && <label className="upload-drop ai-file-drop" onDragOver={event => { event.preventDefault(); event.currentTarget.classList.add("dragging"); }} onDragLeave={event => event.currentTarget.classList.remove("dragging")} onDrop={event => { event.preventDefault(); event.currentTarget.classList.remove("dragging"); const file = event.dataTransfer.files?.[0] ?? null; setAiFile(file); setManualPrompt(""); setManualJson(""); setAiError(file && file.size > MAX_FILE_BYTES ? t("fileTooLarge") : ""); }}><span><Upload size={20}/>{t("chooseAiFile")}</span><input type="file" accept={AI_FILE_ACCEPT} disabled={aiBusy} onChange={event => { const file = event.target.files?.[0] ?? null; setAiFile(file); setManualPrompt(""); setManualJson(""); setAiError(file && file.size > MAX_FILE_BYTES ? t("fileTooLarge") : ""); }}/><small>{t("aiFileHint")}</small>{aiFile && <small>{aiFile.name}</small>}</label>}
        <AiQualityControls options={aiOptions} onChange={setAiOptions} />
        <label>{t("maxGeneratedCards")}<input type="number" min="3" max={maxCardsLimit} step="1" value={aiMaxCards} disabled={aiBusy} onChange={event => { setAiMaxCards(event.target.value); setManualPrompt(""); setManualJson(""); }}/></label>
      </> : <section className="ai-manual-panel">
        <AiQualityControls options={aiOptions} onChange={next => { setAiOptions(next); const maxCards = parseFlashcardLimit(aiMaxCards, maxCardsLimit); setManualPrompt(maxCards ? buildFlashcardsPrompt({ maxCards, language, options: next, text: aiSource === "deck" ? deckExpansionSource(flashcards.cards) : undefined }) : ""); }} />
        <label className="ai-manual-limit">{t("maxGeneratedCards")}<input type="number" min="3" max={maxCardsLimit} step="1" value={aiMaxCards} disabled={aiBusy} onChange={event => updateManualCardLimit(event.target.value)}/></label>
        <small className="field-hint">{t("aiManualMaxCardsHint")}</small>
        <div className="ai-manual-prompt"><label>{t("aiManualPrompt")}<textarea readOnly value={manualPrompt}/></label><div className="ai-manual-actions"><button type="button" className="secondary-button" disabled={!manualPrompt || aiBusy} onClick={() => void copyManualPrompt()}><ClipboardPaste size={16}/>{manualCopied ? t("copiedPrompt") : t("copyPrompt")}</button></div><ManualAiProviderLinks disabled={!manualPrompt || aiBusy} onBlocked={() => setAiError(t("popupBlocked"))}/><small className="field-hint">{t("aiManualFileWorkflow")}</small></div>
        <label className="ai-manual-json"><span>{t("aiManualJsonLabel")}</span><textarea value={manualJson} onChange={event => { setManualJson(event.target.value); setAiPreview(null); setAiError(""); }} placeholder={t("aiManualJsonPlaceholder")}/><small className="field-hint">{t("aiManualJsonHint")}</small></label>
        <label className="secondary-button ai-json-file-input"><Upload size={16}/><span>{t("uploadJsonFile")}</span><input type="file" accept=".json,application/json" disabled={aiBusy} onChange={event => void importManualJsonFile(event)}/></label>
        <button type="button" className="secondary-button" disabled={!manualPrompt || !manualJson.trim() || aiBusy} onClick={() => void validateManualResult()}>{t("validateResult")}</button>
      </section>}
      {aiError && <p className="form-error" role="alert">{aiError}</p>}{aiBusy && <p role="status">{aiMode === "manual" ? t("loading") : t("generatingFlashcards")}</p>}
      <footer className="actions"><button type="button" className="secondary-button" disabled={aiBusy} onClick={closeAiGenerator}>{t("cancel")}</button>{aiMode === "auto" && <button type="submit" className="primary-button" disabled={aiBusy}>{aiBusy ? t("generating") : t("generatePreview")}</button>}</footer>
    </form> : <>
      <p>{t("aiPreviewHint")}</p><small className="field-hint">{aiPreview.provider === "manual" ? t("manualProvider") : aiPreview.provider} · {aiPreview.model}</small>
      <label>{t("flashcardSetTitle")}<input value={aiPreview.title} maxLength={200} onChange={event => setAiPreview(current => current ? { ...current, title: event.target.value } : current)}/></label>
      <div className="ai-flashcards-preview">{aiPreview.cards.map((card, index) => <div className="ai-preview-card" key={card.id}><div className="ai-preview-card-heading"><strong>#{index + 1}</strong><button type="button" className="icon-button danger" aria-label={t("removePreviewCard")} onClick={() => removeAiCard(card.id)}><Trash2 size={15}/></button></div><label>{t("questionSide")}<textarea rows={3} maxLength={8_000} value={card.front} onChange={event => updateAiCard(card.id, { front: event.target.value })}/></label><label>{t("answerSide")}<textarea rows={4} maxLength={12_000} value={card.back} onChange={event => updateAiCard(card.id, { back: event.target.value })}/></label><label>{t("sourcePage")}<input type="number" min="1" step="1" value={card.sourcePage ?? ""} onChange={event => updateAiCard(card.id, { sourcePage: event.target.value ? Number(event.target.value) : null })}/></label></div>)}</div>
      <button type="button" className="secondary-button" disabled={aiBusy || aiPreview.cards.length >= maxCardsLimit} onClick={addAiCard}><Plus size={16}/>{t("addPreviewCard")}</button>
      {aiError && <p className="form-error" role="alert">{aiError}</p>}{aiBusy && <p role="status">{t("saving")}</p>}
      <footer className="actions"><button type="button" className="secondary-button" disabled={aiBusy} onClick={() => { setAiPreview(null); setAiError(""); }}>{t("backToSource")}</button><button type="button" className="primary-button" disabled={aiBusy || !aiPreview.cards.some(card => card.front.trim() && card.back.trim())} onClick={() => void applyAiPreview()}>{aiBusy ? t("saving") : t("applyToDeck")}</button></footer>
    </>}</Dialog>}
    {studyPlanDialog && <StudyPlanDialog owner={owner} decks={flashcards.decks} selectedDeckId={flashcards.selectedDeckId} maxCards={maxCardsLimit} onClose={() => setStudyPlanDialog(false)} onLoadCards={flashcards.loadCardsForDecks} onGenerateFile={generatePlanFile} onCreateCards={flashcards.createCardsForDeck} onRecommend={recommendPlan} onSavePlan={flashcards.saveStudyPlan}/>}
    {deleteTarget && <Dialog title={t("deleteDeck")} onClose={() => { if (!flashcards.busy) setDeleteTarget(null); }}><p>{t("deleteDeckHint", { name: deleteTarget.name })}</p><footer className="actions"><button className="secondary-button" disabled={flashcards.busy} onClick={() => setDeleteTarget(null)}>{t("cancel")}</button><button className="danger-button" disabled={flashcards.busy} onClick={() => void flashcards.removeDeck(deleteTarget).then(() => setDeleteTarget(null)).catch(() => undefined)}><Trash2 size={16}/>{t("deleteDeck")}</button></footer></Dialog>}
    {sourceView && <SourceDocumentPanel source={sourceView} onClose={() => setSourceView(null)}/>} 
  </section>;
}

function CardRow({ card, language, onEdit, onDelete, onOpenSource, busy, t }: { card: Flashcard; language: string; onEdit: () => void; onDelete: () => void; onOpenSource?: () => void; busy: boolean; t: (key: any, values?: Record<string, string | number>) => string }) {
  return <article className="flashcard-row">
    <div className="flashcard-side"><span className="flashcard-label">{t("questionSide")}</span><p>{card.front}</p></div>
    <div className="flashcard-side"><span className="flashcard-label">{t("answerSide")}</span><p>{card.back}</p></div>
    <div className="flashcard-row-meta"><span className={new Date(card.dueAt) <= new Date() ? "due" : "scheduled"}>{new Date(card.dueAt) <= new Date() ? t("dueNow") : t("nextReview", { date: formatDate(card.dueAt, language) })}</span>{card.sourcePage && (onOpenSource ? <button className="flashcard-source" title={t("openSource")} onClick={onOpenSource}><FileText size={12}/>{t("page")} {card.sourcePage}</button> : <span>{t("page")} {card.sourcePage}</span>)}</div>
    <div className="flashcard-row-actions"><button className="icon-button" aria-label={`${t("editCard")}: ${card.front}`} disabled={busy} onClick={onEdit}><Pencil size={16}/></button><button className="icon-button danger" aria-label={`${t("deleteCard")}: ${card.front}`} disabled={busy} onClick={onDelete}><Trash2 size={16}/></button></div>
  </article>;
}

function ReviewPanel({ target, finished, index, total, forgottenCount, dailyCurrent, dailyGoal, planMode, ratingBusy, showAnswer, onToggleAnswer, onRate, onBack, t }: { target: Flashcard | null; finished: boolean; index: number; total: number; forgottenCount: number; dailyCurrent: number; dailyGoal: number; planMode: boolean; ratingBusy: boolean; showAnswer: boolean; onToggleAnswer: () => void; onRate: (rating: Extract<FlashcardRating, "again" | "good">) => void; onBack: () => void; t: (key: any, values?: Record<string, string | number>) => string }) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const skipClick = useRef(false);
  const [dragX, setDragX] = useState(0);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!target || finished || (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))) return;
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); onToggleAnswer(); }
      if (showAnswer && event.key === "ArrowLeft") { event.preventDefault(); onRate("again"); }
      if (showAnswer && event.key === "ArrowRight") { event.preventDefault(); onRate("good"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finished, onRate, onToggleAnswer, showAnswer, target]);
  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (ratingBusy) return;
    skipClick.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerStart.current === null) return;
    if (showAnswer) setDragX(event.clientX - pointerStart.current.x);
  };
  const pointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerStart.current === null) return;
    const distance = event.clientX - pointerStart.current.x;
    const verticalDistance = event.clientY - pointerStart.current.y;
    const moved = Math.hypot(distance, verticalDistance) >= 12;
    pointerStart.current = null;
    setDragX(0);
    if (moved) skipClick.current = true;
    if (Math.abs(distance) >= 72 && Math.abs(distance) > Math.abs(verticalDistance) && showAnswer) {
      skipClick.current = true;
      onRate(distance > 0 ? "good" : "again");
    }
  };
  if (finished) return <div className="review-finished"><CheckCircle2 size={46}/><h3>{planMode ? t("reviewGoalComplete") : t("reviewComplete")}</h3><p>{t("reviewCompleteHint", { count: total })}</p><button className="secondary-button" onClick={onBack}>{t("backToCards")}</button></div>;
  if (!target) return <div className="review-finished"><BookOpen size={46}/><h3>{t("nothingDue")}</h3><p>{t("nothingDueHint")}</p><button className="secondary-button" onClick={onBack}>{t("backToCards")}</button></div>;
  return <div className="review-panel"><div className="review-progress"><span>{t("reviewProgress", { current: index + 1, total })}</span><span>{t("reviewKeyboardHint")}</span></div><progress className="review-session-progress" value={index} max={Math.max(1, total)} aria-label={t("sessionProgress")}/><article className={`review-card-scene ${showAnswer ? "is-flipped" : ""}`} tabIndex={0} aria-label={showAnswer ? t("answerSide") : t("questionSide")} onClick={() => { if (skipClick.current) { skipClick.current = false; return; } onToggleAnswer(); }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { pointerStart.current = null; setDragX(0); }}><div className="review-card-inner" style={{ transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)${showAnswer ? " rotateY(180deg)" : ""}` }}><div className="review-card-face front"><span className="flashcard-label">{t("questionSide")}</span><p>{target.front}</p><small>{t("flipCardHint")}</small></div><div className="review-card-face back"><span className="flashcard-label">{t("answerSide")}</span><p>{target.back}</p><small>{t("flipBackHint")}</small></div></div>{showAnswer && dragX !== 0 && <span className={`review-swipe-feedback ${dragX > 0 ? "remembered" : "forgotten"}`}>{dragX > 0 ? t("remembered") : t("forgotten")}</span>}</article>{target.sourcePage && <span className="review-source">{t("page")} {target.sourcePage}</span>}{!showAnswer ? <button className="primary-button show-answer" onClick={event => { event.stopPropagation(); onToggleAnswer(); }}>{t("showAnswer")}</button> : <div className="review-ratings"><span>{t("ratePrompt")}</span><div className="review-swipe-actions"><button className="rating-again" disabled={ratingBusy} onClick={() => onRate("again")}>← {t("swipeForgotten")}</button><button className="rating-good" disabled={ratingBusy} onClick={() => onRate("good")}>{t("swipeRemembered")} →</button></div>{forgottenCount > 0 && <small className="review-forgotten-count">{t("forgottenCount", { count: forgottenCount })}</small>}</div>}<small className="review-daily">{t("dailyGoal")}: {dailyCurrent} / {dailyGoal}</small></div>;
}
