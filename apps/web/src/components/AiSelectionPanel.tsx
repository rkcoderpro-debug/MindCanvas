import { useEffect, useRef, useState } from "react";
import { BrainCircuit, FilePenLine, ListTree, Sparkles, WandSparkles, X } from "lucide-react";
import { transformSelection, type SelectionAiAction, type SelectionAiResult } from "../lib/api";
import { useLanguage } from "../lib/i18n";
import Dialog from "./Dialog";
import { aiErrorMessage } from "../lib/aiErrors";

const actions: Array<{ id: SelectionAiAction; icon: typeof Sparkles; label: "aiSummarize" | "aiExplain" | "aiRewrite" | "aiExpand" }> = [
  { id: "summarize", icon: Sparkles, label: "aiSummarize" },
  { id: "explain", icon: BrainCircuit, label: "aiExplain" },
  { id: "rewrite", icon: FilePenLine, label: "aiRewrite" },
  { id: "expand", icon: ListTree, label: "aiExpand" },
];

export default function AiSelectionPanel({ sourceText, canUse, onClose, onApply }: {
  sourceText: string;
  canUse: boolean;
  onClose: () => void;
  onApply: (result: SelectionAiResult) => void;
}) {
  const { t, language } = useLanguage();
  const [action, setAction] = useState<SelectionAiAction>("summarize");
  const [result, setResult] = useState<SelectionAiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const generate = async () => {
    if (!canUse || busy || !sourceText.trim()) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(""); setResult(null);
    try { setResult(await transformSelection(action, sourceText, language, request.signal)); }
    catch (err) { if (!request.signal.aborted) setError(aiErrorMessage(err, t, "aiSelectionError")); }
    finally { if (!request.signal.aborted) setBusy(false); }
  };

  const close = () => { if (busy) controller.current?.abort(); onClose(); };
  return <Dialog title={t("aiSelectionTitle")} onClose={close}>
    <p className="dialog-intro">{t("aiSelectionHint")}</p>
    {!canUse && <p className="form-error" role="alert">{t("loginRequired")}</p>}
    <div className="ai-action-grid" role="radiogroup" aria-label={t("aiSelectionAction")}>
      {actions.map(({ id, icon: Icon, label }) => <button key={id} type="button" role="radio" aria-checked={action === id} className={action === id ? "active" : ""} disabled={busy} onClick={() => { setAction(id); setResult(null); setError(""); }}><Icon size={18}/><span>{t(label)}</span></button>)}
    </div>
    <details className="ai-source-preview"><summary>{t("aiSelectedContent")}</summary><p>{sourceText.slice(0, 2500)}</p></details>
    {busy && <div className="ai-working" role="status"><WandSparkles size={18}/><span>{t("aiSelectionWorking")}</span></div>}
    {error && <div className="flashcards-error" role="alert"><span>{error}</span><button className="icon-button" aria-label={t("close")} onClick={() => setError("")}><X size={15}/></button></div>}
    {result && <div className="ai-selection-preview">
      <label>{t("title")}<input maxLength={200} value={result.title} onChange={event => setResult({ ...result, title: event.target.value })}/></label>
      <label>{t("aiResult")}<textarea rows={7} maxLength={20_000} value={result.text} onChange={event => setResult({ ...result, text: event.target.value })}/></label>
      {result.action === "expand" && <div className="ai-ideas"><strong>{t("aiChildIdeas")}</strong>{result.ideas.map((idea, index) => <div key={index}><input aria-label={`${t("aiChildIdea")} ${index + 1}`} maxLength={2000} value={idea} onChange={event => setResult({ ...result, ideas: result.ideas.map((value, i) => i === index ? event.target.value : value) })}/><button className="icon-button" aria-label={t("delete")} onClick={() => setResult({ ...result, ideas: result.ideas.filter((_, i) => i !== index) })}><X size={15}/></button></div>)}<button className="secondary-button" onClick={() => setResult({ ...result, ideas: [...result.ideas, ""] })}>{t("addChild")}</button></div>}
      <small>{result.provider} · {result.model} · {t("previewChanges")}</small>
    </div>}
    <footer className="actions"><button className="secondary-button" onClick={close}>{t("cancel")}</button>{result ? <button className="primary-button" disabled={!result.text.trim() || (result.action === "expand" && !result.ideas.some(idea => idea.trim()))} onClick={() => onApply({ ...result, title: result.title.trim(), text: result.text.trim(), ideas: result.ideas.map(idea => idea.trim()).filter(Boolean) })}>{t("apply")}</button> : <button className="primary-button" disabled={!canUse || busy || !sourceText.trim()} onClick={() => void generate()}><Sparkles size={16}/>{t("generatePreview")}</button>}</footer>
  </Dialog>;
}
