import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Clock3, Maximize2, Minimize2, Pause, Play, RotateCcw, SkipForward, Timer, Volume2, VolumeX, X } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { clampTimerSeconds, formatTimerTime, initialTimerState, tickTimer, type TimerMode, type TimerState } from "../lib/timer";

const STORAGE_KEY = "mindcanvas:learning-hub-timer:v1";

function readSaved(): { state: TimerState; open: boolean; minimized: boolean; sound: boolean } {
  const fallback = initialTimerState();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      state: { ...fallback, ...(parsed.state ?? {}), mode: parsed.state?.mode ?? fallback.mode, phase: parsed.state?.phase === "break" ? "break" : "focus" },
      open: parsed.open !== false,
      minimized: parsed.minimized === true,
      sound: parsed.sound !== false,
    };
  } catch {
    return { state: fallback, open: true, minimized: false, sound: true };
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

export default function FloatingTimer() {
  const { t, language } = useLanguage();
  const [saved] = useState(readSaved);
  const [state, setState] = useState<TimerState>(saved.state);
  const [open, setOpen] = useState(saved.open);
  const [minimized, setMinimized] = useState(saved.minimized);
  const [sound, setSound] = useState(saved.sound);
  const [running, setRunning] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const lastTick = useRef(Date.now());

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, open, minimized, sound })); } catch { /* local persistence is optional */ }
  }, [minimized, open, sound, state]);

  useEffect(() => {
    if (state.mode !== "clock") return;
    const interval = window.setInterval(() => setClockNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [state.mode]);

  useEffect(() => {
    if (!running) return;
    lastTick.current = Date.now();
    const interval = window.setInterval(() => {
      const now = Date.now();
      const delta = Math.floor((now - lastTick.current) / 1000);
      if (delta < 1) return;
      lastTick.current += delta * 1000;
      setState(current => {
        const result = tickTimer(current, delta);
        if (result.finished) {
          if (sound) playRing();
          if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(t("timerFinished"));
          if (current.mode === "countdown") setRunning(false);
        }
        return result.state;
      });
    }, 250);
    return () => window.clearInterval(interval);
  }, [running, sound, t]);

  const display = useMemo(() => {
    if (state.mode === "clock") return new Date().toLocaleTimeString(language === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    if (state.mode === "stopwatch") return formatTimerTime(state.elapsedSeconds, state.elapsedSeconds >= 3_600);
    return formatTimerTime(state.remainingSeconds, state.remainingSeconds >= 3_600);
  }, [clockNow, language, state]);

  const selectMode = (mode: TimerMode) => {
    setRunning(false);
    setState(current => ({ ...current, mode, remainingSeconds: mode === "pomodoro" ? current.focusSeconds : mode === "countdown" ? current.focusSeconds : current.remainingSeconds, elapsedSeconds: mode === "stopwatch" ? current.elapsedSeconds : current.elapsedSeconds, phase: "focus", cycle: 1 }));
  };
  const reset = () => {
    setRunning(false);
    setState(current => ({ ...initialTimerState(current.mode), focusSeconds: current.focusSeconds, breakSeconds: current.breakSeconds, remainingSeconds: current.mode === "stopwatch" ? 0 : current.focusSeconds }));
  };
  const requestNotification = () => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
  };
  const setFocusMinutes = (value: string) => {
    const seconds = clampTimerSeconds(Number(value) * 60, state.focusSeconds);
    setState(current => ({ ...current, focusSeconds: seconds, remainingSeconds: !running && (current.mode === "countdown" || current.mode === "pomodoro") ? seconds : current.remainingSeconds }));
  };
  const setBreakMinutes = (value: string) => setState(current => ({ ...current, breakSeconds: clampTimerSeconds(Number(value) * 60, current.breakSeconds) }));

  if (!open) return <button className="timer-launcher" aria-label={t("timerShow")} title={t("timerShow")} onClick={() => setOpen(true)}><Timer size={18}/><span>{t("timer")}</span></button>;

  return <aside className={`floating-timer ${minimized ? "minimized" : ""}`} aria-label={t("timer")}>
    <header className="floating-timer-header">
      <span><Timer size={16}/>{t("timer")}</span>
      <div className="floating-timer-actions">
        <button className="icon-button" aria-label={minimized ? t("timerExpand") : t("timerMinimize")} title={minimized ? t("timerExpand") : t("timerMinimize")} onClick={() => setMinimized(value => !value)}>{minimized ? <Maximize2 size={15}/> : <Minimize2 size={15}/>}</button>
        <button className="icon-button" aria-label={t("timerHide")} title={t("timerHide")} onClick={() => setOpen(false)}><X size={15}/></button>
      </div>
    </header>
    {!minimized && <>
      <div className="timer-mode-tabs" role="tablist" aria-label={t("timer")}>{(["pomodoro", "countdown", "stopwatch", "clock"] as TimerMode[]).map(mode => <button key={mode} role="tab" aria-selected={state.mode === mode} className={state.mode === mode ? "active" : ""} onClick={() => selectMode(mode)}>{mode === "pomodoro" ? t("timerPomodoro") : mode === "countdown" ? t("timerCountdown") : mode === "stopwatch" ? t("timerStopwatch") : t("timerClock")}</button>)}</div>
      <div className={`timer-display ${state.phase === "break" ? "break" : ""}`}><strong>{display}</strong>{state.mode === "pomodoro" && <small>{state.phase === "focus" ? t("timerFocus") : t("timerBreak")} · {t("timerCycle")} {state.cycle}</small>}</div>
      <div className="timer-controls"><button className="primary-button" onClick={() => { requestNotification(); lastTick.current = Date.now(); setRunning(value => !value); }}>{running ? <Pause size={16}/> : <Play size={16}/>} {running ? t("timerPause") : t("timerStart")}</button><button className="secondary-button" onClick={reset}><RotateCcw size={15}/>{t("timerReset")}</button>{state.mode === "pomodoro" && <button className="icon-button" aria-label={t("timerSkipBreak")} title={t("timerSkipBreak")} onClick={() => setState(current => ({ ...current, remainingSeconds: 0 }))}><SkipForward size={16}/></button>}</div>
      <div className="timer-settings"><label>{t("timerMinutes")}<input type="number" min="1" max="1440" value={Math.max(1, Math.round(state.focusSeconds / 60))} disabled={running} onChange={event => setFocusMinutes(event.target.value)}/></label>{state.mode === "pomodoro" && <label>{t("timerBreak")}<input type="number" min="1" max="120" value={Math.max(1, Math.round(state.breakSeconds / 60))} disabled={running} onChange={event => setBreakMinutes(event.target.value)}/></label>}<button className="timer-sound" aria-pressed={sound} title={sound ? t("timerSoundOn") : t("timerSoundOff")} onClick={() => setSound(value => !value)}>{sound ? <Volume2 size={15}/> : <VolumeX size={15}/>}<span>{sound ? t("timerSoundOn") : t("timerSoundOff")}</span></button></div>
      <small className="timer-hint"><Bell size={13}/>{t("timerHint")}</small>
    </>}
  </aside>;
}
