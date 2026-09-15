export type AiSupportKind = "aiAuto" | "manualPlan";

export type AiSupportContext = {
  email?: string;
  plan?: string;
  provider?: string;
  projectId?: string;
  userAgent?: string;
};

export type AiSupportIssue = {
  code: string;
  kind: AiSupportKind;
  createdAt: string;
  details: string;
};

function issueToken() {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return id.replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase().padStart(8, "0");
}

export function createAiSupportIssue(kind: AiSupportKind, context: AiSupportContext = {}, now = new Date()): AiSupportIssue {
  const createdAt = now.toISOString();
  const code = `MC-${issueToken()}`;
  const details = [
    "MindCanvas support request",
    `Issue: ${code}`,
    `Type: ${kind === "aiAuto" ? "AI Auto result or quota" : "AI Manual plan activation or quota"}`,
    `Time: ${createdAt}`,
    `App: v4.7.0`,
    `Account email: ${context.email?.trim() || "not provided"}`,
    `Plan: ${context.plan?.trim() || "unknown"}`,
    `Provider: ${context.provider?.trim() || "not available"}`,
    `Project: ${context.projectId?.trim() || "not available"}`,
    `Device: ${context.userAgent?.trim() || globalThis.navigator?.userAgent || "not available"}`,
    "Privacy: prompt, document contents and canvas contents are not included.",
  ].join("\n");
  return { code, kind, createdAt, details };
}
