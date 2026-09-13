import { config } from "./config.js";

export type PlanId = "free" | "plus" | "pro" | "max";
export type UsageKind = "document_upload" | "ai_mind_map" | "ai_flashcards" | "ai_selection" | "project_save";
export type QuotaKind = "ai_auto" | "storage";

export const PLAN_CATALOG: Record<PlanId, {
  id: PlanId;
  name: string;
  priceVnd: number;
  storageLimitBytes: number;
  aiAutoMonthlyLimit: number;
  maxCards: number;
  description: string;
  sortOrder: number;
}> = {
  free: { id: "free", name: "Free", priceVnd: 0, storageLimitBytes: 50 * 1024 * 1024, aiAutoMonthlyLimit: 5, maxCards: 500, description: "Bắt đầu học và làm việc", sortOrder: 1 },
  plus: { id: "plus", name: "Plus", priceVnd: 79000, storageLimitBytes: 500 * 1024 * 1024, aiAutoMonthlyLimit: 20, maxCards: 500, description: "Cho nhu cầu học tập thường xuyên", sortOrder: 2 },
  pro: { id: "pro", name: "Pro", priceVnd: 159000, storageLimitBytes: 2 * 1024 * 1024 * 1024, aiAutoMonthlyLimit: 60, maxCards: 500, description: "Cho người dùng chuyên sâu", sortOrder: 3 },
  max: { id: "max", name: "Max", priceVnd: 299000, storageLimitBytes: 10 * 1024 * 1024 * 1024, aiAutoMonthlyLimit: 150, maxCards: 500, description: "Toàn bộ giới hạn mở rộng", sortOrder: 4 },
};

export type UsageSnapshot = {
  monthStart: string;
  storageBytes: number;
  aiAutoCount: number;
  mindMapCount: number;
  flashcardCount: number;
  selectionCount: number;
  uploadCount: number;
  lastUsedAt: string | null;
};

export type AccountPlan = {
  id: PlanId;
  name: string;
  priceVnd: number;
  storageLimitBytes: number;
  aiAutoMonthlyLimit: number;
  maxCards: number;
  description: string;
  status: string;
  assignedAt: string | null;
  expiresAt: string | null;
  note: string | null;
  usage: UsageSnapshot;
};

export type AdminUserSummary = AccountPlan & {
  userId: string;
  email: string;
  displayName: string;
  lastSignInAt: string | null;
  createdAt: string | null;
};

export class AccountServiceUnavailableError extends Error {}
export class PlanLimitError extends Error {
  constructor(public readonly quota: QuotaKind, message: string) { super(message); }
}

function requireServiceRole() {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) throw new AccountServiceUnavailableError("Account service is not configured.");
  return { url: config.SUPABASE_URL, key: config.SUPABASE_SERVICE_ROLE_KEY };
}

