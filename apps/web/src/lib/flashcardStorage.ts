const DATABASE = "mindcanvas-flashcards-v1";
const STORE = "lists";

type FlashcardListRecord = {
  key: string;
  items: unknown[];
  writtenAt: number;
};

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Không thể mở bộ nhớ Flashcard."));
    request.onblocked = () => reject(new Error("Đóng tab MindCanvas cũ rồi thử lại."));
  });
}

export async function readFlashcardList(key: string): Promise<unknown[] | null> {
  const database = await openDatabase();
  if (!database) return null;
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => {
        const record = request.result as FlashcardListRecord | undefined;
        resolve(record && Array.isArray(record.items) ? record.items : null);
      };
      request.onerror = () => reject(request.error ?? new Error("Không thể đọc bộ nhớ Flashcard."));
    });
  } finally {
    database.close();
  }
}

export async function writeFlashcardList(key: string, items: unknown[]): Promise<boolean> {
  const database = await openDatabase();
  if (!database) return false;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put({ key, items: [...items], writtenAt: Date.now() } satisfies FlashcardListRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Không thể lưu bộ nhớ Flashcard."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Bộ nhớ Flashcard bị huỷ."));
    });
    return true;
  } catch {
    return false;
  } finally {
    database.close();
  }
}

export async function deleteFlashcardList(key: string): Promise<boolean> {
  const database = await openDatabase();
  if (!database) return false;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Không thể xoá bộ nhớ Flashcard."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Bộ nhớ Flashcard bị huỷ."));
    });
    return true;
  } catch {
    return false;
  } finally {
    database.close();
  }
}
