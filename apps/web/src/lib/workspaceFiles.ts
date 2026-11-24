import { MAX_DOCUMENT_BYTES } from "./documentStore";
import { getCurrentSession, requestTimeoutSignal, supabase } from "./supabase";

export type WorkspaceFile = {
  id: string;
  name: string;
  size: number;
  folderId: string | null;
  createdAt: string;
  ready: boolean;
};
type FileRow = { id: string; name: string; size_bytes: number; folder_id: string | null; created_at: string; ready: boolean };
const table = "workspace_files", bucket = "workspace-files";
const columns = "id,name,size_bytes,folder_id,created_at,ready";
const fromRow = (row: FileRow): WorkspaceFile => ({
  id: row.id, name: row.name, size: row.size_bytes, folderId: row.folder_id, createdAt: row.created_at, ready: row.ready,
});
const objectKey = (owner: string, id: string) => `${owner}/${id}`;
const safeBlob = (blob: Blob) => blob.slice(0, blob.size, "application/octet-stream");
const localDb = "mindcanvas-workspace-files";

async function cloud(owner: string) {
  if (!supabase || (await getCurrentSession())?.user.id !== owner) throw new Error("WORKSPACE_FILE_SESSION");
  return supabase;
}

function storeRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function local<T>(mode: IDBTransactionMode, action: (rows: IDBObjectStore, bytes: IDBObjectStore) => Promise<T>): Promise<T> {
  const request = indexedDB.open(localDb, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore("rows", { keyPath: "id" });
    request.result.createObjectStore("bytes");
  };
  const db = await storeRequest(request);
  try {
    const tx = db.transaction(["rows","bytes"], mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("WORKSPACE_FILE_STORAGE"));
      tx.onerror = () => reject(tx.error ?? new Error("WORKSPACE_FILE_STORAGE"));
    });
    const [value] = await Promise.all([action(tx.objectStore("rows"), tx.objectStore("bytes")), done]);
    return value;
  } finally { db.close(); }
}
export async function listWorkspaceFiles(owner: string | null): Promise<WorkspaceFile[]> {
  if (!owner) return (await local("readonly", rows => storeRequest<WorkspaceFile[]>(rows.getAll())))
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const client = await cloud(owner);
  const result: WorkspaceFile[] = [];
  const limit = 200;
  for (let start = 0;; start += limit) {
    const { data, error } = await client.from(table).select(columns).eq("user_id", owner).is("canvas_id",null)
      .order("created_at", { ascending: false }).order("id").range(start, start+limit-1).abortSignal(requestTimeoutSignal(20000));
    if (error) throw error;
    result.push(...(data ?? []).map(fromRow));
    if (!data || data.length < limit) return result;
  }
}

export async function addWorkspaceFile(owner: string | null, folderId: string | null, file: File): Promise<WorkspaceFile> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("WORKSPACE_FILE_SIZE");
  const name = file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").trim();
  if (!name || Array.from(name).length > 255) throw new Error("WORKSPACE_FILE_NAME");
  const entry = { id: crypto.randomUUID(), name, size: file.size, folderId, createdAt: new Date().toISOString(), ready: true };
  const blob = safeBlob(file);
  if (!owner) {
    await local("readwrite", async (rows, bytes) => {
      await Promise.all([storeRequest(rows.add(entry)), storeRequest(bytes.add(blob,entry.id))]);
    });
    return entry;
  }
  const client = await cloud(owner);
  const { data: row, error } = await client.from(table)
    .insert({ id: entry.id, user_id: owner, name, size_bytes: file.size, folder_id: folderId })
    .select(columns).abortSignal(requestTimeoutSignal(20000)).single();
  if (error) throw error;
  try {
    const stored = await client.storage.from(bucket).upload(objectKey(owner, entry.id), blob, {
      contentType: "application/octet-stream", upsert: false,
    });
    if (stored.error) throw stored.error;
    const finish = await client.rpc("finish_workspace_file", { p_id: entry.id }).abortSignal(requestTimeoutSignal(20000));
    if (finish.error || !finish.data) throw finish.error ?? new Error("WORKSPACE_FILE_INCOMPLETE");
    return { ...fromRow(row), ready: true };
  } catch (cause) {
    // Reconcile if a response was lost after Storage accepted the bytes.
    // A remaining incomplete row can be removed from the folder and retried.
    try {
      const recovered = await client.rpc("finish_workspace_file", { p_id: entry.id }).abortSignal(requestTimeoutSignal(10000));
      if (!recovered.error && recovered.data === true) return { ...fromRow(row), ready: true };
      await deleteWorkspaceFile(owner,entry.id);
    } catch { /* keep the row so cleanup can be retried from the file list */ }
    throw cause;
  }
}
export async function readWorkspaceFile(owner: string | null, id: string): Promise<Blob> {
  if (!owner) {
    const blob = await local("readonly", (_rows,bytes) => storeRequest<Blob | undefined>(bytes.get(id)));
    if (!blob) throw new Error("WORKSPACE_FILE_MISSING");
    return blob;
  }
  const client = await cloud(owner);
  const row = await client.from(table).select("object_id").eq("id",id).eq("user_id",owner).single();
  if (row.error) throw row.error;
  const { data, error } = await client.storage.from(bucket).download(objectKey(owner,row.data?.object_id ?? id));
  if (error) throw error;
  return safeBlob(data);
}

export async function moveWorkspaceFile(owner: string | null, id: string, folderId: string | null) {
  if (!owner) return local("readwrite", async rows => {
    const row = await storeRequest<WorkspaceFile | undefined>(rows.get(id));
    if (!row) throw new Error("WORKSPACE_FILE_MISSING");
    const updated = { ...row, folderId };
    await storeRequest(rows.put(updated));
    return updated;
  });
  const client = await cloud(owner);
  const { data, error } = await client.from(table).update({ folder_id: folderId }).eq("user_id", owner).eq("id", id)
    .select(columns).abortSignal(requestTimeoutSignal(20000)).single();
  if (error) throw error;
  return fromRow(data);
}
export async function deleteWorkspaceFile(owner: string | null, id: string) {
  if (!owner) return local("readwrite", async (rows, bytes) => {
    await Promise.all([storeRequest(bytes.delete(id)), storeRequest(rows.delete(id))]);
  });
  const client = await cloud(owner);
  const row = await client.from(table).select("object_id").eq("id",id).eq("user_id",owner).maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) return;
  const { error: storageError } = await client.storage.from(bucket).remove([objectKey(owner,row.data.object_id ?? id)]);
  if (storageError) throw storageError;
  const { error } = await client.from(table).delete().eq("user_id", owner).eq("id", id).abortSignal(requestTimeoutSignal(20000));
  if (error) throw error;
}

export function downloadWorkspaceBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(safeBlob(blob));
  const link = document.createElement("a");
  link.href = href; link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href),30_000);
}