async function serviceRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const service = requireServiceRole();
  const response = await fetch(`${service.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: service.key,
      Authorization: `Bearer ${service.key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const raw = await response.text();
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  if (!response.ok) throw new Error(`Supabase account request failed (${response.status}).`);
  return body as T;
}

async function authAdminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const service = requireServiceRole();
  const response = await fetch(`${service.url}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: service.key,
      Authorization: `Bearer ${service.key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const raw = await response.text();
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  if (!response.ok) throw new Error(`Supabase auth admin request failed (${response.status}).`);
  return body as T;
}

function monthStart() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function emptyUsage(): UsageSnapshot {
  return { monthStart: monthStart(), storageBytes: 0, aiAutoCount: 0, mindMapCount: 0, flashcardCount: 0, selectionCount: 0, uploadCount: 0, lastUsedAt: null };
}

function usageFromRow(row: any, currentStorageBytes?: number): UsageSnapshot {
  const fallback = emptyUsage();
  return {
    monthStart: typeof row?.month_start === "string" ? row.month_start : fallback.monthStart,
    storageBytes: Number(currentStorageBytes ?? row?.storage_bytes ?? 0),
    aiAutoCount: Number(row?.ai_auto_count ?? 0),
    mindMapCount: Number(row?.mind_map_count ?? 0),
    flashcardCount: Number(row?.flashcard_count ?? 0),
    selectionCount: Number(row?.selection_count ?? 0),
    uploadCount: Number(row?.upload_count ?? 0),
    lastUsedAt: typeof row?.last_used_at === "string" ? row.last_used_at : null,
  };
}

function planFromRow(row: any, entitlement: any, usage: any, currentStorageBytes?: number): AccountPlan {
  const id = (row?.id as PlanId) in PLAN_CATALOG ? row.id as PlanId : "free";
  const plan = PLAN_CATALOG[id];
  return {
    ...plan,
    priceVnd: Number(row?.price_vnd ?? plan.priceVnd),
    storageLimitBytes: Number(row?.storage_limit_bytes ?? plan.storageLimitBytes),
    aiAutoMonthlyLimit: Number(row?.ai_auto_monthly_limit ?? plan.aiAutoMonthlyLimit),
    maxCards: Number(row?.max_cards ?? plan.maxCards),
    description: typeof row?.description === "string" ? row.description : plan.description,
    status: typeof entitlement?.status === "string" ? entitlement.status : "active",
    assignedAt: typeof entitlement?.assigned_at === "string" ? entitlement.assigned_at : null,
    expiresAt: typeof entitlement?.expires_at === "string" ? entitlement.expires_at : null,
    note: typeof entitlement?.note === "string" ? entitlement.note : null,
    usage: usageFromRow(usage, currentStorageBytes),
  };
}

async function readPlanRows(userId: string) {
  const encodedUserId = encodeURIComponent(userId);
  const [plans, entitlements, usageRows, storageRows] = await Promise.all([
    serviceRequest<any[]>("plans?select=id,name,price_vnd,storage_limit_bytes,ai_auto_monthly_limit,max_cards,description,sort_order&active=eq.true&order=sort_order"),
    serviceRequest<any[]>(`account_entitlements?select=user_id,plan_id,status,assigned_at,expires_at,note&user_id=eq.${encodedUserId}&limit=1`),
    serviceRequest<any[]>(`usage_monthly?select=month_start,storage_bytes,ai_auto_count,mind_map_count,flashcard_count,selection_count,upload_count,last_used_at&user_id=eq.${encodedUserId}&month_start=eq.${encodeURIComponent(monthStart())}&limit=1`),
    serviceRequest<any[]>(`account_storage?select=storage_bytes&user_id=eq.${encodedUserId}&limit=1`),
  ]);
  const entitlement = entitlements?.[0];
  const fallback = PLAN_CATALOG[(entitlement?.plan_id as PlanId) in PLAN_CATALOG ? entitlement.plan_id as PlanId : "free"];
  const planRow = (plans ?? []).find(row => row.id === (entitlement?.plan_id ?? "free")) ?? fallback;
  return planFromRow(planRow, entitlement, usageRows?.[0], Number(storageRows?.[0]?.storage_bytes ?? 0));
}

export async function getAccountPlan(userId: string): Promise<AccountPlan> {
  try { return await readPlanRows(userId); }
  catch (error) {
    if (error instanceof AccountServiceUnavailableError) return { ...PLAN_CATALOG.free, status: "local-fallback", assignedAt: null, expiresAt: null, note: null, usage: emptyUsage() };
    throw error;
  }
}

export async function enforceQuota(userId: string, kind: QuotaKind, bytes = 0) {
  const account = await getAccountPlan(userId);
  // A local fallback means the migration/service key is not installed yet.
  // Keep the existing app usable until deployment configuration is complete.
  if (account.status === "local-fallback") return;
  const expired = account.expiresAt && Date.parse(account.expiresAt) <= Date.now();
  const limitPlan = expired || account.status !== "active" ? PLAN_CATALOG.free : account;
  if (kind === "ai_auto" && account.usage.aiAutoCount >= limitPlan.aiAutoMonthlyLimit) {
    throw new PlanLimitError("ai_auto", "AI Auto monthly limit reached for this plan.");
  }
  if (kind === "storage" && account.usage.storageBytes + bytes > limitPlan.storageLimitBytes) {
    throw new PlanLimitError("storage", "Account storage limit reached for this plan.");
  }
}

export async function recordUsage(userId: string, kind: UsageKind, units = 1, bytes = 0, metadata: Record<string, unknown> = {}) {
  try {
    await serviceRequest("rpc/record_usage", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_kind: kind, p_units: units, p_bytes: bytes, p_metadata: metadata }) });
  } catch (error) {
    // Usage telemetry must never make an otherwise successful AI request fail.
    console.warn("MindCanvas usage telemetry unavailable", error instanceof Error ? error.message : error);
  }
}

type AuthUser = { id: string; email?: string; user_metadata?: { full_name?: string; name?: string }; created_at?: string; last_sign_in_at?: string };

function adminUserFromRows(user: AuthUser, profile: any, entitlement: any, planRow: any, usage: any): AdminUserSummary {
  const plan = planFromRow(planRow, entitlement, usage);
  return {
    ...plan,
    userId: user.id,
    email: user.email ?? "",
    displayName: profile?.display_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "",
    lastSignInAt: user.last_sign_in_at ?? null,
    createdAt: user.created_at ?? null,
  };
}

