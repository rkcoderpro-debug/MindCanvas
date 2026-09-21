import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, MousePointer2, X } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { GUIDE_ACTION_EVENT, practiceActionsForGuide, type GuideDefinition, type GuideRequiredAction, type GuideStep, type GuideStepCompletion } from "../lib/featureGuides";

type Box = { left: number; top: number; width: number; height: number };
type CursorPlacement = { left: number; top: number; angle: number };

type Props = {
  guide: GuideDefinition;
  currentRoute?: string | null;
  practiceResourceId?: string | null;
  onComplete: () => void;
  onSkip: () => void;
  onPracticeDecision?: (decision: "keep" | "trash", resourceId: string) => void | Promise<void>;
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
  const spaceAbove = box.top;
  const spaceBelow = window.innerHeight - (box.top + box.height);
  const spaceLeft = box.left;
  const spaceRight = window.innerWidth - (box.left + box.width);
  // Keep the animated pointer outside the focus ring. It points toward the
  // target instead of sitting on top of the button the user must press.
  if (spaceAbove >= size + gap) return { left: horizontal, top: box.top - size - gap, angle: -135 };
  if (spaceBelow >= size + gap) return { left: horizontal, top: box.top + box.height + gap, angle: 45 };
  if (spaceLeft >= size + gap) return { left: box.left - size - gap, top: vertical, angle: 135 };
  if (spaceRight >= size + gap) return { left: box.left + box.width + gap, top: vertical, angle: -45 };
  return { left: horizontal, top: clamp(box.top - size - gap, 12, Math.max(12, window.innerHeight - size - 12)), angle: -135 };
}

function actionsForStep(guide: GuideDefinition, step: GuideStep, isPractice: boolean): GuideRequiredAction[] {
  const completion = step.completion;
  if (completion?.type === "action" || completion?.type === "manual") return completion.actions ?? [];
  return isPractice ? practiceActionsForGuide(guide.id) : [];
}

function completionForStep(step: GuideStep, isPractice: boolean): GuideStepCompletion {
  if (step.completion) return step.completion;
  if (isPractice) return { type: "manual", actions: [] };
  return { type: "click", selector: step.target };
}

function readInputReady(completion: Extract<GuideStepCompletion, { type: "input" }>) {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(completion.selector);
  if (!element) return false;
  const value = "value" in element ? element.value : "";
  return value.trim().length >= (completion.minLength ?? 1);
}

function readStateReady(completion: Extract<GuideStepCompletion, { type: "state" }>) {
  const element = document.querySelector<HTMLElement>(completion.selector);
  if (!element) return false;
  if (!completion.attribute) return true;
  return element.getAttribute(completion.attribute) === (completion.value ?? "true");
}

