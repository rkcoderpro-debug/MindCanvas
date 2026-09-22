import type { DocxDocument } from "./docxModel";

type DraftRecord = {
  key: string;
  owner: string;
  documentId: string;
  baseUpdatedAt: string;
  savedAt: string;
  model: DocxDocument;
};

const DB_NAME = "mindcanvas-docx-drafts-v1";
const DB_VERSION = 1;
const STORE = "drafts";

function draftKey(owner: string | null, documentId: string) {
  return `${owner ?? "guest"}:${documentId}`;
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB chưa sẵn sàng."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("owner", "owner", { unique: false });
        store.createIndex("documentId", "documentId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Không thể mở kho nháp DOCX."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Không thể ghi nháp DOCX."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Giao dịch nháp DOCX bị hủy."));
  });
}

export async function readDocxDraft(owner: string | null, documentId: string): Promise<DraftRecord | null> {
  let db: IDBDatabase;
  try { db = await openDb(); } catch { return null; }
  try {
    const request = db.transaction(STORE).objectStore(STORE).get(draftKey(owner, documentId));
    return await new Promise<DraftRecord | null>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as DraftRecord | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Không thể đọc nháp DOCX."));
    });
  } finally { db.close(); }
}

export async function writeDocxDraft(owner: string | null, documentId: string, baseUpdatedAt: string, model: DocxDocument): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key: draftKey(owner, documentId), owner: owner ?? "guest", documentId, baseUpdatedAt, savedAt: new Date().toISOString(), model } satisfies DraftRecord);
    await transactionDone(tx);
  } finally { db.close(); }
}

export async function deleteDocxDraft(owner: string | null, documentId: string): Promise<void> {
  let db: IDBDatabase;
  try { db = await openDb(); } catch { return; }
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(draftKey(owner, documentId));
    await transactionDone(tx);
  } finally { db.close(); }
}

export type { DraftRecord };
