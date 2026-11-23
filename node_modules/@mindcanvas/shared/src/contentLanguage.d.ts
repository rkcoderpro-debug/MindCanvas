export type ContentLanguage = "vi" | "en";
export type DocumentLanguage = ContentLanguage | "vi-en";
export function contentLanguageInstruction(language?: DocumentLanguage): string;
