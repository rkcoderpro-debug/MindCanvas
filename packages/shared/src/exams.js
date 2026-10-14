export const MAX_EXAM_SOURCES = 6;
export const MAX_EXAM_TEXT = 120000;
export const MAX_EXAM_QUESTIONS = 100;
export const EXAM_TYPES = ["mcq", "short", "essay", "truefalse", "other"];
export class ExamValidationError extends Error {
    constructor(message) { super(message); this.name = "ExamValidationError"; }
}
const fail = (message) => { throw new ExamValidationError(message); };
function record(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : fail("Dữ liệu đề thi không hợp lệ."); }
function text(value, max, required = true) {
    if (typeof value !== "string" || value.length > max || (required && !value.trim()))
        return fail("Nội dung còn thiếu hoặc quá dài.");
    return value.trim();
}
function number(value, min, max, integer = false) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))
        return fail("Số câu, thời gian hoặc điểm không hợp lệ.");
    return value;
}
function list(value, min, max) { return Array.isArray(value) && value.length >= min && value.length <= max ? value : fail("Danh sách không đúng giới hạn."); }
function warnings(value) { return value == null ? [] : list(value, 0, 20).map(item => text(item, 1000)); }
const normalized = (value) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
export const examQuestionCount = (plan) => plan.sections.reduce((sum, section) => sum + section.count, 0);
export const examTotalPoints = (plan) => Math.round(plan.sections.reduce((sum, section) => sum + section.count * section.points, 0) * 100) / 100;
export function validateExamSettings(value) {
    const input = record(value);
    if ((input.format !== "quiz" && input.format !== "paper") || (input.mode !== "template" && input.mode !== "materials") || !["easy", "medium", "hard"].includes(String(input.difficulty)) || (input.language !== "vi" && input.language !== "en"))
        return fail("Thiết lập đề thi không hợp lệ.");
    if (input.format === "paper" && input.mode !== "template")
        return fail("Đề nhiều dạng cần một đề mẫu để giữ cấu trúc.");
    return { format: input.format, mode: input.mode, difficulty: input.difficulty, language: input.language, subject: text(input.subject, 160), level: text(input.level, 160) };
}
export function validateExamSources(value, mode) {
    const ids = new Set();
    const sources = list(value, 1, MAX_EXAM_SOURCES).map(item => {
        const source = record(item), id = text(source.id, 120);
        if (ids.has(id))
            return fail("Tài liệu bị trùng mã.");
        ids.add(id);
        if (source.role !== "template" && source.role !== "material")
            return fail("Vai trò tài liệu không hợp lệ.");
        const content = text(source.text, MAX_EXAM_TEXT);
        if (content.replace(/\[PAGE \d+\]/g, "").trim().length < 20)
            return fail("Tài liệu quá ít nội dung. Hãy bổ sung hoặc đọc lại file.");
        return { id, name: text(source.name, 250), role: source.role, text: content, warnings: warnings(source.warnings), ...(source.pageCount == null ? {} : { pageCount: number(source.pageCount, 1, 1000, true) }) };
    });
    if (sources.reduce((sum, source) => sum + source.text.length, 0) > MAX_EXAM_TEXT)
        return fail("Tổng nội dung vượt 120.000 ký tự. Hãy chọn bớt tài liệu hoặc rút gọn phần sử dụng.");
    const templates = sources.filter(source => source.role === "template");
    if (templates.length > 1 || (mode === "template" && templates.length !== 1) || (mode === "materials" && templates.length))
        return fail("Hãy chọn đúng một đề mẫu khi tạo đề tương tự, hoặc chỉ tài liệu khi tạo Quiz theo tài liệu.");
    return sources;
}
export function validateExamBlueprint(value, format) {
    const input = record(value), ids = new Set();
    const sections = list(input.sections, 1, 12).map(item => {
        const section = record(item), id = text(section.id, 120);
        if (ids.has(id))
            return fail("Mã phần đề bị trùng.");
        ids.add(id);
        if (!EXAM_TYPES.includes(section.type) || (format === "quiz" && section.type !== "mcq"))
            return fail("Quiz chỉ dùng câu hỏi 4 lựa chọn.");
        const optionsCount = section.type === "mcq" ? number(section.optionsCount ?? 4, 2, 8, true) : undefined;
        if (format === "quiz" && optionsCount !== 4) return fail("Quiz needs exactly four choices.");
        return { id, title: text(section.title, 200), instructions: text(section.instructions ?? "", 2000, false), type: section.type, count: number(section.count, 1, MAX_EXAM_QUESTIONS, true), points: number(section.points, .01, 100), optionsCount };
    });
    const plan = { title: text(input.title, 200), durationMinutes: number(input.durationMinutes, 5, 300, true), sections, warnings: warnings(input.warnings) };
    if (examQuestionCount(plan) > MAX_EXAM_QUESTIONS || examTotalPoints(plan) > 1000)
        return fail("Đề vượt 100 câu hoặc 1.000 điểm.");
    return plan;
}
export function validateExamDraft(value, blueprint, sources, format) {
    blueprint = validateExamBlueprint(blueprint, format);
    const input = record(value), ids = new Set(), prompts = new Set();
    const sections = list(input.sections, blueprint.sections.length, blueprint.sections.length).map((item, sectionIndex) => {
        const section = record(item), expected = blueprint.sections[sectionIndex];
        if (section.id !== expected.id)
            return fail("AI không giữ đúng thứ tự/cấu trúc các phần đã xác nhận.");
        const questions = list(section.questions, expected.count, expected.count).map((item, index) => {
            const question = record(item), id = text(question.id ?? `${expected.id}-${index + 1}`, 120), prompt = text(question.prompt, 8000);
            if (ids.has(id) || prompts.has(normalized(prompt)))
                return fail("Đề có câu hỏi hoặc mã câu bị trùng.");
            ids.add(id);
            prompts.add(normalized(prompt));
            if (question.type !== expected.type || (format === "quiz" && question.type !== "mcq") || Math.abs(number(question.points, .01, 100) - expected.points) > .001)
                return fail("Loại câu hoặc điểm không đúng cấu trúc đã xác nhận.");
            if (prompt.length > 35 && sources.some(source => source.role === "template" && normalized(source.text).includes(normalized(prompt))))
                return fail("Câu hỏi sao chép nguyên văn đề mẫu. Hãy tạo lại câu mới.");
            const options = list(question.options ?? [], question.type === "mcq" ? (expected.optionsCount ?? 4) : 0, question.type === "mcq" ? (expected.optionsCount ?? 4) : 12).map(option => text(option, 2000));
            if (new Set(options.map(normalized)).size !== options.length)
                return fail("Các lựa chọn bị trùng.");
            const correctIndex = question.type === "mcq" ? number(question.correctIndex, 0, options.length - 1, true) : null;
            const answer = text(question.answer, 8000), explanation = text(question.explanation, 12000);
            if (correctIndex !== null && normalized(answer) !== normalized(options[correctIndex]))
                return fail("Đáp án không khớp lựa chọn đúng.");
            const rubric = list(question.rubric ?? [], question.type === "mcq" ? 0 : 1, 30).map(item => {
                const criterion = record(item);
                return { criterion: text(criterion.criterion, 2000), points: number(criterion.points, .01, 100) };
            });
            if (rubric.length && Math.abs(rubric.reduce((sum, item) => sum + item.points, 0) - expected.points) > .001)
                return fail("Tổng điểm hướng dẫn chấm không khớp điểm câu hỏi.");
            const references = list(question.references, 1, 6).map((item) => {
                const reference = record(item), sourceId = text(reference.sourceId, 120), source = sources.find(source => source.id === sourceId);
                if (!source)
                    return fail("Câu hỏi dẫn tới tài liệu không có trong nguồn.");
                const page = reference.page == null ? null : number(reference.page, 1, source.pageCount ?? 1000, true);
                if (page !== null && !source.text.includes(`[PAGE ${page}]`))
                    return fail("Số trang tham chiếu chưa xác định được từ tài liệu.");
                const excerpt = text(reference.excerpt, 1500);
                const pageText = page === null ? source.text : source.text.split(`[PAGE ${page}]`)[1]?.split(/\[PAGE \d+\]/)[0] ?? "";
                if (!normalized(pageText).includes(normalized(excerpt)))
                    return fail("Trích dẫn không có trong tài liệu nguồn.");
                return { sourceId, page, excerpt };
            });
            return { id, prompt, type: expected.type, points: expected.points, options, correctIndex, answer, explanation, rubric, references };
        });
        return { id: expected.id, title: expected.title, instructions: expected.instructions, questions };
    });
    return { title: text(input.title, 200), description: text(input.description ?? "", 2000, false), sections, warnings: warnings(input.warnings) };
}
