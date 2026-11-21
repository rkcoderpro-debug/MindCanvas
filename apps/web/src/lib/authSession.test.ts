import { describe, expect, it, vi } from "vitest";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { restorePersistedSession, verifyWorkspaceAccount, WorkspaceAuthUnavailableError } from "./authSession";

const session = { access_token: "test", token_type: "bearer", expires_in: 3600, refresh_token: "test", user: { id: "user-a" } } as Session;
function authDouble(getSession: () => Promise<unknown>, refreshSession: () => Promise<unknown>) {
  return { getSession: vi.fn(getSession), refreshSession: vi.fn(refreshSession) } as unknown as Pick<SupabaseClient["auth"], "getSession" | "refreshSession">;
}

describe("restorePersistedSession", () => {
  it("uses the saved session when storage restores it", async () => {
    const auth = authDouble(async () => ({ data: { session }, error: null }), async () => ({ data: { session: null }, error: null }));
    await expect(restorePersistedSession(auth, true)).resolves.toEqual({ kind: "restored", session, source: "stored" });
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes once when a previously signed-in profile has no loaded session", async () => {
    const auth = authDouble(async () => ({ data: { session: null }, error: null }), async () => ({ data: { session }, error: null }));
    await expect(restorePersistedSession(auth, true)).resolves.toEqual({ kind: "restored", session, source: "refreshed" });
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("keeps a remembered account in recovery state when restoration and refresh fail", async () => {
    const refreshError = new Error("refresh token expired");
    const auth = authDouble(async () => ({ data: { session: null }, error: null }), async () => ({ data: { session: null }, error: refreshError }));
    await expect(restorePersistedSession(auth, true)).resolves.toEqual({ kind: "recovery", error: refreshError });
  });

  it("starts a first-time visitor as guest without an unnecessary refresh", async () => {
    const auth = authDouble(async () => ({ data: { session: null }, error: null }), async () => ({ data: { session: null }, error: null }));
    await expect(restorePersistedSession(auth, false)).resolves.toEqual({ kind: "guest" });
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it("does not silently classify a failed session read as a guest", async () => {
    const authError = new Error("storage read failed");
    const auth = authDouble(async () => { throw authError; }, async () => ({ data: { session: null }, error: null }));
    await expect(restorePersistedSession(auth, false)).resolves.toEqual({ kind: "recovery", error: authError });
  });
});


describe("Workspace Auth verification", () => {
  const auth = () => ({ getUser: vi.fn(), refreshSession: vi.fn() });
  it("reports a 525 as temporary without refreshing a healthy token", async () => {
    const client = auth();
    client.getUser.mockResolvedValue({ data: { user: null }, error: { status: 525, message: "SSL handshake failed" } });
    await expect(verifyWorkspaceAccount(client, "user-a", "token-a")).rejects.toMatchObject({ code: "WORKSPACE_AUTH_UNAVAILABLE", status: 525 });
    expect(client.refreshSession).not.toHaveBeenCalled();
  });

  it("reuses only in-flight checks for the same workspace and token", async () => {
    const client = auth();
    type Success = { data: { user: typeof session.user }; error: null };
    const answer: Success = { data: { user: session.user }, error: null };
    let complete!: (value: Success) => void;
    client.getUser.mockImplementationOnce(() => new Promise<Success>(resolve => { complete = resolve; })).mockResolvedValue(answer);
    const first = verifyWorkspaceAccount(client, "user-a", "token-a");
    const second = verifyWorkspaceAccount(client, "user-a", "token-a");
    await verifyWorkspaceAccount(client, "user-a", "other-token");
    expect(client.getUser.mock.calls).toEqual([["token-a"], ["other-token"]]);
    complete(answer);
    await Promise.all([first, second]);
    await verifyWorkspaceAccount(client, "user-a", "token-a");
    expect(client.getUser).toHaveBeenCalledTimes(3);
  });

  it("refreshes a rejected token once, verifies the replacement, and rejects another account", async () => {
    const client = auth();
    client.getUser
      .mockResolvedValueOnce({ data: { user: null }, error: { status: 401, code: "bad_jwt" } })
      .mockResolvedValueOnce({ data: { user: { id: "someone-else" } }, error: null });
    client.refreshSession.mockResolvedValue({ data: { session: { ...session, access_token: "token-new" } }, error: null });
    await expect(verifyWorkspaceAccount(client, "user-a", "token-old")).rejects.toThrow("không khớp");
    expect(client.refreshSession).toHaveBeenCalledTimes(1);
    expect(client.getUser.mock.calls).toEqual([["token-old"], ["token-new"]]);
  });

  it("does not mislabel a failed refresh as an expired session after a genuine rejection", async () => {
    const client = auth();
    client.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    client.refreshSession.mockResolvedValue({ data: { session: null }, error: { status: 503 } });
    await expect(verifyWorkspaceAccount(client, "user-a", "token-old")).rejects.toBeInstanceOf(WorkspaceAuthUnavailableError);
    expect(client.getUser).toHaveBeenCalledTimes(1);
  });

  it("asks for sign-in when Auth rejects the original token and the refresh token", async () => {
    const client = auth();
    client.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    client.refreshSession.mockResolvedValue({ data: { session: null }, error: { status: 400, code: "refresh_token_not_found" } });
    await expect(verifyWorkspaceAccount(client, "user-a", "revoked")).rejects.toThrow("Hãy đăng nhập lại");
  });
});
