// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { MusicIsland, MusicPage, MusicProvider } from './MusicPlayer';
import { musicStore } from '../lib/musicStorage';
import type { getYouTube } from '../lib/youtubeIframe';
vi.mock('../lib/musicStorage', async importOriginal => ({ ...await importOriginal<object>(), musicStore: vi.fn() }));
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('keeps local audio playing across navigation and restores a checkpoint without autoplay', async () => {
  vi.mocked(musicStore).mockResolvedValue([{ id: 'one', owner: 'user', title: 'Study', blob: new Blob(['audio']) }]);
  const audio = {
    volume: 0, preload: '', src: '', currentTime: 0, duration: 180,
    onplaying: null as null | (() => void), onwaiting: null as null | (() => void),
    onloadedmetadata: null as null | (() => void), ontimeupdate: null as null | (() => void),
    onpause: null as null | (() => void),
    play: vi.fn(async () => { audio.onloadedmetadata?.(); audio.onplaying?.(); }),
    pause: vi.fn(() => { audio.onpause?.(); }), removeAttribute: vi.fn(), load: vi.fn(),
  };
  vi.stubGlobal('Audio', vi.fn(function () { return audio; }));
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'), root = createRoot(host);
  const music = () => <MusicProvider owner="user"><MusicIsland/><MusicPage/></MusicProvider>;
  await act(async () => root.render(music()));
  expect(audio.play).not.toHaveBeenCalled();
  await act(async () => (host.querySelector('[aria-label="Phát Study"]') as HTMLButtonElement).click());
  expect(audio.play).toHaveBeenCalledOnce();
  const wave = () => host.querySelector('.music-island .music-wave');
  expect(wave()?.getAttribute('data-playing')).toBe('true');
  await act(async () => audio.onwaiting?.());
  expect(wave()?.getAttribute('data-playing')).toBe('false');
  await act(async () => audio.onplaying?.());
  const pauses = audio.pause.mock.calls.length;
  await act(async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    audio.currentTime = 42; audio.ontimeupdate?.();
  });
  expect(audio.pause).toHaveBeenCalledTimes(pauses);
  expect(wave()?.getAttribute('data-playing')).toBe('true');
  await act(async () => root.render(<MusicProvider owner="user"><div>Canvas</div></MusicProvider>));
  expect(audio.pause).toHaveBeenCalledTimes(pauses);
  await act(async () => root.render(music()));
  expect(host.querySelector('[aria-label="Tạm dừng"]')).toBeTruthy();
  audio.currentTime = 47;
  window.dispatchEvent(new Event('pagehide'));
  expect(audio.pause).toHaveBeenCalledTimes(pauses);
  await act(async () => root.unmount());
  expect(audio.pause).toHaveBeenCalledTimes(pauses + 1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');

  audio.currentTime = 0;
  const reopened = createRoot(host);
  try {
    await act(async () => reopened.render(music()));
    expect(audio.play).toHaveBeenCalledOnce();
    expect(wave()?.getAttribute('data-playing')).toBe('false');
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Tiếp tục Study"]')!.click());
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.currentTime).toBe(47);
    expect(wave()?.getAttribute('data-playing')).toBe('true');
  } finally { await act(async () => reopened.unmount()); }
});

