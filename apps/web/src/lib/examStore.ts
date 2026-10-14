import { validateExamSettings, validateExamSources, validateExamBlueprint, validateExamDraft, type SavedExam } from "@mindcanvas/shared";
const DB = "mindcanvas-exams-v1", STORE = "exams";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Trình duyệt chưa cho phép lưu đề trên thiết bị."));
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { const store = request.result.createObjectStore(STORE, { keyPath: "key" }); store.createIndex("owner", "owner"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Không thể mở thư viện đề."));
    request.onblocked = () => reject(new Error("Hãy đóng tab MindCanvas cũ rồi thử lưu lại."));
  });
}
function validate(saved: SavedExam, owner: string | null): SavedExam {
  if (!saved || typeof saved.id !== "string" || !saved.id || saved.owner !== (owner ?? "guest")) throw new Error("Đề không thuộc tài khoản hiện tại.");
  const settings = validateExamSettings(saved.settings), sources = validateExamSources(saved.sources, settings.mode), blueprint = validateExamBlueprint(saved.blueprint, settings.format);
  return { ...saved, settings, sources, blueprint, draft: validateExamDraft(saved.draft, blueprint, sources, settings.format) };
}
export async function listSavedExams(owner: string | null): Promise<SavedExam[]> {
  const database = await open();
  try {
    const rows = await new Promise<Array<{ exam: SavedExam }>>((resolve, reject) => {
      const request = database.transaction(STORE).objectStore(STORE).index("owner").getAll(owner ?? "guest");
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return rows.map(row => validate(row.exam, owner)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { database.close(); }
}
export async function saveExam(owner: string | null, exam: SavedExam): Promise<SavedExam> {
  const saved = validate({ ...exam, updatedAt: new Date().toISOString() }, owner), database = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put({ key: `${owner ?? "guest"}:${saved.id}`, owner: owner ?? "guest", exam: saved });
      transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("Không đủ dung lượng để lưu đề. Bản nháp vẫn được giữ."));
    }); return saved;
  } finally { database.close(); }
}
export async function deleteExam(owner: string | null, id: string) {
  const database = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite"); transaction.objectStore(STORE).delete(`${owner ?? "guest"}:${id}`);
      transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
