import { Sparkles } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import type { AiGenerationOptions } from "../lib/aiOptions";

export default function AiQualityControls({ options, onChange, showDifficulty = true }: { options: AiGenerationOptions; onChange: (next: AiGenerationOptions) => void; showDifficulty?: boolean }) {
  const { t } = useLanguage();
  return <fieldset className="ai-quality-controls"><legend><Sparkles size={14}/>{t("aiQuality")}</legend>{showDifficulty && <label><span>{t("aiDifficulty")}</span><select value={options.difficulty} onChange={event => onChange({ ...options, difficulty: event.target.value as AiGenerationOptions["difficulty"] })}><option value="easy">{t("aiDifficultyEasy")}</option><option value="balanced">{t("aiDifficultyBalanced")}</option><option value="hard">{t("aiDifficultyHard")}</option></select></label>}<label><span>{t("aiDepth")}</span><select value={options.depth} onChange={event => onChange({ ...options, depth: event.target.value as AiGenerationOptions["depth"] })}><option value="basic">{t("aiDepthBasic")}</option><option value="detailed">{t("aiDepthDetailed")}</option></select></label></fieldset>;
}
