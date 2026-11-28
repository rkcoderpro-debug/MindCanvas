import FilePicker from "./FilePicker";
import { createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Music2, Pause, Play, SkipBack, SkipForward, X, ChevronDown, Trash2, Link2, ExternalLink, Disc3, Radio, Plus, Upload, ListMusic, Volume2, Repeat2, Shuffle, MoreHorizontal } from 'lucide-react';
import { musicStore, nextMusicId, parseMusicLink, musicSourceLabel, readMusicPosition, saveMusicPosition, type MusicPosition, type MusicTrack } from '../lib/musicStorage';
import MusicYouTubeSurface from "./MusicYouTubeSurface";
import type { Player } from "../lib/youtubeIframe";
import { getYouTubeMusicTitle } from "../lib/youtubeMusicTitle";
import { usePlayerSlot } from "./usePlayerSlot";
import { useLearningActive } from "../lib/learningNavigation";
import MusicLinkPlayback, { type LinkControls } from "./MusicLinkPlayback";

const isYouTube = (track: MusicTrack | null) => track?.source === "youtube" || track?.source === "youtube-music";

type Music = {
  tracks: MusicTrack[]; current: string | null; playing: boolean; time: number; duration: number; volume: number;
  repeat: 'off' | 'all' | 'one'; shuffle: boolean; hidden: boolean; error: string; busy: boolean;
  activeTrack: MusicTrack | null; nowPlayingTitle: string;
  youtubeOpen: boolean; youtubeMinimized: boolean; youtubeVideoVisible: boolean; youtubeNote: string;
  setYoutubeMinimized: (value: boolean) => void; setPlayerSlot: (slot: HTMLDivElement | null) => void;
  linkOpen: boolean; pending: boolean; stop: () => void; play: (id?: string) => void; pause: () => void; next: (direction: number) => void;
  seek: (time: number) => void; setVolume: (value: number) => void; setRepeat: (value: 'off' | 'all' | 'one') => void;
  setShuffle: (value: boolean) => void; setHidden: (value: boolean) => void;
  add: (files: File[]) => Promise<boolean>; addOnline: (url: string, title?: string, playNow?: boolean) => Promise<boolean>; remove: (track: MusicTrack) => Promise<void>; rename: (track: MusicTrack, title: string) => Promise<void>;
};
const Context = createContext<Music | null>(null);
const AudioPriority = createContext<((active: boolean) => void) | null>(null);
export function useRoomAudioPriority(active: boolean) {
  const set = useContext(AudioPriority);
  useEffect(() => {
    if (!active || !set) return;
    set(true);
    return () => set(false);
  }, [active, set]);
}
function useMusic() { const value = useContext(Context); if (!value) throw new Error('MusicProvider missing'); return value; }
export function MusicProvider({ owner, children }: { owner: string | null; children: ReactNode }) {
  const scope = owner ?? 'guest';
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0), [duration, setDuration] = useState(0), [volume, changeVolume] = useState(.65);
  const [repeat, setRepeat] = useState<Music['repeat']>('off'), [shuffle, setShuffle] = useState(false);
  const [hidden, setHidden] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const link = useRef<LinkControls | null>(null);
  const [youtubeOpen, setYoutubeOpen] = useState(false), [youtubeNote, setYoutubeNote] = useState("");
  const [youtubeMinimized, setYoutubeMinimized] = useState(false);
  const [playerSlot, setPlayerSlot] = useState<HTMLDivElement | null>(null);
  const [roomAudio, setRoomAudio] = useState(false);
  const activeTrack = tracks.find(track => track.id === current) ?? null;
  const youtubeSelection = isYouTube(activeTrack) && activeTrack?.url ? parseMusicLink(activeTrack.url) : null;
  const isActivePlaylist = youtubeSelection?.isPlaylist ?? activeTrack?.isPlaylist;
  const [youtubeVideoId, setYoutubeVideoId] = useState<string>();
  const [youtubeTitle, setYoutubeTitle] = useState<{ id: string; title: string }>();
  const namedVideoId = youtubeSelection?.isPlaylist
    ? youtubeVideoId ?? youtubeSelection.youtubeVideoId
    : activeTrack?.title === youtubeSelection?.title ? youtubeSelection?.youtubeVideoId : undefined;
  const nowPlayingTitle = namedVideoId && youtubeTitle?.id === namedVideoId ? youtubeTitle.title : activeTrack?.title ?? "";
  useEffect(() => {
    if (!namedVideoId) return;
    let subscribed = true;
    void getYouTubeMusicTitle(namedVideoId).then(title => {
      if (subscribed && title) setYoutubeTitle({ id: namedVideoId, title });
    });
    return () => { subscribed = false; };
  }, [namedVideoId]);
  const inlineRect = usePlayerSlot(playerSlot, isYouTube(activeTrack) ? 238 : 152);
  const playerRect = roomAudio || youtubeMinimized ? null : inlineRect;
  const [youtubeStart, setYoutubeStart] = useState(0), [youtubeAttempt, setYoutubeAttempt] = useState(0);
  const youtube = useRef<Player | null>(null), wantsPlay = useRef(false), youtubeFailed = useRef(false);
  const activeId = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingLocalSeek = useRef(0), pendingLinkSeek = useRef(0);
  const position = useRef<MusicPosition | null>(null), lastSaved = useRef(0), positionChangedHere = useRef(false);
  const urlRef = useRef(''), loadedId = useRef<string | null>(null), generation = useRef(0);
  const alive = useRef(true), lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    let mounted = true;
    const saved = readMusicPosition(scope);
    void musicStore(scope, 'list').then(rows => {
      if (!mounted) return;
      setTracks(old => [...rows, ...old.filter(t => !rows.some(r => r.id === t.id))]);
      if (saved && !activeId.current && rows.some(track => track.id === saved.id)) {
        activeId.current = saved.id;
        position.current = saved;
        setCurrent(saved.id); setTime(saved.time); setDuration(saved.duration);
      }
    }).catch(() => { if (alive.current) setError('Không mở được thư viện nhạc trên thiết bị.'); });
    return () => {
      mounted = false; alive.current = false; generation.current++;
      audioRef.current?.pause(); audioRef.current?.removeAttribute('src'); audioRef.current?.load();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      audioRef.current = null; loadedId.current = null; urlRef.current = "";
    };
  }, [scope]);
  useEffect(() => {
    const remember = () => {
      const saved = position.current;
      if (!saved || !positionChangedHere.current) return;
      const audio = saved.id === loadedId.current ? audioRef.current : null;
      const seconds = saved.duration > 0 ? audio?.currentTime ?? youtube.current?.getCurrentTime() ?? saved.time : saved.time;
      saveMusicPosition(scope, { ...saved, time: Number.isFinite(seconds) && seconds >= 0 && seconds < saved.duration ? seconds : saved.time });
    };
    const rememberWhenHidden = () => { if (document.visibilityState === "hidden") remember(); };
    window.addEventListener("pagehide", remember);
    document.addEventListener("visibilitychange", rememberWhenHidden);
    return () => {
      window.removeEventListener("pagehide", remember);
      document.removeEventListener("visibilitychange", rememberWhenHidden);
    };
  }, [scope]);
  useEffect(() => {
    if (!activeTrack) return;
    position.current = {
      id: activeTrack.id,
      time: isActivePlaylist || (duration > 0 && time >= duration) ? 0 : time,
      duration: isActivePlaylist ? 0 : duration,
    };
    if (positionChangedHere.current && (!playing || Date.now() - lastSaved.current >= 4000)) {
      lastSaved.current = Date.now();
      saveMusicPosition(scope, position.current);
    }
  }, [activeTrack, duration, isActivePlaylist, playing, scope, time]);
  useEffect(() => {
    if (!pending || !linkOpen) return;
    const timer = window.setTimeout(() => {
      wantsPlay.current = false;
      setPending(false);
      setError("Bấm Phát trên khung trình phát hoặc mở nguồn nhạc.");
    }, 20000);
    return () => window.clearTimeout(timer);
  }, [linkOpen, pending, current]);
  const ensureAudio = () => {
    if (!audioRef.current) {
      const audio = new Audio(); audio.volume = volume; audio.preload = 'metadata';
      const isActive = () => alive.current && !!loadedId.current && loadedId.current === activeId.current;
      audio.onplaying = () => { if (isActive() && wantsPlay.current) { setPending(false); setPlaying(true); } };
      audio.onwaiting = () => { if (isActive() && wantsPlay.current) { setPending(true); setPlaying(false); } };
      audio.onpause = () => { if (isActive()) setPlaying(false); };
      audio.ontimeupdate = () => { if (isActive()) setTime(audio.currentTime); };
      audio.onloadedmetadata = () => {
        if (!isActive()) return;
        const length = Number.isFinite(audio.duration) ? audio.duration : 0;
        setDuration(length);
        if (pendingLocalSeek.current > 0 && length > 0) audio.currentTime = Math.min(pendingLocalSeek.current, length);
        pendingLocalSeek.current = 0;
      };
      audio.onerror = () => { if (isActive()) { setError('Không đọc được file nhạc này. Hãy thử MP3, WAV hoặc M4A tương thích thiết bị.'); wantsPlay.current = false; setPending(false); setPlaying(false); } };
      audioRef.current = audio;
    }
    return audioRef.current;
  };
  const selectTrack = (id: string | null) => {
    activeId.current = id;
    position.current = id ? { id, time: 0, duration: 0 } : null;
    saveMusicPosition(scope, position.current);
    setCurrent(id); setTime(0); setDuration(0); setPlaying(false);
  };
  const dismissYouTube = () => {
    wantsPlay.current = false;
    youtube.current?.pauseVideo();
    youtube.current = null;
    setYoutubeVideoId(undefined);
    youtubeFailed.current = false;
    setYoutubeOpen(false); setYoutubeMinimized(false); setYoutubeNote("");
  };
  const dismissLink = () => {
    link.current?.pause();
    link.current = null;
    setLinkOpen(false);
  };
  const playTrack = (track: MusicTrack) => {
    if (roomAudio) { setError("Âm thanh phòng đang được ưu tiên. Hãy dừng nghe trong phòng để phát nhạc cá nhân."); return; }
    if ((!track.source || track.source === "local") && !track.blob) { setError('Bài hát này không còn dữ liệu trên thiết bị. Hãy xóa và thêm lại.'); return; }
    if (isYouTube(track) && (!track.url || !parseMusicLink(track.url)?.embedUrl)) { setError("Liên kết YouTube không còn hợp lệ. Hãy thêm lại từ nguồn nhạc."); return; }
    positionChangedHere.current = true;
    const changed = activeId.current !== track.id;
    if (changed) { dismissYouTube(); dismissLink(); selectTrack(track.id); }
    setError("");
    wantsPlay.current = true;
    setPending(true);
    if (isYouTube(track)) {
      generation.current++;
      audioRef.current?.pause();
      if (!changed && youtubeOpen && youtube.current && !youtubeFailed.current) {
        setYoutubeNote(""); youtube.current.playVideo();
      } else {
        if (youtubeFailed.current) { youtube.current = null; youtubeFailed.current = false; setYoutubeAttempt(n => n + 1); }
        setYoutubeStart(changed ? 0 : time);
        setYoutubeOpen(true);
        setYoutubeNote("Đang kết nối trình phát YouTube…");
      }
      return;
    }
    if (track.source && track.source !== 'local') {
      generation.current++;
      audioRef.current?.pause();
      if (!changed && link.current) link.current.play();
      else {
        pendingLinkSeek.current = changed ? 0 : time;
        setLinkOpen(true);
      }
      return;
    }
    const audio = ensureAudio(), token = ++generation.current;
    if (loadedId.current !== track.id) {
      audio.pause(); if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      pendingLocalSeek.current = changed ? 0 : time;
      urlRef.current = URL.createObjectURL(track.blob!); loadedId.current = track.id; audio.src = urlRef.current;
    } else if (changed) {
      setTime(audio.currentTime); setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    }
    void audio.play().catch(() => {
      if (alive.current && token === generation.current) {
        wantsPlay.current = false; setPending(false); setPlaying(false);
        setError('Không phát được nhạc. Bấm Phát để thử lại hoặc chọn file khác.');
      }
    });
  };
  const play = (id = current ?? tracks[0]?.id) => {
    const track = tracks.find(item => item.id === id);
    if (track) playTrack(track);
  };
  const pause = () => {
    generation.current++; wantsPlay.current = false;
    youtube.current?.pauseVideo(); link.current?.pause(); audioRef.current?.pause();
    setPending(false); setPlaying(false);
  };
  useEffect(() => { if (roomAudio) pause(); }, [roomAudio]);
  const stop = () => {
    positionChangedHere.current = true;
    pause(); dismissYouTube(); dismissLink();
    if (audioRef.current && loadedId.current === activeId.current) audioRef.current.currentTime = 0;
    pendingLocalSeek.current = 0;
    setTime(0);
    if (linkOpen || youtubeOpen) setDuration(0);
  };
  const next = (direction: number) => {
    const player = isActivePlaylist ? youtube.current : null;
    const playlist = player?.getPlaylist();
    const index = player?.getPlaylistIndex() ?? -1;
    if (player && playlist?.length && index >= 0 && !youtubeFailed.current && !roomAudio) {
      wantsPlay.current = true;
      const nextIndex = (index + direction + playlist.length) % playlist.length;
      player.playVideoAt(nextIndex);
      return;
    }
    const id = nextMusicId(tracks.map(t => t.id), current, direction, shuffle);
    if (id) play(id);
  };
  useEffect(() => {
    const audio = audioRef.current; if (!audio) return;
    audio.onended = () => {
      if (!current || activeId.current !== loadedId.current) return;
      wantsPlay.current = false; setPending(false); setPlaying(false);
      if (repeat === 'one') { audio.currentTime = 0; play(); }
      else if (shuffle || repeat === 'all' || tracks.findIndex(t => t.id === current) < tracks.length - 1) next(1);
    };
    return () => { audio.onended = null; };
  });
  const add = async (files: File[]) => {
    if (lock.current || !files.length) return false; lock.current = true; setBusy(true); setError('');
    try {
      for (const file of files) {
        if ((!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(file.name)) || file.size > 50 * 1024 * 1024 || !file.size) throw new Error('Chọn file âm thanh không rỗng, tối đa 50 MB mỗi bài.');
        const track: MusicTrack = { id: crypto.randomUUID(), owner: scope, title: file.name.replace(/\.[^.]+$/, ''), source: 'local', blob: file };
        await musicStore(scope, 'put', track);
        if (alive.current) setTracks(old => [...old, track]);
      }
      return true;
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Không lưu được nhạc; dung lượng thiết bị có thể đã đầy.'); return false; }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const addOnline = async (rawUrl: string, title?: string, playNow = false) => {
    if (lock.current) return false;
    const parsed = parseMusicLink(rawUrl);
    if (!parsed) { setError('Liên kết không được hỗ trợ. Dùng URL YouTube, YouTube Music, Spotify hoặc SoundCloud hợp lệ.'); return false; }
    lock.current = true; setBusy(true); setError('');
    try {
      const detected = !title?.trim() && parsed.youtubeVideoId ? await getYouTubeMusicTitle(parsed.youtubeVideoId) : null;
      if (!alive.current) return false;
      const track: MusicTrack = { id: crypto.randomUUID(), owner: scope, title: title?.trim().slice(0, 160) || detected || parsed.title, source: parsed.source, url: parsed.url, embedUrl: parsed.embedUrl, isPlaylist: parsed.isPlaylist };
      await musicStore(scope, 'put', track);
      if (alive.current) {
        setTracks(old => [...old, track]);
        if (playNow) playTrack(track);
      }
      return true;
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Không lưu được liên kết nhạc.'); return false; }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const remove = async (track: MusicTrack) => {
    try {
      await musicStore(scope, 'delete', track);
      if (track.id === activeId.current) { pause(); dismissYouTube(); dismissLink(); selectTrack(null); }
      if (track.id === loadedId.current) { loadedId.current = null; audioRef.current?.pause(); audioRef.current?.removeAttribute('src'); audioRef.current?.load(); if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = ''; }
      setTracks(old => old.filter(t => t.id !== track.id));
    } catch { setError('Không xóa được bài hát. Hãy thử lại.'); }
  };
  const rename = async (track: MusicTrack, title: string) => {
    if (!title.trim()) return;
    const next = { ...track, title: title.trim().slice(0, 160) };
    try { await musicStore(scope, 'put', next); setTracks(old => old.map(t => t.id === next.id ? next : t)); }
    catch { setError('Không lưu được tên bài hát.'); }
  };
  const value: Music = { tracks, current, activeTrack, nowPlayingTitle, playing, time, duration, volume, repeat, shuffle, hidden, error, busy,
    youtubeOpen, youtubeMinimized, youtubeVideoVisible: Boolean(playerRect), youtubeNote, setPlayerSlot, setYoutubeMinimized, linkOpen, pending, stop, play, pause, next, add, addOnline, remove, rename, setRepeat, setShuffle, setHidden,
    seek: value => {
      if (duration <= 0 || !Number.isFinite(value)) return;
      positionChangedHere.current = true;
      const seconds = Math.max(0, Math.min(duration, value));
      if (isYouTube(activeTrack)) { if (youtube.current) { youtube.current.seekTo(seconds, true); setTime(seconds); } }
      else if (link.current) { link.current.seek(seconds); setTime(seconds); }
      else {
        if (audioRef.current && loadedId.current === current) audioRef.current.currentTime = seconds;
        setTime(seconds);
      }
    },
    setVolume: value => { changeVolume(value); if (audioRef.current) audioRef.current.volume = value; youtube.current?.setVolume(Math.round(value * 100)); link.current?.setVolume?.(value); } };
  const youtubeEmbed = youtubeSelection?.embedUrl;
  const syncYouTube = (player: Player, state?: number) => {
    if (!alive.current || !activeTrack || activeTrack.id !== activeId.current || player !== youtube.current || youtubeFailed.current) return;
    const list = isActivePlaylist ? player.getPlaylist() : undefined;
    const index = list?.length ? player.getPlaylistIndex() : -1;
    if (isActivePlaylist && state !== 0) {
      const videoUrl = player.getVideoUrl?.();
      const id = list?.[index] || (videoUrl && parseMusicLink(videoUrl)?.youtubeVideoId);
      if (id) setYoutubeVideoId(id);
    }
    const length = player.getDuration(), progress = player.getCurrentTime();
    setDuration(Number.isFinite(length) && length > 0 ? length : 0);
    if (Number.isFinite(progress) && progress >= 0) setTime(progress);
    if (state === 1) {
      if (roomAudio || (!playerRect && !wantsPlay.current)) { pause(); return; }
      wantsPlay.current = true; setPending(false); setPlaying(true); setYoutubeNote("");
    } else if (state === 3) {
      setPending(wantsPlay.current); setPlaying(false);
    } else if (state === 2 || state === 5 || state === -1) {
      if (state === 2) { wantsPlay.current = false; setPending(false); }
      setPlaying(false);
    } else if (state === 0) {
      setPending(false); setPlaying(false);
      if (repeat === "one") {
        wantsPlay.current = true;
        if (index >= 0) player.playVideoAt(index);
        else { player.seekTo(0, true); player.playVideo(); }
        return;
      }
      // Preserve playback intent while YouTube queues the next item in the same playlist.
      if (list?.length && index >= 0 && index < list.length - 1) return;
      wantsPlay.current = false;
      if (shuffle || repeat === "all" || tracks.findIndex(t => t.id === current) < tracks.length - 1) {
        const id = nextMusicId(tracks.map(t => t.id), current, 1, shuffle);
        if (id === current) {
          wantsPlay.current = true;
          if (list?.length) player.playVideoAt(0);
          else { player.seekTo(0, true); player.playVideo(); }
        } else if (id) play(id);
      }
    }
  };
  return <AudioPriority.Provider value={setRoomAudio}><Context.Provider value={value}>
    {linkOpen && activeTrack?.url && (activeTrack.source === "spotify" || activeTrack.source === "soundcloud") &&
      <MusicLinkPlayback key={activeTrack.id} track={activeTrack} rect={playerRect}
        onReady={controls => {
          if (activeId.current !== activeTrack.id) return;
          link.current = controls;
          controls.setVolume?.(volume);
          if (pendingLinkSeek.current > 0) controls.seek(pendingLinkSeek.current);
          pendingLinkSeek.current = 0;
          if (wantsPlay.current && !roomAudio) controls.play();
        }}
        onUpdate={status => {
          if (activeId.current !== activeTrack.id) return;
          if (status.time !== undefined && Number.isFinite(status.time) && status.time >= 0) setTime(status.time);
          if (status.duration !== undefined && Number.isFinite(status.duration) && status.duration >= 0) setDuration(status.duration);
          if (status.playing === true && (roomAudio || (!playerRect && !wantsPlay.current))) { link.current?.pause(); return; }
          if (status.playing === true) wantsPlay.current = true;
          if (status.playing !== undefined) setPlaying(status.playing);
          if (status.playing || status.ended || (status.paused && playing)) setPending(false);
          if (status.ended) {
            wantsPlay.current = false;
            if (repeat === "one") { link.current?.seek(0); play(); }
            else if (shuffle || repeat === "all" || tracks.findIndex(t => t.id === current) < tracks.length - 1) next(1);
          }
        }}
        onError={() => {
          if (activeId.current !== activeTrack.id) return;
          wantsPlay.current = false; setPlaying(false); setPending(false); dismissLink();
          setError("Không kết nối được trình phát. Thử lại hoặc mở nguồn nhạc.");
        }}/> }
    {youtubeEmbed && youtubeOpen && activeTrack && <MusicYouTubeSurface key={`${activeTrack.id}:${youtubeAttempt}`} rect={playerRect}
      embedUrl={youtubeEmbed} title={nowPlayingTitle} start={youtubeStart} onMinimize={() => setYoutubeMinimized(true)}
      onReady={player => {
        if (activeId.current !== activeTrack.id || youtubeFailed.current) return;
        youtube.current = player; player.setVolume(Math.round(volume * 100)); syncYouTube(player);
        setYoutubeNote("");
        if (wantsPlay.current && !roomAudio) player.playVideo();
      }}
      onUpdate={syncYouTube}
      onBlocked={() => { wantsPlay.current = false; setPending(false); setPlaying(false); setYoutubeNote("Bấm Phát ngay trên khung YouTube để bắt đầu."); }}
      onError={() => { youtubeFailed.current = true; wantsPlay.current = false; setPending(false); setPlaying(false); setYoutubeNote(isActivePlaylist
        ? "Không phát được danh sách trong trình phát nhúng. Thử lại hoặc mở nguồn nhạc."
        : "Không phát được video nhúng. Bấm Phát để thử lại hoặc mở nguồn nhạc."); }}/>}
    {children}
  </Context.Provider></AudioPriority.Provider>;
}

const clock = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const tail = String(Math.floor(seconds % 60)).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`;
};
const barHeights = [.22, .42, .72, .47, .91, .56, .79, 1, .6, .87, .44, .68, .34, .19];
function Visualizer({ wide = false }: { wide?: boolean }) {
  const { playing } = useMusic();
  return <span className={`music-spectrum music-wave${wide ? " music-spectrum-wide" : ""}`} data-playing={playing} aria-hidden="true">
    {barHeights.map((height, i) => <i key={i} style={{ "--wave-height": height, "--wave-shift": `${-i * .131}s` } as CSSProperties}/>)}
  </span>;
}
function PlaybackProgress() {
  const m = useMusic();
  const ready = m.duration > 0 && (!isYouTube(m.activeTrack) || m.youtubeOpen);
  return <div className="music-progress">
    <input aria-label="Vị trí phát" aria-valuetext={ready ? `${clock(m.time)} / ${clock(m.duration)}` : undefined}
      type="range" min={0} max={m.duration || 1} step=".1" disabled={!ready}
      value={Math.min(m.time, m.duration || 1)} onChange={event => m.seek(Number(event.target.value))}/>
    <div><span>{clock(m.time)}</span><span>{m.duration > 0 ? clock(m.duration) : "—:—"}</span></div>
  </div>;
}
function Controls() {
  const m = useMusic();
  return <div className="music-controls"><button aria-label="Bài trước" disabled={!m.tracks.length} onClick={() => m.next(-1)}><SkipBack size={19}/></button><button aria-label={m.playing || m.pending ? "Tạm dừng" : m.time > 0 ? "Tiếp tục" : "Phát"} disabled={!m.tracks.length} onClick={() => m.playing || m.pending ? m.pause() : m.play()}>{m.playing || m.pending ? <Pause size={22}/> : <Play size={22}/>}</button><button aria-label="Bài sau" disabled={!m.tracks.length} onClick={() => m.next(1)}><SkipForward size={19}/></button></div>;
}
function PlaybackVolume() {
  const m = useMusic();
  const externalVolume = m.activeTrack?.source === "spotify";
  return <label className="music-volume" title={externalVolume ? "Chỉnh âm lượng Spotify trên thiết bị" : "Âm lượng"}>
    <Volume2 size={16} aria-hidden="true"/>
    <input aria-label="Âm lượng" type="range" min="0" max="1" step=".01" value={m.volume}
      disabled={externalVolume} onChange={e => m.setVolume(Number(e.target.value))}/>
  </label>;
}
function PlaybackOptions({ volume = false }: { volume?: boolean }) {
  const m = useMusic();
  return <div className="music-options">
    {volume && <PlaybackVolume/>}
    <label><Repeat2 size={16} aria-hidden="true"/>Lặp<select value={m.repeat} onChange={e => m.setRepeat(e.target.value as Music['repeat'])}><option value="off">Tắt</option><option value="all">Danh sách</option><option value="one">Một bài</option></select></label>
    <label><input type="checkbox" checked={m.shuffle} onChange={e => m.setShuffle(e.target.checked)}/><Shuffle size={16} aria-hidden="true"/>Ngẫu nhiên</label>
  </div>;
}
export function MusicIsland({ suppressed = false }: { suppressed?: boolean }) {
  const m = useMusic(), [expanded, setExpanded] = useState(false), [hovered, setHovered] = useState(false), root = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null), details = useId();
  const track = m.activeTrack;
  const videoWasVisible = useRef(false);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setExpanded(false); };
    const leavePage = () => setExpanded(false);
    document.addEventListener('pointerdown', close);
    window.addEventListener('popstate', leavePage);
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('popstate', leavePage); };
  }, [expanded]);
  useEffect(() => {
    if (videoWasVisible.current && !m.youtubeVideoVisible) { setExpanded(false); setHovered(false); }
    videoWasVisible.current = m.youtubeVideoVisible;
  }, [m.youtubeVideoVisible]);
  useEffect(() => { if (m.hidden || !track) { setExpanded(false); setHovered(false); } }, [m.hidden, track?.id]);
  if (!track || m.hidden || suppressed) return null;
  const close = () => { setExpanded(false); toggle.current?.focus(); };
  return <aside ref={root} data-study-island className={`music-island ${expanded ? 'expanded' : hovered ? 'peek' : ''}`} aria-label="Trình phát nhạc"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setHovered(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false); }}
    onKeyDown={event => { if (event.key === 'Escape' && expanded) { event.stopPropagation(); close(); } }}>
    <div className="music-island-summary"><button ref={toggle} type="button" className="music-island-open" aria-label={`${expanded ? "Thu gọn điều khiển" : "Mở điều khiển"} ${m.nowPlayingTitle}`} aria-expanded={expanded} aria-controls={expanded ? details : undefined} onClick={() => setExpanded(value => !value)}><Music2 size={15} aria-hidden="true"/><ScrollingTitle title={m.nowPlayingTitle} visible={expanded || hovered}/><Visualizer/><ChevronDown size={14} aria-hidden="true"/></button></div>
    {expanded && <div className="music-island-details" id={details}>
      <div className="music-island-source">{musicSourceLabel(track.source)}{track.isPlaylist ? ' · Danh sách phát' : ''}</div>
      <PlaybackProgress/>
      <Controls/>
      {m.youtubeNote && <small role="status">{m.youtubeNote}</small>}
      {m.error && <small role="alert">{m.error}</small>}
      <div className="music-island-footer">
        <PlaybackVolume/>
        <details className="music-island-menu">
          <summary aria-label="Tùy chọn phát" title="Tùy chọn phát"><MoreHorizontal size={19}/></summary>
          <div className="music-island-menu-content">
            <PlaybackOptions/>
            <div className="music-island-actions">
              {track.url && <a className="music-source-link" href={track.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Mở nguồn</a>}
              <button type="button" onClick={m.stop}><X size={15}/>{isYouTube(track) ? "Dừng YouTube" : "Dừng phát"}</button>
              <button type="button" onClick={() => m.setHidden(true)}><ChevronDown size={15}/>Ẩn thanh</button>
            </div>
          </div>
        </details>
      </div>
    </div>}
  </aside>;
}
export function MusicPage() {
  const m = useMusic(), active = useLearningActive();
  const [adding, setAdding] = useState(false);
  const [source, setSource] = useState<"device" | "link">("device");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [onlineTitle, setOnlineTitle] = useState<string | null>(null);
  const [titlePreview, setTitlePreview] = useState<{ id: string; title: string }>();
  const addPanel = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const parsed = parseMusicLink(onlineUrl);
  const videoId = adding && source === "link" ? parsed?.youtubeVideoId : undefined;
  const suggestedTitle = videoId && titlePreview?.id === videoId ? titlePreview.title : "";
  useEffect(() => {
    if (!videoId || onlineTitle !== null) return;
    let subscribed = true;
    const timer = window.setTimeout(() => {
      void getYouTubeMusicTitle(videoId).then(title => {
        if (subscribed && title) setTitlePreview({ id: videoId, title });
      });
    }, 300);
    return () => { subscribed = false; window.clearTimeout(timer); };
  }, [onlineTitle, videoId]);
  const closeAdd = () => { setAdding(false); addButton.current?.focus(); };
  const youtubePlaylist = parsed?.isPlaylist && (parsed.source === "youtube-music" || parsed.source === "youtube");
  const addLink = async (event: FormEvent) => {
    event.preventDefault();
    const playNow = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "play";
    if (await m.addOnline(onlineUrl, onlineTitle ?? suggestedTitle, playNow)) {
      setOnlineUrl(""); setOnlineTitle(null); closeAdd();
    }
  };
  const track = m.activeTrack;
  const localTrack = !!track && (!track.source || track.source === "local");
  return <section className="music-page">
    <header className="music-page-header"><div><span className="eyebrow">KHÔNG GIAN HỌC TẬP</span><h2><Music2 size={25}/>Nhạc tập trung</h2><p>Chọn nhạc cho phiên học của bạn.</p></div></header>
    {m.error && !adding && <p className="form-error" role="alert">{m.error}</p>}
    <div className="music-dashboard">
      <section className="music-player-card" aria-label="Đang phát">
        <div className="music-player-card-heading">
          <div><span className="eyebrow">ĐANG PHÁT</span><strong>{m.nowPlayingTitle || "Chưa chọn bài"}</strong><small>{track ? `${musicSourceLabel(track.source)}${track.isPlaylist ? " · Danh sách phát" : ""}` : "Chọn bài nhạc từ danh sách phát"}</small></div>
          <label className="music-island-toggle"><input type="checkbox" checked={!m.hidden} onChange={event => m.setHidden(!event.target.checked)}/>Hiện trình phát thu nhỏ</label>
        </div>
        {isYouTube(track) && m.youtubeOpen && m.youtubeMinimized ? <div className="music-youtube-collapsed">
          <button type="button" className="secondary-button" onClick={() => m.setYoutubeMinimized(false)}>Hiện video YouTube</button>
          <button type="button" className="text-button" onClick={m.stop}>Dừng YouTube</button>
        </div> : isYouTube(track) && m.youtubeOpen ? <div className="music-youtube-slot" ref={active ? m.setPlayerSlot : undefined} aria-hidden="true"><Radio size={27}/><span>Trình phát YouTube</span></div>
          : m.linkOpen ? <div className="music-link-slot" ref={active ? m.setPlayerSlot : undefined} aria-hidden="true"><Radio size={27}/><span>Trình phát {musicSourceLabel(track?.source)}</span></div>
          : <div className="music-player-art" aria-hidden="true">{track && !localTrack ? <Radio size={36}/> : <Disc3 size={42}/>}</div>}
        {track && <div className="music-page-visual"><Visualizer wide/></div>}
        {track && <PlaybackProgress/>}
        {m.youtubeNote && <small className="field-hint" role="status">{m.youtubeNote}</small>}
        {track?.url && <a className="music-source-link" href={track.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Mở nguồn nhạc</a>}
        <Controls/><PlaybackOptions volume/>
      </section>
      <section className="music-queue">
        <header className="music-queue-heading"><div><h3><ListMusic size={21}/>Danh sách phát</h3><span className="music-library-count">{m.tracks.length} mục</span></div><button type="button" className="primary-button" ref={addButton} aria-expanded={adding} aria-controls={adding ? addPanel : undefined} onClick={() => setAdding(value => !value)}><Plus size={17}/>Thêm nhạc</button></header>
        {adding && <div className="music-add-panel" id={addPanel} onKeyDown={event => { if (event.key === "Escape" && !m.busy) { event.stopPropagation(); closeAdd(); } }}>
          <div className="music-add-options" role="group" aria-label="Nguồn nhạc">
            <button type="button" className="secondary-button" aria-pressed={source === "device"} disabled={m.busy} onClick={() => setSource("device")}><Upload size={16}/>Từ thiết bị</button>
            <button type="button" className="secondary-button" aria-pressed={source === "link"} disabled={m.busy} onClick={() => setSource("link")}><Link2 size={17}/>Bằng liên kết</button>
          </div>
          {source === "device"
            ? <FilePicker className="music-upload" label={m.busy ? "Đang lưu…" : "Chọn tệp nhạc"} aria-label="Thêm file nhạc" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac" multiple disabled={m.busy} description="MP3, WAV, M4A, OGG, AAC, FLAC · tối đa 50 MB/bài" onChange={event => { void m.add(Array.from(event.target.files ?? [])).then(added => { if (added) closeAdd(); }); }}/>
            : <form className="music-link-form" onSubmit={addLink}>
                <label>Liên kết nhạc<input type="url" required value={onlineUrl} onChange={event => setOnlineUrl(event.target.value)} placeholder="Dán link bài hát hoặc playlist"/></label>
                <label>Tên hiển thị (tùy chọn)<input value={onlineTitle ?? suggestedTitle} maxLength={160} onChange={event => setOnlineTitle(event.target.value)} placeholder={parsed?.title ?? "Nhập tên bài nhạc"}/></label>
                <div className="music-link-actions">
                  {youtubePlaylist && <button type="submit" value="play" className="primary-button" disabled={m.busy}><Play size={16}/>Thêm và phát</button>}
                  <button type="submit" className={youtubePlaylist ? "secondary-button" : "primary-button"} disabled={m.busy || !onlineUrl.trim()}><Link2 size={16}/>{m.busy ? "Đang lưu…" : "Thêm vào danh sách"}</button>
                </div>
              </form>}
          {m.error && <p className="form-error" role="alert">{m.error}</p>}
        </div>}
        {!m.tracks.length ? <div className="music-empty"><ListMusic size={26}/><strong>Danh sách phát đang trống</strong><span>Thêm nhạc từ thiết bị hoặc từ một liên kết để bắt đầu.</span></div> : <ol className="music-playlist">{m.tracks.map(track => {
          const selected = m.current === track.id, playing = selected && (m.playing || m.pending);
          return <li key={track.id} className={selected ? "selected" : ""} aria-current={selected ? "true" : undefined}>
            <button type="button" className="music-play-button" aria-label={`${playing ? "Tạm dừng" : selected && m.time > 0 ? "Tiếp tục" : "Phát"} ${track.title}`} onClick={() => playing ? m.pause() : m.play(track.id)}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button>
            <div className="music-track-fields"><input key={`${track.id}:${track.title}`} aria-label={`Tên bài: ${track.title}`} defaultValue={track.title} maxLength={160} onBlur={event => { if (event.target.value.trim() !== track.title) void m.rename(track, event.target.value); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}/><small>{musicSourceLabel(track.source)}{track.isPlaylist ? " · Danh sách phát" : ""}</small></div>
            {track.url && <a className="music-track-link" aria-label={`Mở nguồn ${track.title}`} href={track.url} target="_blank" rel="noreferrer"><ExternalLink size={16}/></a>}
            <button type="button" className="music-delete-button" aria-label={`Xóa ${track.title}`} onClick={() => void m.remove(track)}><Trash2 size={17}/></button>
          </li>;
        })}</ol>}
      </section>
    </div>
  </section>;
}

function ScrollingTitle({ title, visible }: { title: string; visible: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const measure = () => setOverflow((el.firstElementChild?.scrollWidth ?? 0) > el.clientWidth);
    measure();
    if (!globalThis.ResizeObserver) return;
    const observer = new ResizeObserver(measure); observer.observe(el); return () => observer.disconnect();
  }, [title, visible]);
  return <span ref={root} className={`music-title ${visible ? 'visible' : ''} ${overflow ? 'overflows' : ''}`} title={title}><span>{title}</span></span>;
}
