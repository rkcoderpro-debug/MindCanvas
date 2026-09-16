import { getCurrentSession, supabase } from "./supabase";

export const PET_KINDS = ["cat", "dog", "fox", "rabbit"] as const;
export type PetKind = (typeof PET_KINDS)[number];
export type PetMood = "energetic" | "happy" | "calm" | "tired" | "sad";
export type PetActivityType = "workspace" | "flashcard" | "quiz" | "lab";

export type PetState = {
  kind: PetKind;
  name: string;
  vitality: number;
  xp: number;
  totalStudySeconds: number;
  lastActiveAt: string | null;
  dailyStudyDate: string | null;
  dailyStudySeconds: number;
  dailyVitalityGain: number;
  updatedAt: string;
  /** Local bookkeeping prevents applying the same absence decay repeatedly. */
  lastDecayAt?: string | null;
};

const STORAGE_PREFIX = "mindcanvas:pet:v1:";
const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVITY_GRACE_MS = 48 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function numeric(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asKind(value: unknown): PetKind {
  return PET_KINDS.includes(value as PetKind) ? value as PetKind : "cat";
}

function asDate(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function todayInVietnam(now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    if (values.year && values.month && values.day) return `${values.year}-${values.month}-${values.day}`;
    return now.toISOString().slice(0, 10);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function newPet(now = new Date()): PetState {
  return {
    kind: "cat",
    name: "Milo",
    vitality: 72,
    xp: 0,
    totalStudySeconds: 0,
    lastActiveAt: null,
    dailyStudyDate: todayInVietnam(now),
    dailyStudySeconds: 0,
    dailyVitalityGain: 0,
    updatedAt: now.toISOString(),
    lastDecayAt: null,
  };
}

/** Convert a local or Supabase row into the stable client-side shape. */
export function normalizePet(input: unknown, now = new Date()): PetState | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const base = newPet(now);
  const name = typeof row.name === "string" ? row.name.trim().slice(0, 40) : "";
  return {
    kind: asKind(row.kind ?? row.pet_kind),
    name: name || (typeof row.pet_name === "string" && row.pet_name.trim() ? row.pet_name.trim().slice(0, 40) : base.name),
    vitality: Math.round(clamp(numeric(row.vitality, numeric(row.energy, base.vitality)), 0, 100)),
    xp: Math.max(0, Math.floor(numeric(row.xp, base.xp))),
    totalStudySeconds: Math.max(0, Math.floor(numeric(row.totalStudySeconds ?? row.total_study_seconds, base.totalStudySeconds))),
    lastActiveAt: asDate(row.lastActiveAt ?? row.last_active_at),
    dailyStudyDate: typeof (row.dailyStudyDate ?? row.daily_study_date) === "string" ? String(row.dailyStudyDate ?? row.daily_study_date) : base.dailyStudyDate,
    dailyStudySeconds: Math.max(0, Math.floor(numeric(row.dailyStudySeconds ?? row.daily_study_seconds, base.dailyStudySeconds))),
    dailyVitalityGain: Math.max(0, Math.floor(numeric(row.dailyVitalityGain ?? row.daily_vitality_gain, base.dailyVitalityGain))),
    updatedAt: asDate(row.updatedAt ?? row.updated_at) ?? base.updatedAt,
    lastDecayAt: asDate(row.lastDecayAt ?? row.last_decay_at),
  };
}

export function petStorageKey(owner: string | null) {
  return `${STORAGE_PREFIX}${owner || "guest"}`;
}

export function readPet(owner: string | null, now = new Date()): PetState {
  const fallback = newPet(now);
  try {
    const parsed = JSON.parse(localStorage.getItem(petStorageKey(owner)) || "null");
    const normalized = normalizePet(parsed, now) ?? fallback;
    const decayed = applyInactivityDecay(normalized, now);
    if (decayed.vitality !== normalized.vitality || decayed.lastDecayAt !== normalized.lastDecayAt) writePet(owner, decayed);
    return decayed;
  } catch {
    return fallback;
  }
}

export function writePet(owner: string | null, state: PetState) {
  try { localStorage.setItem(petStorageKey(owner), JSON.stringify(state)); } catch { /* private browsing can reject storage */ }
}

/**
 * A pet gets a 48-hour grace period. After that, vitality loses five points
 * per full absent day, with a floor so the pet stays recoverable when the user
 * returns. The decay marker makes repeated renders idempotent.
 */
export function applyInactivityDecay(state: PetState, now = new Date()): PetState {
  if (!state.lastActiveAt) return state;
  const last = Date.parse(state.lastActiveAt);
  if (!Number.isFinite(last)) return state;
  const elapsed = now.getTime() - last;
  if (elapsed <= INACTIVITY_GRACE_MS) return state;
  const previousDecay = state.lastDecayAt ? Date.parse(state.lastDecayAt) : NaN;
  if (Number.isFinite(previousDecay) && now.getTime() - previousDecay < DAY_MS) return state;
  const absentDays = Math.max(1, Math.floor((elapsed - INACTIVITY_GRACE_MS) / DAY_MS));
  const loss = absentDays * 5;
  return {
    ...state,
    vitality: Math.max(20, state.vitality - loss),
    updatedAt: now.toISOString(),
    lastDecayAt: now.toISOString(),
  };
}

/** Add study time in five-minute blocks (maximum 24 vitality points/day). */
export function recordPetStudy(state: PetState, seconds: number, now = new Date()): PetState {
  const duration = Math.max(0, Math.floor(numeric(seconds, 0)));
  if (!duration) return state;
  const current = applyInactivityDecay(state, now);
  const date = todayInVietnam(now);
  const dailySeconds = current.dailyStudyDate === date ? current.dailyStudySeconds : 0;
  const previousGain = current.dailyStudyDate === date ? current.dailyVitalityGain : 0;
  const nextDailySeconds = dailySeconds + duration;
  const nextGain = Math.min(24, Math.floor(nextDailySeconds / 300) * 2);
  const gain = Math.max(0, nextGain - previousGain);
  return {
    ...current,
    vitality: Math.min(100, current.vitality + gain),
    xp: current.xp + Math.floor(duration / 60),
    totalStudySeconds: current.totalStudySeconds + duration,
    lastActiveAt: now.toISOString(),
    dailyStudyDate: date,
    dailyStudySeconds: nextDailySeconds,
    dailyVitalityGain: nextGain,
    updatedAt: now.toISOString(),
    lastDecayAt: null,
  };
}

export function getPetLevel(state: PetState) {
  return Math.max(1, Math.floor(state.xp / 300) + 1);
}

export function getPetMood(state: PetState, now = new Date()): PetMood {
  const current = applyInactivityDecay(state, now);
  if (current.lastActiveAt) {
    const elapsed = now.getTime() - Date.parse(current.lastActiveAt);
    if (elapsed > 7 * DAY_MS) return "sad";
  }
  if (current.vitality <= 30) return "sad";
  if (current.vitality <= 50) return "tired";
  if (current.vitality >= 85) return "energetic";
  if (current.vitality >= 70) return "happy";
  return "calm";
}

async function sessionBelongsTo(owner: string) {
  if (!supabase) return false;
  try {
    const session = await getCurrentSession();
    return session?.user.id === owner;
  } catch {
    return false;
  }
}

/** Load cloud state when available, while retaining the local fallback offline. */
export async function fetchPetProfile(owner: string | null): Promise<PetState> {
  const local = readPet(owner);
  if (!owner || !(await sessionBelongsTo(owner))) return local;
  try {
    const { data, error } = await supabase!.rpc("get_my_pet");
    if (error) return local;
    const remote = normalizePet(data);
    if (!remote) return local;
    writePet(owner, remote);
    return remote;
  } catch {
    return local;
  }
}

export async function updatePetProfile(owner: string | null, patch: { kind?: PetKind; name?: string }): Promise<PetState> {
  const current = readPet(owner);
  const next = normalizePet({ ...current, kind: patch.kind ?? current.kind, name: patch.name ?? current.name }, new Date()) ?? current;
  writePet(owner, next);
  if (!owner || !(await sessionBelongsTo(owner))) return next;
  try {
    const { data, error } = await supabase!.rpc("update_my_pet", { p_kind: next.kind, p_name: next.name });
    const remote = !error ? normalizePet(data) : null;
    if (remote) { writePet(owner, remote); return remote; }
  } catch { /* the local pet remains usable if the network is unavailable */ }
  return next;
}

export async function recordPetActivity(owner: string | null, seconds: number, activityType: PetActivityType): Promise<PetState> {
  const now = new Date();
  const local = recordPetStudy(readPet(owner, now), seconds, now);
  writePet(owner, local);
  if (!owner || !(await sessionBelongsTo(owner))) return local;
  try {
    const eventId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const { data, error } = await supabase!.rpc("record_pet_activity", {
      p_event_id: eventId,
      p_seconds: Math.min(300, Math.max(1, Math.floor(seconds))),
      p_activity_type: activityType,
    });
    const remote = !error ? normalizePet(data) : null;
    if (remote) { writePet(owner, remote); return remote; }
  } catch { /* preserve local progress until the next successful sync */ }
  return local;
}
