import { ExternalLink } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { MANUAL_AI_PROVIDERS } from "../lib/manualAi";
import { useRef, useState } from "react";
import { writeClipboardText } from "../lib/aiSource";
import { manualProviderUrl } from "../lib/manualProvider";

export default function ManualAiProviderLinks({ disabled = false, onBlocked, prompt, onPrepare }: { disabled?: boolean; onBlocked?: () => void; prompt?: string; onPrepare?: () => Promise<string> }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const opening = useRef(false);
  const open = async (provider: typeof MANUAL_AI_PROVIDERS[number]) => {
    if (opening.current) return;
    // Reserve a tab synchronously so quota/clipboard awaits do not lose the click gesture.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    if (prompt === undefined) { if (tab) tab.location.replace(provider.url); else onBlocked?.(); return; }
    opening.current = true;
    setBusy(true); setNotice("");
    try {
      const text = onPrepare ? await onPrepare() : prompt;
      if (!text.trim()) throw new Error("Chưa có prompt để mở AI.");
      let copied = false;
      try { await writeClipboardText(text); copied = true; } catch { /* Keep the visible prompt available for manual copying. */ }
      const target = manualProviderUrl(provider.id, provider.url, text);
      if (tab) { tab.location.replace(target.url); }
      else onBlocked?.();
      setNotice(!tab ? "Trình duyệt đã chặn tab mới. Hãy cho phép mở tab rồi thử lại." : copied ? (target.prefilled ? "Đã mở ChatGPT và sao chép prompt. Nếu ô chat chưa có nội dung, hãy nhấn Ctrl+V hoặc Dán." : `Đã sao chép prompt và mở ${provider.label}. Nhấn Ctrl+V hoặc Dán trong ô chat.`) : "Đã mở AI. Trình duyệt chưa cho sao chép; hãy chọn và sao chép prompt bên dưới.");
    } catch (cause) { tab?.close(); setNotice(cause instanceof Error ? cause.message : "Không mở được AI."); }
    finally { opening.current = false; setBusy(false); }
  };
  return <div className="manual-ai-providers" aria-label={t("aiManualProviders")}>
    <span>{t("aiManualProviders")}</span>
    <div className="ai-manual-actions">
      {MANUAL_AI_PROVIDERS.map(provider => <button type="button" className="secondary-button" key={provider.id} disabled={disabled || busy} onClick={() => void open(provider)}>
        <ExternalLink size={15}/>{t("openAiProvider")} {provider.label}
      </button>)}
    </div>
    {notice && <p role="status" className="field-hint">{notice}</p>}
  </div>;
}
