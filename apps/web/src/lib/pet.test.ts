import { describe, expect, it } from "vitest";
import { applyInactivityDecay, getPetLevel, getPetMood, normalizePet, recordPetStudy } from "./pet";

const now = new Date("2026-09-16T10:00:00.000Z");

describe("study companion state", () => {
  it("restores vitality in five-minute study blocks and earns XP", () => {
    const state = normalizePet({ vitality: 60, xp: 0, daily_study_date: "2026-09-16" }, now)!;
    const next = recordPetStudy(state, 300, now);
    expect(next.vitality).toBe(62);
    expect(next.xp).toBe(5);
    expect(next.totalStudySeconds).toBe(300);
  });

  it("decays once for an absence window instead of on every render", () => {
    const state = normalizePet({ vitality: 80, last_active_at: "2026-09-10T10:00:00.000Z" }, now)!;
    const decayed = applyInactivityDecay(state, now);
    expect(decayed.vitality).toBeLessThan(state.vitality);
    expect(applyInactivityDecay(decayed, now).vitality).toBe(decayed.vitality);
  });

  it("maps low vitality and long absence to a sad mood", () => {
    const state = normalizePet({ vitality: 25, last_active_at: "2026-09-01T10:00:00.000Z" }, now)!;
    expect(getPetMood(state, now)).toBe("sad");
    expect(getPetLevel({ ...state, xp: 900 })).toBe(4);
  });
});
