// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import QuizPage from "./QuizPage";
import { LanguageProvider } from "../lib/i18n";
import type { QuizStore } from "../hooks/useQuizzes";
import type { QuizTest } from "../lib/quiz";

const quiz: QuizTest = {
  id: "test-quiz", title: "Two questions", description: "", sourceDocumentId: null,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", source: "local",
  questions: [
    { id: "first", prompt: "First?", options: ["Wrong", "Correct", "C", "D"], correctIndex: 1, explanation: "First explanation", sourcePage: null },
    { id: "second", prompt: "Second?", options: ["Correct", "Wrong", "C", "D"], correctIndex: 0, explanation: "Second explanation", sourcePage: null },
  ],
};
const savedQuiz: QuizTest = {
  ...quiz,
  id: "saved-quiz",
  title: "Saved from a share",
  savedFrom: { title: "Shared source", ownerName: "Study partner" },
};

let root: Root;
let host: HTMLDivElement;
let saveAttempt: ReturnType<typeof vi.fn>;
let store: QuizStore;

async function typeQuestionCount(value: string) {
  const input = host.querySelector('.dialog input[inputmode="numeric"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("mindcanvas:language", "en");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  saveAttempt = vi.fn(async (attempt: unknown) => ({ item: attempt, source: "local" }));
  HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
  HTMLDialogElement.prototype.close ??= function () { this.open = false; };
  store = { quizzes: [quiz, savedQuiz], attempts: [], loading: false, busy: false, error: "", setError: vi.fn(), saveAttempt } as unknown as QuizStore;
  await act(async () => root.render(<LanguageProvider><QuizPage owner={null} store={store}/></LanguageProvider>));
});

afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); localStorage.removeItem("mindcanvas:language");
});

it("reveals the selected question immediately and locks its answer", async () => {
  await act(async () => (host.querySelector(".quiz-card-actions .primary-button") as HTMLButtonElement).click());
  await act(async () => (host.querySelectorAll(".quiz-options button")[0] as HTMLButtonElement).click());
  expect(host.querySelector(".quiz-feedback")?.textContent).toContain("First explanation");
  expect(host.querySelector(".quiz-options button.correct")?.textContent).toContain("Correct");
  expect((host.querySelector(".quiz-options button") as HTMLButtonElement).disabled).toBe(true);
});

it("separates the answer letter from a rendered fraction", async () => {
  const mathQuiz: QuizTest = { ...quiz, id: "math-quiz", questions: [{ ...quiz.questions[0], prompt: "Calculate $\\frac{3}{4}+\\frac{5}{8}$.", options: ["$\\frac{8}{12}$", "$1\\frac{1}{8}$", "$1\\frac{3}{8}$", "$1\\frac{5}{8}$"] }] };
  const mathStore = { ...store, quizzes: [mathQuiz] } as QuizStore;
  await act(async () => root.render(<LanguageProvider><QuizPage owner={null} store={mathStore}/></LanguageProvider>));
  await act(async () => (host.querySelector(".quiz-card-actions .primary-button") as HTMLButtonElement).click());
  const option = host.querySelector(".quiz-options button") as HTMLButtonElement;
  expect(option.querySelector(":scope > .quiz-option-label")?.textContent).toBe("A");
  expect(option.querySelector(":scope > .quiz-option-content .katex")).not.toBeNull();
  expect(option.querySelector(".quiz-option-label .katex")).toBeNull();
});

