import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export const LEARNING_TABS = ["overview", "flashcards", "quiz", "exams", "plan", "progress", "lab", "tools", "shared", "connections", "classrooms", "music"] as const;
export type HubTab = typeof LEARNING_TABS[number];
type Route = { tab: HubTab; detail: string | null };
type Entry = Route & { owner: string; parent?: Route };
const STATE = "mindcanvasLearning";
export const LEARNING_HOME_EVENT = "mindcanvas:learning-home";
export function learningTabFromUrl(): HubTab | null {
  const value = new URL(window.location.href).searchParams.get("learn");
  return LEARNING_TABS.includes(value as HubTab) ? value as HubTab : null;
}
export function learningUrl(tab: HubTab | null) {
  const url = new URL(window.location.href);
  if (tab) url.searchParams.set("learn", tab); else url.searchParams.delete("learn");
  return `${url.pathname}${url.search}${url.hash}`;
}
export function enterLearningSpace(tab: HubTab = "overview") {
  window.history.pushState({}, "", learningUrl(tab));
  window.dispatchEvent(new CustomEvent(LEARNING_HOME_EVENT, { detail: tab }));
}
export function leaveLearningSpace() {
  if (learningTabFromUrl()) window.history.pushState({}, "", learningUrl(null));
}

type Detail = { show: () => void; hide: () => void };
type Navigation = {
  route: Route; visited: Set<HubTab>; lastTool: HubTab | null;
  go: (tab: HubTab) => void; home: () => void;
  openDetail: (tab: HubTab, id: string, show: () => void, hide: () => void) => void;
  closeDetail: (tab: HubTab) => void;
};
const NavigationContext = createContext<Navigation | null>(null);
const ToolContext = createContext<{ tab: HubTab; active: boolean } | null>(null);

export function LearningNavigationProvider({ owner, initialTab, children }: { owner: string | null; initialTab?: HubTab; children: ReactNode }) {
  const identity = owner ?? "guest";
  const [route, setRoute] = useState<Route>(() => ({ tab: initialTab ?? learningTabFromUrl() ?? "overview", detail: null }));
  const routeRef = useRef(route), details = useRef(new Map<string, Detail>()), remembered = useRef(new Map<HubTab, Route>());
  const [visited, setVisited] = useState(() => new Set<HubTab>([route.tab]));
  const [lastTool, setLastTool] = useState<HubTab | null>(null);
  const apply = useCallback((next: Route) => {
    // Cached pages keep their inputs and sessions, but only the requested detail is shown.
    for (const [key, value] of details.current) if (key.startsWith(`${next.tab}:`)) value.hide();
    const detail = next.detail && details.current.get(`${next.tab}:${next.detail}`);
    if (detail) detail.show(); else next = { tab: next.tab, detail: null };
    routeRef.current = next; setRoute(next);
    if (next.tab !== "overview") { remembered.current.set(next.tab, next); setLastTool(next.tab); }
    setVisited(current => current.has(next.tab) ? current : new Set([...current, next.tab]));
  }, []);
  const write = useCallback((next: Route, replace = false, parent?: Route) => {
    const entry: Entry = { ...next, owner: identity, ...(parent ? { parent } : {}) };
    window.history[replace ? "replaceState" : "pushState"]({ ...window.history.state, [STATE]: entry }, "", learningUrl(next.tab));
    apply(next);
  }, [apply, identity]);
  const go = useCallback((tab: HubTab) => {
    const next = tab === "overview" ? { tab, detail: null } : remembered.current.get(tab) ?? { tab, detail: null };
    if (routeRef.current.tab === next.tab && routeRef.current.detail === next.detail) return;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    write(next, false, routeRef.current);
  }, [write]);
  const openDetail = useCallback((tab: HubTab, id: string, show: () => void, hide: () => void) => {
    details.current.set(`${tab}:${id}`, { show, hide });
    const next = { tab, detail: id };
    // A generation finishing in a cached tool must not pull the user away.
    if (routeRef.current.tab !== tab) { remembered.current.set(tab, next); show(); return; }
    if (routeRef.current.tab === tab && routeRef.current.detail === id) { show(); return; }
    write(next, false, routeRef.current);
  }, [write]);
  const closeDetail = useCallback((tab: HubTab) => {
    const entry = window.history.state?.[STATE] as Entry | undefined;
    if (entry?.owner === identity && entry.tab === tab && entry.detail && entry.parent?.tab === tab) {
      apply(entry.parent); window.history.back();
    } else write({ tab, detail: null }, true);
  }, [apply, identity, write]);
  useEffect(() => {
    const next = { tab: initialTab ?? learningTabFromUrl() ?? "overview", detail: null };
    write(next, true);
    const onPop = () => {
      const tab = learningTabFromUrl(); if (!tab) return;
      const entry = window.history.state?.[STATE] as Entry | undefined;
      apply({ tab, detail: entry?.owner === identity && entry.tab === tab && typeof entry.detail === "string" ? entry.detail : null });
    };
    const onEntry = (event: Event) => {
      const requested = (event as CustomEvent).detail;
      if (LEARNING_TABS.includes(requested)) write({ tab: requested, detail: null }, true);
    };
    window.addEventListener("popstate", onPop); window.addEventListener(LEARNING_HOME_EVENT, onEntry);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener(LEARNING_HOME_EVENT, onEntry); };
  }, [apply, identity, initialTab, write]);
  const value = useMemo(() => ({ route, visited, lastTool, go, home: () => go("overview"), openDetail, closeDetail }), [route, visited, lastTool, go, openDetail, closeDetail]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
export function useLearningNavigation() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error("Learning navigation is unavailable.");
  return value;
}
export function LearningToolScope({ tab, active, children }: { tab: HubTab; active: boolean; children: ReactNode }) {
  return <ToolContext.Provider value={{ tab, active }}><div className="learning-tool-page" data-learning-tool={tab} hidden={!active} inert={!active}>{children}</div></ToolContext.Provider>;
}
export function useLearningActive() { return useContext(ToolContext)?.active ?? true; }
export function useLearningTool() {
  const navigation = useContext(NavigationContext), tool = useContext(ToolContext);
  if (!navigation || !tool) return null;
  return {
    active: tool.active,
    open: (id: string, show: () => void, hide: () => void) => navigation.openDetail(tool.tab, id, show, hide),
    back: () => navigation.closeDetail(tool.tab),
  };
}
