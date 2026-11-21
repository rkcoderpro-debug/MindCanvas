declare module "pdf-parse" {
  type PdfPage = { getTextContent: (options?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean }) => Promise<{ items: Array<{ str: string; transform: number[] }> }> };
  type PdfOptions = { pagerender?: (page: PdfPage) => Promise<string>; max?: number; version?: string };
  const parse: (buffer: Buffer, options?: PdfOptions) => Promise<{ text: string; numpages: number }>;
  export default parse;
}
