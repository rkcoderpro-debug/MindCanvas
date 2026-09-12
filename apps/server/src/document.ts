import { inflateRawSync } from "node:zlib";
import pdfParse from "pdf-parse";
import type { GeminiImageInput } from "./gemini.js";

export type DocumentKind = "pdf" | "docx" | "pptx" | "text" | "image";
export type ExtractedDocument = {
  kind: DocumentKind;
  fileName: string;
  mimeType: string;
  text: string;
  pageCount?: number;
  image?: GeminiImageInput;
};

const TEXT_LIMIT = 120_000;
const MAX_ZIP_ENTRY_BYTES = 15 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export class UnsupportedDocumentError extends Error {
  code = "UNSUPPORTED_DOCUMENT";
  constructor(message = "Unsupported document format.") { super(message); }
}

function extension(fileName: string) {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

function kindFor(fileName: string, mimeType: string): DocumentKind {
  const ext = extension(fileName), mime = mimeType.toLowerCase();
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (ext === "pptx" || mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (IMAGE_MIME_TYPES.has(mime) || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (["txt", "md", "markdown", "csv", "json", "tsv"].includes(ext) || mime.startsWith("text/") || mime === "application/json") return "text";
  if (["doc", "ppt"].includes(ext)) throw new UnsupportedDocumentError("Định dạng .doc/.ppt cũ chưa được hỗ trợ. Hãy xuất file sang .docx/.pptx rồi thử lại.");
  throw new UnsupportedDocumentError("Định dạng chưa được hỗ trợ. Dùng PDF, DOCX, PPTX, TXT, Markdown, CSV hoặc ảnh JPG/PNG/WebP/GIF.");
}

function decodeXml(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_match, code: string) => {
      const numeric = code.toLowerCase().startsWith("x") ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
      return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : "";
    })
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

type ZipEntry = { name: string; data: Buffer };

/** Read the small subset of ZIP needed for DOCX/PPTX without a native binary dependency. */
function readZipEntries(buffer: Buffer): ZipEntry[] {
  if (buffer.length < 22) throw new UnsupportedDocumentError("Gói Office quá ngắn hoặc không hợp lệ.");
  const signature = 0x06054b50;
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) { end = offset; break; }
  }
  if (end < 0) throw new UnsupportedDocumentError("Không đọc được gói Office này.");
  const count = buffer.readUInt16LE(end + 10), centralOffset = buffer.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new UnsupportedDocumentError("Cấu trúc ZIP của file Office không hợp lệ.");
    const method = buffer.readUInt16LE(offset + 10), compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24), nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32), localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) throw new UnsupportedDocumentError("Nội dung Office sau giải nén vượt giới hạn an toàn.");
    const localNameLength = buffer.readUInt16LE(localOffset + 26), localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength, dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new UnsupportedDocumentError("File Office bị thiếu dữ liệu.");
    const compressed = buffer.subarray(dataStart, dataEnd);
    let data: Buffer;
    if (method === 0) data = compressed;
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new UnsupportedDocumentError("File Office dùng kiểu nén chưa được hỗ trợ.");
    if (data.length > MAX_ZIP_ENTRY_BYTES) throw new UnsupportedDocumentError("Nội dung Office sau giải nén vượt giới hạn an toàn.");
    entries.push({ name, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function extractDocx(buffer: Buffer) {
  const entry = readZipEntries(buffer).find(item => item.name === "word/document.xml");
  if (!entry) throw new UnsupportedDocumentError("DOCX không có nội dung văn bản chính.");
  const paragraphs = [...entry.data.toString("utf8").matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gi)]
    .map(match => [...match[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi)].map(text => decodeXml(text[1])).join(""))
    .filter(Boolean);
  return paragraphs.join("\n").slice(0, TEXT_LIMIT);
}

function extractPptx(buffer: Buffer) {
  const entries = readZipEntries(buffer)
    .filter(item => /^ppt\/slides\/slide\d+\.xml$/i.test(item.name))
    .sort((a, b) => Number(a.name.match(/slide(\d+)/i)?.[1] ?? 0) - Number(b.name.match(/slide(\d+)/i)?.[1] ?? 0));
  const slides = entries.map((entry, index) => {
    const words = [...entry.data.toString("utf8").matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi)].map(match => decodeXml(match[1])).filter(Boolean);
    return words.length ? `[PAGE ${index + 1}]\n${words.join(" ")}` : "";
  }).filter(Boolean);
  return { text: slides.join("\n\n").slice(0, TEXT_LIMIT), pageCount: entries.length };
}

export async function extractDocument(buffer: Buffer, fileName: string, mimeType: string): Promise<ExtractedDocument> {
  const kind = kindFor(fileName, mimeType);
  if (kind === "pdf") {
    let pageNumber = 0;
    const parsed = await pdfParse(buffer, { pagerender: async page => {
      pageNumber += 1;
      const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      let lastY: number | undefined; let text = "";
      for (const item of content.items) { if (lastY !== undefined && lastY !== item.transform[5]) text += "\n"; text += item.str; lastY = item.transform[5]; }
      return `[PAGE ${pageNumber}]\n${text}`;
    } });
    return { kind, fileName, mimeType: "application/pdf", text: parsed.text.slice(0, TEXT_LIMIT), pageCount: parsed.numpages };
  }
  if (kind === "docx") return { kind, fileName, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", text: extractDocx(buffer), pageCount: undefined };
  if (kind === "pptx") {
    const extracted = extractPptx(buffer);
    return { kind, fileName, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ...extracted };
  }
  if (kind === "text") return { kind, fileName, mimeType: mimeType || "text/plain", text: buffer.toString("utf8").replace(/\u0000/g, "").slice(0, TEXT_LIMIT) };
  const normalizedMime = IMAGE_MIME_TYPES.has(mimeType.toLowerCase()) ? mimeType.toLowerCase() : `image/${extension(fileName) === "jpg" || extension(fileName) === "jpeg" ? "jpeg" : extension(fileName)}`;
  return { kind, fileName, mimeType: normalizedMime, text: `[IMAGE: ${fileName}]`, image: { mimeType: normalizedMime, data: buffer.toString("base64") } };
}
