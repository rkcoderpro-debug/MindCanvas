import { useEffect, useRef, useState, type AnimationEvent as ReactAnimationEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useLearningActive } from "../lib/learningNavigation";
import type { useLanguage } from "../lib/i18n";

type FlashcardReviewProps = {
  target: { id: string; front: ReactNode; back: ReactNode; sourcePage?: number | null };
  index: number;
  total: number;
  ratingBusy?: boolean;
  showAnswer: boolean;
  onToggleAnswer: () => void;
  onSwipe?: (rating: "again" | "good") => void;
  status?: ReactNode;
  revealedActions?: ReactNode;
  footer?: ReactNode;
  t: ReturnType<typeof useLanguage>["t"];
};

export default function FlashcardReview({ target, index, total, ratingBusy, showAnswer, onToggleAnswer, onSwipe, status, revealedActions, footer, t }: FlashcardReviewProps) {
  const learningActive = useLearningActive();
  const pointerStart = useRef<{ x: number; y: number; id: number; axis?: "x" | "y" } | null>(null);
  const skipClick = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [turn, setTurn] = useState<"front" | "back" | null>(null);
  const answerRef = useRef<HTMLButtonElement>(null);
  const sceneRef = useRef<HTMLElement>(null);
  const flip = () => {
    if (ratingBusy) return;
    if (answerRef.current && document.activeElement === answerRef.current) sceneRef.current?.focus({ preventScroll: true });
    setTurn(showAnswer ? "front" : "back");
    onToggleAnswer();
  };
  useEffect(() => { pointerStart.current = null; skipClick.current = false; setDragX(0); setTurn(null); }, [target.id, index]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (ratingBusy || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
        (event.target instanceof HTMLElement && event.target.closest("button,input,textarea,select,summary,a,[contenteditable=true],dialog"))) return;
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); flip(); }
      if (onSwipe && showAnswer && event.key === "ArrowLeft") { event.preventDefault(); onSwipe?.("again"); }
      if (onSwipe && showAnswer && event.key === "ArrowRight") { event.preventDefault(); onSwipe?.("good"); }
    };
    if (!learningActive) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [learningActive, onSwipe, onToggleAnswer, ratingBusy, showAnswer, target]);

  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (ratingBusy || event.button !== 0 || event.isPrimary === false || pointerStart.current) return;
    skipClick.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    // Leave touch scrolling to the browser. Capture mouse drags even when they leave the card.
    if (event.pointerType === "mouse") {
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
  };
  const pointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const start = pointerStart.current;
    if (!start || start.id !== event.pointerId) return;
    const x = event.clientX - start.x, y = event.clientY - start.y;
    if (!start.axis && Math.hypot(x, y) >= 10) start.axis = Math.abs(x) > Math.abs(y) ? "x" : "y";
    if (onSwipe && showAnswer && start.axis === "x") setDragX(x);
  };
  const cancelPointer = () => { pointerStart.current = null; setDragX(0); };
  const pointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const start = pointerStart.current;
    if (!start || start.id !== event.pointerId) return;
    const x = event.clientX - start.x, y = event.clientY - start.y;
    cancelPointer();
    if (start.axis || Math.hypot(x, y) >= 10) skipClick.current = true;
    if (onSwipe && !ratingBusy && showAnswer && start.axis !== "y" && Math.abs(x) >= 72 && Math.abs(x) > Math.abs(y)) onSwipe?.(x > 0 ? "good" : "again");
  };
  const endTurn = (event: ReactAnimationEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) setTurn(null); };
  return <div className="review-panel">
    <div className="review-progress"><span>{t("reviewProgress", { current: index + 1, total })}</span>{status}</div>
    <progress className="review-session-progress" value={index} max={Math.max(1, total)} aria-label={t("sessionProgress")}/>
    <article className={`review-card-scene ${showAnswer ? "is-flipped" : ""}`} role="button" aria-pressed={showAnswer}
      aria-disabled={ratingBusy} tabIndex={0} aria-label={showAnswer ? t("answerSide") : t("questionSide")} ref={sceneRef}
      onClick={() => { if (skipClick.current) { skipClick.current = false; return; } flip(); }}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelPointer}
      onLostPointerCapture={cancelPointer} onDragStart={event => event.preventDefault()}>
      <div className="review-card-inner" style={{ transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)` }}>
        <div key={`${target.id}:${showAnswer ? "back" : "front"}`} className={`review-card-face ${showAnswer ? "back" : "front"}`}
          data-turn={turn ?? undefined} onAnimationEnd={endTurn}>
          <span className="flashcard-label">{showAnswer ? t("answerSide") : t("questionSide")}</span>
          <div className="review-card-text" tabIndex={0}><p>{showAnswer ? target.back : target.front}</p></div>
          <small>{showAnswer ? t("flipBackHint") : t("flipCardHint")}</small>
        </div>
      </div>
      {showAnswer && dragX !== 0 && <span className={`review-swipe-feedback ${dragX > 0 ? "remembered" : "forgotten"}`}>
        {dragX > 0 ? t("remembered") : t("forgotten")}
      </span>}
    </article>
    <div className="review-controls">
      {target.sourcePage && <span className="review-source">{t("page")} {target.sourcePage}</span>}
      {showAnswer ? revealedActions : <button ref={answerRef} className="primary-button show-answer" disabled={ratingBusy} onClick={flip}>{t("showAnswer")}</button>}
      {footer}
    </div>
  </div>;
}
