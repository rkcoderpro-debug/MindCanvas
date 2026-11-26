const tokenPattern = /^[a-f0-9]{48}$/;
const returnKey = "mindcanvas:share-sign-in";
export function workspaceShareToken(url = new URL(window.location.href)) {
  const token = new URLSearchParams(url.hash.slice(1)).get("share");
  return token && tokenPattern.test(token) ? token : null;
}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const kinds = ["file","folder","canvas","quiz","flashcard","learning_folder","lab"] as const;
export function workspaceShareTarget(url=new URL(window.location.href)) {
  const params=new URLSearchParams(url.hash.slice(1)),id=params.get("id"),kind=params.get("kind") as typeof kinds[number]|null;
  return id&&uuid.test(id)&&kind&&kinds.includes(kind)?{kind,id}:null;
}
type ShareTarget = NonNullable<ReturnType<typeof workspaceShareTarget>>;
const learningKinds = ["quiz", "flashcard", "lab", "document"] as const;
export type SharedLearningTarget = { kind: typeof learningKinds[number]; id: string };

export function sharedLearningTarget(url = new URL(window.location.href)): SharedLearningTarget | null {
  if (url.searchParams.get("view") !== "shared") return null;
  const kind = url.searchParams.get("type") as SharedLearningTarget["kind"];
  const id = url.searchParams.get("item");
  return id && uuid.test(id) && learningKinds.includes(kind) ? { kind, id } : null;
}

export function isSharedInboxRoute(url = new URL(window.location.href)) {
  return url.searchParams.get("view") === "shared" || url.searchParams.get("learn") === "shared";
}

export const SHARED_ROUTE_EVENT = "mindcanvas:shared-route";

export function sharedInboxUrl(base = new URL(window.location.href)) {
  const url = new URL(base.pathname, base.origin);
  url.searchParams.set("view", "shared");
  return url;
}

export function sharedLearningUrl(item: SharedLearningTarget) {
  const url = sharedInboxUrl();
  url.searchParams.set("type", item.kind);
  url.searchParams.set("item", item.id);
  return url.href;
}

export function workspaceShareUrl(token: string, item?: ShareTarget | null) {
  const url = sharedInboxUrl();
  url.hash = new URLSearchParams({ share: token, ...(item && { kind: item.kind, id: item.id }) }).toString();
  return url.href;
}

export function normalizeSharedRoute() {
  const current = new URL(window.location.href);
  const token = workspaceShareToken(current);
  const next = token && current.searchParams.get("view") !== "shared"
    ? workspaceShareUrl(token, workspaceShareTarget(current))
    : current.searchParams.get("learn") === "shared" ? sharedInboxUrl(current).href : current.href;
  if (next !== current.href) window.history.replaceState(window.history.state, "", next);
}

export function rememberWorkspaceShareSignIn() {
  try {
    const token = workspaceShareToken();
    const url = token ? workspaceShareUrl(token, workspaceShareTarget())
      : isSharedInboxRoute() ? window.location.href : null;
    if (url) sessionStorage.setItem(returnKey, JSON.stringify({ url, until: Date.now() + 30 * 60000 }));
    else sessionStorage.removeItem(returnKey);
  } catch {}
}

export function restoreWorkspaceShareSignIn() {
  try {
    const current = new URL(window.location.href);
    if (current.hash.includes("access_token=") || current.searchParams.has("code")) return;
    const saved = JSON.parse(sessionStorage.getItem(returnKey) ?? "null");
    sessionStorage.removeItem(returnKey);
    if (current.hash || isSharedInboxRoute(current) || !saved || saved.until <= Date.now()) return;
    const url = new URL(saved.url);
    if (url.origin !== current.origin || url.pathname !== current.pathname || !isSharedInboxRoute(url)) return;
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event(SHARED_ROUTE_EVENT));
  } catch {}
}

export function openShareInSameTab(event: { button: number; defaultPrevented: boolean; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault: () => void }, open?: () => void) {
  if (open && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    open();
  }
}
export function readShareProof(token:string) {
  try {return sessionStorage.getItem("mindcanvas:share-proof:"+token);} catch {return null;}
}
export function storeShareProof(token:string,proof:string) {
  try {sessionStorage.setItem("mindcanvas:share-proof:"+token,proof);} catch {}
}
