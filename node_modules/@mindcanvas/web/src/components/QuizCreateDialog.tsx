import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, ClipboardList, ClipboardPaste, FileUp, Pencil, Sparkles } from "lucide-react";
import type { QuizStore } from "../hooks/useQuizzes";
import type { AccountPlan } from "../lib/account";
import { DEFAULT_AI_OPTIONS, type AiGenerationOptions } from "../lib/aiOptions";
import { writeClipboardText } from "../lib/aiSource";
import { aiErrorMessage } from "../lib/aiErrors";
import { generateQuizFromFile } from "../lib/api";
import { MAX_FILE_BYTES } from "../lib/board";
import { useLanguage } from "../lib/i18n";
import {
  buildQuizPrompt, MAX_QUIZ_IMPORT_BYTES, MAX_QUIZ_QUESTIONS, parseQuizImport, parseQuizResult,
  QuizManualUsageLimitError, QuizQuestionLimitError,
} from "../lib/quiz";
import { saveDocumentToStorage } from "../lib/supabase";
import AiQualityControls from "./AiQualityControls";
import ContentLanguageField, { useContentLanguage } from "./ContentLanguageField";
import Dialog from "./Dialog";
import ManualAiProviderLinks from "./ManualAiProviderLinks";
import QuizDraftEditor, { blankQuizQuestion, type QuizDraft } from "./QuizDraftEditor";

const tabs = [
  { id: "auto", label: "aiAuto", icon: Sparkles },
  { id: "ai_manual", label: "aiManual", icon: ClipboardPaste },
  { id: "manual", label: "quizManualTab", icon: Pencil },
] as const;
type Mode = typeof tabs[number]["id"];

function readPromptLimit(raw: string, max: number) {
  const value = Number(raw);
  if (!raw.trim()) return { error: "quizQuestionCountRequired" } as const;
  if (!/^\d+$/.test(raw.trim())) return { error: "quizQuestionCountInteger" } as const;
  if (value < 3) return { error: "quizQuestionCountMinimum" } as const;
  if (!Number.isSafeInteger(value) || value > max) return { error: "quizQuestionCountMaximum" } as const;
  return { value } as const;
}

