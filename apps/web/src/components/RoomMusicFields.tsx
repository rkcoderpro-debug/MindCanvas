import { useEffect, useState } from "react";
import { parseRoomMusicLink } from "../lib/onlineRooms";
import { getYouTubeMusicTitle } from "../lib/youtubeMusicTitle";

export default function RoomMusicFields({ vi, link, title, onLink, onTitle, opening = false }: {
  vi: boolean; link: string; title: string; onLink: (link: string) => void; onTitle: (title: string) => void; opening?: boolean;
}) {
  const id = parseRoomMusicLink(link)?.videoForTitle;
  const [suggestion, setSuggestion] = useState<{ id: string; title: string }>();
  const suggested = suggestion?.id === id ? suggestion?.title : undefined;
  useEffect(() => {
    if (!id || title.trim()) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      void getYouTubeMusicTitle(id).then(found => {
        if (alive && found) setSuggestion({ id, title: found.slice(0, 96) });
      });
    }, 300);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [id, title]);

  return <>
    <label>{opening ? (vi ? "Bài hát hoặc playlist mở đầu" : "Opening song or playlist") : (vi ? "Link bài hát hoặc playlist" : "Song or playlist link")}
      <input type="url" maxLength={420} required={!opening} value={link} onChange={event => onLink(event.target.value)} placeholder={opening
        ? (vi ? "Link YouTube Music (không bắt buộc)" : "YouTube Music link (optional)")
        : "https://music.youtube.com/…"}/>
    </label>
    {link.trim() && <label>{vi ? "Tên hiển thị (tùy chọn)" : "Display name (optional)"}
      <input maxLength={96} value={title || suggested || ""} onChange={event => onTitle(event.target.value)}/>
    </label>}
  </>;
}
