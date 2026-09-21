import { CheckCircle2, Sparkles, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import { useLanguage } from "../lib/i18n";
import type { GuideDefinition } from "../lib/featureGuides";

type Props = { guide: GuideDefinition; onClose: () => void };

const confetti = Array.from({ length: 22 }, (_, index) => ({
  left: `${4 + (index * 37) % 92}%`,
  delay: `${(index % 7) * 75}ms`,
  duration: `${1450 + (index % 5) * 150}ms`,
  drift: `${index % 2 ? 18 : -18}px`,
}));

export default function FeatureGuideCelebration({ guide, onClose }: Props) {
  const { language, t } = useLanguage();
  const title = language === "vi" ? guide.titleVi : guide.titleEn;
  const outcome = language === "vi" ? guide.outcomeVi : guide.outcomeEn;
  return createPortal(<div className="feature-guide-celebration-root" role="dialog" aria-modal="true" aria-label={t("guideCompletedTitle")}>
    <div className="feature-guide-celebration-backdrop" aria-hidden="true" onClick={onClose}/>
    <section className="feature-guide-celebration-card">
      <div className="feature-guide-confetti" aria-hidden="true">{confetti.map((piece, index) => <span key={index} style={{ left: piece.left, animationDelay: piece.delay, animationDuration: piece.duration, "--confetti-drift": piece.drift } as CSSProperties}/>)}</div>
      <button type="button" className="icon-button feature-guide-celebration-close" aria-label={t("close")} onClick={onClose}><X size={17}/></button>
      <div className="feature-guide-celebration-icon" aria-hidden="true"><CheckCircle2 size={33}/></div>
      <h2>{t("guideCompletedTitle")}</h2>
      <p>{t("guideCompletedBody", { guide: title })}</p>
      {outcome && <div className="feature-guide-celebration-outcome"><Sparkles size={15}/>{outcome}</div>}
      <div className="feature-guide-celebration-actions"><button type="button" className="primary-button" onClick={onClose}>{t("guideCompletedNext")}</button></div>
    </section>
  </div>, document.body);
}
