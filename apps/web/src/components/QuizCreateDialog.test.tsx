// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { QuizStore } from "../hooks/useQuizzes";
import type { AccountPlan } from "../lib/account";
import { LanguageProvider } from "../lib/i18n";
import { QuizQuestionLimitError } from "../lib/quiz";
import QuizCreateDialog from "./QuizCreateDialog";

const storeSave = vi.fn();
const onClose = vi.fn();
let host: HTMLDivElement;
let root: Root;
const question = (index: number) => ({ prompt: `Exercise ${index}: $x^2$`, options: ["One", "Two", "Three", "Four"], correctIndex: 1 });
const sampleJson = (count: number) => JSON.stringify({ title: "Algebra practice", questions: Array.from({ length: count }, (_, index) => question(index + 1)) });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
  HTMLDialogElement.prototype.close ??= function () { this.open = false; };
  localStorage.setItem("mindcanvas:language", "en");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  storeSave.mockReset().mockResolvedValue(undefined); onClose.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); });
async function mount(owner: string | null = "user", limit = 50) {
  await act(async () => root.render(<LanguageProvider><QuizCreateDialog owner={owner} accountPlan={{ maxCards: limit } as AccountPlan} store={{ createStudioQuiz: storeSave } as unknown as QuizStore} onClose={onClose}/></LanguageProvider>));
}
function button(name: string) {
  const target = [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.getAttribute("aria-label") === name || node.textContent?.trim() === name);
  if (!target) throw new Error(`No button: ${name}`);
  return target;
}
async function click(name: string) { await act(async () => button(name).click()); }
async function input(selector: string, value: string) {
  const element = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  await act(async () => {
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const footer = () => host.querySelector(".quiz-studio-save-status")?.textContent;

it("opens an over-limit import, preserves edits and the original JSON on Back, and saves only after trimming", async () => {
  await mount();
  await click("AI Manual");
  await input('input[inputmode="numeric"]', "3");
  await input(".quiz-json-input", sampleJson(4));
  await click("Validate result");
  expect(footer()).toContain("4 / 3 questions");
  expect(footer()).toContain("Delete at least 1");
  expect(button("Create quiz").disabled).toBe(true);
  expect(button("Add question").disabled).toBe(true);
  expect(storeSave).not.toHaveBeenCalled();
  await click("Delete question 2");
  await click("Back to JSON");
  expect(host.querySelector<HTMLTextAreaElement>(".quiz-json-input")?.value).toBe(sampleJson(4));
  await click("Validate result");
  expect(footer()).toContain("3 / 3 questions");
  await click("Create quiz");
  expect(storeSave).toHaveBeenCalledWith(expect.objectContaining({ questions: [
    expect.objectContaining({ prompt: question(1).prompt }),
    expect.objectContaining({ prompt: question(3).prompt }),
    expect.objectContaining({ prompt: question(4).prompt }),
  ] }), "ai_manual", expect.any(String));
  expect(onClose).toHaveBeenCalledOnce();
});

it("checks a ready JSON file against the plan, ignores a smaller prompt limit, and applies a changed cloud limit without losing questions", async () => {
  await mount("user", 6);
  await click("AI Manual");
  await input('input[inputmode="numeric"]', "3");
  await act(async () => host.querySelector<HTMLInputElement>(".quiz-json-check input")!.click());
  expect(host.querySelector("fieldset.quiz-studio-settings")?.hasAttribute("disabled")).toBe(true);
  const fileInput = host.querySelector<HTMLInputElement>('input[type="file"][accept^=".json"]')!;
  const file = new File([sampleJson(5)], "algebra.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => sampleJson(5) });
  Object.defineProperty(fileInput, "files", { value: [file] });
  await act(async () => fileInput.dispatchEvent(new Event("change", { bubbles: true })));
  expect(host.textContent).toContain("algebra.json");
  await click("Validate result");
  expect(footer()).toContain("5 / 6 questions");
  storeSave.mockRejectedValueOnce(new QuizQuestionLimitError(5, 4));
  await click("Create quiz");
  expect(footer()).toContain("5 / 4 questions");
  await click("Delete question 1");
  await click("Create quiz");
  expect(storeSave.mock.calls[0][2]).toBe(storeSave.mock.calls[1][2]);
  expect(storeSave.mock.calls[1][0].questions).toHaveLength(4);
});

it("supports handwritten math and Unicode, adds a blank question, and saves without AI mode", async () => {
  await mount(null);
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe("Manual");
  expect(host.querySelector(".quiz-studio-prompt")).toBeNull();
  await input(".quiz-studio-editor input", "My first quiz");
  await click("Add question");
  expect(footer()).toContain("2 / 50 questions");
  await click("Delete question 1");
  await input(".quiz-editor-question-fields > label textarea", "What is x² if $x=\\frac{2}{3}$ and x ≤ 1?");
  for (const [letter, value] of Object.entries({ A: "$\\frac{4}{9}$", B: "4", C: "9", D: "0" })) {
    await input(`[aria-label="Option ${letter}"]`, value);
  }
  expect(host.querySelector(".quiz-formula-preview .katex")).toBeTruthy();
  expect(button("Create quiz").disabled).toBe(true);
  const select = host.querySelector<HTMLSelectElement>(".quiz-editor-question-fields select")!;
  await act(async () => { select.value = "0"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await click("Create quiz");
  expect(storeSave).toHaveBeenCalledWith(expect.objectContaining({
    questions: [expect.objectContaining({ correctIndex: 0, prompt: expect.stringContaining("x ≤ 1") })],
  }), "manual", expect.any(String));
});

it("keeps malformed JSON in the input step and does not try to save", async () => {
  await mount();
  await click("AI Manual");
  await input(".quiz-json-input", "not json");
  await click("Validate result");
  expect(host.querySelector(".quiz-studio-json [role=alert]")?.textContent).toContain("not a valid");
  expect(storeSave).not.toHaveBeenCalled();
});
