// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { blankBoard } from "./board";
import { clearCanvasClipboardForTests, copyCanvasSelection, hasCanvasClipboard, readCanvasSelection } from "./canvasClipboard";

beforeEach(() => clearCanvasClipboardForTests());

describe("cross-project canvas clipboard", () => {
  it("keeps copied elements in the current browser session when OS clipboard access is unavailable", async () => {
    const source = { ...blankBoard("Source"), texts: [{ id: "text", text: "Portable note", x: 20, y: 40, width: 200 }] };
    await copyCanvasSelection(source, [{ kind: "texts", id: "text" }]);
    expect(hasCanvasClipboard()).toBe(true);
    const first = await readCanvasSelection(), second = await readCanvasSelection();
    expect(first?.board.title).toBe("Source"); expect(first?.selection).toEqual([{ kind: "texts", id: "text" }]);
    expect(first?.offset).toBe(24); expect(second?.offset).toBe(48);
  });
});
