// @vitest-environment jsdom
import { act, lazy } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SharedLearningTab, { InboxBoundary } from "./SharedLearningTab";
import { LanguageProvider } from "../lib/i18n";

const state = vi.hoisted(() => ({ fail: true }));
vi.mock("./SharedLearningPage", () => ({ default: () => {
  if (state.fail) throw new Error("Unexpected inbox render error");
  return <p>Recovered inbox</p>;
} }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; state.fail = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
  localStorage.setItem("mindcanvas:language", "en");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.restoreAllMocks(); });
it("contains an inbox render failure and retries without crashing surrounding navigation", async () => {
  await act(async () => root.render(<LanguageProvider><nav>Navigation remains</nav><SharedLearningTab owner="account"/></LanguageProvider>));
  // Let the dynamic import resolve before checking its render boundary.
  await act(async () => { await import("./SharedLearningPage"); });
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not open shared learning");
  expect(host.textContent).toContain("Navigation remains");
  state.fail = false;
  await act(async () => (Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Retry")!).click());
  expect(host.textContent).toContain("Recovered inbox"); expect(host.querySelector('[role="alert"]')).toBeNull();
});
it("catches a rejected lazy module and recovers with a new module loader", async () => {
  const Broken = lazy(() => Promise.reject(new Error("Failed to fetch dynamically imported module")));
  await act(async () => root.render(<InboxBoundary fallback={<p role="alert">Load failed</p>}><Broken/></InboxBoundary>));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Load failed");
  const Fixed = lazy(() => Promise.resolve({ default: () => <p>Loaded after retry</p> }));
  await act(async () => root.render(<InboxBoundary key="retry" fallback={<p role="alert">Load failed</p>}><Fixed/></InboxBoundary>));
  expect(host.textContent).toContain("Loaded after retry");
});
