import { validateOnlineExam, type OnlineExam, type OriginalInfo } from "./examOnline";
export const studioSource = (): OriginalInfo => ({ id: "original-1", name: "Source.docx", role: "material", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 100 });
export function studioRawExam() {
  return { schemaVersion: 1, title: "Mixed practice", description: "Complete the problems.", durationMinutes: null as number | null, warnings: [] as string[], questions: [
    { id: "mcq-1", type: "mcq", section: "Multiple choice", prompt: "Which material freezes at zero Celsius under standard pressure?", points: 1, options: ["Water", "Iron", "Air", "Copper"], correctIndex: 0, answer: "Water", explanation: "SOLUTION MCQ ONLY", references: [{ fileId: "original-1", page: 1, excerpt: "An original file quotation; no extracted-text equality required." }] },
    { id: "blank-1", type: "blank", prompt: "Water becomes {{state}} when freezing; warming ice gives {{next}}.", points: 2, blanks: [{ id: "state", label: "State", acceptedAnswers: ["solid", "Solid state"], caseSensitive: false }, { id: "next", label: "Next state", acceptedAnswers: ["liquid"], caseSensitive: false }], answer: "solid; liquid", explanation: "SOLUTION BLANK ONLY" },
    { id: "numeric-1", type: "numeric", prompt: "A particle travels 5 m in 2 s. Find its speed in m/s to two decimal places.", points: 2, numeric: { value: 2.5, absoluteTolerance: .01, relativeTolerance: 0, units: ["m/s", "m s^-1"], unitRequired: true }, answer: "2.5 m/s", explanation: "SOLUTION NUMERIC ONLY" },
    { id: "short-1", type: "short", prompt: "Name the state of matter of ice.", points: 1, acceptedAnswers: ["solid", "solid state"], answer: "solid", explanation: "SOLUTION SHORT ONLY" },
    { id: "essay-1", type: "essay", prompt: "Explain particle motion in liquid and solid water.", points: 4, answer: "MODEL ESSAY ANSWER ONLY", explanation: "SOLUTION ESSAY ONLY", rubric: [{ criterion: "Describe solid particle motion", points: 2 }, { criterion: "Describe liquid particle motion", points: 2 }] },
  ] };
}
export function studioExam(): OnlineExam { return { ...validateOnlineExam(studioRawExam(), [studioSource()]), id: "online-exam-1", revision: "revision-1", createdAt: "2026-10-14T00:00:00Z", sources: [studioSource()] }; }
