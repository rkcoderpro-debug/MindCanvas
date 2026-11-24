const folderIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const key = "folders";
export const FOLDER_ROOT = "all";

export function folderRouteFromUrl(url = new URL(window.location.href)) {
  const value = url.searchParams.get(key);
  return value === FOLDER_ROOT ? value : value && folderIdPattern.test(value) ? value.toLowerCase() : null;
}

export function folderPermalink(folderId: string | null, base = new URL(window.location.href)) {
  const url = new URL(base.pathname, base.origin);
  url.searchParams.set(key, folderId ?? FOLDER_ROOT);
  return url.toString();
}

export function writeFolderRoute(folder: string | null, mode: "push" | "replace" = "push") {
  const url = new URL(window.location.href);
  if (folder) {
    url.searchParams.set(key, folder);
    for (const param of ["canvas", "learn", "room", "room_invite", "room_code"]) url.searchParams.delete(param);
  } else url.searchParams.delete(key);
  if (url.href !== window.location.href) window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
}

const returnKey = "mindcanvas:oauth-folders";
export function rememberFolderSignIn() {
  try {
    const url = new URL(window.location.href);
    const route = folderRouteFromUrl(url);
    if (route && !["canvas","learn","invite","learning_invite","connection_invite"].some(param => url.searchParams.has(param))) {
      sessionStorage.setItem(returnKey,JSON.stringify({ route, path: url.pathname, until: Date.now()+30*60*1000 }));
    } else sessionStorage.removeItem(returnKey);
  } catch { /* The copied link still works when browser storage is unavailable. */ }
}

export function restoreFolderSignIn() {
  try {
    const json = sessionStorage.getItem(returnKey);
    sessionStorage.removeItem(returnKey);
    if (!json || window.location.search) return;
    const saved = JSON.parse(json);
    if (typeof saved.path !== "string" || !saved.path.startsWith("/") || saved.path.startsWith("//") || !saved.until || saved.until < Date.now()) return;
    if (saved.route !== FOLDER_ROOT && (typeof saved.route !== "string" || !folderIdPattern.test(saved.route))) return;
    const url = new URL(window.location.origin);
    url.pathname = saved.path;
    url.searchParams.set(key,saved.route);
    window.history.replaceState(window.history.state,"",url);
  } catch { /* Recovery is optional. */ }
}
