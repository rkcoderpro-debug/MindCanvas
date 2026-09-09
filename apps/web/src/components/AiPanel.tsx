import { useEffect, useRef, useState } from "react";
import type { StructuredMindMap } from "@mindcanvas/shared";
import Dialog from "./Dialog";
import { generateMindMap, uploadPdf } from "../lib/api";
import { saveDocumentToStorage } from "../lib/supabase";
import { useLanguage } from "../lib/i18n";
import { MAX_FILE_BYTES } from "../lib/board";
export default function AiPanel({ projectId, canUse, beforeGenerate, onClose, onApply }: {
  projectId: string; canUse: boolean; beforeGenerate: () => Promise<boolean>; onClose: () => void; onApply: (graph: StructuredMindMap) => void;
}) {
  const { t } = useLanguage();
  const [file, setFile] = useState<File | null>(null), [graph, setGraph] = useState<StructuredMindMap | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [provider, setProvider] = useState("");
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  const run = async () => {
    if (!file || !canUse) return;
    if (file.size > MAX_FILE_BYTES) { setError(t("fileTooLarge")); return; }
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(""); setGraph(null);
    try {
      if (!await beforeGenerate()) throw new Error(t("saveError"));
      const doc = await uploadPdf(file, request.signal);
      if (request.signal.aborted) return;
      await saveDocumentToStorage(file, doc.id, doc.text, doc.pageCount, projectId);
      const result = await generateMindMap(doc.text, doc.id, request.signal);
      if (request.signal.aborted) return;
      if (result.provider === "demo") throw new Error(t("aiDemo"));
      if (!result.graph?.nodes?.length || result.graph.nodes.length > 200 || !Array.isArray(result.graph.edges)) throw new Error(t("aiError"));
      setProvider(result.provider); setGraph(result.graph);
    } catch (err) { if (!request.signal.aborted) setError(t("aiError") + " " + (err instanceof Error ? err.message : "")); }
    finally { if (!request.signal.aborted) setBusy(false); }
  };
  return <Dialog title={t("ai")} onClose={onClose}>
    <p>{t("aiHint")}</p>
    {!canUse && <p role="alert">{t("loginRequired")}</p>}
    <label className="upload-drop">{t("choosePdf")}<input type="file" accept=".pdf,application/pdf" disabled={busy || !canUse} onChange={e => { setFile(e.target.files?.[0] ?? null); setGraph(null); setError(""); }}/><small>{t("pdfHint")}</small></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {busy && <p role="status">{t("generating")}</p>}
    {graph && <div className="graph-preview"><strong>{graph.nodes.length} {t("nodes")} · {graph.edges.length} {t("edges")}</strong><small>{provider}</small>
      {graph.nodes.map((n, i) => <label key={n.id}>{i + 1}{n.sourcePage ? " · " + t("page") + " " + n.sourcePage : ""}<input maxLength={10000} value={n.label} onChange={e => setGraph({ ...graph, nodes: graph.nodes.map((item, j) => i === j ? { ...item, label: e.target.value } : item) })}/></label>)}</div>}
    <footer className="actions"><button className="secondary-button" onClick={onClose}>{t("cancel")}</button>
      {graph ? <button className="primary-button" onClick={() => onApply(graph)}>{t("apply")}</button> : <button className="primary-button" disabled={!file || busy || !canUse} onClick={() => void run()}>{t("generate")}</button>}</footer>
  </Dialog>;
}
