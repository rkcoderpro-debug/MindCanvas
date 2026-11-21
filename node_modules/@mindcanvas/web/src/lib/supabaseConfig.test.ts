// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClientOptions } from "@supabase/supabase-js";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn((_url: string, _key: string, _options?: SupabaseClientOptions<"public">) => ({ auth: {} })) }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); createClient.mockClear(); });

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
      global: { fetch: expect.any(Function) },
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    else { expect(config.supabase).toBeNull(); expect(createClient).not.toHaveBeenCalled(); }
  });

  it("only adds a deadline to the authenticated user GET", async () => {
    const projectUrl = "https://example.supabase.co";
    vi.stubEnv("VITE_SUPABASE_URL", projectUrl);
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable");
    const fetchStub = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchStub);
    await import("./supabase");
    const request = createClient.mock.calls[0][2]!.global!.fetch!;
    const userUrl = projectUrl + "/auth/v1/user";
    const tokenUrl = projectUrl + "/auth/v1/token?grant_type=refresh_token";
    const noteUrl = projectUrl + "/rest/v1/notes";
    await request(userUrl, { method: "GET" });
    await request(tokenUrl, { method: "POST" });
    await request(noteUrl, { method: "PATCH" });
    expect(fetchStub).toHaveBeenNthCalledWith(1, userUrl, { method: "GET", signal: expect.any(AbortSignal) });
    expect(fetchStub).toHaveBeenNthCalledWith(2, tokenUrl, { method: "POST" });
    expect(fetchStub).toHaveBeenNthCalledWith(3, noteUrl, { method: "PATCH" });
  });

  it("keeps local mode when the URL is absent", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", undefined);
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable");
    expect((await import("./supabase")).isSupabaseConfigured).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });
});
