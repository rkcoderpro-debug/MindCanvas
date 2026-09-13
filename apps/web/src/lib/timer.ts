export type TimerMode = "countdown" | "stopwatch" | "pomodoro" | "clock";
export type PomodoroPhase = "focus" | "break";

export type TimerState = {
  mode: TimerMode;
  remainingSeconds: number;
  elapsedSeconds: number;
  focusSeconds: number;
  breakSeconds: number;
  phase: PomodoroPhase;
  cycle: number;
};

export function clampTimerSeconds(value: number, fallback = 25 * 60) {
  return Number.isFinite(value) ? Math.max(0, Math.min(24 * 60 * 60, Math.round(value))) : fallback;
}

export function formatTimerTime(seconds: number, includeHours = false) {
  const value = Math.max(0, Math.round(seconds));
  const hours = Math.floor(value / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);
  const remainder = value % 60;
  return includeHours || hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function initialTimerState(mode: TimerMode = "pomodoro"): TimerState {
  const focusSeconds = 25 * 60;
  const breakSeconds = 5 * 60;
  return { mode, remainingSeconds: mode === "countdown" ? focusSeconds : focusSeconds, elapsedSeconds: 0, focusSeconds, breakSeconds, phase: "focus", cycle: 1 };
}

export function tickTimer(state: TimerState, seconds = 1): { state: TimerState; finished: boolean; phaseChanged: boolean } {
  const delta = Math.max(0, Math.round(seconds));
  if (!delta || state.mode === "clock") return { state, finished: false, phaseChanged: false };
  if (state.mode === "stopwatch") return { state: { ...state, elapsedSeconds: state.elapsedSeconds + delta }, finished: false, phaseChanged: false };
  if (state.mode === "countdown") {
    const remainingSeconds = Math.max(0, state.remainingSeconds - delta);
    return { state: { ...state, remainingSeconds }, finished: state.remainingSeconds > 0 && remainingSeconds === 0, phaseChanged: false };
  }
  let remaining = state.remainingSeconds - delta;
  let phase = state.phase;
  let cycle = state.cycle;
  let phaseChanged = false;
  while (remaining <= 0) {
    phaseChanged = true;
    if (phase === "focus") {
      phase = "break";
      remaining += state.breakSeconds;
    } else {
      phase = "focus";
      cycle += 1;
      remaining += state.focusSeconds;
    }
  }
  return { state: { ...state, remainingSeconds: remaining, phase, cycle }, finished: phaseChanged, phaseChanged };
}
