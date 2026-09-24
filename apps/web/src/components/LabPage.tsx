import { useEffect, useMemo, useRef, useState } from "react";
import { Beaker, Clipboard, Cloud, Download, FileText, Maximize2, Minimize2, Play, Plus, RefreshCw, Save, Trash2, Upload, WandSparkles } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { buildLabPlanPrompt, labSandboxDocument, validateLabHtml, LAB_LIMITS, type LabProject, type LabSubject, type LabValidationCode } from "../lib/lab";
import { canShare, deletePublishedLab, listMyLearningCopySources, listPublishedLabProjects, publishLab, type PublishedLabProject } from "../lib/learningShare";
import type { AccountPlan } from "../lib/account";
import { LearningShareButton } from "./LearningShareDialog";

import { mergeStoredLabs, readStoredLabs, saveStoredLab, deleteStoredLab, readLabDraft, writeLabDraft } from "../lib/labStorage";
import { emitGuideAction } from "../lib/featureGuides";

type Draft = {
  title: string;
  subject: LabSubject;
  learnerLevel: string;
  sourceFileName: string;
  sourceText: string;
  request: string;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenTarget = HTMLDivElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
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

function cloudLabToLocal(row: PublishedLabProject): LabProject {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    learnerLevel: row.learner_level,
    sourceFileName: "",
    sourceText: "",
    request: "",
    designPrompt: "",
    planPrompt: "",
    design: null,
    programPrompt: "",
    programHtml: row.program_html,
    allowExternalResources: row.allow_external_resources === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    systemDemo: false,
  };
}

