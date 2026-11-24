const tokenPattern = /^[a-f0-9]{48}$/;
const returnKey = "mindcanvas:share-sign-in";
export function workspaceShareToken(url = new URL(window.location.href)) {
  const token = new URLSearchParams(url.hash.slice(1)).get("share");
  return token && tokenPattern.test(token) ? token : null;
}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const kinds = ["file","folder","canvas","quiz","flashcard"] as const;
export function workspaceShareTarget(url=new URL(window.location.href)) {
  const params=new URLSearchParams(url.hash.slice(1)),id=params.get("id"),kind=params.get("kind") as typeof kinds[number]|null;
  return id&&uuid.test(id)&&kind&&kinds.includes(kind)?{kind,id}:null;
}
export function workspaceShareUrl(token: string, item?: NonNullable<ReturnType<typeof workspaceShareTarget>>|null) {
  const url = new URL(window.location.pathname,window.location.origin);
  url.hash = new URLSearchParams({share:token,...(item&&{kind:item.kind,id:item.id})}).toString();
  return url.href;
}
export function rememberWorkspaceShareSignIn() {
  try {
    const token = workspaceShareToken();
    if (token) sessionStorage.setItem(returnKey,JSON.stringify({token,target:workspaceShareTarget(),until:Date.now()+30*60000}));
    else sessionStorage.removeItem(returnKey);
  } catch {}
}
export function restoreWorkspaceShareSignIn() {
  try {
    const item = JSON.parse(sessionStorage.getItem(returnKey) ?? "null");
    if (window.location.hash.includes("access_token=")) return;
    sessionStorage.removeItem(returnKey);
    if (!workspaceShareToken() && item?.until > Date.now() && typeof item.token==="string" && tokenPattern.test(item.token)) {
      // Keep the OAuth callback hash intact for Supabase's client.
      const href = new URL(window.location.href);
      if (href.hash) return;
      const target=item.target && uuid.test(String(item.target.id)) && kinds.includes(item.target.kind) ? item.target : undefined;
      href.hash = new URL(workspaceShareUrl(item.token,target)).hash;
      window.history.replaceState(window.history.state,"",href);
    }
  } catch {}
}
export function readShareProof(token:string) {
  try {return sessionStorage.getItem("mindcanvas:share-proof:"+token);} catch {return null;}
}
export function storeShareProof(token:string,proof:string) {
  try {sessionStorage.setItem("mindcanvas:share-proof:"+token,proof);} catch {}
}
