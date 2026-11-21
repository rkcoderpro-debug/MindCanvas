type ImageAsset = { id: string; fileName: string; contentType: string; data: Uint8Array };
type ExternalLink = { id: string; target: string };
type ExportContext = { images: ImageAsset[]; links: ExternalLink[] };

function escapeXml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" }[character] ?? character));
}

function decodeBasicEntities(value: string) {
  return value.replace(/&(?:amp|#38);/gi, "&").replace(/&(?:lt|#60);/gi, "<").replace(/&(?:gt|#62);/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function ooxmlColor(value: string | null) {
  if (!value) return "";
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) return hex[1].length === 3 ? hex[1].split("").map(part => part + part).join("").toUpperCase() : hex[1].toUpperCase();
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map(part => Number(part).toString(16).padStart(2, "0")).join("").toUpperCase();
  return ({ yellow: "FFFF00", khaki: "F0E68C", lightyellow: "FFFFE0", white: "FFFFFF", black: "000000" } as Record<string, string>)[value.trim().toLocaleLowerCase()] ?? "";
}

function styleValue(element: Element, name: string) {
  const style = element.getAttribute("style") ?? "";
  return style.match(new RegExp(`${name}\\s*:\\s*([^;]+)`, "i"))?.[1]?.trim() ?? "";
}

function ooxmlHalfPoints(element: Element) {
  const size = styleValue(element, "font-size").match(/^([\d.]+)\s*(px|pt)?$/i);
  if (size) return Math.max(8, Math.min(160, Math.round(Number(size[1]) * (size[2]?.toLocaleLowerCase() === "px" ? 1.5 : 2))));
  const legacy = element.tagName.toLowerCase() === "font" ? Number(element.getAttribute("size")) : 0;
  return legacy ? ({ 1: 16, 2: 20, 3: 24, 4: 28, 5: 36, 6: 48, 7: 72 } as Record<number, number>)[legacy] ?? 24 : 0;
}

function imageAsset(source: string, context: ExportContext) {
  const match = source.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) return null;
  const contentType = match[1].toLocaleLowerCase();
  if (!["image/png", "image/jpeg", "image/gif"].includes(contentType)) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const id = `rIdImage${context.images.length + 1}`;
  const extension = contentType === "image/jpeg" ? "jpg" : contentType.slice("image/".length);
  const asset = { id, fileName: `image${context.images.length + 1}.${extension}`, contentType, data: bytes };
  context.images.push(asset);
  return asset;
}

