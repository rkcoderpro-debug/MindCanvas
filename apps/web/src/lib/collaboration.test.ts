// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { hashInvitationToken, invitationUrl, normalizeInviteEmail, subscribeToProjectPresence } from "./collaboration";

describe("V4.5 collaboration helpers", () => {
  it("normalizes invitation email addresses before they reach Supabase", () => {
    expect(normalizeInviteEmail("  Student@Example.COM ")).toBe("student@example.com");
  });

  it("creates a link that carries only the project and opaque invite token", () => {
    const url = invitationUrl("project-123", "opaque-token", "https://mindcanvas.example");
    expect(url).toBe("https://mindcanvas.example/?invite=opaque-token&project=project-123");
    expect(url).not.toContain("token_hash");
  });

  it("hashes the same token deterministically without exposing the raw token", async () => {
    const first = await hashInvitationToken("opaque-token");
    const second = await hashInvitationToken("opaque-token");
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    expect(first).not.toBe("opaque-token");
  });

  it("keeps the presence subscription safe in local-only mode", () => {
    let emitted = false;
    const stop = subscribeToProjectPresence("project-123", { userId: "user-1", displayName: "Student", role: "owner", color: "#2563eb" }, () => { emitted = true; });
    expect(stop).toBeTypeOf("function");
    stop();
    expect(emitted).toBe(false);
  });
});
