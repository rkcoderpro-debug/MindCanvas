import JSZip from "jszip";

/**
 * The DOCX editor deliberately keeps a small, explicit document model.  The
 * DOM is only a view/editing surface; drafts and exports are derived from
 * this model so a rendered HTML fragment can never be the sole source of
 * truth.
 */

export type DocxParagraphStyle = "Normal" | "Title" | "Subtitle" | "Quote" | `Heading${1 | 2 | 3 | 4 | 5 | 6}`;
export type DocxAlignment = "left" | "center" | "right" | "justify";
export type DocxListKind = "bullet" | "number";
export type DocxOrientation = "portrait" | "landscape";
export type DocxPageSize = "A4" | "Letter";

export type DocxRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  highlight?: string;
  href?: string;
  widthPx?: number;
  heightPx?: number;
};

export type DocxParagraph = {
  type: "paragraph";
  style: DocxParagraphStyle;
  runs: DocxRun[];
  align?: DocxAlignment;
  before?: number;
  after?: number;
  lineSpacing?: number;
  indentLeft?: number;
  firstLine?: number;
  hanging?: number;
  list?: { kind: DocxListKind; level: number; numId?: number };
  pageBreakBefore?: boolean;
};

export type DocxTableCell = {
  blocks: DocxBlock[];
  colSpan?: number;
  rowSpan?: number;
  verticalAlign?: "top" | "center" | "bottom";
  background?: string;
};

export type DocxTable = {
  type: "table";
  rows: Array<{ cells: DocxTableCell[]; header?: boolean }>;
  width?: number;
  borderColor?: string;
};

export type DocxImage = {
  type: "image";
  src: string;
  alt?: string;
  widthPx?: number;
  heightPx?: number;
  align?: DocxAlignment;
  href?: string;
};

export type DocxPageBreak = { type: "pageBreak" };
export type DocxBlock = DocxParagraph | DocxTable | DocxImage | DocxPageBreak;

export type DocxPageSettings = {
  size: DocxPageSize;
  orientation: DocxOrientation;
  margins: { top: number; right: number; bottom: number; left: number };
  headerDistance?: number;
  footerDistance?: number;
};

export type DocxCompatibilityWarning = {
  code: string;
  message: string;
  detail?: string;
};

export type DocxDocument = {
  schemaVersion: 1;
  blocks: DocxBlock[];
  page: DocxPageSettings;
  header?: DocxBlock[];
  footer?: DocxBlock[];
  warnings: DocxCompatibilityWarning[];
  originalFormat?: "docx";
};

export const DEFAULT_PAGE: DocxPageSettings = {
  size: "A4",
  orientation: "portrait",
  margins: { top: 2, right: 2, bottom: 2, left: 2 },
  headerDistance: 1.25,
  footerDistance: 1.25,
};

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const IMAGE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const HYPERLINK_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";

function q(element: Element | Document, name: string) {
  return element.getElementsByTagNameNS(WORD_NS, name)[0] ?? element.getElementsByTagName(`w:${name}`)[0] ?? null;
}

function qs(element: Element | Document, name: string) {
  return Array.from(element.getElementsByTagNameNS(WORD_NS, name).length
    ? element.getElementsByTagNameNS(WORD_NS, name)
    : element.getElementsByTagName(`w:${name}`));
}

function attr(element: Element | null, name: string) {
  if (!element) return "";
  return element.getAttributeNS(WORD_NS, name) || element.getAttribute(`w:${name}`) || element.getAttribute(name) || "";
}

function relationAttr(element: Element | null, name: string) {
  if (!element) return "";
  return element.getAttributeNS(REL_NS, name) || element.getAttribute(`r:${name}`) || element.getAttribute(name) || "";
}

function safeNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function escapeXml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&apos;",
    '"': "&quot;",
  }[character] ?? character));
}

function decodeXml(value: string) {
  return value.replace(/&(?:amp|#38);/gi, "&").replace(/&(?:lt|#60);/gi, "<").replace(/&(?:gt|#62);/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function safeExternalHref(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^(?:https?:|mailto:)/i.test(trimmed) ? trimmed : undefined;
}

function colorValue(value: string) {
  const normalized = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(normalized)) return normalized.split("").map(part => part + part).join("").toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(normalized)) return normalized.toUpperCase();
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map(part => Number(part).toString(16).padStart(2, "0")).join("").toUpperCase();
  return "";
}

function dataUrlBytes(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
  if (!match) return { mimeType: "application/octet-stream", bytes: new Uint8Array() };
  const mimeType = match[1] || "application/octet-stream";
  const body = match[2];
  if (!/;base64/i.test(dataUrl.slice(0, dataUrl.indexOf(",")))) {
    return { mimeType, bytes: new TextEncoder().encode(decodeURIComponent(body)) };
  }
  if (typeof atob === "function") {
    const binary = atob(body);
    return { mimeType, bytes: Uint8Array.from(binary, character => character.charCodeAt(0)) };
  }
  return { mimeType, bytes: new Uint8Array() };
}

function bytesToDataUrl(mimeType: string, bytes: Uint8Array) {
  if (typeof btoa === "function") {
    let binary = "";
    const step = 0x8000;
    for (let index = 0; index < bytes.length; index += step) binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + step, bytes.length)));
    return `data:${mimeType};base64,${btoa(binary)}`;
  }
  return `data:${mimeType};base64,`;
}

function normalizeStyleName(value: string, styles: Map<string, string>) {
  const normalized = value.trim().toLowerCase().replace(/[ _-]/g, "");
  const known = styles.get(value) || styles.get(normalized) || value;
  if (/^title$/i.test(known)) return "Title" as const;
  if (/^subtitle$/i.test(known)) return "Subtitle" as const;
  if (/^quote$/i.test(known)) return "Quote" as const;
  const heading = known.match(/heading\s*([1-6])/i) || value.match(/heading\s*([1-6])/i);
  if (heading) return `Heading${heading[1]}` as DocxParagraphStyle;
  return "Normal" as const;
}

function styleMapFromXml(xml: Document) {
  const styles = new Map<string, string>();
  for (const style of qs(xml, "style")) {
    const styleId = attr(style, "styleId");
    const name = attr(q(style, "name"), "val") || styleId;
    if (styleId) {
      styles.set(styleId, name);
      styles.set(styleId.toLowerCase().replace(/[ _-]/g, ""), name);
    }
  }
  return styles;
}

