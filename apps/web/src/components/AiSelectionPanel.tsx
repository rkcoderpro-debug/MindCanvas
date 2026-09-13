import { useEffect, useRef, useState } from "react";
import { BrainCircuit, ClipboardPaste, FilePenLine, ListTree, Sparkles, WandSparkles, X } from "lucide-react";
import { consumeAiManualUsage, transformSelection, type SelectionAiAction, type SelectionAiResult } from "../lib/api";
import { useLanguage } from "../lib/i18n";
import Dialog from "./Dialog";
import { AiModeSwitch, ManualSteps, type AiMode, type ManualStep } from "./AiModeSwitch";
import { aiErrorMessage } from "../lib/aiErrors";
import { buildSelectionPrompt, GEMINI_WEB_URL, parseManualSelectionResult } from "../lib/manualAi";
import { writeClipboardText } from "../lib/aiSource";

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
  const [aiMode, setAiMode] = useState<AiMode>(canUse ? "auto" : "manual");
  const [result, setResult] = useState<SelectionAiResult | null>(null);
  const [manualPrompt, setManualPrompt] = useState(""), [manualJson, setManualJson] = useState(""), [manualCopied, setManualCopied] = useState(false), [manualUsageConsumed, setManualUsageConsumed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const clearManual = () => { setManualPrompt(""); setManualJson(""); setManualCopied(false); setManualUsageConsumed(false); };
  const changeAiMode = (nextMode: AiMode) => { setAiMode(nextMode); setResult(null); setError(""); clearManual(); };
  const changeAction = (nextAction: SelectionAiAction) => { setAction(nextAction); setResult(null); setError(""); clearManual(); };
  const createManualPrompt = () => {
    if (!sourceText.trim()) return;
    setManualPrompt(buildSelectionPrompt({ action, text: sourceText, language }));
    setManualJson(""); setManualCopied(false); setResult(null); setError("");
  };
  const copyManualPrompt = async () => {
    if (!manualPrompt) return;
    try { await writeClipboardText(manualPrompt); setManualCopied(true); setError(""); window.setTimeout(() => setManualCopied(false), 2200); }
    catch { setError(t("clipboardWriteError")); }
  };
  const openGemini = () => {
    const opened = window.open(GEMINI_WEB_URL, "_blank", "noopener,noreferrer");
    if (!opened) setError(t("popupBlocked"));
  };
  const validateManualResult = async () => {
    let next: SelectionAiResult | null = null;
    try { next = parseManualSelectionResult(manualJson, action); }
    catch { setResult(null); setError(t("manualInvalidResult")); return; }
    if (!canUse) { setResult(null); setError(t("manualRequiresLogin")); return; }
    if (!manualUsageConsumed) {
      setBusy(true);
      try { await consumeAiManualUsage(); setManualUsageConsumed(true); }
      catch (error) { setResult(null); setError(aiErrorMessage(error, t, "aiManualQuotaError")); return; }
      finally { setBusy(false); }
    }
    setResult(next); setError("");
  };

  const generate = async () => {
    if (aiMode === "manual") { createManualPrompt(); return; }
    if (!canUse || busy || !sourceText.trim()) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(""); setResult(null);
    try { setResult(await transformSelection(action, sourceText, language, request.signal)); }
    catch (err) { if (!request.signal.aborted) setError(aiErrorMessage(err, t, "aiSelectionError")); }
    finally { if (!request.signal.aborted) setBusy(false); }
  };

  const close = () => { if (busy) controller.current?.abort(); onClose(); };
  const manualStep: ManualStep = result ? "preview" : manualJson.trim() ? "result" : manualPrompt ? "gemini" : "source";
  return <Dialog title={t("aiSelectionTitle")} onClose={close}>
    <p className="dialog-intro">{t("aiSelectionHint")}</p>
    <AiModeSwitch mode={aiMode} autoAvailable={canUse} onChange={changeAiMode} />
    {aiMode === "manual" ? <p className="ai-manual-note">{t("aiManualHint")} {t("aiManualUsageHint")} {t("manualNoLoginHint")}</p> : !canUse && <p className="form-error" role="alert">{t("loginRequired")}</p>}
    {aiMode === "manual" && <ManualSteps current={manualStep} />}
    <div className="ai-action-grid" role="radiogroup" aria-label={t("aiSelectionAction")}>
      {actions.map(({ id, icon: Icon, label }) => <button key={id} type="button" role="radio" aria-checked={action === id} className={action === id ? "active" : ""} disabled={busy} onClick={() => changeAction(id)}><Icon size={18}/><span>{t(label)}</span></button>)}
    </div>
    <details className="ai-source-preview"><summary>{t("aiSelectedContent")}</summary><p>{sourceText.slice(0, 2500)}</p></details>
    {aiMode === "manual" && <section className="ai-manual-panel">
      {manualPrompt && <div className="ai-manual-prompt"><label>{t("aiManualPrompt")}<textarea value={manualPrompt} onChange={event => { setManualPrompt(event.target.value); setManualCopied(false); }} /></label><div className="ai-manual-actions"><button type="button" className="secondary-button" onClick={() => void copyManualPrompt()}><ClipboardPaste size={16}/>{manualCopied ? t("copiedPrompt") : t("copyPrompt")}</button><button type="button" className="secondary-button" onClick={openGemini}><Sparkles size={16}/>{t("openGemini")}</button></div><small className="field-hint">{t("aiManualTextHint")}</small></div>}
      <label className="ai-manual-json"><span>{t("aiManualJsonLabel")}</span><textarea value={manualJson} onChange={event => { setManualJson(event.target.value); setResult(null); setError(""); }} placeholder={t("aiManualJsonPlaceholder")} /></label>
      <button type="button" className="secondary-button" disabled={!manualPrompt || !manualJson.trim() || busy} onClick={() => void validateManualResult()}>{t("validateResult")}</button>
    </section>}
    {busy && <div className="ai-working" role="status"><WandSparkles size={18}/><span>{t("aiSelectionWorking")}</span></div>}
    {error && <div className="flashcards-error" role="alert"><span>{error}</span><button type="button" className="icon-button" aria-label={t("close")} onClick={() => setError("")}><X size={15}/></button></div>}
    {result && <div className="ai-selection-preview">
      <label>{t("title")}<input maxLength={200} value={result.title} onChange={event => setResult({ ...result, title: event.target.value })}/></label>
      <label>{t("aiResult")}<textarea rows={7} maxLength={20_000} value={result.text} onChange={event => setResult({ ...result, text: event.target.value })}/></label>
      {result.action === "expand" && <div className="ai-ideas"><strong>{t("aiChildIdeas")}</strong>{result.ideas.map((idea, index) => <div key={index}><input aria-label={`${t("aiChildIdea")} ${index + 1}`} maxLength={2000} value={idea} onChange={event => setResult({ ...result, ideas: result.ideas.map((value, i) => i === index ? event.target.value : value) })}/><button type="button" className="icon-button" aria-label={t("delete")} onClick={() => setResult({ ...result, ideas: result.ideas.filter((_, i) => i !== index) })}><X size={15}/></button></div>)}<button type="button" className="secondary-button" onClick={() => setResult({ ...result, ideas: [...result.ideas, ""] })}>{t("addChild")}</button></div>}
      <small>{result.provider === "manual" ? t("manualProvider") : result.provider} · {result.model} · {t("previewChanges")}</small>
    </div>}
    <footer className="actions"><button type="button" className="secondary-button" onClick={close}>{t("cancel")}</button>{result ? <button type="button" className="primary-button" disabled={!result.text.trim() || (result.action === "expand" && !result.ideas.some(idea => idea.trim()))} onClick={() => onApply({ ...result, title: result.title.trim(), text: result.text.trim(), ideas: result.ideas.map(idea => idea.trim()).filter(Boolean) })}>{t("apply")}</button> : <button type="button" className="primary-button" disabled={busy || !sourceText.trim()} onClick={() => void generate()}><Sparkles size={16}/>{aiMode === "manual" ? t("createPrompt") : t("generatePreview")}</button>}</footer>
  </Dialog>;
}
