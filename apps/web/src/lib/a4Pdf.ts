import type { BoardState } from "@mindcanvas/shared";
import { A4_FONT, A4_HEIGHT, A4_LINE, A4_LINES, A4_MARGIN, A4_TEXT_ADVANCE, A4_WIDTH, a4TextColumns, ruledLines } from "./a4Canvas";
import { exportCanvasSvg, type CanvasExportPalette } from "./board";

export const A4_PDF_WIDTH = 210 * 72 / 25.4;
export const A4_PDF_HEIGHT = 297 * 72 / 25.4;
const printColors: CanvasExportPalette = {
  canvas: "#ffffff", surface: "#edf2f7", text: "#172033", muted: "#52667a",
  nodeFill: "#e1eaf4", elementStroke: "#a6b8c9", connector: "#3b536a",
  dot: "#d4e1ed", grid: "#d9e5ef", rule: "#d9e5ef", margin: "#d6a0a0",
  gridMinor: "#e2ebf4", gridMajor: "#bfcfdf",
};

const xml = (str: string) => str.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
export function a4PrintSvg(board: BoardState, index: number) {
  const page = board.a4?.pages[index];
  if (!page) throw new Error("Invalid page number.");
  const y = index * A4_HEIGHT, paper = board.a4!.paper;
  const rules = paper === "plain" ? "" : Array.from({ length: A4_LINES + 1 }, (_, i) =>
    `M${A4_MARGIN} ${y + A4_MARGIN + A4_LINE * i}H${A4_WIDTH - A4_MARGIN}`
  ).join(" ") + (paper === "grid" ? Array.from({ length: Math.floor((A4_WIDTH - 2 * A4_MARGIN) / A4_LINE) + 1 }, (_, i) =>
    `M${A4_MARGIN + A4_LINE * i} ${y + A4_MARGIN}V${y + A4_MARGIN + A4_LINES * A4_LINE}`
  ).join(" ") : "");
  const underlay = (rules ? `<path d="${rules}" stroke="#d9e5ef" fill="none"/>` : "") +
    `<g fill="#172033" font-family="monospace" font-size="${A4_FONT}" xml:space="preserve">` +
    ruledLines(page.text).slice(0, A4_LINES).map((line, row) => line.display
      ? `<text x="${A4_MARGIN}" y="${y + A4_MARGIN + A4_LINE * row + 19}" textLength="${Math.max(1, a4TextColumns(line.display)) * A4_TEXT_ADVANCE}" lengthAdjust="spacingAndGlyphs">${xml(line.display)}</text>`
      : ""
    ).join("") + "</g>";
  return exportCanvasSvg({ ...board, background: typeof board.background === "object" ? board.background : "plain" }, printColors, {
    bounds: { x: 0, y, width: A4_WIDTH, height: A4_HEIGHT }, underlay,
  });
}

async function pngFromSvg(svg: string, canvas: HTMLCanvasElement) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not render the A4 page."));
      image.src = url;
    });
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas rendering is unavailable.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not render the A4 page.");
    return blob.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function download(blob: Blob, base: string, extension: string) {
  const objectUrls = URL;
  const href = objectUrls.createObjectURL(blob), link = document.createElement("a");
  link.href = href;
  link.download = (base.replace(/[<>:"/\\|?*]/g, "_").slice(0, 100) || "Canvas A4") + "." + extension;
  link.click();
  setTimeout(() => objectUrls.revokeObjectURL(href), 2000);
}
export async function downloadA4PageImage(board: BoardState, index: number, format: "png" | "svg") {
  const svg = a4PrintSvg(board, index), title = `${board.title} - ${index + 1}`;
  if (format === "svg") { download(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), title, format); return; }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(210 * 150 / 25.4);
  canvas.height = Math.round(297 * 150 / 25.4);
  try { download(new Blob([await pngFromSvg(svg, canvas)], { type: "image/png" }), title, format); }
  finally { canvas.width = canvas.height = 1; }
}

export async function downloadA4Pdf(board: BoardState, first: number, last: number, onProgress?: (page: number) => void) {
  if (!board.a4 || !Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last > board.a4.pages.length) {
    throw new Error("Invalid page range.");
  }
  const { PDFDocument } = await import("pdf-lib");
  const result = await PDFDocument.create();
  result.setTitle(board.title);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(210 * 150 / 25.4);
  canvas.height = Math.round(297 * 150 / 25.4);
  try {
    for (let i = first - 1; i < last; i++) {
      onProgress?.(i + 1);
      const image = await result.embedPng(new Uint8Array(await pngFromSvg(a4PrintSvg(board, i), canvas)));
      const page = result.addPage([A4_PDF_WIDTH, A4_PDF_HEIGHT]);
      page.drawImage(image, { x: 0, y: 0, width: A4_PDF_WIDTH, height: A4_PDF_HEIGHT });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const bytes = await result.save();
    download(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), board.title, "pdf");
  } finally {
    canvas.width = canvas.height = 1;
  }
}