function readRunProperties(runProperties: Element | null): Omit<DocxRun, "text"> {
  const font = q(runProperties ?? document, "rFonts");
  const size = q(runProperties ?? document, "sz");
  const color = q(runProperties ?? document, "color");
  const highlight = q(runProperties ?? document, "highlight");
  const underline = q(runProperties ?? document, "u");
  return {
    bold: Boolean(q(runProperties ?? document, "b")),
    italic: Boolean(q(runProperties ?? document, "i")),
    underline: Boolean(underline) && attr(underline, "val") !== "none",
    strike: Boolean(q(runProperties ?? document, "strike")),
    superscript: Boolean(q(runProperties ?? document, "vertAlign")) && attr(q(runProperties ?? document, "vertAlign"), "val") === "superscript",
    subscript: Boolean(q(runProperties ?? document, "vertAlign")) && attr(q(runProperties ?? document, "vertAlign"), "val") === "subscript",
    fontFamily: attr(font, "ascii") || attr(font, "hAnsi") || undefined,
    fontSize: size ? clampNumber(safeNumber(attr(size, "val")) / 2, 1, 200) : undefined,
    color: color && attr(color, "val") !== "auto" ? `#${attr(color, "val")}` : undefined,
    highlight: highlight && attr(highlight, "val") !== "none" ? `#${attr(highlight, "val")}` : undefined,
  };
}

function directChild(element: Element, localName: string) {
  return Array.from(element.children).find(child => child.localName === localName || child.tagName === `w:${localName}`) ?? null;
}

function readParagraphProperties(paragraph: Element, styles: Map<string, string>, numbering: Map<string, DocxListKind>) {
  const properties = directChild(paragraph, "pPr");
  const styleId = attr(directChild(properties ?? paragraph, "pStyle"), "val") || "Normal";
  const jc = attr(directChild(properties ?? paragraph, "jc"), "val");
  const spacing = directChild(properties ?? paragraph, "spacing");
  const indent = directChild(properties ?? paragraph, "ind");
  const numPr = directChild(properties ?? paragraph, "numPr");
  const numId = attr(directChild(numPr ?? paragraph, "numId"), "val");
  const ilvl = attr(directChild(numPr ?? paragraph, "ilvl"), "val");
  const paragraphStyle: DocxParagraphStyle = normalizeStyleName(styleId, styles);
  const result: Omit<DocxParagraph, "type" | "runs"> = {
    style: paragraphStyle,
    align: (["left", "center", "right", "both", "justify"] as string[]).includes(jc) ? (jc === "both" ? "justify" : jc as DocxAlignment) : undefined,
    before: spacing && attr(spacing, "before") ? safeNumber(attr(spacing, "before")) / 20 : undefined,
    after: spacing && attr(spacing, "after") ? safeNumber(attr(spacing, "after")) / 20 : undefined,
    lineSpacing: spacing && attr(spacing, "line") ? safeNumber(attr(spacing, "line")) / 240 : undefined,
    indentLeft: indent && attr(indent, "left") ? safeNumber(attr(indent, "left")) / 1440 * 2.54 : undefined,
    firstLine: indent && attr(indent, "firstLine") ? safeNumber(attr(indent, "firstLine")) / 1440 * 2.54 : undefined,
    hanging: indent && attr(indent, "hanging") ? safeNumber(attr(indent, "hanging")) / 1440 * 2.54 : undefined,
    list: numId ? { kind: numbering.get(numId) ?? "bullet", level: safeNumber(ilvl) } : undefined,
    pageBreakBefore: Boolean(directChild(properties ?? paragraph, "pageBreakBefore")),
  };
  return result;
}

function readParagraph(paragraph: Element, styles: Map<string, string>, numbering: Map<string, DocxListKind>, relationships: Map<string, { target: string; type: string }>, media: Map<string, string>, warnings: DocxCompatibilityWarning[]): DocxParagraph {
  const properties = readParagraphProperties(paragraph, styles, numbering);
  const rawStyle = attr(directChild(directChild(paragraph, "pPr") ?? paragraph, "pStyle"), "val");
  const mappedStyle = rawStyle ? styles.get(rawStyle) || rawStyle : "Normal";
  if (rawStyle && properties.style === "Normal" && !/^normal$/i.test(mappedStyle)) {
    warnings.push({ code: "paragraph-style-mapped", message: "Một kiểu đoạn tùy chỉnh đã được ánh xạ về Đoạn văn để giữ nội dung chỉnh sửa.", detail: rawStyle });
  }
  const runs: DocxRun[] = [];
  const appendRun = (text: string, propertiesForRun: Omit<DocxRun, "text">) => {
    if (!text) return;
    const previous = runs[runs.length - 1];
    const previousKey = previous ? JSON.stringify({ ...previous, text: undefined }) : "";
    const nextKey = JSON.stringify(propertiesForRun);
    if (previous && previousKey === nextKey && !previous.href) previous.text += text;
    else runs.push({ text, ...propertiesForRun });
  };
  for (const child of Array.from(paragraph.children)) {
    if (child.localName !== "r" && child.tagName !== "w:r" && child.localName !== "hyperlink") continue;
    if (child.localName === "hyperlink" || child.tagName === "w:hyperlink") {
      const linkProperties = readRunProperties(directChild(child, "rPr"));
      const relationship = relationships.get(relationAttr(child, "id"));
      const href = safeExternalHref(relationship?.target);
      for (const textNode of qs(child, "t")) appendRun(textNode.textContent ?? "", { ...linkProperties, href });
      continue;
    }
    const runProperties = readRunProperties(directChild(child, "rPr"));
    const textNodes = qs(child, "t");
    for (const textNode of textNodes) appendRun(textNode.textContent ?? "", runProperties);
    for (const tab of qs(child, "tab")) appendRun("\t", runProperties);
    for (const br of qs(child, "br")) appendRun(attr(br, "type") === "page" ? "\f" : "\n", runProperties);
    for (const drawing of qs(child, "drawing")) {
      if (drawing.getElementsByTagNameNS("*", "anchor")[0]) warnings.push({ code: "floating-image", message: "Ảnh nổi hoặc wrap text chưa được giữ nguyên; ảnh được nhập ở chế độ inline." });
      const blip = drawing.getElementsByTagNameNS("*", "blip")[0] ?? drawing;
      const embed = blip.getAttributeNS(REL_NS, "embed") || blip.getAttribute("r:embed") || "";
      const extent = drawing.getElementsByTagNameNS("*", "extent")[0];
      const widthPx = extent ? safeNumber(extent.getAttribute("cx") ?? "") / 9525 : undefined;
      const heightPx = extent ? safeNumber(extent.getAttribute("cy") ?? "") / 9525 : undefined;
      if (embed && media.has(embed)) appendRun("\uFFFC", { ...runProperties, href: media.get(embed), widthPx: widthPx || undefined, heightPx: heightPx || undefined });
      else if (embed) warnings.push({ code: "image-missing", message: "Một hình ảnh trong tài liệu không thể khôi phục.", detail: embed });
    }
  }
  if (!runs.length) runs.push({ text: "" });
  return { type: "paragraph", ...properties, runs };
}

