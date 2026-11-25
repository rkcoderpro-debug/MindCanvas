import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { getYouTube, type Player } from "../lib/youtubeIframe";

type Props = {
  embedUrl: string; title: string; rect: DOMRect | null; insideIsland: boolean; start: number;
  onReady: (player: Player) => void; onUpdate: (player: Player, state?: number) => void;
  onBlocked: () => void; onError: () => void; onClose: () => void; onHidden: () => void; onShown: () => void;
};

/** The iframe stays in the same DOM node. Only its position changes when the
 * inline music panel leaves view, so moving to another app page doesn't reload it. */
export default function MusicYouTubeSurface(props: Props) {
  const frameRoot = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const { rect, insideIsland } = props;
  const [frameReady, setFrameReady] = useState(false);

  const previouslyVisible = useRef(false);
  useEffect(() => {
    if (rect) {
      previouslyVisible.current = true;
      if (!document.hidden) latest.current.onShown();
      return;
    }
    if (!previouslyVisible.current) return;
    const wait = window.setTimeout(() => { previouslyVisible.current = false; latest.current.onHidden(); }, 100);
    return () => window.clearTimeout(wait);
  }, [Boolean(rect)]);
  useEffect(() => {
    const visibility = () => { if (document.hidden) latest.current.onHidden(); };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);

  useEffect(() => {
    const root = frameRoot.current;
    if (!root) return;
    let alive = true, ready: Player | null = null, instance: Player | undefined, reportedFailure = false;
    setFrameReady(false);
    const iframe = document.createElement("iframe");
    iframe.title = "Trình phát YouTube";
    iframe.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    const url = new URL(props.embedUrl);
    url.searchParams.set("autoplay", "0");
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("origin", window.location.origin);
    if (props.start > 0 && !url.searchParams.has("list")) url.searchParams.set("start", String(Math.floor(props.start)));
    iframe.src = url.href;
    root.replaceChildren(iframe);
    const fail = () => {
      if (!alive || reportedFailure) return;
      reportedFailure = true;
      latest.current.onError();
    };
    const wait = window.setTimeout(fail, 15000);
    void getYouTube().then(yt => {
      if (!alive) return;
      instance = new yt.Player(iframe, { events: {
        onReady: ({ target }) => {
          if (!alive) return;
          window.clearTimeout(wait); ready = target; setFrameReady(true);
          latest.current.onReady(target);
        },
        onStateChange: ({ data }) => {
          if (!alive || !ready) return;
          if (data === 1 && (!latest.current.rect || document.hidden)) { ready.pauseVideo(); return; }
          latest.current.onUpdate(ready, data);
        },
        onAutoplayBlocked: () => { if (alive) latest.current.onBlocked(); },
        onError: () => { window.clearTimeout(wait); fail(); },
      } });
    }).catch(fail);
    const watch = window.setInterval(() => {
      if (ready && document.visibilityState !== "hidden") latest.current.onUpdate(ready);
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(wait); window.clearInterval(watch);
      try { instance?.destroy(); } catch { /* player has already detached the iframe */ }
      root.replaceChildren();
    };
  }, [props.embedUrl]);

  return createPortal(<section className={`music-youtube-surface music-youtube-inline ${insideIsland ? "music-youtube-inside-island" : ""}`}
    aria-label="Trình phát YouTube" data-study-island-media={insideIsland || undefined} hidden={!rect} style={rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height } : undefined}>
    <header><strong title={props.title}>{props.title}</strong><button type="button" className="icon-button" aria-label="Đóng trình phát YouTube" onClick={props.onClose}><X size={17}/></button></header>
    <div ref={frameRoot} className="music-youtube-frame" aria-busy={!frameReady}/>
  </section>, document.body);
}
