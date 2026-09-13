import { useEffect, useMemo, useRef, useState } from "react";
import type { StructuredMindMap } from "@mindcanvas/shared";
import { ClipboardPaste, FileText, Sparkles, Upload } from "lucide-react";
import Dialog from "./Dialog";
import { AiModeSwitch, type AiMode } from "./AiModeSwitch";
import { generateMindMap, generateMindMapFromFile } from "../lib/api";
import { saveDocumentToStorage } from "../lib/supabase";
import { useLanguage } from "../lib/i18n";
import { AI_FILE_ACCEPT, readClipboardSource, writeClipboardText } from "../lib/aiSource";
import { MAX_FILE_BYTES } from "../lib/board";
import { aiErrorMessage } from "../lib/aiErrors";
import { buildMindMapPrompt, GEMINI_WEB_URL, ManualAiValidationError, parseManualMindMap, type MindMapDetail } from "../lib/manualAi";

function pageText(text: string, from: number, to: number) {
  const markers = [...text.matchAll(/\[PAGE\s+(\d+)\]/g)];
  if (!markers.length) return text;
  return markers.map((marker, i) => { const number = Number(marker[1]); const end = markers[i + 1]?.index ?? text.length; return number >= from && number <= to ? text.slice(marker.index, end) : ""; }).join("\n").trim();
}

type SourceMode = "text" | "file";

