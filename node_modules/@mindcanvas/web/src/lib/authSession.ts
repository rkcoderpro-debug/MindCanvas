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

type WorkspaceAuth = Pick<SupabaseClient["auth"], "getUser" | "refreshSession">;

export class WorkspaceAuthUnavailableError extends Error {
  readonly code = "WORKSPACE_AUTH_UNAVAILABLE";
  constructor(public readonly status?: number) {
    super("Supabase tạm thời không xác thực được phiên. Hãy thử lại.");
    this.name = "WorkspaceAuthUnavailableError";
  }
}

function authStatus(error: unknown): number | undefined {
  const numeric = Number((error as { status?: unknown } | null)?.status);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function isTemporaryAuthError(error: unknown): boolean {
  const reason = error as { name?: string; message?: string } | null;
  const status = authStatus(error);
  return status === 0 || status === 408 || status === 429 || (status !== undefined && status >= 500 && status < 600)
    || reason?.name === "AuthRetryableFetchError" || reason?.name === "TimeoutError" || reason?.name === "AbortError"
    || /failed to fetch|networkerror|network request failed|load failed/i.test(reason?.message ?? "");
}

function isRejectedSession(error: unknown): boolean {
  const reason = error as { code?: string; name?: string } | null;
  return authStatus(error) === 401 || reason?.name === "AuthSessionMissingError"
    || ["bad_jwt", "session_expired", "session_not_found", "refresh_token_not_found", "refresh_token_already_used"].includes(reason?.code ?? "");
}

export function workspaceAuthError(error: unknown): Error {
  if (error instanceof WorkspaceAuthUnavailableError) return error;
  if (isTemporaryAuthError(error)) return new WorkspaceAuthUnavailableError(authStatus(error));
  if (isRejectedSession(error)) return new Error("Phiên Supabase không còn hợp lệ. Hãy đăng nhập lại.");
  return new Error("Supabase không xác thực được tài khoản. Hãy thử lại.");
}

const verifyingAccounts = new WeakMap<WorkspaceAuth, Map<string, Promise<void>>>();

/** Validate the current account with Auth. Share only an in-flight check of
 * the same token; a previous success is never reused after it completes. */
export function verifyWorkspaceAccount(auth: WorkspaceAuth, owner: string, accessToken: string): Promise<void> {
  let inFlight = verifyingAccounts.get(auth);
  if (!inFlight) verifyingAccounts.set(auth, inFlight = new Map());
  const key = JSON.stringify([owner, accessToken]);
  const running = inFlight.get(key);
  if (running) return running;
  const checks = inFlight;
  const check = (async () => {
    let result: Awaited<ReturnType<WorkspaceAuth["getUser"]>>;
    try {
      result = await auth.getUser(accessToken);
      // A gateway failure does not invalidate the session. Only refresh after
      // an explicit rejection of the existing session/token.
      if (result.error && !isTemporaryAuthError(result.error) && isRejectedSession(result.error)) {
        const refreshed = await auth.refreshSession();
        if (refreshed.error) throw refreshed.error;
        if (!refreshed.data.session) throw result.error;
        if (refreshed.data.session.user.id !== owner) {
          result = { data: { user: refreshed.data.session.user }, error: null };
        } else {
          result = await auth.getUser(refreshed.data.session.access_token);
        }
      }
      if (result.error) throw result.error;
    } catch (error) {
      throw workspaceAuthError(error);
    }
    if (result.data.user?.id !== owner) throw new Error("Tài khoản Supabase hiện tại không khớp với workspace. Hãy đăng nhập lại.");
  })().finally(() => checks.delete(key));
  checks.set(key, check);
  return check;
}
