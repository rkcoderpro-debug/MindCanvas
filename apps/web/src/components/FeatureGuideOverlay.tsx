import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, MousePointer2, X } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import type { GuideDefinition, GuideStep } from "../lib/featureGuides";

type Box = { left: number; top: number; width: number; height: number };

type Props = {
  guide: GuideDefinition;
  onComplete: () => void;
  onSkip: () => void;
};

function findTarget(step: GuideStep) {
  try { return document.querySelector<HTMLElement>(step.target); } catch { return null; }
}

function targetBox(target: HTMLElement | null): Box | null {
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function FeatureGuideOverlay({ guide, onComplete, onSkip }: Props) {
  const { language, t } = useLanguage();
  const [stepIndex, setStepIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [targetFound, setTargetFound] = useState(false);
  const [targetMissingFor, setTargetMissingFor] = useState(0);
  const step = guide.steps[stepIndex] ?? guide.steps[0];
  const title = language === "vi" ? step.titleVi : step.titleEn;
  const body = language === "vi" ? step.bodyVi : step.bodyEn;

  const measure = useCallback(() => {
    const next = targetBox(findTarget(step));
    setBox(next);
    setTargetFound(Boolean(next));
  }, [step]);

  useEffect(() => {
    measure();
    const interval = window.setInterval(measure, 180);
    const onViewportChange = () => measure();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [measure]);

  useEffect(() => {
    setTargetMissingFor(0);
    if (targetFound) return;
    const interval = window.setInterval(() => setTargetMissingFor(value => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [stepIndex, targetFound]);

  useEffect(() => {
    const handleTargetClick = (event: MouseEvent) => {
      const target = findTarget(step);
      const eventTarget = event.target;
      if (!target || !(eventTarget instanceof Node) || !target.contains(eventTarget)) return;
      window.setTimeout(() => {
        if (stepIndex >= guide.steps.length - 1) onComplete();
        else setStepIndex(value => value + 1);
      }, 120);
    };
    document.addEventListener("click", handleTargetClick, true);
    return () => document.removeEventListener("click", handleTargetClick, true);
  }, [guide.steps.length, onComplete, step, stepIndex]);

  const popover = useMemo(() => {
    const width = Math.min(380, window.innerWidth - 32);
    if (!box) return { left: Math.max(16, (window.innerWidth - width) / 2), top: Math.max(20, window.innerHeight * 0.2), width };
    const left = clamp(box.left + box.width / 2 - width / 2, 16, Math.max(16, window.innerWidth - width - 16));
    const below = box.top + box.height + 18;
    const heightEstimate = 245;
    const top = below + heightEstimate < window.innerHeight ? below : clamp(box.top - heightEstimate - 18, 16, Math.max(16, window.innerHeight - heightEstimate - 16));
    return { left, top, width };
  }, [box]);

  const next = () => {
    if (stepIndex >= guide.steps.length - 1) onComplete();
    else setStepIndex(value => value + 1);
  };

  const overlay = <div className="feature-guide-root" role="dialog" aria-modal="true" aria-label={title}>
    <div className="feature-guide-backdrop" aria-hidden="true"/>
    {box && <div className="feature-guide-focus" aria-hidden="true" style={{ left: box.left - 8, top: box.top - 8, width: box.width + 16, height: box.height + 16 }}/>} 
    {box && <div className="feature-guide-cursor" aria-hidden="true" style={{ left: box.left + box.width / 2 - 13, top: box.top + box.height / 2 - 13 }}><MousePointer2 size={27}/></div>}
    <section className="feature-guide-popover" style={{ left: popover.left, top: popover.top, width: popover.width }}>
      <header><div><span className="feature-guide-kicker">{guide.titleVi === guide.titleEn ? guide.titleEn : language === "vi" ? "HƯỚNG DẪN TÍNH NĂNG" : "FEATURE GUIDE"}</span><strong>{title}</strong></div><button type="button" className="icon-button" aria-label={t("close")} onClick={onSkip}><X size={17}/></button></header>
      <p>{body}</p>
      <div className="feature-guide-progress" aria-label={`${stepIndex + 1}/${guide.steps.length}`}><span>{stepIndex + 1}/{guide.steps.length}</span><i><b style={{ width: `${((stepIndex + 1) / guide.steps.length) * 100}%` }}/></i></div>
      <div className="feature-guide-actions">
        <button type="button" className="text-button" onClick={onSkip}>{t("guideSkip")}</button>
        {stepIndex > 0 && <button type="button" className="secondary-button" onClick={() => setStepIndex(value => Math.max(0, value - 1))}><ArrowLeft size={14}/>{t("guideBack")}</button>}
        {targetFound ? <small className="feature-guide-waiting"><MousePointer2 size={14}/>{t("guideWaitingForClick")}</small> : <button type="button" className="primary-button" onClick={next}>{targetMissingFor > 2 ? t("guideTargetMissing") : t("guideNext")}<ArrowRight size={14}/></button>}
      </div>
    </section>
  </div>;

  return createPortal(overlay, document.body);
}
