import pdfParse from "pdf-parse";

export async function extractPdf(buffer: Buffer) {
  let pageNumber = 0;
  const parsed = await pdfParse(buffer, { pagerender: async page => {
    pageNumber += 1;
    const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
    let lastY: number | undefined; let text = "";
    for (const item of content.items) { if (lastY !== undefined && lastY !== item.transform[5]) text += "\n"; text += item.str; lastY = item.transform[5]; }
    return `[PAGE ${pageNumber}]\n${text}`;
  } });
  return { text: parsed.text.slice(0, 120000), pageCount: parsed.numpages };
}
