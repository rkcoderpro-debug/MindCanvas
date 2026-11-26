export const documentTextLimit = 256 * 1024;

export function isPlainTextDocument(name: string) {
  return /\.(txt|md|csv|tsv|c|cc|cpp|cxx|h|hh|hpp|s|asm|mips|java|py|js|ts|json|sql|log)$/i.test(name);
}

export async function readTextDocumentPreview(blob: Blob) {
  const slice = blob.slice(0, documentTextLimit);
  const text = typeof slice.text === "function" ? await slice.text() : await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(slice);
  });
  return { text, truncated: blob.size > documentTextLimit };
}
