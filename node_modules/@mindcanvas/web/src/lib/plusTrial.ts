import { supabase } from "./supabase";

export type PlusTrialState = {
  eligible: boolean;
  consumed: boolean;
  active: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
};

const EMPTY_TRIAL: PlusTrialState = { eligible: false, consumed: false, active: false, activatedAt: null, expiresAt: null };

function normalizeTrial(value: unknown): PlusTrialState {
  if (!value || typeof value !== "object") return EMPTY_TRIAL;
  const row = value as Record<string, unknown>;
  const activatedAt = typeof (row.activatedAt ?? row.activated_at) === "string" ? String(row.activatedAt ?? row.activated_at) : null;
  const expiresAt = typeof (row.expiresAt ?? row.expires_at) === "string" ? String(row.expiresAt ?? row.expires_at) : null;
  return {
    eligible: row.eligible === true,
    consumed: row.consumed === true,
    active: row.active === true,
    activatedAt,
    expiresAt,
  };
}

export async function getPlusTrial(): Promise<PlusTrialState> {
  if (!supabase) return EMPTY_TRIAL;
  const { data, error } = await supabase.rpc("get_my_plus_trial");
  if (error) throw error;
  return normalizeTrial(data);
}

export async function activatePlusTrial(): Promise<PlusTrialState> {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { data, error } = await supabase.rpc("activate_my_plus_trial");
  if (error) {
    const message = error.message || "";
    if (/TRIAL_ALREADY_USED/i.test(message)) throw new Error("Bạn đã sử dụng ưu đãi Plus miễn phí này.");
    if (/TRIAL_NOT_ELIGIBLE/i.test(message)) throw new Error("Tài khoản này không thuộc chương trình 3 ngày Plus miễn phí.");
    if (/TRIAL_PLAN_CONFLICT/i.test(message)) throw new Error("Tài khoản đang có một gói trả phí khác nên chưa thể kích hoạt trial.");
    throw error;
  }
  return normalizeTrial(data);
}
