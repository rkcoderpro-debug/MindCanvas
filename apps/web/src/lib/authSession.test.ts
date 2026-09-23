import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { watchAuthBootstrap, type AuthBootstrapState } from "./authSession";

function source() {
  let listener: ((event: string, session: { user: User } | null) => void) | undefined;
  const unsubscribe = vi.fn();
  const auth = {
    onAuthStateChange: vi.fn((callback: typeof listener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe } } };
    }),
  } as unknown as Pick<SupabaseClient["auth"], "onAuthStateChange">;
  return {
    auth,
    emit(event: string, session: { user: User } | null = null) { listener?.(event, session); },
    unsubscribe,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const user = { id: "user-1" } as User;

describe("watchAuthBootstrap", () => {
  it("keeps a session recovery error separate from an explicit guest session", async () => {
    const auth = source();
    const read = deferred<User | null>();
    const states: AuthBootstrapState[] = [];
    watchAuthBootstrap(auth.auth, () => read.promise, state => states.push(state));

    auth.emit("INITIAL_SESSION");
    read.reject(new Error("Temporary refresh failure"));
    await Promise.resolve(); await Promise.resolve();

    expect(states).toEqual([{ status: "error", error: expect.any(Error) }]);
  });

  it("uses an auth event over a late session-read failure", async () => {
    const auth = source();
    const read = deferred<User | null>();
    const states: AuthBootstrapState[] = [];
    watchAuthBootstrap(auth.auth, () => read.promise, state => states.push(state));
    auth.emit("SIGNED_IN", { user });
    read.reject(new Error("Stale read failure"));
    await Promise.resolve();

    expect(states).toEqual([{ status: "authenticated", user }]);
  });

  it("recognizes an explicit sign-out even if session recovery finishes later", async () => {
    const auth = source();
    const read = deferred<User | null>();
    const states: AuthBootstrapState[] = [];
    watchAuthBootstrap(auth.auth, () => read.promise, state => states.push(state));
    auth.emit("SIGNED_OUT");
    read.resolve(user);
    await Promise.resolve();

    expect(states).toEqual([{ status: "anonymous" }]);
  });

  it("uses a successful empty session as anonymous and unsubscribes on cleanup", async () => {
    const auth = source();
    const states: AuthBootstrapState[] = [];
    const stop = watchAuthBootstrap(auth.auth, async () => null, state => states.push(state));
    await Promise.resolve();
    stop();

    expect(states).toEqual([{ status: "anonymous" }]);
    expect(auth.unsubscribe).toHaveBeenCalledOnce();
  });
});
