import { ApiError } from "./api";
import type { MessageKey } from "./i18n";

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

export function aiErrorMessage(error: unknown, t: Translate, fallback: MessageKey) {
  if (error instanceof ApiError) {
    if (error.status === 401) return t("aiSessionExpired");
    if (error.code === "AI_BUSY") return t("aiQueueBusy");
    if (error.code === "AI_UNAVAILABLE") return t("aiTemporarilyBusy");
    if (error.code === "AI_MODEL_UNAVAILABLE" || error.code === "AI_CONFIG") return t("aiModelUnavailable");
    return error.message || t(fallback);
  }
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail ? `${t(fallback)} ${detail}` : t(fallback);
}
