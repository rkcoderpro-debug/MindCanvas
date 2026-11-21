export const MAX_HTML_BYTES = 1500000;
export function validateHtmlDocument(value: string): string {
  const html = value.trim().replace(/^```(?:html)?\s*\n([\s\S]*?)\n```$/i, "$1").trim();
  if (!html || new TextEncoder().encode(html).length > MAX_HTML_BYTES) throw new Error("Chọn tài liệu HTML có nội dung, tối đa 1,5 MB.");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  if (!parsed.body.children.length || !parsed.body.textContent?.trim() && !parsed.body.querySelector("svg,canvas,img")) throw new Error("File chưa có nội dung HTML để xem.");
  return html;
}
export function htmlDocumentWarnings(html: string): string[] {
  const parsed = new DOMParser().parseFromString(html, "text/html"), warnings: string[] = [];
  if (parsed.querySelector("script[src],link[href],iframe,object,embed") || [...parsed.querySelectorAll("img,video,audio,source")].some(node => !/^(?:data:|blob:|#)/i.test(node.getAttribute("src") ?? ""))) warnings.push("Tài liệu dùng tài nguyên ngoài. Trình xem chỉ chạy nội dung tự chứa; các tài nguyên ngoài sẽ bị chặn.");
  return warnings;
}
/** Deliberately no same-origin, popups, forms or top-navigation permission on the iframe. */
export function htmlSandboxDocument(value: string): string {
  const parsed = new DOMParser().parseFromString(value, "text/html");
  parsed.querySelectorAll("base,meta[http-equiv],iframe,object,embed,script[src],link").forEach(node => node.remove());
  parsed.querySelectorAll("form").forEach(node => node.replaceWith(...node.childNodes));
  parsed.querySelectorAll("a").forEach(node => { if (!node.getAttribute("href")?.startsWith("#")) node.removeAttribute("href"); node.removeAttribute("target"); });
  const policy = parsed.createElement("meta"); policy.httpEquiv = "Content-Security-Policy";
  policy.content = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'";
  parsed.head.prepend(policy);
  const viewport = parsed.createElement("meta"); viewport.name = "viewport"; viewport.content = "width=device-width,initial-scale=1"; parsed.head.append(viewport);
  return `<!doctype html>\n${parsed.documentElement.outerHTML}`;
}
export function textFromDataUrl(value: string): string {
  const comma = value.indexOf(",");
  if (comma < 0) throw new Error("Dữ liệu tài liệu không hợp lệ.");
  if (!/;base64/i.test(value.slice(0, comma))) return decodeURIComponent(value.slice(comma + 1));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(value.slice(comma + 1)), char => char.charCodeAt(0)));
}
