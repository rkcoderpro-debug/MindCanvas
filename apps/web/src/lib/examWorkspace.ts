import { type ExamSettings, type ExamSource, type ExamBlueprint, type SavedExam, validateExamSettings } from "@mindcanvas/shared";
import type { QuizQuestion } from "./quiz";
export type ExamWorkspace = { settings: ExamSettings; sources: ExamSource[]; blueprint: ExamBlueprint | null; result: SavedExam | null; sourceConfirmed: boolean; planConfirmed: boolean };
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
  return data;
}
export function persistExamWorkspace(owner: string | null, value: ExamWorkspace) { localStorage.setItem(key(owner), JSON.stringify(value)); }
export function examAsQuiz(exam: SavedExam): QuizQuestion[] {
  if (exam.settings.format !== "quiz") throw new Error("Đề nhiều dạng chỉ xuất PDF.");
  return exam.draft.sections.flatMap(section => section.questions.map(question => {
    if (question.type !== "mcq" || question.options.length !== 4 || question.correctIndex === null) throw new Error("Quiz cần đúng bốn lựa chọn.");
    return { id: question.id, prompt: question.prompt, options: question.options as QuizQuestion["options"], correctIndex: question.correctIndex as QuizQuestion["correctIndex"], explanation: question.explanation, sourcePage: question.references[0]?.page ?? null, topic: section.title };
  }));
}
