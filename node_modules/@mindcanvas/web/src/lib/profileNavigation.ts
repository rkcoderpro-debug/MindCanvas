const ROUTE_KEY = "profile";
const PROFILE_STATE = "mindcanvasProfile";
export const PROFILE_ROUTE_EVENT = "mindcanvas:profile-route";

export function isProfileRoute(url = new URL(window.location.href)) {
  return url.searchParams.get(ROUTE_KEY) === "1";
}

export function openProfileRoute() {
  const url = new URL(window.location.href);
  if (isProfileRoute(url)) return;
  url.searchParams.set(ROUTE_KEY, "1");
  window.history.pushState({ ...window.history.state, [PROFILE_STATE]: true }, "", url);
  window.dispatchEvent(new Event(PROFILE_ROUTE_EVENT));
}

export function closeProfileRoute() {
  const url = new URL(window.location.href);
  if (!isProfileRoute(url)) return;
  if (window.history.state?.[PROFILE_STATE]) { window.history.back(); return; }
  url.searchParams.delete(ROUTE_KEY);
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(PROFILE_ROUTE_EVENT));
}

/** Opening or closing the profile must leave an active canvas/learning session in place. */
export function isProfileOnlyTransition(previous: string, next: string) {
  const before = new URL(previous), after = new URL(next);
  if (isProfileRoute(before) === isProfileRoute(after)) return false;
  before.searchParams.delete(ROUTE_KEY);
  after.searchParams.delete(ROUTE_KEY);
  return before.href === after.href;
}
