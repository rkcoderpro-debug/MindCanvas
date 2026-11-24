const folderIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const key = "folders";
export const FOLDER_ROOT = "all";
export const FOLDER_LIBRARY = "library";
export const fileIdFromUrl = (url = new URL(window.location.href)) => {
  const id = url.searchParams.get("file");
  return id && folderIdPattern.test(id) ? id.toLowerCase() : null;
};

export function workspaceFilePermalink(id: string, base = new URL(window.location.href)) {
  if (!folderIdPattern.test(id)) throw new Error("Invalid workspace file ID");
  const url = new URL(base.pathname,base.origin);
  url.searchParams.set("file",id.toLowerCase());
  return url.toString();
}

export function folderNavigationFromUrl(url = new URL(window.location.href)) {
  const explicit = folderRouteFromUrl(url);
  if (explicit) return explicit;
  return fileIdFromUrl(url) ? FOLDER_ROOT : null;
}

export function folderRouteFromUrl(url = new URL(window.location.href)) {
  const value = url.searchParams.get(key);
  return (value === FOLDER_ROOT || value === FOLDER_LIBRARY) ? value : value && folderIdPattern.test(value) ? value.toLowerCase() : null;
}

export function folderPermalink(folderId: string | null, base = new URL(window.location.href)) {
  const url = new URL(base.pathname, base.origin);
  url.searchParams.set(key, folderId ?? FOLDER_ROOT);
  return url.toString();
}

export function writeFolderRoute(folder: string | null, mode: "push" | "replace" = "push", fileId: string | null = null) {
  const url = new URL(window.location.href);
  if (fileId && folderIdPattern.test(fileId)) url.searchParams.set("file",fileId.toLowerCase());
  else url.searchParams.delete("file");
  if (folder || fileId) {
    if (folder && !fileId) url.searchParams.set(key, folder);
    else url.searchParams.delete(key);
    for (const param of ["canvas", "learn", "room", "room_invite", "room_code"]) url.searchParams.delete(param);
  } else url.searchParams.delete(key);
  if (url.href !== window.location.href) window.history[mode === "push" ? "pushState" : "replaceState"](
    mode === "push" && fileId ? { mindcanvasFileEntry: fileId } : {}, "", url);
}

const returnKey = "mindcanvas:oauth-folders";
export function rememberFolderSignIn() {
  try {
    const url = new URL(window.location.href);
    const route = folderRouteFromUrl(url);
    const file = fileIdFromUrl(url);
    if ((route || file) && !["canvas","learn","invite","learning_invite","connection_invite"].some(param => url.searchParams.has(param))) {
      sessionStorage.setItem(returnKey,JSON.stringify({ route, file, path: url.pathname, until: Date.now()+30*60*1000 }));
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
    const file = typeof saved.file === "string" && folderIdPattern.test(saved.file) ? saved.file : null;
    const route = saved.route === FOLDER_ROOT || saved.route === FOLDER_LIBRARY || (typeof saved.route === "string" && folderIdPattern.test(saved.route)) ? saved.route : null;
    if (!file && !route) return;
    const url = new URL(window.location.origin);
    url.pathname = saved.path;
    if (file) url.searchParams.set("file",file);
    else if (route) url.searchParams.set(key,route);
    window.history.replaceState(window.history.state,"",url);
  } catch { /* Recovery is optional. */ }
}
