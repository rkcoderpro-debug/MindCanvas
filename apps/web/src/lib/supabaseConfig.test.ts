// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({ auth: {} })) }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); createClient.mockClear(); });

describe("Supabase client configuration", () => {
  it.each([
    ["publishable", "anon", "publishable"],
    [undefined, "anon", "anon"],
    ["", "anon", "anon"],
    ["  \t", "anon", "anon"],
    ["  publishable  ", "anon", "publishable"],
    ["", "  anon  ", "anon"],
    [undefined, undefined, undefined],
    ["", "", undefined],
    ["  ", "  ", undefined],
  ])("chooses a usable key for publishable=%j and anon=%j", async (publishable, anon, expected) => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", publishable);
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", anon);
    const config = await import("./supabase");
    expect(config.isSupabaseConfigured).toBe(Boolean(expected));
    if (expected) expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", expected, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    else { expect(config.supabase).toBeNull(); expect(createClient).not.toHaveBeenCalled(); }
  });

  it("keeps local mode when the URL is absent", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", undefined);
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable");
    expect((await import("./supabase")).isSupabaseConfigured).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });
});
