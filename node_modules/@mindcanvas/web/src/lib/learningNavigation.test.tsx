// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LearningNavigationProvider, LearningToolScope, useLearningNavigation, useLearningTool, learningTabFromUrl, learningUrl, enterLearningSpace, type HubTab } from "./learningNavigation";
import Dialog from "../components/Dialog";
import { ReviewPanel } from "../components/FlashcardsPage";
import type { Flashcard } from "./flashcards";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; window.history.replaceState({}, "", "/");
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); window.history.replaceState({}, "", "/"); vi.restoreAllMocks(); });
function Tool({ name }: { name: HubTab }) {
  const tool = useLearningTool()!, [detail, setDetail] = useState(false), [text, setText] = useState("");
  return <><h2>{name}</h2><input aria-label={`${name} input`} value={text} onChange={e => setText(e.target.value)}/><button onClick={() => tool.open("session", () => setDetail(true), () => setDetail(false))}>Open {name}</button>{detail && <article data-detail={name}>Session {text}<button onClick={tool.back}>Close {name}</button></article>}</>;
}
function Shell() {
  const nav = useLearningNavigation();
  return <><output>{nav.route.tab}:{nav.route.detail ?? "list"}</output><button onClick={nav.home}>Home</button><button onClick={() => nav.go("quiz")}>Quiz</button><button onClick={() => nav.go("lab")}>Lab</button>{["quiz", "lab"].map(id => nav.visited.has(id as HubTab) && <LearningToolScope key={id} tab={id as HubTab} active={nav.route.tab === id}><Tool name={id as HubTab}/></LearningToolScope>)}</>;
}
async function mount(owner = "a", initialTab?: HubTab) { await act(async () => root.render(<LearningNavigationProvider key={owner} owner={owner} initialTab={initialTab}><Shell/></LearningNavigationProvider>)); }
async function click(text: string) { const button = [...host.querySelectorAll("button")].find(b => b.textContent === text)!; expect(button, text).toBeTruthy(); await act(async () => button.click()); }
async function type(label: string, text: string) { const input = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function traverse(direction: "back" | "forward", expected: string) { await act(async () => { window.history[direction](); await new Promise(resolve => setTimeout(resolve, 30)); }); await vi.waitFor(() => expect(host.querySelector("output")?.textContent).toBe(expected)); }
it("validates URL destinations and preserves unrelated query parameters and hashes", () => {
  window.history.replaceState({}, "", "/?invite=keep&learn=unknown#anchor"); expect(learningTabFromUrl()).toBeNull(); expect(learningUrl("quiz")).toBe("/?invite=keep&learn=quiz#anchor"); expect(learningUrl(null)).toBe("/?invite=keep#anchor");
});
it("honors a direct tool entry without assuming a saved inner session", async () => {
  window.history.replaceState({ mindcanvasLearning: { owner: "other", tab: "quiz", detail: "session" } }, "", "/?learn=quiz");
  await mount(); expect(host.querySelector("output")?.textContent).toBe("quiz:list"); expect(host.querySelector("article")).toBeNull();
});
it("uses an explicit notification destination instead of an old URL tab", async () => { window.history.replaceState({}, "", "/?learn=quiz"); await mount("a", "lab"); expect(host.querySelector("output")?.textContent).toBe("lab:list"); });
it("keeps tool inputs and sessions while visiting other tools and home", async () => {
  await mount(); await click("Quiz"); await type("quiz input", "Unsubmitted answer"); await click("Open quiz"); await click("Home");
  expect(host.querySelector('[data-learning-tool="quiz"]')?.hasAttribute("hidden")).toBe(true); expect(host.querySelector('[data-learning-tool="quiz"]')?.hasAttribute("inert")).toBe(true);
  await click("Lab"); await type("lab input", "Lab draft"); await click("Quiz"); expect(host.querySelector("output")?.textContent).toBe("quiz:session"); expect(host.querySelector('[data-detail="quiz"]')?.textContent).toContain("Unsubmitted answer");
  await click("Lab"); expect(host.querySelector<HTMLInputElement>('[aria-label="lab input"]')?.value).toBe("Lab draft");
});
it("restores session, list and home in order through browser Back and Forward", async () => {
  await mount(); await click("Quiz"); await type("quiz input", "42"); await click("Open quiz");
  await traverse("back", "quiz:list"); await traverse("back", "overview:list"); await traverse("forward", "quiz:list"); await traverse("forward", "quiz:session");
  expect(host.querySelector('[data-detail="quiz"]')?.textContent).toContain("42");
});
it("uses the same history entry for repeated session opens and closes to its list", async () => {
  await mount(); await click("Quiz"); await click("Open quiz"); const count = window.history.length; await click("Open quiz"); expect(window.history.length).toBe(count);
  await click("Close quiz"); await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); expect(host.querySelector("output")?.textContent).toBe("quiz:list");
});
it("clears account-specific cached input and detail callbacks on identity changes", async () => {
  await mount(); await click("Quiz"); await type("quiz input", "PRIVATE-A"); await click("Open quiz"); await mount("b");
  expect(host.textContent).not.toContain("PRIVATE-A"); expect(host.querySelector("article")).toBeNull(); expect(host.querySelector<HTMLInputElement>('[aria-label="quiz input"]')?.value).toBe("");
});
it("resets to the requested root when entering from the app sidebar", async () => { await mount(); await click("Quiz"); await click("Open quiz"); await act(async () => enterLearningSpace()); expect(host.querySelector("output")?.textContent).toBe("overview:list"); });
it("falls back to a tool list for stale unknown history details", async () => {
  await mount(); await click("Quiz"); window.history.replaceState({ mindcanvasLearning: { owner: "a", tab: "quiz", detail: "removed" } }, "", "/?learn=quiz");
  await act(async () => window.dispatchEvent(new PopStateEvent("popstate"))); expect(host.querySelector("output")?.textContent).toBe("quiz:list");
});
it("does not navigate away when work finishes in an inactive cached tool", async () => {
  function Background() { const nav = useLearningNavigation(); return <><output>{nav.route.tab}</output><button onClick={() => nav.openDetail("exams", "result", () => {}, () => {})}>Finish</button><button onClick={() => nav.go("exams")}>Resume</button></>; }
  await act(async () => root.render(<LearningNavigationProvider owner="a"><Background/></LearningNavigationProvider>)); await click("Finish"); expect(host.querySelector("output")?.textContent).toBe("overview"); await click("Resume"); expect(host.querySelector("output")?.textContent).toBe("exams");
});
it("suspends dialogs and review shortcuts in hidden cached tools", async () => {
  const rate = vi.fn(), toggle = vi.fn(), card = { id: "card-1", front: "Q", back: "A", sourcePage: null } as Flashcard;
  const render = async (active: boolean) => act(async () => root.render(<LearningToolScope tab="flashcards" active={active}><Dialog title="Draft" onClose={() => {}}>Draft content</Dialog><ReviewPanel target={card} finished={false} index={0} total={1} forgottenCount={0} dailyCurrent={0} dailyGoal={1} planMode={false} ratingBusy={false} showAnswer={true} onToggleAnswer={toggle} onRate={rate} onBack={() => {}} t={key => key}/></LearningToolScope>));
  await render(true); expect(host.querySelector("dialog")?.hasAttribute("open")).toBe(true); await render(false); expect(host.querySelector("dialog")?.hasAttribute("open")).toBe(false);
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))); expect(rate).not.toHaveBeenCalled(); await render(true); expect(host.querySelector("dialog")?.hasAttribute("open")).toBe(true);
});
