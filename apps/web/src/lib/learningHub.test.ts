// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
// @ts-expect-error jsdom is installed for tests; its optional declaration package is not installed.
import { JSDOM } from "jsdom";
import { webcrypto } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { applyHubEvent, cleanHubProgress, emptyHubProgress, hubCoverage, pickHubRound, renderLearningHub, validateLearningHub, type LearningHub } from "../../../../packages/shared/src/learningHub.js";
import { learningHubRevision, normalizeLearningHubHtml, readLearningHub } from "./learningHub";
import { loadHubProgress, saveHubProgressEvent } from "./learningHubProgress";
import { emptyNoteSettings, noteInstructions, validateNoteSettings } from "../../../../packages/shared/src/takenotes.js";
import { noteManualPrompt } from "./takenote";
import HtmlDocumentViewer from "../components/HtmlDocumentViewer";

export function fixtureHub(): LearningHub {
  return validateLearningHub({ version: 1, title: "Năng lượng", summary: "Học năng lượng qua hai chương.", language: "vi", questionsPerRound: 3, difficulty: "mixed", warnings: [], chapters: [0, 1].map(n => ({ id: `ch${n}`, title: `Chương ${n + 1}`, summary: "Kiến thức, ví dụ và ôn tập", objectives: [0, 1, 2].map(i => ({ id: `o${n}${i}`, title: `Kiến thức ${n}${i}`, sourceRefs: [{ sourceId: "source-1", location: `Mục ${n}.${i}` }], explanation: "Giải thích dễ hiểu", terms: "Thuật ngữ và điều kiện", example: "Ví dụ từng bước", misconception: "Phân biệt khái niệm", recall: "Nhớ ý chính", visual: { kind: "steps", title: "Diễn tiến", items: [{ label: "Quan sát", detail: "Dữ kiện nguồn" }, { label: "Giải thích", detail: "Kết luận nguồn" }] } })), questions: [0, 1, 2].flatMap(i => [0, 1].map(k => ({ id: `q${n}${i}${k}`, objectiveId: `o${n}${i}`, prompt: `Câu hỏi ${n}${i}${k}?`, options: [{ id: "yes", text: "Đúng" }, { id: "no", text: "Sai" }], answerId: "yes", explanation: "Giải thích từ nguồn", difficulty: k ? "applied" : "basic" }))) })) });
}
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
it("rejects missing objectives/questions, incorrect answer IDs, unknown sources and unsafe identifiers", () => {
  const hub = fixtureHub();
  expect(() => validateLearningHub(hub, ["missing-source"])).toThrow("nguồn");
  const missing = structuredClone(hub); missing.chapters[0].questions.shift(); expect(() => validateLearningHub(missing)).toThrow("hai câu");
  const wrong = structuredClone(hub); wrong.chapters[0].questions[0].answerId = "absent"; expect(() => validateLearningHub(wrong)).toThrow("đáp án");
  const unsafe = structuredClone(hub); unsafe.chapters[0].objectives[0].id = "__proto__"; expect(() => validateLearningHub(unsafe)).toThrow();
});
it("covers untested objectives over multiple rounds and keeps score separate from coverage", () => {
  const hub = fixtureHub(); let progress = emptyHubProgress();
  const first = pickHubRound(hub, progress, undefined, () => 0.42);
  expect(first).toHaveLength(3); expect(new Set(first.map(q => q.objectiveId)).size).toBe(3);
  first.forEach(q => { progress = applyHubEvent(hub, progress, { kind: "answer", questionId: q.id, answerId: q.answerId }); });
  expect(hubCoverage(hub, progress)).toEqual({ total: 6, read: 0, tested: 3, mastered: 0, weak: 0 });
  const next = pickHubRound(hub, progress, undefined, () => 0.42);
  expect(next.every(q => !first.some(v => v.objectiveId === q.objectiveId))).toBe(true);
  next.forEach(q => { progress = applyHubEvent(hub, progress, { kind: "answer", questionId: q.id, answerId: q.answerId }); });
  expect(hubCoverage(hub, progress).tested).toBe(6);
  const wrong = next[0]; progress = applyHubEvent(hub, progress, { kind: "answer", questionId: wrong.id, answerId: "no" });
  expect(pickHubRound(hub, progress)[0].objectiveId).toBe(wrong.objectiveId);
  expect(hubCoverage(hub, progress).weak).toBe(1);
});
it("never repeats a question within a round and preserves correct option IDs after shuffling", () => {
  const hub = fixtureHub(); hub.questionsPerRound = 20;
  for (const random of [() => 0, () => 0.999, Math.random]) {
    const round = pickHubRound(hub, emptyHubProgress(), "ch0", random);
    expect(round).toHaveLength(6); expect(new Set(round.map(q => q.id)).size).toBe(6);
    expect(round.every(q => q.options.find(o => o.id === q.answerId)?.text === "Đúng")).toBe(true);
  }
  let p = emptyHubProgress(); for (const q of hub.chapters[0].questions) p = applyHubEvent(hub, p, { kind: "answer", questionId: q.id, answerId: q.answerId });
  expect(hubCoverage(hub, p, "ch0").mastered).toBe(3);
  expect(cleanHubProgress(hub, { read: ["ghost"], attempts: { ghost: { tries: 3 } } })).toEqual(emptyHubProgress());
});
it("runs the exported standalone hub offline, hides overview in chapters and gives quiz feedback", () => {
  const dom = new JSDOM(renderLearningHub(fixtureHub()), { runScripts: "dangerously" });
  const doc: Document = dom.window.document;
  expect(doc.querySelector("main h1")?.textContent).toBe("Năng lượng");
  [...doc.querySelectorAll<HTMLButtonElement>("nav button")].find(b => b.textContent?.includes("Chương 1"))!.click();
  expect(doc.querySelector("main .eyebrow")).toBeNull(); expect(doc.querySelectorAll(".objective")).toHaveLength(3);
  [...doc.querySelectorAll<HTMLButtonElement>("main button")].find(b => b.textContent === "Làm quiz chương này")!.click();
  [...doc.querySelectorAll<HTMLButtonElement>(".choices button")].find(b => b.textContent === "Sai")!.click();
  expect(doc.querySelector(".feedback")?.textContent).toContain("Cần ôn lại");
  expect(doc.querySelector(".feedback")?.textContent).toContain("Giải thích từ nguồn");
  expect(doc.querySelectorAll(".choices button:disabled")).toHaveLength(2); dom.window.close();
});
it("computes supported source-based simulations without eval and resets all results", () => {
  const hub = fixtureHub(), visual = hub.chapters[0].objectives[0].visual!;
  visual.kind = "simulation"; visual.simulation = { inputLabel: "Vận tốc", inputUnit: "m/s", outputLabel: "Động năng", outputUnit: "J", coefficient: 1, power: 2, offset: 0, min: 0, max: 10, initial: 4, step: 1, equation: "E = ½mv², m = 2 kg", assumptions: "Cơ học cổ điển; giữ khối lượng không đổi." };
  const dom = new JSDOM(renderLearningHub(hub), { runScripts: "dangerously" }), doc: Document = dom.window.document;
  [...doc.querySelectorAll<HTMLButtonElement>("nav button")].find(b => b.textContent?.includes("Chương 1"))!.click();
  const slider = doc.querySelector<HTMLInputElement>('input[type="range"]')!;
  expect(doc.querySelector("output")?.textContent).toContain("16 J");
  slider.value = "8"; slider.dispatchEvent(new dom.window.Event("input")); expect(doc.querySelector("output")?.textContent).toContain("64 J");
  [...doc.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Đặt lại mô phỏng")!.click(); expect(doc.querySelector("output")?.textContent).toContain("16 J");
  visual.simulation.max = visual.simulation.min; expect(() => validateLearningHub(hub)).toThrow("mô phỏng"); dom.window.close();
});
it("escapes hostile source text and replaces imported runtime with the validated viewer", () => {
  const hub = fixtureHub(); hub.chapters[0].objectives[0].explanation = '</script><img src=x onerror="alert(1)">';
  const html = renderLearningHub(hub); expect(readLearningHub(html)?.chapters[0].objectives[0].explanation).toContain("</script>");
  expect(html).not.toContain('<img src=x');
  const imported = html.replace("<body>", '<body><script>window.UNTRUSTED=true</script>');
  expect(normalizeLearningHubHtml(imported)).not.toContain("UNTRUSTED");
  expect(readLearningHub("<main>Legacy</main>")).toBeNull();
  expect(() => normalizeLearningHubHtml("<main>Legacy</main>", true)).toThrow("ngân hàng quiz");
});
it("isolates progress by account and content revision, merges concurrent viewer writes", async () => {
  const hub = fixtureHub();
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto"); Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  try {
    const revision = await learningHubRevision(hub);
    await Promise.all([saveHubProgressEvent("alice", revision, hub, { kind: "read", objectiveId: "o00" }), saveHubProgressEvent("alice", revision, hub, { kind: "answer", questionId: "q000", answerId: "yes" })]);
    expect((await loadHubProgress("alice", revision, hub)).read).toEqual(["o00"]);
    expect((await loadHubProgress("alice", revision, hub)).attempts.q000.lastCorrect).toBe(true);
    expect(await loadHubProgress("bob", revision, hub)).toEqual(emptyHubProgress());
    hub.chapters[0].questions[0].answerId = "no";
    expect(await loadHubProgress("alice", await learningHubRevision(hub), hub)).toEqual(emptyHubProgress());
  } finally { if (cryptoDescriptor) Object.defineProperty(globalThis, "crypto", cryptoDescriptor); }
});
it("shares coverage requirements across Auto/Manual and defaults older settings", () => {
  const old = { ...emptyNoteSettings(), format: "html" as const, review: false } as any; delete old.questionsPerRound; delete old.quizDifficulty;
  expect(validateNoteSettings(old).questionsPerRound).toBe(5);
  for (const prompt of [noteInstructions(old), noteManualPrompt(old)]) {
    expect(prompt).toContain("NEVER removes objectives"); expect(prompt).toContain("Quiz is REQUIRED"); expect(prompt).toContain("mindcanvas-learning-hub"); expect(prompt).toContain("at least two distinct questions");
  }
});
it("accepts progress only from its current frame and token, and stops listening after unmount", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto"); Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host), hub = fixtureHub();
  try {
    await act(async () => root.render(createElement(HtmlDocumentViewer, { html: renderLearningHub(hub), title: hub.title, owner: "alice" })));
    for (let i = 0; i < 100 && !host.querySelector("iframe"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    const iframe = host.querySelector("iframe")!; expect(iframe).toBeTruthy();
    const token = /"token":"([^"]+)"/.exec(iframe.srcdoc)![1], revision = await learningHubRevision(hub);
    const send = (source: Window | null, value: string) => window.dispatchEvent(new MessageEvent("message", { source, data: { type: "mc-hub-event", token: value, event: { kind: "read", objectiveId: "o00" } } }));
    send(window, token); send(iframe.contentWindow, "wrong-token");
    expect((await loadHubProgress("alice", revision, hub)).read).toEqual([]);
    send(iframe.contentWindow, token);
    for (let i = 0; i < 100 && !(await loadHubProgress("alice", revision, hub)).read.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
    expect((await loadHubProgress("alice", revision, hub)).read).toEqual(["o00"]);
    expect((await loadHubProgress("bob", revision, hub)).read).toEqual([]);
    await act(async () => root.unmount());
  } finally { host.remove(); if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor); }
});
