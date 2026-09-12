const CACHE_NAME = "mindcanvas-shell-v3.8.1-ux";
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
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put("/", copy));
      return response;
    }).catch(() => caches.match("/").then(response => response || Response.error())));
    return;
  }

  event.respondWith(caches.match(request).then(cached => {
    const network = fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    });
    return cached || network;
  }));
});
