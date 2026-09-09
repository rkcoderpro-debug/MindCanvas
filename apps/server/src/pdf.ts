import pdfParse from "pdf-parse";

export async function extractPdf(buffer: Buffer) {
  const parsed = await pdfParse(buffer);
  return { text: parsed.text.slice(0, 120000), pageCount: parsed.numpages };
}
