// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FlashcardsPage, { ReviewPanel } from "./FlashcardsPage";
import { LanguageProvider } from "../lib/i18n";
import type { FlashcardStore } from "../hooks/useFlashcards";
import { FREE_ACCOUNT_PLAN } from "../lib/account";
import type { Flashcard } from "../lib/flashcards";
import { createDeck, createFlashcard } from "../lib/flashcards";
import { upsertFlashcards } from "../lib/projectStore";
import { LearningNavigationProvider, LearningToolScope } from "../lib/learningNavigation";

const consume = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("../lib/api", async importOriginal => ({ ...await importOriginal<typeof import("../lib/api")>(), consumeAiManualUsage: consume }));

const target = { id: "card-1", front: "Front only", back: "Back only" } as Flashcard;
vi.mock("../hooks/useFlashcards", () => ({ useFlashcards: () => ({}) }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  consume.mockClear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); });
function TestReview({ onRate = vi.fn(), busy = false, card = target }: { onRate?: (rating: "again" | "good") => void; busy?: boolean; card?: Flashcard }) {
  const [answer, setAnswer] = useState(false);
  return <ReviewPanel target={card} finished={false} index={0} total={2} forgottenCount={0} dailyCurrent={0} dailyGoal={2} planMode={false} ratingBusy={busy} showAnswer={answer} onToggleAnswer={() => setAnswer(value => !value)} onRate={onRate} onBack={() => {}} t={key => key}/>;
}

