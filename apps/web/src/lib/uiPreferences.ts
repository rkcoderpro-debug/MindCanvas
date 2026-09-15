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
