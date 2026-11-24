// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  A4_COLS, A4_GAP, A4_HEIGHT, A4_LINES, newA4Layout,
  projectA4Board, rearrangeA4Pages, ruledLines, unprojectA4Board, updateA4Text,
} from "./a4Canvas";
import { blankBoard, parseBoard } from "./board";
import { createCanvasThumbnail } from "./canvasThumbnail";
import { a4PrintSvg } from "./a4Pdf";

const first = { id: "first", text: "Tiếng Việt" };
const second = { id: "second", text: "Trang 2" };
const fixture = () => ({
  ...blankBoard(), a4: { ...newA4Layout(), pages: [first, second] },
  shapes: [
    { id: "first-shape", kind: "rect" as const, x: 20, y: 20, width: 20, height: 20, color: "#e0eaff" },
    { id: "second-shape", kind: "rect" as const, x: 20, y: A4_HEIGHT + 80, width: 20, height: 20, color: "#e0eaff" },
  ],
  drawings: [{ id: "crosses", color: "#123456", width: 4, opacity: 1,
    points: [{ x: 32, y: A4_HEIGHT - 20 }, { x: 52, y: A4_HEIGHT + 20 }] }],
});

describe("A4 project data and paper boundaries", () => {
  it("preserves old boards and round-trips persisted A4 metadata", () => {
    const classic = blankBoard();
    expect(parseBoard(JSON.parse(JSON.stringify(classic))).a4).toBeUndefined();
    const board = fixture();
    expect(parseBoard(JSON.parse(JSON.stringify(board))).a4).toEqual(board.a4);
    expect(createCanvasThumbnail(board).format).toBe("a4");
    expect(() => parseBoard({ ...board, a4: { ...board.a4, pages: [first, first] } })).toThrow(/Invalid A4/);
  });

  it("wraps and paginates Vietnamese text without altering any characters", () => {
    const long = Array.from({ length: A4_LINES + 4 }, (_, i) => `Dòng ${i + 1}: góc đối đỉnh và đường phân giác.`).join("\n");
    const next = updateA4Text(fixture().a4, 0, long, long.length)!;
    expect(next.pages).toHaveLength(3);
    expect(next.pages[0].text + next.pages[1].text).toBe(long);
    expect(next.pages[2]).toBe(second);
    expect(next.caretPage).toBe(1);
    expect(ruledLines("ấ".repeat(A4_COLS + 2)).map(line => line.display.length)).toEqual([A4_COLS, 2]);
  });

  it("projects page gaps while keeping original coordinates on an unrelated edit", () => {
    const board = fixture(), shown = projectA4Board(board, board.viewport);
    expect(shown.shapes[1].y).toBe(board.shapes[1].y + A4_GAP);
    const restored = unprojectA4Board(board, shown, { ...shown, shapes: [shown.shapes[0], { ...shown.shapes[1], x: 80 }] }, false);
    expect(restored.drawings).toEqual(board.drawings);
    expect(restored.shapes[1]).toMatchObject({ x: 80, y: board.shapes[1].y });
    expect(restored.a4?.pages).toEqual(board.a4.pages);
  });

  it("retains ink on both pages after reordering and removes only the deleted page", () => {
    const board = fixture(), moved = rearrangeA4Pages(board, [second, first]);
    expect(moved.shapes.find(s => s.id === "second-shape")?.y).toBe(80);
    expect(moved.shapes.find(s => s.id === "first-shape")?.y).toBe(A4_HEIGHT + 20);
    expect(moved.drawings).toHaveLength(2);
    const remaining = rearrangeA4Pages(board, [second]);
    expect(remaining.shapes.map(shape => shape.id)).toEqual(["second-shape"]);
    expect(remaining.drawings[0].points).toEqual([{ x: 42, y: 0 }, { x: 52, y: 20 }]);
  });

  it("does not store the next blank page until content is placed on it", () => {
    const board = { ...fixture(), a4: { ...fixture().a4, mode: "continuous" as const } };
    const shown = projectA4Board(board, board.viewport);
    expect(unprojectA4Board(board, shown, shown, true).a4!.pages).toHaveLength(2);
    const drawn = unprojectA4Board(board, shown, { ...shown, drawings: [...shown.drawings,
      { id: "new", color: "#222222", width: 4, opacity: 1, points: [{ x: 60, y: A4_HEIGHT * 2 + 20 }] },
    ] }, true);
    expect(drawn.a4!.pages).toHaveLength(3);
    expect(drawn.a4!.pages[2].text).toBe("");
  });

  it("previews the exact same page bounds and artwork for both display modes", () => {
    const board = fixture();
    const page0 = a4PrintSvg(board, 0), page1 = a4PrintSvg(board, 1);
    expect(page0).toContain("Tiếng Việt");
    expect(page1).toContain("Trang 2");
    expect(page1).not.toContain("Tiếng Việt");
    expect(page1).toContain('viewBox="0 1123 794 1123"');
    expect(page0).toContain("#123456");
    expect(page1).toContain("#123456");
    expect(a4PrintSvg({ ...board, a4: { ...board.a4, mode: "continuous" } }, 1)).toBe(page1);
  });
});
