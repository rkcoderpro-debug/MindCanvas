import { describe, expect, it } from "vitest";
import { createAiSupportIssue } from "./aiSupport";
import { APP_VERSION_LABEL } from "./appVersion";

describe("AI support issue details", () => {
  it("creates a safe, traceable report without source content", () => {
    const issue = createAiSupportIssue("aiAuto", { email: "user@example.com", plan: "Pro", projectId: "project-1", provider: "gemini" }, new Date("2026-01-02T03:04:05.000Z"));
    expect(issue.code).toMatch(/^MC-[A-Z0-9]{8}$/);
    expect(issue.details).toContain("Account email: user@example.com");
    expect(issue.details).toContain("Plan: Pro");
    expect(issue.details).toContain("Time: 2026-01-02T03:04:05.000Z");
    expect(issue.details).toContain(`App: ${APP_VERSION_LABEL}`);
    expect(issue.details).not.toContain("Mitochondria");
  });
});