/**
 * A drawing is represented as a block in our model.  Keeping it out of a
 * paragraph prevents the writer from silently dropping imported images and
 * also gives page-break runs a deterministic block representation.
 */
function blocksForParagraph(paragraph: DocxParagraph): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  let runs: DocxRun[] = [];
  const pushParagraph = () => {
    if (runs.length) blocks.push({ ...paragraph, runs });
    runs = [];
  };
  for (const run of paragraph.runs) {
    if (run.text === "\uFFFC" && run.href?.startsWith("data:")) {
      pushParagraph();
      blocks.push({ type: "image", src: run.href, widthPx: run.widthPx, heightPx: run.heightPx, align: paragraph.align });
      continue;
    }
    if (run.text.includes("\f")) {
      const parts = run.text.split("\f");
      parts.forEach((part, index) => {
        if (part) runs.push({ ...run, text: part });
        if (index < parts.length - 1) {
          pushParagraph();
          blocks.push({ type: "pageBreak" });
        }
      });
      continue;
    }
    runs.push(run);
  }
  pushParagraph();
  if (!blocks.length) blocks.push(paragraph);
  return blocks;
}

function readTable(table: Element, styles: Map<string, string>, numbering: Map<string, DocxListKind>, relationships: Map<string, { target: string; type: string }>, media: Map<string, string>, warnings: DocxCompatibilityWarning[]): DocxTable {
  const rows = Array.from(table.children).filter(child => child.localName === "tr" || child.tagName === "w:tr").map(row => {
    const rowProperties = directChild(row, "trPr");
    const cells = Array.from(row.children).filter(child => child.localName === "tc" || child.tagName === "w:tc").map(cell => {
      const properties = directChild(cell, "tcPr");
      const gridSpan = safeNumber(attr(directChild(properties ?? cell, "gridSpan"), "val"));
      const vMerge = directChild(properties ?? cell, "vMerge");
      const shading = attr(directChild(properties ?? cell, "shd"), "fill");
      const blocks: DocxBlock[] = [];
      for (const child of Array.from(cell.children)) {
        if (child.localName === "p" || child.tagName === "w:p") blocks.push(...blocksForParagraph(readParagraph(child, styles, numbering, relationships, media, warnings)));
        else if (child.localName === "tbl" || child.tagName === "w:tbl") blocks.push(readTable(child, styles, numbering, relationships, media, warnings));
      }
      const fallback: DocxParagraph = { type: "paragraph", style: "Normal", runs: [{ text: "" }] };
      const mergeValue = attr(vMerge, "val");
      if (vMerge && mergeValue !== "restart") warnings.push({ code: "table-row-merge", message: "Một ô gộp dọc của bảng cần kiểm tra lại sau khi nhập.", detail: mergeValue || "continue" });
      return { blocks: blocks.length ? blocks : [fallback], colSpan: gridSpan > 1 ? gridSpan : undefined, rowSpan: vMerge && mergeValue === "restart" ? 2 : undefined, background: shading ? `#${shading}` : undefined };
    });
    return { cells, header: Boolean(directChild(rowProperties ?? row, "tblHeader")) };
  });
  return { type: "table", rows, borderColor: "#9aa4b2" };
}

function parseRelationships(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const map = new Map<string, { target: string; type: string }>();
  for (const relation of Array.from(document.getElementsByTagNameNS(PKG_REL_NS, "Relationship"))) {
    map.set(relation.getAttribute("Id") ?? "", { target: relation.getAttribute("Target") ?? "", type: relation.getAttribute("Type") ?? "" });
  }
  return map;
}

function parseNumbering(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const abstractKinds = new Map<string, DocxListKind>();
  for (const abstract of qs(document, "abstractNum")) {
    const format = attr(q(abstract, "numFmt"), "val");
    abstractKinds.set(attr(abstract, "abstractNumId"), format === "decimal" || format === "lowerLetter" || format === "upperLetter" ? "number" : "bullet");
  }
  const result = new Map<string, DocxListKind>();
  for (const numbering of qs(document, "num")) result.set(attr(numbering, "numId"), abstractKinds.get(attr(q(numbering, "abstractNumId"), "val")) ?? "bullet");
  return result;
}

function parsePageSettings(document: Document): DocxPageSettings {
  const section = qs(document, "sectPr").at(-1);
  const size = directChild(section ?? document.documentElement, "pgSz");
  const margin = directChild(section ?? document.documentElement, "pgMar");
  const width = safeNumber(attr(size, "w"), 11906);
  const height = safeNumber(attr(size, "h"), 16838);
  const orientation: DocxOrientation = attr(size, "orient") === "landscape" || width > height ? "landscape" : "portrait";
  const sizeName: DocxPageSize = Math.min(width, height) >= 12100 ? "Letter" : "A4";
  return {
    size: sizeName,
    orientation,
    margins: {
      top: safeNumber(attr(margin, "top"), 1134) / 1440 * 2.54,
      right: safeNumber(attr(margin, "right"), 1134) / 1440 * 2.54,
      bottom: safeNumber(attr(margin, "bottom"), 1134) / 1440 * 2.54,
      left: safeNumber(attr(margin, "left"), 1134) / 1440 * 2.54,
    },
    headerDistance: safeNumber(attr(margin, "header"), 709) / 1440 * 2.54,
    footerDistance: safeNumber(attr(margin, "footer"), 709) / 1440 * 2.54,
  };
}

