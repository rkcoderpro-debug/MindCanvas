import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Bell, GripVertical, LocateFixed, Maximize2, Minimize2, Pause, Play, RotateCcw, SkipForward, Timer, Volume2, VolumeX, X } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { clampTimerSeconds, formatTimerTime, initialTimerSessions, normalizeTimerSessions, timerParts, timerSecondsFromParts, tickTimer, toggleTimerSession, TIMER_MODES, type TimerMode, type TimerParts, type TimerSessions } from "../lib/timer";

const STORAGE_KEY = "mindcanvas:learning-hub-timer:v2";
type TimerPosition = { left: number; top: number };

type SavedTimer = {
  sessions: TimerSessions;
  mode: TimerMode;
  open: boolean;
  minimized: boolean;
  sound: boolean;
  position: TimerPosition | null;
};

function readSaved(): SavedTimer {
  const now = Date.now();
  const fallback = initialTimerSessions(now);
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    const rawMode = parsed.mode;
    const mode = TIMER_MODES.includes(rawMode as TimerMode) ? rawMode as TimerMode : "pomodoro";
    const rawPosition = parsed.position as Partial<TimerPosition> | null | undefined;
    const position = rawPosition && Number.isFinite(rawPosition.left) && Number.isFinite(rawPosition.top)
      ? { left: Number(rawPosition.left), top: Number(rawPosition.top) }
      : null;
    return {
      sessions: normalizeTimerSessions(parsed.sessions ?? parsed, now),
      mode,
      open: parsed.open !== false,
      minimized: parsed.minimized === true,
      sound: parsed.sound !== false,
      position,
    };
  } catch {
    return { sessions: fallback, mode: "pomodoro", open: true, minimized: false, sound: true, position: null };
  }
}

function playRing() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    [0, 0.28, 0.56].forEach(offset => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, context.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + offset + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + offset);
      oscillator.stop(context.currentTime + offset + 0.24);
    });
    window.setTimeout(() => void context.close(), 1300);
  } catch { /* Browsers may require a prior user gesture. */ }
}

function safeAreaInsets() {
  try {
    const styles = getComputedStyle(document.documentElement);
    const read = (name: string) => Math.max(0, Number.parseFloat(styles.getPropertyValue(name)) || 0);
    return { top: read("--safe-area-top"), right: read("--safe-area-right"), bottom: read("--safe-area-bottom"), left: read("--safe-area-left") };
  } catch { return { top: 0, right: 0, bottom: 0, left: 0 }; }
}

function clampPosition(position: TimerPosition, element: HTMLElement | null): TimerPosition {
  const rect = element?.getBoundingClientRect();
  const width = rect?.width || element?.offsetWidth || 330;
  const height = rect?.height || element?.offsetHeight || 180;
  const safe = safeAreaInsets();
  const minLeft = 8 + safe.left, minTop = 8 + safe.top;
  const mobileBottomReserve = (window.innerWidth <= 620 ? 74 : 8) + safe.bottom;
  return {
    left: Math.min(Math.max(minLeft, position.left), Math.max(minLeft, window.innerWidth - width - 8 - safe.right)),
    top: Math.min(Math.max(minTop, position.top), Math.max(minTop, window.innerHeight - height - mobileBottomReserve)),
  };
}

type Props = { visible?: boolean };

