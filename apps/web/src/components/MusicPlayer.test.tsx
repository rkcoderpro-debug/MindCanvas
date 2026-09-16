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
