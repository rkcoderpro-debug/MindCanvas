export type TimerMode = "countdown" | "stopwatch" | "pomodoro" | "clock";
export type PomodoroPhase = "focus" | "break";

export const TIMER_MODES: TimerMode[] = ["pomodoro", "countdown", "stopwatch", "clock"];

export type TimerState = {
  mode: TimerMode;
  remainingSeconds: number;
  elapsedSeconds: number;
  focusSeconds: number;
  breakSeconds: number;
  phase: PomodoroPhase;
  cycle: number;
};

export type TimerSession = {
  state: TimerState;
  running: boolean;
  lastTickAt: number;
};

export type TimerSessions = Record<TimerMode, TimerSession>;

export type TimerParts = { hours: number; minutes: number; seconds: number };

export type TimerAdvanceResult = {
  session: TimerSession;
  finished: boolean;
  phaseChanged: boolean;
};

export function clampTimerSeconds(value: number, fallback = 25 * 60) {
  return Number.isFinite(value) ? Math.max(0, Math.min(24 * 60 * 60, Math.round(value))) : fallback;
}

export function timerParts(value: number): TimerParts {
  const seconds = clampTimerSeconds(value, 0);
  return {
    hours: Math.floor(seconds / 3_600),
    minutes: Math.floor((seconds % 3_600) / 60),
    seconds: seconds % 60,
  };
}

export function timerSecondsFromParts(parts: TimerParts, fallback = 25 * 60) {
  const total = Math.max(0, Math.round(parts.hours)) * 3_600 + Math.max(0, Math.round(parts.minutes)) * 60 + Math.max(0, Math.round(parts.seconds));
  return clampTimerSeconds(total, fallback);
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

export function initialTimerSessions(now = Date.now()): TimerSessions {
  return TIMER_MODES.reduce((sessions, mode) => {
    sessions[mode] = { state: initialTimerState(mode), running: false, lastTickAt: now };
    return sessions;
  }, {} as TimerSessions);
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeTimerState(value: unknown, mode: TimerMode): TimerState {
  const fallback = initialTimerState(mode);
  const raw = value && typeof value === "object" ? value as Partial<TimerState> : {};
  const phase = raw.phase === "break" ? "break" : "focus";
  return {
    mode,
    remainingSeconds: clampTimerSeconds(asNumber(raw.remainingSeconds, fallback.remainingSeconds), fallback.remainingSeconds),
    elapsedSeconds: clampTimerSeconds(asNumber(raw.elapsedSeconds, fallback.elapsedSeconds), fallback.elapsedSeconds),
    focusSeconds: Math.max(1, clampTimerSeconds(asNumber(raw.focusSeconds, fallback.focusSeconds), fallback.focusSeconds)),
    breakSeconds: Math.max(1, clampTimerSeconds(asNumber(raw.breakSeconds, fallback.breakSeconds), fallback.breakSeconds)),
    phase,
    cycle: Math.max(1, Math.floor(asNumber(raw.cycle, fallback.cycle))),
  };
}

export function normalizeTimerSessions(value: unknown, now = Date.now()): TimerSessions {
  const fallback = initialTimerSessions(now);
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<Record<TimerMode, Partial<TimerSession>>> & { state?: unknown };
  if (raw.state && typeof raw.state === "object") {
    const oldState = raw.state as Partial<TimerState>;
    const oldMode = TIMER_MODES.includes(oldState.mode as TimerMode) ? oldState.mode as TimerMode : "pomodoro";
    fallback[oldMode].state = normalizeTimerState(oldState, oldMode);
  }
  for (const mode of TIMER_MODES) {
    const session = raw[mode];
    if (!session || typeof session !== "object") continue;
    fallback[mode] = {
      state: normalizeTimerState(session.state, mode),
      running: session.running === true,
      lastTickAt: typeof session.lastTickAt === "number" && Number.isFinite(session.lastTickAt) ? session.lastTickAt : now,
    };
  }
  return fallback;
}

/**
 * Catch up a running session from wall-clock time. Keeping this outside the
 * component makes tab switches, background throttling and resume behavior
 * deterministic and testable.
 */
export function advanceTimerSession(session: TimerSession, now: number): TimerAdvanceResult {
  if (!session.running) return { session, finished: false, phaseChanged: false };
  const delta = Math.floor((now - session.lastTickAt) / 1_000);
  if (delta < 1) return { session, finished: false, phaseChanged: false };
  const result = tickTimer(session.state, delta);
  return {
    session: {
      ...session,
      state: result.state,
      running: result.finished && session.state.mode === "countdown" ? false : session.running,
      lastTickAt: session.lastTickAt + delta * 1_000,
    },
    finished: result.finished,
    phaseChanged: result.phaseChanged,
  };
}

/** Toggle a session while preserving its elapsed wall-clock time. */
export function toggleTimerSession(session: TimerSession, now: number): TimerSession {
  const caughtUp = advanceTimerSession(session, now).session;
  if (caughtUp.running) return { ...caughtUp, running: false, lastTickAt: now };

  // A completed countdown can be started again without requiring a separate
  // reset click. Pomodoro and stopwatch retain their current state.
  const state = caughtUp.state.mode === "countdown" && caughtUp.state.remainingSeconds <= 0
    ? { ...caughtUp.state, remainingSeconds: Math.max(1, caughtUp.state.focusSeconds) }
    : caughtUp.state;
  return { ...caughtUp, state, running: true, lastTickAt: now };
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
