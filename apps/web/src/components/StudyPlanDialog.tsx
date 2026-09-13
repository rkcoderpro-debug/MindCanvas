import { useEffect, useMemo, useState } from "react";
import { Check, FileUp, Sparkles, Trash2 } from "lucide-react";
import type { Flashcard, FlashcardDeck, StudyPlan } from "../lib/flashcards";
import { dueCards, recommendDailyTarget } from "../lib/flashcards";
import { useLanguage } from "../lib/i18n";
import type { StudyPlanRecommendation } from "../lib/api";
import Dialog from "./Dialog";

type PreviewCard = { id: string; front: string; back: string; sourcePage: number | null };
type GeneratedFilePreview = { title: string; sourceDocumentId?: string; cards: PreviewCard[] };

type Props = {
  decks: FlashcardDeck[];
  selectedDeckId: string | null;
  maxCards: number;
  onClose: () => void;
  onLoadCards: (deckIds: string[]) => Promise<Flashcard[]>;
  onGenerateFile: (file: File, maxCards: number, targetDeckId: string) => Promise<GeneratedFilePreview>;
  onCreateCards: (deckId: string, cards: Array<{ front: string; back: string; sourcePage?: number | null }>) => Promise<Flashcard[]>;
  onRecommend: (cards: Flashcard[], dailyMinutes: number) => Promise<StudyPlanRecommendation>;
  onSavePlan: (input: {
    name: string;
    sourceType: StudyPlan["sourceType"];
    deckIds: string[];
    sourceDocumentId?: string | null;
    dailyTarget: number;
    dailyMinutes: number;
    assignedCardIds: string[];
  }) => Promise<StudyPlan>;
};

function assignmentFor(cards: Flashcard[], target: number) {
  const difficult = cards.filter(card => card.lapses > 0).sort((a, b) => b.lapses - a.lapses);
  const ordered = [...dueCards(cards), ...difficult, ...cards];
  return [...new Map(ordered.map(card => [card.id, card])).values()].slice(0, target).map(card => card.id);
}