function paragraphFromHtml(element: Element, list?: { kind: DocxListKind; level: number }): DocxParagraph {
  const tag = element.tagName.toLowerCase();
  const style: DocxParagraphStyle = /^h[1-6]$/.test(tag) ? `Heading${tag.slice(1) as "1" | "2" | "3" | "4" | "5" | "6"}` : tag === "title" ? "Title" : tag === "blockquote" ? "Quote" : "Normal";
  const styleValue = element.getAttribute("data-docx-style");
  const paragraphStyle = styleValue && /^(Normal|Title|Subtitle|Quote|Heading[1-6])$/.test(styleValue) ? styleValue as DocxParagraphStyle : style;
  const computed = element.getAttribute("style") ?? "";
  const align = computed.match(/text-align\s*:\s*(left|center|right|justify)/i)?.[1]?.toLowerCase() as DocxAlignment | undefined;
  const runs: DocxRun[] = [];
  const visit = (node: Node, marks: Omit<DocxRun, "text"> = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (!text) return;
      const previous = runs[runs.length - 1];
      if (previous && JSON.stringify({ ...previous, text: undefined }) === JSON.stringify(marks)) previous.text += text;
      else runs.push({ text, ...marks });
      return;
    }
    if (!(node instanceof Element)) return;
    const name = node.tagName.toLowerCase();
    const styleText = node.getAttribute("style") ?? "";
    const color = styleText.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1];
    const background = styleText.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i)?.[1];
    const fontSize = styleText.match(/font-size\s*:\s*([\d.]+)\s*(?:pt|px)?/i)?.[1];
    const fontFamily = styleText.match(/font-family\s*:\s*([^;]+)/i)?.[1]?.replace(/["']/g, "").trim();
    const next = {
      ...marks,
      bold: Boolean(marks.bold || name === "strong" || name === "b"),
      italic: Boolean(marks.italic || name === "em" || name === "i"),
      underline: Boolean(marks.underline || name === "u"),
      strike: Boolean(marks.strike || name === "s" || name === "del"),
      superscript: Boolean(marks.superscript || name === "sup"),
      subscript: Boolean(marks.subscript || name === "sub"),
      color: colorValue(color ?? "") ? `#${colorValue(color ?? "")}` : marks.color,
      highlight: colorValue(background ?? "") ? `#${colorValue(background ?? "")}` : marks.highlight,
      fontSize: fontSize ? Number(fontSize) * (styleText.includes("px") ? 0.75 : 1) : marks.fontSize,
      fontFamily: fontFamily || marks.fontFamily,
      href: name === "a" ? node.getAttribute("href") ?? undefined : marks.href,
    };
    if (name === "br") runs.push({ text: "\n", ...marks });
    else for (const child of Array.from(node.childNodes)) visit(child, next);
  };
  visit(element);
  return { type: "paragraph", style: paragraphStyle, align, runs: runs.length ? runs : [{ text: "" }], list };
}

function htmlBlocks(root: Element): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  const appendChildren = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      const tag = child.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag) || ["p", "blockquote", "title"].includes(tag)) blocks.push(paragraphFromHtml(child));
      else if (tag === "ul" || tag === "ol") {
        const kind: DocxListKind = tag === "ol" ? "number" : "bullet";
        for (const item of Array.from(child.children).filter(node => node.tagName.toLowerCase() === "li")) blocks.push(paragraphFromHtml(item, { kind, level: 0 }));
      } else if (tag === "table") blocks.push(htmlTable(child));
      else if (tag === "img" || tag === "figure") {
        const image = tag === "img" ? child : child.querySelector("img");
        if (image) blocks.push({
          type: "image",
          src: image.getAttribute("src") ?? "",
          alt: image.getAttribute("alt") ?? undefined,
          widthPx: safeNumber(image.getAttribute("width") ?? "") || undefined,
          heightPx: safeNumber(image.getAttribute("height") ?? "") || undefined,
          align: (image.parentElement?.getAttribute("style")?.match(/text-align\s*:\s*(left|center|right)/i)?.[1] as DocxAlignment | undefined),
        });
      }
      else if (tag === "div" && child.hasAttribute("data-page-break")) blocks.push({ type: "pageBreak" });
      else if (tag === "div") appendChildren(child);
    }
  };
  appendChildren(root);
  if (!blocks.length && root.textContent?.trim()) blocks.push(paragraphFromHtml(root));
  return blocks.length ? blocks : [{ type: "paragraph", style: "Normal", runs: [{ text: "" }] }];
}

function htmlTable(element: Element): DocxTable {
  const rows: DocxTable["rows"] = Array.from(element.querySelectorAll(":scope > tbody > tr, :scope > tr")).map(row => ({
    cells: Array.from(row.children).filter(cell => ["td", "th"].includes(cell.tagName.toLowerCase())).map(cell => ({
      blocks: htmlBlocks(cell),
      colSpan: Number(cell.getAttribute("colspan") || 1) > 1 ? Number(cell.getAttribute("colspan")) : undefined,
      rowSpan: Number(cell.getAttribute("rowspan") || 1) > 1 ? Number(cell.getAttribute("rowspan")) : undefined,
      verticalAlign: (cell.getAttribute("valign") as DocxTableCell["verticalAlign"]) || undefined,
      background: (() => { const value = cell.getAttribute("bgcolor") || cell.getAttribute("style")?.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1] || ""; return colorValue(value) ? `#${colorValue(value)}` : undefined; })(),
    })),
    header: row.querySelector("th") !== null,
  }));
  return { type: "table", rows, borderColor: "#9aa4b2" };
}

export function modelFromHtml(html: string): DocxDocument {
  const root = new DOMParser().parseFromString(html || "<p></p>", "text/html").body;
  return { schemaVersion: 1, blocks: htmlBlocks(root), page: structuredClone(DEFAULT_PAGE), warnings: [] };
}

