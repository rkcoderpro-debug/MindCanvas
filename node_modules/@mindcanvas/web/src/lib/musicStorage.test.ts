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
  it('keeps YouTube Music playlists and removes automatically generated mixes from individual songs', () => {
    const playlist = parseMusicLink('https://music.youtube.com/playlist?list=PLTestPlaylist&si=example');
    expect(playlist).toMatchObject({ source: 'youtube-music', isPlaylist: true, title: 'Danh sách YouTube Music' });
    const embed = new URL(playlist!.embedUrl!);
    expect(embed.pathname).toBe('/embed');
    expect(embed.searchParams.get('listType')).toBe('playlist');
    expect(embed.searchParams.get('list')).toBe('PLTestPlaylist');

    const album = parseMusicLink('https://music.youtube.com/watch?v=abcdefghijk&list=OLAK5uy_album');
    expect(album).toMatchObject({ isPlaylist: true, youtubeVideoId: 'abcdefghijk' });
    expect(album?.embedUrl).toContain('list=OLAK5uy_album');
    expect(parseMusicLink('https://music.youtube.com/watch?v=abcdefghijk&list=RDCLAK5uy_curated')?.isPlaylist).toBe(true);
    const radio = parseMusicLink('https://music.youtube.com/watch?v=abcdefghijk&list=RDAMVMabcdefghijk');
    expect(radio).toMatchObject({ isPlaylist: false, youtubeVideoId: 'abcdefghijk' });
    expect(radio?.embedUrl).not.toContain('list=');
  });

  it('accepts supported provider links and rejects arbitrary URLs', () => {
    expect(parseMusicLink('https://youtu.be/abc123')?.embedUrl).toContain('youtube.com/embed/abc123');
    expect(parseMusicLink('https://music.youtube.com/watch?v=abc123')?.source).toBe('youtube-music');
    expect(parseMusicLink('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')?.isPlaylist).toBe(true);
    expect(parseMusicLink('https://soundcloud.com/artist/sets/study')?.source).toBe('soundcloud');
    expect(parseMusicLink('https://example.com/song')).toBeNull();
  });
});
