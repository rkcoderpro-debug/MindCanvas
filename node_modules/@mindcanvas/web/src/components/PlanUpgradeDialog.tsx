import { useEffect, useState } from "react";
import { Check, Clipboard, ExternalLink, MessageCircle } from "lucide-react";
import Dialog from "./Dialog";
import { AI_MANUAL_ADDON, PLAN_CATALOG, type AccountPlan, formatStorage, formatVnd } from "../lib/account";
import { getSubscriptionHistory } from "../lib/api";
import { useLanguage } from "../lib/i18n";

const ZALO_NUMBER = "0385287824";
const ZALO_URL = `https://zalo.me/${ZALO_NUMBER}`;

function historyDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function PlanUpgradeDialog({ currentPlan, onClose }: { currentPlan: AccountPlan; onClose: () => void }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getSubscriptionHistory>>["history"]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (currentPlan.status === "local-fallback") return;
    let alive = true;
    setHistoryLoading(true);
    void getSubscriptionHistory().then(result => { if (alive) setHistory(result.history); }).catch(() => {}).finally(() => { if (alive) setHistoryLoading(false); });
    return () => { alive = false; };
  }, [currentPlan.status]);

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(ZALO_NUMBER);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  };
  const currentPlanId = currentPlan.effectivePlanId;
  const aiAutoRemaining = Math.max(0, currentPlan.aiAutoDailyLimit - currentPlan.usage.aiAutoDailyCount);
  const aiManualRemaining = Math.max(0, currentPlan.aiManualDailyLimit - currentPlan.usage.aiManualDailyCount);
  const manualRemaining = currentPlan.aiManualUnlimited ? t("unlimitedShort") : `${aiManualRemaining}/${currentPlan.aiManualDailyLimit}`;

  return <Dialog title={t("planUpgradeTitle")} onClose={onClose}>
    <div className="plan-dialog-intro">
      <strong>{t("currentPlan")}: {PLAN_CATALOG.find(plan => plan.id === currentPlanId)?.name ?? currentPlan.name}</strong>
      <p>{t("planUpgradeHint")}</p>
      <small>{t("planUsageRemaining", { storage: formatStorage(currentPlan.usage.storageBytes), ai: aiAutoRemaining, aiLimit: currentPlan.aiAutoDailyLimit, manual: manualRemaining })}</small>
      <small className="field-hint">{t("dailyResetHint")}</small>
    </div>
    <div className="pricing-grid">
      {PLAN_CATALOG.map(plan => {
        const current = plan.id === currentPlanId;
        return <article className={`pricing-card ${current ? "current" : ""} ${plan.id === "pro" ? "recommended" : ""}`} key={plan.id}>
          <header><div><h3>{plan.name}</h3><small>{plan.description}</small></div>{current && <span className="pricing-current">{t("planCurrent")}</span>}</header>
          <strong className="pricing-price">{formatVnd(plan.priceVnd)}</strong>
          <ul>
            <li><Check size={15}/><span>{formatStorage(plan.storageLimitBytes)} {t("storageLimit").toLocaleLowerCase()}</span></li>
            <li><Check size={15}/><span>{plan.aiAutoDailyLimit} {t("aiAutoLimit").toLocaleLowerCase()}</span></li>
            <li><Check size={15}/><span>{plan.maxCards} {t("maxCardsLimit").toLocaleLowerCase()}</span></li>
            <li><Check size={15}/><span>{plan.aiManualIncluded ? t("aiManualIncluded") : t("aiManualFreeLimit", { count: plan.aiManualDailyLimit })}</span></li>
          </ul>
          {current && <div className="pricing-usage" aria-label={t("planUsageRemaining")}><div><span>{t("aiAutoRemaining")}</span><strong>{aiAutoRemaining}/{currentPlan.aiAutoDailyLimit}</strong></div><div><span>{t("aiManualRemaining")}</span><strong>{manualRemaining}</strong></div></div>}
          {current ? <button type="button" className="secondary-button" disabled><Check size={16}/>{t("planCurrent")}</button> : <a className="primary-button" href={ZALO_URL} target="_blank" rel="noreferrer"><MessageCircle size={16}/>{t("contactZalo")}</a>}
        </article>;
      })}
    </div>
    <article className={`pricing-card addon-card ${currentPlan.aiManualAddOnActive ? "current" : ""}`}>
      <header><div><h3>{AI_MANUAL_ADDON.name}</h3><small>{t("aiManualAddOnDescription")}</small></div>{currentPlan.aiManualAddOnActive && <span className="pricing-current">{t("aiManualAddOnActive")}</span>}</header>
      <strong className="pricing-price">{formatVnd(AI_MANUAL_ADDON.priceVnd)}</strong>
      <p>{t("aiManualUsageHint")}</p><p className="field-hint">{t("manualPlanSupportHint")}</p>
      {currentPlan.aiManualAddOnActive ? <button type="button" className="secondary-button" disabled><Check size={16}/>{t("aiManualAddOnActive")}</button> : <a className="primary-button" href={ZALO_URL} target="_blank" rel="noreferrer"><MessageCircle size={16}/>{t("contactZalo")}</a>}
    </article>
    <section className="subscription-history">
      <h3>{t("subscriptionHistory")}</h3>
      {historyLoading ? <p>{t("loading")}</p> : !history.length ? <p>{t("noSubscriptionHistory")}</p> : <ul>{history.map(item => {
        const oldPlan = PLAN_CATALOG.find(plan => plan.id === item.previousPlanId)?.name ?? item.previousPlanId;
        const newPlan = PLAN_CATALOG.find(plan => plan.id === item.newPlanId)?.name ?? item.newPlanId;
        return <li key={item.id}><span><strong>{oldPlan} → {newPlan}</strong><small>{historyDate(item.createdAt)}</small></span><small>{item.newAddonEnabled ? t("aiManualAddOnActive") : item.changeType === "addon" ? t("aiManualAddOn") : ""}</small></li>;
      })}</ul>}
    </section>
    <div className="zalo-contact-card">
      <div><strong>{t("contactZalo")}: {ZALO_NUMBER}</strong><small>{t("zaloHint")}</small></div>
      <div className="actions"><button type="button" className="secondary-button" onClick={() => void copyNumber()}><Clipboard size={16}/>{copied ? t("planCopied") : t("copyZalo")}</button><a className="secondary-button" href={ZALO_URL} target="_blank" rel="noreferrer"><ExternalLink size={16}/>{t("openNewTab")}</a></div>
    </div>
  </Dialog>;
}
