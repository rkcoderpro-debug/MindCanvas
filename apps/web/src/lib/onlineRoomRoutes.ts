const STORAGE = "mindcanvas:online-room-invite:v1";
const AUTH_RETURN = "mindcanvas:online-room-sign-in:v1";
const roomId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const invitation = /^[a-f0-9]{64}$/;
export type OnlineRoomLink = { id: string; invite?: string };

export function readOnlineRoomLink(url = new URL(window.location.href)): OnlineRoomLink | null {
  if (url.searchParams.get("learn") !== "rooms") return null;
  const id = url.searchParams.get("room")?.toLowerCase() ?? "";
  if (!roomId.test(id)) return null;
  const supplied = url.searchParams.get("room_invite");
  if (supplied && invitation.test(supplied)) return { id, invite: supplied };
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE) ?? "null");
    if (value?.id === id && typeof value.invite === "string" && invitation.test(value.invite)) return { id, invite: value.invite };
  } catch { /* This device can still open a direct invitation. */ }
  return { id };
}

export function rememberOnlineRoomInvite(link: OnlineRoomLink | null) {
  if (!link?.invite) return;
  try { sessionStorage.setItem(STORAGE, JSON.stringify(link)); } catch { /* optional persistence */ }
}

export function forgetOnlineRoomInvite(id: string) {
  try {
    const pending = JSON.parse(sessionStorage.getItem(STORAGE) ?? "null");
    if (pending?.id === id) sessionStorage.removeItem(STORAGE);
  } catch { /* optional persistence */ }
}

export function onlineRoomUrl(id: string | null, invite?: string, here = new URL(window.location.href)): URL {
  const url = new URL(here.href);
  url.search = ""; url.hash = "";
  url.searchParams.set("learn", "rooms");
  if (id) url.searchParams.set("room", id);
  if (id && invite) url.searchParams.set("room_invite", invite);
  return url;
}

/** Remove a private link token before creating any third-party embed. */
export function captureOnlineRoomInvite() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("learn") !== "rooms" || !url.searchParams.has("room_invite")) return;
  rememberOnlineRoomInvite(readOnlineRoomLink(url));
  url.searchParams.delete("room_invite");
  window.history.replaceState(window.history.state, "", url);
}

// Keep the existing OAuth callback URL at the site origin. The secret never
// goes to the OAuth provider and only this browser tab can restore the link.
export function rememberOnlineRoomSignIn() {
  if (new URL(window.location.href).searchParams.get("learn") !== "rooms") return;
  const link = readOnlineRoomLink();
  rememberOnlineRoomInvite(link);
  try { sessionStorage.setItem(AUTH_RETURN, JSON.stringify({ room: link?.id ?? null, until: Date.now() + 600_000 })); }
  catch { /* sign-in can still complete without returning to the room */ }
}

export function restoreOnlineRoomSignIn() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(AUTH_RETURN) ?? "null");
    sessionStorage.removeItem(AUTH_RETURN);
    if (!saved || typeof saved.until !== "number" || saved.until < Date.now()) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("learn") || url.searchParams.has("canvas")) return;
    url.searchParams.set("learn", "rooms");
    if (typeof saved.room === "string" && roomId.test(saved.room)) url.searchParams.set("room", saved.room);
    window.history.replaceState(window.history.state, "", url);
  } catch { /* optional persistence */ }
}