export default function LabPage({ owner, onOpenLearning, embedded = false, accountPlan }: { owner: string | null; onOpenLearning?: () => void; embedded?: boolean; accountPlan?: AccountPlan }) {
  const { t, language } = useLanguage();
  const runnerRef = useRef<HTMLDivElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [labs, setLabs] = useState<LabProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [designPrompt, setDesignPrompt] = useState("");
  // Keep legacy design data when an older saved Lab is opened. The current
  // workflow no longer asks the user to paste or validate that JSON.
  const [legacyDesign, setLegacyDesign] = useState<LabProject["design"]>(null);
  const [programHtml, setProgramHtml] = useState("");
  const [allowExternalResources, setAllowExternalResources] = useState(false);
  const [htmlFileName, setHtmlFileName] = useState("");
  const [runnerHtml, setRunnerHtml] = useState("");
  const [runnerKey, setRunnerKey] = useState(0);
  const [isRunnerFullscreen, setIsRunnerFullscreen] = useState(false);
  const [runnerFallbackFullscreen, setRunnerFallbackFullscreen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState<"prompt" | "html" | null>(null);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [publishedIds, setPublishedIds] = useState<string[]>([]);
  const [savedLabSources, setSavedLabSources] = useState<Record<string, { title: string; ownerName: string }>>({});

  const loadedOwner = useRef<string | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const snapshot = JSON.stringify({ draft, designPrompt, legacyDesign, programHtml, allowExternalResources });
  const dirty = ready && snapshot !== savedFingerprint;
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const saveLock = useRef(false);
  useEffect(() => {
    if (programHtml.trim().length >= 20) emitGuideAction("lab:html-input");
  }, [programHtml]);
  useEffect(() => {
    let alive = true;
    setReady(false); setPublishedIds([]); setSavedLabSources({});
    void (async () => {
      try {
        const next = await readStoredLabs(owner);
        const backup = await readLabDraft<{ selectedId: string | null; draft: Draft; designPrompt: string; legacyDesign: LabProject["design"]; programHtml: string; allowExternalResources?: boolean; savedFingerprint: string }>(owner);
        if (!alive) return;
        setLabs(next);
        if (backup?.draft) {
          const backupAllowsExternal = backup.allowExternalResources === true;
          let restoredFingerprint = backup.savedFingerprint;
          try {
            const parts = JSON.parse(backup.savedFingerprint) as Record<string, unknown>;
            if (!("allowExternalResources" in parts)) restoredFingerprint = JSON.stringify({ ...parts, allowExternalResources: backupAllowsExternal });
          } catch { /* An invalid older fingerprint remains dirty and can be saved explicitly. */ }
          setSelectedId(backup.selectedId); setDraft(backup.draft); setDesignPrompt(backup.designPrompt); setLegacyDesign(backup.legacyDesign); setProgramHtml(backup.programHtml); setAllowExternalResources(backupAllowsExternal); setRunnerHtml(!backupAllowsExternal && validateLabHtml(backup.programHtml).ok ? backup.programHtml : ""); setSavedFingerprint(restoredFingerprint);
        } else {
          const initial = next.find(lab => !lab.systemDemo) ?? next[0];
          if (initial) loadLab(initial); else resetDraft();
        }
        loadedOwner.current = owner;
        setReady(true);
        if (owner) void (async () => {
          try {
            const [remote, copySources] = await Promise.all([
              listPublishedLabProjects(owner), listMyLearningCopySources().catch(() => []),
            ]);
            setSavedLabSources(Object.fromEntries(copySources.filter(item => item.kind === "lab").map(item => [item.copy_id, { title: item.source_title, ownerName: item.owner_name }])));
            const merge = await mergeStoredLabs(owner, remote.map(cloudLabToLocal));
            if (!alive) return;
            const refreshed = merge.added ? await readStoredLabs(owner) : next;
            setLabs(refreshed);
            setPublishedIds(remote.filter(row => refreshed.some(lab => lab.id === row.id && new Date(lab.updatedAt).getTime() === new Date(row.updated_at).getTime())).map(row => row.id));
            if (merge.conflicts) setNotice(`${merge.conflicts} Lab trên cloud có bản cục bộ khác; bản trên thiết bị được giữ nguyên.`);
          } catch {
            // Cloud recovery is additive. A temporary auth/network failure must
            // not hide the Labs already stored in this browser profile.
          }
        })();
      } catch { if (alive) { setError("Không thể mở nơi lưu Lab. Hãy cho phép lưu dữ liệu trình duyệt và tải lại trang."); } }
    })();
    return () => { alive = false; };
  }, [owner]);
  useEffect(() => {
    if (!ready || loadedOwner.current !== owner) return;
    void writeLabDraft(owner, { selectedId, draft, designPrompt, legacyDesign, programHtml, allowExternalResources, savedFingerprint }).catch(() => setError("Không thể giữ bản nháp. Hãy tải HTML xuống trước khi rời trang."));
  }, [ready, owner, selectedId, snapshot, savedFingerprint]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const confirmReplace = () => !dirty || window.confirm(language === "vi" ? "Thay thế nội dung chưa lưu?" : "Replace unsaved changes?");

  useEffect(() => {
    const documentWithWebkit = document as FullscreenDocument;
    const syncFullscreenState = () => setIsRunnerFullscreen((document.fullscreenElement ?? documentWithWebkit.webkitFullscreenElement ?? null) === runnerRef.current);
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState as EventListener);
    syncFullscreenState();
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!runnerFallbackFullscreen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setRunnerFallbackFullscreen(false); setIsRunnerFullscreen(false); }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [runnerFallbackFullscreen]);

  const selectedLab = useMemo(() => labs.find(item => item.id === selectedId) ?? null, [labs, selectedId]);

  function resetDraft() {
    setSavedFingerprint(JSON.stringify({ draft: EMPTY_DRAFT, designPrompt: "", legacyDesign: null, programHtml: "", allowExternalResources: false }));
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
    setDesignPrompt("");
    setLegacyDesign(null);
    setProgramHtml("");
    setAllowExternalResources(false);
    setHtmlFileName("");
    setRunnerHtml("");
    setIsRunnerFullscreen(false);
    setRunnerFallbackFullscreen(false);
    setError("");
    setNotice("");
    setRunnerKey(value => value + 1);
  }

  function loadLab(lab: LabProject) {
    setSavedFingerprint(JSON.stringify({ draft: { title: lab.title, subject: lab.subject, learnerLevel: lab.learnerLevel, sourceFileName: lab.sourceFileName, sourceText: lab.sourceText, request: lab.request }, designPrompt: lab.designPrompt || lab.planPrompt || lab.programPrompt, legacyDesign: lab.design, programHtml: lab.programHtml, allowExternalResources: lab.allowExternalResources }));
    setSelectedId(lab.id);
    setDraft({ title: lab.title, subject: lab.subject, learnerLevel: lab.learnerLevel, sourceFileName: lab.sourceFileName, sourceText: lab.sourceText, request: lab.request });
    setDesignPrompt(lab.designPrompt || lab.planPrompt || lab.programPrompt);
    setLegacyDesign(lab.design);
    setProgramHtml(lab.programHtml);
    setAllowExternalResources(lab.allowExternalResources);
    setHtmlFileName("");
    // Never start CDN code simply because a Lab was opened or restored.
    setRunnerHtml(!lab.allowExternalResources && validateLabHtml(lab.programHtml).ok ? lab.programHtml : "");
    setIsRunnerFullscreen(false);
    setRunnerFallbackFullscreen(false);
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
    emitGuideAction("lab:prompt");
  };

  const runProgram = () => {
    setError("");
    const check = validateLabHtml(programHtml, { allowExternalResources });
    if (!check.ok) {
      const needsCdnPermission = check.warnings.includes("external resource loading");
      setError(`${errorFor(check.code, t)}${needsCdnPermission ? " Bật tùy chọn tải thư viện CDN nếu bạn tin cậy file này." : ""}`);
      return;
    }
    setRunnerHtml(programHtml.trim());
    setRunnerKey(value => value + 1);
    setNotice(check.warnings.length ? `${t("labRunning")} ${check.warnings.join(" ")}` : t("labRunning"));
    emitGuideAction("lab:run");
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
      emitGuideAction("lab:html-input");
    } catch {
      setError(t("labHtmlFileError"));
    }
  };

  const saveCurrent = async () => {
    if (saveLock.current || !ready) return;
    saveLock.current = true; setSaving(true); setNotice("");
    const savingOwner = owner;
    try {
    setError("");
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
      allowExternalResources,
      systemDemo: selectedLab?.systemDemo === true,
    };
    const saved = await saveStoredLab(owner, { ...input, id: selectedId ?? undefined });
    const next = await readStoredLabs(owner);
    if (ownerRef.current !== savingOwner) return;
    setSavedFingerprint(snapshot);
    setLabs(next);
    setSelectedId(saved.id);
    setPublishedIds(ids => ids.filter(id => id !== saved.id));
    setNotice(t("labSaved"));
    emitGuideAction("lab:save");
    } catch { setError("Lưu Lab thất bại. Nội dung vẫn được giữ; hãy thử lại hoặc tải HTML xuống."); }
    finally { saveLock.current = false; setSaving(false); }
  };

  const syncAllToCloud = async () => {
    if (!owner || !canShare("lab", accountPlan?.effectivePlanId) || saving) return;
    setSaving(true); setError(""); setNotice("");
    let uploaded = 0;
    let failed = 0;
    try {
      const current = (await readStoredLabs(owner)).filter(lab => !lab.systemDemo && lab.programHtml.trim());
      for (const lab of current) {
        try { await publishLab(lab, owner); uploaded += 1; }
        catch { failed += 1; }
      }
      const remote = await listPublishedLabProjects(owner);
      setPublishedIds(remote.filter(row => current.some(lab => lab.id === row.id && new Date(lab.updatedAt).getTime() === new Date(row.updated_at).getTime())).map(row => row.id));
      setNotice(failed ? `Đã đồng bộ ${uploaded} Lab; ${failed} Lab chưa tải được. Dữ liệu trên thiết bị vẫn được giữ.` : `Đã đồng bộ ${uploaded} Lab lên cloud.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thể đồng bộ Lab lên cloud. Dữ liệu trên thiết bị vẫn được giữ.");
    } finally {
      setSaving(false);
    }
  };

  const exportLabBackup = async () => {
    try {
      const personal = (await readStoredLabs(owner)).filter(lab => !lab.systemDemo);
      const payload = { format: "mindcanvas-labs-backup", version: 1, exportedAt: new Date().toISOString(), labs: personal };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "mindcanvas-labs-backup.json";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`Đã xuất ${personal.length} Lab để sao lưu.`);
    } catch {
      setError("Không thể xuất bản sao lưu Lab.");
    }
  };

  const importLabBackup = async (file: File | undefined) => {
    if (!file) return;
    setError(""); setNotice("");
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const labs = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && "format" in parsed && parsed.format === "mindcanvas-labs-backup" && "version" in parsed && parsed.version === 1 && "labs" in parsed && Array.isArray(parsed.labs)
          ? parsed.labs
          : null;
      if (!labs) throw new Error("File không đúng định dạng sao lưu MindCanvas.");
      const result = await mergeStoredLabs(owner, labs);
      const next = await readStoredLabs(owner);
      setLabs(next);
      setNotice(`Đã nhập ${result.added} Lab mới${result.conflicts ? `; giữ nguyên ${result.conflicts} Lab bị trùng nội dung.` : "."}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thể nhập bản sao lưu Lab.");
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  };

  const removeCurrent = async () => {
    if (!selectedLab || selectedLab.systemDemo || !window.confirm(t("labDeleteConfirm"))) return;
    if (owner) {
      try { await deletePublishedLab(selectedLab.id, owner); }
      catch (e) { setError(e instanceof Error ? e.message : "Không thể xóa Lab trên cloud."); return; }
    }
    try { await deleteStoredLab(owner, selectedLab.id); } catch { setError("Không thể xóa Lab trên thiết bị."); return; }
    const next = await readStoredLabs(owner);
    setLabs(next);
    const initial = next.find(lab => !lab.systemDemo) ?? next[0];
    if (initial) loadLab(initial);
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
    anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const toggleRunnerFullscreen = async () => {
    const target = runnerRef.current as FullscreenTarget | null;
    const documentWithWebkit = document as FullscreenDocument;
    if (!target) return;
    try {
      const active = document.fullscreenElement ?? documentWithWebkit.webkitFullscreenElement ?? null;
      if (active === target) {
        const exit = document.exitFullscreen ?? documentWithWebkit.webkitExitFullscreen;
        if (!exit) { setIsRunnerFullscreen(false); return; }
        await exit.call(document);
        setIsRunnerFullscreen(false);
        return;
      }
      if (runnerFallbackFullscreen) { setRunnerFallbackFullscreen(false); setIsRunnerFullscreen(false); return; }
      const request = target.requestFullscreen ?? target.webkitRequestFullscreen;
      if (!request) { setRunnerFallbackFullscreen(true); setIsRunnerFullscreen(true); return; }
      await request.call(target);
      // The fullscreenchange event remains the source of truth for Escape or
      // another browser-level exit. Updating after the promise resolves makes
      // the control respond immediately in browsers that dispatch the event
      // on a later task.
      setIsRunnerFullscreen(true);
    } catch {
      // iOS/Safari variants may expose Fullscreen API but reject it for this
      // element. Keep the same iframe alive and use a fixed-position fallback.
      setRunnerFallbackFullscreen(true);
      setIsRunnerFullscreen(true);
    }
  };

  return <section className={`lab-page ${embedded ? "lab-page-embedded" : ""}`}>
    <header className="lab-header">
      <div className="lab-header-copy"><span className="eyebrow">LEARNING HUB · LAB</span><h1><Beaker size={28}/>{t("labTitle")}</h1><p>{t("labHint")}</p></div>
      <div className="lab-header-actions">{!embedded && onOpenLearning && <button className="secondary-button" type="button" onClick={onOpenLearning}><FileText size={16}/>{t("backToLearningHub")}</button>}<button className="secondary-button" type="button" disabled={!ready || saving} onClick={() => void exportLabBackup()} title="Xuất toàn bộ Lab trên thiết bị thành một file JSON"><Download size={16}/>Xuất Lab</button><button className="secondary-button" type="button" disabled={!ready || saving} onClick={() => backupInputRef.current?.click()} title="Nhập Lab từ file sao lưu JSON"><Upload size={16}/>Nhập Lab</button><input ref={backupInputRef} type="file" accept="application/json,.json" hidden onChange={event => void importLabBackup(event.target.files?.[0])}/>{owner && canShare("lab", accountPlan?.effectivePlanId) && <button className="secondary-button" type="button" disabled={!ready || saving} onClick={() => void syncAllToCloud()} title="Đưa các Lab đã lưu trên thiết bị lên cloud để khôi phục ở profile khác"><Cloud size={16}/>Đồng bộ Lab</button>}<button className="primary-button" type="button" disabled={!ready || saving} onClick={() => { if (confirmReplace()) resetDraft(); }}><Plus size={16}/>{t("labNew")}</button></div>
    </header>
    <div className="lab-layout">
      <aside className="lab-saved-panel"><div className="lab-panel-heading"><div><span className="eyebrow">LABS</span><h2>{t("labSavedTitle")}</h2></div><span>{labs.length}</span></div>{labs.length ? <div className="lab-saved-list">{labs.map(lab => <div key={lab.id} className="lab-saved-entry"><button type="button" className={`lab-saved-row ${lab.id === selectedId ? "active" : ""}`} disabled={saving} onClick={() => { if (confirmReplace()) loadLab(lab); }}><span className="lab-saved-icon"><Beaker size={16}/></span><span><strong>{lab.title}{lab.systemDemo ? " · Demo" : ""}</strong><small>{lab.subject} · {new Date(lab.updatedAt).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US")}</small>{savedLabSources[lab.id] && <small className="learning-copy-provenance">Đã lưu từ {savedLabSources[lab.id].ownerName}</small>}</span></button></div>)}</div> : <div className="lab-empty-saved"><Beaker size={23}/><p>{t("labNoSaved")}</p></div>}{selectedLab && !selectedLab.systemDemo && <button type="button" className="text-danger-button lab-delete-button" onClick={removeCurrent}><Trash2 size={14}/>{t("labDelete")}</button>}</aside>
      <main className="lab-main">
        {selectedLab && <div className="lab-detail-actions"><button className="secondary-button" disabled={dirty || saving || !owner || !selectedLab.programHtml || !canShare("lab", accountPlan?.effectivePlanId)} title={dirty ? "Hãy lưu thay đổi trên thiết bị trước khi tải lên cloud" : !canShare("lab", accountPlan?.effectivePlanId) ? "Cần gói Pro để đưa Lab lên cloud" : undefined} onClick={() => { if (!owner) return; setError(""); void publishLab(selectedLab, owner).then(() => { setPublishedIds(ids => [...new Set([...ids, selectedLab.id])]); setNotice("Đã lưu HTML mô phỏng lên cloud. Nếu vừa sửa Lab, hãy lưu local rồi tải lên lại."); }).catch(e => setError(e.message)); }}>Lưu Lab lên cloud</button><LearningShareButton kind="lab" id={selectedLab.id} title={selectedLab.title} plan={accountPlan} available={!dirty && publishedIds.includes(selectedLab.id)}/></div>}
        <section className="lab-card lab-step-card"><div className="lab-step-heading"><span className="lab-step-number">1</span><div><span className="eyebrow">AI MANUAL</span><h2>{t("labStepSource")}</h2><p>{t("labStepSourceHint")}</p></div></div><div className="lab-form-grid"><label>{t("labName")}<input value={draft.title} maxLength={200} onChange={event => updateDraft("title", event.target.value)} placeholder={t("labNamePlaceholder")}/></label><label>{t("labSubject")}<select value={draft.subject} onChange={event => updateDraft("subject", event.target.value as LabSubject)}><option value="physics">{t("labPhysics")}</option><option value="chemistry">{t("labChemistry")}</option><option value="other">{t("labOther")}</option></select></label><label>{t("labLearnerLevel")}<input value={draft.learnerLevel} maxLength={120} onChange={event => updateDraft("learnerLevel", event.target.value)} placeholder={t("labLearnerLevelPlaceholder")}/></label><label className="lab-upload-field"><span>{t("labSourceFile")}</span><span className="lab-file-control"><Upload size={16}/><span>{sourceBusy ? t("labReading") : draft.sourceFileName || t("labChooseFile")}</span><input type="file" accept=".pdf,.docx,.pptx,.txt,.md,.markdown,.json,.csv" onChange={event => void chooseSource(event.target.files?.[0])}/></span><small>{t("labSourceFileHint")}</small></label></div><label>{t("labSourceText")}<textarea rows={5} value={draft.sourceText} onChange={event => updateDraft("sourceText", event.target.value)} placeholder={t("labSourceTextPlaceholder")}/></label><label>{t("labRequest")}<textarea rows={4} value={draft.request} onChange={event => updateDraft("request", event.target.value)} placeholder={t("labRequestPlaceholder")}/></label><div className="lab-actions"><button className="primary-button" type="button" onClick={createDesignPrompt}><WandSparkles size={16}/>{t("labCreateHtmlPrompt")}</button>{designPrompt && <button className="secondary-button" type="button" onClick={() => void copy(designPrompt, "prompt")}><Clipboard size={15}/>{copied === "prompt" ? t("copiedPrompt") : t("copyPrompt")}</button>}</div>{designPrompt && <label className="lab-output-field"><span>{t("labHtmlPromptLabel")}</span><textarea rows={11} readOnly value={designPrompt}/></label>}</section>

        <section className="lab-card lab-step-card lab-run-card"><div className="lab-step-heading"><span className="lab-step-number">2</span><div><span className="eyebrow">SANDBOX RUNNER</span><h2>{t("labStepRun")}</h2><p>{t("labStepRunHint")}</p></div></div><label className="lab-upload-field"><span>{t("labHtmlFile")}</span><span className="lab-file-control"><Upload size={16}/><span>{htmlFileName || t("labHtmlFileHint")}</span><input type="file" accept=".html,.htm,text/html" onChange={event => void chooseHtmlFile(event.target.files?.[0])}/></span><small>{t("labHtmlUploadHint")}</small></label><label>{t("labHtmlInput")}<textarea rows={14} value={programHtml} onChange={event => { setProgramHtml(event.target.value); setHtmlFileName(""); setRunnerHtml(""); }} placeholder={t("labHtmlPlaceholder")}/></label><label className="lab-external-resource-option"><input type="checkbox" checked={allowExternalResources} onChange={event => { setAllowExternalResources(event.target.checked); setRunnerHtml(""); setRunnerKey(value => value + 1); }}/><span><strong>Cho phép tải thư viện CDN cho Lab này</strong><small>Chỉ cho phép unpkg, jsDelivr, cdn.tailwindcss.com và cdnjs. Cần Internet; API/Gemini bị chặn, localStorage chỉ lưu tạm trong phiên và không đọc được dữ liệu MindCanvas. Chỉ bật với file bạn tin cậy.</small></span></label><div className="lab-actions"><button className="primary-button" type="button" onClick={runProgram}><Play size={16}/>{t("labRun")}</button><button className="secondary-button" type="button" onClick={() => { setProgramHtml(""); setHtmlFileName(""); setRunnerHtml(""); setIsRunnerFullscreen(false); setRunnerFallbackFullscreen(false); }}><RefreshCw size={15}/>{t("labClearHtml")}</button>{programHtml && <button className="secondary-button" type="button" onClick={() => void copy(programHtml, "html")}><Clipboard size={15}/>{copied === "html" ? t("copiedPrompt") : t("copyPrompt")}</button>}{programHtml && <button className="secondary-button" type="button" onClick={downloadHtml}><Download size={15}/>{t("labDownloadHtml")}</button>}</div><div className={`lab-runner-shell ${runnerFallbackFullscreen ? "lab-runner-fallback-fullscreen" : ""}`} ref={runnerRef}><div className="lab-runner-toolbar">{isRunnerFullscreen && (error || notice) && <small role={error ? "alert" : "status"}>{error || notice}</small>}<button type="button" disabled={!ready || saving} onClick={() => void saveCurrent()}><Save size={15}/>{saving ? "Đang lưu…" : t("labSave")}</button><span><span className="lab-live-dot"/> {runnerHtml ? t("labReady") : t("labWaiting")}</span>{runnerHtml && <button type="button" className="icon-button" aria-label={t(isRunnerFullscreen ? "labExitFullscreen" : "labFullscreen")} title={t(isRunnerFullscreen ? "labExitFullscreen" : "labFullscreen")} onClick={() => void toggleRunnerFullscreen()}>{isRunnerFullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>}</div>{runnerHtml ? <iframe key={runnerKey} className="lab-runner-frame" title={draft.title || t("labTitle")} sandbox="allow-scripts" srcDoc={labSandboxDocument(runnerHtml, { allowExternalResources })}/> : <div className="lab-runner-empty"><Beaker size={32}/><p>{t("labRunnerEmpty")}</p></div>}</div></section>
        {error && <p className="form-error lab-message" role="alert">{error}</p>}{notice && !error && <p className="lab-notice" role="status">{notice}</p>}
        <footer className="lab-footer-actions"><span role="status">{saving ? "Đang lưu…" : dirty ? "Chưa lưu" : ready ? "Đã tải / đã lưu trên thiết bị" : "Đang tải…"}</span><button className="primary-button" type="button" disabled={!ready || saving} onClick={() => void saveCurrent()}><Save size={16}/>{t("labSave")}</button>{selectedLab && <button className="secondary-button" type="button" disabled={saving} onClick={() => { if (confirmReplace()) loadLab(selectedLab); }}><RefreshCw size={15}/>{t("labDiscardChanges")}</button>}</footer>
      </main>
    </div>
  </section>;
}
