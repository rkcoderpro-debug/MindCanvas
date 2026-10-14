import { type ExamSettings, type ExamSource, type ExamBlueprint, type SavedExam, validateExamSettings } from "@mindcanvas/shared";
import type { QuizQuestion } from "./quiz";
import { emptyManualExam, validateManualAttributes, type ManualExamWorkspace } from "./examManual";
export type ExamWorkspace = { settings: ExamSettings; sources: ExamSource[]; blueprint: ExamBlueprint | null; result: SavedExam | null; sourceConfirmed: boolean; planConfirmed: boolean; aiMode?: "auto" | "manual"; manual?: ManualExamWorkspace };
export const emptyExamWorkspace = (): ExamWorkspace => ({ settings: { format: "quiz", mode: "materials", difficulty: "medium", subject: "Tổng hợp", level: "Theo tài liệu", language: "vi" }, sources: [], blueprint: null, result: null, sourceConfirmed: false, planConfirmed: false });
const key = (owner: string | null) => `mindcanvas:exam-workspace:v1:${owner ?? "guest"}`;
export function loadExamWorkspace(owner: string | null): ExamWorkspace {
  const raw = localStorage.getItem(key(owner));
  if (!raw) return emptyExamWorkspace();
  if (raw.length > 4000000) throw new Error("Bản nháp lưu trên thiết bị vượt giới hạn.");
  const data = JSON.parse(raw) as ExamWorkspace;
  validateExamSettings(data.settings);
  if (!Array.isArray(data.sources) || data.sources.length > 6 || data.sources.some(source => !source || typeof source.id !== "string" || typeof source.text !== "string" || typeof source.name !== "string" || !Array.isArray(source.warnings))) throw new Error("Bản nháp nguồn không đọc được.");
  const safePlan = (plan: ExamBlueprint) => plan && typeof plan.title === "string" && Array.isArray(plan.sections) && plan.sections.length <= 12 && plan.sections.every(section => section && typeof section.id === "string" && typeof section.title === "string" && typeof section.instructions === "string");
  if (data.blueprint && !safePlan(data.blueprint)) throw new Error("Bản nháp cấu trúc không đọc được.");
  if (data.result && (data.result.owner !== (owner ?? "guest") || !safePlan(data.result.blueprint) || !data.result.draft || !Array.isArray(data.result.sources) || !Array.isArray(data.result.draft.sections) || data.result.draft.sections.some(section => !section || !Array.isArray(section.questions) || section.questions.some(question => !question || typeof question.prompt !== "string" || typeof question.answer !== "string" || typeof question.explanation !== "string" || !Array.isArray(question.options) || !Array.isArray(question.rubric) || !Array.isArray(question.references))))) throw new Error("Bản nháp đề không đọc được.");
  if (data.aiMode !== undefined && data.aiMode !== "auto" && data.aiMode !== "manual") throw new Error("Chế độ AI trong bản nháp không hợp lệ.");
  if (data.manual) {
    const manual = data.manual;
    if (!manual.attributes || typeof manual.importText !== "string" || manual.importText.length > 2000000 || typeof manual.attributes.instructions !== "string" || (manual.ocrPrompt !== undefined && typeof manual.ocrPrompt !== "string")) throw new Error("Bản nháp AI Manual không đọc được.");
    const session = manual.session;
    if (session) {
      validateExamSettings(session.settings);
      if (typeof session.id !== "string" || !Array.isArray(session.sources) || session.sources.length > 6 || session.sources.some(source => !source || typeof source.text !== "string" || typeof source.name !== "string") || typeof session.prompt !== "string" || session.prompt.length > 600000 || !Number.isInteger(session.maxQuestions) || session.maxQuestions < 1 || session.maxQuestions > 100) throw new Error("Prompt Manual lưu trước đó không hợp lệ.");
      validateManualAttributes(session.attributes, session.maxQuestions);
      if (session.replacement && (!safePlan(session.replacement.blueprint) || !Array.isArray(session.replacement.excludedPrompts) || typeof session.replacement.examId !== "string" || typeof session.replacement.questionId !== "string" || !Number.isInteger(session.replacement.sectionIndex) || !Number.isInteger(session.replacement.questionIndex))) throw new Error("Bản nháp thay thế câu không hợp lệ.");
    }
  }
  return { ...data, aiMode: data.aiMode ?? "auto", manual: data.manual ?? emptyManualExam() };
}
export function persistExamWorkspace(owner: string | null, value: ExamWorkspace) { const raw = JSON.stringify(value); if (raw.length > 4000000) throw new Error("Bản nháp vượt giới hạn lưu 4 MB."); localStorage.setItem(key(owner), raw); }
export function examAsQuiz(exam: SavedExam): QuizQuestion[] {
  if (exam.settings.format !== "quiz") throw new Error("Đề nhiều dạng chỉ xuất PDF.");
  return exam.draft.sections.flatMap(section => section.questions.map(question => {
    if (question.type !== "mcq" || question.options.length !== 4 || question.correctIndex === null) throw new Error("Quiz cần đúng bốn lựa chọn.");
    return { id: question.id, prompt: question.prompt, options: question.options as QuizQuestion["options"], correctIndex: question.correctIndex as QuizQuestion["correctIndex"], explanation: question.explanation, sourcePage: question.references[0]?.page ?? null, topic: section.title };
  }));
}
