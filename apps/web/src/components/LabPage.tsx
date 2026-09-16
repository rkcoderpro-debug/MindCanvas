import { useEffect, useMemo, useRef, useState } from "react";
import { Beaker, Clipboard, Download, FileText, Maximize2, Play, Plus, RefreshCw, Save, Trash2, Upload, WandSparkles } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { buildLabPlanPrompt, createLab, deleteLab, readLabs, saveLab, validateLabHtml, LAB_LIMITS, type LabProject, type LabSubject, type LabValidationCode } from "../lib/lab";

type Draft = {
  title: string;
  subject: LabSubject;
  learnerLevel: string;
  sourceFileName: string;
  sourceText: string;
  request: string;
};

const EMPTY_DRAFT: Draft = { title: "", subject: "physics", learnerLevel: "", sourceFileName: "", sourceText: "", request: "" };

function errorFor(code: LabValidationCode, t: ReturnType<typeof useLanguage>["t"]): string {
  if (code === "emptyHtml") return t("labHtmlRequired");
  if (code === "htmlTooLarge") return t("labHtmlTooLarge");
  return t("labUnsafeHtml");
}

async function readTextFile(file: File): Promise<string> {
  const name = file.name.toLocaleLowerCase();
  if (!/\.(txt|md|markdown|json|csv)$/.test(name) || file.size > 120_000) return "";
  return file.text();
}

