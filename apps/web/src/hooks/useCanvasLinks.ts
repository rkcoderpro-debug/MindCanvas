import { useEffect, useRef, useState } from "react";
import { canvasIdFromUrl, takeCanvasAfterSignIn, writeCanvasUrl } from "../lib/canvasLinks";
import type { Project } from "../lib/projectStore";

type Options = {
  authenticated: boolean;
  blockedByInvite: boolean;
  activeId: string | null;
  loading: boolean;
  projects: Project[];
  open: (project: Project) => Promise<unknown>;
  home: () => Promise<unknown>;
  resetView: (canvas: boolean) => void;
};
type Route = { id: string | null; started: boolean };

export function useCanvasLinks(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const previousBoard = useRef(options.activeId);
  const restoring = useRef<Route | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [guestCanvasLink, setGuestCanvasLink] = useState(false);

  useEffect(() => {
    const schedule = (id: string | null) => {
      const next = { id, started: false };
      restoring.current = next;
      setRoute(next);
      setGuestCanvasLink(false);
    };
    const { authenticated, blockedByInvite } = latest.current;
    const resumed = authenticated ? takeCanvasAfterSignIn() : null;
    if (!blockedByInvite) {
      const id = canvasIdFromUrl() ?? resumed;
      if (id) { writeCanvasUrl(id, "replace"); schedule(id); }
    }
    const onPop = () => schedule(canvasIdFromUrl());
    window.addEventListener("popstate", onPop);
    return () => { restoring.current = null; window.removeEventListener("popstate", onPop); };
  }, []);

  useEffect(() => {
    const old = previousBoard.current;
    previousBoard.current = options.activeId;
    if (old === options.activeId || restoring.current) return;
    if (options.activeId) setGuestCanvasLink(false);
    writeCanvasUrl(options.activeId);
  }, [options.activeId]);

  useEffect(() => {
    if (!route || route.started || restoring.current !== route) return;
    const current = latest.current;
    if (route.id && (current.loading || current.blockedByInvite)) return;
    route.started = true;
    const finish = () => {
      if (restoring.current !== route) return;
      restoring.current = null;
    };
    current.resetView(Boolean(route.id));
    if (!route.id) {
      // home() checkpoints a pending draft and cancels an earlier open.
      void current.home().finally(finish);
      return;
    }
    const id = route.id;
    if (id === current.activeId) { finish(); return; }
    const known = current.projects.find(project => project.id === id && !project.deletedAt);
    if (!known && !current.authenticated) {
      setGuestCanvasLink(true);
      void current.home().finally(finish);
      return;
    }
    // When the list is missing or stale, use the normal authenticated open.
    // Its cloud queries enforce access independently of the canvas URL.
    const project = known ?? { id, title: "", folderId: null, updatedAt: "" };
    void current.open(project).then(opened => {
      if (restoring.current !== route) return;
      if (opened !== true && latest.current.activeId && latest.current.activeId !== id) {
        writeCanvasUrl(latest.current.activeId, "replace");
      }
    }).finally(finish);
  }, [route, options.loading, options.blockedByInvite]);

  return {
    guestCanvasLink,
    leaveUnopenedLink: () => {
      if (latest.current.activeId) return;
      restoring.current = null;
      setGuestCanvasLink(false);
      writeCanvasUrl(null);
    },
  };
}
