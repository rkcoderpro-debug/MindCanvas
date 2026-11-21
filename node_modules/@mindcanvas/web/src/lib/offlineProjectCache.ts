const DATABASE = "mindcanvas-offline-v1";
const STORE = "project-caches";
// Keep a separate database so an older open PWA can still read its v1 drafts.
const VERSION_DATABASE = "mindcanvas-versions-v1";
const VERSION_STORE = "versions";
type VersionRecord = { key: string; versions: unknown[] };

type CacheRecord = { owner: string; projects: unknown[]; writtenAt: number };

function openDatabase(name = DATABASE, store = STORE, keyPath = "owner"): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
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
  if (!database) throw new Error("Trình duyệt không hỗ trợ lưu bản nháp IndexedDB.");
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


export async function readOfflineProjectVersions(key: string): Promise<unknown[]> {
  const database = await openDatabase(VERSION_DATABASE, VERSION_STORE, "key");
  if (!database) return [];
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(VERSION_STORE, "readonly").objectStore(VERSION_STORE).get(key);
      request.onsuccess = () => resolve((request.result as VersionRecord | undefined)?.versions ?? []);
      request.onerror = () => reject(request.error ?? new Error("Could not read recovery versions."));
    });
  } finally { database.close(); }
}

export async function updateOfflineProjectVersions(key: string, update: (versions: unknown[]) => unknown[]): Promise<void> {
  const database = await openDatabase(VERSION_DATABASE, VERSION_STORE, "key");
  if (!database) throw new Error("Could not open storage for recovery versions.");
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(VERSION_STORE, "readwrite");
      const store = transaction.objectStore(VERSION_STORE);
      const request = store.get(key);
      let updateError: unknown;
      request.onsuccess = () => {
        try {
          const versions = update((request.result as VersionRecord | undefined)?.versions ?? []);
          store.put({ key, versions } satisfies VersionRecord);
        } catch (error) {
          updateError = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(updateError ?? transaction.error ?? new Error("Could not store recovery versions."));
    });
  } finally { database.close(); }
}