function styleToHtml(style: DocxParagraphStyle) {
  if (style === "Title") return "h1";
  if (style === "Subtitle") return "h2";
  if (style === "Quote") return "blockquote";
  const heading = style.match(/^Heading([1-6])$/);
  return heading ? `h${heading[1]}` : "p";
}

function runToHtml(run: DocxRun) {
  if (run.text === "\uFFFC" && run.href?.startsWith("data:")) return `<img data-docx-image="true" src="${escapeXml(run.href)}" alt=""/>`;
  let value = escapeXml(run.text).replace(/\n/g, "<br/>").replace(/\t/g, "&emsp;");
  if (run.href) value = `<a href="${escapeXml(run.href)}" data-docx-link="true">${value}</a>`;
  if (run.subscript) value = `<sub>${value}</sub>`;
  if (run.superscript) value = `<sup>${value}</sup>`;
  if (run.bold) value = `<strong>${value}</strong>`;
  if (run.italic) value = `<em>${value}</em>`;
  if (run.underline) value = `<u>${value}</u>`;
  if (run.strike) value = `<s>${value}</s>`;
  const styles = [run.fontFamily ? `font-family:${escapeXml(run.fontFamily)}` : "", run.fontSize ? `font-size:${run.fontSize}pt` : "", run.color ? `color:${escapeXml(run.color)}` : "", run.highlight ? `background-color:${escapeXml(run.highlight)}` : ""].filter(Boolean);
  return styles.length ? `<span style="${styles.join(";")}">${value}</span>` : value;
}