it("keeps answers hidden and editable until submission in delayed mode", async () => {
  const reveal = host.querySelectorAll(".quiz-mode-panel select")[2] as HTMLSelectElement;
  await act(async () => { reveal.value = "submit"; reveal.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => (host.querySelector(".quiz-card-actions .primary-button") as HTMLButtonElement).click());
  await act(async () => (host.querySelectorAll(".quiz-options button")[0] as HTMLButtonElement).click());
  expect(host.querySelector(".quiz-feedback")).toBeNull();
  expect(host.querySelector(".quiz-options button.correct")).toBeNull();
  await act(async () => (host.querySelectorAll(".quiz-options button")[1] as HTMLButtonElement).click());
  await act(async () => (host.querySelector(".quiz-runner-actions .primary-button") as HTMLButtonElement).click());
  await act(async () => (host.querySelectorAll(".quiz-options button")[0] as HTMLButtonElement).click());
  expect(host.querySelector(".quiz-feedback")).toBeNull();
  await act(async () => (host.querySelector(".quiz-runner-actions .primary-button") as HTMLButtonElement).click());
  expect(saveAttempt).toHaveBeenCalledWith(expect.objectContaining({ answers: [1, 0], score: 2 }));
  expect(host.querySelector(".quiz-answer-review")?.textContent).toContain("First explanation");
});

it("filters the native Quiz library to saved copies", async () => {
  const savedFilter = host.querySelector('.learning-copy-filter button[aria-pressed="false"]') as HTMLButtonElement;
  await act(async () => savedFilter.click());
  expect([...host.querySelectorAll(".quiz-test-card h3")].map(node => node.textContent)).toEqual(["Saved from a share"]);
  expect(host.querySelector(".learning-copy-provenance")?.textContent).toContain("Study partner");
});

it("lets users clear and retype the manual question count, then validates the limit", async () => {
  await act(async () => (host.querySelector(".quiz-heading button") as HTMLButtonElement).click());
  const input = await typeQuestionCount("");
  expect(input.value).toBe("");
  expect(host.querySelector("#quiz-question-count-error")).toBeNull();
  await act(async () => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  expect(host.querySelector("#quiz-question-count-error")?.textContent).toContain("Enter the number");
  await typeQuestionCount("20");
  expect(host.querySelector("#quiz-question-count-error")).toBeNull();
  expect((host.querySelector('.quiz-manual-form textarea[readonly]') as HTMLTextAreaElement).value).toContain("20");
  await typeQuestionCount("51");
  expect(input.value).toBe("51");
  expect(host.querySelector("#quiz-question-count-error")?.textContent).toContain("50");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect((host.querySelector('.quiz-manual-form textarea[readonly]') as HTMLTextAreaElement).value).toBe("");
  await typeQuestionCount("2.5");
  expect(host.querySelector("#quiz-question-count-error")?.textContent).toContain("whole number");
  await typeQuestionCount("2");
  expect(host.querySelector("#quiz-question-count-error")?.textContent).toContain("at least 3");
});

it("uses the same free typing and validation in AI Auto", async () => {
  await act(async () => root.render(<LanguageProvider><QuizPage owner="user-1" store={store}/></LanguageProvider>));
  await act(async () => (host.querySelector(".quiz-heading button") as HTMLButtonElement).click());
  const input = await typeQuestionCount("");
  expect(input.value).toBe("");
  await typeQuestionCount("20");
  expect(input.value).toBe("20");
  await typeQuestionCount("51");
  expect(host.querySelector("#quiz-question-count-error")?.textContent).toContain("50");
  expect(input.value).toBe("51");
});

it("shows the actual question count when a manual result exceeds the selected maximum", async () => {
  await act(async () => root.render(<LanguageProvider><QuizPage owner="user-1" store={store}/></LanguageProvider>));
  await act(async () => (host.querySelector(".quiz-heading button") as HTMLButtonElement).click());
  await act(async () => (host.querySelectorAll('.ai-mode-switch [role="tab"]')[1] as HTMLButtonElement).click());
  const textarea = host.querySelector('.quiz-manual-form textarea:not([readonly])') as HTMLTextAreaElement;
  const result = { title: "Unit 1", description: "Number", questions: Array.from({ length: 20 }, (_, index) => ({
    prompt: `Question ${index + 1}?`, options: ["A", "B", "C", "D"], correctIndex: 0, explanation: "Because A.", sourcePage: 2,
  })) };
  const json = host.querySelectorAll('.quiz-manual-form textarea:not([readonly])')[1] as HTMLTextAreaElement;
  expect(textarea).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(json, JSON.stringify(result));
    json.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => (host.querySelector('.quiz-manual-form .actions .primary-button') as HTMLButtonElement).click());
  expect(host.querySelector('.quiz-manual-form .form-error')?.textContent).toContain("20 questions");
  expect(host.querySelector('.quiz-manual-form .form-error')?.textContent).toContain("10");
});
