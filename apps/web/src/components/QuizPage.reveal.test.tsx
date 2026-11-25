// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import QuizPage from "./QuizPage";
import { LanguageProvider } from "../lib/i18n";
import { LearningToolScope } from "../lib/learningNavigation";
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
  await act(async () => root.unmount()); host.remove(); localStorage.removeItem("mindcanvas:language"); localStorage.removeItem("mindcanvas.output-language.quiz");
});

it("shows a single share action for each quiz and the same dialog while taking it", async () => {
  const cards = [...host.querySelectorAll(".quiz-card-actions")];
  expect(cards).toHaveLength(2);
  for (const card of cards) {
    expect(card.querySelectorAll('button[aria-label^="Share:"]')).toHaveLength(1);
    expect(card.textContent).not.toContain("Legacy invites");
  }
  await act(async () => (cards[0].querySelector(".primary-button") as HTMLButtonElement).click());
  const runner = document.querySelector("[data-learning-viewport]")!;
  await act(async () => runner.querySelector<HTMLButtonElement>('button[aria-label="Share: Two questions"]')!.click());
  expect(runner.querySelector("dialog[open].workspace-share-dialog")).toBeTruthy();
});

it("reveals the selected question immediately and locks its answer", async () => {
  await act(async () => (host.querySelector(".quiz-card-actions .primary-button") as HTMLButtonElement).click());
  await act(async () => (document.querySelectorAll("[data-learning-viewport] .quiz-options button")[0] as HTMLButtonElement).click());
  expect(document.querySelector("[data-learning-viewport] .quiz-feedback")?.textContent).toContain("First explanation");
  expect(document.querySelector("[data-learning-viewport] .quiz-options button.correct")?.textContent).toContain("Correct");
  expect((document.querySelector("[data-learning-viewport] .quiz-options button") as HTMLButtonElement).disabled).toBe(true);
});

it("separates the answer letter from a rendered fraction", async () => {
  const mathQuiz: QuizTest = { ...quiz, id: "math-quiz", questions: [{ ...quiz.questions[0], prompt: "Calculate $\\frac{3}{4}+\\frac{5}{8}$.", options: ["$\\frac{8}{12}$", "$1\\frac{1}{8}$", "$1\\frac{3}{8}$", "$1\\frac{5}{8}$"] }] };
  const mathStore = { ...store, quizzes: [mathQuiz] } as QuizStore;
  await act(async () => root.render(<LanguageProvider><QuizPage owner={null} store={mathStore}/></LanguageProvider>));
  await act(async () => (host.querySelector(".quiz-card-actions .primary-button") as HTMLButtonElement).click());
  const option = document.querySelector("[data-learning-viewport] .quiz-options button") as HTMLButtonElement;
  expect(option.querySelector(":scope > .quiz-option-label")?.textContent).toBe("A");
  expect(option.querySelector(":scope > .quiz-option-content .katex")).not.toBeNull();
  expect(option.querySelector(".quiz-option-label .katex")).toBeNull();
});

