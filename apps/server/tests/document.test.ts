import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDocument, UnsupportedDocumentError } from "../src/document.js";

function zip(entries: Array<{ name: string; data: string }>) {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), data = Buffer.from(entry.data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0, 6); header.writeUInt16LE(0, 8); header.writeUInt32LE(0, 10); header.writeUInt32LE(0, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26); header.writeUInt16LE(0, 28);
    local.push(header, name, data);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0, 8); directory.writeUInt16LE(0, 10); directory.writeUInt32LE(0, 12); directory.writeUInt32LE(0, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt16LE(0, 30); directory.writeUInt16LE(0, 32); directory.writeUInt16LE(0, 34); directory.writeUInt16LE(0, 36); directory.writeUInt32LE(0, 38); directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + data.length;
  }
  const centralSize = central.reduce((total, item) => total + item.length, 0), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

test("extracts plain text without a browser dependency", async () => {
  const result = await extractDocument(Buffer.from("Hello\u0000 world"), "notes.txt", "text/plain");
  assert.equal(result.kind, "text"); assert.equal(result.text, "Hello world");
});

test("extracts paragraphs from DOCX XML", async () => {
  const result = await extractDocument(zip([{ name: "word/document.xml", data: "<w:document><w:body><w:p><w:r><w:t>First &amp; idea</w:t></w:r></w:p><w:p><w:r><w:t>Second</w:t></w:r></w:p></w:body></w:document>" }]), "lesson.docx", "application/octet-stream");
  assert.equal(result.kind, "docx"); assert.equal(result.text, "First & idea\nSecond");
});

test("extracts ordered slides from PPTX XML", async () => {
  const result = await extractDocument(zip([
    { name: "ppt/slides/slide2.xml", data: "<p:sld><a:t>Second</a:t></p:sld>" },
    { name: "ppt/slides/slide1.xml", data: "<p:sld><a:t>First</a:t><a:t> slide</a:t></p:sld>" },
  ]), "deck.pptx", "application/octet-stream");
  assert.equal(result.kind, "pptx"); assert.equal(result.pageCount, 2); assert.match(result.text, /\[PAGE 1\]\nFirst  slide/); assert.match(result.text, /\[PAGE 2\]\nSecond/);
});

test("returns inline image data for multimodal AI", async () => {
  const result = await extractDocument(Buffer.from("png"), "diagram.png", "image/png");
  assert.equal(result.kind, "image"); assert.deepEqual(result.image, { mimeType: "image/png", data: Buffer.from("png").toString("base64") });
});

test("explains unsupported legacy Office files", async () => {
  await assert.rejects(extractDocument(Buffer.from("old"), "slides.ppt", "application/vnd.ms-powerpoint"), (error: unknown) => error instanceof UnsupportedDocumentError && error.message.includes(".pptx"));
});
