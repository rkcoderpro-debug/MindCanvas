import { useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Cloud, FileText, HardDrive, Pencil, Play, Plus, RotateCcw, Trash2, X } from "lucide-react";
import type { Project } from "../lib/projectStore";
import { dueCards, type Flashcard, type FlashcardDeck, type FlashcardRating } from "../lib/flashcards";
import { useFlashcards } from "../hooks/useFlashcards";
import { useLanguage } from "../lib/i18n";
import Dialog from "./Dialog";

type DeckDialog = { kind: "create" | "rename"; deck?: FlashcardDeck };
type CardDialog = { kind: "create" | "edit"; card?: Flashcard };

function formatDate(value: string, language: string) {
  return new Date(value).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US", { day: "numeric", month: "short", year: "numeric" });
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

  const availableProjects = useMemo(() => projects.filter(project => !project.deletedAt).sort((a, b) => a.title.localeCompare(b.title, language)), [projects, language]);
  const selectedProject = availableProjects.find(project => project.id === deckProjectId);
  const due = flashcards.due;
  const reviewTarget = reviewQueue[reviewIndex] ? flashcards.cards.find(card => card.id === reviewQueue[reviewIndex]) ?? null : null;
  const reviewFinished = panel === "review" && (!reviewQueue.length || reviewIndex >= reviewQueue.length || !reviewTarget);

  const openCreateDeck = () => { setDeckName(""); setDeckProjectId(""); setFormError(""); setDeckDialog({ kind: "create" }); };
  const openRenameDeck = (deck: FlashcardDeck) => { setDeckName(deck.name); setDeckProjectId(deck.projectId ?? ""); setFormError(""); setDeckDialog({ kind: "rename", deck }); };
  const openCreateCard = () => { setCardFront(""); setCardBack(""); setCardPage(""); setFormError(""); setCardDialog({ kind: "create" }); };
  const openEditCard = (card: Flashcard) => { setCardFront(card.front); setCardBack(card.back); setCardPage(card.sourcePage ? String(card.sourcePage) : ""); setFormError(""); setCardDialog({ kind: "edit", card }); };

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

  const startReview = () => {
    setReviewQueue(dueCards(flashcards.cards).map(card => card.id));
    setReviewIndex(0); setShowAnswer(false); setPanel("review");
  };

  const rateReview = async (rating: FlashcardRating) => {
    if (!reviewTarget) return;
    try {
      await flashcards.reviewCard(reviewTarget, rating);
      setShowAnswer(false); setReviewIndex(index => index + 1);
    } catch { /* the hook keeps the visible error and the card stays on screen */ }
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
            <div className="actions"><button className="icon-button danger" aria-label={t("deleteDeck")} title={t("deleteDeck")} onClick={() => setDeleteTarget(flashcards.selectedDeck)}><Trash2 size={17}/></button><button className="secondary-button" disabled={!due.length || flashcards.busy} onClick={startReview}><Play size={16}/>{t("startReview")}</button><button className="primary-button" disabled={flashcards.busy} onClick={openCreateCard}><Plus size={16}/>{t("newCard")}</button></div>
          </header>
          <div className="flashcard-tabs" role="tablist"><button role="tab" aria-selected={panel === "cards"} className={panel === "cards" ? "active" : ""} onClick={() => setPanel("cards")}>{t("allCards")}</button><button role="tab" aria-selected={panel === "review"} className={panel === "review" ? "active" : ""} onClick={startReview}><RotateCcw size={15}/>{t("review")}{due.length > 0 && <span>{due.length}</span>}</button></div>
          {panel === "review" ? <ReviewPanel target={reviewTarget} finished={reviewFinished} index={reviewIndex} total={reviewQueue.length} showAnswer={showAnswer} onShowAnswer={() => setShowAnswer(true)} onRate={rating => void rateReview(rating)} onBack={() => setPanel("cards")} t={t}/> : flashcards.cardsLoading ? <p className="flashcards-loading">{t("loading")}</p> : !flashcards.cards.length ? <div className="flashcards-empty cards"><BookOpen size={38}/><h3>{t("noCards")}</h3><p>{t("noCardsHint")}</p><button className="secondary-button" onClick={openCreateCard}><Plus size={16}/>{t("newCard")}</button></div> : <div className="cards-list">{flashcards.cards.map(card => <CardRow key={card.id} card={card} language={language} onEdit={() => openEditCard(card)} onDelete={() => void flashcards.removeCard(card)} busy={flashcards.busy} t={t}/>)}</div>}
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
    {deleteTarget && <Dialog title={t("deleteDeck")} onClose={() => { if (!flashcards.busy) setDeleteTarget(null); }}><p>{t("deleteDeckHint", { name: deleteTarget.name })}</p><footer className="actions"><button className="secondary-button" disabled={flashcards.busy} onClick={() => setDeleteTarget(null)}>{t("cancel")}</button><button className="danger-button" disabled={flashcards.busy} onClick={() => void flashcards.removeDeck(deleteTarget).then(() => setDeleteTarget(null)).catch(() => undefined)}><Trash2 size={16}/>{t("deleteDeck")}</button></footer></Dialog>}
  </section>;
}

function CardRow({ card, language, onEdit, onDelete, busy, t }: { card: Flashcard; language: string; onEdit: () => void; onDelete: () => void; busy: boolean; t: (key: any, values?: Record<string, string | number>) => string }) {
  return <article className="flashcard-row">
    <div className="flashcard-side"><span className="flashcard-label">{t("questionSide")}</span><p>{card.front}</p></div>
    <div className="flashcard-side"><span className="flashcard-label">{t("answerSide")}</span><p>{card.back}</p></div>
    <div className="flashcard-row-meta"><span className={new Date(card.dueAt) <= new Date() ? "due" : "scheduled"}>{new Date(card.dueAt) <= new Date() ? t("dueNow") : t("nextReview", { date: formatDate(card.dueAt, language) })}</span>{card.sourcePage && <span>{t("page")} {card.sourcePage}</span>}</div>
    <div className="flashcard-row-actions"><button className="icon-button" aria-label={`${t("editCard")}: ${card.front}`} disabled={busy} onClick={onEdit}><Pencil size={16}/></button><button className="icon-button danger" aria-label={`${t("deleteCard")}: ${card.front}`} disabled={busy} onClick={onDelete}><Trash2 size={16}/></button></div>
  </article>;
}

function ReviewPanel({ target, finished, index, total, showAnswer, onShowAnswer, onRate, onBack, t }: { target: Flashcard | null; finished: boolean; index: number; total: number; showAnswer: boolean; onShowAnswer: () => void; onRate: (rating: FlashcardRating) => void; onBack: () => void; t: (key: any, values?: Record<string, string | number>) => string }) {
  if (finished) return <div className="review-finished"><CheckCircle2 size={46}/><h3>{t("reviewComplete")}</h3><p>{t("reviewCompleteHint", { count: total })}</p><button className="secondary-button" onClick={onBack}>{t("backToCards")}</button></div>;
  if (!target) return <div className="review-finished"><BookOpen size={46}/><h3>{t("nothingDue")}</h3><p>{t("nothingDueHint")}</p><button className="secondary-button" onClick={onBack}>{t("backToCards")}</button></div>;
  return <div className="review-panel"><div className="review-progress"><span>{t("reviewProgress", { current: index + 1, total })}</span><span>{t("reviewKeyboardHint")}</span></div><article className="review-card"><div className="review-face"><span className="flashcard-label">{t("questionSide")}</span><p>{target.front}</p></div>{showAnswer && <div className="review-face answer"><span className="flashcard-label">{t("answerSide")}</span><p>{target.back}</p></div>}</article>{!showAnswer ? <button className="primary-button show-answer" onClick={onShowAnswer}>{t("showAnswer")}</button> : <div className="review-ratings"><span>{t("ratePrompt")}</span><div className="review-rating-buttons"><button className="rating-again" onClick={() => onRate("again")}>{t("again")}</button><button className="rating-hard" onClick={() => onRate("hard")}>{t("hard")}</button><button className="rating-good" onClick={() => onRate("good")}>{t("good")}</button><button className="rating-easy" onClick={() => onRate("easy")}>{t("easy")}</button></div></div>}</div>;
}

