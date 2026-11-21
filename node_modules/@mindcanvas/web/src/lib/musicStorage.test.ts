import { describe, expect, it } from 'vitest';
import { nextMusicId, parseMusicLink } from './musicStorage';
describe('music playlist navigation', () => {
  it('handles empty playlists and wraps next/previous', () => {
    expect(nextMusicId([], null, 1, false)).toBeNull();
    expect(nextMusicId(['a','b','c'], 'c', 1, false)).toBe('a');
    expect(nextMusicId(['a','b','c'], 'a', -1, false)).toBe('c');
    expect(nextMusicId(['a','b','c'], null, 1, false)).toBe('a');
  });
  it('shuffle avoids the current song when another song exists', () => {
    expect(nextMusicId(['a','b','c'], 'b', 1, true, () => .99)).toBe('c');
    expect(nextMusicId(['a'], 'a', 1, true)).toBe('a');
  });
  it('accepts supported provider links and rejects arbitrary URLs', () => {
    expect(parseMusicLink('https://youtu.be/abc123')?.embedUrl).toContain('youtube.com/embed/abc123');
    expect(parseMusicLink('https://music.youtube.com/watch?v=abc123')?.source).toBe('youtube-music');
    expect(parseMusicLink('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')?.isPlaylist).toBe(true);
    expect(parseMusicLink('https://soundcloud.com/artist/sets/study')?.source).toBe('soundcloud');
    expect(parseMusicLink('https://example.com/song')).toBeNull();
  });
});
