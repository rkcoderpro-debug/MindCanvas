// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { signOut: mocked.signOut } }) }));

const LAST_AUTH_USER_KEY = "mindcanvas:last-auth-user";

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://mindcanvas-test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-key");
  localStorage.clear();
  mocked.signOut.mockReset();
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("signOut session marker", () => {
  it("clears the remembered account before the signed-out event can be handled", async () => {
    mocked.signOut.mockImplementation(async () => {
      expect(localStorage.getItem(LAST_AUTH_USER_KEY)).toBeNull();
      return { error: null };
    });
    localStorage.setItem(LAST_AUTH_USER_KEY, "user-a");
    const { signOut } = await import("./supabase");
    await signOut();
    expect(localStorage.getItem(LAST_AUTH_USER_KEY)).toBeNull();
  });

  it("restores the remembered account if Supabase rejects explicit sign-out", async () => {
    const failure = new Error("sign-out failed");
    mocked.signOut.mockResolvedValue({ error: failure });
    localStorage.setItem(LAST_AUTH_USER_KEY, "user-a");
    const { signOut } = await import("./supabase");
    await expect(signOut()).rejects.toBe(failure);
    expect(localStorage.getItem(LAST_AUTH_USER_KEY)).toBe("user-a");
  });
});
