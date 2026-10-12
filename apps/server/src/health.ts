import { APP_VERSION } from "./appVersion.js";
import { config } from "./config.js";

/** Public health data only; never return credentials or environment values. */
export function getHealthStatus() {
  return {
    ok: true,
    mode: "server",
    release: APP_VERSION,
    ai: "gemini",
    aiConfigured: Boolean(config.GEMINI_API_KEY),
    aiModelCount: (config.GEMINI_MODELS ?? config.GEMINI_MODEL).split(",").filter(Boolean).length,
    aiCapacity: config.AI_MAX_CONCURRENT,
  };
}