it("lists totals for unopened decks from cached cards and combines saved and accent-insensitive search", async () => {
  localStorage.setItem("mindcanvas:language", "en");
  const algebra = { ...createDeck("Đại số"), source: "local" as const };
  const geometry = { ...createDeck("Hình học"), source: "local" as const, savedFrom: { ownerName: "An", title: "Hình học" } };
  await upsertFlashcards(null, [
    { ...createFlashcard(algebra.id, "First", "Answer"), dueAt: "2020-01-01T00:00:00Z" },
    { ...createFlashcard(algebra.id, "Second", "Answer"), dueAt: "2099-01-01T00:00:00Z" },
  ]);
  const store = { cards: [], due: [], decks: [algebra, geometry], selectedDeck: null, storageMode: "local", streak: { current: 0, best: 0, todayProgress: 0, todayTarget: 2 }, studyDays: [] } as unknown as FlashcardStore;
  await act(async () => root.render(<LanguageProvider><LearningNavigationProvider owner={null} initialTab="flashcards"><LearningToolScope tab="flashcards" active><FlashcardsPage owner={null} projects={[]} store={store}/></LearningToolScope></LearningNavigationProvider></LanguageProvider>));
  const matches = () => [...host.querySelectorAll(".deck-list .deck-item")].map(item => item.textContent);
  expect(matches()[0]).toContain("2 cards");
  expect(matches()[0]).toContain("1 due");
  expect(matches()[1]).toContain("0 cards");
  const query = host.querySelector<HTMLInputElement>('[aria-label="Search decks"]')!;
  const searchFor = async (value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(query, value);
    query.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await searchFor("dai so");
  expect(matches()).toHaveLength(1);
  expect(matches()[0]).toContain("Đại số");
  const saved = [...host.querySelectorAll<HTMLButtonElement>(".deck-library-tools button")].find(button => button.textContent?.startsWith("Saved"))!;
  await act(async () => saved.click());
  expect(matches()).toHaveLength(0);
  await searchFor("");
  expect(matches()).toHaveLength(1);
  expect(matches()[0]).toContain("Hình học");
});
it("mounts only the selected face through repeated flips and orientation changes", async () => {
  await act(async () => root.render(<TestReview/>));
  const scene = host.querySelector(".review-card-scene") as HTMLElement;
  for (let index = 0; index < 20; index++) {
    expect(host.querySelectorAll(".review-card-face")).toHaveLength(1);
    expect(scene.textContent).toContain(index % 2 ? target.back : target.front);
    expect(scene.textContent).not.toContain(index % 2 ? target.front : target.back);
    await act(async () => { scene.click(); window.dispatchEvent(new Event("orientationchange")); });
  }
});
function pointer(scene: Element, type: string, x: number, y = 0) {
  scene.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
}
it("rates one horizontal swipe once and ignores vertical scrolling", async () => {
  const rate = vi.fn(); await act(async () => root.render(<TestReview onRate={rate}/>));
  const scene = host.querySelector(".review-card-scene") as HTMLElement;
  await act(async () => scene.click());
  await act(async () => { pointer(scene.querySelector("p")!, "pointerdown", 0); pointer(scene, "pointermove", 100); pointer(scene, "pointerup", 100); pointer(scene, "pointerup", 100); scene.click(); });
  expect(rate).toHaveBeenCalledExactlyOnceWith("good");
  expect(scene.textContent).toContain(target.back);
  rate.mockClear();
  await act(async () => { pointer(scene, "pointerdown", 0); pointer(scene, "pointerup", -100); scene.click(); });
  expect(rate).toHaveBeenCalledExactlyOnceWith("again");
  rate.mockClear();
  await act(async () => { pointer(scene, "pointerdown", 0); pointer(scene, "pointerup", 10, 120); scene.click(); });
  expect(rate).not.toHaveBeenCalled(); expect(scene.textContent).toContain(target.back);
});
it("blocks flips and keyboard grading while a rating is saving", async () => {
  const rate = vi.fn(); await act(async () => root.render(<TestReview onRate={rate}/>));
  const scene = host.querySelector(".review-card-scene") as HTMLElement;
  await act(async () => scene.click());
  await act(async () => root.render(<TestReview onRate={rate} busy/>));
  await act(async () => { scene.click(); window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })); });
  expect(scene.textContent).toContain(target.back); expect(rate).not.toHaveBeenCalled();
});
it("does not intercept a focused button's native keyboard activation", async () => {
  await act(async () => root.render(<TestReview/>));
  const button = host.querySelector("button.show-answer") as HTMLButtonElement;
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await act(async () => button.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
  expect(host.querySelector(".review-card-scene")?.textContent).toContain(target.front);
  await act(async () => button.click());
  expect(host.querySelector(".review-card-scene")?.textContent).toContain(target.back);
});
it.each(["again", "good"] as const)("records one %s study event under rapid taps and starts the next card on its front", async rating => {
  localStorage.setItem("mindcanvas:language", "en");
  const first = { ...target, dueAt: "2020-01-01", createdAt: "2020-01-01", repetitions: 0, lapses: 0, sourcePage: null } as Flashcard;
  const second = { ...first, id: "card-2", createdAt: "2020-01-02", front: "Second front", back: "Second back" };
  const deck = { id: "deck", name: "Test deck", source: "local", projectId: null };
  let finishReview!: () => void;
  const reviewCard = vi.fn(() => new Promise<void>(resolve => { finishReview = resolve; }));
  const recordStudy = vi.fn().mockResolvedValue(undefined);
  const store = { cards: [first, second], due: [first, second], decks: [deck], selectedDeck: deck, selectedDeckId: "deck", storageMode: "local", streak: { current: 0, best: 0, todayProgress: 0, todayTarget: 2 }, studyDays: [], reviewCard, recordStudy } as unknown as FlashcardStore;
  await act(async () => root.render(<LanguageProvider><FlashcardsPage owner={null} projects={[]} store={store}/></LanguageProvider>));
  const start = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Start studying")!;
  await act(async () => start.click());
  expect(start.getAttribute("aria-expanded")).toBe("true");
  expect(host.querySelector(".study-mode-toolbar")?.textContent).toContain("Choose a study mode to begin.");
  const ordered = [...host.querySelectorAll<HTMLButtonElement>(".study-mode-options button")].find(button => button.textContent === "Ordered")!;
  await act(async () => ordered.click());
  await act(async () => (document.querySelector("[data-learning-viewport] .review-card-scene") as HTMLElement).click());
  const good = document.querySelector(`[data-learning-viewport] .rating-${rating}`) as HTMLButtonElement;
  await act(async () => { good.click(); good.click(); });
  expect(reviewCard).toHaveBeenCalledTimes(1);
  await act(async () => finishReview());
  expect(recordStudy).toHaveBeenCalledTimes(1);
  expect(recordStudy.mock.calls[0][0]).toMatchObject({ cardId: "card-1", rating, goalUnit: 1 });
  expect(document.querySelector("[data-learning-viewport] .review-card-scene")?.textContent).toContain("Second front");
  expect(document.querySelector("[data-learning-viewport] .review-card-scene")?.textContent).not.toContain("Second back");
});

async function edit(host: Element, selector: string, value: string) {
  const node = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  expect(node, selector).toBeTruthy();
  const prototype = node instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(host: Element, label: string) {
  const button = [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
  expect(button, label).toBeTruthy();
  await act(async () => button.click());
}

it("keeps the original JSON, previews over-limit cards, and applies the plan limit when using existing JSON", async () => {
  localStorage.setItem("mindcanvas:language", "en");
  const deck = { id: "deck", name: "Test deck", source: "local", projectId: null };
  const createCards = vi.fn().mockResolvedValue([]);
  const store = { cards: [], due: [], decks: [deck], selectedDeck: deck, selectedDeckId: "deck",
    storageMode: "local", streak: { current: 0, best: 0, todayProgress: 0, todayTarget: 2 }, studyDays: [], createCards } as unknown as FlashcardStore;
  await act(async () => root.render(<LanguageProvider><FlashcardsPage owner="owner" projects={[]} store={store} accountPlan={{ ...FREE_ACCOUNT_PLAN, maxCards: 4 }}/></LanguageProvider>));
  await act(async () => (host.querySelector<HTMLButtonElement>(".flashcards-ai-trigger")!).click());
  const studio = host.querySelector("dialog[open]")!;
  await click(studio, "AI Manual");
  await edit(studio, ".quiz-studio-settings input[type=number]", "3");
  const raw = JSON.stringify({ title: "Deck draft", cards: [1,2,3,4,5].map(i => ({ front: `Question ${i}`, back: `Answer ${i}` })) });
  await edit(studio, ".quiz-json-input", raw);
  await click(studio, "Validate result");
  const save = () => Array.from(studio.querySelectorAll("button")).find(button => button.textContent === "Add to deck")!;
  expect(studio.textContent).toContain("5 / 3 cards"); expect(save().disabled).toBe(true);
  expect(consume).not.toHaveBeenCalled();
  await click(studio, "Back to JSON");
  expect(studio.querySelector<HTMLTextAreaElement>(".quiz-json-input")?.value).toBe(raw);
  await act(async () => studio.querySelector<HTMLInputElement>(".quiz-json-check input")!.click());
  expect(studio.querySelector<HTMLFieldSetElement>(".quiz-studio-settings")?.disabled).toBe(true);
  await click(studio, "Validate result");
  expect(studio.textContent).toContain("5 / 4 cards");
  const remove = studio.querySelector<HTMLButtonElement>('.flashcard-draft-list .ai-preview-card:last-child button')!;
  await act(async () => remove.click());
  expect(save().disabled).toBe(false);
  expect(consume).not.toHaveBeenCalled();
  await click(studio, "Add to deck");
  expect(consume).toHaveBeenCalledTimes(1);
  expect(createCards).toHaveBeenCalledOnce();
  expect(createCards.mock.calls[0][0]).toHaveLength(4);
});
