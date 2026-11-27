import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  isSharedInboxRoute, normalizeSharedRoute, sharedInboxUrl, sharedLearningTarget, SHARED_ROUTE_EVENT, workspaceShareToken,
} from "../lib/workspaceShareLinks";

type Source = "chat" | "inbox";
type ReturnPosition = { url: string; top: number; focus: HTMLElement | null };
const parentKey = "mindcanvasShareParent";

function readDetail(url = new URL(window.location.href)) {
  const token = workspaceShareToken(url);
  const learning = sharedLearningTarget(url);
  return token || learning ? {
    token, learning, url: url.href, source: window.history.state?.[parentKey] as Source | undefined,
    insideFolder: !!window.history.state?.mindcanvasSharedFolderDepth,
  } : null;
}

export function useSharedRoute(area: RefObject<HTMLElement | null>, backButton: RefObject<HTMLButtonElement | null>) {
  const [detail, setDetail] = useState(readDetail);
  const position = useRef<ReturnPosition | null>(null);
  const detailOpen = useRef(false);

  useEffect(() => {
    const sync = () => { normalizeSharedRoute(); setDetail(readDetail()); };
    sync();
    for (const event of ["popstate", "hashchange", SHARED_ROUTE_EVENT]) window.addEventListener(event, sync);
    return () => {
      for (const event of ["popstate", "hashchange", SHARED_ROUTE_EVENT]) window.removeEventListener(event, sync);
    };
  }, []);

  useLayoutEffect(() => {
    if (detail) {
      if (area.current) area.current.scrollTop = 0;
      backButton.current?.focus({ preventScroll: true });
    } else if (detailOpen.current && position.current?.url === window.location.href) {
      if (area.current) area.current.scrollTop = position.current.top;
      position.current.focus?.focus({ preventScroll: true });
    }
    detailOpen.current = !!detail;
  }, [area, backButton, detail?.url]);

  const change = (url: string | URL, mode: "pushState" | "replaceState", state = {}) => {
    if (String(url) !== window.location.href) window.history[mode](state, "", url);
    setDetail(readDetail());
  };
  const inbox = (replace = false) => change(sharedInboxUrl(), replace ? "replaceState" : "pushState");
  return {
    detail,
    canReturnToChat: detail?.source === "chat" && !!position.current,
    inbox,
    open(url: string, source: Source, trigger?: HTMLElement) {
      if (!detail) {
        position.current = { url: window.location.href, top: area.current?.scrollTop ?? 0, focus: trigger ?? (document.activeElement as HTMLElement | null) };
      }
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      change(url, "pushState", { [parentKey]: source });
    },
    leave() {
      if (!detail && !isSharedInboxRoute()) return false;
      const next = new URL(window.location.pathname, window.location.origin);
      change(next, "pushState");
      return true;
    },
    back() {
      if (window.history.state?.mindcanvasSharedFolderDepth || (detail?.source && position.current)) {
        window.history.back();
        return true;
      }
      inbox(true);
      return false;
    },
    skipCanvasPopstate(url: string) {
      return !!readDetail(new URL(url)) || (detailOpen.current && position.current?.url === url);
    },
  };
}
