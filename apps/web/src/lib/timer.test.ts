import { describe, expect, it } from "vitest";
import { formatTimerTime, initialTimerState, tickTimer } from "./timer";

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
});
