import { describe, expect, it } from 'vitest';
import { nextMusicId } from './musicStorage';
describe('music playlist navigation', () => {
  it('handles empty playlists and wraps next/previous', () => {
    expect(nextMusicId([], null, 1, false)).toBeNull();
    expect(nextMusicId(['a','b','c'], 'c', 1, false)).toBe('a');
    expect(nextMusicId(['a','b','c'], 'a', -1, false)).toBe('c');
  });
  it('shuffle avoids the current song when another song exists', () => {
    expect(nextMusicId(['a','b','c'], 'b', 1, true, () => .99)).toBe('c');
    expect(nextMusicId(['a'], 'a', 1, true)).toBe('a');
  });
});