export default function LabPage({ owner, onOpenLearning, embedded = false }: { owner: string | null; onOpenLearning?: () => void; embedded?: boolean }) {
  const { t, language } = useLanguage();
  const runnerRef = useRef<HTMLDivElement>(null);
  const [labs, setLabs] = useState<LabProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [designPrompt, setDesignPrompt] = useState("");
  // Keep legacy design data when an older saved Lab is opened. The current
  // workflow no longer asks the user to paste or validate that JSON.
  const [legacyDesign, setLegacyDesign] = useState<LabProject["design"]>(null);
  const [programHtml, setProgramHtml] = useState("");
  const [htmlFileName, setHtmlFileName] = useState("");
  const [runnerHtml, setRunnerHtml] = useState("");
  const [runnerKey, setRunnerKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState<"prompt" | "html" | null>(null);
  const [sourceBusy, setSourceBusy] = useState(false);

  useEffect(() => {
    const next = readLabs(owner);
    setLabs(next);
    if (next[0]) loadLab(next[0]);
    else resetDraft();
    // A Lab is intentionally account-scoped in this first release. It does not
    // inherit the currently open canvas or expose it to an iframe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  const selectedLab = useMemo(() => labs.find(item => item.id === selectedId) ?? null, [labs, selectedId]);

  function resetDraft() {
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
    setDesignPrompt("");
    setLegacyDesign(null);
    setProgramHtml("");
    setHtmlFileName("");
    setRunnerHtml("");
    setError("");
    setNotice("");
    setRunnerKey(value => value + 1);
  }

  function loadLab(lab: LabProject) {
    setSelectedId(lab.id);
    setDraft({ title: lab.title, subject: lab.subject, learnerLevel: lab.learnerLevel, sourceFileName: lab.sourceFileName, sourceText: lab.sourceText, request: lab.request });
    setDesignPrompt(lab.designPrompt || lab.planPrompt || lab.programPrompt);
    setLegacyDesign(lab.design);
    setProgramHtml(lab.programHtml);
    setHtmlFileName("");
    setRunnerHtml("");
    setError("");
    setNotice("");
    setRunnerKey(value => value + 1);
  }

  const updateDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));

  const chooseSource = async (file: File | undefined) => {
    if (!file) return;
    setSourceBusy(true);
    setError("");
    try {
      updateDraft("sourceFileName", file.name);
      const text = await readTextFile(file);
      if (text) updateDraft("sourceText", text);
      setNotice(t("labSourceReady"));
    } catch {
      setError(t("labSourceReadError"));
    } finally {
      setSourceBusy(false);
    }
  };

  const createDesignPrompt = () => {
    setError("");
    if (!draft.request.trim()) { setError(t("labRequestRequired")); return; }
    const prompt = buildLabPlanPrompt({ language, subject: draft.subject, learnerLevel: draft.learnerLevel, request: draft.request, sourceFileName: draft.sourceFileName, sourceText: draft.sourceText });
    setDesignPrompt(prompt);
    setNotice(t("labPromptReady"));
  };

  const runProgram = () => {
    setError("");
    const check = validateLabHtml(programHtml);
    if (!check.ok) { setError(errorFor(check.code, t)); return; }
    setRunnerHtml(programHtml.trim());
    setRunnerKey(value => value + 1);
    setNotice(check.warnings.length ? `${t("labRunning")} ${check.warnings.join(" ")}` : t("labRunning"));
  };

  const chooseHtmlFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (file.size > LAB_LIMITS.maxHtml) { setError(t("labHtmlTooLarge")); return; }
    try {
      setProgramHtml(await file.text());
      setHtmlFileName(file.name);
      setRunnerHtml("");
      setNotice(t("labHtmlFileReady"));
    } catch {
      setError(t("labHtmlFileError"));
    }
  };

  const saveCurrent = () => {
    setError("");
    if (!draft.request.trim()) { setError(t("labRequestRequired")); return; }
    const input = {
      title: draft.title.trim() || legacyDesign?.title || t("labUntitled"),
      subject: draft.subject,
      learnerLevel: draft.learnerLevel.trim(),
      sourceFileName: draft.sourceFileName,
      sourceText: draft.sourceText,
      request: draft.request.trim(),
      designPrompt,
      design: legacyDesign,
      // Keep both fields for v4.8.0/v4.8.1 readers, while the current UI has
      // one direct prompt that asks the external AI to create the HTML file.
      planPrompt: "",
      programPrompt: designPrompt,
      programHtml,
    };
    const saved = selectedId ? saveLab(owner, { ...input, id: selectedId }) : createLab(owner, input);
    const next = readLabs(owner);
    setLabs(next);
    setSelectedId(saved.id);
    setNotice(t("labSaved"));
  };

  const removeCurrent = () => {
    if (!selectedLab || !window.confirm(t("labDeleteConfirm"))) return;
    deleteLab(owner, selectedLab.id);
    const next = readLabs(owner);
    setLabs(next);
    if (next[0]) loadLab(next[0]);
    else resetDraft();
    setNotice(t("labDeleted"));
  };

  const copy = async (value: string, kind: "prompt" | "html") => {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const area = document.createElement("textarea");
        area.value = value; area.style.position = "fixed"; area.style.opacity = "0";
        document.body.append(area); area.select(); document.execCommand("copy"); area.remove();
      }
      setCopied(kind);
      window.setTimeout(() => setCopied(current => current === kind ? null : current), 1500);
    } catch {
      setError(t("labCopyError"));
    }
  };

  const downloadHtml = () => {
    if (!programHtml) return;
    const url = URL.createObjectURL(new Blob([programHtml], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${(draft.title.trim() || "mindcanvas-lab").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.html`;
    anchor.click(); URL.revokeObjectURL(url);
  };

  const fullscreenRunner = () => { if (runnerRef.current?.requestFullscreen) void runnerRef.current.requestFullscreen().catch(() => {}); };

  return <section className={`lab-page ${embedded ? "lab-page-embedded" : ""}`}>
    <header className="lab-header">
      <div className="lab-header-copy"><span className="eyebrow">LEARNING HUB · LAB</span><h1><Beaker size={28}/>{t("labTitle")}</h1><p>{t("labHint")}</p></div>
      <div className="lab-header-actions">{!embedded && onOpenLearning && <button className="secondary-button" type="button" onClick={onOpenLearning}><FileText size={16}/>{t("backToLearningHub")}</button>}<button className="primary-button" type="button" onClick={resetDraft}><Plus size={16}/>{t("labNew")}</button></div>
    </header>
    <div className="lab-layout">
      <aside className="lab-saved-panel"><div className="lab-panel-heading"><div><span className="eyebrow">LABS</span><h2>{t("labSavedTitle")}</h2></div><span>{labs.length}</span></div>{labs.length ? <div className="lab-saved-list">{labs.map(lab => <button key={lab.id} type="button" className={`lab-saved-row ${lab.id === selectedId ? "active" : ""}`} onClick={() => loadLab(lab)}><span className="lab-saved-icon"><Beaker size={16}/></span><span><strong>{lab.title}</strong><small>{lab.subject} · {new Date(lab.updatedAt).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US")}</small></span></button>)}</div> : <div className="lab-empty-saved"><Beaker size={23}/><p>{t("labNoSaved")}</p></div>}{selectedLab && <button type="button" className="text-danger-button lab-delete-button" onClick={removeCurrent}><Trash2 size={14}/>{t("labDelete")}</button>}</aside>
      <main className="lab-main">
        <section className="lab-card lab-step-card"><div className="lab-step-heading"><span className="lab-step-number">1</span><div><span className="eyebrow">AI MANUAL</span><h2>{t("labStepSource")}</h2><p>{t("labStepSourceHint")}</p></div></div><div className="lab-form-grid"><label>{t("labName")}<input value={draft.title} maxLength={200} onChange={event => updateDraft("title", event.target.value)} placeholder={t("labNamePlaceholder")}/></label><label>{t("labSubject")}<select value={draft.subject} onChange={event => updateDraft("subject", event.target.value as LabSubject)}><option value="physics">{t("labPhysics")}</option><option value="chemistry">{t("labChemistry")}</option><option value="other">{t("labOther")}</option></select></label><label>{t("labLearnerLevel")}<input value={draft.learnerLevel} maxLength={120} onChange={event => updateDraft("learnerLevel", event.target.value)} placeholder={t("labLearnerLevelPlaceholder")}/></label><label className="lab-upload-field"><span>{t("labSourceFile")}</span><span className="lab-file-control"><Upload size={16}/><span>{sourceBusy ? t("labReading") : draft.sourceFileName || t("labChooseFile")}</span><input type="file" accept=".pdf,.docx,.pptx,.txt,.md,.markdown,.json,.csv" onChange={event => void chooseSource(event.target.files?.[0])}/></span><small>{t("labSourceFileHint")}</small></label></div><label>{t("labSourceText")}<textarea rows={5} value={draft.sourceText} onChange={event => updateDraft("sourceText", event.target.value)} placeholder={t("labSourceTextPlaceholder")}/></label><label>{t("labRequest")}<textarea rows={4} value={draft.request} onChange={event => updateDraft("request", event.target.value)} placeholder={t("labRequestPlaceholder")}/></label><div className="lab-actions"><button className="primary-button" type="button" onClick={createDesignPrompt}><WandSparkles size={16}/>{t("labCreateHtmlPrompt")}</button>{designPrompt && <button className="secondary-button" type="button" onClick={() => void copy(designPrompt, "prompt")}><Clipboard size={15}/>{copied === "prompt" ? t("copiedPrompt") : t("copyPrompt")}</button>}</div>{designPrompt && <label className="lab-output-field"><span>{t("labHtmlPromptLabel")}</span><textarea rows={11} readOnly value={designPrompt}/></label>}</section>

        <section className="lab-card lab-step-card lab-run-card"><div className="lab-step-heading"><span className="lab-step-number">2</span><div><span className="eyebrow">SANDBOX RUNNER</span><h2>{t("labStepRun")}</h2><p>{t("labStepRunHint")}</p></div></div><label className="lab-upload-field"><span>{t("labHtmlFile")}</span><span className="lab-file-control"><Upload size={16}/><span>{htmlFileName || t("labHtmlFileHint")}</span><input type="file" accept=".html,.htm,text/html" onChange={event => void chooseHtmlFile(event.target.files?.[0])}/></span><small>{t("labHtmlUploadHint")}</small></label><label>{t("labHtmlInput")}<textarea rows={14} value={programHtml} onChange={event => { setProgramHtml(event.target.value); setHtmlFileName(""); setRunnerHtml(""); }} placeholder={t("labHtmlPlaceholder")}/></label><div className="lab-actions"><button className="primary-button" type="button" onClick={runProgram}><Play size={16}/>{t("labRun")}</button><button className="secondary-button" type="button" onClick={() => { setProgramHtml(""); setHtmlFileName(""); setRunnerHtml(""); }}><RefreshCw size={15}/>{t("labClearHtml")}</button>{programHtml && <button className="secondary-button" type="button" onClick={() => void copy(programHtml, "html")}><Clipboard size={15}/>{copied === "html" ? t("copiedPrompt") : t("copyPrompt")}</button>}{programHtml && <button className="secondary-button" type="button" onClick={downloadHtml}><Download size={15}/>{t("labDownloadHtml")}</button>}</div><div className="lab-runner-shell" ref={runnerRef}><div className="lab-runner-toolbar"><span><span className="lab-live-dot"/> {runnerHtml ? t("labReady") : t("labWaiting")}</span>{runnerHtml && <button type="button" className="icon-button" aria-label={t("labFullscreen")} title={t("labFullscreen")} onClick={fullscreenRunner}><Maximize2 size={16}/></button>}</div>{runnerHtml ? <iframe key={runnerKey} className="lab-runner-frame" title={draft.title || t("labTitle")} sandbox="allow-scripts" srcDoc={runnerHtml}/> : <div className="lab-runner-empty"><Beaker size={32}/><p>{t("labRunnerEmpty")}</p></div>}</div></section>
        {error && <p className="form-error lab-message" role="alert">{error}</p>}{notice && !error && <p className="lab-notice" role="status">{notice}</p>}
        <footer className="lab-footer-actions"><button className="primary-button" type="button" onClick={saveCurrent}><Save size={16}/>{t("labSave")}</button>{selectedLab && <button className="secondary-button" type="button" onClick={() => loadLab(selectedLab)}><RefreshCw size={15}/>{t("labDiscardChanges")}</button>}</footer>
      </main>
    </div>
  </section>;
}