export default function FeatureGuideOverlay({ guide, currentRoute = null, practiceResourceId = null, onComplete, onSkip, onPracticeDecision }: Props) {
  const { language, t } = useLanguage();
  const [stepIndex, setStepIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [targetFound, setTargetFound] = useState(false);
  const [targetActivated, setTargetActivated] = useState(false);
  const [actionNames, setActionNames] = useState<string[]>([]);
  const actionNamesRef = useRef<string[]>([]);
  const [readinessTick, setReadinessTick] = useState(0);
  const [practicePanelCollapsed, setPracticePanelCollapsed] = useState(false);
  const [decisionPending, setDecisionPending] = useState<"keep" | "trash" | null>(null);
  const [decisionError, setDecisionError] = useState("");
  const step = guide.steps[stepIndex] ?? guide.steps[0];
  const isPractice = step.kind === "practice" || !step.target;
  const completion = completionForStep(step, isPractice);
  const requiredActions = actionsForStep(guide, step, isPractice);
  const routeSkipped = Boolean(step.skipWhenRoute && currentRoute === step.skipWhenRoute);
  const title = language === "vi" ? step.titleVi : step.titleEn;
  const body = language === "vi" ? step.bodyVi : step.bodyEn;
  const isCanvasPracticeFinal = guide.id === "canvas-controls" && isPractice && stepIndex === guide.steps.length - 1;
  const showBackdrop = Boolean(box) && !isPractice;
  const targetMissing = !box && !routeSkipped && !isPractice;

  const measure = useCallback(() => {
    const next = targetBox(findTarget(step));
    setBox(next);
    setTargetFound(Boolean(next));
    setReadinessTick(value => value + 1);
  }, [step]);

  useEffect(() => {
    setTargetActivated(false);
    setDecisionError("");
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

  // A practice checklist belongs to the current practice step. Actions from
  // earlier guided steps must never satisfy the final hands-on task.
  useEffect(() => {
    actionNamesRef.current = [];
    setActionNames([]);
    setPracticePanelCollapsed(false);
  }, [stepIndex, isPractice]);

  useEffect(() => {
    const handleGuideAction = (event: Event) => {
      const name = (event as CustomEvent<{ name?: string }>).detail?.name;
      if (!name) return;
      const next = actionNamesRef.current.includes(name) ? actionNamesRef.current : [...actionNamesRef.current, name];
      actionNamesRef.current = next;
      setActionNames(next);
      setReadinessTick(value => value + 1);
    };
    window.addEventListener(GUIDE_ACTION_EVENT, handleGuideAction);
    return () => window.removeEventListener(GUIDE_ACTION_EVENT, handleGuideAction);
  }, []);

  const actionsReady = requiredActions.length > 0 && requiredActions.every(action => actionNames.includes(action.id));
  const ready = useMemo(() => {
    void readinessTick;
    if (routeSkipped) return true;
    if (isPractice) return actionsReady || requiredActions.length === 0;
    if (!targetFound) return false;
    if (completion.type === "click") return targetActivated;
    if (completion.type === "input") return readInputReady(completion);
    if (completion.type === "state") return readStateReady(completion);
    if (completion.type === "route") return currentRoute === completion.route;
    if (completion.type === "action") return actionsReady;
    return completion.actions?.every(action => actionNames.includes(action.id)) ?? true;
  }, [actionNames, actionsReady, completion, currentRoute, isPractice, readinessTick, requiredActions, routeSkipped, targetActivated, targetFound]);

  const next = useCallback(() => {
    if (!ready || isCanvasPracticeFinal) return;
    if (stepIndex >= guide.steps.length - 1) onComplete();
    else setStepIndex(value => value + 1);
  }, [guide.steps.length, isCanvasPracticeFinal, onComplete, ready, stepIndex]);
  const advanceAfterClick = useCallback(() => {
    if (stepIndex >= guide.steps.length - 1) onComplete();
    else setStepIndex(value => value + 1);
  }, [guide.steps.length, onComplete, stepIndex]);

  useEffect(() => {
    if (isPractice) return;
    const handleTargetClick = (event: MouseEvent) => {
      const target = findTarget(step);
      const eventTarget = event.target;
      if (!target || !(eventTarget instanceof Element) || !target.contains(eventTarget)) return;
      setTargetActivated(true);
      if (completion.type === "click") window.setTimeout(advanceAfterClick, 120);
    };
    document.addEventListener("click", handleTargetClick, true);
    return () => document.removeEventListener("click", handleTargetClick, true);
  }, [advanceAfterClick, completion.type, isPractice, step]);

  const decidePractice = useCallback(async (decision: "keep" | "trash") => {
    if (!practiceResourceId || decisionPending) return;
    setDecisionPending(decision);
    setDecisionError("");
    try {
      await onPracticeDecision?.(decision, practiceResourceId);
      onComplete();
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : t("error"));
      setDecisionPending(null);
    }
  }, [decisionPending, onComplete, onPracticeDecision, practiceResourceId, t]);

  const popover = useMemo(() => {
    const width = Math.min(400, window.innerWidth - 32);
    if (isPractice) return { left: Math.max(16, window.innerWidth - width - 18), top: Math.max(16, window.innerHeight - 18 - 420), width };
    if (!box) return { left: Math.max(16, window.innerWidth - width - 18), top: 18, width };
    const left = clamp(box.left + box.width / 2 - width / 2, 16, Math.max(16, window.innerWidth - width - 16));
    const below = box.top + box.height + 18;
    const heightEstimate = 320;
    const top = below + heightEstimate < window.innerHeight ? below : clamp(box.top - heightEstimate - 18, 16, Math.max(16, window.innerHeight - heightEstimate - 16));
    return { left, top, width };
  }, [box, isPractice]);

  const pointer = showBackdrop && box ? cursorPlacement(box) : null;
  const statusText = isPractice
    ? actionsReady ? t("guidePracticeReady") : t("guidePracticeNeedsActions")
    : routeSkipped ? t("guideRouteAlreadyOpen")
      : !targetFound ? t("guideWaitingForTarget")
        : ready ? t("guideStepReady") : completion.type === "action" ? t("guideWaitingForAction") : t("guideWaitingForClick");
  const panelClass = ["feature-guide-popover", isPractice ? "feature-guide-practice-panel" : "", targetMissing ? "feature-guide-target-missing" : ""].filter(Boolean).join(" ");
  const panelStyle = isPractice || targetMissing ? { left: popover.left, top: popover.top, width: popover.width } : { left: popover.left, top: popover.top, width: popover.width };

  const overlay = <div className={`feature-guide-root ${isPractice ? "feature-guide-practice-mode" : ""} ${targetMissing ? "feature-guide-target-missing-mode" : ""}`} role="dialog" aria-modal="false" aria-label={title}>
    {showBackdrop && <div className="feature-guide-backdrop" aria-hidden="true"/>}
    {showBackdrop && box && <div className="feature-guide-focus" aria-hidden="true" style={{ left: box.left - 8, top: box.top - 8, width: box.width + 16, height: box.height + 16 }}/>} 
    {pointer && <div className="feature-guide-cursor" aria-hidden="true" style={{ left: pointer.left, top: pointer.top, "--cursor-angle": `${pointer.angle}deg` } as CSSProperties}><MousePointer2 size={27}/></div>}
    <section className={panelClass} style={panelStyle}>
      <header className={isPractice ? "feature-guide-drag-handle" : undefined}><div><span className="feature-guide-kicker">{guide.titleVi === guide.titleEn ? guide.titleEn : language === "vi" ? "HƯỚNG DẪN TÍNH NĂNG" : "FEATURE GUIDE"}</span><strong>{title}</strong></div><div className="feature-guide-header-actions">{isPractice && <button type="button" className="icon-button" aria-label={practicePanelCollapsed ? t("guidePracticeExpand") : t("guidePracticeCollapse")} onClick={() => setPracticePanelCollapsed(value => !value)}>{practicePanelCollapsed ? <ChevronUp size={17}/> : <ChevronDown size={17}/>}</button>}<button type="button" className="icon-button" aria-label={t("close")} onClick={onSkip}><X size={17}/></button></div></header>
      {!practicePanelCollapsed && <>
        <p>{body}</p>
        {isPractice && <div className="feature-guide-checklist" aria-label={language === "vi" ? "Danh sách thao tác cần hoàn thành" : "Required actions"}>{requiredActions.map(action => <div className={actionNames.includes(action.id) ? "complete" : ""} key={action.id}><span>{actionNames.includes(action.id) ? <Check size={13}/> : <i/>}</span><small>{language === "vi" ? action.labelVi : action.labelEn}</small></div>)}</div>}
        <div className={`feature-guide-status ${ready ? "ready" : ""}`} role="status"><MousePointer2 size={14}/>{decisionError || statusText}</div>
        <div className="feature-guide-progress" aria-label={`${stepIndex + 1}/${guide.steps.length}`}><span>{stepIndex + 1}/{guide.steps.length}</span><i><b style={{ width: `${((stepIndex + 1) / guide.steps.length) * 100}%` }}/></i></div>
        {isCanvasPracticeFinal && practiceResourceId && <div className="feature-guide-practice-decision"><strong>{t("guidePracticeCanvasDecision")}</strong><div><button type="button" className="secondary-button" disabled={!!decisionPending} onClick={() => void decidePractice("trash")}>{decisionPending === "trash" ? t("saving") : t("guidePracticeCanvasTrash")}</button><button type="button" className="primary-button" disabled={!!decisionPending} onClick={() => void decidePractice("keep")}>{decisionPending === "keep" ? t("saving") : t("guidePracticeCanvasKeep")}</button></div></div>}
        <div className="feature-guide-actions">
          <button type="button" className="text-button" onClick={onSkip}>{t("guideSkip")}</button>
          {stepIndex > 0 && <button type="button" className="secondary-button" onClick={() => setStepIndex(value => Math.max(0, value - 1))}><ArrowLeft size={14}/>{t("guideBack")}</button>}
          {!isCanvasPracticeFinal || !practiceResourceId ? <button type="button" className="primary-button feature-guide-next" disabled={!ready} onClick={next}>{isPractice ? t("guidePracticeDone") : t("guideNext")}<ArrowRight size={14}/></button> : <span className="feature-guide-decision-hint">{t("guidePracticeCanvasChoose")}</span>}
        </div>
      </>}
    </section>
  </div>;

  return createPortal(overlay, document.body);
}
