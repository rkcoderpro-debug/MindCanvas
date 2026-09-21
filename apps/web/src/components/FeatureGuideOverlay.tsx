import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, MousePointer2, X } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import type { GuideDefinition, GuideStep } from "../lib/featureGuides";

type Box = { left: number; top: number; width: number; height: number };
type CursorPlacement = { left: number; top: number; angle: number };

type Props = {
  guide: GuideDefinition;
  onComplete: () => void;
  onSkip: () => void;
};

function findTarget(step: GuideStep) {
  if (!step.target) return null;
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

function cursorPlacement(box: Box): CursorPlacement {
  const size = 27;
  const gap = 16;
  const half = size / 2;
  const horizontal = clamp(box.left + box.width / 2 - half, 12, Math.max(12, window.innerWidth - size - 12));
  const vertical = clamp(box.top + box.height / 2 - half, 12, Math.max(12, window.innerHeight - size - 12));
  // Keep the pointer outside the focus ring. Prefer the side with the most
  // breathing room so the animation never covers the control it describes.
  const spaceAbove = box.top;
  const spaceBelow = window.innerHeight - (box.top + box.height);
  const spaceLeft = box.left;
  const spaceRight = window.innerWidth - (box.left + box.width);
  if (spaceAbove >= size + gap) return { left: horizontal, top: box.top - size - gap, angle: -135 };
  if (spaceBelow >= size + gap) return { left: horizontal, top: box.top + box.height + gap, angle: 45 };
  if (spaceLeft >= size + gap) return { left: box.left - size - gap, top: vertical, angle: 135 };
  if (spaceRight >= size + gap) return { left: box.left + box.width + gap, top: vertical, angle: -45 };
  return { left: horizontal, top: clamp(box.top - size - gap, 12, Math.max(12, window.innerHeight - size - 12)), angle: -135 };
}

export default function FeatureGuideOverlay({ guide, onComplete, onSkip }: Props) {
  const { language, t } = useLanguage();
  const [stepIndex, setStepIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [targetFound, setTargetFound] = useState(false);
  const [targetMissingFor, setTargetMissingFor] = useState(0);
  const step = guide.steps[stepIndex] ?? guide.steps[0];
  const isPractice = step.kind === "practice" || !step.target;
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
    if (targetFound || isPractice) return;
    const interval = window.setInterval(() => setTargetMissingFor(value => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [isPractice, stepIndex, targetFound]);

  useEffect(() => {
    if (isPractice) return;
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
  }, [guide.steps.length, isPractice, onComplete, step, stepIndex]);

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

  const pointer = box ? cursorPlacement(box) : null;

  const overlay = <div className="feature-guide-root" role="dialog" aria-modal="true" aria-label={title}>
    <div className="feature-guide-backdrop" aria-hidden="true"/>
    {box && <div className="feature-guide-focus" aria-hidden="true" style={{ left: box.left - 8, top: box.top - 8, width: box.width + 16, height: box.height + 16 }}/>} 
    {pointer && <div className="feature-guide-cursor" aria-hidden="true" style={{ left: pointer.left, top: pointer.top, "--cursor-angle": `${pointer.angle}deg` } as CSSProperties}><MousePointer2 size={27}/></div>}
    <section className="feature-guide-popover" style={{ left: popover.left, top: popover.top, width: popover.width }}>
      <header><div><span className="feature-guide-kicker">{guide.titleVi === guide.titleEn ? guide.titleEn : language === "vi" ? "HƯỚNG DẪN TÍNH NĂNG" : "FEATURE GUIDE"}</span><strong>{title}</strong></div><button type="button" className="icon-button" aria-label={t("close")} onClick={onSkip}><X size={17}/></button></header>
      <p>{body}</p>
      <div className="feature-guide-progress" aria-label={`${stepIndex + 1}/${guide.steps.length}`}><span>{stepIndex + 1}/{guide.steps.length}</span><i><b style={{ width: `${((stepIndex + 1) / guide.steps.length) * 100}%` }}/></i></div>
      <div className="feature-guide-actions">
        <button type="button" className="text-button" onClick={onSkip}>{t("guideSkip")}</button>
        {stepIndex > 0 && <button type="button" className="secondary-button" onClick={() => setStepIndex(value => Math.max(0, value - 1))}><ArrowLeft size={14}/>{t("guideBack")}</button>}
        {isPractice ? <button type="button" className="primary-button feature-guide-practice-done" onClick={next}>{t("guidePracticeDone")}<ArrowRight size={14}/></button> : targetFound ? <small className="feature-guide-waiting"><MousePointer2 size={14}/>{t("guideWaitingForClick")}</small> : <button type="button" className="primary-button" onClick={next}>{targetMissingFor > 2 ? t("guideTargetMissing") : t("guideNext")}<ArrowRight size={14}/></button>}
      </div>
    </section>
  </div>;

  return createPortal(overlay, document.body);
}
