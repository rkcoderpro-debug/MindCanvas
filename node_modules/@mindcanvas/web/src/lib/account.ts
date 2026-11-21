export type PlanId = "free" | "plus" | "pro" | "max";

export type PlanInfo = {
  id: PlanId;
  name: string;
  priceVnd: number;
  storageLimitBytes: number;
  aiAutoMonthlyLimit: number;
  aiAutoDailyLimit: number;
  aiManualDailyLimit: number;
  aiManualIncluded: boolean;
  maxCards: number;
  description: string;
  sortOrder: number;
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
  dailyPeriodStart: string;
  dailyResetAt: string;
  aiAutoDailyCount: number;
  aiManualDailyCount: number;
};

export type AccountPlan = PlanInfo & {
  status: string;
  assignedAt: string | null;
  expiresAt: string | null;
  note: string | null;
  effectivePlanId: PlanId;
  aiManualAddOnActive: boolean;
  aiManualUnlimited: boolean;
  usage: UsageSnapshot;
};

export type SubscriptionHistoryRecord = {
  id: string;
  userId: string;
  changeType: "plan" | "addon" | "plan_and_addon";
  previousPlanId: PlanId;
  newPlanId: PlanId;
  previousAddonEnabled: boolean;
  newAddonEnabled: boolean;
  previousExpiresAt: string | null;
  newExpiresAt: string | null;
  changedBy: string | null;
  note: string | null;
  createdAt: string;
};

export const AI_MANUAL_ADDON = { id: "ai_manual", name: "AI Manual", priceVnd: 29000 } as const;

export const PLAN_CATALOG: PlanInfo[] = [
  { id: "free", name: "Free", priceVnd: 0, storageLimitBytes: 20 * 1024 * 1024, aiAutoMonthlyLimit: 30, aiAutoDailyLimit: 1, aiManualDailyLimit: 3, aiManualIncluded: false, maxCards: 50, description: "Bắt đầu học và làm việc", sortOrder: 1 },
  { id: "plus", name: "Plus", priceVnd: 79000, storageLimitBytes: 500 * 1024 * 1024, aiAutoMonthlyLimit: 600, aiAutoDailyLimit: 20, aiManualDailyLimit: 0, aiManualIncluded: true, maxCards: 100, description: "Cho nhu cầu học tập thường xuyên", sortOrder: 2 },
  { id: "pro", name: "Pro", priceVnd: 159000, storageLimitBytes: 2 * 1024 * 1024 * 1024, aiAutoMonthlyLimit: 1800, aiAutoDailyLimit: 60, aiManualDailyLimit: 0, aiManualIncluded: true, maxCards: 200, description: "Cho người dùng chuyên sâu", sortOrder: 3 },
  { id: "max", name: "Max", priceVnd: 499000, storageLimitBytes: 10 * 1024 * 1024 * 1024, aiAutoMonthlyLimit: 4500, aiAutoDailyLimit: 150, aiManualDailyLimit: 0, aiManualIncluded: true, maxCards: 500, description: "Toàn bộ giới hạn mở rộng", sortOrder: 4 },
];

export const FREE_ACCOUNT_PLAN: AccountPlan = {
  ...PLAN_CATALOG[0],
  status: "local-fallback",
  assignedAt: null,
  expiresAt: null,
  note: null,
  effectivePlanId: "free",
  aiManualAddOnActive: false,
  aiManualUnlimited: false,
  usage: { monthStart: "", storageBytes: 0, aiAutoCount: 0, mindMapCount: 0, selectionCount: 0, flashcardCount: 0, uploadCount: 0, lastUsedAt: null, dailyPeriodStart: "", dailyResetAt: "", aiAutoDailyCount: 0, aiManualDailyCount: 0 },
};

export function formatStorage(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function formatVnd(value: number) {
  if (!value) return "Miễn phí";
  return `${new Intl.NumberFormat("vi-VN").format(value)}₫/tháng`;
}

export function usagePercent(used: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(100, Math.max(0, used / limit * 100));
}
