import { config } from "./config.js";
export const PLAN_CATALOG = {
    free: { id: "free", name: "Free", priceVnd: 0, storageLimitBytes: 20 * 1024 * 1024, aiAutoMonthlyLimit: 30, aiAutoDailyLimit: 1, aiManualDailyLimit: 3, aiManualIncluded: false, maxCards: 50, description: "Bắt đầu học và làm việc", sortOrder: 1 },
    plus: { id: "plus", name: "Plus", priceVnd: 79000, storageLimitBytes: 500 * 1024 * 1024, aiAutoMonthlyLimit: 600, aiAutoDailyLimit: 20, aiManualDailyLimit: 0, aiManualIncluded: true, maxCards: 100, description: "Cho nhu cầu học tập thường xuyên", sortOrder: 2 },
    pro: { id: "pro", name: "Pro", priceVnd: 159000, storageLimitBytes: 2 * 1024 * 1024 * 1024, aiAutoMonthlyLimit: 1800, aiAutoDailyLimit: 60, aiManualDailyLimit: 0, aiManualIncluded: true, maxCards: 200, description: "Cho người dùng chuyên sâu", sortOrder: 3 },
    max: { id: "max", name: "Max", priceVnd: 499000, storageLimitBytes: 10 * 1024 * 1024 * 1024, aiAutoMonthlyLimit: 4500, aiAutoDailyLimit: 150, aiManualDailyLimit: 0, aiManualIncluded: true, maxCards: 500, description: "Toàn bộ giới hạn mở rộng", sortOrder: 4 },
};
export class AccountServiceUnavailableError extends Error {
}
export class PlanLimitError extends Error {
    quota;
    constructor(quota, message) {
        super(message);
        this.quota = quota;
    }
}
class ServiceRequestError extends Error {
    status;
    body;
    constructor(status, body) {
        super(`Supabase account request failed (${status}).`);
        this.status = status;
        this.body = body;
    }
}
function requireServiceRole() {
    if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY)
        throw new AccountServiceUnavailableError("Account service is not configured.");
    return { url: config.SUPABASE_URL, key: config.SUPABASE_SERVICE_ROLE_KEY };
}
async function serviceRequest(path, init = {}) {
    const service = requireServiceRole();
    const response = await fetch(`${service.url}/rest/v1/${path}`, {
        ...init,
        headers: { apikey: service.key, Authorization: `Bearer ${service.key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const raw = await response.text();
    let body = null;
    try {
        body = raw ? JSON.parse(raw) : null;
    }
    catch {
        body = raw;
    }
    if (!response.ok)
        throw new ServiceRequestError(response.status, body);
    return body;
}
async function authAdminRequest(path, init = {}) {
    const service = requireServiceRole();
    const response = await fetch(`${service.url}/auth/v1${path}`, {
        ...init,
        headers: { apikey: service.key, Authorization: `Bearer ${service.key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const raw = await response.text();
    let body = null;
    try {
        body = raw ? JSON.parse(raw) : null;
    }
    catch {
        body = raw;
    }
    if (!response.ok)
        throw new Error(`Supabase auth admin request failed (${response.status}).`);
    return body;
}
function monthStart() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
/** The quota day is noon-to-noon in Vietnam, returned as a UTC ISO instant. */
export function dailyPeriodStart(now = new Date()) {
    const vietnamNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const start = new Date(Date.UTC(vietnamNow.getUTCFullYear(), vietnamNow.getUTCMonth(), vietnamNow.getUTCDate(), 12));
    if (vietnamNow.getUTCHours() < 12)
        start.setUTCDate(start.getUTCDate() - 1);
    return new Date(start.getTime() - 7 * 60 * 60 * 1000).toISOString();
}
function dailyResetAt(periodStart = dailyPeriodStart()) {
    return new Date(Date.parse(periodStart) + 24 * 60 * 60 * 1000).toISOString();
}
function emptyUsage() {
    const periodStart = dailyPeriodStart();
    return { monthStart: monthStart(), storageBytes: 0, aiAutoCount: 0, mindMapCount: 0, flashcardCount: 0, selectionCount: 0, uploadCount: 0, lastUsedAt: null, dailyPeriodStart: periodStart, dailyResetAt: dailyResetAt(periodStart), aiAutoDailyCount: 0, aiManualDailyCount: 0 };
}
function usageFromRow(row, currentStorageBytes, dailyRow) {
    const fallback = emptyUsage();
    const periodStart = typeof dailyRow?.period_start === "string" ? dailyRow.period_start : fallback.dailyPeriodStart;
    return {
        monthStart: typeof row?.month_start === "string" ? row.month_start : fallback.monthStart,
        storageBytes: Number(currentStorageBytes ?? row?.storage_bytes ?? 0),
        aiAutoCount: Number(row?.ai_auto_count ?? 0),
        mindMapCount: Number(row?.mind_map_count ?? 0),
        flashcardCount: Number(row?.flashcard_count ?? 0),
        selectionCount: Number(row?.selection_count ?? 0),
        uploadCount: Number(row?.upload_count ?? 0),
        lastUsedAt: typeof row?.last_used_at === "string" ? row.last_used_at : null,
        dailyPeriodStart: periodStart,
        dailyResetAt: dailyResetAt(periodStart),
        aiAutoDailyCount: Number(dailyRow?.ai_auto_count ?? 0),
        aiManualDailyCount: Number(dailyRow?.ai_manual_count ?? 0),
    };
}
function isActiveEntitlement(entitlement) {
    return (!entitlement || entitlement.status === "active") && (!entitlement?.expires_at || Date.parse(entitlement.expires_at) > Date.now());
}
function isActiveAddon(addon) {
    return addon?.status === "active" && (!addon.expires_at || Date.parse(addon.expires_at) > Date.now());
}
function planFromRow(row, entitlement, usage, currentStorageBytes, dailyRow, addon) {
    const id = row?.id in PLAN_CATALOG ? row.id : "free";
    const plan = PLAN_CATALOG[id];
    const active = isActiveEntitlement(entitlement);
    const effectivePlan = active ? plan : PLAN_CATALOG.free;
    const source = active ? row : null;
    const addonActive = isActiveAddon(addon);
    return {
        ...effectivePlan,
        name: typeof source?.name === "string" ? source.name : effectivePlan.name,
        priceVnd: Number(source?.price_vnd ?? effectivePlan.priceVnd),
        storageLimitBytes: Number(source?.storage_limit_bytes ?? effectivePlan.storageLimitBytes),
        aiAutoMonthlyLimit: Number(source?.ai_auto_monthly_limit ?? effectivePlan.aiAutoMonthlyLimit),
        aiAutoDailyLimit: Number(source?.ai_auto_daily_limit ?? effectivePlan.aiAutoDailyLimit),
        aiManualDailyLimit: Number(source?.ai_manual_daily_limit ?? effectivePlan.aiManualDailyLimit),
        aiManualIncluded: Boolean(source?.ai_manual_included ?? effectivePlan.aiManualIncluded),
        maxCards: Number(source?.max_cards ?? effectivePlan.maxCards),
        description: typeof source?.description === "string" ? source.description : effectivePlan.description,
        sortOrder: Number(source?.sort_order ?? effectivePlan.sortOrder),
        status: typeof entitlement?.status === "string" ? entitlement.status : "active",
        assignedAt: typeof entitlement?.assigned_at === "string" ? entitlement.assigned_at : null,
        expiresAt: typeof entitlement?.expires_at === "string" ? entitlement.expires_at : null,
        note: typeof entitlement?.note === "string" ? entitlement.note : null,
        effectivePlanId: effectivePlan.id,
        aiManualAddOnActive: addonActive,
        aiManualUnlimited: effectivePlan.aiManualIncluded || addonActive,
        usage: usageFromRow(usage, currentStorageBytes, dailyRow),
    };
}
const planSelect = "id,name,price_vnd,storage_limit_bytes,ai_auto_monthly_limit,ai_auto_daily_limit,ai_manual_daily_limit,ai_manual_included,max_cards,description,sort_order";
const entitlementSelect = "user_id,plan_id,status,assigned_at,expires_at,note";
const monthlySelect = "month_start,storage_bytes,ai_auto_count,mind_map_count,flashcard_count,selection_count,upload_count,last_used_at";
const dailySelect = "period_start,ai_auto_count,ai_manual_count,ai_auto_reserved,ai_manual_reserved,last_used_at";
async function readPlanRows(userId) {
    const encodedUserId = encodeURIComponent(userId);
    const period = encodeURIComponent(dailyPeriodStart());
    const [plans, entitlements, usageRows, storageRows, dailyRows, addons] = await Promise.all([
        serviceRequest(`plans?select=${planSelect}&active=eq.true&order=sort_order`),
        serviceRequest(`account_entitlements?select=${entitlementSelect}&user_id=eq.${encodedUserId}&limit=1`),
        serviceRequest(`usage_monthly?select=${monthlySelect}&user_id=eq.${encodedUserId}&month_start=eq.${encodeURIComponent(monthStart())}&limit=1`),
        serviceRequest(`account_storage?select=storage_bytes&user_id=eq.${encodedUserId}&limit=1`),
        serviceRequest(`usage_daily?select=${dailySelect}&user_id=eq.${encodedUserId}&period_start=eq.${period}&limit=1`),
        serviceRequest(`account_addons?select=addon_id,status,expires_at,note&user_id=eq.${encodedUserId}&addon_id=eq.ai_manual&limit=1`),
    ]);
    const entitlement = entitlements?.[0];
    const fallback = PLAN_CATALOG[entitlement?.plan_id in PLAN_CATALOG ? entitlement.plan_id : "free"];
    const planRow = (plans ?? []).find(row => row.id === (entitlement?.plan_id ?? "free")) ?? fallback;
    return planFromRow(planRow, entitlement, usageRows?.[0], Number(storageRows?.[0]?.storage_bytes ?? 0), dailyRows?.[0], addons?.[0]);
}
export async function getAccountPlan(userId) {
    try {
        return await readPlanRows(userId);
    }
    catch (error) {
        if (error instanceof AccountServiceUnavailableError)
            return { ...PLAN_CATALOG.free, status: "local-fallback", assignedAt: null, expiresAt: null, note: null, effectivePlanId: "free", aiManualAddOnActive: false, aiManualUnlimited: false, usage: emptyUsage() };
        throw error;
    }
}
export async function enforceQuota(userId, kind, bytes = 0) {
    const account = await getAccountPlan(userId);
    if (account.status === "local-fallback")
        return;
    if (kind === "storage" && account.usage.storageBytes + bytes > account.storageLimitBytes)
        throw new PlanLimitError("storage", "Account storage limit reached for this plan.");
    if ((kind === "flashcards" || kind === "quiz") && bytes > account.maxCards)
        throw new PlanLimitError(kind, `This plan allows at most ${account.maxCards} ${kind === "quiz" ? "quiz questions" : "flashcards"} per generation.`);
    if (kind === "ai_auto" && account.usage.aiAutoDailyCount >= account.aiAutoDailyLimit)
        throw new PlanLimitError("ai_auto", "AI Auto daily limit reached for this plan.");
    if (kind === "ai_manual" && !account.aiManualUnlimited && account.usage.aiManualDailyCount >= account.aiManualDailyLimit)
        throw new PlanLimitError("ai_manual", "AI Manual daily limit reached for this plan. Mua add-on AI Manual để sử dụng không giới hạn.");
}
export async function reserveAiUsage(userId, mode, requestId) {
    try {
        return await serviceRequest("rpc/reserve_ai_usage", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_mode: mode, p_request_id: requestId }) });
    }
    catch (error) {
        if (error instanceof AccountServiceUnavailableError)
            return { ok: true, reservationId: undefined, mode };
        if (error instanceof ServiceRequestError && error.body?.code === "P0001")
            throw new PlanLimitError(mode, mode === "ai_auto" ? "AI Auto daily limit reached for this plan." : "AI Manual daily limit reached. Mua add-on AI Manual để sử dụng không giới hạn.");
        throw error;
    }
}
export async function commitAiUsage(requestId) {
    try {
        return await serviceRequest("rpc/commit_ai_usage", { method: "POST", body: JSON.stringify({ p_request_id: requestId }) });
    }
    catch (error) {
        if (error instanceof AccountServiceUnavailableError)
            return { ok: false };
        throw error;
    }
}
export async function releaseAiUsage(requestId) {
    try {
        await serviceRequest("rpc/release_ai_usage", { method: "POST", body: JSON.stringify({ p_request_id: requestId }) });
    }
    catch (error) {
        if (!(error instanceof AccountServiceUnavailableError))
            console.warn("MindCanvas AI quota release unavailable", error instanceof Error ? error.message : error);
    }
}
export async function recordUsage(userId, kind, units = 1, bytes = 0, metadata = {}) {
    try {
        await serviceRequest("rpc/record_usage", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_kind: kind, p_units: units, p_bytes: bytes, p_metadata: metadata }) });
    }
    catch (error) {
        console.warn("MindCanvas usage telemetry unavailable", error instanceof Error ? error.message : error);
    }
}
function adminUserFromRows(user, profile, entitlement, planRow, usage, dailyRow, addon) {
    const plan = planFromRow(planRow, entitlement, usage, Number(usage?.storage_bytes ?? 0), dailyRow, addon);
    return { ...plan, userId: user.id, email: user.email ?? "", displayName: profile?.display_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "", lastSignInAt: user.last_sign_in_at ?? null, createdAt: user.created_at ?? null };
}
export async function listAdminUsers(query = "", planFilter = "") {
    const auth = await authAdminRequest("/admin/users?page=1&per_page=1000");
    const period = encodeURIComponent(dailyPeriodStart());
    const [profiles, entitlements, plans, usageRows, storageRows, dailyRows, addons] = await Promise.all([
        serviceRequest("profiles?select=id,display_name"),
        serviceRequest(`account_entitlements?select=${entitlementSelect}`),
        serviceRequest(`plans?select=${planSelect}&active=eq.true&order=sort_order`),
        serviceRequest(`usage_monthly?select=user_id,${monthlySelect}&month_start=eq.${encodeURIComponent(monthStart())}`),
        serviceRequest("account_storage?select=user_id,storage_bytes"),
        serviceRequest(`usage_daily?select=user_id,${dailySelect}&period_start=eq.${period}`),
        serviceRequest("account_addons?select=user_id,addon_id,status,expires_at,note&addon_id=eq.ai_manual"),
    ]);
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (auth.users ?? []).map(user => {
        const entitlement = entitlements.find(row => row.user_id === user.id);
        const planId = entitlement?.plan_id in PLAN_CATALOG ? entitlement.plan_id : "free";
        const planRow = plans.find(row => row.id === planId) ?? PLAN_CATALOG.free;
        const usage = usageRows.find(row => row.user_id === user.id);
        const storage = storageRows.find(row => row.user_id === user.id);
        const daily = dailyRows.find(row => row.user_id === user.id);
        const addon = addons.find(row => row.user_id === user.id);
        return adminUserFromRows(user, profiles.find(row => row.id === user.id), entitlement, planRow, { ...usage, storage_bytes: storage?.storage_bytes ?? 0 }, daily, addon);
    }).filter(user => !normalizedQuery || `${user.email} ${user.displayName}`.toLocaleLowerCase().includes(normalizedQuery)).filter(user => !planFilter || user.effectivePlanId === planFilter);
}
export async function getAdminSummary() {
    const users = await listAdminUsers();
    const planCounts = { free: 0, plus: 0, pro: 0, max: 0 };
    let storageBytes = 0, aiAutoCount = 0, uploads = 0;
    for (const user of users) {
        planCounts[user.effectivePlanId]++;
        storageBytes += user.usage.storageBytes;
        aiAutoCount += user.usage.aiAutoCount;
        uploads += user.usage.uploadCount;
    }
    return { generatedAt: new Date().toISOString(), totalUsers: users.length, planCounts, storageBytes, aiAutoCount, uploads };
}
function historyFromRow(row) {
    return { id: String(row.id), userId: String(row.user_id), changeType: row.change_type, previousPlanId: row.previous_plan_id, newPlanId: row.new_plan_id, previousAddonEnabled: Boolean(row.previous_addon_enabled), newAddonEnabled: Boolean(row.new_addon_enabled), previousExpiresAt: row.previous_expires_at ?? null, newExpiresAt: row.new_expires_at ?? null, changedBy: row.changed_by ?? null, note: row.note ?? null, createdAt: String(row.created_at) };
}
export async function getAdminUserDetail(userId) {
    const encodedUserId = encodeURIComponent(userId);
    const period = encodeURIComponent(dailyPeriodStart());
    const [user, profile, entitlement, plans, usage, events, storageRows, dailyRows, addons, historyRows] = await Promise.all([
        authAdminRequest(`/admin/users/${encodedUserId}`),
        serviceRequest(`profiles?select=id,display_name,avatar_url,created_at,updated_at&id=eq.${encodedUserId}&limit=1`),
        serviceRequest(`account_entitlements?select=${entitlementSelect}&user_id=eq.${encodedUserId}&limit=1`),
        serviceRequest(`plans?select=${planSelect}&active=eq.true&order=sort_order`),
        serviceRequest(`usage_monthly?select=${monthlySelect}&user_id=eq.${encodedUserId}&order=month_start.desc&limit=12`),
        serviceRequest(`usage_events?select=id,kind,units,bytes,metadata,created_at&user_id=eq.${encodedUserId}&order=created_at.desc&limit=50`),
        serviceRequest(`account_storage?select=storage_bytes&user_id=eq.${encodedUserId}&limit=1`),
        serviceRequest(`usage_daily?select=${dailySelect}&user_id=eq.${encodedUserId}&period_start=eq.${period}&limit=1`),
        serviceRequest(`account_addons?select=user_id,addon_id,status,expires_at,note&user_id=eq.${encodedUserId}&addon_id=eq.ai_manual&limit=1`),
        serviceRequest(`subscription_history?select=id,user_id,change_type,previous_plan_id,new_plan_id,previous_addon_enabled,new_addon_enabled,previous_expires_at,new_expires_at,changed_by,note,created_at&user_id=eq.${encodedUserId}&order=created_at.desc&limit=50`),
    ]);
    const ent = entitlement[0];
    const planId = ent?.plan_id in PLAN_CATALOG ? ent.plan_id : "free";
    const storageBytes = Number(storageRows?.[0]?.storage_bytes ?? 0);
    const daily = dailyRows?.[0];
    const addon = addons?.[0];
    const planRow = plans.find(row => row.id === planId) ?? PLAN_CATALOG.free;
    const plan = planFromRow(planRow, ent, usage[0], storageBytes, daily, addon);
    return { user: adminUserFromRows(user, profile[0], ent, planRow, { ...usage[0], storage_bytes: storageBytes }, daily, addon), plan, usage: usage.map((row, index) => usageFromRow(row, index === 0 ? storageBytes : undefined, index === 0 ? daily : undefined)), events: events ?? [], history: (historyRows ?? []).map(historyFromRow) };
}
export async function getSubscriptionHistory(userId) {
    const encodedUserId = encodeURIComponent(userId);
    const rows = await serviceRequest(`subscription_history?select=id,user_id,change_type,previous_plan_id,new_plan_id,previous_addon_enabled,new_addon_enabled,previous_expires_at,new_expires_at,changed_by,note,created_at&user_id=eq.${encodedUserId}&order=created_at.desc&limit=50`);
    return (rows ?? []).map(historyFromRow);
}
export async function assignPlan(adminUserId, userId, planId, expiresAt, note, addonEnabled = false) {
    await serviceRequest("rpc/admin_assign_subscription", { method: "POST", body: JSON.stringify({ p_admin_user_id: adminUserId, p_user_id: userId, p_plan_id: planId, p_addon_enabled: addonEnabled, p_expires_at: expiresAt, p_note: note }) });
}
