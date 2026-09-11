import { useEffect, useMemo, useRef, useState } from "react";
import type { StructuredMindMap } from "@mindcanvas/shared";
import Dialog from "./Dialog";
import { generateMindMap, uploadPdf } from "../lib/api";
import { saveDocumentToStorage } from "../lib/supabase";
import { useLanguage } from "../lib/i18n";
import { MAX_FILE_BYTES } from "../lib/board";

function pageText(text: string, from: number, to: number) {
  const markers = [...text.matchAll(/\[PAGE\s+(\d+)\]/g)];
  if (!markers.length) return text;
  return markers.map((marker, i) => { const number = Number(marker[1]); const end = markers[i + 1]?.index ?? text.length; return number >= from && number <= to ? text.slice(marker.index, end) : ""; }).join("\n").trim();
}

export default function AiPanel({ projectId, canUse, beforeGenerate, onClose, onApply }: {
  projectId: string; canUse: boolean; beforeGenerate: () => Promise<boolean>; onClose: () => void; onApply: (graph: StructuredMindMap, mode: "append" | "new") => void;
}) {
  const { t } = useLanguage();
  const [file, setFile] = useState<File | null>(null), [graph, setGraph] = useState<StructuredMindMap | null>(null), [rawText, setRawText] = useState(""), [pageCount, setPageCount] = useState(0);
  const [from, setFrom] = useState(1), [to, setTo] = useState(1), [mode, setMode] = useState<"append" | "new">("append");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [provider, setProvider] = useState("");
  const controller = useRef<AbortController | undefined>(undefined), pdfUrl = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => () => { controller.current?.abort(); if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  const run = async () => {
    if (!file || !canUse) return;
    if (file.size > MAX_FILE_BYTES) { setError(t("fileTooLarge")); return; }
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(""); setGraph(null);
    try {
      if (!await beforeGenerate()) throw new Error(t("saveError"));
      const doc = await uploadPdf(file, request.signal); if (request.signal.aborted) return;
      setRawText(doc.text); setPageCount(doc.pageCount ?? 0); setFrom(1); setTo(doc.pageCount ?? 1);
      await saveDocumentToStorage(file, doc.id, doc.text, doc.pageCount, projectId);
      const result = await generateMindMap(doc.text, doc.id, request.signal);
      if (request.signal.aborted) return;
      if (result.provider === "demo") throw new Error(t("aiDemo"));
      if (!result.graph?.nodes?.length || result.graph.nodes.length > 200 || !Array.isArray(result.graph.edges)) throw new Error(t("aiError"));
      setProvider(result.provider); setGraph(result.graph);
    } catch (err) { if (!request.signal.aborted) setError(t("aiError") + " " + (err instanceof Error ? err.message : "")); }
    finally { if (!request.signal.aborted) setBusy(false); }
  };
  const regenerateRange = async () => {
    if (!rawText || !file || !canUse) return;
    const selected = pageText(rawText, Math.min(from, to), Math.max(from, to));
    if (!selected) { setError(t("noTextPages")); return; }
    const request = new AbortController(); controller.current = request; setBusy(true); setError(""); setGraph(null);
    try { const result = await generateMindMap(selected, undefined, request.signal); if (result.provider === "demo") throw new Error(t("aiDemo")); setProvider(result.provider); setGraph(result.graph); }
    catch (err) { if (!request.signal.aborted) setError(t("aiError") + " " + (err instanceof Error ? err.message : "")); }
    finally { if (!request.signal.aborted) setBusy(false); }
  };
  const hasPages = pageCount > 0;
  return <Dialog title={t("ai")} onClose={onClose}>
    <p>{t("aiHint")}</p>{!canUse && <p role="alert">{t("loginRequired")}</p>}
    <label className="upload-drop">{t("choosePdf")}<input type="file" accept=".pdf,application/pdf" disabled={busy || !canUse} onChange={e => { const next=e.target.files?.[0] ?? null; setFile(next); setGraph(null); setRawText(""); setPageCount(0); setError(""); }}/><small>{t("pdfHint")}</small></label>
    {file && <div className="pdf-workspace"><div className="pdf-preview"><strong>{t("pdfPreview")}</strong><iframe title={t("pdfPreview")} src={pdfUrl}/></div><div className="pdf-controls"><strong>{t("pageRange")}</strong><label><span>{t("fromPage")}</span><input type="number" min="1" max={pageCount || undefined} value={from} onChange={e=>setFrom(Math.max(1, Number(e.target.value)||1))}/></label><label><span>{t("toPage")}</span><input type="number" min="1" max={pageCount || undefined} value={to} onChange={e=>setTo(Math.max(1, Number(e.target.value)||1))}/></label>{hasPages && <small>{t("selectedPages")}: {Math.min(from,to)}–{Math.min(pageCount,Math.max(from,to))}</small>}{rawText && <button className="secondary-button" disabled={busy || !hasPages} onClick={()=>void regenerateRange()}>{t("generate")} · {t("selectedPages")}</button>}</div></div>}
    {error && <p className="form-error" role="alert">{error}</p>}{busy && <p role="status">{t("generating")}</p>}
    {graph && <div className="graph-preview"><div className="ai-preview-heading"><strong>{graph.nodes.length} {t("nodes")} · {graph.edges.length} {t("edges")}</strong><small>{provider} · {t("previewChanges")}</small></div>{graph.nodes.map((n,i)=><label key={n.id}>{i+1}{n.sourcePage ? " · "+t("page")+" "+n.sourcePage : ""}<input maxLength={10000} value={n.label} onChange={e=>setGraph({...graph,nodes:graph.nodes.map((item,j)=>i===j?{...item,label:e.target.value}:item)})}/></label>)}</div>}
    {graph && <fieldset className="apply-mode"><legend>{t("applyTo")}</legend><label><input type="radio" name="ai-apply" checked={mode==="append"} onChange={()=>setMode("append")}/>{t("currentCanvas")}</label><label><input type="radio" name="ai-apply" checked={mode==="new"} onChange={()=>setMode("new")}/>{t("newCanvas")}</label><small>{t("rollbackHint")}</small></fieldset>}
    <footer className="actions"><button className="secondary-button" onClick={onClose}>{t("cancel")}</button>{graph?<button className="primary-button" onClick={()=>onApply(graph,mode)}>{t("apply")}</button>:<button className="primary-button" disabled={!file||busy||!canUse} onClick={()=>void run()}>{t("generate")}</button>}</footer>
  </Dialog>;
}
