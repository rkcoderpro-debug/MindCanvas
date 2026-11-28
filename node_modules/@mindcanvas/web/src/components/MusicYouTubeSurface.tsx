import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minimize2 } from "lucide-react";
import { getYouTube, type Player } from "../lib/youtubeIframe";

type Props = {
  embedUrl: string; title: string; rect: DOMRect | null; start: number;
  onReady: (player: Player) => void; onUpdate: (player: Player, state?: number) => void;
  onBlocked: () => void; onError: () => void; onMinimize: () => void;
};

/** Keep the same player instance for audio when the inline video is collapsed. */
export default function MusicYouTubeSurface(props: Props) {
  const frameRoot = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const { rect } = props;
  const [frameReady, setFrameReady] = useState(false);

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

  return createPortal(<section className="music-youtube-surface music-youtube-inline"
    aria-label="Trình phát YouTube" hidden={!rect} inert={!rect} style={rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height } : undefined}>
    <header><strong title={props.title}>{props.title}</strong><button type="button" className="icon-button" aria-label="Thu nhỏ video YouTube" title="Thu nhỏ video" onClick={props.onMinimize}><Minimize2 size={17}/></button></header>
    <div ref={frameRoot} className="music-youtube-frame" aria-busy={!frameReady}/>
  </section>, document.body);
}
