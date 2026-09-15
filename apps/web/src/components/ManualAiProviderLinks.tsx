import { ExternalLink } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { MANUAL_AI_PROVIDERS } from "../lib/manualAi";

export default function ManualAiProviderLinks({ disabled = false, onBlocked }: { disabled?: boolean; onBlocked?: () => void }) {
  const { t } = useLanguage();
  return <div className="manual-ai-providers" aria-label={t("aiManualProviders")}>
    <span>{t("aiManualProviders")}</span>
    <div className="ai-manual-actions">
      {MANUAL_AI_PROVIDERS.map(provider => <button type="button" className="secondary-button" key={provider.id} disabled={disabled} onClick={() => { const opened = window.open(provider.url, "_blank", "noopener,noreferrer"); if (!opened) onBlocked?.(); }}>
        <ExternalLink size={15}/>{t("openAiProvider")} {provider.label}
      </button>)}
    </div>
  </div>;
}
