import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Film, Play, Search, Sparkles } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { GUIDE_DEFINITIONS, GUIDE_PROGRESS_EVENT, guideIsActivated, readGuideProgress, type GuideCategory } from "../lib/featureGuides";

type Props = {
  ownerId: string | null;
  onRunGuide: (guideId: string) => void;
};

const categories: Array<{ id: "all" | GuideCategory; vi: string; en: string }> = [
  { id: "all", vi: "Tất cả", en: "All" },
  { id: "workspace", vi: "Workspace", en: "Workspace" },
  { id: "canvas", vi: "Canvas", en: "Canvas" },
  { id: "learning", vi: "Học tập", en: "Learning" },
  { id: "documents", vi: "Tài liệu", en: "Documents" },
  { id: "ai", vi: "AI", en: "AI" },
];

function categoryLabel(category: GuideCategory, language: "vi" | "en") {
  const item = categories.find(value => value.id === category);
  return language === "vi" ? item?.vi ?? category : item?.en ?? category;
}

function statusLabel(status: string | undefined, language: "vi" | "en") {
  if (status === "completed") return language === "vi" ? "Đã hoàn tất" : "Completed";
  if (status === "active") return language === "vi" ? "Đang xem" : "In progress";
  if (status === "skipped") return language === "vi" ? "Đã bỏ qua" : "Skipped";
  return language === "vi" ? "Chưa mở" : "Not opened";
}

function GuideDemo({ kind }: { kind: string }) {
  return <div className={`feature-guide-demo feature-guide-demo-${kind}`} aria-hidden="true"><span className="feature-guide-demo-window"><i/><i/><i/></span><span className="feature-guide-demo-cursor"><Sparkles size={18}/></span><b>{kind === "pdf" ? "PDF" : kind === "lab" ? "HTML" : kind === "canvas" ? "Canvas" : "MindCanvas"}</b></div>;
}

export default function FeatureGuidePage({ ownerId, onRunGuide }: Props) {
  const { language, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | GuideCategory>("all");
  const [progressVersion, setProgressVersion] = useState(0);
  const progress = useMemo(() => readGuideProgress(ownerId), [ownerId, progressVersion]);
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ ownerId?: string }>).detail;
      if (!detail?.ownerId || detail.ownerId === (ownerId || "guest")) setProgressVersion(value => value + 1);
    };
    window.addEventListener(GUIDE_PROGRESS_EVENT, update);
    return () => window.removeEventListener(GUIDE_PROGRESS_EVENT, update);
  }, [ownerId]);

  const filtered = GUIDE_DEFINITIONS.filter(guide => {
    if (category !== "all" && guide.category !== category) return false;
    const text = `${guide.titleVi} ${guide.titleEn} ${guide.summaryVi} ${guide.summaryEn}`.toLocaleLowerCase();
    return !query.trim() || text.includes(query.trim().toLocaleLowerCase());
  });
  const activatedCount = GUIDE_DEFINITIONS.filter(guide => guideIsActivated(progress, guide.id)).length;

  return <main className="feature-guide-page">
    <header className="feature-guide-page-header"><div><span className="eyebrow"><BookOpen size={15}/> MINDCANVAS WIKI</span><h1>{t("guidesTitle")}</h1><p>{t("guidesHint")}</p></div><span className="feature-guide-count"><CheckCircle2 size={16}/>{activatedCount}/{GUIDE_DEFINITIONS.length}</span></header>
    <div className="feature-guide-toolbar"><label className="feature-guide-search"><Search size={16}/><input aria-label={t("guidesSearch")} value={query} onChange={event => setQuery(event.target.value)} placeholder={t("guidesSearch")}/></label><div className="feature-guide-categories" role="tablist" aria-label={t("guides")}>{categories.map(item => <button type="button" role="tab" aria-selected={category === item.id} className={category === item.id ? "active" : ""} key={item.id} onClick={() => setCategory(item.id)}>{language === "vi" ? item.vi : item.en}</button>)}</div></div>
    {!filtered.length ? <div className="feature-guide-empty"><Film size={24}/><p>{t("guideNoResults")}</p></div> : <div className="feature-guide-grid">{filtered.map(guide => {
      const entry = progress[guide.id];
      const title = language === "vi" ? guide.titleVi : guide.titleEn;
      const summary = language === "vi" ? guide.summaryVi : guide.summaryEn;
      return <article className="feature-guide-card" key={guide.id}>
        <div className="feature-guide-card-media">{guide.gifSrc && <img src={guide.gifSrc} alt={`${title} ${t("guideGifAlt")}`} loading="lazy" onError={event => { event.currentTarget.style.display = "none"; }}/>}<GuideDemo kind={guide.demo}/><span className="feature-guide-category">{categoryLabel(guide.category, language)}</span></div>
        <div className="feature-guide-card-body"><div className="feature-guide-card-heading"><h2>{title}</h2><span className={`feature-guide-status ${entry?.status ?? "unseen"}`}>{statusLabel(entry?.status, language)}</span></div><p>{summary}</p><div className="feature-guide-card-actions"><button type="button" className="primary-button" onClick={() => onRunGuide(guide.id)}><Play size={15}/>{t("runGuide")}</button><small>{guide.steps.length} {t("guideSteps")}</small></div></div>
      </article>;
    })}</div>}
  </main>;
}
