// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ data: null, error: null })) }));
vi.mock("./supabase", () => ({ supabase: { rpc }, getCurrentSession: vi.fn(async () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } })) }));
vi.mock("./collaboration", () => ({ hashInvitationToken: vi.fn(async () => "a".repeat(64)), normalizeInviteEmail: (email: string) => email.trim().toLowerCase() }));
import { createConnectionInvitation, respondConnectionInvitation, sendDirectMessage } from "./connections";

beforeEach(() => { rpc.mockClear(); window.history.replaceState({}, "", "/"); });

it("creates a private, email-bound one-time link without exposing its raw token to the database", async () => {
  const link = await createConnectionInvitation("  FRIEND@example.com  ");
  expect(new URL(link).searchParams.get("connection_invite")).toMatch(/^[0-9a-f]{64}$/);
  expect(rpc).toHaveBeenCalledWith("create_connection_invitation", { p_email: "friend@example.com", p_hash: "a".repeat(64) });
  expect(JSON.stringify(rpc.mock.calls)).not.toContain(new URL(link).searchParams.get("connection_invite"));
});

it("accepts the emailed invitation by its stored hash", async () => {
  await respondConnectionInvitation("a".repeat(64), "accepted", true);
  expect(rpc).toHaveBeenCalledWith("respond_connection_invitation", { p_hash: "a".repeat(64), p_action: "accepted" });
});

it("sends a reference card through the guarded RPC and rejects an empty message", async () => {
  await expect(sendDirectMessage("peer", "  ")).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
  await sendDirectMessage("peer", "", "quiz", "quiz-id");
  expect(rpc).toHaveBeenCalledWith("send_direct_message", { p_peer: "peer", p_body: "", p_kind: "quiz", p_resource_id: "quiz-id" });
});
