import { useCallback, useEffect, useState } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const isStandalone = () => (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || !!(navigator as Navigator & { standalone?: boolean }).standalone;
const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export function registerMindCanvasServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(registration => {
      const announce = () => window.dispatchEvent(new CustomEvent("mindcanvas:pwa-update", { detail: registration }));
      if (registration.waiting && navigator.serviceWorker.controller) announce();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) announce();
        });
      });
    }).catch(() => undefined);
  }, { once: true });
}

export function usePwaInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const ios = isIos() && !installed;
  useEffect(() => {
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const appInstalled = () => { setInstalled(true); setPrompt(null); };
    const updateReady = (event: Event) => setUpdate((event as CustomEvent<ServiceWorkerRegistration>).detail);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    window.addEventListener("mindcanvas:pwa-update", updateReady);
    return () => { window.removeEventListener("beforeinstallprompt", beforeInstall); window.removeEventListener("appinstalled", appInstalled); window.removeEventListener("mindcanvas:pwa-update", updateReady); };
  }, []);
  const install = useCallback(async () => {
    if (!prompt) return false;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setPrompt(null);
    return choice.outcome === "accepted";
  }, [prompt]);
  const applyUpdate = useCallback(() => { update?.waiting?.postMessage({ type: "SKIP_WAITING" }); }, [update]);
  return { canInstall: !!prompt, installed, ios, install, updateReady: !!update, applyUpdate };
}
