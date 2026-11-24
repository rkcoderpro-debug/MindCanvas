import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export const LEARNING_TABS = ["overview", "flashcards", "quiz", "exams", "plan", "progress", "lab", "tools", "shared", "connections", "classrooms", "music", "rooms"] as const;
export type HubTab = typeof LEARNING_TABS[number];
type Route = { tab: HubTab; detail: string | null };
type Entry = Route & { owner: string; parent?: Route };
const STATE = "mindcanvasLearning";
export const LEARNING_TOOL_EVENT = "mindcanvas:learning-tool";
export const LEARNING_HOME_EVENT = "mindcanvas:learning-home";
export function learningTabFromUrl(): HubTab | null {
  const value = new URL(window.location.href).searchParams.get("learn");
  return LEARNING_TABS.includes(value as HubTab) ? value as HubTab : null;
}
export function learningUrl(tab: HubTab | null) {
  const url = new URL(window.location.href);
  if (tab) { url.searchParams.set("learn", tab); url.searchParams.delete("canvas"); } else url.searchParams.delete("learn");
  if (tab !== "rooms") { url.searchParams.delete("room"); url.searchParams.delete("room_invite"); url.searchParams.delete("room_code"); }
  return `${url.pathname}${url.search}${url.hash}`;
}
export function enterLearningSpace(tab: HubTab = "overview") {
  window.history.pushState({}, "", learningUrl(tab));
  window.dispatchEvent(new CustomEvent(LEARNING_HOME_EVENT, { detail: tab }));
}
export function leaveLearningSpace() {
  if (learningTabFromUrl()) window.history.pushState({}, "", learningUrl(null));
}

export function openLearningTool(tab: HubTab) {
  if (learningTabFromUrl()) window.dispatchEvent(new CustomEvent(LEARNING_TOOL_EVENT, { detail: tab }));
  else {
    enterLearningSpace("overview");
    if (tab !== "overview") {
      const parent = { tab: "overview", detail: null };
      window.history.pushState({ learningParent: parent }, "", learningUrl(tab));
    }
  }
}