export default function QuizCreateDialog({ owner, store, accountPlan, open = true, onClose, onCreated }: {
  owner: string | null; store: QuizStore; accountPlan?: AccountPlan; open?: boolean; onClose: () => void; onCreated?: () => void;
}) {
  const { t, language } = useLanguage();
  const dialogId = useId();
  const formId = `${dialogId}-auto`;
  const [mode, setMode] = useState<Mode>(owner ? "auto" : "manual");
  const [outputLanguage, setOutputLanguage] = useContentLanguage("quiz");
  const [autoDocument, setAutoDocument] = useState<File | null>(null);
  const [autoDraft, setAutoDraft] = useState<QuizDraft | null>(null);
  const [options, setOptions] = useState<AiGenerationOptions>(DEFAULT_AI_OPTIONS);
  const [requirements, setRequirements] = useState("");
  const [rawCount, setRawCount] = useState(() => String(Math.min(10, accountPlan?.maxCards ?? 50)));
  const [countTouched, setCountTouched] = useState(false);
  const [copied, setCopied] = useState(false);
  const [existingJson, setExistingJson] = useState(false);
  const [json, setJson] = useState("");
  const [jsonFilename, setJsonFilename] = useState("");
  const [reading, setReading] = useState(false);
  const [checkingDraft, setCheckingDraft] = useState(false);
  const [imported, setImported] = useState<{ source: string; draft: QuizDraft } | null>(null);
  const [manual, setManual] = useState<QuizDraft>(() => ({ title: "", description: "", questions: [blankQuizQuestion()] }));
  const [cloudLimit, setCloudLimit] = useState<number>();
  const [inputError, setInputError] = useState("");
  const [promptError, setPromptError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const task = useRef<"auto" | "save" | null>(null);
  const generation = useRef<AbortController | null>(null);
  const fileRead = useRef(0);
  const copyTimer = useRef<number | undefined>(undefined);
  const saveIds = useRef<Partial<Record<Mode, string>>>({});
  const jsonInput = useRef<HTMLTextAreaElement>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => {
    generation.current?.abort();
    fileRead.current++;
    window.clearTimeout(copyTimer.current);
  }, []);

  const planLimit = Math.min(MAX_QUIZ_QUESTIONS, cloudLimit ?? accountPlan?.maxCards ?? 50);
  const promptCount = readPromptLimit(rawCount, planLimit);
  const promptLimit = promptCount.value;
  const standardImport = mode === "ai_manual" && !existingJson;
  const editorLimit = standardImport && promptLimit !== undefined ? promptLimit : planLimit;
  const canCheck = promptLimit !== undefined || existingJson;
  const draft = mode === "auto" ? autoDraft : mode === "manual" ? manual : checkingDraft ? imported?.draft ?? null : null;
  const count = draft?.questions.length ?? 0;
  const overflow = Math.max(0, count - editorLimit);
  const overMessage = overflow ? t("quizStudioOverLimit", { count: overflow }) : "";
  const prompt = promptLimit !== undefined ? buildQuizPrompt({ requirements, maxQuestions: promptLimit, language: outputLanguage, options }) : "";
  const validCount = !!draft && count > 0 && !overflow && (!standardImport || promptLimit !== undefined);
  let savable: ReturnType<typeof parseQuizResult> | null = null;
  if (validCount) {
    try { savable = parseQuizResult(draft, editorLimit); } catch { /* Keep the user in the editor until all required fields are valid. */ }
  }

  const close = () => {
    if (task.current === "save") return;
    generation.current?.abort();
    onClose();
  };
  const switchMode = (next: Mode) => {
    if (task.current || next === mode) return;
    setMode(next); setInputError(""); setSaveError(""); setPromptError("");
  };
  const updateDraft = (next: QuizDraft) => {
    setSaveError("");
    if (mode === "manual") setManual(next);
    else if (mode === "auto") setAutoDraft(next);
    else setImported(previous => previous ? { ...previous, draft: next } : previous);
  };
  const updateJson = (next: string, filename = "") => {
    setJson(next); setJsonFilename(filename); setInputError(""); setSaveError("");
  };
  const readFile = async (file: File) => {
    const token = ++fileRead.current;
    if (!/\.json$/i.test(file.name) || file.size > MAX_QUIZ_IMPORT_BYTES) {
      setReading(false); setInputError(t("quizJsonFileError")); return;
    }
    setReading(true); setInputError("");
    try {
      const data = await file.text();
      if (token === fileRead.current) updateJson(data, file.name);
    } catch {
      if (token === fileRead.current) setInputError(t("quizJsonFileError"));
    } finally { if (token === fileRead.current) setReading(false); }
  };
  const checkJson = () => {
    if (reading || !json.trim()) return;
    if (!canCheck) { setCountTouched(true); return; }
    setInputError(""); setSaveError("");
    if (new TextEncoder().encode(json).length > MAX_QUIZ_IMPORT_BYTES) { setInputError(t("quizJsonFileError")); return; }
    try {
      if (imported?.source !== json) {
        setImported({ source: json, draft: parseQuizImport(json) });
      }
      setCheckingDraft(true);
      requestAnimationFrame(() => editorHeading.current?.focus());
    } catch (err) {
      setInputError(err instanceof QuizQuestionLimitError
        ? t("quizImportLimit", { count: err.count, max: err.limit })
        : t("quizInvalidResult"));
    }
  };

  const copyPrompt = async () => {
    if (!prompt || existingJson) return;
    setPromptError("");
    try {
      await writeClipboardText(prompt);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch { setPromptError(t("clipboardWriteError")); }
  };
  const generate = async (event: FormEvent) => {
    event.preventDefault();
    if (task.current) return;
    if (promptLimit === undefined) { setCountTouched(true); return; }
    if (!autoDocument) { setInputError(t("quizFileRequired")); return; }
    if (autoDocument.size > MAX_FILE_BYTES) { setInputError(t("fileTooLarge")); return; }
    if (!owner) { setInputError(t("loginRequired")); return; }
    setBusy(true); setInputError(""); setSaveError("");
    task.current = "auto";
    const request = new AbortController(); generation.current = request;
    try {
      const generated = await generateQuizFromFile(autoDocument, promptLimit, request.signal, options, outputLanguage);
      if (request.signal.aborted) return;
      if (generated.provider === "demo" || !generated.questions?.length) throw new Error(t("quizGenerateError"));
      await saveDocumentToStorage(autoDocument, generated.source.id, generated.source.text, generated.source.pageCount);
      if (request.signal.aborted) return;
      const result = parseQuizResult(generated, MAX_QUIZ_QUESTIONS);
      setAutoDraft({ ...result, sourceDocumentId: generated.sourceDocumentId });
    } catch (err) { if (!request.signal.aborted) setInputError(aiErrorMessage(err, t, "quizGenerateError")); }
    finally { generation.current = null; task.current = null; setBusy(false); }
  };
  const save = async () => {
    if (!savable || task.current) return;
    if (!owner && mode === "ai_manual") { setSaveError(t("manualRequiresLogin")); return; }
    task.current = "save";
    setBusy(true); setSaveError("");
    try {
      if (mode === "auto") await store.createQuiz({ ...savable, sourceDocumentId: autoDraft?.sourceDocumentId });
      else await store.createStudioQuiz(savable, mode, saveIds.current[mode] ??= crypto.randomUUID());
      (onCreated ?? onClose)();
    } catch (err) {
      if (err instanceof QuizQuestionLimitError) {
        setCloudLimit(err.limit);
        if (Number(rawCount) > err.limit) setRawCount(String(err.limit));
      }
      else if (err instanceof QuizManualUsageLimitError) setSaveError(t("quizStudioManualLimit"));
      else setSaveError(t("quizSaveError"));
    } finally { task.current = null; setBusy(false); }
  };

  const showCountError = !!promptCount.error && (countTouched || !!rawCount.trim());
  const countField = <label>{t("maxQuestions")}
    <input type="text" inputMode="numeric" autoComplete="off" value={rawCount} disabled={busy}
      onChange={event => { setRawCount(event.target.value); setSaveError(""); }}
      onBlur={() => setCountTouched(true)}
      aria-invalid={showCountError}
      aria-describedby={showCountError ? `${dialogId}-count-error` : undefined}/>
    {promptCount.error && showCountError && <small id={`${dialogId}-count-error`} className="form-error" role="alert">{t(promptCount.error, { max: planLimit })}</small>}
  </label>;
  const quality = <AiQualityControls options={options} onChange={setOptions}/>;
  const editor = draft && <QuizDraftEditor key={mode} draft={draft} onChange={updateDraft} limit={editorLimit} disabled={busy} allowAdd={mode !== "auto"}/>;
  const canUseTabs = tabs.filter(tab => tab.id !== "auto" || !!owner);

  if (!open) return null;

  return <Dialog workspace className={`quiz-studio-dialog quiz-studio-${mode}`} title={t("createQuiz")} onClose={close} dismissible={!busy || !!generation.current}
    toolbar={<div className="quiz-studio-toolbar">
      <div className="ai-mode-switch quiz-studio-tabs" role="tablist" aria-label={t("aiMode")} onKeyDown={event => {
        const current = canUseTabs.findIndex(tab => tab.id === mode);
        const next = event.key === "ArrowRight" ? (current + 1) % canUseTabs.length : event.key === "ArrowLeft" ? (current - 1 + canUseTabs.length) % canUseTabs.length : event.key === "Home" ? 0 : event.key === "End" ? canUseTabs.length - 1 : -1;
        if (next < 0 || busy) return;
        event.preventDefault(); switchMode(canUseTabs[next].id);
        document.getElementById(`${dialogId}-tab-${canUseTabs[next].id}`)?.focus();
      }}>
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} id={`${dialogId}-tab-${id}`} role="tab" type="button"
          aria-controls={`${dialogId}-panel`} aria-selected={mode === id} tabIndex={mode === id ? 0 : -1}
          className={mode === id ? "active" : ""} disabled={busy || (id === "auto" && !owner)} onClick={() => switchMode(id)}>
          <Icon size={16} aria-hidden="true"/><span>{t(label)}</span>
        </button>)}
      </div>
    </div>}
    footer={<footer className="quiz-studio-footer">
      <div className="quiz-studio-save-status">
        {draft && <span role="status" className={overMessage ? "form-error" : ""}>
          <strong>{t("quizStudioCount", { count, max: editorLimit })}</strong>{overMessage ? ` · ${overMessage}` : ""}
        </span>}
        {saveError && <small className="form-error" role="alert">{saveError}</small>}
        {draft && !saveError && !overMessage && !savable && !(standardImport && promptLimit === undefined) && <small className="field-hint">{t(count ? "quizStudioIncomplete" : "quizStudioNoQuestions")}</small>}
      </div>
      <div className="quiz-studio-footer-actions">
        {draft && mode !== "manual" && <button type="button" className="secondary-button" disabled={busy} onClick={() => {
          setInputError(""); setSaveError("");
          if (mode === "auto") setAutoDraft(null);
          else { setCheckingDraft(false); requestAnimationFrame(() => jsonInput.current?.focus()); }
        }}><ArrowLeft size={16}/>{t(mode === "auto" ? "backToSource" : "quizBackToJson")}</button>}
        {draft ? <button type="button" className="primary-button" disabled={busy || !savable} onClick={() => void save()}>
          <Check size={16}/>{t(busy ? "saving" : mode === "auto" ? "saveQuiz" : "createQuiz")}
        </button> : mode === "auto" ? <button className="primary-button" form={formId} disabled={busy || !autoDocument} type="submit">{t(busy ? "generating" : "generateQuiz")}</button>
          : <button className="primary-button" type="button" disabled={reading || !json.trim() || !canCheck} onClick={checkJson}>{t("validateResult")}</button>}
      </div>
    </footer>}>
    <div key={mode} id={`${dialogId}-panel`} role="tabpanel" aria-labelledby={`${dialogId}-tab-${mode}`} className={mode === "ai_manual" ? "quiz-studio-panes" : "quiz-studio-single"}>
      {mode === "auto" ? draft ? editor : <form id={formId} className="quiz-create-form" onSubmit={event => void generate(event)}>
        <ContentLanguageField value={outputLanguage} onChange={setOutputLanguage} disabled={busy}/>
        <p>{t("quizAutoHint")}</p>
        <details className="quiz-advanced-settings"><summary>{language === "vi" ? "Độ khó và độ chi tiết" : "Difficulty and detail"}</summary>{quality}</details>
        <label className="upload-drop quiz-upload"><span><FileUp size={22}/>{t("quizChooseFile")}</span>
          <input type="file" accept=".pdf,.docx,.pptx,.txt,.md,.csv,image/*" disabled={busy} onChange={event => {
            const next = event.target.files?.[0] ?? null; setAutoDocument(next); setInputError(next && next.size > MAX_FILE_BYTES ? t("fileTooLarge") : "");
          }}/>{autoDocument && <small>{autoDocument.name}</small>}
        </label>
        {countField}
        {inputError && <p className="form-error" role="alert">{inputError}</p>}
      </form> : mode === "manual" ? <section className="quiz-studio-pane">
        <h3>{t("quizManualEditor")}</h3>
        {editor}
      </section> : <>
        <section className="quiz-studio-pane quiz-studio-prompt">
          <h3><span aria-hidden="true">1</span>{t("quizPromptPane")}</h3>
          {existingJson && <p className="field-hint quiz-studio-mode-hint">{t("quizReadyJsonHint")}</p>}
          <fieldset disabled={existingJson || busy} className="quiz-studio-settings">
            <ContentLanguageField value={outputLanguage} onChange={setOutputLanguage} disabled={existingJson || busy}/>
            {quality}
            <label>{t("quizRequirements")}<textarea rows={4} value={requirements} onChange={event => setRequirements(event.target.value)} placeholder={t("quizRequirementsHint")}/></label>
            {countField}
            <button type="button" className="secondary-button quiz-copy-prompt" disabled={!prompt} onClick={() => void copyPrompt()}>
              {copied ? <Check size={16}/> : <ClipboardList size={16}/>} {t(copied ? "copiedPrompt" : "copyPrompt")}
            </button>
            {!existingJson && <details className="quiz-editor-help"><summary>{t("aiManualPrompt")}</summary>
              <textarea readOnly rows={6} value={prompt} aria-label={t("aiManualPrompt")}/>
            </details>}
            <ManualAiProviderLinks disabled={!prompt || existingJson || busy} onBlocked={() => setPromptError(t("popupBlocked"))}/>
            {promptError && <p className="form-error" role="alert">{promptError}</p>}
          </fieldset>
        </section>
        <section className="quiz-studio-pane quiz-studio-import">
          <h3 ref={editorHeading} tabIndex={-1}><span aria-hidden="true">2</span>{t(draft ? "quizPreview" : "quizImportPane")}</h3>
          {draft ? editor : <div className="quiz-studio-json">
            <label className="quiz-json-check">
              <input type="checkbox" checked={existingJson} onChange={event => {
                setExistingJson(event.target.checked); setInputError(""); setPromptError(""); setSaveError("");
              }}/>{t("quizReadyJson")}
            </label>
            <label>{t(existingJson ? "quizJsonContent" : "aiManualJsonLabel")}<textarea ref={jsonInput} rows={10} spellCheck={false} className="quiz-json-input" value={json}
              onChange={event => { fileRead.current++; setReading(false); updateJson(event.target.value); }} placeholder={t("quizJsonPlaceholder")}/></label>
            {existingJson && <label className="upload-drop quiz-json-file">
              <span><FileUp size={17}/>{t("quizChooseJson")}</span>
              <input type="file" accept=".json,application/json" onChange={event => {
                const next = event.target.files?.[0]; event.target.value = ""; if (next) void readFile(next);
              }}/>
              {jsonFilename && <small>{jsonFilename}</small>}
            </label>}
            {inputError && <p className="form-error" role="alert">{inputError}</p>}
          </div>}
        </section>
      </>}
    </div>
  </Dialog>;
}
