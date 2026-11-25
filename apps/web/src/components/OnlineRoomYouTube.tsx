import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { onlinePlaybackTime, type RoomPlayback } from "../lib/onlineRooms";

import { getYouTube, type Player } from "../lib/youtubeIframe";

export default function OnlineRoomYouTube({ playback, serverNow, onEnded, vi }: {
  playback: RoomPlayback & { video_id: string }; serverNow: () => number; onEnded: (revision: number) => void; vi: boolean;
}) {
  const wrapper = useRef<HTMLDivElement>(null), player = useRef<Player | null>(null);
  const visible = useRef(false), canPlay = useRef(false), synced = useRef(false);
  const playable = useRef(true);
  const latest = useRef({ playback, serverNow, onEnded });
  latest.current = { playback, serverNow, onEnded };
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const apply = useRef<() => void>(() => {});

  useEffect(() => {
    const container = wrapper.current;
    if (!container) return;
    let alive = true, instance: Player | null = null, metadataSync = false;
    visible.current = false; canPlay.current = false; synced.current = false; playable.current = true;
    setError(false); setBlocked(false);
    const iframe = document.createElement("iframe");
    iframe.id = `mindcanvas-room-player-${crypto.randomUUID()}`;
    iframe.title = vi ? "Trình phát YouTube của phòng" : "Room YouTube player";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow = "autoplay; encrypted-media; fullscreen";
    iframe.allowFullscreen = true;
    let viewRatio = 0;
    const params = new URLSearchParams({ enablejsapi: "1", autoplay: "0", playsinline: "1", origin: window.location.origin });
    if (playback.loop) { params.set("loop", "1"); params.set("playlist", playback.video_id); }
    iframe.src = `https://www.youtube.com/embed/${playback.video_id}?${params}`;
    container.replaceChildren(iframe);
    const syncPlayer = () => {
      const p = player.current, current = latest.current;
      if (!p || !playable.current || !canPlay.current) return;
      if (!visible.current) { p.pauseVideo(); return; }
      const duration = p.getDuration();
      const position = onlinePlaybackTime(current.playback, current.serverNow(), duration);
      if (Number.isFinite(position) && (!current.playback.loop || duration > 0) && Math.abs(p.getCurrentTime() - position) > (synced.current ? 2.5 : 0.8)) {
        p.seekTo(position, true);
      }
      if (current.playback.loop && duration > 0) metadataSync = true;
      synced.current = true;
      if (current.playback.playing) p.playVideo(); else p.pauseVideo();
    };
    apply.current = syncPlayer;
    const checkVisible = () => {
      const next = viewRatio > 0.5 && document.visibilityState !== "hidden";
      if (visible.current === next) return;
      visible.current = next;
      syncPlayer();
    };
    const show = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
      const height = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      viewRatio = rect.width && rect.height ? Math.max(0, width) * Math.max(0, height) / (rect.width * rect.height) : 0;
      checkVisible();
    };
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { if (entry) { viewRatio = entry.intersectionRatio; checkVisible(); } }, { threshold: [0, 0.51, 1] })
      : null;
    if (observer) observer.observe(container); else {
      show(); window.addEventListener("scroll", show, true); window.addEventListener("resize", show);
    }
    document.addEventListener("visibilitychange", checkVisible);

    void getYouTube().then(yt => {
      if (!alive) return;
      instance = new yt.Player(iframe, { events: {
        onReady: ({ target }) => {
          if (!alive) return;
          player.current = target; canPlay.current = true; syncPlayer();
        },
        onStateChange: ({ data }) => {
          if (!alive || !playable.current) return;
          if (data === 1) {
            if (!visible.current) { player.current?.pauseVideo(); return; }
            setBlocked(false);
            if (latest.current.playback.loop && !metadataSync && (player.current?.getDuration() ?? 0) > 0) syncPlayer();
          } else if (data === 0 && visible.current && latest.current.playback.playing) {
            if (latest.current.playback.loop) {
              metadataSync = false;
              player.current?.seekTo(onlinePlaybackTime(latest.current.playback, latest.current.serverNow(), player.current?.getDuration()), true);
              player.current?.playVideo();
            } else latest.current.onEnded(latest.current.playback.revision);
          }
        },
        onAutoplayBlocked: () => { if (alive && visible.current) setBlocked(true); },
        onError: () => { if (alive) { playable.current = false; setError(true); } },
      } });
    }).catch(() => { if (alive) { playable.current = false; setError(true); } });
    return () => {
      alive = false; observer?.disconnect();
      if (!observer) { window.removeEventListener("scroll", show, true); window.removeEventListener("resize", show); }
      document.removeEventListener("visibilitychange", checkVisible);
      apply.current = () => {}; player.current = null;
      try { instance?.destroy(); } catch { /* iframe already detached */ }
      container.replaceChildren();
    };
  }, [playback.video_id, playback.loop, retry, vi]);
  useEffect(() => { apply.current(); }, [playback.revision]);

  return <div className="online-room-youtube">
    <div ref={wrapper} className="online-room-player-frame"/>
    <div className="online-room-player-actions">
      <button type="button" className="text-button" onClick={() => error ? setRetry(value => value + 1) : apply.current()}><RefreshCw size={14}/>{error ? (vi ? "Tải lại trình phát" : "Reload player") : (vi ? "Đồng bộ lại" : "Sync playback")}</button>
      <a className="text-button" href={`https://www.youtube.com/watch?v=${playback.video_id}`} target="_blank" rel="noreferrer"><ExternalLink size={14}/>{vi ? "Mở trên YouTube" : "Open on YouTube"}</a>
    </div>
    {blocked && !error && <p className="online-room-player-note" role="status">{vi ? "Bấm Phát ngay trên trình phát nếu trình duyệt chặn phát tự động." : "Press Play on the player if your browser blocked autoplay."}</p>}
    {error && <p className="online-room-player-note" role="status">{vi ? "Không phát được video trong phòng. Có thể video không cho phép nhúng hoặc YouTube chưa kết nối." : "The video could not play in this room. Embedding may be disabled or YouTube is unavailable."}</p>}
  </div>;
}
