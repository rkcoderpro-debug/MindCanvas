import { useState } from "react";
import { Check, Clipboard, LifeBuoy, MessageCircle } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { createAiSupportIssue, type AiSupportContext, type AiSupportIssue, type AiSupportKind } from "../lib/aiSupport";

const ZALO_URL = "https://zalo.me/0385287824";

type Props = {
  kind: AiSupportKind;
  context?: AiSupportContext;
  issue: AiSupportIssue | null;
  onIssueCreated: (issue: AiSupportIssue) => void;
};

export default function AiSupportActions({ kind, context, issue, onIssueCreated }: Props) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const createIssue = () => onIssueCreated(createAiSupportIssue(kind, context));
  const copyDetails = async () => {
    if (!issue) return;
    try {
      await navigator.clipboard.writeText(issue.details);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  };
  if (!issue) return <button type="button" className="ai-support-trigger" onClick={createIssue}><LifeBuoy size={15}/>{t(kind === "aiAuto" ? "reportAiAuto" : "manualPlanNotReceived")}</button>;
  return <section className="ai-support-card" aria-label={t("supportIssueCreated")}>
    <header><LifeBuoy size={17}/><div><strong>{t("supportIssueCreated")}</strong><small>{issue.code}</small></div></header>
    <p>{t(kind === "aiAuto" ? "supportAiAutoHint" : "supportManualPlanHint")}</p>
    <div className="actions"><button type="button" className="secondary-button" onClick={() => void copyDetails()}><Clipboard size={15}/>{copied ? <><Check size={14}/>{t("supportCopied")}</> : t("copySupportDetails")}</button><a className="primary-button" href={ZALO_URL} target="_blank" rel="noreferrer"><MessageCircle size={15}/>{t("contactAdmin")}</a></div>
  </section>;
}