export default function FloatingTimer({ visible = true }: Props) {
  const { t, language } = useLanguage();
  const [saved] = useState(readSaved);
  const [mode, setMode] = useState<TimerMode>(saved.mode);
  const [sessions, setSessions] = useState<TimerSessions>(saved.sessions);
  const [open, setOpen] = useState(saved.open);
  const [minimized, setMinimized] = useState(saved.minimized);
  const [sound, setSound] = useState(saved.sound);
  const [position, setPosition] = useState<TimerPosition | null>(saved.position);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const timerRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean; element: HTMLElement } | null>(null);
  const suppressLauncherClick = useRef(false);
  const announcedRef = useRef(new Set<string>());

  const activeSession = sessions[mode] ?? sessions.pomodoro;
  const state = activeSession.state;
  const running = activeSession.running;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions, mode, open, minimized, sound, position })); } catch { /* local persistence is optional */ }
  }, [minimized, mode, open, position, sessions, sound]);

  useEffect(() => {
    if (mode !== "clock") return;
    const interval = window.setInterval(() => setClockNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [mode]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setSessions(current => {
        let changed = false;
        const next = { ...current } as TimerSessions;
        for (const timerMode of TIMER_MODES) {
          const session = current[timerMode];
          if (!session.running) continue;
          const delta = Math.floor((now - session.lastTickAt) / 1000);
          if (delta < 1) continue;
          const result = tickTimer(session.state, delta);
          const nextRunning = result.finished && timerMode === "countdown" ? false : session.running;
          next[timerMode] = { ...session, state: result.state, running: nextRunning, lastTickAt: session.lastTickAt + delta * 1_000 };
          changed = true;
          if (result.finished) {
            const key = `${timerMode}:${session.lastTickAt}:${result.state.phase}:${result.state.cycle}`;
            if (!announcedRef.current.has(key)) {
              announcedRef.current.add(key);
              if (sound) playRing();
              if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(t("timerFinished"));
            }
          }
        }
        return changed ? next : current;
      });
    }, 250);
    return () => window.clearInterval(interval);
  }, [sound, t]);

  // Pointer capture is not consistently delivered by every browser when the
  // pointer leaves a small header. A window-level listener keeps dragging
  // continuous on mouse, touch and pen input, including when the pointer is
  // released outside the timer.
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) {
        drag.moved = true;
        suppressLauncherClick.current = true;
      }
      event.preventDefault();
      setPosition(clampPosition({ left: event.clientX - drag.offsetX, top: event.clientY - drag.offsetY }, drag.element));
    };
    const stop = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (position) setPosition(current => current ? clampPosition(current, open ? timerRef.current : launcherRef.current) : current);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open, position]);

  useEffect(() => {
    if (position && open) setPosition(current => current ? clampPosition(current, timerRef.current) : current);
  }, [minimized, open]);

  const display = useMemo(() => {
    if (mode === "clock") return new Date(clockNow).toLocaleTimeString(language === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    if (mode === "stopwatch") return formatTimerTime(state.elapsedSeconds, state.elapsedSeconds >= 3_600);
    return formatTimerTime(state.remainingSeconds, state.remainingSeconds >= 3_600);
  }, [clockNow, language, mode, state]);

  const modeLabel = mode === "pomodoro" ? t("timerPomodoro") : mode === "countdown" ? t("timerCountdown") : mode === "stopwatch" ? t("timerStopwatch") : t("timerClock");
  const positionStyle = position ? { left: position.left, top: position.top, right: "auto", bottom: "auto" } : undefined;

  const selectMode = (nextMode: TimerMode) => setMode(nextMode);
  const toggleRunning = () => {
    if (mode === "clock") return;
    const now = Date.now();
    setSessions(current => {
      return { ...current, [mode]: toggleTimerSession(current[mode], now) };
    });
  };
  const reset = () => {
    setSessions(current => {
      const previous = current[mode];
      const nextState = { ...previous.state, remainingSeconds: Math.max(1, previous.state.focusSeconds), elapsedSeconds: 0, phase: "focus" as const, cycle: 1 };
      if (mode === "clock") nextState.remainingSeconds = 0;
      return { ...current, [mode]: { state: { ...nextState, mode }, running: false, lastTickAt: Date.now() } };
    });
  };
  const updateDuration = (kind: "focus" | "break", parts: TimerParts) => {
    setSessions(current => {
      const session = current[mode];
      const fallback = kind === "break" ? session.state.breakSeconds : session.state.focusSeconds;
      const seconds = Math.max(1, timerSecondsFromParts(parts, fallback));
      const nextState = { ...session.state };
      if (kind === "break" && mode === "pomodoro") {
        nextState.breakSeconds = seconds;
        if (!session.running && nextState.phase === "break") nextState.remainingSeconds = seconds;
      } else {
        nextState.focusSeconds = seconds;
        if (!session.running && (mode === "countdown" || (mode === "pomodoro" && nextState.phase === "focus"))) nextState.remainingSeconds = seconds;
      }
      return { ...current, [mode]: { ...session, state: nextState, lastTickAt: Date.now() } };
    });
  };
  const adjustDuration = (kind: "focus" | "break", delta: number) => {
    setSessions(current => {
      const session = current[mode];
      if (mode === "clock") return current;
      const currentSeconds = kind === "break" && mode === "pomodoro" ? session.state.breakSeconds : session.state.focusSeconds;
      const seconds = Math.max(1, clampTimerSeconds(currentSeconds + delta, currentSeconds));
      const nextState = { ...session.state };
      if (kind === "break" && mode === "pomodoro") {
        nextState.breakSeconds = seconds;
        if (!session.running && nextState.phase === "break") nextState.remainingSeconds = seconds;
      } else {
        nextState.focusSeconds = seconds;
        if (!session.running && (mode === "countdown" || (mode === "pomodoro" && nextState.phase === "focus"))) nextState.remainingSeconds = seconds;
      }
      return { ...current, [mode]: { ...session, state: nextState, lastTickAt: Date.now() } };
    });
  };
  const setPreset = (minutes: number) => updateDuration("focus", { hours: Math.floor(minutes / 60), minutes: minutes % 60, seconds: 0 });
  const requestNotification = () => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
  };
  const resetPosition = () => setPosition(null);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, element: HTMLElement | null, preventDefault = false) => {
    if (event.button !== 0 || !element) return;
    if ((event.target as HTMLElement).closest("button") && element !== launcherRef.current) return;
    if (preventDefault) event.preventDefault();
    suppressLauncherClick.current = false;
    const rect = element.getBoundingClientRect();
    setPosition({ left: rect.left, top: rect.top });
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, startX: event.clientX, startY: event.clientY, moved: false, element };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => beginDrag(event, timerRef.current, true);
  const hideTimer = () => {
    const element = timerRef.current;
    if (element) {
      const rect = element.getBoundingClientRect();
      if (Number.isFinite(rect.left) && Number.isFinite(rect.top)) setPosition({ left: rect.left, top: rect.top });
    }
    setOpen(false);
  };

  const floatingProps = { ref: timerRef, style: positionStyle };
  if (!visible) return null;
  if (!open) return <button ref={launcherRef} className="timer-launcher" style={positionStyle} aria-label={t("timerShow")} title={t("timerShow")} onPointerDown={event => beginDrag(event, event.currentTarget)} onClick={() => { if (suppressLauncherClick.current) { suppressLauncherClick.current = false; return; } setOpen(true); }}><Timer size={18}/><span>{t("timerShow")}</span></button>;

  return <aside {...floatingProps} className={`floating-timer ${minimized ? "minimized" : ""}`} aria-label={t("timer")}>
    <header className="floating-timer-header" onPointerDown={onHeaderPointerDown}>
      <span className="timer-drag-handle"><GripVertical size={14} aria-hidden="true"/><Timer size={16}/>{t("timer")}</span>
      <div className="floating-timer-actions">
        <button className="icon-button" aria-label={t("timerResetPosition")} title={t("timerResetPosition")} onClick={resetPosition}><LocateFixed size={15}/></button>
        <button className="icon-button" aria-label={minimized ? t("timerExpand") : t("timerMinimize")} title={minimized ? t("timerExpand") : t("timerMinimize")} onClick={() => setMinimized(value => !value)}>{minimized ? <Maximize2 size={15}/> : <Minimize2 size={15}/>}</button>
        <button className="icon-button" aria-label={t("timerHide")} title={t("timerHide")} onClick={hideTimer}><X size={15}/></button>
      </div>
    </header>
    {minimized ? <div className="timer-minimized-body" role="status"><div className="timer-mini-readout"><strong>{display}</strong><small>{modeLabel}{mode === "pomodoro" ? ` · ${state.phase === "focus" ? t("timerFocus") : t("timerBreak")}` : ""}</small></div><button className="icon-button" aria-label={running ? t("timerPause") : t("timerStart")} title={running ? t("timerPause") : t("timerStart")} onClick={() => { requestNotification(); toggleRunning(); }}>{running ? <Pause size={16}/> : <Play size={16}/>}</button></div> : <>
      <div className="timer-mode-tabs" role="tablist" aria-label={t("timer")}>{TIMER_MODES.map(timerMode => <button key={timerMode} role="tab" aria-selected={mode === timerMode} className={mode === timerMode ? "active" : ""} onClick={() => selectMode(timerMode)}>{timerMode === "pomodoro" ? t("timerPomodoro") : timerMode === "countdown" ? t("timerCountdown") : timerMode === "stopwatch" ? t("timerStopwatch") : t("timerClock")}</button>)}</div>
      <div className={`timer-display ${state.phase === "break" ? "break" : ""}`}><strong>{display}</strong>{mode === "pomodoro" && <small>{state.phase === "focus" ? t("timerFocus") : t("timerBreak")} · {t("timerCycle")} {state.cycle}</small>}</div>
      <div className="timer-controls"><button className="primary-button" disabled={mode === "clock"} onClick={() => { requestNotification(); toggleRunning(); }}>{running ? <Pause size={16}/> : <Play size={16}/>} {running ? t("timerPause") : t("timerStart")}</button><button className="secondary-button" disabled={mode === "clock"} onClick={reset}><RotateCcw size={15}/>{t("timerReset")}</button>{mode === "pomodoro" && <button className="icon-button" aria-label={t("timerSkipBreak")} title={t("timerSkipBreak")} onClick={() => setSessions(current => ({ ...current, [mode]: { ...current[mode], state: { ...current[mode].state, remainingSeconds: 0 } } }))}><SkipForward size={16}/></button>}</div>
      {mode === "countdown" && <DurationEditor label={t("timerDuration")} seconds={state.focusSeconds} disabled={running} onChange={parts => updateDuration("focus", parts)} onNudge={delta => adjustDuration("focus", delta)} t={t}/>}
      {mode === "pomodoro" && <div className="timer-duration-stack"><DurationEditor label={t("timerFocusDuration")} seconds={state.focusSeconds} disabled={running} onChange={parts => updateDuration("focus", parts)} onNudge={delta => adjustDuration("focus", delta)} t={t}/><DurationEditor label={t("timerBreakDuration")} seconds={state.breakSeconds} disabled={running} onChange={parts => updateDuration("break", parts)} onNudge={delta => adjustDuration("break", delta)} t={t}/></div>}
      {(mode === "countdown" || mode === "pomodoro") && <div className="timer-presets"><span>{t("timerPresets")}</span>{[5, 15, 25, 50, 90].map(minutes => <button key={minutes} type="button" disabled={running} onClick={() => setPreset(minutes)}>{minutes}{t("timerMinutesShort")}</button>)}</div>}
      <div className="timer-settings"><button className="timer-sound" aria-pressed={sound} title={sound ? t("timerSoundOn") : t("timerSoundOff")} onClick={() => setSound(value => !value)}>{sound ? <Volume2 size={15}/> : <VolumeX size={15}/>}<span>{sound ? t("timerSoundOn") : t("timerSoundOff")}</span></button></div>
      <small className="timer-hint"><Bell size={13}/>{t("timerHint")}</small>
    </>}
  </aside>;
}

