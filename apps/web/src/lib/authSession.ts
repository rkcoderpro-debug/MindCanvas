import type { Session, SupabaseClient } from "@supabase/supabase-js";

type SessionAuth = Pick<SupabaseClient["auth"], "getSession" | "refreshSession">;
export type AuthRestoreResult =
  | { kind: "restored"; session: Session; source: "stored" | "refreshed" }
  | { kind: "guest" }
  | { kind: "recovery"; error?: unknown };

/** Read the persisted session and, when a prior account is remembered, try one refresh. */
export async function restorePersistedSession(auth: SessionAuth, previouslySignedIn: boolean): Promise<AuthRestoreResult> {
  let initialError: unknown;
  try {
    const result = await auth.getSession();
    if (!result.error && result.data.session) return { kind: "restored", session: result.data.session, source: "stored" };
    initialError = result.error;
  } catch (error) {
    initialError = error;
  }

  if (!previouslySignedIn) return initialError ? { kind: "recovery", error: initialError } : { kind: "guest" };

  try {
    const refreshed = await auth.refreshSession();
    if (refreshed.error) return { kind: "recovery", error: refreshed.error };
    if (refreshed.data.session) return { kind: "restored", session: refreshed.data.session, source: "refreshed" };
    return { kind: "recovery", error: initialError };
  } catch (error) {
    return { kind: "recovery", error };
  }
}
