import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AuthBootstrapState =
  | { status: "checking" }
  | { status: "authenticated"; user: User }
  | { status: "anonymous" }
  | { status: "error"; error: unknown };

type AuthStateSource = Pick<SupabaseClient["auth"], "onAuthStateChange">;

/**
 * Recover the persisted session without treating INITIAL_SESSION(null) as a
 * confirmed sign-out. Supabase can emit that event after a retryable recovery
 * error while the stored refresh token may still be usable on a later retry.
 */
export function watchAuthBootstrap(
  auth: AuthStateSource,
  readCurrentUser: () => Promise<User | null>,
  onState: (state: AuthBootstrapState) => void,
): () => void {
  let active = true;
  let authoritativeEventReceived = false;
  const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
    if (!active) return;
    if (session?.user) {
      authoritativeEventReceived = true;
      onState({ status: "authenticated", user: session.user });
    } else if (event === "SIGNED_OUT") {
      authoritativeEventReceived = true;
      onState({ status: "anonymous" });
    }
  });

  void readCurrentUser().then(user => {
    if (!active || authoritativeEventReceived) return;
    onState(user ? { status: "authenticated", user } : { status: "anonymous" });
  }).catch(error => {
    if (active && !authoritativeEventReceived) onState({ status: "error", error });
  });

  return () => {
    active = false;
    subscription.unsubscribe();
  };
}
