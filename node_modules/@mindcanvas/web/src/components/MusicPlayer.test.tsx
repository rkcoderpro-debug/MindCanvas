// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { MusicPage, MusicProvider } from './MusicPlayer';
import { musicStore } from '../lib/musicStorage';
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