it('prefills and saves the linked YouTube Music title without starting playback', async () => {
  vi.mocked(musicStore).mockClear().mockResolvedValue([]);
  const audio = { volume: 0, preload: '', pause: vi.fn(), play: vi.fn() };
  vi.stubGlobal('Audio', vi.fn(function () { return audio; }));
  const fetchTitle = vi.fn(async (_url: URL) => Response.json({ title: '  Bài hát từ YouTube Music  ' }));
  vi.stubGlobal('fetch', fetchTitle);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'), root = createRoot(host);
  await act(async () => root.render(<MusicProvider owner="user"><MusicPage/></MusicProvider>));
  const toggle = host.querySelector<HTMLButtonElement>('.music-queue-heading .primary-button')!;
  expect(host.querySelector('.music-add-panel')).toBeNull();
  await act(async () => toggle.click());
  expect(host.querySelector('.music-add-panel input[type="file"]')).toBeTruthy();
  await act(async () => host.querySelectorAll<HTMLButtonElement>('.music-add-options button')[1].click());
  const input = host.querySelector<HTMLInputElement>('.music-link-form input[type="url"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'https://music.youtube.com/watch?v=abcdefghijk');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
  expect(host.querySelector<HTMLInputElement>('.music-link-form input[maxlength="160"]')?.value).toBe('Bài hát từ YouTube Music');
  expect(fetchTitle.mock.calls[0]?.[0].searchParams.get('url')).toBe('https://www.youtube.com/watch?v=abcdefghijk');
  await act(async () => host.querySelector<HTMLFormElement>('.music-link-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(musicStore).toHaveBeenCalledWith('user', 'put', expect.objectContaining({ source: 'youtube-music', title: 'Bài hát từ YouTube Music' }));
  expect(fetchTitle).toHaveBeenCalledOnce();
  expect(host.querySelectorAll('.music-playlist li')).toHaveLength(1);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(audio.play).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});

it('keeps the YouTube timeline and playback when minimizing video or leaving the music page', async () => {
  type Events = ConstructorParameters<Awaited<ReturnType<typeof getYouTube>>['Player']>[1]['events'];
  let events!: Events;
  let currentTime = 31;
  const player = {
    playVideo: vi.fn(), pauseVideo: vi.fn(), destroy: vi.fn(),
    getDuration: vi.fn(() => 195), getCurrentTime: vi.fn(() => currentTime),
    seekTo: vi.fn((seconds: number) => { currentTime = seconds; }), setVolume: vi.fn(),
    getPlaylist: vi.fn(), getPlaylistIndex: vi.fn(), playVideoAt: vi.fn(),
  };
  const create = vi.fn(function (_frame: HTMLIFrameElement, config: { events: Events }) { events = config.events; return player; });
  const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('music-youtube-slot') ? new DOMRect(24, 75, 348, 250) : new DOMRect();
  });
  vi.stubGlobal('YT', { Player: create });
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.mocked(musicStore).mockResolvedValue([{ id: 'yt', owner: 'user', title: 'Piano', source: 'youtube-music', url: 'https://music.youtube.com/watch?v=abcdefghijk&list=RDAMVMabcdefghijk' }]);
  const host = document.createElement('div'), root = createRoot(host);
  document.body.append(host);
  const render = (page: boolean) => <MusicProvider owner="user"><MusicIsland/>{page && <MusicPage/>}</MusicProvider>;
  try {
    await act(async () => root.render(render(true)));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Phát Piano"]')!.click());
    const frame = document.body.querySelector<HTMLIFrameElement>('.music-youtube-surface iframe')!;
    expect(frame.src).toContain('/embed/abcdefghijk?');
    expect(frame.src).not.toContain('RDAMVM');
    expect(player.playVideo).not.toHaveBeenCalled();
    await act(async () => { events.onReady({ target: player }); events.onStateChange({ data: 1 }); });
    const mainRange = host.querySelector<HTMLInputElement>('.music-player-card [aria-label="Vị trí phát"]')!;
    expect(mainRange.disabled).toBe(false);
    expect(mainRange.value).toBe('31');
    expect(mainRange.max).toBe('195');
    expect(host.querySelector('.music-page-visual [data-playing="true"]')).toBeTruthy();
    await act(async () => host.querySelector<HTMLButtonElement>('.music-island-open')!.click());
    expect(host.querySelector('.music-island-open')?.getAttribute('aria-expanded')).toBe('true');
    const islandRange = host.querySelector<HTMLInputElement>('.music-island-details [aria-label="Vị trí phát"]')!;
    expect(islandRange.value).toBe('31');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(islandRange, '80');
      islandRange.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(player.seekTo).toHaveBeenCalledWith(80, true);
    expect(mainRange.value).toBe('80');

    const pauses = player.pauseVideo.mock.calls.length;
    await act(async () => document.body.querySelector<HTMLButtonElement>('[aria-label="Thu nhỏ video YouTube"]')!.click());
    expect(document.body.querySelector('.music-youtube-surface[hidden][inert] iframe')).toBe(frame);
    expect(host.querySelector('.music-island-details')).toBeNull();
    expect(player.pauseVideo).toHaveBeenCalledTimes(pauses);
    expect(mainRange.value).toBe('80');
    const restore = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Hiện video YouTube')!;
    await act(async () => restore.click());
    expect(document.body.querySelector('.music-youtube-surface:not([hidden]) iframe')).toBe(frame);

    await act(async () => root.render(render(false)));
    expect(document.body.querySelector('.music-youtube-surface[hidden] iframe')).toBe(frame);
    expect(host.querySelector('.music-island-details')).toBeNull();
    expect(host.querySelector('.music-island [data-playing="true"]')).toBeTruthy();
    expect(player.pauseVideo).toHaveBeenCalledTimes(pauses);
    await act(async () => {
      visibility.mockReturnValue('hidden'); hidden.mockReturnValue(true);
      document.dispatchEvent(new Event('visibilitychange'));
      events.onStateChange({ data: 3 });
    });
    expect(host.querySelector('.music-island [data-playing="false"]')).toBeTruthy();
    await act(async () => events.onStateChange({ data: 1 }));
    expect(host.querySelector('.music-island [data-playing="true"]')).toBeTruthy();
    expect(player.pauseVideo).toHaveBeenCalledTimes(pauses);
    expect(create).toHaveBeenCalledOnce();
    await act(async () => host.querySelector<HTMLButtonElement>('.music-island-open')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('.music-island-details [aria-label="Tạm dừng"]')!.click());
    expect(player.pauseVideo).toHaveBeenCalled();
    const started = player.playVideo.mock.calls.length;
    await act(async () => {
      visibility.mockReturnValue('visible'); hidden.mockReturnValue(false);
      document.dispatchEvent(new Event('visibilitychange'));
      host.querySelector<HTMLElement>('.music-island-menu summary')!.click();
    });
    expect(player.playVideo).toHaveBeenCalledTimes(started);
    expect(host.querySelector('.music-island [data-playing="false"]')).toBeTruthy();
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('.music-island-actions button')].find(button => button.textContent === 'Dừng YouTube')!.click());
    expect(player.destroy).toHaveBeenCalledOnce();
    expect(document.body.querySelector('.music-youtube-surface')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); measure.mockRestore(); }
});

