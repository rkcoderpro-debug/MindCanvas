import katex from "katex";
import "katex/contrib/mhchem";
import "katex/dist/katex.min.css";

type FormulaPart = { kind: "text" | "math"; value: string; display?: boolean; raw?: string };

/** Only interpret explicit math delimiters; existing plain-text quizzes stay plain text. */
export function splitFormulaText(value: string): FormulaPart[] {
  const parts: FormulaPart[] = [];
  let textStart = 0;
  let index = 0;
  const escaped = (at: number) => {
    let backslashes = 0;
    for (let i = at - 1; i >= 0 && value[i] === "\\"; i--) backslashes++;
    return backslashes % 2 === 1;
  };
  while (index < value.length) {
    if (escaped(index)) { index++; continue; }
    let open = "";
    let close = "";
    let display = false;
    if (value.startsWith("$$", index)) { open = close = "$$"; display = true; }
    else if (value.startsWith("\\[", index)) { open = "\\["; close = "\\]"; display = true; }
    else if (value.startsWith("\\(", index)) { open = "\\("; close = "\\)"; }
    else if (value[index] === "$" && value[index + 1] !== "$") { open = close = "$"; }
    if (!open) { index++; continue; }

    let end = value.indexOf(close, index + open.length);
    while (end >= 0 && (escaped(end) || (close === "$" && value[end + 1] === "$"))) {
      end = value.indexOf(close, end + 1);
    }
    if (end < 0 || end === index + open.length) { index += open.length; continue; }
    if (index > textStart) parts.push({ kind: "text", value: value.slice(textStart, index) });
    const next = end + close.length;
    parts.push({ kind: "math", value: value.slice(index + open.length, end), raw: value.slice(index, next), display });
    index = textStart = next;
  }
  if (textStart < value.length || !parts.length) parts.push({ kind: "text", value: value.slice(textStart) });
  return parts;
}

export default function FormulaText({ text }: { text: string }) {
  return <span className="formula-text">{splitFormulaText(text).map((part, index) => {
    if (part.kind === "text") return <span key={index}>{part.value}</span>;
    try {
      const html = katex.renderToString(part.value, {
        displayMode: part.display,
        output: "htmlAndMathml",
        throwOnError: true,
        trust: false,
        maxExpand: 1000,
        maxSize: 20,
      });
      return <span key={index} className={part.display ? "formula-display" : "formula-inline"} dangerouslySetInnerHTML={{ __html: html }}/>;
    } catch {
      return <span key={index} className="formula-invalid" title="Công thức chưa đúng cú pháp hoặc chưa được hỗ trợ">{part.raw}</span>;
    }
  })}</span>;
}
