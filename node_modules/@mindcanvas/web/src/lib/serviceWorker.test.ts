// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import packageJson from "../../package.json";

const origin = "https://mindcanvas.test";
const currentName = `mindcanvas-shell-v${packageJson.version}`;
const oldName = "mindcanvas-shell-v5.18.0";
type CacheRequest = string | { url: string };
const key = (request: CacheRequest) => {
  const url = new URL(typeof request === "string" ? request : request.url, origin);
  return url.pathname + url.search;
};

function workerHarness() {
  const listeners = new Map<string, (event: any) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const network = vi.fn(async (request: CacheRequest): Promise<Response> => new Response(
    key(request) === "/" ? '<script src="/assets/current.js"></script><link href="/assets/current.css" rel="stylesheet">' : "network asset",
  ));
  let storageUnavailable = false;
  let quotaFull = false;
  const seed = (name: string, entries: Record<string, string>) => stores.set(name,
    new Map(Object.entries(entries).map(([path, content]) => [path, new Response(content)])),
  );
  const caches = {
    open: async (name: string) => {
      if (storageUnavailable) throw new Error("Storage unavailable");
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      const put = async (request: CacheRequest, response: Response) => {
        if (quotaFull) throw new Error("Quota exceeded");
        store.set(key(request), response.clone());
      };
      const add = async (request: CacheRequest) => {
        const response = await network(request);
        if (!response.ok) throw new Error("Shell resource unavailable");
        await put(request, response);
      };
      return { match: async (request: CacheRequest) => store.get(key(request))?.clone(), put, add,
        addAll: async (requests: CacheRequest[]) => { await Promise.all(requests.map(add)); } };
    },
    keys: async () => [...stores.keys()],
    delete: vi.fn(async (name: string) => stores.delete(name)),
    match: vi.fn(() => { throw new Error("Cross-version cache lookup is forbidden"); }),
  };
  const claim = vi.fn(async () => undefined);
  const skipWaiting = vi.fn();
  const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8")
    .replaceAll("__APP_VERSION__", packageJson.version);
  runInNewContext(source, { caches, fetch: network, URL, Response,
    self: { location: { origin }, clients: { claim }, skipWaiting,
      addEventListener: (type: string, listener: (event: any) => void) => listeners.set(type, listener) } });
  const lifecycle = async (type: string) => {
    let pending: Promise<unknown> | undefined;
    listeners.get(type)!({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
  };
  const request = (path: string, mode = "cors", method = "GET") => {
    let pending: Promise<Response> | undefined;
    listeners.get("fetch")!({ request: { url: new URL(path, origin).href, mode, method },
      respondWith: (promise: Promise<Response>) => { pending = promise; } });
    return pending;
  };
  return { stores, network, caches, seed, lifecycle, request, claim, skipWaiting, listeners,
    setUnavailable: () => { storageUnavailable = true; }, setQuotaFull: () => { quotaFull = true; } };
}

describe("service worker release and cache behavior", () => {
  it("installs the current shell and fingerprinted assets while preserving the old active shell", async () => {
    const w = workerHarness(); w.seed(oldName, { "/": "old shell" });
    await w.lifecycle("install");
    expect(w.stores.get(currentName)?.has("/assets/current.js")).toBe(true);
    expect(w.stores.get(currentName)?.has("/assets/current.css")).toBe(true);
    expect(w.stores.has(oldName)).toBe(true);
    expect(w.skipWaiting).not.toHaveBeenCalled();
    w.listeners.get("message")!({ data: { type: "OTHER" } });
    expect(w.skipWaiting).not.toHaveBeenCalled();
    w.listeners.get("message")!({ data: { type: "SKIP_WAITING" } });
    expect(w.skipWaiting).toHaveBeenCalledOnce();
  });

  it("activation removes only outdated shell caches and preserves other data caches", async () => {
    const w = workerHarness();
    w.seed(oldName, { "/": "old" }); w.seed(currentName, { "/": "current" });
    w.seed("mindcanvas-documents", { "/saved-document": "student work" });
    await w.lifecycle("activate");
    expect([...w.stores.keys()]).toEqual([currentName, "mindcanvas-documents"]);
    expect(await w.stores.get("mindcanvas-documents")!.get("/saved-document")!.text()).toBe("student work");
    expect(w.claim).toHaveBeenCalledOnce();
  });

  it("offline navigation reads the current cache even while an older cache exists", async () => {
    const w = workerHarness(); w.seed(oldName, { "/": "old" }); w.seed(currentName, { "/": "current" });
    w.network.mockRejectedValue(new Error("Offline"));
    expect(await (await w.request("/classroom", "navigate"))!.text()).toBe("current");
    expect(w.caches.match).not.toHaveBeenCalled();
  });

  it("does not serve an asset from an older shell cache", async () => {
    const w = workerHarness(); w.seed(oldName, { "/favicon.svg": "old icon" });
    expect(await (await w.request("/favicon.svg"))!.text()).toBe("network asset");
    expect(w.network).toHaveBeenCalledOnce();
  });

  it("serves current cached assets offline", async () => {
    const w = workerHarness(); w.seed(currentName, { "/assets/current.js": "current asset" });
    w.network.mockRejectedValue(new Error("Offline"));
    expect(await (await w.request("/assets/current.js"))!.text()).toBe("current asset");
    expect(w.network).not.toHaveBeenCalled();
  });

  it("keeps the saved shell when navigation receives an HTTP error", async () => {
    const w = workerHarness(); w.seed(currentName, { "/": "good shell" });
    w.network.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    expect((await w.request("/", "navigate"))!.status).toBe(503);
    expect(await w.stores.get(currentName)!.get("/")!.text()).toBe("good shell");
  });

  it.each(["navigate", "cors"])("returns the network response with full cache storage (%s)", async mode => {
    const w = workerHarness(); w.setQuotaFull();
    expect((await w.request("/", mode))!.status).toBe(200);
  });

  it.each(["navigate", "cors"])("returns the network response when cache storage is unavailable (%s)", async mode => {
    const w = workerHarness(); w.setUnavailable();
    expect((await w.request("/", mode))!.status).toBe(200);
  });

  it("fails offline navigation cleanly if both network and storage are unavailable", async () => {
    const w = workerHarness(); w.setUnavailable(); w.network.mockRejectedValue(new Error("Offline"));
    expect((await w.request("/", "navigate"))!.type).toBe("error");
  });

  it("does not intercept APIs, cross-origin requests or writes", () => {
    const w = workerHarness();
    expect(w.request("/api/health")).toBeUndefined();
    expect(w.request("https://example.supabase.co/rest/v1/notes")).toBeUndefined();
    expect(w.request("/", "cors", "POST")).toBeUndefined();
  });

  it("a failed install preserves the old shell", async () => {
    const w = workerHarness(); w.seed(oldName, { "/": "old" });
    w.network.mockRejectedValue(new Error("Offline"));
    await expect(w.lifecycle("install")).rejects.toThrow("Offline");
    expect(w.stores.has(oldName)).toBe(true);
    expect(w.claim).not.toHaveBeenCalled();
    expect(w.caches.delete).not.toHaveBeenCalled();
  });
});