it('starts the linked visualizer only after SoundCloud reports playback', async () => {
  const events = new Map<string, (status: { currentPosition: number }) => void>();
  const player = {
    bind: (event: string, fn: (status: { currentPosition: number }) => void) => events.set(event, fn),
    unbind: (event: string) => events.delete(event),
    play: vi.fn(), pause: vi.fn(), seekTo: vi.fn(), setVolume: vi.fn(),
    getDuration: (callback: (value: number) => void) => callback(180000),
  };
  const ids = ["READY", "PLAY", "PAUSE", "FINISH", "PLAY_PROGRESS", "SEEK", "ERROR"];
  vi.stubGlobal('SC', { Widget: Object.assign(() => player, { Events: Object.fromEntries(ids.map(id => [id, id])) }) });
  vi.mocked(musicStore).mockResolvedValue([{
    id: 'sc', owner: 'user', title: 'Study link', source: 'soundcloud', url: 'https://soundcloud.com/artist/music',
  }]);
  const host = document.createElement('div'), root = createRoot(host);
  const render = (page: boolean) => <MusicProvider owner="user"><MusicIsland/>{page && <MusicPage/>}</MusicProvider>;
  const emit = (id: string, currentPosition = 0) => events.get(id)?.({ currentPosition });
  const playing = () => host.querySelector('.music-island .music-wave')?.getAttribute('data-playing');
  try {
    await act(async () => root.render(render(true)));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Phát Study link"]')!.click());
    await act(async () => emit('READY'));
    expect(player.play).toHaveBeenCalledOnce();
    expect(playing()).toBe('false');
    await act(async () => { emit('PLAY'); emit('PLAY_PROGRESS', 31000); });
    expect(playing()).toBe('true');
    expect(host.querySelector<HTMLInputElement>('.music-progress input')?.value).toBe('31');
    const frame = document.body.querySelector('.music-link-surface iframe');
    expect(frame).toBeTruthy();
    await act(async () => root.render(render(false)));
    expect(document.body.querySelector('.music-link-surface iframe')).toBe(frame);
    expect(player.pause).not.toHaveBeenCalled();
    await act(async () => emit('PAUSE'));
    expect(playing()).toBe('false');
  } finally { await act(async () => root.unmount()); }
});