export default function AiPanel({ projectId, canUse, beforeGenerate, onClose, onApply }: {
  projectId: string; canUse: boolean; beforeGenerate: () => Promise<boolean>; onClose: () => void; onApply: (graph: StructuredMindMap, mode: "append" | "new") => void;
}) {
  const { t, language } = useLanguage();
  const [sourceMode, setSourceMode] = useState<SourceMode>("file");
  const [aiMode, setAiMode] = useState<AiMode>(canUse ? "auto" : "manual");
  const [file, setFile] = useState<File | null>(null), [rawText, setRawText] = useState(""), [graph, setGraph] = useState<StructuredMindMap | null>(null), [pageCount, setPageCount] = useState(0), [documentId, setDocumentId] = useState("");
  const [from, setFrom] = useState(1), [to, setTo] = useState(1), [mode, setMode] = useState<"append" | "new">("append"), [mindMapDetail, setMindMapDetail] = useState<MindMapDetail>("medium");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [provider, setProvider] = useState("");
  const [manualPrompt, setManualPrompt] = useState(""), [manualJson, setManualJson] = useState(""), [manualCopied, setManualCopied] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined), fileInput = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => file && (file.type === "application/pdf" || file.type.startsWith("image/")) ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => () => { controller.current?.abort(); if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const clearManualResult = () => { setManualPrompt(""); setManualJson(""); setManualCopied(false); };
  const clearResult = () => { setGraph(null); setProvider(""); setError(""); clearManualResult(); };
  const resetSource = (nextMode: SourceMode) => { setSourceMode(nextMode); setFile(null); setRawText(""); setPageCount(0); setDocumentId(""); clearResult(); if (fileInput.current) fileInput.current.value = ""; };
  const selectFile = (next: File | null) => { setFile(next); setGraph(null); setRawText(""); setPageCount(0); setDocumentId(""); setProvider(""); clearManualResult(); setError(""); };
  const changeAiMode = (nextMode: AiMode) => { setAiMode(nextMode); clearResult(); if (nextMode === "manual") setManualPrompt(buildMindMapPrompt({ detail: mindMapDetail, language })); };
  const pasteClipboard = async () => {
    try {
      const pasted = await readClipboardSource();
      if (pasted.kind === "image") { setSourceMode("file"); selectFile(pasted.file); }
      else { setSourceMode("text"); setFile(null); setRawText(pasted.text); setPageCount(0); setDocumentId(""); clearResult(); }
    } catch (err) { setError(err instanceof Error && err.message === "CLIPBOARD_EMPTY" ? t("clipboardEmpty") : t("clipboardReadError")); }
  };
  const chooseFile = (next: File | undefined) => { if (!next) return; if (next.size > MAX_FILE_BYTES) { setError(t("fileTooLarge")); return; } setSourceMode("file"); selectFile(next); };

  const changeMindMapDetail = (nextDetail: MindMapDetail) => { setMindMapDetail(nextDetail); if (aiMode === "manual") { setManualPrompt(buildMindMapPrompt({ detail: nextDetail, language })); setManualJson(""); setGraph(null); setProvider(""); setError(""); } };
  const copyManualPrompt = async () => {
    const prompt = manualPrompt || buildMindMapPrompt({ detail: mindMapDetail, language });
    try { await writeClipboardText(prompt); setManualCopied(true); setError(""); window.setTimeout(() => setManualCopied(false), 2200); }
    catch { setError(t("clipboardWriteError")); }
  };
  const openGemini = () => {
    const opened = window.open(GEMINI_WEB_URL, "_blank", "noopener,noreferrer");
    if (!opened) setError(t("popupBlocked"));
  };
  const validateManualResult = () => {
    try {
      const next = parseManualMindMap(manualJson);
      setProvider("manual"); setGraph(next); setError("");
    } catch (error) { setGraph(null); setError(error instanceof ManualAiValidationError && error.code === "INVALID_JSON" ? t("manualInvalidJson") : t("manualInvalidMindMap")); }
  };
  const importManualJsonFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    try {
      const text = await selected.text();
      if (!text.trim()) throw new Error("EMPTY_JSON_FILE");
      setManualJson(text); setGraph(null); setProvider(""); setError("");
    } catch { setError(t("manualJsonFileError")); }
  };

  const run = async () => {
    if (!canUse) return;
    if (sourceMode === "text" && !rawText.trim()) { setError(t("aiTextRequired")); return; }
    if (sourceMode === "file" && !file) { setError(t("aiFileRequired")); return; }
    if (file && file.size > MAX_FILE_BYTES) { setError(t("fileTooLarge")); return; }
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(""); setGraph(null);
    try {
      if (!await beforeGenerate()) throw new Error(t("saveError"));
      if (sourceMode === "file" && file) {
        const result = await generateMindMapFromFile(file, request.signal); if (request.signal.aborted) return;
        setRawText(result.source.text); setPageCount(result.source.pageCount ?? 0); setFrom(1); setTo(result.source.pageCount ?? 1); setDocumentId(result.source.id);
        await saveDocumentToStorage(file, result.source.id, result.source.text, result.source.pageCount, projectId);
        if (result.provider === "demo" || !result.graph?.nodes?.length || result.graph.nodes.length > 200 || !Array.isArray(result.graph.edges)) throw new Error(t("aiError"));
        setProvider(result.provider); setGraph({ ...result.graph, sourceDocumentId: result.source.id, sourceDocumentName: file.name });
      } else {
        const result = await generateMindMap(rawText.trim(), undefined, request.signal); if (request.signal.aborted) return;
        if (result.provider === "demo" || !result.graph?.nodes?.length || result.graph.nodes.length > 200 || !Array.isArray(result.graph.edges)) throw new Error(t("aiError"));
        setProvider(result.provider); setGraph(result.graph);
      }
    } catch (err) { if (!request.signal.aborted) setError(aiErrorMessage(err, t, "aiError")); }
    finally { if (!request.signal.aborted) setBusy(false); }
  };
  const regenerateRange = async () => {
    if (aiMode !== "auto" || !rawText || !file || !canUse || !pageCount) return;
    const selected = pageText(rawText, Math.min(from, to), Math.max(from, to));
    if (!selected) { setError(t("noTextPages")); return; }
    const request = new AbortController(); controller.current = request; setBusy(true); setError(""); setGraph(null);
    try { const result = await generateMindMap(selected, documentId || undefined, request.signal); if (result.provider === "demo") throw new Error(t("aiDemo")); setProvider(result.provider); setGraph({ ...result.graph, sourceDocumentId: documentId || undefined, sourceDocumentName: file.name }); }
    catch (err) { if (!request.signal.aborted) setError(aiErrorMessage(err, t, "aiError")); }
    finally { if (!request.signal.aborted) setBusy(false); }
  };

  const hasPages = pageCount > 0;
  const sourceReady = sourceMode === "text" ? !!rawText.trim() : !!file;
  const currentManualPrompt = manualPrompt || buildMindMapPrompt({ detail: mindMapDetail, language });
  const autoControlsDisabled = busy || (aiMode === "auto" && !canUse);
  return <Dialog title={t("aiMindMapTitle")} onClose={onClose}>
    <p className="dialog-intro">{t("aiMindMapHint")}</p>
    <AiModeSwitch mode={aiMode} autoAvailable={canUse} onChange={changeAiMode} />
    {aiMode === "manual" ? <p className="ai-manual-note">{t("aiManualHint")} {t("manualNoLoginHint")}</p> : !canUse && <p role="alert">{t("loginRequired")}</p>}
    {aiMode === "auto" ? <>
      <div className="ai-source-tabs" role="tablist" aria-label={t("aiSource")}>
        <button type="button" role="tab" aria-selected={sourceMode === "text"} className={sourceMode === "text" ? "active" : ""} onClick={() => resetSource("text")}><FileText size={16}/>{t("aiSourceText")}</button>
        <button type="button" role="tab" aria-selected={sourceMode === "file"} className={sourceMode === "file" ? "active" : ""} onClick={() => resetSource("file")}><Upload size={16}/>{t("aiSourceFile")}</button>
      </div>
      {sourceMode === "text" && <div className="ai-text-source"><label>{t("sourceText")}<textarea autoFocus rows={10} maxLength={120_000} value={rawText} onChange={event => { setRawText(event.target.value); clearResult(); }} placeholder={t("sourceTextPlaceholder")}/></label><button type="button" className="secondary-button clipboard-button" disabled={busy} onClick={() => void pasteClipboard()}><ClipboardPaste size={16}/>{t("pasteFromClipboard")}</button><small className="field-hint">{t("clipboardSourceHint")}</small></div>}
      {sourceMode === "file" && <div className="ai-file-source">
        <label className="upload-drop ai-file-drop" onDragOver={event => { event.preventDefault(); event.currentTarget.classList.add("dragging"); }} onDragLeave={event => event.currentTarget.classList.remove("dragging")} onDrop={event => { event.preventDefault(); event.currentTarget.classList.remove("dragging"); chooseFile(event.dataTransfer.files?.[0]); }}><span><Upload size={21}/>{t("chooseAiFile")}</span><input ref={fileInput} type="file" accept={AI_FILE_ACCEPT} disabled={busy} onChange={event => chooseFile(event.target.files?.[0])}/><small>{t("aiFileHint")}</small></label>
        <button type="button" className="secondary-button clipboard-button" disabled={busy} onClick={() => void pasteClipboard()}><ClipboardPaste size={16}/>{t("pasteFromClipboard")}</button>
        {file && <div className="ai-file-card">{file.type.startsWith("image/") ? <img src={previewUrl} alt={file.name}/> : file.type === "application/pdf" ? <iframe title={t("pdfPreview")} src={previewUrl}/> : <span className="ai-file-icon">{file.name.toLowerCase().endsWith(".pptx") ? "PPTX" : file.name.toLowerCase().endsWith(".docx") ? "DOCX" : "FILE"}</span>}<div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></div></div>}
        {file && rawText && <details className="ai-source-preview"><summary>{t("extractedPreview")}</summary><p>{rawText}</p></details>}
      </div>}
      {file && <div className="ai-page-controls">{hasPages && <><strong>{t("pageRange")}</strong><label><span>{t("fromPage")}</span><input type="number" min="1" max={pageCount || undefined} value={from} onChange={event => setFrom(Math.max(1, Number(event.target.value) || 1))}/></label><label><span>{t("toPage")}</span><input type="number" min="1" max={pageCount || undefined} value={to} onChange={event => setTo(Math.max(1, Number(event.target.value) || 1))}/></label><small>{t("selectedPages")}: {Math.min(from, to)}–{Math.min(pageCount, Math.max(from, to))}</small><button type="button" className="secondary-button" disabled={busy || !hasPages || !rawText} onClick={() => void regenerateRange()}>{t("generateSelectedPages")}</button></>}</div>}
    </> : !graph && <section className="ai-manual-panel">
      <label>{t("mindMapDetail")}<select value={mindMapDetail} onChange={event => changeMindMapDetail(event.target.value as MindMapDetail)}><option value="detailed">{t("mindMapDetailDetailed")}</option><option value="medium">{t("mindMapDetailMedium")}</option><option value="basic">{t("mindMapDetailBasic")}</option></select><small className="field-hint">{t("mindMapDetailHint")}</small></label>
      <div className="ai-manual-prompt"><label>{t("aiManualPrompt")}<textarea readOnly value={currentManualPrompt}/></label><div className="ai-manual-actions"><button type="button" className="secondary-button" onClick={() => void copyManualPrompt()}><ClipboardPaste size={16}/>{manualCopied ? t("copiedPrompt") : t("copyPrompt")}</button><button type="button" className="secondary-button" onClick={openGemini}><Sparkles size={16}/>{t("openGemini")}</button></div><small className="field-hint">{t("aiManualMindMapWorkflow")}</small></div>
      <label className="ai-manual-json"><span>{t("aiManualJsonLabel")}</span><textarea value={manualJson} onChange={event => { setManualJson(event.target.value); setGraph(null); setProvider(""); setError(""); }} placeholder={t("aiManualJsonPlaceholder")} /><small className="field-hint">{t("aiManualJsonHint")}</small></label>
      <label className="secondary-button ai-json-file-input"><Upload size={16}/><span>{t("uploadJsonFile")}</span><input type="file" accept=".json,application/json" disabled={busy} onChange={event => void importManualJsonFile(event)}/></label>
      <button type="button" className="secondary-button" disabled={!manualJson.trim() || busy} onClick={validateManualResult}>{t("validateResult")}</button>
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}{busy && <p className="ai-working" role="status"><Sparkles size={16}/>{t("generatingMindMap")}</p>}
    {graph && <div className="graph-preview"><div className="ai-preview-heading"><strong>{graph.nodes.length} {t("nodes")} · {graph.edges.length} {t("edges")}</strong><small>{provider === "manual" ? t("manualProvider") : provider} · {t("previewChanges")}</small></div>{graph.nodes.map((n, i) => <label key={n.id}>{i + 1}{n.sourcePage ? " · " + t("page") + " " + n.sourcePage : ""}<input maxLength={10000} value={n.label} onChange={event => setGraph({ ...graph, nodes: graph.nodes.map((item, j) => i === j ? { ...item, label: event.target.value } : item) })}/></label>)}</div>}
    {graph && <fieldset className="apply-mode"><legend>{t("applyTo")}</legend><label><input type="radio" name="ai-apply" checked={mode === "append"} onChange={() => setMode("append")}/>{t("currentCanvas")}</label><label><input type="radio" name="ai-apply" checked={mode === "new"} onChange={() => setMode("new")}/>{t("newCanvas")}</label><small>{t("rollbackHint")}</small></fieldset>}
    <footer className="actions"><button type="button" className="secondary-button" onClick={onClose}>{t("cancel")}</button>{graph ? <button type="button" className="primary-button" onClick={() => onApply(graph, mode)}>{t("apply")}</button> : aiMode === "auto" && <button type="button" className="primary-button" disabled={!sourceReady || autoControlsDisabled} onClick={() => void run()}>{busy ? t("generating") : t("generatePreview")}</button>}</footer>
  </Dialog>;
}
