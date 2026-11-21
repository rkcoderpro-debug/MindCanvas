import { describe, expect, it } from "vitest";
import { blankBoard } from "./board";
import { createCanvasThumbnail, isCanvasThumbnail } from "./canvasThumbnail";

describe("canvas thumbnail snapshots", () => {
  it("captures recognizable content without embedding original media", () => {
    const board = {
      ...blankBoard("Biology"),
      nodes: [{ id: "root", label: "  Cell\ncycle  ", x: 40, y: 30, width: 180, height: 70, color: "#123456" }],
      texts: [{ id: "text", text: "Mitosis notes", x: 280, y: 50, width: 220, height: 44 }],
      media: [{ id: "image", kind: "image" as const, src: "data:image/png;base64,SECRET", name: "diagram.png", x: 80, y: 180, width: 240, height: 140 }],
    };
    const thumbnail = createCanvasThumbnail(board);
    expect(thumbnail.background).toBe("dots");
    expect(thumbnail.items.map(item => item.kind)).toEqual(["node", "text", "media"]);
    expect(thumbnail.items[0].label).toBe("Cell cycle");
    expect(thumbnail.items[2]).toMatchObject({ kind: "media", label: "diagram.png" });
    expect(thumbnail.items[2]).not.toHaveProperty("src");
    expect(thumbnail.bounds.width).toBeGreaterThan(0);
    expect(isCanvasThumbnail(thumbnail)).toBe(true);
  });

  it("limits snapshots to a small bounded number of items and handles media backgrounds", () => {
    const board = {
      ...blankBoard(),
      background: { kind: "image" as const, src: "data:image/png;base64,AA==" },
      nodes: Array.from({ length: 60 }, (_, index) => ({ id: `node-${index}`, label: `Node ${index}`, x: index * 20, y: 0, width: 100, height: 50 })),
    };
    const thumbnail = createCanvasThumbnail(board);
    expect(thumbnail.items).toHaveLength(50);
    expect(thumbnail.background).toBe("plain");
    expect(isCanvasThumbnail({ ...thumbnail, version: 2 })).toBe(false);
    expect(isCanvasThumbnail({ ...thumbnail, bounds: { ...thumbnail.bounds, width: Number.NaN } })).toBe(false);
  });
});
