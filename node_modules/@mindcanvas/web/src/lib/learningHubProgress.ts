import { applyHubEvent, cleanHubProgress, emptyHubProgress, type HubProgress, type LearningHub } from "../../../../packages/shared/src/learningHub.js";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("mindcanvas-learning-hub-progress-v1", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("progress");
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
const key = (owner: string | null, revision: string) => JSON.stringify([owner, revision]);
export async function loadHubProgress(owner: string | null, revision: string, hub: LearningHub): Promise<HubProgress> {
  const db = await open();
  try { return await new Promise((resolve, reject) => { const req = db.transaction("progress").objectStore("progress").get(key(owner, revision)); req.onsuccess = () => resolve(req.result ? cleanHubProgress(hub, req.result) : emptyHubProgress()); req.onerror = () => reject(req.error); }); }
  finally { db.close(); }
}
/** Merge in a transaction so two open viewers cannot overwrite each other's events. */
export async function saveHubProgressEvent(owner: string | null, revision: string, hub: LearningHub, event: unknown): Promise<HubProgress> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("progress", "readwrite"), store = tx.objectStore("progress"), req = store.get(key(owner, revision));
      let next = emptyHubProgress();
      req.onsuccess = () => { next = applyHubEvent(hub, cleanHubProgress(hub, req.result), event); store.put(next, key(owner, revision)); };
      tx.oncomplete = () => resolve(next); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
