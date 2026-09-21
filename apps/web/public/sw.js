// The canvas autosave/auth packaging follow-up changes the JS entrypoint. A distinct cache key
// is required so an installed PWA cannot keep serving the pre-fix bundle.
const CACHE_NAME = "mindcanvas-shell-v5.5.3";
const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icons/mindcanvas-192.png", "/icons/mindcanvas-512.png", "/icons/mindcanvas-maskable-512.png"];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);
  // Vite fingerprints JavaScript/CSS. Discover those filenames from the
  // deployed index so the very first offline relaunch has the complete shell.
  const index = await cache.match("/");
  if (!index) return;
  const html = await index.clone().text();
  const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(match => match[1]);
  await Promise.all([...new Set(assets)].map(asset => cache.add(asset).catch(() => undefined)));
}

self.addEventListener("install", event => {
  event.waitUntil(cacheAppShell());
});

self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("mindcanvas-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const copy = response.clone();
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put("/", copy);
        } catch { /* A full cache must not replace a valid network response. */ }
        return response;
      } catch {
        return await caches.match("/") || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      // Clone before yielding to another promise. Once the browser starts
      // consuming the original body, a delayed response.clone() throws.
      const copy = response.clone();
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, copy);
      } catch { /* Continue with the network response if cache storage is full. */ }
    }
    return response;
  })());
});
