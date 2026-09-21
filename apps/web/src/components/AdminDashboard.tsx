import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BarChart3, Check, Database, LoaderCircle, RefreshCw, Search, ShieldCheck, UserRound, Users } from "lucide-react";
import { assignAdminPlan, getAdminSummary, getAdminUserDetail, getAdminUsers, type AdminSummary, type AdminUserDetail, type AdminUserSummary } from "../lib/api";
import { PLAN_CATALOG, formatStorage, formatVnd, usagePercent, type PlanId } from "../lib/account";
import { useLanguage } from "../lib/i18n";
import FeatureGuideAdminPanel from "./FeatureGuideAdminPanel";

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function UsageBar({ used, limit, label, unit = "bytes" }: { used: number; limit: number; label: string; unit?: "bytes" | "count" }) {
  const format = (value: number) => unit === "count" ? String(value) : formatStorage(value);
  return <div className="admin-usage-bar"><div><span>{label}</span><small>{format(used)} / {format(limit)}</small></div><span className="admin-progress"><i style={{ width: `${usagePercent(used, limit)}%` }}/></span></div>;
}

export default function AdminDashboard({ onBack, ownerId, onRunGuide }: { onBack: () => void; ownerId: string | null; onRunGuide?: (guideId: string) => void }) {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [query, setQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [draftPlan, setDraftPlan] = useState<PlanId>("free");
  const [draftAddonEnabled, setDraftAddonEnabled] = useState(false);
  const [draftExpiresAt, setDraftExpiresAt] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextSummary, nextUsers] = await Promise.all([getAdminSummary(), getAdminUsers(query, planFilter)]);
      setSummary(nextSummary); setUsers(nextUsers.users);
      if (selectedId && !nextUsers.users.some(user => user.userId === selectedId)) { setSelectedId(null); setDetail(null); }
    } catch (err) { setError(err instanceof Error ? err.message : t("adminLoadError")); }
    finally { setLoading(false); }
  }, [planFilter, query, selectedId, t]);

  useEffect(() => { void load(); }, [load]);

  const selectUser = async (user: AdminUserSummary) => {
    setSelectedId(user.userId); setDetailLoading(true); setError("");
    try {
      const next = await getAdminUserDetail(user.userId);
      setDetail(next); setDraftPlan(next.plan.effectivePlanId); setDraftAddonEnabled(next.plan.aiManualAddOnActive); setDraftExpiresAt(next.plan.expiresAt ? next.plan.expiresAt.slice(0, 10) : ""); setDraftNote(next.plan.note ?? "");
    } catch (err) { setError(err instanceof Error ? err.message : t("adminLoadError")); }
    finally { setDetailLoading(false); }
  };

  const save = async () => {
    if (!detail) return;
    setSaving(true); setSaved(false); setError("");
    try {
      await assignAdminPlan(detail.user.userId, { planId: draftPlan, addonEnabled: draftAddonEnabled, expiresAt: draftExpiresAt ? new Date(`${draftExpiresAt}T23:59:59.000Z`).toISOString() : null, note: draftNote.trim() || null });
      const next = await getAdminUserDetail(detail.user.userId);
      setDetail(next); setDraftPlan(next.plan.effectivePlanId); setDraftAddonEnabled(next.plan.aiManualAddOnActive); setDraftExpiresAt(next.plan.expiresAt ? next.plan.expiresAt.slice(0, 10) : ""); setDraftNote(next.plan.note ?? ""); setSaved(true); await load();
    } catch (err) { setError(err instanceof Error ? err.message : t("adminUpdateError")); }
    finally { setSaving(false); }
  };

  const submitSearch = (event: React.FormEvent) => { event.preventDefault(); setQuery(draftQuery); };

  return <main className="admin-page">
    <header className="admin-page-header"><div><button type="button" className="secondary-button admin-back-button" onClick={onBack}><ArrowLeft size={16}/>{t("adminBack")}</button><div className="admin-title-row"><span className="admin-title-icon"><ShieldCheck size={22}/></span><div><h1>{t("adminDashboard")}</h1><p>{t("adminDashboardHint")}</p></div></div></div><button type="button" className="icon-button" title={t("refresh")} aria-label={t("refresh")} onClick={() => void load()} disabled={loading}><RefreshCw size={18}/></button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {summary && <section className="admin-stats" aria-label={t("adminService")}>
      <article><UserRound size={18}/><span>{t("adminUserCount")}</span><strong>{summary.totalUsers}</strong></article>
      <article><Database size={18}/><span>{t("adminStorageUsed")}</span><strong>{formatStorage(summary.storageBytes)}</strong></article>
      <article><BarChart3 size={18}/><span>{t("adminAiUsage")}</span><strong>{summary.aiAutoCount}</strong></article>
      <article><Users size={18}/><span>{t("adminUploads")}</span><strong>{summary.uploads}</strong></article>
    </section>}
    {summary && <section className="admin-plan-summary"><strong>{t("adminPlanDistribution")}</strong><div>{PLAN_CATALOG.map(plan => <span key={plan.id}><b>{plan.name}</b><small>{summary.planCounts[plan.id] ?? 0}</small></span>)}</div></section>}
    <section className="admin-workspace">
      <div className="admin-user-list"><form className="admin-search" onSubmit={submitSearch}><Search size={16}/><input value={draftQuery} onChange={event => setDraftQuery(event.target.value)} placeholder={t("adminSearchUsers")}/><button className="secondary-button" type="submit">{t("search")}</button></form><select aria-label={t("adminPlan")} value={planFilter} onChange={event => setPlanFilter(event.target.value)}><option value="">{t("allPlans")}</option>{PLAN_CATALOG.map(plan => <option value={plan.id} key={plan.id}>{plan.name}</option>)}</select>{loading ? <p className="admin-empty"><LoaderCircle className="spin" size={18}/>{t("adminLoading")}</p> : !users.length ? <p className="admin-empty">{t("noResults")}</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("adminUser")}</th><th>{t("adminPlan")}</th><th>{t("adminUsage")}</th><th>{t("adminLastActive")}</th></tr></thead><tbody>{users.map(user => <tr className={selectedId === user.userId ? "selected" : ""} key={user.userId} onClick={() => void selectUser(user)}><td><strong>{user.displayName || user.email || "—"}</strong><small>{user.email}</small></td><td><span className={`plan-pill ${user.effectivePlanId}`}>{user.name}</span>{user.aiManualAddOnActive && <small className="admin-addon-badge">{t("aiManualAddOn")}</small>}</td><td><span>{formatStorage(user.usage.storageBytes)}</span><small>{user.usage.aiAutoDailyCount} AI Auto · {user.usage.aiManualDailyCount} AI Manual</small></td><td>{dateLabel(user.lastSignInAt ?? user.usage.lastUsedAt)}</td></tr>)}</tbody></table></div>}</div>
      <aside className="admin-detail-card">{detailLoading ? <p className="admin-empty"><LoaderCircle className="spin" size={18}/>{t("adminLoading")}</p> : !detail ? <div className="admin-empty admin-select-hint"><ShieldCheck size={28}/><p>{t("adminSelectUser")}</p></div> : <>
        <header><div><strong>{t("adminDetails")}</strong><small>{detail.user.email}</small></div><span className={`plan-pill ${detail.plan.effectivePlanId}`}>{detail.plan.name}{detail.plan.aiManualAddOnActive ? " + AI Manual" : ""}</span></header>
        <div className="admin-detail-fields"><label>{t("adminAssignPlan")}<select value={draftPlan} onChange={event => setDraftPlan(event.target.value as PlanId)}>{PLAN_CATALOG.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {formatVnd(plan.priceVnd)}</option>)}</select></label><label className="admin-checkbox"><input type="checkbox" checked={draftAddonEnabled} onChange={event => setDraftAddonEnabled(event.target.checked)}/><span>{t("adminAddonEnabled")}</span></label><small className="field-hint">{t("adminAddonIncluded")}</small><label>{t("adminExpiresAt")}<input type="date" value={draftExpiresAt} onChange={event => setDraftExpiresAt(event.target.value)}/><small>{draftExpiresAt ? dateLabel(draftExpiresAt) : t("adminNoExpiry")}</small></label><label>{t("adminInternalNote")}<textarea maxLength={500} value={draftNote} onChange={event => setDraftNote(event.target.value)} /></label><small className="field-hint">{t("adminPlanHint")}</small><button type="button" className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={16}/> : saved ? <Check size={16}/> : null}{saving ? t("saving") : saved ? t("adminSaved") : t("adminSavePlan")}</button></div>
        <section className="admin-usage-detail"><h3>{t("adminUsageThisMonth")}</h3><UsageBar used={detail.plan.usage.storageBytes} limit={detail.plan.storageLimitBytes} label={t("adminStorage")}/><UsageBar used={detail.plan.usage.aiAutoDailyCount} limit={detail.plan.aiAutoDailyLimit} label={t("adminAiAuto")} unit="count"/>{detail.plan.aiManualUnlimited ? <p className="admin-unlimited">{t("aiManualUnlimited")}</p> : <UsageBar used={detail.plan.usage.aiManualDailyCount} limit={detail.plan.aiManualDailyLimit} label={t("adminAiManual")} unit="count"/>}<div className="admin-usage-grid"><span><b>{detail.plan.usage.mindMapCount}</b>{t("adminMindMaps")}</span><span><b>{detail.plan.usage.flashcardCount}</b>{t("adminFlashcards")}</span><span><b>{detail.plan.usage.selectionCount}</b>{t("adminSelections")}</span><span><b>{detail.plan.usage.uploadCount}</b>{t("adminUploadsCount")}</span></div></section>
        <section className="admin-events"><h3>{t("adminActivity")}</h3>{detail.events.length ? <ul>{detail.events.map(event => <li key={event.id}><span><strong>{event.kind}</strong><small>{dateLabel(event.created_at)}</small></span><b>{event.units}{event.bytes ? ` · ${formatStorage(event.bytes)}` : ""}</b></li>)}</ul> : <p>{t("adminNoEvents")}</p>}</section>
        <section className="admin-history"><h3>{t("adminHistory")}</h3>{detail.history.length ? <ul>{detail.history.map(item => <li key={item.id}><span><strong>{item.previousPlanId} → {item.newPlanId}</strong><small>{dateLabel(item.createdAt)}</small></span><small>{item.newAddonEnabled ? t("aiManualAddOnActive") : ""}</small></li>)}</ul> : <p>{t("adminNoHistory")}</p>}</section>
      </>}</aside>
    </section>
    <FeatureGuideAdminPanel ownerId={ownerId} onRunGuide={onRunGuide}/>
  </main>;
}