export async function listAdminUsers(query = "", planFilter = "") {
  const auth = await authAdminRequest<{ users?: AuthUser[] }>("/admin/users?page=1&per_page=1000");
  const [profiles, entitlements, plans, usageRows, storageRows] = await Promise.all([
    serviceRequest<any[]>("profiles?select=id,display_name"),
    serviceRequest<any[]>("account_entitlements?select=user_id,plan_id,status,assigned_at,expires_at,note"),
    serviceRequest<any[]>("plans?select=id,name,price_vnd,storage_limit_bytes,ai_auto_monthly_limit,max_cards,description,sort_order&active=eq.true&order=sort_order"),
    serviceRequest<any[]>(`usage_monthly?select=user_id,month_start,storage_bytes,ai_auto_count,mind_map_count,flashcard_count,selection_count,upload_count,last_used_at&month_start=eq.${encodeURIComponent(monthStart())}`),
    serviceRequest<any[]>("account_storage?select=user_id,storage_bytes"),
  ]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const result = (auth.users ?? []).map(user => {
    const entitlement = entitlements.find(row => row.user_id === user.id);
    const planId = (entitlement?.plan_id as PlanId) in PLAN_CATALOG ? entitlement.plan_id as PlanId : "free";
    const planRow = plans.find(row => row.id === planId) ?? PLAN_CATALOG.free;
    const usage = usageRows.find(row => row.user_id === user.id);
    const storage = storageRows.find(row => row.user_id === user.id);
    return adminUserFromRows(user, profiles.find(row => row.id === user.id), entitlement, planRow, { ...usage, storage_bytes: storage?.storage_bytes ?? 0 });
  }).filter(user => !normalizedQuery || `${user.email} ${user.displayName}`.toLocaleLowerCase().includes(normalizedQuery))
    .filter(user => !planFilter || user.id === planFilter);
  return result;
}

export async function getAdminSummary() {
  const users = await listAdminUsers();
  const planCounts = { free: 0, plus: 0, pro: 0, max: 0 } as Record<PlanId, number>;
  let storageBytes = 0, aiAutoCount = 0, uploads = 0;
  for (const user of users) { planCounts[user.id]++; storageBytes += user.usage.storageBytes; aiAutoCount += user.usage.aiAutoCount; uploads += user.usage.uploadCount; }
  return { generatedAt: new Date().toISOString(), totalUsers: users.length, planCounts, storageBytes, aiAutoCount, uploads };
}

export async function getAdminUserDetail(userId: string) {
  const encodedUserId = encodeURIComponent(userId);
  const [user, profile, entitlement, plans, usage, events, storageRows] = await Promise.all([
    authAdminRequest<AuthUser>(`/admin/users/${encodedUserId}`),
    serviceRequest<any[]>(`profiles?select=id,display_name,avatar_url,created_at,updated_at&id=eq.${encodedUserId}&limit=1`),
    serviceRequest<any[]>(`account_entitlements?select=user_id,plan_id,status,assigned_at,expires_at,note&user_id=eq.${encodedUserId}&limit=1`),
    serviceRequest<any[]>("plans?select=id,name,price_vnd,storage_limit_bytes,ai_auto_monthly_limit,max_cards,description,sort_order&active=eq.true&order=sort_order"),
    serviceRequest<any[]>(`usage_monthly?select=month_start,storage_bytes,ai_auto_count,mind_map_count,flashcard_count,selection_count,upload_count,last_used_at&user_id=eq.${encodedUserId}&order=month_start.desc&limit=12`),
    serviceRequest<any[]>(`usage_events?select=id,kind,units,bytes,metadata,created_at&user_id=eq.${encodedUserId}&order=created_at.desc&limit=50`),
    serviceRequest<any[]>(`account_storage?select=storage_bytes&user_id=eq.${encodedUserId}&limit=1`),
  ]);
  const ent = entitlement[0];
  const planId = (ent?.plan_id as PlanId) in PLAN_CATALOG ? ent.plan_id as PlanId : "free";
  const storageBytes = Number(storageRows?.[0]?.storage_bytes ?? 0);
  const plan = planFromRow(plans.find(row => row.id === planId) ?? PLAN_CATALOG.free, ent, usage[0], storageBytes);
  return { user: adminUserFromRows(user, profile[0], ent, plans.find(row => row.id === planId) ?? PLAN_CATALOG.free, { ...usage[0], storage_bytes: storageBytes }), plan, usage: usage.map(row => usageFromRow(row, row === usage[0] ? storageBytes : undefined)), events: events ?? [] };
}

export async function assignPlan(adminUserId: string, userId: string, planId: PlanId, expiresAt: string | null, note: string | null) {
  await serviceRequest("account_entitlements", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ user_id: userId, plan_id: planId, status: "active", assigned_by: adminUserId, assigned_at: new Date().toISOString(), expires_at: expiresAt, note }),
  });
  await serviceRequest("admin_audit_log", {
    method: "POST",
    body: JSON.stringify({ admin_user_id: adminUserId, target_user_id: userId, action: "assign_plan", after_state: { planId, expiresAt, note } }),
  });
}
