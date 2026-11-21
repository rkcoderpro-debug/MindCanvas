import { useEffect, useMemo, useState } from "react";
import { Play, RotateCcw, ShieldCheck } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { GUIDE_CONTENT_VERSION, GUIDE_DEFINITIONS, GUIDE_PROGRESS_EVENT, guideIsActivated, markGuideStarted, readGuideProgress, resetGuideProgress, type GuideCategory } from "../lib/featureGuides";

type Props = {
  ownerId: string | null;
  onRunGuide?: (guideId: string) => void;
};

function categoryLabel(category: GuideCategory, language: "vi" | "en") {
  const labels: Record<GuideCategory, [string, string]> = {
    workspace: ["Workspace", "Workspace"],
    canvas: ["Canvas", "Canvas"],
    learning: ["Học tập", "Learning"],
    documents: ["Tài liệu", "Documents"],
    tools: ["Công cụ", "Tools"],
    ai: ["AI", "AI"],
  };
  return labels[category][language === "vi" ? 0 : 1];
}

export default function FeatureGuideAdminPanel({ ownerId, onRunGuide }: Props) {
  const { language, t } = useLanguage();
  const [version, setVersion] = useState(0);
  const progress = useMemo(() => readGuideProgress(ownerId), [ownerId, version]);
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ ownerId?: string }>).detail;
      if (!detail?.ownerId || detail.ownerId === (ownerId || "guest")) setVersion(value => value + 1);
    };
    window.addEventListener(GUIDE_PROGRESS_EVENT, update);
    return () => window.removeEventListener(GUIDE_PROGRESS_EVENT, update);
  }, [ownerId]);

  const activated = GUIDE_DEFINITIONS.filter(guide => guideIsActivated(progress, guide.id)).length;
  return <section className="admin-guide-panel">
    <header className="admin-guide-panel-header"><div><div className="admin-section-heading"><ShieldCheck size={18}/><h2>{t("guideAdminTitle")}</h2></div><p>{t("guideAdminHint")}</p></div><div className="admin-guide-actions"><span>{activated}/{GUIDE_DEFINITIONS.length} {t("guideAdminActivated")}</span><button type="button" className="secondary-button" onClick={() => resetGuideProgress(ownerId)}><RotateCcw size={14}/>{t("guideAdminResetAll")}</button></div></header>
    <div className="admin-guide-table-wrap"><table className="admin-guide-table"><thead><tr><th>{t("guides")}</th><th>{t("guideAdminStatus")}</th><th>{t("guideAdminLastOpened")}</th><th>{t("guideAdminVersion")}</th><th>{t("adminActions")}</th></tr></thead><tbody>{GUIDE_DEFINITIONS.map(guide => {
      const entry = progress[guide.id];
      const isActivated = guideIsActivated(progress, guide.id);
      const title = language === "vi" ? guide.titleVi : guide.titleEn;
      return <tr key={guide.id}><td><strong>{title}</strong><small>{categoryLabel(guide.category, language)} · {guide.steps.length} {t("guideSteps")}</small></td><td><label className="admin-guide-check"><input type="checkbox" checked={isActivated} onChange={event => { if (event.target.checked) markGuideStarted(ownerId, guide.id); else resetGuideProgress(ownerId, guide.id); }}/><span>{isActivated ? t("guideAdminActivated") : t("guideAdminUnseen")}</span></label></td><td>{entry?.startedAt ? new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.startedAt)) : "—"}</td><td><code>{GUIDE_CONTENT_VERSION}</code></td><td><div className="admin-guide-row-actions"><button type="button" className="secondary-button" onClick={() => onRunGuide?.(guide.id)}><Play size={13}/>{t("guideAdminRun")}</button><button type="button" className="icon-button" aria-label={t("guideAdminReset")} title={t("guideAdminReset")} onClick={() => resetGuideProgress(ownerId, guide.id)}><RotateCcw size={15}/></button></div></td></tr>;
    })}</tbody></table></div>
  </section>;
}
