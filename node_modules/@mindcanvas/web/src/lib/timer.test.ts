import { describe, expect, it } from "vitest";
import { advanceTimerSession, formatTimerTime, initialTimerSessions, initialTimerState, normalizeTimerSessions, timerParts, timerSecondsFromParts, tickTimer, toggleTimerSession } from "./timer";

describe("floating timer state", () => {
  it("formats countdowns with hours only when needed", () => {
    expect(formatTimerTime(125)).toBe("02:05");
    expect(formatTimerTime(3_725)).toBe("01:02:05");
  });

  it("finishes a countdown at zero exactly once", () => {
    const state = { ...initialTimerState("countdown"), remainingSeconds: 2 };
    const result = tickTimer(state, 2);
    expect(result.state.remainingSeconds).toBe(0);
    expect(result.finished).toBe(true);
    expect(tickTimer(result.state, 1).finished).toBe(false);
  });

  it("moves pomodoro from focus to break and advances cycles", () => {
    const focusEnd = tickTimer({ ...initialTimerState("pomodoro"), remainingSeconds: 2, breakSeconds: 3 }, 2);
    expect(focusEnd.state.phase).toBe("break");
    expect(focusEnd.state.remainingSeconds).toBe(3);
    const nextFocus = tickTimer(focusEnd.state, 3);
    expect(nextFocus.state.phase).toBe("focus");
    expect(nextFocus.state.cycle).toBe(2);
  });

  it("increments a stopwatch without changing countdown state", () => {
    const state = initialTimerState("stopwatch");
    expect(tickTimer(state, 7).state.elapsedSeconds).toBe(7);
  });

  it("converts editable duration fields without losing hours", () => {
    expect(timerParts(3_661)).toEqual({ hours: 1, minutes: 1, seconds: 1 });
    expect(timerSecondsFromParts({ hours: 1, minutes: 1, seconds: 1 })).toBe(3_661);
  });

  it("keeps a separate session for every timer mode when persisted", () => {
    const sessions = initialTimerSessions(100);
    sessions.countdown.state.remainingSeconds = 42;
    sessions.countdown.running = true;
    const restored = normalizeTimerSessions(sessions, 200);
    expect(restored.countdown.state.remainingSeconds).toBe(42);
    expect(restored.countdown.running).toBe(true);
    expect(restored.stopwatch.state.elapsedSeconds).toBe(0);
  });

  it("catches up a running stopwatch from wall-clock time", () => {
    const session = { state: initialTimerState("stopwatch"), running: true, lastTickAt: 1_000 };
    const result = advanceTimerSession(session, 8_450);
    expect(result.session.state.elapsedSeconds).toBe(7);
    expect(result.session.lastTickAt).toBe(8_000);
    expect(result.finished).toBe(false);
  });

  it("restarts a completed countdown at its configured duration", () => {
    const session = { state: { ...initialTimerState("countdown"), remainingSeconds: 0 }, running: false, lastTickAt: 100 };
    const restarted = toggleTimerSession(session, 500);
    expect(restarted.running).toBe(true);
    expect(restarted.state.remainingSeconds).toBe(restarted.state.focusSeconds);
  });

  it("pauses a running session after catching up before toggling", () => {
    const session = { state: initialTimerState("stopwatch"), running: true, lastTickAt: 1_000 };
    const paused = toggleTimerSession(session, 4_100);
    expect(paused.running).toBe(false);
    expect(paused.state.elapsedSeconds).toBe(3);
    expect(paused.lastTickAt).toBe(4_100);
  });
});
