export type Player = {
  destroy(): void; playVideo(): void; pauseVideo(): void; seekTo(seconds: number, allowSeekAhead: boolean): void;
  getDuration(): number; getCurrentTime(): number; setVolume(percent: number): void;
  getPlaylist(): string[] | undefined; getPlaylistIndex(): number; playVideoAt(index: number): void;
};
type PlayerEvents = { onReady: (event: { target: Player }) => void; onStateChange: (event: { data: number }) => void; onAutoplayBlocked: () => void; onError: (event: { data: number }) => void };
type YouTube = { Player: new (iframe: HTMLIFrameElement, config: { events: PlayerEvents }) => Player };
type YouTubeWindow = Window & { YT?: YouTube; onYouTubeIframeAPIReady?: () => void };
let apiPromise: Promise<YouTube> | null = null;

export function getYouTube() {
  const browser = window as YouTubeWindow;
  if (browser.YT?.Player) return Promise.resolve(browser.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTube>((resolve, reject) => {
    const script = document.createElement("script");
    const previous = browser.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(() => fail(), 11000);
    const clear = () => {
      window.clearTimeout(timer);
      if (browser.onYouTubeIframeAPIReady === ready) browser.onYouTubeIframeAPIReady = previous;
    };
    const fail = () => { clear(); script.remove(); reject(new Error("YouTube player unavailable")); };
    const ready = () => {
      if (!browser.YT?.Player) { fail(); return; }
      clear(); resolve(browser.YT);
      previous?.();
    };
    browser.onYouTubeIframeAPIReady = ready;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.addEventListener("error", fail, { once: true });
    document.head.append(script);
  }).catch(error => { apiPromise = null; throw error; });
  return apiPromise;
}