export default function StudyPlanDialog({ decks, selectedDeckId, maxCards, onClose, onLoadCards, onGenerateFile, onCreateCards, onRecommend, onSavePlan }: Props) {
  const { t } = useLanguage();
  const [deckIds, setDeckIds] = useState<string[]>(selectedDeckId && decks.some(deck => deck.id === selectedDeckId) ? [selectedDeckId] : decks[0] ? [decks[0].id] : []);
  const [targetDeckId, setTargetDeckId] = useState(selectedDeckId && decks.some(deck => deck.id === selectedDeckId) ? selectedDeckId : decks[0]?.id ?? "");
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("20");
  const [file, setFile] = useState<File | null>(null);
  const [sourceCards, setSourceCards] = useState<Flashcard[]>([]);
  const [preview, setPreview] = useState<GeneratedFilePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const minutesValue = Math.max(5, Math.min(180, Number(minutes) || 20));
  const recommended = useMemo(() => recommendDailyTarget(sourceCards, minutesValue), [minutesValue, sourceCards]);
  const chosenDeckNames = decks.filter(deck => deckIds.includes(deck.id)).map(deck => deck.name).join(", ");

  useEffect(() => {
    let alive = true;
    if (!deckIds.length) { setSourceCards([]); return () => { alive = false; }; }
    void onLoadCards(deckIds).then(cards => { if (alive) setSourceCards(cards); }).catch(err => { if (alive) setError(err instanceof Error ? err.message : t("studyPlanLoadError")); });
    return () => { alive = false; };
  }, [deckIds.join(","), onLoadCards, t]);

  const toggleDeck = (deckId: string) => setDeckIds(current => current.includes(deckId) ? current.filter(id => id !== deckId) : [...current, deckId]);
  const setFileAndReset = (next: File | null) => { setFile(next); setPreview(null); setError(""); };
  const updatePreviewCard = (id: string, patch: Partial<PreviewCard>) => setPreview(current => current ? { ...current, cards: current.cards.map(card => card.id === id ? { ...card, ...patch } : card) } : current);
  const removePreviewCard = (id: string) => setPreview(current => current ? { ...current, cards: current.cards.filter(card => card.id !== id) } : current);

  const createPlan = async (cards: Flashcard[], sourceDocumentId?: string) => {
    const recommendation = await onRecommend(cards, minutesValue);
    const target = Math.max(1, Math.min(cards.length, recommendation.dailyTarget));
    if (!target) throw new Error(t("studyPlanNeedsCards"));
    const plan = await onSavePlan({
      name: name.trim() || t("aiStudyPlan"),
      sourceType: file ? (sourceCards.length ? "mixed" : "document") : "decks",
      deckIds,
      sourceDocumentId: sourceDocumentId ?? null,
      dailyTarget: target,
      dailyMinutes: minutesValue,
      assignedCardIds: assignmentFor(cards, target),
    });
    onClose();
    return plan;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deckIds.length) { setError(t("chooseStudyDecks")); return; }
    if (file && !targetDeckId) { setError(t("studyPlanTargetDeck")); return; }
    setBusy(true); setError("");
    try {
      if (file && !preview) {
        const generated = await onGenerateFile(file, maxCards, targetDeckId);
        setPreview(generated);
        return;
      }
      let cards = sourceCards;
      if (preview) {
        const inputs = preview.cards.map(card => ({ front: card.front.trim(), back: card.back.trim(), sourcePage: card.sourcePage })).filter(card => card.front && card.back);
        if (!inputs.length) { setError(t("studyPlanPreviewEmpty")); return; }
        const saved = await onCreateCards(targetDeckId, inputs);
        cards = [...sourceCards, ...saved];
        await createPlan(cards, preview.sourceDocumentId);
      } else {
        await createPlan(cards);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("studyPlanCreateError"));
    } finally {
      setBusy(false);
    }
  };

  return <Dialog title={t("aiStudyPlan")} onClose={() => { if (!busy) onClose(); }}>
    <div className="study-plan-intro"><div className="study-plan-icon"><Sparkles size={20}/></div><div><strong>{t("planSetupRequired")}</strong><p>{t("aiPlanHint")}</p></div></div>
    {!preview ? <form className="study-plan-form" onSubmit={event => void submit(event)}>
      <label>{t("studyPlanName")}<input autoFocus maxLength={160} value={name} onChange={event => setName(event.target.value)} placeholder={t("aiStudyPlan")}/></label>
      <fieldset className="study-deck-picker"><legend>{t("chooseStudyDecks")}</legend>{decks.map(deck => <label key={deck.id}><input type="checkbox" checked={deckIds.includes(deck.id)} onChange={() => toggleDeck(deck.id)}/><span>{deck.name}</span>{deck.id === selectedDeckId && <small>{t("studyDeck")}</small>}</label>)}{!decks.length && <p className="form-error">{t("noDecks")}</p>}</fieldset>
      <label>{t("studyTime")}<select value={minutes} onChange={event => setMinutes(event.target.value)}><option value="10">10 {t("minutes")}</option><option value="20">20 {t("minutes")}</option><option value="30">30 {t("minutes")}</option><option value="45">45 {t("minutes")}</option><option value="60">60 {t("minutes")}</option></select><small className="field-hint">{sourceCards.length ? `${t("recommendedByAi")}: ${recommended} ${t("targetCards").toLocaleLowerCase()}` : t("studyPlanNeedsCards")}</small></label>
      <label className="upload-drop study-plan-upload"><span><FileUp size={20}/>{t("uploadMaterialForPlan")}</span><input type="file" accept=".pdf,.docx,.pptx,.txt,.md,.csv,image/*" disabled={busy} onChange={event => setFileAndReset(event.target.files?.[0] ?? null)}/><small>{t("planFileHint")}</small>{file && <small>{file.name}</small>}</label>
      {file && <label>{t("studyPlanTargetDeck")}<select value={targetDeckId} onChange={event => { const next = event.target.value; setTargetDeckId(next); setDeckIds(current => current.includes(next) ? current : [...current, next]); }}>{decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select><small className="field-hint">{t("planFileCreatesCards")}</small></label>}
      {chosenDeckNames && <div className="study-plan-selection"><Check size={15}/><span>{chosenDeckNames}</span></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{t("cancel")}</button><button className="primary-button" disabled={busy || !deckIds.length}>{busy ? t("generating") : file ? t("generateAndPlan") : t("activatePlan")}</button></footer>
    </form> : <form className="study-plan-preview" onSubmit={event => void submit(event)}>
      <div className="study-plan-preview-heading"><div><strong>{preview.title || t("flashcardSetTitle")}</strong><small>{t("planPreviewHint")}</small></div><span>{preview.cards.length} / {maxCards}</span></div>
      <p className="field-hint">{t("aiPreviewHint")}</p>
      <div className="ai-flashcards-preview">{preview.cards.map((card, index) => <article className="ai-preview-card" key={card.id}><div className="ai-preview-card-heading"><strong>#{index + 1}</strong><button type="button" className="icon-button danger" aria-label={t("removePreviewCard")} onClick={() => removePreviewCard(card.id)}><Trash2 size={15}/></button></div><label>{t("questionSide")}<textarea rows={2} value={card.front} onChange={event => updatePreviewCard(card.id, { front: event.target.value })}/></label><label>{t("answerSide")}<textarea rows={3} value={card.back} onChange={event => updatePreviewCard(card.id, { back: event.target.value })}/></label></article>)}</div>
      {!preview.cards.length && <p className="form-error">{t("studyPlanPreviewEmpty")}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => { setPreview(null); setError(""); }}>{t("backToSource")}</button><button type="submit" className="primary-button" disabled={busy || !preview.cards.length}>{busy ? t("saving") : t("activatePlan")}</button></footer>
    </form>}
  </Dialog>;
}