it('uses the Spotify embed state for play, buffering, timeline, and pause', async () => {
  const events = new Map<string, (event: { data: {
    position: number; duration: number; isPaused: boolean; isBuffering: boolean;
  } }) => void>();
  const controller = {
    addListener: (event: string, handler: NonNullable<ReturnType<typeof events.get>>) => events.set(event, handler),
    play: vi.fn(), pause: vi.fn(), seek: vi.fn(), destroy: vi.fn(),
  };
  vi.mocked(musicStore).mockResolvedValue([{
    id: 'sp', owner: 'user', title: 'Spotify link', source: 'spotify', url: 'https://open.spotify.com/track/example123',
  }]);
  const host = document.createElement('div'), root = createRoot(host);
  const playing = () => host.querySelector('.music-island .music-wave')?.getAttribute('data-playing');
  const emit = (isPaused: boolean, isBuffering: boolean) => events.get('playback_update')?.({
    data: { position: 32000, duration: 180000, isPaused, isBuffering },
  });
  try {
    await act(async () => root.render(<MusicProvider owner="user"><MusicIsland/><MusicPage/></MusicProvider>));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Phát Spotify link"]')!.click());
    const sdk = window as Window & { onSpotifyIframeApiReady?: (api: unknown) => void };
    const create = vi.fn((_host, _options, done) => done(controller));
    await act(async () => sdk.onSpotifyIframeApiReady!({ createController: create }));
    expect(create).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ uri: 'spotify:track:example123' }), expect.any(Function));
    await act(async () => events.get('ready')?.({ data: { position: 0, duration: 0, isPaused: true, isBuffering: false } }));
    expect(controller.play).toHaveBeenCalledOnce();
    await act(async () => emit(false, true));
    expect(playing()).toBe('false');
    await act(async () => emit(false, false));
    expect(playing()).toBe('true');
    expect(host.querySelector<HTMLInputElement>('.music-progress input')?.value).toBe('32');
    await act(async () => emit(true, false));
    expect(playing()).toBe('false');
  } finally { await act(async () => root.unmount()); }
  expect(controller.destroy).toHaveBeenCalledOnce();
});

