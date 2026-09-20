export type DocumentKind = "pdf" | "docx" | "pptx" | "xlsx";
export type UploadedDocument = {
  id: string;
  owner: string;
  name: string;
  mimeType: string;
  kind: DocumentKind;
  size: number;
  dataUrl: string;
  folderId: string | null;
  updatedAt: string;
};

export const DOCUMENT_ACCEPT = ".pdf,.docx,.pptx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MAX_DOCUMENT_BYTES = 40 * 1024 * 1024;
const DB_NAME = "mindcanvas-documents-v1";
const DB_VERSION = 1;
const STORE = "documents";

export function documentKindFor(name: string, mimeType = ""): DocumentKind | null {
  const lower = name.toLocaleLowerCase();
  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (/wordprocessingml\.document|msword/.test(mimeType) || lower.endsWith(".docx")) return "docx";
  if (/presentationml\.presentation|powerpoint/.test(mimeType) || lower.endsWith(".pptx")) return "pptx";
  if (/spreadsheetml\.sheet|excel/.test(mimeType) || lower.endsWith(".xlsx")) return "xlsx";
  return null;
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Không thể đọc tài liệu."));
    reader.onerror = () => reject(reader.error ?? new Error("Không thể đọc tài liệu."));
    reader.readAsDataURL(file);
  });
}

function request<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Không thể truy cập kho tài liệu."));
  });
}
function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Trình duyệt chưa cho phép IndexedDB."));
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const database = open.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("owner", "owner", { unique: false });
        store.createIndex("ownerUpdated", ["owner", "updatedAt"], { unique: false });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("Không thể mở kho tài liệu."));
  });
}

export async function listDocuments(owner: string | null): Promise<UploadedDocument[]> {
  if (!owner) return readGuestDocuments();
  const database = await openDatabase();
  try {
    const rows = await request(database.transaction(STORE).objectStore(STORE).index("owner").getAll(owner));
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { database.close(); }
}

function readGuestDocuments(): UploadedDocument[] {
  try {
    const rows = JSON.parse(localStorage.getItem("mindcanvas:documents:guest") || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}
function writeGuestDocuments(rows: UploadedDocument[]) {
  localStorage.setItem("mindcanvas:documents:guest", JSON.stringify(rows));
}

export async function saveDocument(owner: string | null, input: Omit<UploadedDocument, "id" | "owner" | "updatedAt"> & Partial<Pick<UploadedDocument, "id" | "updatedAt">>): Promise<UploadedDocument> {
  const kind = input.kind ?? documentKindFor(input.name, input.mimeType);
  if (!kind) throw new Error("Chỉ hỗ trợ PDF, DOCX, PPTX và XLSX.");
  if (input.size > MAX_DOCUMENT_BYTES) throw new Error("Tài liệu vượt quá 40 MB.");
  const document: UploadedDocument = { ...input, id: input.id ?? crypto.randomUUID(), owner: owner ?? "guest", kind, folderId: input.folderId ?? null, updatedAt: input.updatedAt ?? new Date().toISOString() };
  if (!owner) { const rows = readGuestDocuments(); writeGuestDocuments([document, ...rows.filter(row => row.id !== document.id)]); return document; }
  const database = await openDatabase();
  try {
    const tx = database.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(document);
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error("Không thể lưu tài liệu.")); tx.onabort = () => reject(tx.error ?? new Error("Không thể lưu tài liệu.")); });
    return document;
  } finally { database.close(); }
}

export async function deleteDocument(owner: string | null, id: string): Promise<void> {
  if (!owner) { writeGuestDocuments(readGuestDocuments().filter(row => row.id !== id)); return; }
  const database = await openDatabase();
  try {
    const tx = database.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id);
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error("Không thể xóa tài liệu.")); });
  } finally { database.close(); }
}

export async function readDocument(owner: string | null, id: string): Promise<UploadedDocument | null> {
  if (!owner) return readGuestDocuments().find(row => row.id === id) ?? null;
  const database = await openDatabase();
  try { return (await request(database.transaction(STORE).objectStore(STORE).get(id))) ?? null; }
  finally { database.close(); }
}
