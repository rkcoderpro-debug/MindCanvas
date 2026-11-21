import { describe, expect, it } from "vitest";
import { parseLenientJson } from "@mindcanvas/shared";

describe("parseLenientJson", () => {
  it("keeps valid JSON unchanged", () => {
    const value = { title: "Quoted", cards: [{ front: 'Từ "迷"', back: "Dòng một\nDòng hai" }] };
    expect(parseLenientJson(JSON.stringify(value))).toEqual(value);
  });

  it("reads fenced JSON surrounded by an explanation", () => {
    expect(parseLenientJson('Kết quả đây:\n```json\n{"ok":true}\n```\n')).toEqual({ ok: true });
  });

  it("repairs unescaped quotes, raw newlines, and a trailing comma", () => {
    const raw = '{"title":"Bài học","cards":[{"front":"Từ ghép với 迷: "音乐迷" có nghĩa là gì?","back":"Dòng một\nDòng hai",}],}';
    expect(parseLenientJson<{ title: string; cards: Array<{ front: string; back: string }> }>(raw)).toEqual({
      title: "Bài học",
      cards: [{ front: 'Từ ghép với 迷: "音乐迷" có nghĩa là gì?', back: "Dòng một\nDòng hai" }],
    });
  });

  it("does not confuse a quoted comma with an object boundary", () => {
    const raw = '{"title":"Dấu "," trong nội dung", "cards":[]}';
    expect(parseLenientJson<{ title: string }>(raw).title).toBe('Dấu "," trong nội dung');
  });
});
