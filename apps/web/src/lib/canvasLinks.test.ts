// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { canvasIdFromUrl, canvasPermalink, rememberCanvasForSignIn, takeCanvasAfterSignIn } from "./canvasLinks";
const id = "9e1b5750-a73c-458b-9e66-cf4856c8a48b";
beforeEach(() => { sessionStorage.clear(); window.history.replaceState(null, "", "/"); });
it("copies a stable canvas URL without the current invitation, hash or other app state", () => {
  const base = new URL("https://example.test/?invite=token&learn=quiz#private");
  expect(canvasPermalink(id, base)).toBe(`https://example.test/?canvas=${id}`);
  expect(canvasIdFromUrl(new URL("https://example.test/?canvas=https://example.org"))).toBeNull();
});
it("remembers the destination once through OAuth and discards expired returns", () => {
  window.history.replaceState(null, "", `/?canvas=${id}`);
  rememberCanvasForSignIn();
  window.history.replaceState(null, "", "/");
  expect(takeCanvasAfterSignIn()).toBe(id);
  expect(takeCanvasAfterSignIn()).toBeNull();
  window.history.replaceState(null, "", `/?canvas=${id}`);
  rememberCanvasForSignIn();
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
  try { expect(takeCanvasAfterSignIn()).toBeNull(); } finally { now.mockRestore(); }
});
