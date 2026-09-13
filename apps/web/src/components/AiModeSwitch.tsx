import { ClipboardPaste, Sparkles } from "lucide-react";

import { useLanguage } from "../lib/i18n";

export type AiMode = "auto" | "manual";

type AiModeSwitchProps = {
  mode: AiMode;
  autoAvailable: boolean;
  onChange: (mode: AiMode) => void;
};

export function AiModeSwitch({ mode, autoAvailable, onChange }: AiModeSwitchProps) {
  const { t } = useLanguage();

  return (
    <div className="ai-mode-switch" role="tablist" aria-label={t("aiMode")}>
      <button
        className={mode === "auto" ? "active" : ""}
        type="button"
        role="tab"
        aria-selected={mode === "auto"}
        disabled={!autoAvailable}
        title={autoAvailable ? t("aiAuto") : t("aiAutoLoginHint")}
        onClick={() => onChange("auto")}
      >
        <Sparkles size={16} aria-hidden="true" />
        <span>{t("aiAuto")}</span>
      </button>
      <button
        className={mode === "manual" ? "active" : ""}
        type="button"
        role="tab"
        aria-selected={mode === "manual"}
        onClick={() => onChange("manual")}
      >
        <ClipboardPaste size={16} aria-hidden="true" />
        <span>{t("aiManual")}</span>
      </button>
    </div>
  );
}

export type ManualStep = "source" | "prompt" | "gemini" | "result" | "preview";

const manualStepOrder: ManualStep[] = ["source", "prompt", "gemini", "result", "preview"];

const manualStepKeys: Record<ManualStep, "manualStepSource" | "manualStepPrompt" | "manualStepGemini" | "manualStepResult" | "manualStepPreview"> = {
  source: "manualStepSource",
  prompt: "manualStepPrompt",
  gemini: "manualStepGemini",
  result: "manualStepResult",
  preview: "manualStepPreview",
};

export function ManualSteps({ current }: { current: ManualStep }) {
  const { t } = useLanguage();
  const currentIndex = manualStepOrder.indexOf(current);

  return (
    <div className="ai-manual-steps" aria-label={t("aiManual")}>
      {manualStepOrder.map((step, index) => (
        <div
          className={`ai-manual-step ${index === currentIndex ? "active" : ""} ${index < currentIndex ? "complete" : ""}`}
          key={step}
        >
          <span className="ai-manual-step-number">{index + 1}</span>
          <span>{t(manualStepKeys[step])}</span>
        </div>
      ))}
    </div>
  );
}
