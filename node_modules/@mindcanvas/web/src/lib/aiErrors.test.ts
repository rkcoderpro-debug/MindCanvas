import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { aiErrorMessage } from "./aiErrors";
import { en, vi, type MessageKey } from "./i18n";

const translate = (messages: Record<MessageKey, string>) => (key: MessageKey) => messages[key];

describe("AI error messages", () => {
  it("turns shared-capacity errors into concise localized guidance", () => {
    const error = new ApiError("long backend diagnostics", 503, "AI_UNAVAILABLE", true, 30);
    expect(aiErrorMessage(error, translate(vi), "aiError")).toBe(vi.aiTemporarilyBusy);
    expect(aiErrorMessage(error, translate(en), "aiError")).toBe(en.aiTemporarilyBusy);
    expect(aiErrorMessage(error, translate(vi), "aiError")).not.toContain("diagnostics");
  });

  it("distinguishes queue, model configuration and expired sessions", () => {
    expect(aiErrorMessage(new ApiError("", 429, "AI_BUSY"), translate(vi), "aiError")).toBe(vi.aiQueueBusy);
    expect(aiErrorMessage(new ApiError("", 503, "AI_MODEL_UNAVAILABLE"), translate(vi), "aiError")).toBe(vi.aiModelUnavailable);
    expect(aiErrorMessage(new ApiError("", 401), translate(vi), "aiError")).toBe(vi.aiSessionExpired);
  });
});