it('plays a pasted YouTube Music playlist and updates the displayed title when the track changes', async () => {
  type Events = ConstructorParameters<Awaited<ReturnType<typeof getYouTube>>['Player']>[1]['events'];
  let events!: Events;
  let index = 0;
  const player = {
    playVideo: vi.fn(), pauseVideo: vi.fn(), destroy: vi.fn(), setVolume: vi.fn(), seekTo: vi.fn(),
    getDuration: () => 120, getCurrentTime: () => 0,
    getPlaylist: () => ['playlist_001', 'playlist_002'], getPlaylistIndex: () => index,
    playVideoAt: vi.fn((next: number) => { index = next; events.onStateChange({ data: 1 }); }),
  };
  vi.stubGlobal('YT', { Player: function (_frame: HTMLIFrameElement, config: { events: Events }) { events = config.events; return player; } });
  vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
    const video = new URL(url.searchParams.get('url')!).searchParams.get('v');
    return Response.json({ title: video === 'playlist_001' ? 'Giai điệu thứ nhất' : 'Giai điệu thứ hai' });
  }));
  vi.mocked(musicStore).mockClear().mockResolvedValue([]);
  const host = document.createElement('div'), root = createRoot(host);
  document.body.append(host);
  const setUrl = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  try {
    await act(async () => root.render(<MusicProvider owner="user"><MusicIsland/><MusicPage/></MusicProvider>));
    await act(async () => host.querySelector<HTMLButtonElement>('.music-queue-heading button')!.click());
    await act(async () => host.querySelectorAll<HTMLButtonElement>('.music-add-options button')[1].click());
    const input = host.querySelector<HTMLInputElement>('.music-link-form input[type="url"]')!;
    await act(async () => {
      setUrl.call(input, 'https://music.youtube.com/playlist?list=PLExamplePlaylist&si=shared');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = host.querySelector<HTMLButtonElement>('.music-link-form button[value="play"]')!;
    expect(submit).toBeTruthy();
    await act(async () => submit.form!.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: submit })));
    expect(musicStore).toHaveBeenCalledWith('user', 'put', expect.objectContaining({ isPlaylist: true, source: 'youtube-music' }));
    const frame = document.body.querySelector<HTMLIFrameElement>('.music-youtube-surface iframe')!;
    expect(frame).toBeTruthy();
    expect(new URL(frame.src).searchParams.get('list')).toBe('PLExamplePlaylist');
    await act(async () => { events.onReady({ target: player }); events.onStateChange({ data: 1 }); });
    expect(player.playVideo).toHaveBeenCalledOnce();
    expect(host.querySelector('.music-player-card-heading strong')?.textContent).toBe('Giai điệu thứ nhất');
    await act(async () => host.querySelector<HTMLButtonElement>('.music-island-open')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('.music-island-details [aria-label="Bài sau"]')!.click());
    expect(player.playVideoAt).toHaveBeenCalledWith(1);
    expect(host.querySelector('.music-island .music-title')?.textContent).toBe('Giai điệu thứ hai');
    expect(document.body.querySelector('.music-youtube-surface iframe')).toBe(frame);
    await act(async () => host.querySelector<HTMLButtonElement>('.music-island-details [aria-label="Bài trước"]')!.click());
    expect(player.playVideoAt).toHaveBeenLastCalledWith(0);
    await act(async () => {
      events.onStateChange({ data: 0 });
      index = 1;
      events.onStateChange({ data: 1 });
    });
    expect(host.querySelector('.music-island .music-title')?.textContent).toBe('Giai điệu thứ hai');
    expect(host.querySelector('.music-island [data-playing="true"]')).toBeTruthy();
    expect(player.pauseVideo).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it.each([
  { manual: 'Tên tôi đặt', saved: 'Tên tôi đặt', requests: 0 },
  { manual: '', saved: 'YouTube Music', requests: 1 },
])('saves $saved when a custom name is present or metadata is unavailable', async ({ manual, saved, requests }) => {
  vi.mocked(musicStore).mockClear().mockResolvedValue([]);
  const fetchTitle = vi.fn(async () => new Response('', { status: 404 }));
  vi.stubGlobal('fetch', fetchTitle);
  const host = document.createElement('div'), root = createRoot(host);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  const inputValue = (selector: string, value: string) => {
    const input = host.querySelector<HTMLInputElement>(selector)!;
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  try {
    await act(async () => root.render(<MusicProvider owner="user"><MusicPage/></MusicProvider>));
    await act(async () => host.querySelector<HTMLButtonElement>('.music-queue-heading button')!.click());
    await act(async () => host.querySelectorAll<HTMLButtonElement>('.music-add-options button')[1].click());
    await act(async () => inputValue('.music-link-form input[type="url"]', 'https://music.youtube.com/watch?v=missing_123'));
    if (manual) await act(async () => inputValue('.music-link-form input[maxlength="160"]', manual));
    await act(async () => host.querySelector('form')!.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true })));
    expect(musicStore).toHaveBeenCalledWith('user', 'put', expect.objectContaining({ title: saved }));
    expect(fetchTitle).toHaveBeenCalledTimes(requests);
  } finally { await act(async () => root.unmount()); }
});
