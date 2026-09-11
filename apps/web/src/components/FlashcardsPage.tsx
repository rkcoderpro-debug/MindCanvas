import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CheckCircle2, Cloud, FileText, HardDrive, Pencil, Play, Plus, RotateCcw, Search, Sparkles, Target, Trash2, Zap, X } from "lucide-react";
import type { BoardState } from "@mindcanvas/shared";
import type { Project } from "../lib/projectStore";
import { fetchBoard, readCache } from "../lib/projectStore";
import { dueCards, type Flashcard, type FlashcardDeck, type FlashcardRating } from "../lib/flashcards";
import { useFlashcards } from "../hooks/useFlashcards";
import { useLanguage } from "../lib/i18n";
import { generateFlashcards, uploadPdf, type GeneratedFlashcard } from "../lib/api";
import { getDocumentSource, saveDocumentToStorage } from "../lib/supabase";
import { MAX_FILE_BYTES } from "../lib/board";
import Dialog from "./Dialog";
import SourceDocumentPanel, { type SourceDocumentView } from "./SourceDocumentPanel";

type DeckDialog = { kind: "create" | "rename"; deck?: FlashcardDeck };
type CardDialog = { kind: "create" | "edit"; card?: Flashcard };
type AiSource = "text" | "project" | "pdf";
type AiPreviewCard = Omit<GeneratedFlashcard, "sourcePage"> & { id: string; sourcePage: number | null };
type AiPreview = { title: string; provider: string; model: string; cards: AiPreviewCard[]; sourceDocumentId?: string };

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

function StorageBadge({ mode }: { mode: "cloud" | "local" }) {
  const { t } = useLanguage();
  return <span className={`flashcard-storage ${mode}`} title={mode === "cloud" ? t("flashcardCloudHint") : t("flashcardLocalHint")}>
    {mode === "cloud" ? <Cloud size={14}/> : <HardDrive size={14}/>} {mode === "cloud" ? t("cloud") : t("local")}
  </span>;
}