export function modelToHtml(model: DocxDocument): string {
  const renderBlocks = (blocks: DocxBlock[]): string => blocks.map(block => {
    if (block.type === "pageBreak") return `<div data-page-break="true" class="docx-page-break" contenteditable="false"><span>Ngắt trang</span></div>`;
    if (block.type === "image") return `<figure data-docx-image-block="true"${block.align ? ` style="text-align:${block.align}"` : ""}><img data-docx-image="true" src="${escapeXml(block.src)}" alt="${escapeXml(block.alt ?? "")}"${block.widthPx ? ` width="${block.widthPx}"` : ""}${block.heightPx ? ` height="${block.heightPx}"` : ""}/></figure>`;
    if (block.type === "table") {
      return `<table data-docx-table="true"><tbody>${block.rows.map(row => `<tr>${row.cells.map(cell => `<${row.header ? "th" : "td"}${cell.colSpan ? ` colspan="${cell.colSpan}"` : ""}${cell.rowSpan ? ` rowspan="${cell.rowSpan}"` : ""}${cell.background ? ` style="background-color:${escapeXml(cell.background)}"` : ""}>${renderBlocks(cell.blocks)}</${row.header ? "th" : "td"}>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    const tag = styleToHtml(block.style);
    const style = [block.align ? `text-align:${block.align}` : "", block.before ? `margin-top:${block.before}pt` : "", block.after ? `margin-bottom:${block.after}pt` : "", block.lineSpacing ? `line-height:${block.lineSpacing}` : "", block.indentLeft ? `margin-left:${block.indentLeft}cm` : "", block.firstLine ? `text-indent:${block.firstLine}cm` : "", block.hanging ? `margin-left:${block.hanging}cm;text-indent:-${block.hanging}cm` : ""].filter(Boolean).join(";");
    const content = block.runs.map(runToHtml).join("") || "<br/>";
    const paragraph = `<${tag} data-docx-style="${block.style}"${style ? ` style="${style}"` : ""}>${content}</${tag}>`;
    if (!block.list) return paragraph;
    return `<${block.list.kind === "number" ? "ol" : "ul"} data-docx-list-level="${block.list.level}">${paragraph.replace(/^<\w+ /, "<li ").replace(/<\/\w+>$/, "</li>")}</${block.list.kind === "number" ? "ol" : "ul"}>`;
  }).join("");
  return renderBlocks(model.blocks);
}

function parseBlockContainer(container: Element, styles: Map<string, string>, numbering: Map<string, DocxListKind>, relationships: Map<string, { target: string; type: string }>, media: Map<string, string>, warnings: DocxCompatibilityWarning[]) {
  const blocks: DocxBlock[] = [];
  for (const child of Array.from(container.children)) {
    if (child.localName === "p" || child.tagName === "w:p") blocks.push(...blocksForParagraph(readParagraph(child, styles, numbering, relationships, media, warnings)));
    else if (child.localName === "tbl" || child.tagName === "w:tbl") blocks.push(readTable(child, styles, numbering, relationships, media, warnings));
    else if (["sdt", "customXml", "altChunk", "proofErr", "oMath", "oMathPara"].includes(child.localName || child.tagName.replace(/^w:/, ""))) warnings.push({ code: child.localName?.startsWith("oMath") ? "omml-unsupported" : "unsupported-block", message: child.localName?.startsWith("oMath") ? "Phương trình OOXML nâng cao chưa được biên tập; nội dung này cần xử lý riêng." : "Một thành phần OOXML nâng cao chưa được hỗ trợ.", detail: child.localName || child.tagName });
  }
  return blocks;
}

function parseDocumentXml(documentXml: string, stylesXml: string, numberingXml: string, relationships: Map<string, { target: string; type: string }>, media: Map<string, string>): { blocks: DocxBlock[]; page: DocxPageSettings; warnings: DocxCompatibilityWarning[] } {
  const document = new DOMParser().parseFromString(documentXml, "application/xml");
  const styles = styleMapFromXml(new DOMParser().parseFromString(stylesXml, "application/xml"));
  const numbering = parseNumbering(numberingXml);
  const warnings: DocxCompatibilityWarning[] = [];
  const body = q(document, "body");
  if (!body) throw new Error("DOCX không có word/document.xml hợp lệ.");
  const blocks = parseBlockContainer(body, styles, numbering, relationships, media, warnings);
  const fallback: DocxParagraph = { type: "paragraph", style: "Normal", runs: [{ text: "" }] };
  return { blocks: blocks.length ? blocks : [fallback], page: parsePageSettings(document), warnings };
}

export async function importDocx(bytes: Uint8Array): Promise<DocxDocument> {
  if (!bytes.byteLength) throw new Error("File DOCX rỗng.");
  if (bytes.byteLength > 40 * 1024 * 1024) throw new Error("File DOCX vượt quá giới hạn 40 MB.");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("File không phải archive DOCX hợp lệ.");
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); }
  catch { throw new Error("File không phải archive DOCX hợp lệ hoặc đã bị hỏng."); }
  const documentEntry = zip.file("word/document.xml");
  if (!documentEntry) throw new Error("File không có word/document.xml; đây không phải DOCX hợp lệ.");
  const documentXml = await documentEntry.async("text");
  const stylesXml = await zip.file("word/styles.xml")?.async("text") ?? "<w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"/>";
  const numberingXml = await zip.file("word/numbering.xml")?.async("text") ?? "<w:numbering xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"/>";
  const rels = parseRelationships(await zip.file("word/_rels/document.xml.rels")?.async("text") ?? "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>");
  const media = new Map<string, string>();
  for (const [id, relationship] of rels) {
    if (relationship.type !== IMAGE_REL_TYPE) continue;
    const target = relationship.target.replace(/^\//, "").startsWith("word/") ? relationship.target.replace(/^\//, "") : `word/${relationship.target.replace(/^\//, "")}`;
    const file = zip.file(target);
    if (!file) continue;
    const bytesForImage = await file.async("uint8array");
    const extension = target.split(".").pop()?.toLowerCase() ?? "png";
    const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "gif" ? "image/gif" : extension === "svg" ? "image/svg+xml" : "image/png";
    media.set(id, bytesToDataUrl(mime, bytesForImage));
  }
  const parsed = parseDocumentXml(documentXml, stylesXml, numberingXml, rels, media);
  if (rels.size === 0) parsed.warnings.push({ code: "relationships-missing", message: "DOCX không có relationships đầy đủ; một số liên kết hoặc ảnh có thể không giữ được." });
  const styles = styleMapFromXml(new DOMParser().parseFromString(stylesXml, "application/xml"));
  const numbering = parseNumbering(numberingXml);
  let header: DocxBlock[] | undefined;
  let footer: DocxBlock[] | undefined;
  for (const relationship of rels.values()) {
    if (!relationship.type.endsWith("/header") && !relationship.type.endsWith("/footer")) continue;
    const target = relationship.target.replace(/^\//, "").startsWith("word/") ? relationship.target.replace(/^\//, "") : `word/${relationship.target.replace(/^\//, "")}`;
    const part = await zip.file(target)?.async("text");
    if (!part) {
      parsed.warnings.push({ code: "header-footer-missing", message: "Không thể đọc phần đầu/cuối trang của DOCX.", detail: target });
      continue;
    }
    const partDocument = new DOMParser().parseFromString(part, "application/xml");
    const container = relationship.type.endsWith("/header") ? q(partDocument, "hdr") : q(partDocument, "ftr");
    if (!container) {
      parsed.warnings.push({ code: "header-footer-invalid", message: "Phần đầu/cuối trang không có cấu trúc OOXML hợp lệ.", detail: target });
      continue;
    }
    const blocks = parseBlockContainer(container, styles, numbering, rels, media, parsed.warnings);
    if (relationship.type.endsWith("/header")) header = blocks;
    else footer = blocks;
  }
  return { schemaVersion: 1, ...parsed, header, footer, originalFormat: "docx" };
}

function runPropertiesXml(run: DocxRun) {
  return [run.bold ? "<w:b/>" : "", run.italic ? "<w:i/>" : "", run.underline ? "<w:u w:val=\"single\"/>" : "", run.strike ? "<w:strike/>" : "", run.superscript ? "<w:vertAlign w:val=\"superscript\"/>" : "", run.subscript ? "<w:vertAlign w:val=\"subscript\"/>" : "", run.fontFamily ? `<w:rFonts w:ascii=\"${escapeXml(run.fontFamily)}\" w:hAnsi=\"${escapeXml(run.fontFamily)}\"/>` : "", run.fontSize ? `<w:sz w:val=\"${Math.round(run.fontSize * 2)}\"/><w:szCs w:val=\"${Math.round(run.fontSize * 2)}\"/>` : "", run.color ? `<w:color w:val=\"${colorValue(run.color)}\"/>` : "", run.highlight ? `<w:shd w:fill=\"${colorValue(run.highlight)}\"/>` : ""].filter(Boolean).join("");
}

function runXml(run: DocxRun) {
  if (run.text === "\uFFFC" && run.href?.startsWith("data:")) return "";
  const properties = runPropertiesXml(run);
  const content = run.text.split(/(\n|\t)/).map(part => part === "\n" ? "<w:br/>" : part === "\t" ? "<w:tab/>" : `<w:t xml:space=\"preserve\">${escapeXml(part)}</w:t>`).join("") || "<w:t xml:space=\"preserve\"></w:t>";
  return `<w:r><w:rPr>${properties}</w:rPr>${content}</w:r>`;
}

function paragraphXml(paragraph: DocxParagraph, numbering: { bulletId: number; numberId: number }, hyperlinkIds: Map<string, string> = new Map()) {
  const pProperties = [
    paragraph.style !== "Normal" ? `<w:pStyle w:val="${paragraph.style === "Title" ? "Title" : paragraph.style === "Subtitle" ? "Subtitle" : paragraph.style === "Quote" ? "Quote" : paragraph.style}"/>` : "",
    paragraph.align ? `<w:jc w:val="${paragraph.align === "justify" ? "both" : paragraph.align}"/>` : "",
    paragraph.before || paragraph.after || paragraph.lineSpacing ? `<w:spacing${paragraph.before ? ` w:before="${Math.round(paragraph.before * 20)}"` : ""}${paragraph.after ? ` w:after="${Math.round(paragraph.after * 20)}"` : ""}${paragraph.lineSpacing ? ` w:line="${Math.round(paragraph.lineSpacing * 240)}" w:lineRule="auto"` : ""}/>` : "",
    paragraph.indentLeft || paragraph.firstLine || paragraph.hanging ? `<w:ind${paragraph.indentLeft ? ` w:left="${Math.round(paragraph.indentLeft / 2.54 * 1440)}"` : ""}${paragraph.firstLine ? ` w:firstLine="${Math.round(paragraph.firstLine / 2.54 * 1440)}"` : ""}${paragraph.hanging ? ` w:hanging="${Math.round(paragraph.hanging / 2.54 * 1440)}"` : ""}/>` : "",
    paragraph.list ? `<w:numPr><w:ilvl w:val="${paragraph.list.level}"/><w:numId w:val="${paragraph.list.kind === "number" ? numbering.numberId : numbering.bulletId}"/></w:numPr>` : "",
    paragraph.pageBreakBefore ? "<w:pageBreakBefore/>" : "",
  ].filter(Boolean).join("");
  const runs = paragraph.runs.map(run => {
    const serialized = runXml(run);
    if (!serialized) return "";
    const relationshipId = safeExternalHref(run.href) ? hyperlinkIds.get(safeExternalHref(run.href)!) : undefined;
    return relationshipId ? `<w:hyperlink r:id=\"${relationshipId}\" w:history=\"1\">${serialized}</w:hyperlink>` : serialized;
    /*
    if (run.text === "\uFFFC" && run.href?.startsWith("data:")) return "";
    const rProperties = [run.bold ? "<w:b/>" : "", run.italic ? "<w:i/>" : "", run.underline ? "<w:u w:val=\"single\"/>" : "", run.strike ? "<w:strike/>" : "", run.superscript ? "<w:vertAlign w:val=\"superscript\"/>" : "", run.subscript ? "<w:vertAlign w:val=\"subscript\"/>" : "", run.fontFamily ? `<w:rFonts w:ascii="${escapeXml(run.fontFamily)}" w:hAnsi="${escapeXml(run.fontFamily)}"/>` : "", run.fontSize ? `<w:sz w:val="${Math.round(run.fontSize * 2)}"/><w:szCs w:val="${Math.round(run.fontSize * 2)}"/>` : "", run.color ? `<w:color w:val="${colorValue(run.color)}"/>` : "", run.highlight ? `<w:shd w:fill="${colorValue(run.highlight)}"/>` : ""].filter(Boolean).join("");
    const text = escapeXml(run.text).replace(/\n/g, "</w:t></w:r><w:r><w:rPr>${rProperties}</w:rPr><w:br/><w:t xml:space=\"preserve\">");
    return `<w:r><w:rPr>${rProperties}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
    */
  }).join("");
  return `<w:p><w:pPr>${pProperties}</w:pPr>${runs || "<w:r><w:t xml:space=\"preserve\"></w:t></w:r>"}</w:p>`;
}

function tableXml(table: DocxTable, numbering: { bulletId: number; numberId: number }, hyperlinkIds: Map<string, string> = new Map()): string {
  const rows: string = table.rows.map(row => `<w:tr>${row.header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${row.cells.map(cell => `<w:tc><w:tcPr>${cell.colSpan && cell.colSpan > 1 ? `<w:gridSpan w:val="${cell.colSpan}"/>` : ""}${cell.rowSpan && cell.rowSpan > 1 ? `<w:vMerge w:val="restart"/>` : ""}${cell.verticalAlign ? `<w:vAlign w:val="${cell.verticalAlign}"/>` : ""}${cell.background ? `<w:shd w:fill="${colorValue(cell.background)}"/>` : ""}</w:tcPr>${cell.blocks.map(block => block.type === "paragraph" ? paragraphXml(block, numbering, hyperlinkIds) : block.type === "table" ? tableXml(block, numbering, hyperlinkIds) : "").join("")}</w:tc>`).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="${colorValue(table.borderColor ?? "#9aa4b2")}"/><w:left w:val="single" w:sz="4" w:color="${colorValue(table.borderColor ?? "#9aa4b2")}"/><w:bottom w:val="single" w:sz="4" w:color="${colorValue(table.borderColor ?? "#9aa4b2")}"/><w:right w:val="single" w:sz="4" w:color="${colorValue(table.borderColor ?? "#9aa4b2")}"/><w:insideH w:val="single" w:sz="4" w:color="${colorValue(table.borderColor ?? "#9aa4b2")}"/><w:insideV w:val="single" w:sz="4" w:color="${colorValue(table.borderColor ?? "#9aa4b2")}"/></w:tblBorders></w:tblPr>${rows}</w:tbl>`;
}

function contentTypesXml(images: Array<{ path: string; mimeType: string }>, hasHeader: boolean, hasFooter: boolean) {
  const defaults = new Map<string, string>([["rels", "application/vnd.openxmlformats-package.relationships+xml"], ["xml", "application/xml"], ["png", "image/png"], ["jpeg", "image/jpeg"], ["jpg", "image/jpeg"], ["gif", "image/gif"], ["svg", "image/svg+xml"]]);
  images.forEach(image => {
    const extension = image.path.split(".").pop() ?? "bin";
    if (!defaults.has(extension)) defaults.set(extension, image.mimeType);
  });
  const overrides = ["<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>", "<Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>", "<Override PartName=\"/word/numbering.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml\"/>", hasHeader ? "<Override PartName=\"/word/header1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml\"/>" : "", hasFooter ? "<Override PartName=\"/word/footer1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml\"/>" : ""].concat(images.map(image => `<Default Extension="${image.path.split(".").pop()}" ContentType="${image.mimeType}"/>`));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${Array.from(defaults, ([extension, mimeType]) => `<Default Extension="${extension}" ContentType="${mimeType}"/>`).join("")}${overrides.join("")}</Types>`;
}

function stylesXml() {
  const style = (id: string, name: string, size: number, bold = false, italic = false) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:qFormat/>${bold ? "<w:rPr><w:b/>" : "<w:rPr>"}${italic ? "<w:i/>" : ""}<w:sz w:val="${size}"/></w:rPr></w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${WORD_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>${style("Title", "Title", 52, true)}${style("Subtitle", "Subtitle", 28, false, true)}${style("Quote", "Quote", 22, false, true)}${style("Heading1", "heading 1", 36, true)}${style("Heading2", "heading 2", 30, true)}${style("Heading3", "heading 3", 26, true)}${style("Heading4", "heading 4", 24, true)}${style("Heading5", "heading 5", 22, true)}${style("Heading6", "heading 6", 20, true)}</w:styles>`;
}

function numberingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${WORD_NS}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/>${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(level => `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + level * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join("")}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/>${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(level => `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${level + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + level * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join("")}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
}

function normalizeModel(input: DocxDocument | string) {
  if (typeof input === "string") return modelFromHtml(input);
  return input;
}

export async function buildDocxPackage(input: DocxDocument | string) {
  const model = normalizeModel(input);
  const zip = new JSZip();
  const images: Array<{ path: string; mimeType: string; relationshipId: string }> = [];
  const imageBySrc = new Map<string, { path: string; mimeType: string; relationshipId: string }>();
  const hyperlinkUrls = new Set<string>();
  const collectImages = (blocks: DocxBlock[]) => {
    for (const block of blocks) {
      if (block.type === "paragraph") block.runs.forEach(run => { const href = safeExternalHref(run.href); if (href) hyperlinkUrls.add(href); });
      if (block.type === "image") {
        const found = dataUrlBytes(block.src);
        if (!found.bytes.length) continue;
        if (!imageBySrc.has(block.src)) {
          const extension = found.mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
          const item = { path: `word/media/image${images.length + 1}.${extension}`, mimeType: found.mimeType, relationshipId: `rId${images.length + 4}` };
          imageBySrc.set(block.src, item); images.push(item); zip.file(item.path, found.bytes);
        }
      }
      if (block.type === "table") block.rows.forEach(row => row.cells.forEach(cell => collectImages(cell.blocks)));
    }
  };
  collectImages(model.blocks);
  const hyperlinkIds = new Map(Array.from(hyperlinkUrls, (href, index) => [href, `rId${images.length + 4 + index}`]));
  const numbering = { bulletId: 1, numberId: 2 };
  const renderBlockXml = (block: DocxBlock): string => {
    if (block.type === "paragraph") return paragraphXml(block, numbering, hyperlinkIds);
    if (block.type === "table") return tableXml(block, numbering, hyperlinkIds);
    if (block.type === "pageBreak") return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
    const item = imageBySrc.get(block.src);
    if (!item) return `<w:p/>`;
    const found = dataUrlBytes(block.src);
    const cx = Math.round((block.widthPx ?? 640) * 9525);
    const cy = Math.round((block.heightPx ?? 420) * 9525);
    const imageAlignment = block.align ? `<w:pPr><w:jc w:val="${block.align === "justify" ? "both" : block.align}"/></w:pPr>` : "";
    const imageXml = `<w:p>${imageAlignment}<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${images.indexOf(item) + 1}" name="${escapeXml(block.alt || "Image")}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${images.indexOf(item) + 1}" name="${escapeXml(block.alt || "Image")}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${item.relationshipId}" xmlns:r="${REL_NS}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    void found;
    return imageXml;
  };
  const firstExtraRelationshipId = images.length + 4 + hyperlinkUrls.size;
  const headerRelationshipId = model.header?.length ? `rId${firstExtraRelationshipId}` : undefined;
  const footerRelationshipId = model.footer?.length ? `rId${firstExtraRelationshipId + (headerRelationshipId ? 1 : 0)}` : undefined;
  const renderHeaderFooterBlock = (block: DocxBlock) => block.type === "paragraph"
    ? paragraphXml(block, numbering)
    : block.type === "table"
      ? tableXml(block, numbering)
      : block.type === "pageBreak"
        ? `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`
        : "";
  const headerXml = model.header?.length ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${WORD_NS}">${model.header.map(renderHeaderFooterBlock).join("")}</w:hdr>` : "";
  const footerXml = model.footer?.length ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="${WORD_NS}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>${model.footer.map(renderHeaderFooterBlock).join("")}</w:ftr>` : "";
  const section = model.page;
  const size = section.size === "Letter" ? { width: 12240, height: 15840 } : { width: 11906, height: 16838 };
  const pageWidth = section.orientation === "landscape" ? size.height : size.width;
  const pageHeight = section.orientation === "landscape" ? size.width : size.height;
  const margins = section.margins;
  const sectionReferences = `${headerRelationshipId ? `<w:headerReference w:type="default" r:id="${headerRelationshipId}"/>` : ""}${footerRelationshipId ? `<w:footerReference w:type="default" r:id="${footerRelationshipId}"/>` : ""}`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}"><w:body>${model.blocks.map(renderBlockXml).join("")}<w:sectPr>${sectionReferences}<w:pgSz w:w="${pageWidth}" w:h="${pageHeight}" w:orient="${section.orientation}"/><w:pgMar w:top="${Math.round(margins.top / 2.54 * 1440)}" w:right="${Math.round(margins.right / 2.54 * 1440)}" w:bottom="${Math.round(margins.bottom / 2.54 * 1440)}" w:left="${Math.round(margins.left / 2.54 * 1440)}" w:header="${Math.round((section.headerDistance ?? 1.25) / 2.54 * 1440)}" w:footer="${Math.round((section.footerDistance ?? 1.25) / 2.54 * 1440)}"/></w:sectPr></w:body></w:document>`;
  const relations = [`<Relationship Id="rId1" Type="${DOC_REL_TYPE}" Target="word/document.xml"/>`, `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="word/styles.xml"/>`, `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="word/numbering.xml"/>`, ...images.map(image => `<Relationship Id="${image.relationshipId}" Type="${IMAGE_REL_TYPE}" Target="media/${image.path.split("/").pop()}"/>`), ...Array.from(hyperlinkIds, ([href, id]) => `<Relationship Id="${id}" Type="${HYPERLINK_REL_TYPE}" Target="${escapeXml(href)}" TargetMode="External"/>`), ...(headerRelationshipId ? [`<Relationship Id="${headerRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`] : []), ...(footerRelationshipId ? [`<Relationship Id="${footerRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`] : [])].join("");
  zip.file("[Content_Types].xml", contentTypesXml(images, Boolean(model.header?.length), Boolean(model.footer?.length)));
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${DOC_REL_TYPE}" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}">${relations}</Relationships>`);
  zip.file("word/styles.xml", stylesXml());
  zip.file("word/numbering.xml", numberingXml());
  zip.file("word/document.xml", documentXml);
  if (headerXml) zip.file("word/header1.xml", headerXml);
  if (footerXml) zip.file("word/footer1.xml", footerXml);
  return zip.generateAsync({ type: "base64", compression: "DEFLATE" });
}
