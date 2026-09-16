export type MusicTrack = { id: string; owner: string; title: string; blob: Blob };
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
  return ids[(Math.max(0, ids.indexOf(current ?? '')) + direction + ids.length) % ids.length];
}
