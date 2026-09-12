const DATABASE = "mindcanvas-offline-v1";
const STORE = "project-caches";

type CacheRecord = { owner: string; projects: unknown[]; writtenAt: number };

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "owner" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline storage."));
    request.onblocked = () => reject(new Error("Offline storage upgrade was blocked."));
  });
}

export async function readOfflineProjectCache(owner: string): Promise<unknown[] | null> {
  const database = await openDatabase();
  if (!database) return null;
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).get(owner);
      request.onsuccess = () => resolve(Array.isArray((request.result as CacheRecord | undefined)?.projects) ? (request.result as CacheRecord).projects : null);
      request.onerror = () => reject(request.error ?? new Error("Could not read offline projects."));
    });
  } finally { database.close(); }
}

export async function writeOfflineProjectCache(owner: string, projects: unknown[]): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put({ owner, projects, writtenAt: Date.now() } satisfies CacheRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not store offline projects."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline project storage was aborted."));
    });
  } finally { database.close(); }
}
