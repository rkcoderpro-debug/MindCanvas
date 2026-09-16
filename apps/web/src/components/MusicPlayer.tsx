import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Music2, Pause, Play, SkipBack, SkipForward, X, ChevronDown, Trash2, Upload } from 'lucide-react';
import { musicStore, nextMusicId, type MusicTrack } from '../lib/musicStorage';

type Music = {
  tracks: MusicTrack[]; current: string | null; playing: boolean; time: number; duration: number; volume: number;
  repeat: 'off' | 'all' | 'one'; shuffle: boolean; hidden: boolean; error: string; busy: boolean;
  analyser: AnalyserNode | null; play: (id?: string) => void; pause: () => void; next: (direction: number) => void;
  seek: (time: number) => void; setVolume: (value: number) => void; setRepeat: (value: 'off' | 'all' | 'one') => void;
  setShuffle: (value: boolean) => void; setHidden: (value: boolean) => void;
  add: (files: File[]) => Promise<void>; remove: (track: MusicTrack) => Promise<void>; rename: (track: MusicTrack, title: string) => Promise<void>;
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
  const pause = () => { generation.current++; audioRef.current?.pause(); };
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
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      for (const file of files) {
        if ((!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(file.name)) || file.size > 50 * 1024 * 1024 || !file.size) throw new Error('Chọn file âm thanh không rỗng, tối đa 50 MB mỗi bài.');
        const track = { id: crypto.randomUUID(), owner: scope, title: file.name.replace(/\.[^.]+$/, ''), blob: file };
        await musicStore(scope, 'put', track);
        if (alive.current) setTracks(old => [...old, track]);
      }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Không lưu được nhạc; dung lượng thiết bị có thể đã đầy.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const remove = async (track: MusicTrack) => {
    try {
      await musicStore(scope, 'delete', track);
      if (track.id === loadedId.current) { pause(); audioRef.current?.removeAttribute('src'); audioRef.current?.load(); URL.revokeObjectURL(urlRef.current); urlRef.current = ''; loadedId.current = null; setCurrent(null); setTime(0); setDuration(0); }
      setTracks(old => old.filter(t => t.id !== track.id));
    } catch { setError('Không xóa được bài hát. Hãy thử lại.'); }
  };
  const rename = async (track: MusicTrack, title: string) => {
    if (!title.trim()) return;
    const next = { ...track, title: title.trim().slice(0, 160) };
    try { await musicStore(scope, 'put', next); setTracks(old => old.map(t => t.id === next.id ? next : t)); }
    catch { setError('Không lưu được tên bài hát.'); }
  };
  const value: Music = { tracks, current, playing, time, duration, volume, repeat, shuffle, hidden, error, busy, analyser, play, pause, next, add, remove, rename, setRepeat, setShuffle, setHidden,
    seek: value => { if (audioRef.current && duration > 0) { audioRef.current.currentTime = Math.max(0, Math.min(duration, value)); setTime(audioRef.current.currentTime); } },
    setVolume: value => { changeVolume(value); if (audioRef.current) audioRef.current.volume = value; } };
  return <Context.Provider value={value}>{children}</Context.Provider>;
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
        for (let i = 0; i < 20; i++) { const h = playing && analyser && !reduced ? Math.max(2, data[i * 2] / 255 * 30) : 2; ctx.fillStyle = '#91e5cf'; ctx.fillRect(i * 6, (32 - h) / 2, 3, h); }
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
  return <div className="music-controls"><button aria-label="Bài trước" onClick={() => m.next(-1)}><SkipBack size={19}/></button><button aria-label={m.playing ? 'Tạm dừng' : 'Phát'} disabled={!m.tracks.length} onClick={() => m.playing ? m.pause() : m.play()}>{m.playing ? <Pause size={22}/> : <Play size={22}/>}</button><button aria-label="Bài sau" onClick={() => m.next(1)}><SkipForward size={19}/></button></div>;
}
function PlaybackOptions() {
  const m = useMusic(); return <div className="music-options"><label>Âm lượng<input aria-label="Âm lượng" type="range" min="0" max="1" step=".01" value={m.volume} onChange={e => m.setVolume(Number(e.target.value))}/></label><label>Lặp<select value={m.repeat} onChange={e => m.setRepeat(e.target.value as Music['repeat'])}><option value="off">Tắt</option><option value="all">Danh sách</option><option value="one">Một bài</option></select></label><label><input type="checkbox" checked={m.shuffle} onChange={e => m.setShuffle(e.target.checked)}/>Ngẫu nhiên</label></div>;
}
export function MusicIsland() {
  const m = useMusic(), [expanded, setExpanded] = useState(false);
  const track = m.tracks.find(t => t.id === m.current);
  if (!track || m.hidden) return null;
  return <aside className={`music-island ${expanded ? 'expanded' : ''}`} aria-label="Đang phát nhạc" onKeyDown={e => { if (e.key === 'Escape') setExpanded(false); }}><div className="music-island-summary"><button className="music-island-open" aria-label="Mở thông tin bài hát" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Visualizer/><ScrollingTitle title={track.title}/></button><button aria-label={m.playing ? 'Tạm dừng' : 'Phát'} onClick={() => m.playing ? m.pause() : m.play()}>{m.playing ? <Pause size={17}/> : <Play size={17}/>}</button></div>{m.error && !expanded && <small role="alert">{m.error}</small>}{expanded && <div className="music-island-details"><strong>{track.title}</strong><input aria-label="Vị trí phát" type="range" min={0} max={m.duration || 1} step=".1" disabled={!m.duration} value={Math.min(m.time, m.duration || 1)} onChange={e => m.seek(Number(e.target.value))}/><small>{clock(m.time)} / {clock(m.duration)}</small><Controls/><PlaybackOptions/>{m.error && <p role="alert">{m.error}</p>}<div className="music-island-footer"><button onClick={() => setExpanded(false)}><ChevronDown size={15}/>Thu gọn</button><button onClick={() => m.setHidden(true)}><X size={15}/>Ẩn thanh</button></div></div>}</aside>;
}
export function MusicPage() {
  const m = useMusic();
  return <section className="music-page"><header><span className="eyebrow">STUDY SOUNDTRACK</span><h2><Music2/>Nhạc học tập</h2><p>Âm nhạc của bạn, đồng hành trong mỗi phiên học.</p></header><label className="music-upload"><Upload size={22}/><strong>{m.busy ? 'Đang lưu…' : 'Thêm nhạc từ thiết bị'}</strong><input aria-label="Thêm file nhạc" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac" multiple disabled={m.busy} onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void m.add(files); }}/><small>Tối đa 50 MB/bài · Lưu trên trình duyệt này, không tải lên cloud. Xóa dữ liệu trình duyệt sẽ xóa thư viện nhạc.</small></label>{m.error && <p className="form-error" role="alert">{m.error}</p>}<Controls/><PlaybackOptions/><label><input type="checkbox" checked={!m.hidden} onChange={e => m.setHidden(!e.target.checked)}/>Hiển thị Dynamic Island khi có bài đang mở</label>{!m.tracks.length ? <p>Thêm bài hát đầu tiên để bắt đầu. Nhạc vẫn phát khi bạn chuyển sang Canvas hoặc các công cụ học.</p> : <ol className="music-playlist">{m.tracks.map(track => <li key={track.id} className={m.current === track.id ? 'selected' : ''}><button aria-label={`Phát ${track.title}`} onClick={() => m.play(track.id)}><Play size={18}/></button><input key={`${track.id}:${track.title}`} aria-label={`Tên bài: ${track.title}`} defaultValue={track.title} maxLength={160} onBlur={e => { if (e.target.value.trim() !== track.title) void m.rename(track, e.target.value); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/><button aria-label={`Xóa ${track.title}`} onClick={() => void m.remove(track)}><Trash2 size={17}/></button></li>)}</ol>}</section>;
}

function ScrollingTitle({ title }: { title: string }) {
  const root = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const measure = () => setOverflow((el.firstElementChild?.scrollWidth ?? 0) > el.clientWidth);
    measure();
    if (!globalThis.ResizeObserver) return;
    const observer = new ResizeObserver(measure); observer.observe(el); return () => observer.disconnect();
  }, [title]);
  return <span ref={root} className={`music-title ${overflow ? 'overflows' : ''}`} title={title}><span>{title}</span></span>;
}
