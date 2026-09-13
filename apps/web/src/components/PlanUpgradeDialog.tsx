import { useState } from "react";
import { Check, Clipboard, ExternalLink, MessageCircle } from "lucide-react";
import Dialog from "./Dialog";
import { PLAN_CATALOG, type AccountPlan, formatStorage, formatVnd } from "../lib/account";
import { useLanguage } from "../lib/i18n";

const ZALO_NUMBER = "0385287824";
const ZALO_URL = `https://zalo.me/${ZALO_NUMBER}`;

export default function PlanUpgradeDialog({ currentPlan, onClose }: { currentPlan: AccountPlan; onClose: () => void }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(ZALO_NUMBER);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  };
  return <Dialog title={t("planUpgradeTitle")} onClose={onClose}>
    <div className="plan-dialog-intro">
      <strong>{t("currentPlan")}: {currentPlan.name}</strong>
      <p>{t("planUpgradeHint")}</p>
      <small>{t("planUsage", { storage: formatStorage(currentPlan.usage.storageBytes), ai: currentPlan.usage.aiAutoCount, aiLimit: currentPlan.aiAutoMonthlyLimit })}</small>
    </div>
    <div className="pricing-grid">
      {PLAN_CATALOG.map(plan => {
        const current = plan.id === currentPlan.id;
        return <article className={`pricing-card ${current ? "current" : ""} ${plan.id === "pro" ? "recommended" : ""}`} key={plan.id}>
          <header><div><h3>{plan.name}</h3><small>{plan.description}</small></div>{current && <span className="pricing-current">{t("planCurrent")}</span>}</header>
          <strong className="pricing-price">{formatVnd(plan.priceVnd)}</strong>
          <ul>
            <li><Check size={15}/><span>{formatStorage(plan.storageLimitBytes)} {t("storageLimit").toLocaleLowerCase()}</span></li>
            <li><Check size={15}/><span>{plan.aiAutoMonthlyLimit} {t("aiAutoLimit").toLocaleLowerCase()}</span></li>
            <li><Check size={15}/><span>{plan.maxCards} {t("maxCardsLimit").toLocaleLowerCase()}</span></li>
            <li><Check size={15}/><span>{t("aiManualUnlimited")}</span></li>
          </ul>
          {current ? <button type="button" className="secondary-button" disabled><Check size={16}/>{t("planCurrent")}</button> : <a className="primary-button" href={ZALO_URL} target="_blank" rel="noreferrer"><MessageCircle size={16}/>{t("contactZalo")}</a>}
        </article>;
      })}
    </div>
    <div className="zalo-contact-card">
      <div><strong>{t("contactZalo")}: {ZALO_NUMBER}</strong><small>{t("zaloHint")}</small></div>
      <div className="actions"><button type="button" className="secondary-button" onClick={() => void copyNumber()}><Clipboard size={16}/>{copied ? t("planCopied") : t("copyZalo")}</button><a className="secondary-button" href={ZALO_URL} target="_blank" rel="noreferrer"><ExternalLink size={16}/>{t("openNewTab")}</a></div>
    </div>
  </Dialog>;
}
