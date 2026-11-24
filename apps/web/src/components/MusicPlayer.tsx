import FilePicker from "./FilePicker";
import { createContext, useContext, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Music2, Pause, Play, SkipBack, SkipForward, X, ChevronDown, Trash2, Link2, ExternalLink, Disc3, Radio, Plus, Upload, ListMusic, Volume2, Repeat2, Shuffle } from 'lucide-react';
import { musicStore, nextMusicId, parseMusicLink, musicSourceLabel, type MusicTrack } from '../lib/musicStorage';

type Music = {
  tracks: MusicTrack[]; current: string | null; playing: boolean; time: number; duration: number; volume: number;
  repeat: 'off' | 'all' | 'one'; shuffle: boolean; hidden: boolean; error: string; busy: boolean;
  activeTrack: MusicTrack | null;
  analyser: AnalyserNode | null; play: (id?: string) => void; pause: () => void; next: (direction: number) => void;
  seek: (time: number) => void; setVolume: (value: number) => void; setRepeat: (value: 'off' | 'all' | 'one') => void;
  setShuffle: (value: boolean) => void; setHidden: (value: boolean) => void;
  add: (files: File[]) => Promise<boolean>; addOnline: (url: string, title?: string) => Promise<boolean>; remove: (track: MusicTrack) => Promise<void>; rename: (track: MusicTrack, title: string) => Promise<void>;
};
const Context = createContext<Music | null>(null);
function useMusic() { const value = useContext(Context); if (!value) throw new Error('MusicProvider missing'); return value; }
export function MusicProvider({ owner, children }: { owner: string | null; children: ReactNode }) {
  const scope = owner ?? 'guest';
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0), [duration, setDuration] = useState(0), [volume, changeVolume] = useState(.65);
  const [repeat, setRepeat] = useState<Music['repeat']>('off'), [shuffle, setShuffle] = useState(false);
  const [hidden, setHidden] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null), contextRef = useRef<AudioContext | null>(null);
  const urlRef = useRef(''), loadedId = useRef<string | null>(null), generation = useRef(0);
  const alive = useRef(true), lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    void musicStore(scope, 'list').then(rows => { if (alive.current) setTracks(old => [...rows, ...old.filter(t => !rows.some(r => r.id === t.id))]); }).catch(() => { if (alive.current) setError('Không mở được thư viện nhạc trên thiết bị.'); });
    return () => {
      alive.current = false; generation.current++;
      audioRef.current?.pause(); audioRef.current?.removeAttribute('src'); audioRef.current?.load();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      void contextRef.current?.close().catch(() => {});
    };
  }, [scope]);
  const ensureAudio = () => {
    if (!audioRef.current) {
      const audio = new Audio(); audio.volume = volume; audio.preload = 'metadata';
      audio.onplay = () => { if (alive.current) setPlaying(true); };
      audio.onpause = () => { if (alive.current) setPlaying(false); };
      audio.ontimeupdate = () => { if (alive.current) setTime(audio.currentTime); };
      audio.onloadedmetadata = () => { if (alive.current) setDuration(Number.isFinite(audio.duration) ? audio.duration : 0); };
      audio.onerror = () => { if (alive.current) { setError('Không đọc được file nhạc này. Hãy thử MP3, WAV hoặc M4A tương thích thiết bị.'); setPlaying(false); } };
      audioRef.current = audio;
    }
    if (!contextRef.current) {
      try {
        const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (Constructor) {
          const ctx = new Constructor(), node = ctx.createAnalyser(); node.fftSize = 128; node.smoothingTimeConstant = .8;
          ctx.createMediaElementSource(audioRef.current).connect(node); node.connect(ctx.destination);
          contextRef.current = ctx; setAnalyser(node);
        }
      } catch { setError('Thiết bị chưa hỗ trợ visualizer; bạn vẫn có thể nghe nhạc.'); }
    }
    return audioRef.current;
  };
  const play = (id = current ?? tracks[0]?.id) => {
    const track = tracks.find(item => item.id === id); if (!track) return;
    if (track.source && track.source !== 'local') {
      generation.current++;
      audioRef.current?.pause();
      setCurrent(track.id); setTime(0); setDuration(0); setError(''); setPlaying(true);
      return;
    }
    if (!track.blob) { setError('Bài hát này không còn dữ liệu trên thiết bị. Hãy xóa và thêm lại.'); return; }
    const audio = ensureAudio(), token = ++generation.current;
    setError('');
    if (loadedId.current !== track.id) {
      audio.pause(); if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(track.blob); audio.src = urlRef.current; loadedId.current = track.id;
      setCurrent(track.id); setTime(0); setDuration(0);
    }
    // Both calls start inside the user's gesture for Safari autoplay rules.
    void contextRef.current?.resume().catch(() => {});
    void audio.play().catch(() => { if (alive.current && token === generation.current) { setError('Không phát được nhạc. Bấm Phát để thử lại hoặc chọn file khác.'); setPlaying(false); } });
  };
  const pause = () => { generation.current++; audioRef.current?.pause(); setPlaying(false); };
  const next = (direction: number) => { const id = nextMusicId(tracks.map(t => t.id), current, direction, shuffle); if (id) play(id); };
  useEffect(() => {
    const audio = audioRef.current; if (!audio) return;
    audio.onended = () => {
      setPlaying(false);
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
  const addOnline = async (rawUrl: string, title?: string) => {
    if (lock.current) return false;
    const parsed = parseMusicLink(rawUrl);
    if (!parsed) { setError('Liên kết không được hỗ trợ. Dùng URL YouTube, YouTube Music, Spotify hoặc SoundCloud hợp lệ.'); return false; }
    lock.current = true; setBusy(true); setError('');
    try {
      const track: MusicTrack = { id: crypto.randomUUID(), owner: scope, title: title?.trim().slice(0, 160) || parsed.title, source: parsed.source, url: parsed.url, embedUrl: parsed.embedUrl, isPlaylist: parsed.isPlaylist };
      await musicStore(scope, 'put', track);
      if (alive.current) setTracks(old => [...old, track]);
      return true;
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Không lưu được liên kết nhạc.'); return false; }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const remove = async (track: MusicTrack) => {
    try {
      await musicStore(scope, 'delete', track);
      if (track.id === loadedId.current) { pause(); audioRef.current?.removeAttribute('src'); audioRef.current?.load(); if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = ''; loadedId.current = null; setCurrent(null); setTime(0); setDuration(0); }
      else if (track.id === current) { pause(); setCurrent(null); setTime(0); setDuration(0); }
      setTracks(old => old.filter(t => t.id !== track.id));
    } catch { setError('Không xóa được bài hát. Hãy thử lại.'); }
  };
  const rename = async (track: MusicTrack, title: string) => {
    if (!title.trim()) return;
    const next = { ...track, title: title.trim().slice(0, 160) };
    try { await musicStore(scope, 'put', next); setTracks(old => old.map(t => t.id === next.id ? next : t)); }
    catch { setError('Không lưu được tên bài hát.'); }
  };
  const activeTrack = tracks.find(track => track.id === current) ?? null;
  const value: Music = { tracks, current, activeTrack, playing, time, duration, volume, repeat, shuffle, hidden, error, busy, analyser, play, pause, next, add, addOnline, remove, rename, setRepeat, setShuffle, setHidden,
    seek: value => { if (audioRef.current && duration > 0) { audioRef.current.currentTime = Math.max(0, Math.min(duration, value)); setTime(audioRef.current.currentTime); } },
    setVolume: value => { changeVolume(value); if (audioRef.current) audioRef.current.volume = value; } };
  return <Context.Provider value={value}><OnlinePlayback track={activeTrack} playing={playing}/>{children}</Context.Provider>;
}

/** Keep an official third-party embed mounted at app scope so route changes do
 * not tear down online playback. Cross-origin players cannot expose PCM data,
 * so the white spectrum remains a source status indicator for these tracks. */
function OnlinePlayback({ track, playing }: { track: MusicTrack | null; playing: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!track?.embedUrl || !track.source || track.source === 'local') return;
    const command = track.source === 'soundcloud'
      ? { method: playing ? 'play' : 'pause' }
      : track.source === 'spotify'
        ? { command: playing ? 'play' : 'pause' }
        : { event: 'command', func: playing ? 'playVideo' : 'pauseVideo', args: [] };
    frame.current?.contentWindow?.postMessage(JSON.stringify(command), '*');
  }, [playing, track?.embedUrl, track?.source]);
  if (!track?.embedUrl || !track.source || track.source === 'local') return null;
  return <div className="music-online-runtime" aria-hidden="true"><iframe ref={frame} key={track.id} src={track.embedUrl} title={`${musicSourceLabel(track.source)} player`} allow="autoplay; encrypted-media; picture-in-picture"/></div>;
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
function Visualizer() {
  const { analyser, playing } = useMusic(); const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const surface = canvas.current; if (!surface) return;
    const ctx = surface.getContext('2d'); if (!ctx) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 64); let frame = 0, previous = 0;
    const draw = (now: number) => {
      if (now - previous > 40 || !playing) {
        previous = now; ctx.clearRect(0, 0, 120, 32);
        if (playing && analyser && !reduced) analyser.getByteFrequencyData(data);
        for (let i = 0; i < 20; i++) { const h = playing && analyser && !reduced ? Math.max(2, data[i * 2] / 255 * 30) : 2; ctx.fillStyle = '#fff'; ctx.fillRect(i * 6, (32 - h) / 2, 3, h); }
      }
      if (playing && !reduced && document.visibilityState !== 'hidden') frame = requestAnimationFrame(draw);
    };
    const start = () => { cancelAnimationFrame(frame); draw(performance.now()); }; start(); document.addEventListener('visibilitychange', start);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', start); };
  }, [analyser, playing]);
  return <canvas ref={canvas} width={120} height={32} className="music-spectrum" aria-hidden="true"/>;
}
function Controls() {
  const m = useMusic();
  return <div className="music-controls"><button aria-label="Bài trước" disabled={!m.tracks.length} onClick={() => m.next(-1)}><SkipBack size={19}/></button><button aria-label={m.playing ? 'Tạm dừng' : 'Phát'} disabled={!m.tracks.length} onClick={() => m.playing ? m.pause() : m.play()}>{m.playing ? <Pause size={22}/> : <Play size={22}/>}</button><button aria-label="Bài sau" disabled={!m.tracks.length} onClick={() => m.next(1)}><SkipForward size={19}/></button></div>;
}
function PlaybackOptions() {
  const m = useMusic();
  return <div className="music-options">
    <label><Volume2 size={16} aria-hidden="true"/>Âm lượng<input aria-label="Âm lượng" type="range" min="0" max="1" step=".01" value={m.volume} onChange={e => m.setVolume(Number(e.target.value))}/></label>
    <label><Repeat2 size={16} aria-hidden="true"/>Lặp<select value={m.repeat} onChange={e => m.setRepeat(e.target.value as Music['repeat'])}><option value="off">Tắt</option><option value="all">Danh sách</option><option value="one">Một bài</option></select></label>
    <label><input type="checkbox" checked={m.shuffle} onChange={e => m.setShuffle(e.target.checked)}/><Shuffle size={16} aria-hidden="true"/>Ngẫu nhiên</label>
  </div>;
}
export function MusicIsland() {
  const m = useMusic(), [expanded, setExpanded] = useState(false), [hovered, setHovered] = useState(false), root = useRef<HTMLElement>(null);
  const track = m.activeTrack;
  useEffect(() => {
    if (!expanded) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setExpanded(false); };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, [expanded]);
  if (!track || m.hidden) return null;
  return <aside ref={root} className={`music-island ${expanded ? 'expanded' : hovered ? 'peek' : ''}`} aria-label="Đang phát nhạc"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setHovered(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false); }}
    onKeyDown={event => { if (event.key === 'Escape') setExpanded(false); }}>
    <div className="music-island-summary"><button className="music-island-open" aria-label={`Mở điều khiển ${track.title}`} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><Visualizer/><ScrollingTitle title={track.title} visible={expanded || hovered}/></button></div>
    {m.error && !expanded && <small role="alert">{m.error}</small>}
    {expanded && <div className="music-island-details"><div className="music-island-track"><strong>{track.title}</strong><span>{musicSourceLabel(track.source)}{track.isPlaylist ? ' · Playlist' : ''}</span></div>{track.url && <a className="music-source-link" href={track.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Mở nguồn</a>}<input aria-label="Vị trí phát" type="range" min={0} max={m.duration || 1} step=".1" disabled={!m.duration} value={Math.min(m.time, m.duration || 1)} onChange={event => m.seek(Number(event.target.value))}/><small>{track.source && track.source !== 'local' ? 'Điều khiển theo trình phát nguồn' : `${clock(m.time)} / ${clock(m.duration)}`}</small><Controls/><PlaybackOptions/>{m.error && <p role="alert">{m.error}</p>}<div className="music-island-footer"><button onClick={() => setExpanded(false)}><ChevronDown size={15}/>Thu gọn</button><button onClick={() => m.setHidden(true)}><X size={15}/>Ẩn thanh</button></div></div>}
  </aside>;
}
export function MusicPage() {
  const m = useMusic();
  const [adding, setAdding] = useState(false);
  const [source, setSource] = useState<"device" | "link">("device");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [onlineTitle, setOnlineTitle] = useState("");
  const addPanel = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const parsed = onlineUrl.trim() ? parseMusicLink(onlineUrl) : null;
  const closeAdd = () => { setAdding(false); addButton.current?.focus(); };
  const addLink = async (event: FormEvent) => {
    event.preventDefault();
    if (await m.addOnline(onlineUrl, onlineTitle)) {
      setOnlineUrl(""); setOnlineTitle(""); closeAdd();
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
          <div><span className="eyebrow">ĐANG PHÁT</span><strong>{track?.title ?? "Chưa chọn bài"}</strong><small>{track ? `${musicSourceLabel(track.source)}${track.isPlaylist ? " · Danh sách phát" : ""}` : "Chọn bài nhạc từ danh sách phát"}</small></div>
          <label className="music-island-toggle"><input type="checkbox" checked={!m.hidden} onChange={event => m.setHidden(!event.target.checked)}/>Hiện trình phát thu nhỏ</label>
        </div>
        <div className="music-player-art" aria-hidden="true">{track && !localTrack ? <Radio size={36}/> : <Disc3 size={42}/>}</div>
        {localTrack && <div className="music-progress"><input aria-label="Vị trí phát" type="range" min={0} max={m.duration || 1} step=".1" disabled={!m.duration} value={Math.min(m.time, m.duration || 1)} onChange={event => m.seek(Number(event.target.value))}/><div><span>{clock(m.time)}</span><span>{clock(m.duration)}</span></div></div>}
        {track?.url && <a className="music-source-link" href={track.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Mở nguồn nhạc</a>}
        <Controls/><PlaybackOptions/>
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
            : <form className="music-link-form" onSubmit={addLink}><label>Liên kết nhạc<input type="url" required value={onlineUrl} onChange={event => setOnlineUrl(event.target.value)} placeholder="YouTube, Spotify hoặc SoundCloud"/></label><label>Tên hiển thị (tùy chọn)<input value={onlineTitle} onChange={event => setOnlineTitle(event.target.value)} placeholder={parsed?.title ?? "Nhập tên bài nhạc"}/></label><button className="primary-button" disabled={m.busy || !onlineUrl.trim()}><Link2 size={16}/>{m.busy ? "Đang lưu…" : "Thêm vào danh sách"}</button></form>}
          {m.error && <p className="form-error" role="alert">{m.error}</p>}
        </div>}
        {!m.tracks.length ? <div className="music-empty"><ListMusic size={26}/><strong>Danh sách phát đang trống</strong><span>Thêm nhạc từ thiết bị hoặc từ một liên kết để bắt đầu.</span></div> : <ol className="music-playlist">{m.tracks.map(track => {
          const selected = m.current === track.id, playing = selected && m.playing;
          return <li key={track.id} className={selected ? "selected" : ""} aria-current={selected ? "true" : undefined}>
            <button type="button" className="music-play-button" aria-label={`${playing ? "Tạm dừng" : "Phát"} ${track.title}`} onClick={() => playing ? m.pause() : m.play(track.id)}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button>
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
