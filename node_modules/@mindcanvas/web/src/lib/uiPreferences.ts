export const FOCUS_TIMER_VISIBILITY_KEY = "mindcanvas:show-focus-timer:v1";
export const MOBILE_ZOOM_CONTROLS_KEY = "mindcanvas:show-mobile-zoom-controls:v1";

export function readFocusTimerVisibility() {
  try { return localStorage.getItem(FOCUS_TIMER_VISIBILITY_KEY) === "true"; }
  catch { return false; }
}

export function saveFocusTimerVisibility(visible: boolean) {
  try { localStorage.setItem(FOCUS_TIMER_VISIBILITY_KEY, String(visible)); }
  catch { /* Local UI persistence is optional. */ }
}

export function readMobileZoomControlsVisibility() {
  try { return localStorage.getItem(MOBILE_ZOOM_CONTROLS_KEY) === "true"; }
  catch { return false; }
}

export function saveMobileZoomControlsVisibility(visible: boolean) {
  try { localStorage.setItem(MOBILE_ZOOM_CONTROLS_KEY, String(visible)); }
  catch { /* Local UI persistence is optional. */ }
}

// The old key also stored the automatic "true" default, so it cannot represent an opt-in.
export const STICKY_TOPBAR_KEY = "mindcanvas:sticky-topbar:v2";

export function readStickyTopbar() {
  try { return localStorage.getItem(STICKY_TOPBAR_KEY) === "true"; }
  catch { return false; }
}

export function saveStickyTopbar(pinned: boolean) {
  try { localStorage.setItem(STICKY_TOPBAR_KEY, String(pinned)); }
  catch { /* A blocked local store must not prevent toggling the top bar. */ }
}
