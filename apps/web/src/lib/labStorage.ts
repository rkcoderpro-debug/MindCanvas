import { cleanLab, FLAPPY_BIRD_STARTER_LAB, LAB_LIMITS, readLabs, type LabProject } from './lab';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('mindcanvas-labs-v2', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('labs'); request.result.createObjectStore('drafts'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Đóng tab MindCanvas cũ rồi thử lại.'));
  });
}
const key = (owner: string | null) => owner || 'guest';
async function access<T>(store: string, owner: string | null, change?: (old: T | undefined) => T): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, change ? 'readwrite' : 'readonly');
    const bucket = tx.objectStore(store);
    const request = bucket.get(key(owner));
    let result: T | undefined;
    request.onsuccess = () => {
      try { result = change ? change(request.result) : request.result; if (change) bucket.put(result, key(owner)); }
      catch (error) { tx.abort(); reject(error); }
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Không thể lưu dữ liệu Lab.')); };
  });
}
async function migrate(owner: string | null) {
  // Keep the old storage intact as a recovery copy. Only commit migration after
  // the entire IndexedDB transaction succeeds, including empty collections.
  if (await access<LabProject[]>('labs', owner) !== undefined) return;
  const raw = localStorage.getItem(`mindcanvas:labs:v1:${key(owner)}`);
  if (raw) { const parsed = JSON.parse(raw); if (!Array.isArray(parsed) || parsed.some(row => !cleanLab(row))) throw new Error("Dữ liệu cũ cần được khôi phục trước khi lưu."); }
  const legacy = readLabs(owner).filter(lab => !lab.systemDemo);
  await access<LabProject[]>('labs', owner, old => old ?? legacy);
}
export async function readStoredLabs(owner: string | null): Promise<LabProject[]> {
  await migrate(owner);
  const rows = await access<LabProject[]>('labs', owner) || [];
  return [FLAPPY_BIRD_STARTER_LAB, ...rows.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))];
}
export async function saveStoredLab(owner: string | null, input: Omit<LabProject, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<LabProject> {
  await migrate(owner);
  const id = !input.id || input.systemDemo ? crypto.randomUUID() : input.id;
  let saved!: LabProject;
  await access<LabProject[]>('labs', owner, (rows = []) => {
    const now = new Date().toISOString();
    saved = { ...input, id, systemDemo: false, createdAt: rows.find(row => row.id === id)?.createdAt || now, updatedAt: now };
    if (!cleanLab(saved)) throw new Error('Dữ liệu Lab không hợp lệ. Nội dung chưa lưu vẫn được giữ.');
    return [saved, ...rows.filter(row => row.id !== id)];
  });
  return saved;
}

/**
 * Add Labs recovered from the user's cloud account without replacing a local
 * copy. A profile can contain edits that have not been uploaded yet, so an
 * automatic cloud refresh must never silently overwrite that work.
 */
export async function mergeStoredLabs(owner: string | null, incoming: unknown[]): Promise<{ added: number; conflicts: number }> {
  await migrate(owner);
  let added = 0;
  let conflicts = 0;
  await access<LabProject[]>('labs', owner, (rows = []) => {
    const current = [...rows];
    for (const raw of incoming) {
      const lab = cleanLab(raw);
      if (!lab || lab.systemDemo || lab.programHtml.length > LAB_LIMITS.maxHtml) continue;
      const existing = current.find(row => row.id === lab.id);
      if (!existing) {
        current.push({ ...lab, systemDemo: false });
        added += 1;
        continue;
      }
      const same = existing.updatedAt === lab.updatedAt && existing.programHtml === lab.programHtml;
      if (!same) conflicts += 1;
    }
    return current;
  });
  return { added, conflicts };
}

export async function deleteStoredLab(owner: string | null, id: string) {
  await migrate(owner);
  await access<LabProject[]>('labs', owner, (rows = []) => rows.filter(row => row.id !== id));
}
export const readLabDraft = <T,>(owner: string | null) => access<T>('drafts', owner);
export const writeLabDraft = <T,>(owner: string | null, draft: T) => access<T>('drafts', owner, () => draft);
