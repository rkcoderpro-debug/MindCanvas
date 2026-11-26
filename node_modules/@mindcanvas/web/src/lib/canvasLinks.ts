const CANVAS_ID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const OAUTH_RETURN = "mindcanvas:oauth-canvas";
const MAX_OAUTH_WAIT = 30 * 60 * 1000;

export function canvasIdFromUrl(url = new URL(window.location.href)): string | null {
  const id = url.searchParams.get("canvas");
  return id && CANVAS_ID.test(id) ? id.toLowerCase() : null;
}

export function canvasPermalink(id: string, base = new URL(window.location.href)): string {
  if (!CANVAS_ID.test(id)) throw new Error("Invalid canvas ID");
  // Keep the existing app path; a fresh navigation only needs the same static
  // index. Deep links contain the ID, not invitation or authentication data.
  const link = new URL(base.pathname, base.origin);
  link.searchParams.set("canvas", id.toLowerCase());
  return link.toString();
}

export function writeCanvasUrl(id: string | null, mode: "push" | "replace" = "push") {
  if (id && !CANVAS_ID.test(id)) return;
  const url = new URL(window.location.href);
  if (canvasIdFromUrl(url) === id && !(id && url.searchParams.has("learn"))) return;
  const fromShared = id && url.searchParams.get("view") === "shared";
  if (id) {
    url.searchParams.set("canvas", id);
    for (const param of ["learn", "file", "view", "type", "item"]) url.searchParams.delete(param);
  }
  else url.searchParams.delete("canvas");
  window.history[mode === "push" ? "pushState" : "replaceState"](fromShared ? { mindcanvasCanvasFromShared: true } : null, "", url);
}

export function rememberCanvasForSignIn() {
  try {
    const url = new URL(window.location.href);
    const id = canvasIdFromUrl(url);
    if (id && !["invite", "learning_invite", "connection_invite"].some(key => url.searchParams.has(key))) {
      sessionStorage.setItem(OAUTH_RETURN, JSON.stringify({ id, at: Date.now() }));
    } else sessionStorage.removeItem(OAUTH_RETURN);
  } catch { /* The URL still works when browser storage is unavailable. */ }
}

export function takeCanvasAfterSignIn(): string | null {
  try {
    const value = sessionStorage.getItem(OAUTH_RETURN);
    sessionStorage.removeItem(OAUTH_RETURN);
    if (!value) return null;
    const pending = JSON.parse(value) as { id?: unknown; at?: unknown };
    if (typeof pending.id !== "string" || !CANVAS_ID.test(pending.id) || typeof pending.at !== "number" ||
      pending.at > Date.now() || Date.now() - pending.at > MAX_OAUTH_WAIT) return null;
    return pending.id.toLowerCase();
  } catch { return null; }
}
