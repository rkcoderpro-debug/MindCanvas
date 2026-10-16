export function manualProviderUrl(provider: string, baseUrl: string, prompt: string) {
  if (provider !== "chatgpt") return { url: baseUrl, prefilled: false };
  const url = new URL(baseUrl); url.searchParams.set("q", prompt);
  // Full encoded URL, not source character count: Vietnamese and LaTeX expand.
  return url.href.length <= 8000 ? { url: url.href, prefilled: true } : { url: baseUrl, prefilled: false };
}