type Detail = { show: () => void; hide: () => void; parent: Route };
type Navigation = {
  route: Route; visited: Set<HubTab>; lastTool: HubTab | null;
  go: (tab: HubTab) => void; backToOverview: () => void; home: () => void;
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
    if (next.detail && !details.current.has(`${next.tab}:${next.detail}`)) next = { tab: next.tab, detail: null };
    const lineage = (route: Route) => {
      const path: Detail[] = [], seen = new Set<string>();
      for (let step = route; step.detail;) {
        const key = `${step.tab}:${step.detail}`;
        const detail = details.current.get(key);
        if (!detail || seen.has(key)) break;
        seen.add(key); path.unshift(detail); step = detail.parent;
      }
      return path;
    };
    const previous = lineage(routeRef.current), following = lineage(next);
    const common = previous.findIndex((item, index) => item !== following[index]);
    const shared = common < 0 ? previous.length : common;
    for (const item of previous.slice(shared).reverse()) item.hide();
    for (const item of following.slice(shared)) item.show();
    routeRef.current = next; setRoute(next);
    if (next.tab !== "overview") { remembered.current.set(next.tab, next); setLastTool(next.tab); }
    setVisited(current => current.has(next.tab) ? current : new Set([...current, next.tab]));
  }, []);
  const write = useCallback((next: Route, replace = false, parent?: Route) => {
    const entry: Entry = { ...next, owner: identity, ...(parent ? { parent } : {}) };
    window.history[replace ? "replaceState" : "pushState"]({ [STATE]: entry }, "", learningUrl(next.tab));
    apply(next);
  }, [apply, identity]);
  const go = useCallback((tab: HubTab) => {
    const next = tab === "overview" ? { tab, detail: null } : remembered.current.get(tab) ?? { tab, detail: null };
    if (routeRef.current.tab === next.tab && routeRef.current.detail === next.detail) return;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    write(next, false, routeRef.current);
  }, [write]);
  const backToOverview = useCallback(() => {
    const parent: Route = { tab: "overview", detail: null };
    const entry = window.history.state?.[STATE] as Entry | undefined;
    if (entry?.owner === identity && entry.parent?.tab === "overview") {
      apply(parent);
      window.history.back();
    } else write(parent, true);
  }, [apply, identity, write]);
  const openDetail = useCallback((tab: HubTab, id: string, show: () => void, hide: () => void) => {
    const next = { tab, detail: id }, key = `${tab}:${id}`;
    const current = routeRef.current;
    if (current.tab === tab && current.detail === id) {
      const detail = details.current.get(key);
      if (detail) { detail.show = show; detail.hide = hide; }
      show(); return;
    }
    // Reopened siblings retain their original parent (e.g. another document in a viewer).
    const previous = details.current.get(key);
    const parent = previous?.parent ?? (current.tab === tab ? current : remembered.current.get(tab) ?? { tab, detail: null });
    details.current.set(key, { show, hide, parent });
    if (current.tab !== tab) { remembered.current.set(tab, next); return; }
    write(next, false, current);
  }, [write]);
  const closeDetail = useCallback((tab: HubTab) => {
    const current = routeRef.current;
    if (current.tab !== tab || !current.detail) return;
    const parent = details.current.get(`${tab}:${current.detail}`)?.parent ?? { tab, detail: null };
    const entry = window.history.state?.[STATE] as Entry | undefined;
    if (entry?.owner === identity && entry.tab === tab && entry.detail === current.detail && entry.parent?.tab === parent.tab && entry.parent.detail === parent.detail) {
      apply(parent); window.history.back();
    } else write(parent, true);
  }, [apply, identity, write]);
  useEffect(() => {
    const next = { tab: initialTab ?? learningTabFromUrl() ?? "overview", detail: null };
    const parent = window.history.state?.learningParent as Route | undefined;
    write(next, true, parent);
    const onPop = () => {
      const tab = learningTabFromUrl(); if (!tab) return;
      const entry = window.history.state?.[STATE] as Entry | undefined;
      apply({ tab, detail: entry?.owner === identity && entry.tab === tab && typeof entry.detail === "string" ? entry.detail : null });
    };
    const onEntry = (event: Event) => {
      const requested = (event as CustomEvent).detail;
      if (LEARNING_TABS.includes(requested)) write({ tab: requested, detail: null }, true);
    };
    const onTool = (event: Event) => {
      const requested = (event as CustomEvent).detail;
      if (LEARNING_TABS.includes(requested)) go(requested);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener(LEARNING_HOME_EVENT, onEntry);
    window.addEventListener(LEARNING_TOOL_EVENT, onTool);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener(LEARNING_HOME_EVENT, onEntry);
      window.removeEventListener(LEARNING_TOOL_EVENT, onTool);
    };
  }, [apply, go, identity, initialTab, write]);
  const value = useMemo(() => ({ route, visited, lastTool, go, backToOverview, home: () => go("overview"), openDetail, closeDetail }), [route, visited, lastTool, go, backToOverview, openDetail, closeDetail]);
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
const VisibleContext = createContext(true);
export function LearningVisibility({ active, children }: { active: boolean; children: ReactNode }) {
  return <VisibleContext.Provider value={active}><div hidden={!active} inert={!active}>{children}</div></VisibleContext.Provider>;
}
export function useLearningActive() {
  const tool = useContext(ToolContext), visible = useContext(VisibleContext);
  return (tool?.active ?? true) && visible;
}
export function useLearningTool() {
  const navigation = useContext(NavigationContext), tool = useContext(ToolContext);
  if (!navigation || !tool) return null;
  return {
    active: tool.active,
    open: (id: string, show: () => void, hide: () => void) => navigation.openDetail(tool.tab, id, show, hide),
    back: () => navigation.closeDetail(tool.tab),
  };
}
