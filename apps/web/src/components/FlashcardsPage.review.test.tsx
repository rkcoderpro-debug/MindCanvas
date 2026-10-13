// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FlashcardsPage, { ReviewPanel } from "./FlashcardsPage";
import { LanguageProvider } from "../lib/i18n";
import type { FlashcardStore } from "../hooks/useFlashcards";
import type { Flashcard } from "../lib/flashcards";

const target = { id: "card-1", front: "Front only", back: "Back only" } as Flashcard;
vi.mock("../hooks/useFlashcards", () => ({ useFlashcards: () => ({}) }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); });
function TestReview({ onRate = vi.fn(), busy = false, card = target }: { onRate?: (rating: "again" | "good") => void; busy?: boolean; card?: Flashcard }) {
  const [answer, setAnswer] = useState(false);
  return <ReviewPanel target={card} finished={false} index={0} total={2} forgottenCount={0} dailyCurrent={0} dailyGoal={2} planMode={false} ratingBusy={busy} showAnswer={answer} onToggleAnswer={() => setAnswer(value => !value)} onRate={onRate} onBack={() => {}} t={key => key}/>;
}
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
  await act(async () => { pointer(scene, "pointerdown", 0); pointer(scene, "pointerup", 100); pointer(scene, "pointerup", 100); scene.click(); });
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
  const start = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Start review");
  expect(start).toBeTruthy(); await act(async () => start!.click());
  await act(async () => (host.querySelector(".review-card-scene") as HTMLElement).click());
  const good = host.querySelector(`.rating-${rating}`) as HTMLButtonElement;
  await act(async () => { good.click(); good.click(); });
  expect(reviewCard).toHaveBeenCalledTimes(1);
  await act(async () => finishReview());
  expect(recordStudy).toHaveBeenCalledTimes(1);
  expect(recordStudy.mock.calls[0][0]).toMatchObject({ cardId: "card-1", rating, goalUnit: 1 });
  expect(host.querySelector(".review-card-scene")?.textContent).toContain("Second front");
  expect(host.querySelector(".review-card-scene")?.textContent).not.toContain("Second back");
});
