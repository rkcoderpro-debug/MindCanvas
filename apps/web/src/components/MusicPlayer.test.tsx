// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { MusicIsland, MusicPage, MusicProvider } from './MusicPlayer';
import { musicStore } from '../lib/musicStorage';
import type { getYouTube } from '../lib/youtubeIframe';
vi.mock('../lib/musicStorage', async importOriginal => ({ ...await importOriginal<object>(), musicStore: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('plays only on request, survives leaving the music tab, and stops on account unmount', async () => {
  vi.mocked(musicStore).mockResolvedValue([{ id: 'one', owner: 'user', title: 'Study', blob: new Blob(['audio']) }]);
  const audio = { volume: 0, preload: '', src: '', onplay: null as null | (() => void), onpause: null as null | (() => void), play: vi.fn(async () => { audio.onplay?.(); }), pause: vi.fn(() => { audio.onpause?.(); }), removeAttribute: vi.fn(), load: vi.fn() };
  vi.stubGlobal('Audio', vi.fn(function () { return audio; }));
  vi.stubGlobal('AudioContext', undefined);
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'), root = createRoot(host);
  await act(async () => root.render(<MusicProvider owner="user"><MusicPage/></MusicProvider>));
  expect(audio.play).not.toHaveBeenCalled();
  await act(async () => (host.querySelector('[aria-label="Phát Study"]') as HTMLButtonElement).click());
  expect(audio.play).toHaveBeenCalledOnce();
  const pauses = audio.pause.mock.calls.length;
  await act(async () => root.render(<MusicProvider owner="user"><div>Canvas</div></MusicProvider>));
  expect(audio.pause).toHaveBeenCalledTimes(pauses);
  await act(async () => root.render(<MusicProvider owner="user"><MusicPage/></MusicProvider>));
  expect(host.querySelector('[aria-label="Tạm dừng"]')).toBeTruthy();
  await act(async () => root.unmount());
  expect(audio.pause).toHaveBeenCalledTimes(pauses + 1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
});

it('adds a link from the same control as device files and leaves playback paused', async () => {
  vi.mocked(musicStore).mockClear().mockResolvedValue([]);
  const audio = { volume: 0, preload: '', pause: vi.fn(), play: vi.fn() };
  vi.stubGlobal('Audio', vi.fn(function () { return audio; }));
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
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'https://www.youtube.com/watch?v=abcdefghijk');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => host.querySelector<HTMLFormElement>('.music-link-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(musicStore).toHaveBeenCalledWith('user', 'put', expect.objectContaining({ source: 'youtube' }));
  expect(host.querySelectorAll('.music-playlist li')).toHaveLength(1);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(audio.play).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});

it('keeps the YouTube timeline and playback when minimizing video or leaving the music page', async () => {
  type Events = ConstructorParameters<Awaited<ReturnType<typeof getYouTube>>['Player']>[1]['events'];
  let events!: Events;
  const player = {
    playVideo: vi.fn(), pauseVideo: vi.fn(), destroy: vi.fn(),
    getDuration: vi.fn(() => 195), getCurrentTime: vi.fn(() => 31), seekTo: vi.fn(), setVolume: vi.fn(),
    getPlaylist: vi.fn(), getPlaylistIndex: vi.fn(), playVideoAt: vi.fn(),
  };
  const create = vi.fn(function (_frame: HTMLIFrameElement, config: { events: Events }) { events = config.events; return player; });
  const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('music-youtube-slot') ? new DOMRect(24, 75, 348, 250) : new DOMRect();
  });
  vi.stubGlobal('YT', { Player: create });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
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
    expect(create).toHaveBeenCalledOnce();
    await act(async () => host.querySelector<HTMLButtonElement>('.music-island-open')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('.music-island-details [aria-label="Tạm dừng"]')!.click());
    expect(player.pauseVideo).toHaveBeenCalled();
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('.music-island-footer button')].find(button => button.textContent === 'Dừng YouTube')!.click());
    expect(player.destroy).toHaveBeenCalledOnce();
    expect(document.body.querySelector('.music-youtube-surface')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); measure.mockRestore(); }
});
