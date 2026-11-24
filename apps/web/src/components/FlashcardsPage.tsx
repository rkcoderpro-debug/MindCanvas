import FilePicker from "./FilePicker";
import { ActivityViewport, BackButton, PageBack, PageNavigation, useActivityFocus, useListScrollReturn } from "./PageNavigation";
import type { ContentLanguage } from "../../../../packages/shared/src/contentLanguage.js";
import ContentLanguageField, { useContentLanguage } from "./ContentLanguageField";
import { useLearningActive, useLearningTool } from "../lib/learningNavigation";
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type AnimationEvent as ReactAnimationEvent } from "react";
import { ArrowLeft, BookOpen, CalendarClock, CheckCircle2, ClipboardPaste, Cloud, FileText, Flame, HardDrive, Layers3, ListOrdered, Pencil, Play, Plus, RotateCcw, Search, Shuffle, Sparkles, Target, Trash2, Zap, X } from "lucide-react";
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
import { buildFlashcardsPrompt, ManualAiValidationError, MAX_FLASHCARDS, parseManualFlashcardsDraft } from "../lib/manualAi";
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
  const [outputLanguage, setOutputLanguage] = useContentLanguage("flashcards");
  const flashcardSourceFormId = useId();
  const navigation = useLearningTool();
  const listScroll = useListScrollReturn(), deckScroll = useListScrollReturn(), learningActive = useLearningActive();
  const backToCards = () => { if (panel !== "review") return; listScroll.restore(); setPanel("cards"); navigation?.back(); };
  const localFlashcards = useFlashcards(owner);
  const flashcards = store ?? localFlashcards;
  const [panel, setPanel] = useState<"cards" | "review">("cards");
  const activityFocus = useActivityFocus(learningActive && panel === "review");
  const [studyPicker, setStudyPicker] = useState(false);
  const studyPickerId = useId();
  const studyChoice = useRef<HTMLButtonElement>(null);
  const [showDeck, setShowDeck] = useState(false);
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
  const [studyPlanDialog, setStudyPlanDialog] = useState<boolean | null>(null);
  const [aiDialog, setAiDialog] = useState(false);
  const aiDraftDeck = useRef<string | null>(null);
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
  const [manualJson, setManualJson] = useState(""), [manualCopied, setManualCopied] = useState(false);
  const [requirements, setRequirements] = useState(""), [existingJson, setExistingJson] = useState(false);
  const [readingJson, setReadingJson] = useState(false);
  const manualJsonInput = useRef<HTMLTextAreaElement>(null), previewHeading = useRef<HTMLHeadingElement>(null);
  const pendingFile = useRef(0), manualSaveId = useRef<string | null>(null), savingPreview = useRef(false);
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
  const selectedLimit = parseFlashcardLimit(aiMaxCards, maxCardsLimit);
  const editorLimit = aiMode === "manual" && existingJson ? maxCardsLimit : selectedLimit ?? maxCardsLimit;
  const previewCount = aiPreview?.cards.length ?? 0;
  const manualPrompt = useMemo(() => selectedLimit ? buildFlashcardsPrompt({ maxCards: selectedLimit, language: outputLanguage, options: aiOptions, requirements }) : "", [selectedLimit, outputLanguage, aiOptions, requirements]);
  const canApply = !!aiPreview && (aiMode === "manual" && existingJson || !!selectedLimit) && previewCount > 0 && previewCount <= editorLimit &&
    aiPreview.cards.every(card => card.front.trim() && card.back.trim() && (card.sourcePage === null || Number.isSafeInteger(card.sourcePage) && card.sourcePage >= 1));
  useEffect(() => { if (studyPicker) studyChoice.current?.focus({ preventScroll: true }); }, [studyPicker]);
  useEffect(() => { if (aiPreview) previewHeading.current?.focus({ preventScroll: true }); }, [!!aiPreview]);
  const openDeck = (id: string) => {
    deckScroll.remember();
    const show = () => { flashcards.setSelectedDeckId(id); setShowDeck(true); setStudyPicker(false); setPanel("cards"); };
    if (navigation) navigation.open(`deck:${id}`, show, () => { setShowDeck(false); deckScroll.restore(); });
    else show();
  };
  const backToDecks = () => { setShowDeck(false); deckScroll.restore(); navigation?.back(); };
  const due = flashcards.due;
  const canStartPlan = !!flashcards.activeStudyPlan && !!flashcards.todayStudyDay && !flashcards.todayStudyDay.completed;
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
    const deck = flashcards.selectedDeck?.id ?? null;
    if (deck && aiDraftDeck.current === deck) { setAiDialog(true); return; }
    aiDraftDeck.current = deck;
    const linkedProject = flashcards.selectedDeck?.projectId ?? "";
    const nextMode = owner ? "auto" : "manual";
    const defaultMaxCards = Math.min(DEFAULT_FLASHCARD_LIMIT, maxCardsLimit);
    const source: AiSource = flashcards.cards.length ? "deck" : linkedProject ? "project" : "text";
    setAiMode(nextMode); setAiSource(source); setAiProjectId(linkedProject); setAiText(""); setAiFile(null); setAiMaxCards(String(defaultMaxCards)); setAiOptions(DEFAULT_AI_OPTIONS); setAiPreview(null); setRequirements(""); setManualJson(""); setExistingJson(false); setManualCopied(false); manualSaveId.current = null; setReadingJson(false); pendingFile.current++; setAiError(""); setAiDialog(true);
  };
  const closeAiGenerator = () => { if (aiBusy) return; aiController.current?.abort(); setAiDialog(false); };
  const changeAiMode = (nextMode: AiMode) => {
    if (aiBusy || nextMode === aiMode) return;
    pendingFile.current++; setReadingJson(false); setAiMode(nextMode); setAiPreview(null); setAiError("");
  };
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
  const validateManualResult = () => {
    if (!existingJson && !selectedLimit) { setAiError(maxCardsError()); return; }
    try {
      const parsed = parseManualFlashcardsDraft(manualJson);
      setAiPreview({ title: parsed.title, provider: "manual", model: "Manual AI", cards: parsed.cards.map(card => ({ ...card, id: crypto.randomUUID() })) });
      setAiError("");
    } catch (error) {
      setAiPreview(null);
      setAiError(error instanceof ManualAiValidationError && error.code === "INVALID_JSON" ? t("manualInvalidJson") : t("flashcardInvalidImport"));
    }
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
        ? await generateFlashcardsFromFile(source.file, maxCards, request.signal, aiOptions, outputLanguage)
        : await generateFlashcards(source.text, source.documentId, maxCards, request.signal, aiOptions, outputLanguage);
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
  const addAiCard = () => setAiPreview(current => current && current.cards.length < editorLimit ? { ...current, cards: [...current.cards, { id: crypto.randomUUID(), front: "", back: "", sourcePage: null }] } : current);
  const removeAiCard = (id: string) => setAiPreview(current => current ? { ...current, cards: current.cards.filter(card => card.id !== id) } : current);
  const setJsonText = (value: string) => { setManualJson(value); setAiPreview(null); setAiError(""); };
  const importManualJsonFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const request = ++pendingFile.current;
    setReadingJson(true);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error(t("fileTooLarge"));
      const value = await file.text();
      if (!value.trim()) throw new Error(t("manualJsonFileError"));
      if (pendingFile.current === request) setJsonText(value);
    } catch (error) {
      if (pendingFile.current === request) setAiError(error instanceof Error ? error.message : t("manualJsonFileError"));
    } finally {
      if (pendingFile.current === request) setReadingJson(false);
    }
  };
  const applyAiPreview = async () => {
    if (!aiPreview || !canApply || savingPreview.current) return;
    if (aiMode === "manual" && !owner) { setAiError(t("manualRequiresLogin")); return; }
    const cards = aiPreview.cards.map(card => ({ front: card.front.trim(), back: card.back.trim(), sourcePage: card.sourcePage }));
    const questions = cards.map(card => cardQuestionKey(card.front));
    const existing = new Set(aiMode === "auto" && aiSource === "deck" ? flashcards.cards.map(card => cardQuestionKey(card.front)) : []);
    if (new Set(questions).size !== questions.length || questions.some(question => existing.has(question))) { setAiError(t("flashcardDuplicateDraft")); return; }
    savingPreview.current = true; setAiBusy(true); setAiError("");
    try {
      if (aiMode === "manual") {
        // A retry after a storage error reuses the same usage id.
        try { await consumeAiManualUsage(manualSaveId.current ??= crypto.randomUUID()); }
        catch (error) { setAiError(aiErrorMessage(error, t, "aiManualQuotaError")); return; }
      }
      await flashcards.createCards(cards);
      aiDraftDeck.current = null; manualSaveId.current = null; setAiDialog(false); setAiPreview(null);
    } catch (err) { setAiError(err instanceof Error ? err.message : t("aiFlashcardError")); }
    finally { savingPreview.current = false; setAiBusy(false); }
  };

  const submitDeck = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = deckName.trim();
    if (!name) { setFormError(t("flashcardNameRequired")); return; }
    try {
      if (deckDialog?.kind === "create") {
        const deck = await flashcards.createDeck(name, selectedProject?.id ?? null, selectedProject?.folderId ?? null);
        if (deck) openDeck(deck.id);
      }
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
    if (panel !== "review") listScroll.remember();
    const ordered = random ? shuffleCards(cards) : cards;
    setReviewCards(ordered); setReviewQueue(ordered.map(card => card.id)); setReviewContext(context);
    setReviewIndex(0); setShowAnswer(false); if (navigation) navigation.open(`review:${flashcards.selectedDeckId ?? "plan"}`, () => setPanel("review"), () => { setPanel("cards"); listScroll.restore(); }); else setPanel("review");
  };
  const startReview = (mode: "due" | "new" | "difficult" | "all" | "random" = "due") => {
    const cards = mode === "new" ? newCards : mode === "difficult" ? difficultCards : mode === "due" ? dueCards(flashcards.cards) : flashcards.cards;
    if (!cards.length) return;
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
  const generatePlanFile = async (file: File, maxCards: number, targetDeckId: string, options: AiGenerationOptions, outputLanguage: ContentLanguage) => {
    if (!owner) throw new Error(t("loginRequired"));
    if (file.size > MAX_FILE_BYTES) throw new Error(t("fileTooLarge"));
    const result = await generateFlashcardsFromFile(file, maxCards, undefined, options, outputLanguage);
    if (result.provider === "demo" || !result.cards?.length) throw new Error(t("aiDemo"));
    const targetDeck = flashcards.decks.find(deck => deck.id === targetDeckId);
    const fileResult = result as GeneratedFlashcardsFromFile;
    await saveDocumentToStorage(file, fileResult.source.id, fileResult.source.text, fileResult.source.pageCount, targetDeck?.projectId ?? undefined);
    return { title: result.title, sourceDocumentId: result.sourceDocumentId ?? fileResult.source.id, cards: result.cards.map(card => ({ ...card, id: crypto.randomUUID(), sourcePage: card.sourcePage ?? null })) };
  };
  const recommendPlan = async (cards: Flashcard[], dailyMinutes: number, options: AiGenerationOptions, outputLanguage: ContentLanguage): Promise<StudyPlanRecommendation> => {
    const fallback = { provider: "local", model: "heuristic", dailyTarget: recommendDailyTarget(cards, dailyMinutes), focus: "balanced" as const, rationale: outputLanguage === "vi" ? "Gợi ý dựa trên thẻ đến hạn và thời gian học." : "Recommendation based on due cards and study time." };
    if (!owner) return fallback;
    try {
      return await recommendStudyPlan(cards.map(card => ({ due: new Date(card.dueAt).getTime() <= Date.now(), repetitions: card.repetitions, lapses: card.lapses, intervalDays: card.intervalDays })), dailyMinutes, outputLanguage, undefined, options);
    } catch {
      return fallback;
    }
  };

  const renderPreview = () => aiPreview && <>
    <p className="field-hint">{t("aiPreviewHint")}</p>
    <fieldset className="quiz-studio-editor flashcard-draft" disabled={aiBusy}>
      <div className="flashcard-draft-list">{aiPreview.cards.map((card, index) => <div className="ai-preview-card" key={card.id}>
        <div className="ai-preview-card-heading"><strong>#{index + 1}</strong><button type="button" className="icon-button danger" aria-label={`${t("removePreviewCard")} ${index + 1}`} onClick={() => { removeAiCard(card.id); setAiError(""); }}><Trash2 size={15}/></button></div>
        <label>{t("questionSide")}<textarea rows={2} maxLength={20_000} value={card.front} onChange={event => { updateAiCard(card.id, { front: event.target.value }); setAiError(""); }}/></label>
        <label>{t("answerSide")}<textarea rows={3} maxLength={20_000} value={card.back} onChange={event => updateAiCard(card.id, { back: event.target.value })}/></label>
        <label className="flashcard-draft-page">{t("sourcePage")}<input type="number" min="1" step="1" value={card.sourcePage ?? ""} onChange={event => updateAiCard(card.id, { sourcePage: event.target.value ? Number(event.target.value) : null })}/></label>
      </div>)}</div>
      <button type="button" className="secondary-button" disabled={previewCount >= editorLimit} onClick={addAiCard}><Plus size={16}/>{t("addPreviewCard")}</button>
    </fieldset>
  </>;

  const busyActions = flashcards.busy || aiBusy || flashcards.cardsLoading;
  const deckOpened = navigation ? showDeck || panel === "review" : !!flashcards.selectedDeck;
  return <section className={`flashcards-page ${navigation ? deckOpened ? "deck-opened" : "deck-list-view" : ""}`}>
    {navigation && <PageBack active={showDeck && panel !== "review"} onBack={backToDecks}>{t("flashcardDeckList")}</PageBack>}
    <div className="flashcards-heading">
      <div><span className="eyebrow">STUDY TOOLS</span><h1>{t("flashcards")}</h1><p>{t("flashcardsHint")}</p></div>
      <div className="actions"><StorageBadge mode={flashcards.storageMode}/><button className="primary-button" onClick={openCreateDeck}><Plus size={17}/>{t("newDeck")}</button></div>
    </div>
    {(flashcards.error || formError) && <div className="flashcards-error" role="alert"><span>{flashcards.error || formError}</span><button className="icon-button" aria-label={t("close")} onClick={() => { flashcards.setError(""); setFormError(""); }}><X size={16}/></button></div>}
    <div className="flashcards-layout">
      <aside className="flashcards-decks">
        <div className="flashcards-decks-heading"><strong>{t("decks")}</strong><button className="icon-button" aria-label={t("newDeck")} onClick={openCreateDeck}><Plus size={17}/></button></div>
        {flashcards.loading ? <p>{t("loading")}</p> : !flashcards.decks.length ? <div className="flashcards-empty-small"><BookOpen size={25}/><span>{t("noDecks")}</span></div> : <><div className="learning-copy-filter compact" aria-label="Lọc bộ Flashcard"><button aria-pressed={deckFilter === "all"} onClick={() => setDeckFilter("all")}>Tất cả <small>{flashcards.decks.length}</small></button><button aria-pressed={deckFilter === "saved"} onClick={() => setDeckFilter("saved")}>Đã lưu <small>{flashcards.decks.filter(deck => !!deck.savedFrom).length}</small></button></div><div className="deck-list">{flashcards.decks.filter(deck => deckFilter === "all" || !!deck.savedFrom).length ? flashcards.decks.filter(deck => deckFilter === "all" || !!deck.savedFrom).map(deck => <div className={`deck-item ${deck.id === flashcards.selectedDeckId ? "active" : ""}`} key={deck.id}>
          <button className="deck-select" onClick={() => openDeck(deck.id)}><BookOpen size={17}/><span>{deck.name}</span><small>{flashcards.selectedDeckId === deck.id ? flashcards.cards.length : ""}</small></button>
          <button className="icon-button deck-action" aria-label={`${t("renameDeck")}: ${deck.name}`} onClick={() => openRenameDeck(deck)}><Pencil size={14}/></button>
        </div>) : <p className="learning-copy-empty">Chưa có bộ thẻ nào được lưu từ mục chia sẻ.</p>}</div></>}
      </aside>
      <section className="flashcards-content" hidden={!deckOpened}>
        {!flashcards.selectedDeck ? <div className="flashcards-empty"><BookOpen size={48}/><h2>{t("chooseDeck")}</h2><p>{t("chooseDeckHint")}</p><button className="primary-button" onClick={openCreateDeck}><Plus size={17}/>{t("newDeck")}</button></div> : <>
          <header className="flashcards-content-heading">
            <div><div className="flashcards-title-line"><BookOpen size={21}/><h2>{flashcards.selectedDeck.name}</h2></div>{flashcards.selectedDeck.savedFrom && <small className="learning-copy-provenance">Đã lưu từ {flashcards.selectedDeck.savedFrom.ownerName} · {flashcards.selectedDeck.savedFrom.title}</small>}<div className="flashcards-meta"><span>{t("cardCount", { count: flashcards.cards.length })}</span><span>·</span><span>{t("dueCount", { count: due.length })}</span>{flashcards.selectedDeck.projectId && <><span>·</span><span><FileText size={13}/>{availableProjects.find(project => project.id === flashcards.selectedDeck?.projectId)?.title ?? t("linkedProject")}</span></>}</div></div>
            <div className="actions flashcards-main-actions">
              <button type="button" className="primary-button" disabled={busyActions} aria-expanded={studyPicker} aria-controls={studyPickerId} onClick={() => setStudyPicker(value => !value)}><Play size={16}/>{t("flashcardStartStudy")}</button>
              <button type="button" className="secondary-button flashcards-ai-trigger" disabled={busyActions} onClick={openAiGenerator}><Sparkles size={16}/>{t("generateFlashcards")}</button>
              <button type="button" className="secondary-button" disabled={busyActions} onClick={openCreateCard}><Plus size={16}/>{t("newCard")}</button>
              <details className="flashcards-more-actions"><summary>{t("flashcardOtherTools")}</summary><div onClick={event => { if ((event.target as HTMLElement).closest("button")) { const menu = event.currentTarget.closest("details"); if (menu) menu.open = false; } }}>
                <button type="button" disabled={busyActions} onClick={() => setStudyPlanDialog(true)}><CalendarClock size={16}/>{flashcards.activeStudyPlan ? t("manageStudyPlan") : t("createStudyPlan")}</button>
                <LearningShareButton kind="flashcard" id={flashcards.selectedDeck.id} title={flashcards.selectedDeck.name} plan={accountPlan} available={!!owner && flashcards.selectedDeck.source === "cloud" && flashcards.cards.every(card => card.source === "cloud")}/>
                <button type="button" className="danger" aria-label={t("deleteDeck")} onClick={() => setDeleteTarget(flashcards.selectedDeck)}><Trash2 size={16}/>{t("deleteDeck")}</button>
              </div></details>
            </div>
          </header>
          <section id={studyPickerId} className="study-mode-toolbar" hidden={!studyPicker}>
            <div className="study-mode-intro"><strong><Target size={16}/>{t("studyMode")}</strong><p>{t("flashcardChooseStudy")}</p></div>
            <div className="study-mode-options">
              <button ref={studyChoice} className="secondary-button" disabled={!flashcards.cards.length || busyActions} onClick={() => startReview("all")}><ListOrdered size={15}/>{t("studyOrder")}</button>
              <button className="secondary-button" disabled={!flashcards.cards.length || busyActions} onClick={() => startReview("random")}><Shuffle size={15}/>{t("random")}</button>
              <button className="secondary-button" disabled={!newCards.length || busyActions} onClick={() => startReview("new")}><Zap size={15}/>{t("flashcardNewOnly")} <small>{newCards.length}</small></button>
              <button className="secondary-button" disabled={!due.length || busyActions} onClick={() => startReview("due")}><RotateCcw size={15}/>{t("reviewDue")} <small>{due.length}</small></button>
              {flashcards.activeStudyPlan && <button className="secondary-button" disabled={!canStartPlan || busyActions} onClick={() => void startPlanReview()}><CalendarClock size={15}/>{t("startPlanReview")}</button>}
            </div>
            {!flashcards.cards.length && !canStartPlan && <p className="field-hint">{t("noCardsHint")}</p>}
          </section>
          <div className="study-overview">
            <button disabled={!due.length} onClick={() => startReview("due")}><span><RotateCcw size={16}/>{t("reviewDue")}</span><strong>{due.length}</strong></button>
            <button disabled={!newCards.length} onClick={() => startReview("new")}><span><Zap size={16}/>{t("newCards")}</span><strong>{newCards.length}</strong></button>
            <button disabled={!difficultCards.length} onClick={() => startReview("difficult")}><span><Target size={16}/>{t("difficultCards")}</span><strong>{difficultCards.length}</strong></button>
            <div><span><CheckCircle2 size={16}/>{t("learnedCards")}</span><strong>{learnedCards.length}</strong></div>
          </div>
          <div className={`study-plan-banner ${flashcards.activeStudyPlan ? "has-plan" : "manual-mode"}`}><div className="study-plan-banner-main"><span className="streak-flame"><Flame size={19}/></span><div><span className="study-plan-kicker">{flashcards.activeStudyPlan ? t("aiPlanToday") : t("manualPractice")}</span><strong>{flashcards.streak.current} {t("streakDays")}</strong><small>{flashcards.activeStudyPlan ? `${flashcards.streak.todayProgress} / ${flashcards.streak.todayTarget} ${t("targetCards").toLocaleLowerCase()}` : t("manualStreakHint")}</small></div></div><div className="study-plan-banner-progress"><div><span>{flashcards.activeStudyPlan ? flashcards.activeStudyPlan.name : t("streak")}</span><b>{flashcards.streak.todayCompleted ? t("streakEarned") : flashcards.activeStudyPlan ? t("streakLocked") : t("studyOneCard")}</b></div><progress value={Math.min(flashcards.streak.todayProgress, Math.max(1, flashcards.streak.todayTarget))} max={Math.max(1, flashcards.streak.todayTarget)}/></div><div className="streak-best"><span>{t("bestStreak")}</span><strong>{flashcards.streak.best}</strong></div></div>
          <div className="flashcard-tabs" role="tablist"><button role="tab" aria-selected={panel === "cards"} className={panel === "cards" ? "active" : ""} onClick={backToCards}>{t("allCards")}</button><button role="tab" aria-selected={panel === "review"} className={panel === "review" ? "active" : ""} disabled={!due.length} onClick={() => startReview("due")}><RotateCcw size={15}/>{t("review")}{due.length > 0 && <span>{due.length}</span>}</button></div>
          {panel === "review" ? <ActivityViewport ref={activityFocus} className="activity-screen activity-flashcards"><PageNavigation quickActions back={<BackButton onClick={backToCards}>{t("flashcardBackToDeck")}</BackButton>} title={flashcards.selectedDeck.name}/><ReviewPanel hideReturnButton target={reviewTarget} finished={reviewFinished} index={reviewIndex} total={reviewQueue.length} forgottenCount={flashcards.todayStudyDay?.forgottenCardIds.length ?? 0} dailyCurrent={flashcards.streak.todayProgress} dailyGoal={flashcards.streak.todayTarget} planMode={!!reviewContext?.planId} ratingBusy={ratingBusy} showAnswer={showAnswer} onToggleAnswer={() => setShowAnswer(value => !value)} onRate={rating => void rateReview(rating)} onBack={backToCards} t={t}/></ActivityViewport> : flashcards.cardsLoading ? <p className="flashcards-loading">{t("loading")}</p> : !flashcards.cards.length ? <div className="flashcards-empty cards"><BookOpen size={38}/><h3>{t("noCards")}</h3><p>{t("noCardsHint")}</p><button className="secondary-button" onClick={openCreateCard}><Plus size={16}/>{t("newCard")}</button></div> : <><label className="card-search"><Search size={16}/><input aria-label={t("cardSearch")} placeholder={t("cardSearch")} value={cardQuery} onChange={event => setCardQuery(event.target.value)}/></label>{!filteredCards.length ? <div className="command-empty">{t("noResults")}</div> : <div className="cards-list">{filteredCards.map(card => <CardRow key={card.id} card={card} language={language} onEdit={() => openEditCard(card)} onDelete={() => void flashcards.removeCard(card)} onOpenSource={card.sourcePage && flashcards.selectedDeck?.projectId ? () => void openCardSource(card) : undefined} busy={flashcards.busy} t={t}/>)}</div>}</>}
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
    {aiDialog && <Dialog workspace className={`quiz-studio-dialog flashcard-studio ${aiMode === "manual" ? "quiz-studio-ai_manual" : ""}`} title={t("generateFlashcards")} onClose={closeAiGenerator} dismissible={!aiBusy}
      toolbar={<div className="quiz-studio-toolbar"><AiModeSwitch mode={aiMode} autoAvailable={!!owner} disabled={aiBusy} onChange={changeAiMode}/></div>}
      footer={<footer className="quiz-studio-footer">
        <div className="quiz-studio-save-status">
          {aiPreview && <span role="status" className={previewCount > editorLimit ? "form-error" : ""}><strong>{t("flashcardDraftCount", { count: previewCount, max: editorLimit })}</strong>{previewCount > editorLimit && ` · ${t("flashcardTrimDraft", { count: previewCount - editorLimit })}`}</span>}
          {aiError && <small className="form-error" role="alert">{aiError}</small>}
          {aiPreview && !canApply && previewCount <= editorLimit && !aiError && <small className="field-hint">{t("flashcardCompleteDraft")}</small>}
        </div>
        <div className="quiz-studio-footer-actions">
          {aiPreview ? <>
            <button type="button" className="secondary-button" disabled={aiBusy} onClick={() => { setAiPreview(null); setAiError(""); if (aiMode === "manual") requestAnimationFrame(() => manualJsonInput.current?.focus()); }}><ArrowLeft size={16}/>{t(aiMode === "manual" ? "quizBackToJson" : "backToSource")}</button>
            <button type="button" className="primary-button" disabled={aiBusy || !canApply} onClick={() => void applyAiPreview()}>{t(aiBusy ? "saving" : "applyToDeck")}</button>
          </> : aiMode === "manual" ?
            <button type="button" className="primary-button" disabled={aiBusy || readingJson || !manualJson.trim() || (!existingJson && !selectedLimit)} onClick={validateManualResult}>{t("validateResult")}</button> :
            <button type="submit" form={flashcardSourceFormId} className="primary-button" disabled={aiBusy || !selectedLimit}>{t(aiBusy ? "generating" : "generatePreview")}</button>}
        </div>
      </footer>}>
      {aiMode === "auto" ? aiPreview ? renderPreview() : <form id={flashcardSourceFormId} className="quiz-create-form" onSubmit={event => void generateAiPreview(event)}>
        <ContentLanguageField value={outputLanguage} onChange={setOutputLanguage} disabled={aiBusy}/>
        <p>{t("aiFlashcardHint")}</p><small className="field-hint">{t("aiFileHint")}</small>
        <label>{t("aiSource")}<select value={aiSource} disabled={aiBusy} onChange={event => { const next = event.target.value as AiSource; setAiSource(next); setAiError(""); }}><option value="text">{t("aiSourceText")}</option><option value="deck" disabled={!flashcards.cards.length}>{t("aiSourceDeck")}</option><option value="project" disabled={!availableProjects.length}>{t("aiSourceProject")}</option><option value="file">{t("aiSourceFile")}</option></select></label>
        {aiSource === "text" && <div className="ai-text-source"><label>{t("sourceText")}<textarea autoFocus required rows={9} maxLength={120_000} value={aiText} onChange={event => { setAiText(event.target.value); }} placeholder={t("sourceTextPlaceholder")}/></label><button type="button" className="secondary-button clipboard-button" disabled={aiBusy} onClick={() => void (async () => { try { const pasted = await readClipboardSource(); if (pasted.kind === "image") { setAiSource("file"); setAiFile(pasted.file); } else setAiText(pasted.text); setAiError(""); } catch (err) { setAiError(err instanceof Error && err.message === "CLIPBOARD_EMPTY" ? t("clipboardEmpty") : t("clipboardReadError")); } })()}><ClipboardPaste size={16}/>{t("pasteFromClipboard")}</button><small className="field-hint">{t("clipboardSourceHint")}</small></div>}
        {aiSource === "project" && <label>{t("sourceProject")}<select required value={aiProjectId} disabled={aiBusy || !availableProjects.length} onChange={event => { setAiProjectId(event.target.value); }}><option value="">{t("chooseProject")}</option>{availableProjects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select><small>{t("sourceProjectHint")}</small></label>}
        {aiSource === "deck" && <div className="ai-deck-source"><Layers3 size={17}/><span>{t("aiExpandDeckHint", { count: flashcards.cards.length })}</span></div>}
        {aiSource === "file" && <FilePicker label={t("chooseAiFile")} accept={AI_FILE_ACCEPT} disabled={aiBusy}
          fileNames={aiFile ? [aiFile.name] : []} description={t("aiFileHint")}
          onDropFiles={files => { const file = files[0]; setAiFile(file); setAiError(file.size > MAX_FILE_BYTES ? t("fileTooLarge") : ""); }}
          onChange={event => { const file = event.target.files?.[0] ?? null; setAiFile(file); setAiError(file && file.size > MAX_FILE_BYTES ? t("fileTooLarge") : ""); }}/>}
        <AiQualityControls options={aiOptions} onChange={setAiOptions} />
        <label>{t("maxGeneratedCards")}<input type="number" min="3" max={maxCardsLimit} step="1" value={aiMaxCards} disabled={aiBusy} onChange={event => { setAiMaxCards(event.target.value); }}/></label>
      </form> : <div className="quiz-studio-panes">
        <section className="quiz-studio-pane quiz-studio-prompt">
          <h3><span aria-hidden="true">1</span>{t("quizPromptPane")}</h3>
          {existingJson && <p className="field-hint quiz-studio-mode-hint">{t("flashcardReadyJsonHint")}</p>}
          <fieldset disabled={existingJson || aiBusy} className="quiz-studio-settings">
            <ContentLanguageField value={outputLanguage} onChange={value => { setOutputLanguage(value); setManualCopied(false); }} disabled={existingJson || aiBusy}/>
            <AiQualityControls options={aiOptions} onChange={value => { setAiOptions(value); setManualCopied(false); }}/>
            <label>{t("quizRequirements")}<textarea rows={4} maxLength={12_000} value={requirements} onChange={event => { setRequirements(event.target.value); setManualCopied(false); }} placeholder={t("flashcardRequirementsHint")}/></label>
            <label>{t("maxGeneratedCards")}<input type="number" min="3" max={maxCardsLimit} step="1" value={aiMaxCards} onChange={event => { setAiMaxCards(event.target.value); setManualCopied(false); setAiError(""); }} aria-invalid={!existingJson && !selectedLimit}/></label>
            {!existingJson && !selectedLimit && <small className="form-error">{maxCardsError()}</small>}
            <button type="button" className="secondary-button quiz-copy-prompt" disabled={!manualPrompt || existingJson} onClick={() => void copyManualPrompt()}><ClipboardPaste size={16}/>{t(manualCopied ? "copiedPrompt" : "copyPrompt")}</button>
            {!existingJson && <details className="quiz-editor-help"><summary>{t("aiManualPrompt")}</summary><textarea aria-label={t("aiManualPrompt")} rows={6} readOnly value={manualPrompt}/></details>}
            <ManualAiProviderLinks disabled={!manualPrompt || existingJson || aiBusy} onBlocked={() => setAiError(t("popupBlocked"))}/>
          </fieldset>
        </section>
        <section className="quiz-studio-pane quiz-studio-import">
          <h3 ref={previewHeading} tabIndex={-1}><span aria-hidden="true">2</span>{t(aiPreview ? "flashcardPreviewHeading" : "quizImportPane")}</h3>
          {aiPreview ? renderPreview() : <div className="quiz-studio-json">
            <label className="quiz-json-check"><input type="checkbox" checked={existingJson} onChange={event => { setExistingJson(event.target.checked); setAiError(""); }}/>{t("quizReadyJson")}</label>
            <label>{t(existingJson ? "quizJsonContent" : "aiManualJsonLabel")}<textarea ref={manualJsonInput} rows={10} spellCheck={false} className="quiz-json-input" value={manualJson} onChange={event => { pendingFile.current++; setReadingJson(false); setJsonText(event.target.value); }} placeholder={t("quizJsonPlaceholder")}/></label>
            {existingJson && <FilePicker layout="inline" label={t("quizChooseJson")} accept=".json,application/json" disabled={readingJson}
              description={`${t("filePickerJson")} · ${t("filePickerMaxFile", { size: "10 MB" })}`} onChange={event => void importManualJsonFile(event)}/>}
            {readingJson && <small role="status">{t("loading")}</small>}
          </div>}
        </section>
      </div>}
    </Dialog>}
    {studyPlanDialog !== null && <StudyPlanDialog visible={studyPlanDialog} onSavedClose={() => setStudyPlanDialog(null)} owner={owner} decks={flashcards.decks} selectedDeckId={flashcards.selectedDeckId} maxCards={maxCardsLimit} onClose={() => setStudyPlanDialog(false)} onLoadCards={flashcards.loadCardsForDecks} onGenerateFile={generatePlanFile} onCreateCards={flashcards.createCardsForDeck} onRecommend={recommendPlan} onSavePlan={flashcards.saveStudyPlan}/>}
    {deleteTarget && <Dialog title={t("deleteDeck")} onClose={() => { if (!flashcards.busy) setDeleteTarget(null); }}><p>{t("deleteDeckHint", { name: deleteTarget.name })}</p><footer className="actions"><button className="secondary-button" disabled={flashcards.busy} onClick={() => setDeleteTarget(null)}>{t("cancel")}</button><button className="danger-button" disabled={flashcards.busy} onClick={() => void flashcards.removeDeck(deleteTarget).then(() => { setDeleteTarget(null); backToDecks(); }).catch(() => undefined)}><Trash2 size={16}/>{t("deleteDeck")}</button></footer></Dialog>}
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

export function ReviewPanel({ target, finished, index, total, forgottenCount, dailyCurrent, dailyGoal, planMode, ratingBusy, showAnswer, onToggleAnswer, onRate, onBack, t, hideReturnButton = false }: { hideReturnButton?: boolean; target: Flashcard | null; finished: boolean; index: number; total: number; forgottenCount: number; dailyCurrent: number; dailyGoal: number; planMode: boolean; ratingBusy: boolean; showAnswer: boolean; onToggleAnswer: () => void; onRate: (rating: Extract<FlashcardRating, "again" | "good">) => void; onBack: () => void; t: (key: any, values?: Record<string, string | number>) => string }) {
  const learningActive = useLearningActive();
  const pointerStart = useRef<{ x: number; y: number; id: number; axis?: "x" | "y" } | null>(null);
  const skipClick = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [turn, setTurn] = useState<"front" | "back" | null>(null);
  const answerRef = useRef<HTMLButtonElement>(null);
  const sceneRef = useRef<HTMLElement>(null);
  const flip = () => {
    if (ratingBusy) return;
    if (answerRef.current && document.activeElement === answerRef.current) sceneRef.current?.focus({ preventScroll: true });
    setTurn(showAnswer ? "front" : "back");
    onToggleAnswer();
  };
  useEffect(() => { pointerStart.current = null; skipClick.current = false; setDragX(0); setTurn(null); }, [target?.id, index]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!target || finished || ratingBusy || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
        (event.target instanceof HTMLElement && event.target.closest("button,input,textarea,select,summary,a,[contenteditable=true],dialog"))) return;
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); flip(); }
      if (showAnswer && event.key === "ArrowLeft") { event.preventDefault(); onRate("again"); }
      if (showAnswer && event.key === "ArrowRight") { event.preventDefault(); onRate("good"); }
    };
    if (!learningActive) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [learningActive, finished, onRate, onToggleAnswer, ratingBusy, showAnswer, target]);

  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (ratingBusy || event.button !== 0 || event.isPrimary === false || pointerStart.current) return;
    skipClick.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    // Leave touch scrolling to the browser. Capture mouse drags even when they leave the card.
    if (event.pointerType === "mouse") {
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
  };
  const pointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const start = pointerStart.current;
    if (!start || start.id !== event.pointerId) return;
    const x = event.clientX - start.x, y = event.clientY - start.y;
    if (!start.axis && Math.hypot(x, y) >= 10) start.axis = Math.abs(x) > Math.abs(y) ? "x" : "y";
    if (showAnswer && start.axis === "x") setDragX(x);
  };
  const cancelPointer = () => { pointerStart.current = null; setDragX(0); };
  const pointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const start = pointerStart.current;
    if (!start || start.id !== event.pointerId) return;
    const x = event.clientX - start.x, y = event.clientY - start.y;
    cancelPointer();
    if (start.axis || Math.hypot(x, y) >= 10) skipClick.current = true;
    if (!ratingBusy && showAnswer && start.axis !== "y" && Math.abs(x) >= 72 && Math.abs(x) > Math.abs(y)) onRate(x > 0 ? "good" : "again");
  };
  const endTurn = (event: ReactAnimationEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) setTurn(null); };
  if (finished) return <div className="review-finished"><CheckCircle2 size={46}/><h3>{planMode ? t("reviewGoalComplete") : t("reviewComplete")}</h3><p>{t("reviewCompleteHint", { count: total })}</p>{!hideReturnButton && <button className="secondary-button" onClick={onBack}>{t("backToCards")}</button>}</div>;
  if (!target) return <div className="review-finished"><BookOpen size={46}/><h3>{t("nothingDue")}</h3><p>{t("nothingDueHint")}</p>{!hideReturnButton && <button className="secondary-button" onClick={onBack}>{t("backToCards")}</button>}</div>;
  return <div className="review-panel"><div className="review-progress"><span>{t("reviewProgress", { current: index + 1, total })}</span><span className="review-keyboard-hint">{t("reviewKeyboardHint")}</span></div><progress className="review-session-progress" value={index} max={Math.max(1, total)} aria-label={t("sessionProgress")}/><article className={`review-card-scene ${showAnswer ? "is-flipped" : ""}`} role="button" aria-pressed={showAnswer} aria-disabled={ratingBusy} tabIndex={0} aria-label={showAnswer ? t("answerSide") : t("questionSide")} ref={sceneRef} onClick={() => { if (skipClick.current) { skipClick.current = false; return; } flip(); }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelPointer} onLostPointerCapture={cancelPointer} onDragStart={event => event.preventDefault()}><div className="review-card-inner" style={{ transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)` }}><div key={`${target.id}:${showAnswer ? "back" : "front"}`} className={`review-card-face ${showAnswer ? "back" : "front"}`} data-turn={turn ?? undefined} onAnimationEnd={endTurn}><span className="flashcard-label">{showAnswer ? t("answerSide") : t("questionSide")}</span><div className="review-card-text" tabIndex={0}><p>{showAnswer ? target.back : target.front}</p></div><small>{showAnswer ? t("flipBackHint") : t("flipCardHint")}</small></div></div>{showAnswer && dragX !== 0 && <span className={`review-swipe-feedback ${dragX > 0 ? "remembered" : "forgotten"}`}>{dragX > 0 ? t("remembered") : t("forgotten")}</span>}</article><div className="review-controls">{target.sourcePage && <span className="review-source">{t("page")} {target.sourcePage}</span>}{!showAnswer ? <button ref={answerRef} className="primary-button show-answer" disabled={ratingBusy} onClick={flip}>{t("showAnswer")}</button> : <div className="review-ratings"><span>{t("ratePrompt")}</span><div className="review-swipe-actions"><button className="rating-again" disabled={ratingBusy} onClick={() => onRate("again")}>← {t("swipeForgotten")}</button><button className="rating-good" disabled={ratingBusy} onClick={() => onRate("good")}>{t("swipeRemembered")} →</button></div>{forgottenCount > 0 && <small className="review-forgotten-count">{t("forgottenCount", { count: forgottenCount })}</small>}</div>}<small className="review-daily">{t("dailyGoal")}: {dailyCurrent} / {dailyGoal}</small></div></div>;
}
