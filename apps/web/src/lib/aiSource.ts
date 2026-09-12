export const AI_FILE_ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.markdown,.csv,.tsv,.json,image/jpeg,image/png,image/webp,image/gif";

export type ClipboardSource = { kind: "text"; text: string } | { kind: "image"; file: File };

type ClipboardWithRead = Clipboard & { read?: () => Promise<ClipboardItems> };

/** Prefer an image copied from the system clipboard, then fall back to text. */
export async function readClipboardSource(): Promise<ClipboardSource> {
  const clipboard = navigator.clipboard as ClipboardWithRead | undefined;
  if (!clipboard) throw new Error("CLIPBOARD_UNAVAILABLE");
  if (clipboard.read) {
    try {
      const items = await clipboard.read();
      for (const item of items) {
        const type = item.types.find(value => value.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          return { kind: "image", file: new File([blob], "clipboard-image.png", { type: blob.type || type }) };
        }
      }
    } catch {
      // Browsers may allow readText while denying read(); the text fallback is useful.
    }
  }
  const text = (await clipboard.readText()).trim();
  if (!text) throw new Error("CLIPBOARD_EMPTY");
  return { kind: "text", text };
}