it("keeps answers hidden and editable until submission in delayed mode", async () => {
  const reveal = host.querySelectorAll(".quiz-mode-panel select")[2] as HTMLSelectElement;
  await act(async () => { reveal.value = "submit"; reveal.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => (host.querySelector(".quiz-card-actions .primary-button") as HTMLButtonElement).click());
  await act(async () => (document.querySelectorAll("[data-learning-viewport] .quiz-options button")[0] as HTMLButtonElement).click());
  expect(document.querySelector("[data-learning-viewport] .quiz-feedback")).toBeNull();
  expect(document.querySelector("[data-learning-viewport] .quiz-options button.correct")).toBeNull();
  await act(async () => (document.querySelectorAll("[data-learning-viewport] .quiz-options button")[1] as HTMLButtonElement).click());
  await act(async () => (document.querySelector("[data-learning-viewport] .quiz-runner-actions .primary-button") as HTMLButtonElement).click());
  await act(async () => (document.querySelectorAll("[data-learning-viewport] .quiz-options button")[0] as HTMLButtonElement).click());
  expect(document.querySelector("[data-learning-viewport] .quiz-feedback")).toBeNull();
  await act(async () => (document.querySelector("[data-learning-viewport] .quiz-runner-actions .primary-button") as HTMLButtonElement).click());
  expect(saveAttempt).toHaveBeenCalledWith(expect.objectContaining({ answers: [1, 0], score: 2 }));
  expect(document.querySelector("[data-learning-viewport] .quiz-answer-review")?.textContent).toContain("First explanation");
});

it("filters the native Quiz library to saved copies", async () => {
  const savedFilter = host.querySelector('.learning-copy-filter button[aria-pressed="false"]') as HTMLButtonElement;
  await act(async () => savedFilter.click());
  expect([...host.querySelectorAll(".quiz-test-card h3")].map(node => node.textContent)).toEqual(["Saved from a share"]);
  expect(host.querySelector(".learning-copy-provenance")?.textContent).toContain("Study partner");
});

it("lets users clear and retype the manual question count, then validates the limit", async () => {
  await act(async () => (host.querySelector(".quiz-heading button") as HTMLButtonElement).click());
  await act(async () => host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click());
  const input = await typeQuestionCount("");
  expect(input.value).toBe("");
  expect(host.querySelector('small.form-error[id$="-count-error"]')).toBeNull();
  await act(async () => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  expect(host.querySelector('small.form-error[id$="-count-error"]')?.textContent).toContain("Enter the number");
  await typeQuestionCount("20");
  expect(host.querySelector('small.form-error[id$="-count-error"]')).toBeNull();
  expect((host.querySelector('.quiz-studio-prompt textarea[readonly]') as HTMLTextAreaElement).value).toContain("20");
  await typeQuestionCount("51");
  expect(input.value).toBe("51");
  expect(host.querySelector('small.form-error[id$="-count-error"]')?.textContent).toContain("50");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect((host.querySelector('.quiz-studio-prompt textarea[readonly]') as HTMLTextAreaElement).value).toBe("");
  await typeQuestionCount("2.5");
  expect(host.querySelector('small.form-error[id$="-count-error"]')?.textContent).toContain("whole number");
  await typeQuestionCount("2");
  expect(host.querySelector('small.form-error[id$="-count-error"]')?.textContent).toContain("at least 3");
});

it("uses the same free typing and validation in AI Auto", async () => {
  await act(async () => root.render(<LanguageProvider><QuizPage owner="user-1" store={store}/></LanguageProvider>));
  await act(async () => (host.querySelector(".quiz-heading button") as HTMLButtonElement).click());
  const input = await typeQuestionCount("");
  expect(input.value).toBe("");
  await typeQuestionCount("20");
  expect(input.value).toBe("20");
  await typeQuestionCount("51");
  expect(host.querySelector('small.form-error[id$="-count-error"]')?.textContent).toContain("50");
  expect(input.value).toBe("51");
});

it("keeps the quiz draft when dismissed outside and uses the chosen content language in the manual prompt", async () => {
  const open = () => (host.querySelector(".quiz-heading button") as HTMLButtonElement).click();
  await act(async () => open());
  await act(async () => host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click());
  expect(host.querySelector(".dialog-workspace > .dialog-titlebar button")).toBeTruthy();
  expect(host.querySelector(".dialog-workspace > .quiz-studio-footer button")).toBeTruthy();
  const select = host.querySelector(".content-language-field select") as HTMLSelectElement;
  await act(async () => { select.value = "vi"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await typeQuestionCount("17");
  const dialog = host.querySelector("dialog")!;
  vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({ left: 10, right: 100, top: 10, bottom: 100 } as DOMRect);
  const pointer = (target: EventTarget, name: string, x: number, y: number) => target.dispatchEvent(new MouseEvent(name, { bubbles: true, button: 0, clientX: x, clientY: y }));
  await act(async () => { pointer(dialog.querySelector("textarea")!, "pointerdown", 30, 30); pointer(dialog, "pointerup", 1, 1); });
  expect(host.querySelector("dialog")).toBeTruthy();
  await act(async () => { pointer(dialog, "pointerdown", 1, 1); pointer(dialog, "pointerup", 2, 2); });
  expect(host.querySelector("dialog")).toBeNull();
  await act(async () => open());
  expect((host.querySelector(".quiz-studio-prompt textarea[readonly]") as HTMLTextAreaElement).value).toMatch(/quiz in Vietnamese[\s\S]+17 clear questions/);
  expect((host.querySelector(".content-language-field select") as HTMLSelectElement).value).toBe("vi");
  expect(host.querySelector(".quiz-heading button")?.textContent).toContain("Create");
});

it("mounts the quiz outside transformed learning pages, preserves its answer when hidden, and cleans up on return", async () => {
  const render = async (active: boolean) => act(async () => root.render(
    <LanguageProvider><div style={{ transform: "translateY(0)", height: 70 }}>
      <LearningToolScope tab="quiz" active={active}><QuizPage owner={null} store={store}/></LearningToolScope>
    </div></LanguageProvider>,
  ));
  await render(true);
  await act(async () => host.querySelector<HTMLButtonElement>(".quiz-card-actions .primary-button")!.click());
  const player = document.querySelector<HTMLElement>("[data-learning-viewport]")!;
  expect(player.parentElement).toBe(document.body);
  const answer = player.querySelector<HTMLButtonElement>(".quiz-options button:nth-child(2)")!;
  await act(async () => answer.click());
  expect(answer.matches(".selected.correct")).toBe(true);

  await render(false);
  expect(player.hidden).toBe(true);
  expect(player.hasAttribute("inert")).toBe(true);
  await render(true);
  expect(document.querySelector("[data-learning-viewport]")).toBe(player);
  expect(player.hidden).toBe(false);
  expect(answer.matches(".selected.correct")).toBe(true);
  await act(async () => player.querySelector<HTMLButtonElement>(".page-back-button")!.click());
  expect(player.isConnected).toBe(false);
  expect(host.querySelector(".quiz-list")).toBeTruthy();
});
