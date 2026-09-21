import { useEffect, useRef, useState } from "react";
import FeatureGuideOverlay from "./FeatureGuideOverlay";
import FeatureGuideCelebration from "./FeatureGuideCelebration";
import { finishGuide, GUIDE_REQUEST_EVENT, guideForId, guideForTrigger, markGuideStarted, readGuideProgress } from "../lib/featureGuides";

type Props = {
  ownerId: string | null;
  trigger?: string | null;
  manualGuideId?: string | null;
  onManualConsumed?: () => void;
  blocked?: boolean;
};

export default function FeatureGuideManager({ ownerId, trigger = null, manualGuideId = null, onManualConsumed, blocked = false }: Props) {
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);
  const [activeManual, setActiveManual] = useState(false);
  const [requestedGuideId, setRequestedGuideId] = useState<string | null>(null);
  const [celebrationGuideId, setCelebrationGuideId] = useState<string | null>(null);
  const lastTrigger = useRef<string | null>(null);
  const manualConsumed = useRef<string | null>(null);

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
    if (status === "completed") setCelebrationGuideId(completedId);
  };
  const guide = guideForId(activeGuideId);
  const celebrationGuide = guideForId(celebrationGuideId);
  if (!guide && !celebrationGuide) return null;
  return <>
    {guide && <FeatureGuideOverlay guide={guide} onComplete={() => close("completed")} onSkip={() => close("skipped")}/>} 
    {celebrationGuide && <FeatureGuideCelebration guide={celebrationGuide} onClose={() => setCelebrationGuideId(null)}/>} 
  </>;
}
