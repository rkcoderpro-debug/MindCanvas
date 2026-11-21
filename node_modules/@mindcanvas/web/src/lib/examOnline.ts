export const ONLINE_TYPES = ["mcq", "blank", "numeric", "short", "essay"] as const;
export type OnlineType = typeof ONLINE_TYPES[number];
export type OriginalInfo = { id: string; name: string; mimeType: string; size: number; role: "template" | "material"; textOnly?: boolean };
export type OnlineQuestion = { id: string; type: OnlineType; section: string; prompt: string; points: number; options: string[]; correctIndex: number | null; answer: string; explanation: string; acceptedAnswers: string[]; caseSensitive: boolean; blanks: { id: string; label: string; acceptedAnswers: string[]; caseSensitive: boolean }[]; numeric: { value: number; absoluteTolerance: number; relativeTolerance: number; units: string[]; unitRequired: boolean } | null; rubric: { criterion: string; points: number }[]; references: { fileId: string; page: number | null; excerpt: string }[] };
export type OnlineExam = { id: string; revision: string; title: string; description: string; durationMinutes: number | null; questions: OnlineQuestion[]; sources: OriginalInfo[]; warnings: string[]; createdAt: string };
export type OnlineResponse = { choice?: number; text?: string; unit?: string; blanks?: Record<string, string> };
export type OnlineAttempt = { examId: string; revision: string; startedAt: number; endsAt: number | null; submittedAt: number | null; responses: Record<string, OnlineResponse>; selfScores: Record<string, number> };
export const normalizeAnswer = (value: string, caseSensitive = false) => { const result = value.normalize("NFKC").replace(/\s+/g, " ").trim(); return caseSensitive ? result : result.toLocaleLowerCase(); };
const object = (value: unknown): Record<string, any> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cần một đối tượng JSON."); return value as Record<string, any>; };
const string = (value: unknown, max: number, required = true) => { if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error(`Nội dung chữ thiếu hoặc vượt ${max} ký tự.`); return value.trim(); };
const number = (value: unknown, min: number, max: number, integer = false) => { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`Giá trị phải là ${integer ? "số nguyên " : "số "}từ ${min} đến ${max}.`); return value; };
const list = (value: unknown, min: number, max: number): any[] => { if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`Danh sách cần ${min}–${max} phần tử.`); return value; };
const answers = (value: unknown, required: boolean) => {
  const result = list(value ?? [], required ? 1 : 0, 30).map(item => string(item, 2000));
  if (new Set(result.map(item => normalizeAnswer(item, true))).size !== result.length) throw new Error("Đáp án được chấp nhận bị trùng."); return result;
};
export function validateOriginalInfos(value: unknown): OriginalInfo[] {
  const ids = new Set<string>();
  return list(value, 1, 6).map(item => { const row = object(item), id = string(row.id, 120); if (ids.has(id)) throw new Error("Mã tài liệu bị trùng."); ids.add(id);
    if (row.role !== "template" && row.role !== "material") throw new Error("Vai trò file không hợp lệ.");
    return { id, name: string(row.name, 250), mimeType: string(row.mimeType ?? "", 160, false), size: number(row.size, 0, 10 * 1024 * 1024, true), role: row.role, ...(row.textOnly === true ? { textOnly: true } : {}) };
  });
}
export function validateOnlineExam(value: unknown, sources: OriginalInfo[], maxQuestions = 100): Omit<OnlineExam, "id" | "revision" | "createdAt" | "sources"> {
  const input = object(value), ids = new Set<string>(), prompts = new Set<string>();
  if (input.schemaVersion !== 1) throw new Error("Đề cần schemaVersion: 1.");
  const errors: string[] = [];
  const questions = list(input.questions, 1, Math.min(100, maxQuestions)).map((item, index) => {
    try {
      const row = object(item), id = string(row.id ?? `q${index + 1}`, 120), prompt = string(row.prompt, 8000), type = row.type as OnlineType;
      if (["__proto__", "constructor", "prototype"].includes(id)) throw new Error("Mã câu không hợp lệ.");
      if (!ONLINE_TYPES.includes(type)) throw new Error("Loại câu cần là mcq, blank, numeric, short hoặc essay.");
      if (ids.has(id) || prompts.has(normalizeAnswer(prompt))) throw new Error("Trùng mã hoặc nội dung câu hỏi."); ids.add(id); prompts.add(normalizeAnswer(prompt));
      const points = number(row.points, .01, 100), options = list(row.options ?? [], type === "mcq" ? 4 : 0, type === "mcq" ? 4 : 0).map(option => string(option, 2000));
      if (new Set(options.map(option => normalizeAnswer(option))).size !== options.length) throw new Error("Các lựa chọn bị trùng.");
      const correctIndex = type === "mcq" ? number(row.correctIndex, 0, 3, true) : null;
      const answer = string(row.answer, 8000), explanation = string(row.explanation, 12000);
      if (correctIndex !== null && normalizeAnswer(answer) !== normalizeAnswer(options[correctIndex])) throw new Error("Đáp án không khớp lựa chọn đúng.");
      const acceptedAnswers = type === "short" ? answers(row.acceptedAnswers, false) : [];
      const blankIds = new Set<string>();
      const blanks = list(row.blanks ?? [], type === "blank" ? 1 : 0, type === "blank" ? 12 : 0).map(item => {
        const blank = object(item), id = string(blank.id, 80); if (blankIds.has(id)) throw new Error("Mã ô trống bị trùng."); blankIds.add(id);
        if (["__proto__", "constructor", "prototype"].includes(id)) throw new Error("Mã ô trống không hợp lệ.");
        if (!prompt.includes(`{{${id}}}`)) throw new Error(`Câu hỏi thiếu vị trí {{${id}}} cho ô trống.`);
        return { id, label: string(blank.label ?? id, 200), acceptedAnswers: answers(blank.acceptedAnswers, true), caseSensitive: blank.caseSensitive === true };
      });
      const markers = Array.from(prompt.matchAll(/\{\{([^{}]+)\}\}/g), match => match[1]);
      if (type === "blank" && markers.some(id => !blankIds.has(id))) throw new Error("Vị trí ô trống không có đáp án tương ứng.");
      let numeric: OnlineQuestion["numeric"] = null;
      if (type === "numeric") {
        const value = object(row.numeric), units = list(value.units ?? [], 0, 20).map(unit => string(unit, 80));
        numeric = { value: number(value.value, -1e100, 1e100), absoluteTolerance: number(value.absoluteTolerance ?? 0, 0, 1e100), relativeTolerance: number(value.relativeTolerance ?? 0, 0, 1), units, unitRequired: value.unitRequired === true };
        if (numeric.unitRequired && !units.length) throw new Error("Câu yêu cầu đơn vị nhưng chưa có danh sách đơn vị được chấp nhận.");
      }
      const manual = type === "essay" || (type === "short" && !acceptedAnswers.length);
      const rubric = list(row.rubric ?? [], manual ? 1 : 0, 30).map(item => { const part = object(item); return { criterion: string(part.criterion, 2000), points: number(part.points, .01, 100) }; });
      if (rubric.length && Math.abs(rubric.reduce((sum, part) => sum + part.points, 0) - points) > .001) throw new Error("Tổng điểm hướng dẫn chấm không khớp điểm câu.");
      const references = list(row.references ?? [], 0, 6).map(item => {
        const ref = object(item), fileId = string(ref.fileId, 120);
        if (!sources.some(source => source.id === fileId)) throw new Error("Tham chiếu đến file ngoài danh sách đã gửi.");
        return { fileId, page: ref.page == null ? null : number(ref.page, 1, 10000, true), excerpt: string(ref.excerpt ?? "", 1500, false) };
      });
      return { id, type, section: string(row.section ?? "", 200, false), prompt, points, options, correctIndex, answer, explanation, acceptedAnswers, caseSensitive: row.caseSensitive === true, blanks, numeric, rubric, references } as OnlineQuestion;
    } catch (cause) { errors.push(`Câu ${index + 1}: ${(cause as Error).message}`); return null; }
  });
  if (errors.length) throw new Error(errors.slice(0, 30).join("\n"));
  const valid = questions as OnlineQuestion[];
  if (valid.reduce((sum, question) => sum + question.points, 0) > 1000 + .001) throw new Error("Đề vượt 1.000 điểm.");
  return { title: string(input.title, 200), description: string(input.description ?? "", 2000, false), durationMinutes: input.durationMinutes == null ? null : number(input.durationMinutes, 1, 300, true), questions: valid, warnings: list(input.warnings ?? [], 0, 30).map(warning => string(warning, 1000)) };
}
export function parseOnlineExam(raw: string, sources: OriginalInfo[], maxQuestions: number) {
  if (raw.length > 2000000) throw new Error("Kết quả JSON vượt 2 MB.");
  let value: unknown; try { value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch { throw new Error("JSON không hợp lệ. Hãy yêu cầu AI trả lại đúng JSON hoặc sửa dấu ngoặc/dấu phẩy."); }
  return validateOnlineExam(value, sources, maxQuestions);
}
export const onlineTotalPoints = (exam: OnlineExam) => exam.questions.reduce((sum, q) => sum + q.points, 0);
export function gradeOnlineQuestion(question: OnlineQuestion, response: OnlineResponse = {}, selfScore?: number): { score: number; max: number; manual: boolean; pending: boolean } {
  const finish = (score: number, manual = false, pending = false) => ({ score, max: question.points, manual, pending });
  if (question.type === "essay" || (question.type === "short" && !question.acceptedAnswers.length)) return typeof selfScore === "number" && Number.isFinite(selfScore) && selfScore >= 0 && selfScore <= question.points ? finish(selfScore, true) : finish(0, true, true);
  if (question.type === "mcq") return finish(response.choice === question.correctIndex ? question.points : 0);
  if (question.type === "blank") return finish(question.points * question.blanks.filter(blank => { const text = normalizeAnswer(response.blanks?.[blank.id] ?? "", blank.caseSensitive); return !!text && blank.acceptedAnswers.some(answer => normalizeAnswer(answer, blank.caseSensitive) === text); }).length / question.blanks.length);
  if (question.type === "short") { const text = normalizeAnswer(response.text ?? "", question.caseSensitive); return finish(text && question.acceptedAnswers.some(answer => normalizeAnswer(answer, question.caseSensitive) === text) ? question.points : 0); }
  const text = (response.text ?? "").trim(), numeric = question.numeric!;
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(text)) return finish(0);
  const value = Number(text.replace(",", ".")); if (!Number.isFinite(value)) return finish(0);
  const unit = normalizeAnswer(response.unit ?? "", true), unitOk = unit ? numeric.units.some(expected => normalizeAnswer(expected, true) === unit) : !numeric.unitRequired;
  const allowed = numeric.absoluteTolerance + numeric.relativeTolerance * Math.abs(numeric.value), rounding = Number.EPSILON * Math.max(Math.abs(value), Math.abs(numeric.value), Number.MIN_VALUE) * 4;
  return finish(unitOk && Math.abs(value - numeric.value) <= allowed + rounding ? question.points : 0);
}
export function onlineAttemptResult(exam: OnlineExam, attempt: OnlineAttempt) {
  const grades = exam.questions.map(question => gradeOnlineQuestion(question, attempt.responses[question.id], attempt.selfScores[question.id]));
  return { score: grades.reduce((sum, grade) => sum + grade.score, 0), total: onlineTotalPoints(exam), pending: grades.filter(grade => grade.pending).length, autoScore: grades.filter(grade => !grade.manual).reduce((sum, grade) => sum + grade.score, 0), autoTotal: grades.filter(grade => !grade.manual).reduce((sum, grade) => sum + grade.max, 0), grades };
}
