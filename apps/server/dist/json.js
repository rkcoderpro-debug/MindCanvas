/**
 * Runtime-local copy for the compiled server. The shared package is source
 * mapped for the web app, while Render starts the server from dist/ with
 * plain Node, so the backend must not import a workspace .ts file at runtime.
 */
export class LenientJsonError extends Error {
    constructor() {
        super("Unable to parse AI JSON output.");
        this.name = "LenientJsonError";
    }
}
const whitespace = (value) => value !== undefined && /\s/.test(value);
const skipWhitespace = (raw, start) => {
    let index = start;
    while (whitespace(raw[index]))
        index += 1;
    return index;
};
const firstJsonStart = (raw) => {
    const objectStart = raw.indexOf("{");
    const arrayStart = raw.indexOf("[");
    if (objectStart < 0)
        return arrayStart;
    if (arrayStart < 0)
        return objectStart;
    return Math.min(objectStart, arrayStart);
};
function looksLikeObjectKey(raw, quoteIndex) {
    return raw[skipWhitespace(raw, quoteIndex + 1)] === ":";
}
function looksLikeStringTerminator(raw, quoteIndex) {
    let next = skipWhitespace(raw, quoteIndex + 1);
    const character = raw[next];
    if (character === undefined || character === "}" || character === "]" || character === ":")
        return true;
    if (character !== ",")
        return false;
    next = skipWhitespace(raw, next + 1);
    if (raw[next] === "}" || raw[next] === "]")
        return true;
    if (raw[next] !== '"')
        return false;
    let escaped = false;
    for (let index = next + 1; index < raw.length; index += 1) {
        const value = raw[index];
        if (escaped)
            escaped = false;
        else if (value === "\\")
            escaped = true;
        else if (value === '"')
            return looksLikeObjectKey(raw, index);
    }
    return false;
}
function extractBalanced(raw) {
    const values = [];
    const start = firstJsonStart(raw);
    if (start < 0)
        return values;
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < raw.length; index += 1) {
        const character = raw[index];
        if (inString) {
            if (escaped)
                escaped = false;
            else if (character === "\\")
                escaped = true;
            else if (character === '"' && looksLikeStringTerminator(raw, index))
                inString = false;
            continue;
        }
        if (character === '"')
            inString = true;
        else if (character === "{" || character === "[")
            stack.push(character);
        else if (character === "}" || character === "]") {
            const expected = character === "}" ? "{" : "[";
            if (stack.at(-1) !== expected)
                break;
            stack.pop();
            if (!stack.length) {
                values.push(raw.slice(start, index + 1));
                break;
            }
        }
    }
    return values;
}
function repairCommonSyntax(raw) {
    let repaired = "";
    let inString = false;
    let escaped = false;
    for (let index = 0; index < raw.length; index += 1) {
        const character = raw[index];
        if (!inString) {
            if (character === '"') {
                inString = true;
                repaired += character;
            }
            else if (character === ",") {
                const next = skipWhitespace(raw, index + 1);
                if (raw[next] !== "}" && raw[next] !== "]")
                    repaired += character;
            }
            else
                repaired += character;
            continue;
        }
        if (escaped) {
            repaired += character;
            escaped = false;
        }
        else if (character === "\\") {
            repaired += character;
            escaped = true;
        }
        else if (character === '"') {
            if (looksLikeStringTerminator(raw, index)) {
                repaired += character;
                inString = false;
            }
            else
                repaired += '\\"';
        }
        else if (character === "\n")
            repaired += "\\n";
        else if (character === "\r")
            repaired += "\\r";
        else if (character === "\t")
            repaired += "\\t";
        else if (character.charCodeAt(0) < 0x20)
            repaired += `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
        else
            repaired += character;
    }
    return repaired;
}
function envelopeCandidates(raw) {
    const value = raw.replace(/^\uFEFF/, "").trim();
    const candidates = [value];
    const fenced = value.match(/^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i);
    if (fenced?.[1])
        candidates.push(fenced[1].trim());
    const start = firstJsonStart(value);
    if (start >= 0)
        candidates.push(value.slice(start).trim());
    return candidates;
}
export function parseLenientJson(raw) {
    if (typeof raw !== "string" || !raw.trim())
        throw new LenientJsonError();
    const candidates = new Set();
    const add = (value) => {
        const trimmed = value.replace(/^\uFEFF/, "").trim();
        if (!trimmed)
            return;
        candidates.add(trimmed);
        for (const balanced of extractBalanced(trimmed))
            candidates.add(balanced);
    };
    for (const candidate of envelopeCandidates(raw))
        add(candidate);
    for (const candidate of [...candidates])
        add(repairCommonSyntax(candidate));
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        }
        catch { /* Try the next safe candidate. */ }
    }
    throw new LenientJsonError();
}
