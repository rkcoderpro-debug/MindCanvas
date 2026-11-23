import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import type { QuizQuestion } from "../lib/quiz";
import FormulaText, { splitFormulaText } from "./FormulaText";

export type DraftQuestion = Omit<QuizQuestion, "correctIndex"> & { correctIndex: QuizQuestion["correctIndex"] | null };
export type QuizDraft = { title: string; description: string; questions: DraftQuestion[]; sourceDocumentId?: string | null };

export function blankQuizQuestion(): DraftQuestion {
  return { id: crypto.randomUUID(), prompt: "", options: ["", "", "", ""], correctIndex: null, explanation: "", sourcePage: null };
}

function FormulaPreview({ text }: { text: string }) {
  return splitFormulaText(text).some(part => part.kind === "math")
    ? <div className="quiz-formula-preview"><FormulaText text={text}/></div> : null;
}

export default function QuizDraftEditor({ draft, onChange, limit, disabled, allowAdd = true }: {
  draft: QuizDraft; onChange: (draft: QuizDraft) => void; limit: number; disabled: boolean; allowAdd?: boolean;
}) {
  const { t } = useLanguage();
  const [openId, setOpenId] = useState<string | null>(draft.questions[0]?.id ?? null);
  const focusId = useRef<string | null>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusId.current && focusId.current === openId && promptInput.current) {
      promptInput.current.focus();
      focusId.current = null;
    }
  }, [openId]);

  const count = draft.questions.length;
  const canAdd = count < limit && !disabled;
  const add = () => {
    if (!canAdd) return;
    const question = blankQuizQuestion();
    focusId.current = question.id;
    setOpenId(question.id);
    onChange({ ...draft, questions: [...draft.questions, question] });
  };
  const updateQuestion = (id: string, patch: Partial<DraftQuestion>) =>
    onChange({ ...draft, questions: draft.questions.map(question => question.id === id ? { ...question, ...patch } : question) });
  const remove = (id: string, index: number) => {
    const questions = draft.questions.filter(question => question.id !== id);
    if (openId === id) setOpenId(questions[Math.min(index, questions.length - 1)]?.id ?? null);
    onChange({ ...draft, questions });
  };

  return <fieldset className="quiz-preview-form quiz-studio-editor" disabled={disabled} aria-label={t("quizPreview")}>
    <label>{t("quizTitle")}<input value={draft.title} maxLength={200} onChange={event => onChange({ ...draft, title: event.target.value })}/></label>
    <label>{t("quizDescription")}<textarea rows={2} maxLength={1000} value={draft.description} onChange={event => onChange({ ...draft, description: event.target.value })}/></label>
    <details className="quiz-editor-help">
      <summary>{t("quizFormulaHelpTitle")}</summary>
      <p>{t("quizFormulaHelp")} <code>x², √, ≤, ≠</code> · <code>{"$x^2$, $$\\frac{a}{b}$$"}</code></p>
    </details>
    {allowAdd && <button type="button" className="secondary-button quiz-add-question" disabled={!canAdd} onClick={add}><Plus size={16}/>{t("quizAddQuestion")}</button>}
    <div className="quiz-preview-list">
      {draft.questions.map((question, index) => {
        const open = openId === question.id;
        const number = index + 1;
        const questionLabel = t("questionNumber", { count: number });
        return <article className="quiz-preview-question" key={question.id}>
          <div className="quiz-preview-question-header">
            <button type="button" className="quiz-editor-question-toggle" title={questionLabel} aria-expanded={open} aria-label={questionLabel} onClick={() => setOpenId(open ? null : question.id)}>
              <span className="quiz-editor-number">{number}</span><span className="quiz-editor-excerpt">{question.prompt.trim() || t("quizEmptyQuestion")}</span><ChevronDown size={16} aria-hidden="true"/>
            </button>
            <button className="icon-button danger" type="button" title={t("quizRemoveQuestion", { count: number })} aria-label={t("quizRemoveQuestion", { count: number })} onClick={() => remove(question.id, index)}><Trash2 size={16}/></button>
          </div>
          {open && <div className="quiz-editor-question-fields">
            <label>{t("questionSide")}<textarea ref={promptInput} rows={2} maxLength={8000} value={question.prompt} onChange={event => updateQuestion(question.id, { prompt: event.target.value })}/></label>
            <FormulaPreview text={question.prompt}/>
            <div className="quiz-option-editor">
              {question.options.map((option, optionIndex) => {
                const letter = String.fromCharCode(65 + optionIndex);
                return <div className="quiz-option-draft" key={letter}>
                  <label><span className="quiz-option-badge">{letter}</span><textarea rows={1} maxLength={2000} aria-label={t("quizAnswerOption", { letter })} value={option} onChange={event => {
                    const options = [...question.options] as DraftQuestion["options"];
                    options[optionIndex] = event.target.value;
                    updateQuestion(question.id, { options });
                  }}/></label>
                  <FormulaPreview text={option}/>
                </div>;
              })}
            </div>
            <label>{t("correctAnswer")}<select value={question.correctIndex ?? ""} onChange={event =>
              updateQuestion(question.id, { correctIndex: event.target.value === "" ? null : Number(event.target.value) as QuizQuestion["correctIndex"] })
            }>
              <option value="">{t("quizChooseCorrectAnswer")}</option>
              {question.options.map((_, optionIndex) => <option value={optionIndex} key={optionIndex}>{String.fromCharCode(65 + optionIndex)}</option>)}
            </select></label>
            <label>{t("explanation")}<textarea rows={2} maxLength={8000} value={question.explanation} onChange={event => updateQuestion(question.id, { explanation: event.target.value })}/></label>
            <FormulaPreview text={question.explanation}/>
          </div>}
        </article>;
      })}
    </div>
  </fieldset>;
}
