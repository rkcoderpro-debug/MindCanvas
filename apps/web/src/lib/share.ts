export type NativeShareResult = "shared" | "cancelled" | "unavailable" | "failed";

/**
 * Clipboard access is frequently unavailable in iOS WebViews. Keep the link
 * selected in the visible input when the browser cannot execute the copy so
 * the user still has a reliable manual path.
 */
export async function copyTextWithFallback(value: string, input?: HTMLInputElement | null): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the input-selection fallback.
  }

  if (!input || typeof document === "undefined") return false;
  input.focus();
  input.select();
  input.setSelectionRange?.(0, value.length);
  try {
    if (typeof document.execCommand === "function" && document.execCommand("copy")) return true;
  } catch {
    // The selected input remains available for manual copying.
  }
  return false;
}

export function canUseNativeShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function shareProjectLink(value: string, title: string, text: string): Promise<NativeShareResult> {
  if (!canUseNativeShare()) return "unavailable";
  try {
    await navigator.share({ title, text, url: value });
    return "shared";
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return "cancelled";
    return "failed";
  }
}
