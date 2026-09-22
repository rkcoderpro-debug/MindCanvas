import { useEffect, useRef, useState } from "react";
import FeatureGuideOverlay from "./FeatureGuideOverlay";
import FeatureGuideCelebration from "./FeatureGuideCelebration";
import { beginGuideSession, endGuideSession, finishGuide, GUIDE_ACTION_EVENT, GUIDE_REQUEST_EVENT, guideForId, guideForTrigger, markGuideStarted, readGuideProgress } from "../lib/featureGuides";

type Props = {
  ownerId: string | null;
  trigger?: string | null;
  manualGuideId?: string | null;
  onManualConsumed?: () => void;
  onPracticeDecision?: (decision: "keep" | "trash", resourceId: string) => void | Promise<void>;
  blocked?: boolean;
};

export default function FeatureGuideManager({ ownerId, trigger = null, manualGuideId = null, onManualConsumed, onPracticeDecision, blocked = false }: Props) {
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeManual, setActiveManual] = useState(false);
  const [requestedGuideId, setRequestedGuideId] = useState<string | null>(null);
  const [celebrationGuideId, setCelebrationGuideId] = useState<string | null>(null);
  const [practiceResourceId, setPracticeResourceId] = useState<string | null>(null);
  const lastTrigger = useRef<string | null>(null);
  const manualConsumed = useRef<string | null>(null);

  useEffect(() => {
    const handleGuideAction = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; payload?: unknown; guideSessionId?: string | null }>).detail;
      if (detail?.name !== "canvas:practice-created" || activeGuideId !== "canvas-controls") return;
      if (activeSessionId && detail.guideSessionId !== activeSessionId) return;
      const payload = detail.payload;
      if (!payload || typeof payload !== "object") return;
      const projectId = (payload as { projectId?: unknown }).projectId;
      if (typeof projectId === "string" && projectId) setPracticeResourceId(projectId);
    };
    window.addEventListener(GUIDE_ACTION_EVENT, handleGuideAction);
    return () => window.removeEventListener(GUIDE_ACTION_EVENT, handleGuideAction);
  }, [activeGuideId, activeSessionId]);

  useEffect(() => {
    const request = (event: Event) => {
      const id = (event as CustomEvent<{ guideId?: string }>).detail?.guideId;
      if (id && !activeGuideId && !activeManual) setRequestedGuideId(id);
    };
    window.addEventListener(GUIDE_REQUEST_EVENT, request);
    return () => window.removeEventListener(GUIDE_REQUEST_EVENT, request);
  }, [activeGuideId, activeManual]);

  useEffect(() => {
    if (blocked || !requestedGuideId || activeGuideId || activeManual) return;
    const guide = guideForId(requestedGuideId);
    setRequestedGuideId(null);
    if (!guide || readGuideProgress(ownerId)[guide.id]?.status && readGuideProgress(ownerId)[guide.id]?.status !== "unseen") return;
    markGuideStarted(ownerId, guide.id);
    const sessionId = beginGuideSession();
    setActiveManual(false);
    setPracticeResourceId(null);
    setActiveSessionId(sessionId);
    setActiveGuideId(guide.id);
  }, [activeGuideId, activeManual, blocked, ownerId, requestedGuideId]);

  useEffect(() => {
    if (!manualGuideId) {
      manualConsumed.current = null;
      return;
    }
    if (blocked || !manualGuideId || manualConsumed.current === manualGuideId) return;
    const guide = guideForId(manualGuideId);
    if (!guide) return;
    // Manual launches from the Wiki follow the same once-only rule as
    // contextual launches. A completed or skipped guide is intentionally not
    // mounted again; resetGuideProgress is the explicit opt-in for a replay.
    const status = readGuideProgress(ownerId)[guide.id]?.status;
    if (status && status !== "unseen") {
      manualConsumed.current = manualGuideId;
      onManualConsumed?.();
      return;
    }
    const firstStep = guide.steps[0];
    const targetReady = !firstStep?.target || Boolean(firstStep.skipWhenRoute && trigger === firstStep.skipWhenRoute) || (() => {
      try { return Boolean(document.querySelector(firstStep.target)); } catch { return false; }
    })();
    let settled = false;
    const start = () => {
      if (settled || manualConsumed.current === manualGuideId) return;
      settled = true;
      manualConsumed.current = manualGuideId;
      markGuideStarted(ownerId, guide.id);
      const sessionId = beginGuideSession();
      setActiveManual(true);
      setPracticeResourceId(null);
      setActiveSessionId(sessionId);
      setActiveGuideId(guide.id);
      onManualConsumed?.();
    };
    if (targetReady) {
      // Let the route render one frame before mounting the overlay. This keeps
      // a guide launched from the Wiki from flashing a false "target missing"
      // state while a lazy page is being mounted.
      const frame = window.requestAnimationFrame(start);
      return () => { settled = true; window.cancelAnimationFrame(frame); };
    }
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      let ready = false;
      try { ready = !firstStep?.target || Boolean(firstStep.skipWhenRoute && trigger === firstStep.skipWhenRoute) || Boolean(firstStep.target && document.querySelector(firstStep.target)); } catch { ready = false; }
      if (ready || Date.now() - startedAt >= 1800) {
        window.clearInterval(interval);
        start();
      }
    }, 60);
    return () => { settled = true; window.clearInterval(interval); };
  }, [blocked, manualGuideId, onManualConsumed, ownerId, trigger]);

  useEffect(() => {
    if (blocked || activeGuideId || activeManual || !trigger || lastTrigger.current === trigger) return;
    lastTrigger.current = trigger;
    const guide = guideForTrigger(trigger);
    const status = guide ? readGuideProgress(ownerId)[guide.id]?.status : undefined;
    if (!guide || (status && status !== "unseen")) return;
    const timer = window.setTimeout(() => {
      markGuideStarted(ownerId, guide.id);
      const sessionId = beginGuideSession();
      setPracticeResourceId(null);
      setActiveSessionId(sessionId);
      setActiveGuideId(guide.id);
      setActiveManual(false);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [activeGuideId, activeManual, blocked, ownerId, trigger]);

  useEffect(() => {
    if (trigger !== lastTrigger.current) return;
    if (!trigger) lastTrigger.current = null;
  }, [trigger]);

  const close = (status: "completed" | "skipped") => {
    if (!activeGuideId) return;
    const completedId = activeGuideId;
    finishGuide(ownerId, completedId, status);
    endGuideSession(activeSessionId);
    setActiveGuideId(null);
    setActiveManual(false);
    setPracticeResourceId(null);
    setActiveSessionId(null);
    if (status === "completed") setCelebrationGuideId(completedId);
  };
  const guide = guideForId(activeGuideId);
  const celebrationGuide = guideForId(celebrationGuideId);
  if (!guide && !celebrationGuide) return null;
  return <>
    {guide && <FeatureGuideOverlay guide={guide} guideSessionId={activeSessionId} currentRoute={trigger} practiceResourceId={practiceResourceId} onPracticeDecision={onPracticeDecision} onComplete={() => close("completed")} onSkip={() => close("skipped")}/>} 
    {celebrationGuide && <FeatureGuideCelebration guide={celebrationGuide} onClose={() => setCelebrationGuideId(null)}/>} 
  </>;
}