function externalLink(href: string, context: ExportContext) {
  if (!/^https?:\/\//i.test(href)) return null;
  const existing = context.links.find(link => link.target === href);
  if (existing) return existing;
  const link = { id: `rIdLink${context.links.length + 1}`, target: href };
  context.links.push(link);
  return link;
}

function drawingXml(asset: ImageAsset, element: Element) {
  const width = Math.max(80, Math.min(680, Number.parseFloat(element.getAttribute("width") ?? "0") || 420));
  const height = Math.max(60, Math.min(900, Number.parseFloat(element.getAttribute("height") ?? "0") || width * 0.62));
  const cx = Math.round(width * 9525), cy = Math.round(height * 9525);
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${asset.id.replace(/\D/g, "") || "1"}" name="${escapeXml(asset.fileName)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${escapeXml(asset.fileName)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${asset.id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

type Marks = { bold: boolean; italic: boolean; underline: boolean; strike: boolean; highlight: string; color: string; fontSize: number; fontFamily: string; verticalAlign: string };
const emptyMarks = (): Marks => ({ bold: false, italic: false, underline: false, strike: false, highlight: "", color: "", fontSize: 0, fontFamily: "", verticalAlign: "" });

function inlineRuns(node: Node, marks: Marks, context: ExportContext): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = escapeXml(node.textContent ?? "");
    if (!value) return "";
    const properties = `${marks.bold ? "<w:b/>" : ""}${marks.italic ? "<w:i/>" : ""}${marks.underline ? '<w:u w:val="single"/>' : ""}${marks.strike ? "<w:strike/>" : ""}${marks.highlight ? `<w:shd w:fill="${marks.highlight}"/>` : ""}${marks.color ? `<w:color w:val="${marks.color}"/>` : ""}${marks.fontSize ? `<w:sz w:val="${marks.fontSize}"/><w:szCs w:val="${marks.fontSize}"/>` : ""}${marks.fontFamily ? `<w:rFonts w:ascii="${escapeXml(marks.fontFamily)}" w:hAnsi="${escapeXml(marks.fontFamily)}"/>` : ""}${marks.verticalAlign ? `<w:vertAlign w:val="${marks.verticalAlign}"/>` : ""}`;
    return `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${value}</w:t></w:r>`;
  }
  if (!(node instanceof Element)) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "<w:r><w:br/></w:r>";
  if (tag === "img") {
    const asset = imageAsset(node.getAttribute("src") ?? "", context);
    return asset ? `<w:r>${drawingXml(asset, node)}</w:r>` : "";
  }
  const next = { ...marks };
  next.bold ||= tag === "strong" || tag === "b";
  next.italic ||= tag === "em" || tag === "i";
  next.underline ||= tag === "u" || /text-decoration[^:]*:\s*[^;]*underline/i.test(node.getAttribute("style") ?? "");
  next.strike ||= tag === "s" || tag === "strike" || tag === "del";
  next.highlight ||= ooxmlColor(styleValue(node, "background(?:-color)?") || node.getAttribute("bgcolor"));
  next.color ||= ooxmlColor(styleValue(node, "color") || node.getAttribute("color"));
  next.fontSize ||= ooxmlHalfPoints(node);
  next.fontFamily ||= styleValue(node, "font-family").split(",")[0]?.replace(/["']/g, "").trim() ?? "";
  if (tag === "sub") next.verticalAlign = "subscript";
  if (tag === "sup") next.verticalAlign = "superscript";
  const content = [...node.childNodes].map(child => inlineRuns(child, next, context)).join("");
  if (tag === "a") {
    const link = externalLink(node.getAttribute("href") ?? "", context);
    return link ? `<w:hyperlink r:id="${link.id}">${content}</w:hyperlink>` : content;
  }
  return content;
}

function paragraphProperties(element: Element, styleId = "", list?: { numId: number; level: number }) {
  const properties: string[] = [];
  if (styleId) properties.push(`<w:pStyle w:val="${styleId}"/>`);
  if (list) properties.push(`<w:numPr><w:ilvl w:val="${list.level}"/><w:numId w:val="${list.numId}"/></w:numPr>`);
  const align = styleValue(element, "text-align").toLocaleLowerCase();
  if (["left", "center", "right", "justify"].includes(align)) properties.push(`<w:jc w:val="${align === "justify" ? "both" : align}"/>`);
  const margin = styleValue(element, "margin-left").match(/^([\d.]+)\s*(px|pt)?$/i);
  if (margin) properties.push(`<w:ind w:left="${Math.round(Number(margin[1]) * (margin[2]?.toLocaleLowerCase() === "pt" ? 20 : 15))}"/>`);
  const lineHeight = styleValue(element, "line-height").match(/^([\d.]+)$/);
  if (lineHeight) properties.push(`<w:spacing w:line="${Math.round(Number(lineHeight[1]) * 240)}" w:lineRule="auto"/>`);
  return properties.length ? `<w:pPr>${properties.join("")}</w:pPr>` : "";
}

function paragraphXml(element: Element, context: ExportContext, list?: { numId: number; level: number }) {
  const tag = element.tagName.toLowerCase();
  if (element.getAttribute("data-page-break") === "true") return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  if (tag === "hr") return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="AAB5C5"/></w:pBdr></w:pPr></w:p>';
  const styleId = /^h([1-6])$/.test(tag) ? `Heading${tag.slice(1)}` : "";
  const content = [...element.childNodes].map(child => inlineRuns(child, emptyMarks(), context)).join("") || "<w:r><w:t/></w:r>";
  return `<w:p>${paragraphProperties(element, styleId, list)}${content}</w:p>`;
}

function tableXml(table: Element, context: ExportContext) {
  const rows = [...table.querySelectorAll(":scope > tbody > tr, :scope > tr")];
  const sourceRows = rows.length ? rows : [...table.querySelectorAll("tr")];
  const body = sourceRows.map(row => {
    const cells = [...row.children].filter(child => ["td", "th"].includes(child.tagName.toLowerCase()));
    return `<w:tr>${cells.map(cell => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p>${[...cell.childNodes].map(child => inlineRuns(child, emptyMarks(), context)).join("") || "<w:r><w:t/></w:r>"}</w:p></w:tc>`).join("")}</w:tr>`;
  }).join("");
  return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B8C2D1"/><w:left w:val="single" w:sz="4" w:color="B8C2D1"/><w:bottom w:val="single" w:sz="4" w:color="B8C2D1"/><w:right w:val="single" w:sz="4" w:color="B8C2D1"/><w:insideH w:val="single" w:sz="4" w:color="B8C2D1"/><w:insideV w:val="single" w:sz="4" w:color="B8C2D1"/></w:tblBorders></w:tblPr>${body || "<w:tr><w:tc><w:p><w:r><w:t/></w:r></w:p></w:tc></w:tr>"}</w:tbl>`;
}

function blocksXml(root: HTMLElement, context: ExportContext): string {
  const output: string[] = [];
  const visit = (node: Node, list?: { numId: number; level: number }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent ?? "").trim()) output.push(`<w:p><w:r><w:t xml:space="preserve">${escapeXml(node.textContent ?? "")}</w:t></w:r></w:p>`);
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      const items = [...node.children].filter(child => child.tagName.toLowerCase() === "li");
      items.forEach(item => { output.push(paragraphXml(item, context, { numId: tag === "ol" ? 2 : 1, level: list?.level ?? 0 })); [...item.children].filter(child => ["ul", "ol"].includes(child.tagName.toLowerCase())).forEach(child => visit(child, { numId: child.tagName.toLowerCase() === "ol" ? 2 : 1, level: (list?.level ?? 0) + 1 })); });
      return;
    }
    if (tag === "table") { output.push(tableXml(node, context)); return; }
    if (["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "div", "pre", "hr"].includes(tag)) {
      const nestedBlocks = [...node.children].some(child => ["p", "h1", "h2", "h3", "ul", "ol", "table", "div"].includes(child.tagName.toLowerCase()));
      if (tag === "div" && nestedBlocks && !node.textContent?.trim()) { [...node.childNodes].forEach(child => visit(child, list)); return; }
      output.push(paragraphXml(node, context, list));
      return;
    }
    [...node.childNodes].forEach(child => visit(child, list));
  };
  [...root.childNodes].forEach(node => visit(node));
  return output.join("") || "<w:p><w:r><w:t/></w:r></w:p>";
}

function contentTypesXml(images: ImageAsset[]) {
  const defaults = new Map([["rels", "application/vnd.openxmlformats-package.relationships+xml"], ["xml", "application/xml"]]);
  images.forEach(image => defaults.set(image.fileName.split(".").pop()!, image.contentType));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${[...defaults].map(([extension, contentType]) => `<Default Extension="${extension}" ContentType="${contentType}"/>`).join("")}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;
}

function documentRelationships(context: ExportContext) {
  const relationships = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
  ];
  return relationships.join("");
}

function wordRelationships(context: ExportContext) {
  const relationships = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
    ...context.images.map(image => `<Relationship Id="${image.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.fileName}"/>`),
    ...context.links.map(link => `<Relationship Id="${link.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(link.target)}" TargetMode="External"/>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join("")}</Relationships>`;
}

export function editorText(html: string) {
  if (typeof DOMParser === "undefined") return decodeBasicEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const root = new DOMParser().parseFromString(html, "text/html").body;
  return (root.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function editorStats(html: string) {
  const text = editorText(html);
  return { words: text ? text.split(/\s+/).length : 0, characters: text.length, paragraphs: typeof DOMParser === "undefined" ? 0 : new DOMParser().parseFromString(html, "text/html").body.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li").length };
}

export function replaceEditorText(html: string, find: string, replacement: string) {
  if (!find || typeof DOMParser === "undefined") return html;
  const root = new DOMParser().parseFromString(html, "text/html").body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current: Node | null = walker.nextNode();
  while (current) { if (current.parentElement?.closest("script,style")) { current = walker.nextNode(); continue; } nodes.push(current as Text); current = walker.nextNode(); }
  nodes.forEach(node => { node.textContent = node.textContent?.split(find).join(replacement) ?? ""; });
  return root.innerHTML;
}

export async function buildDocx(html: string) {
  const JSZip = (await import("jszip")).default;
  const context: ExportContext = { images: [], links: [] };
  const root = typeof DOMParser === "function" ? new DOMParser().parseFromString(html, "text/html").body : null;
  const body = root ? blocksXml(root, context) : `<w:p><w:r><w:t>${escapeXml(decodeBasicEntities(html.replace(/<[^>]+>/g, " ")))}</w:t></w:r></w:p>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypesXml(context.images));
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${documentRelationships(context)}</Relationships>`);
  zip.file("word/_rels/document.xml.rels", wordRelationships(context));
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>${[1, 2, 3, 4, 5, 6].map((level, index) => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="${9 + index}"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="${32 - Math.min(index, 4) * 3}"/></w:rPr></w:style>`).join("")}</w:styles>`);
  zip.file("word/numbering.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  context.images.forEach(image => zip.file(`word/media/${image.fileName}`, image.data));
  return zip.generateAsync({ type: "base64", compression: "DEFLATE" });
}
