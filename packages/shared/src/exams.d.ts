export type ExamFormat = "quiz" | "paper";
export type ExamDifficulty = "easy" | "medium" | "hard";
export type ExamQuestionType = "mcq" | "short" | "essay" | "truefalse" | "other";
export type ExamSettings = {
    format: ExamFormat;
    mode: "template" | "materials";
    difficulty: ExamDifficulty;
    subject: string;
    level: string;
    language: "vi" | "en";
};
export type ExamSource = {
    id: string;
    name: string;
    text: string;
    role: "template" | "material";
    pageCount?: number;
    warnings: string[];
};
export type ExamSectionPlan = {
    id: string;
    title: string;
    instructions: string;
    type: ExamQuestionType;
    count: number;
    points: number;
    optionsCount?: number;
};
export type ExamBlueprint = {
    title: string;
    durationMinutes: number;
    sections: ExamSectionPlan[];
    warnings: string[];
};
export type ExamReference = {
    sourceId: string;
    page: number | null;
    excerpt: string;
};
export type ExamQuestion = {
    id: string;
    type: ExamQuestionType;
    prompt: string;
    points: number;
    options: string[];
    correctIndex: number | null;
    answer: string;
    explanation: string;
    rubric: Array<{
        criterion: string;
        points: number;
    }>;
    references: ExamReference[];
};
export type ExamDraft = {
    title: string;
    description: string;
    sections: Array<{
        id: string;
        title: string;
        instructions: string;
        questions: ExamQuestion[];
    }>;
    warnings: string[];
};
export type SavedExam = {
    id: string;
    owner: string;
    updatedAt: string;
    settings: ExamSettings;
    sources: ExamSource[];
    blueprint: ExamBlueprint;
    draft: ExamDraft;
    quizId?: string;
};
export declare const MAX_EXAM_SOURCES = 6;
export declare const MAX_EXAM_TEXT = 120000;
export declare const MAX_EXAM_QUESTIONS = 100;
export declare const EXAM_TYPES: ExamQuestionType[];
export declare class ExamValidationError extends Error {
    constructor(message: string);
}
export declare const examQuestionCount: (plan: ExamBlueprint) => number;
export declare const examTotalPoints: (plan: ExamBlueprint) => number;
export declare function validateExamSettings(value: unknown): ExamSettings;
export declare function validateExamSources(value: unknown, mode: ExamSettings["mode"]): ExamSource[];
export declare function validateExamBlueprint(value: unknown, format: ExamFormat): ExamBlueprint;
export declare function validateExamDraft(value: unknown, blueprint: ExamBlueprint, sources: ExamSource[], format: ExamFormat): ExamDraft;
