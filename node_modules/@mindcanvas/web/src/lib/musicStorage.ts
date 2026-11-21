export type MusicSource = "local" | "youtube" | "youtube-music" | "spotify" | "soundcloud";
export type MusicTrack = {
  id: string;
  owner: string;
  title: string;
  source?: MusicSource;
  url?: string;
  embedUrl?: string;
  isPlaylist?: boolean;
  blob?: Blob;
};

export type ParsedMusicLink = Pick<MusicTrack, "source" | "url" | "embedUrl" | "isPlaylist"> & { title: string };

/**
 * Accept only provider URLs that can be embedded by the official player.
 * We keep the original URL for the user and derive the provider embed URL
 * without downloading or proxying third-party audio.
 */
export function parseMusicLink(raw: string): ParsedMusicLink | null {
  let parsed: URL;
  try { parsed = new URL(raw.trim()); } catch { return null; }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const original = parsed.toString();
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtu.be") {
    const source: MusicSource = host === "music.youtube.com" ? "youtube-music" : "youtube";
    const video = host === "youtu.be"
      ? parsed.pathname.split("/").filter(Boolean)[0]
      : parsed.searchParams.get("v") || parsed.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/)?.[1];
    const playlist = parsed.searchParams.get("list") || undefined;
    if (!video && !playlist) return null;
    const params = new URLSearchParams({ autoplay: "1", playsinline: "1", rel: "0", enablejsapi: "1" });
    if (playlist) params.set("list", playlist);
    if (video) return { source, url: original, embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(video)}?${params.toString()}`, isPlaylist: Boolean(playlist), title: source === "youtube-music" ? "YouTube Music" : "YouTube" };
    params.set("listType", "playlist");
    return { source, url: original, embedUrl: `https://www.youtube.com/embed?${params.toString()}`, isPlaylist: true, title: source === "youtube-music" ? "YouTube Music playlist" : "YouTube playlist" };
  }
  if (host === "open.spotify.com") {
    const match = parsed.pathname.match(/^\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)$/);
    if (!match) return null;
    const [, type, id] = match;
    return { source: "spotify", url: original, embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator`, isPlaylist: type === "playlist" || type === "album", title: `Spotify ${type}` };
  }
  if (host === "soundcloud.com") {
    const path = parsed.pathname.split("/").filter(Boolean);
    if (path.length < 2 || path[0] === "discover") return null;
    const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(original)}&color=%231d6fa5&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`;
    return { source: "soundcloud", url: original, embedUrl, isPlaylist: path.includes("sets"), title: path[path.length - 1].replace(/[-_]+/g, " ") || "SoundCloud" };
  }
  return null;
}

export function musicSourceLabel(source: MusicSource | undefined): string {
  return source === "youtube-music" ? "YouTube Music" : source === "youtube" ? "YouTube" : source === "spotify" ? "Spotify" : source === "soundcloud" ? "SoundCloud" : "Thiết bị";
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('Trình duyệt không hỗ trợ lưu nhạc.'));
    const request = indexedDB.open('mindcanvas-music-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('tracks', { keyPath: 'id' }).createIndex('owner', 'owner');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function musicStore(owner: string, operation: 'list' | 'put' | 'delete', track?: MusicTrack): Promise<MusicTrack[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', operation === 'list' ? 'readonly' : 'readwrite');
    const store = tx.objectStore('tracks');
    const request = operation === 'list' ? store.index('owner').getAll(owner) : operation === 'put' ? store.put(track!) : store.delete(track!.id);
    tx.oncomplete = () => { db.close(); resolve(operation === 'list' ? request.result as MusicTrack[] : []); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Không lưu được nhạc. Kiểm tra dung lượng trình duyệt.')); };
  });
}
export function nextMusicId(ids: string[], current: string | null, direction: number, shuffle: boolean, random = Math.random): string | null {
  if (!ids.length) return null;
  const others = ids.filter(id => id !== current);
  if (shuffle && others.length) return others[Math.floor(random() * others.length)];
  const index = current === null ? (direction >= 0 ? -1 : 0) : Math.max(0, ids.indexOf(current));
  return ids[(index + direction + ids.length) % ids.length];
}
