import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Maximize2, RefreshCw, Volume2 } from "lucide-react";
import { usePlayerSlot } from "./usePlayerSlot";
import { onlinePlaybackTime, youtubeRoomVideo, type RoomPlayback } from "../lib/onlineRooms";
import { getYouTube, type Player } from "../lib/youtubeIframe";
import { getYouTubeMusicTitle } from "../lib/youtubeMusicTitle";

export default function OnlineRoomYouTube({ playback, serverNow, onEnded, onTitle, vi, slot, compact, volume, controlSlot, ambient = false, onShow }: {
  playback: RoomPlayback; serverNow: () => number; onEnded: (revision: number, index: number, hasNext: boolean) => void | Promise<void>;
  onTitle?: (revision: number, title: string) => void; vi: boolean; slot: HTMLDivElement | null;
  compact: boolean; volume: number; controlSlot: HTMLElement | null;
  ambient?: boolean; onShow?: () => void;
}) {
  const wrapper = useRef<HTMLDivElement>(null), player = useRef<Player | null>(null);
  const rect = usePlayerSlot(slot, 200, true);
  const docked = !rect;
  const [currentVideo, setCurrentVideo] = useState<{ revision: number; id: string }>();
  const latest = useRef({ playback, serverNow, onEnded, onTitle, volume });
  latest.current = { playback, serverNow, onEnded, onTitle, volume };
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const apply = useRef<(activate?: boolean) => void>(() => {});
  const video = playback.video_id, playlist = playback.playlist_id;
  const sourceUrl = playlist ? `https://www.youtube.com/playlist?list=${encodeURIComponent(playlist)}`
    : `https://www.youtube.com/watch?v=${encodeURIComponent(video ?? "")}`;

  useEffect(() => {
    const container = wrapper.current;
    if (!container || (!video && !playlist)) return;
    let alive = true, instance: Player | null = null, failed = false, activationBlocked = false;
    let synced = false, metadataSynced = false, observedIndex = -1, requestedIndex = -1, reportedRevision = -1;
    let namedRevision = -1, endRetry = 0;
    setError(false); setBlocked(false);
    const iframe = document.createElement("iframe");
    iframe.id = `mindcanvas-room-player-${crypto.randomUUID()}`;
    iframe.title = vi ? "Trình phát YouTube của phòng" : "Room YouTube player";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow = "autoplay; encrypted-media; fullscreen";
    const params = new URLSearchParams({
      enablejsapi: "1", autoplay: "0", playsinline: "1", controls: "0", disablekb: "1", origin: window.location.origin,
    });
    if (playlist) { params.set("listType", "playlist"); params.set("list", playlist); }
    else if (playback.loop && video) { params.set("loop", "1"); params.set("playlist", video); }
    iframe.src = `https://www.youtube.com/embed${playlist ? "" : "/" + video}?${params}`;
    container.replaceChildren(iframe);

    const isVisible = () => document.visibilityState !== "hidden";
    const publishTitle = (p: Player, revision: number, index: number) => {
      if (!playlist || index < 0 || namedRevision === revision) return;
      const href = p.getVideoUrl?.();
      const id = p.getPlaylist()?.[index] ?? (href && youtubeRoomVideo(href));
      if (!id) return;
      namedRevision = revision;
      setCurrentVideo({ revision, id });
      void getYouTubeMusicTitle(id).then(title => {
        if (alive && title && latest.current.playback.revision === revision) latest.current.onTitle?.(revision, title);
      });
    };
    const syncPlayer = () => {
      const p = player.current, current = latest.current;
      if (!p || failed) return;
      if (!isVisible() || !current.playback.playing) { p.pauseVideo(); return; }
      p.setVolume(Math.round(current.volume * 100));
      if (activationBlocked || reportedRevision === current.playback.revision) return;
      const index = current.playback.playlist_index ?? 0;
      if (playlist && p.getPlaylist()?.length && p.getPlaylistIndex() !== index) {
        if (requestedIndex !== index) {
          requestedIndex = index; synced = false; metadataSynced = false;
          p.playVideoAt(index);
        }
        return;
      }
      if (playlist && p.getPlaylistIndex() === index) {
        observedIndex = index;
        publishTitle(p, current.playback.revision, index);
      }
      const duration = p.getDuration();
      const position = onlinePlaybackTime(current.playback, current.serverNow(), duration);
      if ((!current.playback.loop || duration > 0) && Math.abs(p.getCurrentTime() - position) > (synced ? 2.5 : .8)) {
        p.seekTo(position, true);
      }
      synced = true;
      metadataSynced = duration > 0;
      p.playVideo();
    };
    apply.current = (activate = false) => { if (activate) { activationBlocked = false; requestedIndex = -1; } syncPlayer(); };
    // Visibility changes should not clear a browser's autoplay decision.
    document.addEventListener("visibilitychange", syncPlayer);

    const reportEnd = (p: Player, revision: number, index: number) => {
      if (reportedRevision === revision) return;
      const items = playlist ? p.getPlaylist() : undefined;
      if (playlist && !items?.length) return;
      reportedRevision = revision;
      void Promise.resolve(latest.current.onEnded(revision, index, Boolean(items && index + 1 < items.length))).catch(() => {
        if (!alive || !isVisible() || latest.current.playback.revision !== revision) return;
        reportedRevision = -1;
        endRetry = window.setTimeout(() => {
          if (alive && isVisible() && latest.current.playback.revision === revision) reportEnd(p, revision, index);
        }, 3000);
      });
    };
    const fail = () => { if (alive) { failed = true; setError(true); } };
    const readyTimer = window.setTimeout(fail, 15000);
    void getYouTube().then(yt => {
      if (!alive) return;
      instance = new yt.Player(iframe, { events: {
        onReady: ({ target }) => {
          if (!alive) return;
          window.clearTimeout(readyTimer);
          player.current = target; syncPlayer();
        },
        onStateChange: ({ data }) => {
          const p = player.current, current = latest.current.playback;
          if (!alive || failed || !p) return;
          if (!isVisible()) { if (data === 1) p.pauseVideo(); return; }
          if (!current.playing || reportedRevision === current.revision) return;
          const desired = current.playlist_index ?? 0;
          const index = playlist ? p.getPlaylistIndex() : 0;
          if (data === 1) {
            activationBlocked = false; setBlocked(false);
            if (playlist && index !== desired) {
              if (index === desired + 1 && observedIndex === desired) reportEnd(p, current.revision, desired);
              else syncPlayer();
              return;
            }
            observedIndex = index;
            requestedIndex = -1;
            publishTitle(p, current.revision, index);
            if (!metadataSynced && p.getDuration() > 0) syncPlayer();
          } else if (data === 0) {
            if (current.loop) {
              p.seekTo(onlinePlaybackTime(current, latest.current.serverNow(), p.getDuration()), true);
              p.playVideo();
            } else if (!playlist || observedIndex === desired || index === desired) reportEnd(p, current.revision, desired);
          } else if (data === 2 && !activationBlocked) {
            // A native pause is local and doesn't change the room's clock.
            p.playVideo();
          }
        },
        onAutoplayBlocked: () => { if (alive && isVisible()) { activationBlocked = true; setBlocked(true); } },
        onError: fail,
      } });
    }).catch(fail);
    return () => {
      alive = false; window.clearTimeout(readyTimer); window.clearTimeout(endRetry);
      document.removeEventListener("visibilitychange", syncPlayer);
      apply.current = () => {}; player.current = null;
      try { instance?.destroy(); } catch { /* iframe already detached */ }
      container.replaceChildren();
    };
  }, [video, playlist, playback.loop, retry, vi]);
  useEffect(() => { apply.current(); }, [playback.revision, playback.playing]);
  useEffect(() => { player.current?.setVolume(Math.round(volume * 100)); }, [volume]);

  const ambientVideo = video ?? (currentVideo?.revision === playback.revision ? currentVideo.id : undefined);
  return <>
    {ambient && slot && !compact && !docked && createPortal(
      <div className="room-ambient-light" aria-hidden="true">
        {ambientVideo && /^[A-Za-z0-9_-]{11}$/.test(ambientVideo) &&
          <img key={ambientVideo} src={`https://i.ytimg.com/vi/${ambientVideo}/mqdefault.jpg`} alt="" decoding="async" onError={event => { event.currentTarget.hidden = true; }}/>}
      </div>, slot)}
    {createPortal(<div className={`room-youtube-float${docked ? " is-docked" : compact ? " on-island" : ""}`}
      data-study-island-media={compact || undefined} data-clip={Boolean(rect?.clip) || undefined}
      style={rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height, clipPath: rect.clip } : undefined}>
      {docked && <div className="room-youtube-dock-heading">
        {blocked && !error
          ? <button type="button" className="text-button" onClick={() => apply.current(true)}>
              <Volume2 size={14}/>{vi ? "Bật âm thanh" : "Enable audio"}
            </button>
          : <span>{error ? (vi ? "Không phát được video" : "Video unavailable")
              : playback.playing ? (vi ? "Đang nghe cùng phòng" : "Listening with the room") : (vi ? "Nhạc trong phòng" : "Room music")}</span>}
        {onShow && <button className="icon-button" type="button" onClick={onShow}
          aria-label={vi ? "Về khung video của phòng" : "Return to the room video"}><Maximize2 size={14}/></button>}
      </div>}
      <div ref={wrapper} className="room-youtube-frame"/>
    </div>, document.body)}
    {controlSlot && ((!docked && blocked) || error) && createPortal(<div className="room-youtube-controls">
      {error ? <>
        <p className="online-room-player-note" role="status">{vi ? "Không phát được trong phòng. Nguồn nhạc có thể không cho phép nhúng." : "Playback failed. The source may not allow embedding."}</p>
        <div className="online-room-player-actions">
          <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14}/>{vi ? "Thử lại" : "Retry"}</button>
          <a className="text-button" href={sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/>{vi ? "Mở trên YouTube" : "Open on YouTube"}</a>
        </div>
      </> : <button type="button" className="secondary-button" onClick={() => apply.current(true)}><Volume2 size={15}/>{vi ? "Bật âm thanh" : "Enable audio"}</button>}
    </div>, controlSlot)}
  </>;
}
