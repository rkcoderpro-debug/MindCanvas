import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play } from "lucide-react";
import { onlinePlaybackTime, type RoomPlayback } from "../lib/onlineRooms";

export const ROOM_PIANO_SRC = `${import.meta.env.BASE_URL}audio/mindcanvas-focus-piano.mp3`;

export default function RoomBackgroundAudio({ playback, serverNow, volume, slot, vi }: {
  playback: RoomPlayback; serverNow: () => number; volume: number; slot: HTMLElement | null; vi: boolean;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [status, setStatus] = useState<"ready" | "blocked" | "error">("ready");
  const data = useRef({ playback, serverNow });
  data.current = { playback, serverNow };
  const attempt = useRef(0);
  const sync = (tryPlay = true) => {
    const el = audio.current;
    if (!el) return;
    const { playback, serverNow } = data.current;
    if (el.duration > 0 && Number.isFinite(el.duration)) {
      const target = onlinePlaybackTime(playback, serverNow(), el.duration);
      const distance = Math.abs(el.currentTime - target);
      const drift = playback.loop ? Math.min(distance, Math.abs(el.duration - distance)) : distance;
      if (drift > 1.2) el.currentTime = target;
    }
    if (!playback.playing) { attempt.current++; el.pause(); return; }
    if (el.paused && tryPlay) {
      const key = ++attempt.current;
      void el.play().then(() => { if (audio.current === el && attempt.current === key) setStatus("ready"); })
        .catch(() => { if (audio.current === el && attempt.current === key) setStatus("blocked"); });
    }
  };
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const timer = window.setInterval(() => sync(false), 9000);
    const resume = () => { if (!document.hidden) sync(false); };
    document.addEventListener("visibilitychange", resume);
    return () => { attempt.current++; el.pause(); window.clearInterval(timer); document.removeEventListener("visibilitychange", resume); };
  }, []);
  useEffect(() => sync(), [playback.revision, playback.playing]);
  useEffect(() => { if (audio.current) { audio.current.volume = volume; audio.current.muted = volume === 0; } }, [volume]);
  return <>
    <audio ref={audio} src={ROOM_PIANO_SRC} loop={playback.loop} preload="auto"
      onLoadedMetadata={() => sync()} onError={() => setStatus("error")}/>
    {slot && status !== "ready" && createPortal(status === "blocked"
      ? <button type="button" className="secondary-button" onClick={() => sync()}><Play size={13}/>{vi ? "Bấm để bật nhạc nền" : "Press to start background audio"}</button>
      : <small className="room-audio-status" role="alert">{vi ? "Không thể tải bản piano nền. Hãy thử lại hoặc đổi sang YouTube." : "Could not load the background piano. Try again or switch to YouTube."}</small>, slot)}
  </>;
}
