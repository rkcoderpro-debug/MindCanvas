import type { ContentLanguage, DocumentLanguage } from "../../../../packages/shared/src/contentLanguage.js";

export function readContentLanguage(tool: string, fallback: ContentLanguage): ContentLanguage;
export function readContentLanguage(tool: string, fallback: DocumentLanguage, bilingual: true): DocumentLanguage;
export function readContentLanguage(tool: string, fallback: DocumentLanguage, bilingual = false): DocumentLanguage {
  try {
    const value = localStorage.getItem(`mindcanvas.output-language.${tool}`);
    if (value === "vi" || value === "en" || (bilingual && value === "vi-en")) return value;
  } catch { /* Storage may be unavailable in private windows. */ }
  return fallback;
}
export function rememberContentLanguage(tool: string, value: DocumentLanguage) {
  try { localStorage.setItem(`mindcanvas.output-language.${tool}`, value); } catch { /* Current choice still applies. */ }
}
