const LEGACY_CANVAS_TEXT = new Set(["#18213b", "#281c32"]);

export function canvasTextColor(color?: string): string {
  return !color || LEGACY_CANVAS_TEXT.has(color.toLowerCase()) ? "var(--canvas-text)" : color;
}

export function readableTextColor(background?: string): string {
  if (!background) return "var(--node-text)";
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(background);
  if (!match) return "var(--node-text)";
  const hex = match[1].length === 3 ? [...match[1]].map(char => char + char).join("") : match[1];
  const channels = [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return luminance > .42 ? "#281a35" : "#fffafc";
}
