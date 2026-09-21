import { useEffect, useRef, useState } from "react";
import FeatureGuideOverlay from "./FeatureGuideOverlay";
import FeatureGuideCelebration from "./FeatureGuideCelebration";
import { finishGuide, GUIDE_ACTION_EVENT, GUIDE_REQUEST_EVENT, guideForId, guideForTrigger, markGuideStarted, readGuideProgress } from "../lib/featureGuides";

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
  const [activeManual, setActiveManual] = useState(false);
  const [requestedGuideId, setRequestedGuideId] = useState<string | null>(null);
  const [celebrationGuideId, setCelebrationGuideId] = useState<string | null>(null);
  const [practiceResourceId, setPracticeResourceId] = useState<string | null>(null);
  const lastTrigger = useRef<string | null>(null);
  const manualConsumed = useRef<string | null>(null);

  useEffect(() => {
    const handleGuideAction = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; payload?: unknown }>).detail;
      if (detail?.name !== "canvas:practice-created" || activeGuideId !== "canvas-controls") return;
      const payload = detail.payload;
      if (!payload || typeof payload !== "object") return;
      const projectId = (payload as { projectId?: unknown }).projectId;
      if (typeof projectId === "string" && projectId) setPracticeResourceId(projectId);
    };
    window.addEventListener(GUIDE_ACTION_EVENT, handleGuideAction);
    return () => window.removeEventListener(GUIDE_ACTION_EVENT, handleGuideAction);
  }, [activeGuideId]);

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
    setActiveManual(false);
    setPracticeResourceId(null);
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
    manualConsumed.current = manualGuideId;
    markGuideStarted(ownerId, guide.id);
    setActiveManual(true);
    setPracticeResourceId(null);
    setActiveGuideId(guide.id);
    onManualConsumed?.();
  }, [blocked, manualGuideId, onManualConsumed, ownerId]);

  useEffect(() => {
    if (blocked || activeGuideId || activeManual || !trigger || lastTrigger.current === trigger) return;
    lastTrigger.current = trigger;
    const guide = guideForTrigger(trigger);
    const status = guide ? readGuideProgress(ownerId)[guide.id]?.status : undefined;
    if (!guide || (status && status !== "unseen")) return;
    const timer = window.setTimeout(() => {
      markGuideStarted(ownerId, guide.id);
      setPracticeResourceId(null);
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
    setActiveGuideId(null);
    setActiveManual(false);
    setPracticeResourceId(null);
    if (status === "completed") setCelebrationGuideId(completedId);
  };
  const guide = guideForId(activeGuideId);
  const celebrationGuide = guideForId(celebrationGuideId);
  if (!guide && !celebrationGuide) return null;
  return <>
    {guide && <FeatureGuideOverlay guide={guide} currentRoute={trigger} practiceResourceId={practiceResourceId} onPracticeDecision={onPracticeDecision} onComplete={() => close("completed")} onSkip={() => close("skipped")}/>} 
    {celebrationGuide && <FeatureGuideCelebration guide={celebrationGuide} onClose={() => setCelebrationGuideId(null)}/>} 
  </>;
}
