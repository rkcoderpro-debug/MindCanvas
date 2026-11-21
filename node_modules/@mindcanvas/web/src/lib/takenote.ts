import katex from "katex";
import "katex/contrib/mhchem";
import { splitFormulaText } from "../components/FormulaText";
import { noteInstructions, validateNoteSettings, type NoteSettings, type NoteResult } from "../../../../packages/shared/src/takenotes.js";
export type { NoteSettings, NoteResult };
export const noteFileName = (title: string) => title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 100).trim() || "takenote";
export function noteManualPrompt(settings: NoteSettings, output: "markdown" | "docx" = "markdown") {
  validateNoteSettings(settings);
  return [noteInstructions(settings),
    "Read the original files attached directly in this conversation, or source text supplied separately by the user. This prompt intentionally contains no extracted source content. Ask for missing attachments before writing; never invent them.",
    settings.format === "html" ? "Create an actual downloadable file named takenote.html containing the complete HTML. If you cannot create a file, return only its full HTML source in one code block, without placeholders. Do not return JSON."
      : output === "docx" ? "Create an actual downloadable editable Microsoft Word file named takenote.docx with headings, tables and properly rendered formulas. Inspect pagination and formula rendering before returning. Do not return JSON or plain text renamed DOCX. If you cannot create the file, explain that limitation."
      : "Return only the full Markdown note, preferably as takenote.md. Do not return JSON. Use explicit math delimiters and escape backslashes only as required by Markdown, not JSON."
  ].join("\n\n");
}
export function noteBodyMarkdown(markdown: string, title: string) { return markdown.replace(/^\s*#\s+([^\n]+)\n?/, (match, heading: string) => heading.trim() === title.trim() ? "" : match); }
export const escapeNoteHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
/** Small safe Markdown subset: user HTML never becomes executable host DOM. */
export function noteMarkdownHtml(markdown: string, word = false): string {
  const inline = (value: string): string => splitFormulaText(value).map(part => {
    if (part.kind === "math") {
      if (word) return `<span data-note-math="${escapeNoteHtml(part.value)}">${escapeNoteHtml(part.raw ?? part.value)}</span>`;
      try { return katex.renderToString(part.value, { displayMode: part.display, output: "htmlAndMathml", throwOnError: true, trust: false, maxExpand: 1000, maxSize: 20 }); }
      catch { return `<span class="formula-invalid">${escapeNoteHtml(part.raw ?? part.value)}</span>`; }
    }
    return escapeNoteHtml(part.value).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  }).join("");
  // Protect display formulas so table/list processing never splits their lines.
  const displays: string[] = [];
  const source = markdown.replace(/\$\$([\s\S]+?)\$\$/g, match => { displays.push(inline(match)); return `\n\nMC_NOTE_DISPLAY_${displays.length - 1}\n\n`; });
  const lines = source.replace(/\r\n/g, "\n").split("\n"), out: string[] = [];
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, "|"));
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    const display = /^MC_NOTE_DISPLAY_(\d+)$/.exec(line);
    if (display && displays[Number(display[1])] !== undefined) { out.push(`<div class="note-display-math">${displays[Number(display[1])]}</div>`); i++; continue; }
    if (/^```/.test(line)) { const code: string[] = []; i++; while (i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i++]); i++; out.push(`<pre><code>${escapeNoteHtml(code.join("\n"))}</code></pre>`); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); i++; continue; }
    if (i + 1 < lines.length && line.includes("|") && /^\|?\s*:?-{3,}/.test(lines[i + 1].trim())) {
      const header = cells(line); i += 2; const rows: string[] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(`<tr>${cells(lines[i++]).map(cell => `<td>${inline(cell)}</td>`).join("")}</tr>`);
      out.push(`<table><thead><tr>${header.map(cell => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`); continue;
    }
    if (/^(?:[-*+]\s|\d+[.)]\s)/.test(line)) {
      const ordered = /^\d/.test(line), items: string[] = [], pattern = ordered ? /^\d+[.)]\s+/ : /^[-*+]\s+/;
      while (i < lines.length && pattern.test(lines[i].trim())) items.push(`<li>${inline(lines[i++].trim().replace(pattern, ""))}</li>`);
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`); continue;
    }
    if (/^>\s?/.test(line)) { out.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`); i++; continue; }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(?:#|[-*+]\s|\d+[.)]\s|>|```|MC_NOTE_DISPLAY_)/.test(lines[i].trim()) && !(lines[i].includes("|") && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1].trim()))) paragraph.push(lines[i++].trim());
    out.push(`<p>${inline(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
  }
  return out.join("\n");
}