export default function FlashcardsPage({ owner, projects }: { owner: string | null; projects: Project[] }) {
  const { t, language } = useLanguage();
  const flashcards = useFlashcards(owner);
  const [panel, setPanel] = useState<"cards" | "review">("cards");
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
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [cardQuery, setCardQuery] = useState("");
  const [sourceView, setSourceView] = useState<SourceDocumentView | null>(null);
  const progressKey = `mindcanvas:review-progress:${owner ?? "guest"}:${new Date().toISOString().slice(0, 10)}`;
  const [dailyGoal, setDailyGoal] = useState(() => { try { return Math.max(5, Math.min(100, Number(localStorage.getItem("mindcanvas:daily-goal")) || 20)); } catch { return 20; } });
  const [reviewedToday, setReviewedToday] = useState(() => { try { return Math.max(0, Number(localStorage.getItem(progressKey)) || 0); } catch { return 0; } });
  const [aiDialog, setAiDialog] = useState(false);
  const [aiSource, setAiSource] = useState<AiSource>("text");
  const [aiText, setAiText] = useState("");
  const [aiProjectId, setAiProjectId] = useState("");
  const [aiPdf, setAiPdf] = useState<File | null>(null);
  const [aiMaxCards, setAiMaxCards] = useState("20");
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const aiController = useRef<AbortController | null>(null);
  useEffect(() => () => aiController.current?.abort(), []);

  const availableProjects = useMemo(() => projects.filter(project => !project.deletedAt).sort((a, b) => a.title.localeCompare(b.title, language)), [projects, language]);
  const selectedProject = availableProjects.find(project => project.id === deckProjectId);
  const aiProject = availableProjects.find(project => project.id === aiProjectId);
  const due = flashcards.due;
  const newCards = flashcards.cards.filter(card => card.repetitions === 0);
  const difficultCards = flashcards.cards.filter(card => card.lapses > 0).sort((a, b) => b.lapses - a.lapses);
  const learnedCards = flashcards.cards.filter(card => card.repetitions >= 2);
  const filteredCards = flashcards.cards.filter(card => `${card.front} ${card.back}`.toLocaleLowerCase().includes(cardQuery.trim().toLocaleLowerCase()));
  const reviewTarget = reviewQueue[reviewIndex] ? flashcards.cards.find(card => card.id === reviewQueue[reviewIndex]) ?? null : null;
  const reviewFinished = panel === "review" && (!reviewQueue.length || reviewIndex >= reviewQueue.length || !reviewTarget);

  const openCreateDeck = () => { setDeckName(""); setDeckProjectId(""); setFormError(""); setDeckDialog({ kind: "create" }); };
  const openRenameDeck = (deck: FlashcardDeck) => { setDeckName(deck.name); setDeckProjectId(deck.projectId ?? ""); setFormError(""); setDeckDialog({ kind: "rename", deck }); };
  const openCreateCard = () => { setCardFront(""); setCardBack(""); setCardPage(""); setFormError(""); setCardDialog({ kind: "create" }); };
  const openEditCard = (card: Flashcard) => { setCardFront(card.front); setCardBack(card.back); setCardPage(card.sourcePage ? String(card.sourcePage) : ""); setFormError(""); setCardDialog({ kind: "edit", card }); };
  const openAiGenerator = () => {
    if (!owner) { setAiError(t("loginRequired")); return; }
    const linkedProject = flashcards.selectedDeck?.projectId ?? "";
    setAiSource(linkedProject ? "project" : "text"); setAiProjectId(linkedProject); setAiText(""); setAiPdf(null); setAiMaxCards("20"); setAiPreview(null); setAiError(""); setAiDialog(true);
  };
  const closeAiGenerator = () => { if (aiBusy) return; aiController.current?.abort(); setAiDialog(false); setAiPreview(null); setAiError(""); };
  const sourceForAi = async (signal: AbortSignal) => {
    if (aiSource === "text") {
      const text = aiText.trim();
      if (!text) throw new Error(t("aiTextRequired"));
      return { text, documentId: undefined as string | undefined };
    }
    if (aiSource === "project") {
      if (!aiProjectId) throw new Error(t("aiProjectRequired"));
      const cachedEntry = readCache(owner).find(project => project.id === aiProjectId);
      const board = cachedEntry && (cachedEntry.pending || !navigator.onLine) ? cachedEntry.board : await fetchBoard(owner!, aiProjectId);
      const text = boardToStudyText(board);
      if (!text.trim() || text.trim() === `Title: ${board.title}`) throw new Error(t("aiProjectEmpty"));
      return { text, documentId: undefined as string | undefined };
    }
    if (!aiPdf) throw new Error(t("aiPdfRequired"));
    if (aiPdf.size > MAX_FILE_BYTES) throw new Error(t("fileTooLarge"));
    const doc = await uploadPdf(aiPdf, signal);
    await saveDocumentToStorage(aiPdf, doc.id, doc.text, doc.pageCount, flashcards.selectedDeck?.projectId ?? undefined);
    return { text: doc.text, documentId: doc.id };
  };
  const generateAiPreview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!owner || aiBusy) return;
    const maxCards = Number.parseInt(aiMaxCards, 10);
    if (!Number.isInteger(maxCards) || maxCards < 3 || maxCards > 50) { setAiError(t("aiMaxCardsInvalid")); return; }
    const request = new AbortController(); aiController.current = request; setAiBusy(true); setAiError(""); setAiPreview(null);
    try {
      const source = await sourceForAi(request.signal);
      if (request.signal.aborted) return;
      const result = await generateFlashcards(source.text, source.documentId, maxCards, request.signal);
      if (request.signal.aborted) return;
      if (result.provider === "demo" || !result.cards?.length || result.cards.length > 50) throw new Error(t("aiDemo"));
      setAiPreview({ title: result.title, provider: result.provider, model: result.model, sourceDocumentId: result.sourceDocumentId, cards: result.cards.map(card => ({ ...card, id: crypto.randomUUID(), sourcePage: card.sourcePage ?? null })) });
    } catch (err) { if (!request.signal.aborted) setAiError(`${t("aiFlashcardError")} ${err instanceof Error ? err.message : ""}`.trim()); }
    finally { if (!request.signal.aborted) setAiBusy(false); }
  };
  const updateAiCard = (id: string, patch: Partial<AiPreviewCard>) => setAiPreview(current => current ? { ...current, cards: current.cards.map(card => card.id === id ? { ...card, ...patch } : card) } : current);
  const addAiCard = () => setAiPreview(current => current ? { ...current, cards: [...current.cards, { id: crypto.randomUUID(), front: "", back: "", sourcePage: null }] } : current);
  const removeAiCard = (id: string) => setAiPreview(current => current ? { ...current, cards: current.cards.filter(card => card.id !== id) } : current);
  const applyAiPreview = async () => {
    if (!aiPreview) return;
    const cards = aiPreview.cards.map(card => ({ front: card.front.trim(), back: card.back.trim(), sourcePage: card.sourcePage })).filter(card => card.front && card.back);
    if (!cards.length) { setAiError(t("flashcardSidesRequired")); return; }
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

  const startReview = (mode: "due" | "new" | "difficult" = "due") => {
    const cards = mode === "new" ? newCards : mode === "difficult" ? difficultCards : dueCards(flashcards.cards);
    setReviewQueue(cards.map(card => card.id));
    setReviewIndex(0); setShowAnswer(false); setPanel("review");
  };

  const rateReview = async (rating: FlashcardRating) => {
    if (!reviewTarget) return;
    try {
      await flashcards.reviewCard(reviewTarget, rating);
      setReviewedToday(current => { const next = current + 1; try { localStorage.setItem(progressKey, String(next)); } catch {} return next; });
      setShowAnswer(false); setReviewIndex(index => index + 1);
    } catch { /* the hook keeps the visible error and the card stays on screen */ }
  };
  const openCardSource = async (card: Flashcard) => {
    if (!card.sourcePage || !flashcards.selectedDeck?.projectId) return;
    setFormError("");
    try { const source = await getDocumentSource({ projectId: flashcards.selectedDeck.projectId }); setSourceView({ url: source.url, name: source.name, page: card.sourcePage }); }
    catch { setFormError(t("sourceError")); }
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
        {flashcards.loading ? <p>{t("loading")}</p> : !flashcards.decks.length ? <div className="flashcards-empty-small"><BookOpen size={25}/><span>{t("noDecks")}</span></div> : <div className="deck-list">{flashcards.decks.map(deck => <div className={`deck-item ${deck.id === flashcards.selectedDeckId ? "active" : ""}`} key={deck.id}>
          <button className="deck-select" onClick={() => { flashcards.setSelectedDeckId(deck.id); setPanel("cards"); }}><BookOpen size={17}/><span>{deck.name}</span><small>{flashcards.selectedDeckId === deck.id ? flashcards.cards.length : ""}</small></button>
          <button className="icon-button deck-action" aria-label={`${t("renameDeck")}: ${deck.name}`} onClick={() => openRenameDeck(deck)}><Pencil size={14}/></button>
        </div>)}</div>}
      </aside>
      <section className="flashcards-content">
        {!flashcards.selectedDeck ? <div className="flashcards-empty"><BookOpen size={48}/><h2>{t("chooseDeck")}</h2><p>{t("chooseDeckHint")}</p><button className="primary-button" onClick={openCreateDeck}><Plus size={17}/>{t("newDeck")}</button></div> : <>
          <header className="flashcards-content-heading">
            <div><div className="flashcards-title-line"><BookOpen size={21}/><h2>{flashcards.selectedDeck.name}</h2></div><div className="flashcards-meta"><span>{t("cardCount", { count: flashcards.cards.length })}</span><span>·</span><span>{t("dueCount", { count: due.length })}</span>{flashcards.selectedDeck.projectId && <><span>·</span><span><FileText size={13}/>{availableProjects.find(project => project.id === flashcards.selectedDeck?.projectId)?.title ?? t("linkedProject")}</span></>}</div></div>
            <div className="actions"><button className="icon-button danger" aria-label={t("deleteDeck")} title={t("deleteDeck")} onClick={() => setDeleteTarget(flashcards.selectedDeck)}><Trash2 size={17}/></button><button className="secondary-button" disabled={!owner || flashcards.busy || aiBusy} title={!owner ? t("loginRequired") : t("generateFlashcards")} onClick={openAiGenerator}><Sparkles size={16}/>{t("generateFlashcards")}</button><button className="secondary-button" disabled={!due.length || flashcards.busy || aiBusy} onClick={() => startReview("due")}><Play size={16}/>{t("startReview")}</button><button className="primary-button" disabled={flashcards.busy || aiBusy} onClick={openCreateCard}><Plus size={16}/>{t("newCard")}</button></div>
          </header>
          <div className="study-overview">
            <button disabled={!due.length} onClick={() => startReview("due")}><span><RotateCcw size={16}/>{t("reviewDue")}</span><strong>{due.length}</strong></button>
            <button disabled={!newCards.length} onClick={() => startReview("new")}><span><Zap size={16}/>{t("newCards")}</span><strong>{newCards.length}</strong></button>
            <button disabled={!difficultCards.length} onClick={() => startReview("difficult")}><span><Target size={16}/>{t("difficultCards")}</span><strong>{difficultCards.length}</strong></button>
            <div><span><CheckCircle2 size={16}/>{t("learnedCards")}</span><strong>{learnedCards.length}</strong></div>
          </div>
          <div className="daily-goal"><div><span>{t("dailyGoal")}</span><strong>{reviewedToday} / {dailyGoal}</strong></div><progress value={Math.min(reviewedToday, dailyGoal)} max={dailyGoal}/><label><Target size={14}/><input aria-label={t("dailyGoal")} type="number" min="5" max="100" step="5" value={dailyGoal} onChange={event => { const value = Math.max(5, Math.min(100, Number(event.target.value) || 20)); setDailyGoal(value); try { localStorage.setItem("mindcanvas:daily-goal", String(value)); } catch {} }}/></label></div>
          <div className="flashcard-tabs" role="tablist"><button role="tab" aria-selected={panel === "cards"} className={panel === "cards" ? "active" : ""} onClick={() => setPanel("cards")}>{t("allCards")}</button><button role="tab" aria-selected={panel === "review"} className={panel === "review" ? "active" : ""} onClick={() => startReview("due")}><RotateCcw size={15}/>{t("review")}{due.length > 0 && <span>{due.length}</span>}</button></div>
          {panel === "review" ? <ReviewPanel target={reviewTarget} finished={reviewFinished} index={reviewIndex} total={reviewQueue.length} dailyCurrent={reviewedToday} dailyGoal={dailyGoal} showAnswer={showAnswer} onShowAnswer={() => setShowAnswer(true)} onRate={rating => void rateReview(rating)} onBack={() => setPanel("cards")} t={t}/> : flashcards.cardsLoading ? <p className="flashcards-loading">{t("loading")}</p> : !flashcards.cards.length ? <div className="flashcards-empty cards"><BookOpen size={38}/><h3>{t("noCards")}</h3><p>{t("noCardsHint")}</p><button className="secondary-button" onClick={openCreateCard}><Plus size={16}/>{t("newCard")}</button></div> : <><label className="card-search"><Search size={16}/><input aria-label={t("cardSearch")} placeholder={t("cardSearch")} value={cardQuery} onChange={event => setCardQuery(event.target.value)}/></label>{!filteredCards.length ? <div className="command-empty">{t("noResults")}</div> : <div className="cards-list">{filteredCards.map(card => <CardRow key={card.id} card={card} language={language} onEdit={() => openEditCard(card)} onDelete={() => void flashcards.removeCard(card)} onOpenSource={card.sourcePage && flashcards.selectedDeck?.projectId ? () => void openCardSource(card) : undefined} busy={flashcards.busy} t={t}/>)}</div>}</>}
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
    {aiDialog && <Dialog title={t("generateFlashcards")} onClose={closeAiGenerator}>{!aiPreview ? <form onSubmit={event => void generateAiPreview(event)}>
      <p>{t("aiFlashcardHint")}</p>
      <label>{t("aiSource")}<select value={aiSource} disabled={aiBusy} onChange={event => { setAiSource(event.target.value as AiSource); setAiError(""); }}><option value="text">{t("aiSourceText")}</option><option value="project" disabled={!availableProjects.length}>{t("aiSourceProject")}</option><option value="pdf">{t("aiSourcePdf")}</option></select></label>
      {aiSource === "text" && <label>{t("sourceText")}<textarea autoFocus required rows={9} maxLength={120_000} value={aiText} onChange={event => setAiText(event.target.value)} placeholder={t("sourceTextPlaceholder")}/></label>}
      {aiSource === "project" && <label>{t("sourceProject")}<select required value={aiProjectId} disabled={aiBusy || !availableProjects.length} onChange={event => setAiProjectId(event.target.value)}><option value="">{t("chooseProject")}</option>{availableProjects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select><small>{t("sourceProjectHint")}</small></label>}
      {aiSource === "pdf" && <label className="upload-drop">{t("choosePdf")}<input type="file" accept=".pdf,application/pdf" disabled={aiBusy} onChange={event => { const file = event.target.files?.[0] ?? null; setAiPdf(file); setAiError(file && file.size > MAX_FILE_BYTES ? t("fileTooLarge") : ""); }}/><small>{t("pdfHint")}</small>{aiPdf && <small>{aiPdf.name}</small>}</label>}
      <label>{t("maxGeneratedCards")}<input type="number" min="3" max="50" step="1" value={aiMaxCards} disabled={aiBusy} onChange={event => setAiMaxCards(event.target.value)}/></label>
      {aiError && <p className="form-error" role="alert">{aiError}</p>}{aiBusy && <p role="status">{t("generatingFlashcards")}</p>}
      <footer className="actions"><button type="button" className="secondary-button" disabled={aiBusy} onClick={closeAiGenerator}>{t("cancel")}</button><button className="primary-button" disabled={aiBusy || !owner}>{aiBusy ? t("generating") : t("generatePreview")}</button></footer>
    </form> : <>
      <p>{t("aiPreviewHint")}</p>
      <label>{t("flashcardSetTitle")}<input value={aiPreview.title} maxLength={200} onChange={event => setAiPreview(current => current ? { ...current, title: event.target.value } : current)}/></label>
      <div className="ai-flashcards-preview">{aiPreview.cards.map((card, index) => <div className="ai-preview-card" key={card.id}><div className="ai-preview-card-heading"><strong>#{index + 1}</strong><button type="button" className="icon-button danger" aria-label={t("removePreviewCard")} onClick={() => removeAiCard(card.id)}><Trash2 size={15}/></button></div><label>{t("questionSide")}<textarea rows={3} maxLength={8_000} value={card.front} onChange={event => updateAiCard(card.id, { front: event.target.value })}/></label><label>{t("answerSide")}<textarea rows={4} maxLength={12_000} value={card.back} onChange={event => updateAiCard(card.id, { back: event.target.value })}/></label><label>{t("sourcePage")}<input type="number" min="1" step="1" value={card.sourcePage ?? ""} onChange={event => updateAiCard(card.id, { sourcePage: event.target.value ? Number(event.target.value) : null })}/></label></div>)}</div>
      <button type="button" className="secondary-button" disabled={aiBusy || aiPreview.cards.length >= 50} onClick={addAiCard}><Plus size={16}/>{t("addPreviewCard")}</button>
      {aiError && <p className="form-error" role="alert">{aiError}</p>}{aiBusy && <p role="status">{t("saving")}</p>}
      <footer className="actions"><button type="button" className="secondary-button" disabled={aiBusy} onClick={() => { setAiPreview(null); setAiError(""); }}>{t("backToSource")}</button><button type="button" className="primary-button" disabled={aiBusy || !aiPreview.cards.some(card => card.front.trim() && card.back.trim())} onClick={() => void applyAiPreview()}>{aiBusy ? t("saving") : t("applyToDeck")}</button></footer>
    </>}</Dialog>}
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

function ReviewPanel({ target, finished, index, total, dailyCurrent, dailyGoal, showAnswer, onShowAnswer, onRate, onBack, t }: { target: Flashcard | null; finished: boolean; index: number; total: number; dailyCurrent: number; dailyGoal: number; showAnswer: boolean; onShowAnswer: () => void; onRate: (rating: FlashcardRating) => void; onBack: () => void; t: (key: any, values?: Record<string, string | number>) => string }) {
  if (finished) return <div className="review-finished"><CheckCircle2 size={46}/><h3>{t("reviewComplete")}</h3><p>{t("reviewCompleteHint", { count: total })}</p><button className="secondary-button" onClick={onBack}>{t("backToCards")}</button></div>;
  if (!target) return <div className="review-finished"><BookOpen size={46}/><h3>{t("nothingDue")}</h3><p>{t("nothingDueHint")}</p><button className="secondary-button" onClick={onBack}>{t("backToCards")}</button></div>;
  return <div className="review-panel"><div className="review-progress"><span>{t("reviewProgress", { current: index + 1, total })}</span><span>{t("reviewKeyboardHint")}</span></div><progress className="review-session-progress" value={index} max={Math.max(1, total)} aria-label={t("sessionProgress")}/><article className="review-card"><div className="review-face"><span className="flashcard-label">{t("questionSide")}</span><p>{target.front}</p></div>{showAnswer && <div className="review-face answer"><span className="flashcard-label">{t("answerSide")}</span><p>{target.back}</p></div>}</article>{target.sourcePage && <span className="review-source">{t("page")} {target.sourcePage}</span>}{!showAnswer ? <button className="primary-button show-answer" onClick={onShowAnswer}>{t("showAnswer")}</button> : <div className="review-ratings"><span>{t("ratePrompt")}</span><div className="review-rating-buttons"><button className="rating-again" onClick={() => onRate("again")}>{t("again")}</button><button className="rating-hard" onClick={() => onRate("hard")}>{t("hard")}</button><button className="rating-good" onClick={() => onRate("good")}>{t("good")}</button><button className="rating-easy" onClick={() => onRate("easy")}>{t("easy")}</button></div></div>}<small className="review-daily">{t("dailyGoal")}: {dailyCurrent} / {dailyGoal}</small></div>;
}