function DurationEditor({ label, seconds, disabled, onChange, onNudge, t }: { label: string; seconds: number; disabled: boolean; onChange: (parts: TimerParts) => void; onNudge: (delta: number) => void; t: (key: any, values?: Record<string, string | number>) => string }) {
  const toDraft = (value: number) => Object.fromEntries(Object.entries(timerParts(value)).map(([key, item]) => [key, String(item)])) as Record<keyof TimerParts, string>;
  const [draft, setDraft] = useState<Record<keyof TimerParts, string>>(() => toDraft(seconds));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setDraft(toDraft(seconds)); }, [seconds]);
  const update = (key: keyof TimerParts, value: string) => { editing.current = true; setDraft(current => ({ ...current, [key]: value })); };
  const commit = () => {
    editing.current = false;
    const next = (Object.keys(draft) as Array<keyof TimerParts>).reduce((parts, key) => {
      const parsed = Number(draft[key]);
      const max = key === "hours" ? 24 : 59;
      return { ...parts, [key]: Math.max(0, Math.min(max, Number.isFinite(parsed) ? Math.floor(parsed) : 0)) };
    }, {} as TimerParts);
    setDraft(toDraft(timerSecondsFromParts(next, seconds)));
    onChange(next);
  };
  return <fieldset className="timer-duration-editor"><legend>{label}</legend><div className="timer-duration-fields">{(["hours", "minutes", "seconds"] as Array<keyof TimerParts>).map(key => <label key={key}><span>{key === "hours" ? t("timerHours") : key === "minutes" ? t("timerMinutesShort") : t("timerSeconds")}</span><input type="number" min="0" max={key === "hours" ? 24 : 59} value={draft[key]} disabled={disabled} onChange={event => update(key, event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(); event.currentTarget.blur(); } }}/></label>)}</div><div className="timer-duration-nudges"><button type="button" disabled={disabled} onClick={() => onNudge(-60)}>{t("timerMinusMinute")}</button><button type="button" disabled={disabled} onClick={() => onNudge(60)}>{t("timerPlusMinute")}</button><button type="button" disabled={disabled} onClick={() => onNudge(300)}>{t("timerPlusFiveMinutes")}</button></div></fieldset>;
}
