/**
 * Parse JSON returned by an AI model.
 *
 * Models sometimes wrap JSON in Markdown/prose or emit a small syntax error
 * while still returning useful structured data. Strict JSON.parse is always
 * attempted first. Repairs are deliberately conservative and only run after
 * strict candidates fail.
 */
export class LenientJsonError extends Error {
  constructor() {
    super("Unable to parse AI JSON output.");
    this.name = "LenientJsonError";
  }
}

function isWhitespace(value: string | undefined): boolean {
  return value !== undefined && /\s/.test(value);
}

function skipWhitespace(raw: string, start: number): number {
  let index = start;
  while (isWhitespace(raw[index])) index += 1;
  return index;
}

function firstJsonStart(raw: string): number {
  const objectStart = raw.indexOf("{");
  const arrayStart = raw.indexOf("[");
  if (objectStart < 0) return arrayStart;
  if (arrayStart < 0) return objectStart;
  return Math.min(objectStart, arrayStart);
}

function stripEnvelope(raw: string): string[] {
  const value = raw.replace(/^\uFEFF/, "").trim();
  const candidates = [value];
  const fenced = value.match(/^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const start = firstJsonStart(value);
  if (start >= 0) candidates.push(value.slice(start).trim());
  return candidates;
}

function looksLikeObjectKey(raw: string, quoteIndex: number): boolean {
  let index = skipWhitespace(raw, quoteIndex + 1);
  if (raw[index] !== ":") return false;
  return true;
}

function looksLikeStringTerminator(raw: string, quoteIndex: number): boolean {
  let next = skipWhitespace(raw, quoteIndex + 1);
  const character = raw[next];
  if (character === undefined || character === "}" || character === "]" || character === ":") return true;
  if (character !== ",") return false;

  next = skipWhitespace(raw, next + 1);
  if (raw[next] === "}" || raw[next] === "]") return true;
  if (raw[next] !== '"') return false;

  // A comma followed by a quoted key and a colon is the normal boundary
  // between object properties. A comma followed by ordinary text is part of
  // a malformed string and the quote should be escaped instead.
  let escaped = false;
  for (let index = next + 1; index < raw.length; index += 1) {
    const value = raw[index];
    if (escaped) {
      escaped = false;
    } else if (value === "\\") {
      escaped = true;
    } else if (value === '"') {
      return looksLikeObjectKey(raw, index);
    }
  }
  return false;
}

function extractBalanced(raw: string): string[] {
  const values: string[] = [];
  const start = firstJsonStart(raw);
  if (start < 0) return values;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') {
        // This heuristic lets extraction continue when an AI forgot to
        // escape quotes inside a string value.
        if (looksLikeStringTerminator(raw, index)) inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{" || character === "[") {
      stack.push(character);
    } else if (character === "}" || character === "]") {
      const expected = character === "}" ? "{" : "[";
      if (stack.at(-1) !== expected) break;
      stack.pop();
      if (!stack.length) {
        values.push(raw.slice(start, index + 1));
        break;
      }
    }
  }
  return values;
}

function repairCommonSyntax(raw: string): string {
  let repaired = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (!inString) {
      if (character === '"') {
        inString = true;
        repaired += character;
      } else if (character === ",") {
        const next = skipWhitespace(raw, index + 1);
        if (raw[next] !== "}" && raw[next] !== "]") repaired += character;
      } else {
        repaired += character;
      }
      continue;
    }

    if (escaped) {
      repaired += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      repaired += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      if (looksLikeStringTerminator(raw, index)) {
        repaired += character;
        inString = false;
      } else {
        repaired += '\\"';
      }
      continue;
    }
    if (character === "\n") repaired += "\\n";
    else if (character === "\r") repaired += "\\r";
    else if (character === "\t") repaired += "\\t";
    else if (character.charCodeAt(0) < 0x20) repaired += `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
    else repaired += character;
  }
  return repaired;
}

export function parseLenientJson<T = unknown>(raw: string): T {
  if (typeof raw !== "string" || !raw.trim()) throw new LenientJsonError();

  const candidates = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.replace(/^\uFEFF/, "").trim();
    if (!trimmed) return;
    candidates.add(trimmed);
    for (const balanced of extractBalanced(trimmed)) candidates.add(balanced);
  };

  for (const candidate of stripEnvelope(raw)) add(candidate);
  for (const candidate of [...candidates]) {
    const repaired = repairCommonSyntax(candidate);
    add(repaired);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Keep trying the conservative candidates below.
    }
  }
  throw new LenientJsonError();
}
