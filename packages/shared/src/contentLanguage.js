export function contentLanguageInstruction(language) {
  if (language === "vi-en") return "Write every learner-facing text in Vietnamese first and English immediately below it. Keep each translation pair in the same field, separated by a single newline (in JSON, escaped as \\n). Keep one item, one question ID and one answer key per pair. Preserve numbers, formula notation and units. IDs, enum values, references, correctIndex and other machine-readable fields stay unchanged. For Markdown or Word, put each English translation under the corresponding Vietnamese paragraph, item or heading; in tables use both translations in the same cell.";
  if (language === "vi" || language === "en") return `Write all learner-facing content in ${language === "vi" ? "Vietnamese" : "English"}, regardless of the source language. Keep machine-readable schema keys, IDs and answer indexes unchanged.`;
  return "Write learner-facing content in the language of the source.";
}
