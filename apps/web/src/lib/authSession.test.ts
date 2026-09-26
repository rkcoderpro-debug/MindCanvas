import { describe, expect, it, vi } from "vitest";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { restorePersistedSession } from "./authSession";

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
