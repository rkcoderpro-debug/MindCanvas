import { validateOnlineExam, type OnlineAttempt, type OnlineExam, type OriginalInfo } from "./examOnline";
import { readLocalBytes } from "./examManualSource";
import { originalArchivePath, type StudioConfig, type StudioPrompt, emptyStudioConfig } from "./examStudioPrompt";
export type StudioItem = { id: string; owner: string; title: string; updatedAt: string; kind: "word"; examFileId: string; answerFileId: string | null; sources: OriginalInfo[] } | { id: string; owner: string; title: string; updatedAt: string; kind: "online"; exam: OnlineExam };
export type StudioWorkspace = { config: StudioConfig; sources: OriginalInfo[]; session: StudioPrompt | null; importText: string; selectedId: string | null; separateText?: string; editingId?: string | null; importRequestId?: string; importConsumed?: boolean };
const DB = "mindcanvas-exam-studio-v1", own = (owner: string | null) => owner ?? "guest", key = (owner: string | null, id: string) => `${own(owner)}:${id}`;
function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Trình duyệt chưa cho phép lưu file và bài làm trên thiết bị."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      for (const name of ["files", "items", "attempts"]) { const store = request.result.createObjectStore(name, { keyPath: "key" }); store.createIndex("owner", "owner"); if (name === "attempts") store.createIndex("ownerExam", ["owner", "examId"]); }
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("Không mở được kho đề trên thiết bị.")); request.onblocked = () => reject(new Error("Hãy đóng tab MindCanvas cũ rồi thử lại."));
  });
}
async function read<T>(store: string, owner: string | null, id: string): Promise<T | null> {
  const database = await open(); try {
    return await new Promise((resolve, reject) => { const request = database.transaction(store).objectStore(store).get(key(owner, id)); request.onsuccess = () => resolve(request.result?.owner === own(owner) ? request.result.value as T : null); request.onerror = () => reject(request.error); });
  } finally { database.close(); }
}
async function write(store: string, owner: string | null, id: string, value: unknown, extra: Record<string, string> = {}) {
  const database = await open(); try {
    await new Promise<void>((resolve, reject) => { const transaction = database.transaction(store, "readwrite"); transaction.objectStore(store).put({ key: key(owner, id), owner: own(owner), value, ...extra }); transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("Không đủ dung lượng lưu. Hãy giữ trang mở và tải file quan trọng xuống.")); });
  } finally { database.close(); }
}
export async function saveStudioOriginal(owner: string | null, file: File, role: OriginalInfo["role"], id: string = crypto.randomUUID()): Promise<OriginalInfo> {
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: file phải có nội dung và không vượt 10 MB.`);
  const bytes = await readLocalBytes(file), info: OriginalInfo = { id, name: file.name, size: bytes.byteLength, mimeType: file.type, role };
  await write("files", owner, id, { info, bytes }); return info;
}
export async function saveStudioOriginalBatch(owner: string | null, files: File[], role: OriginalInfo["role"]): Promise<OriginalInfo[]> {
  if (!files.length || files.length > 6) throw new Error("Chọn từ 1 đến 6 file.");
  const values: Array<{ info: OriginalInfo; bytes: ArrayBuffer }> = [];
  for (const file of files) {
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: file phải có nội dung và không vượt 10 MB.`);
    const bytes = await readLocalBytes(file); values.push({ info: { id: crypto.randomUUID(), name: file.name, size: bytes.byteLength, mimeType: file.type, role }, bytes });
  }
  const database = await open(); try {
    await new Promise<void>((resolve, reject) => { const transaction = database.transaction("files", "readwrite"); for (const value of values) transaction.objectStore("files").put({ key: key(owner, value.info.id), owner: own(owner), value }); transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("Không lưu được nhóm file. Hãy kiểm tra dung lượng trình duyệt.")); });
  } finally { database.close(); }
  return values.map(value => value.info);
}
export async function getStudioOriginal(owner: string | null, id: string): Promise<File | null> {
  const value = await read<{ info: OriginalInfo; bytes: ArrayBuffer }>("files", owner, id);
  if (!value) return null;
  if (!value.info || value.info.id !== id || Object.prototype.toString.call(value.bytes) !== "[object ArrayBuffer]" || value.bytes.byteLength !== value.info.size) throw new Error("File gốc lưu trên thiết bị bị hỏng. Hãy chọn lại file.");
  return new File([value.bytes], value.info.name, { type: value.info.mimeType });
}
export async function buildStudioBundle(owner: string | null, session: StudioPrompt) {
  const JSZip = (await import("jszip")).default, zip = new JSZip(); zip.file("prompt.txt", session.prompt);
  for (let index = 0; index < session.sources.length; index++) {
    const source = session.sources[index]; if (source.textOnly) continue;
    const file = await getStudioOriginal(owner, source.id); if (!file) throw new Error(`Thiếu file gốc ${source.name}. Hãy chọn lại file và lấy prompt mới trước khi tải gói.`);
    zip.file(originalArchivePath(source, index), await readLocalBytes(file));
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
export async function validateStudioDocx(file: File) {
  if (!/\.docx$/i.test(file.name) || !file.size || file.size > 10 * 1024 * 1024) throw new Error("Kết quả cần là file DOCX thật, tối đa 10 MB mỗi file.");
  const JSZip = (await import("jszip")).default, zip = await JSZip.loadAsync(await readLocalBytes(file));
  const entries = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"].map(name => zip.file(name));
  if (entries.some(entry => !entry)) throw new Error(`${file.name}: thiếu thành phần bắt buộc của DOCX.`);
  const [types, relationships, xml] = await Promise.all(entries.map(entry => entry!.async("text")));
  if (xml.length > 10000000 || !types.includes("wordprocessingml.document.main+xml") || !relationships.includes("officeDocument")) throw new Error(`${file.name}: gói Word không hợp lệ.`);
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length || !document.getElementsByTagNameNS("*", "body").length) throw new Error(`${file.name}: nội dung XML Word bị hỏng.`);
}
export async function saveStudioItem(owner: string | null, item: StudioItem) {
  if (item.owner !== own(owner) || typeof item.id !== "string" || !item.id || !item.title.trim()) throw new Error("Đề không thuộc tài khoản hiện tại hoặc thiếu tên.");
  if (item.kind === "online") validateOnlineExam({ ...item.exam, schemaVersion: 1 }, item.exam.sources);
  else { if (!await getStudioOriginal(owner, item.examFileId)) throw new Error("Chưa lưu được file Word đề."); if (item.answerFileId && !await getStudioOriginal(owner, item.answerFileId)) throw new Error("Chưa lưu được file Word đáp án."); }
  await write("items", owner, item.id, item); return item;
}
export async function listStudioItems(owner: string | null): Promise<StudioItem[]> {
  const database = await open(); try {
    const rows = await new Promise<Array<{ value: StudioItem }>>((resolve, reject) => { const request = database.transaction("items").objectStore("items").index("owner").getAll(own(owner)); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const items = rows.map(row => row.value);
    for (const item of items) {
      if (!item || item.owner !== own(owner) || typeof item.title !== "string" || typeof item.id !== "string" || typeof item.updatedAt !== "string" || !["word", "online"].includes(item.kind)) throw new Error("Một đề trong thư viện không đọc được.");
      if (item.kind === "online") {
        if (!item.exam || item.exam.id !== item.id || typeof item.exam.revision !== "string" || !Array.isArray(item.exam.sources) || item.exam.sources.some(source => !source || typeof source.id !== "string" || typeof source.name !== "string")) throw new Error("Đề tương tác trong thư viện bị hỏng.");
        validateOnlineExam({ ...item.exam, schemaVersion: 1 }, item.exam.sources);
      } else if (typeof item.examFileId !== "string" || (item.answerFileId !== null && typeof item.answerFileId !== "string")) throw new Error("Đề Word trong thư viện bị hỏng.");
    }
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { database.close(); }
}
export async function deleteStudioItem(owner: string | null, id: string) {
  const item = await read<StudioItem>("items", owner, id), database = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["items", "files", "attempts"], "readwrite"); transaction.objectStore("items").delete(key(owner, id));
      if (item?.kind === "word") for (const fileId of [item.examFileId, item.answerFileId]) if (fileId) transaction.objectStore("files").delete(key(owner, fileId));
      const cursor = transaction.objectStore("attempts").index("ownerExam").openCursor([own(owner), id]); cursor.onsuccess = () => { if (cursor.result) { cursor.result.delete(); cursor.result.continue(); } };
      transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
export function validateOnlineAttempt(exam: OnlineExam, value: OnlineAttempt): OnlineAttempt {
  if (!value || value.examId !== exam.id || value.revision !== exam.revision || !Number.isFinite(value.startedAt) || value.startedAt <= 0 || (value.endsAt !== null && (!Number.isFinite(value.endsAt) || value.endsAt < value.startedAt)) || (value.submittedAt !== null && (!Number.isFinite(value.submittedAt) || value.submittedAt < value.startedAt)) || !value.responses || typeof value.responses !== "object" || Array.isArray(value.responses) || !value.selfScores || typeof value.selfScores !== "object" || Array.isArray(value.selfScores)) throw new Error("Bài làm lưu trước đó không hợp lệ. Hãy bắt đầu lượt mới.");
  const expectedEnd = exam.durationMinutes ? value.startedAt + exam.durationMinutes * 60000 : null;
  if (value.endsAt !== expectedEnd) throw new Error("Thời gian bài làm lưu trước đó không khớp đề.");
  for (const [id, response] of Object.entries(value.responses)) {
    const question = exam.questions.find(q => q.id === id);
    if (!question || !response || typeof response !== "object" || (response.choice !== undefined && (!Number.isInteger(response.choice) || response.choice < 0 || response.choice > 3)) || (response.text !== undefined && (typeof response.text !== "string" || response.text.length > 20000)) || (response.unit !== undefined && (typeof response.unit !== "string" || response.unit.length > 80)) || (response.blanks !== undefined && (!response.blanks || typeof response.blanks !== "object" || Array.isArray(response.blanks) || Object.entries(response.blanks).some(([key, text]) => !question.blanks.some(blank => blank.id === key) || typeof text !== "string" || text.length > 2000)))) throw new Error("Câu trả lời lưu trước đó bị hỏng.");
  }
  for (const [id, score] of Object.entries(value.selfScores)) { const question = exam.questions.find(q => q.id === id); if (!question || !Number.isFinite(score) || score < 0 || score > question.points) throw new Error("Điểm tự chấm lưu trước đó không hợp lệ."); }
  if (value.submittedAt === null && Object.keys(value.selfScores).length) throw new Error("Không tự chấm khi chưa nộp bài.");
  return value;
}
export async function loadOnlineAttempt(owner: string | null, exam: OnlineExam) { const attempt = await read<OnlineAttempt>("attempts", owner, `${exam.id}:${exam.revision}`); return attempt ? validateOnlineAttempt(exam, attempt) : null; }
export async function saveOnlineAttempt(owner: string | null, exam: OnlineExam, attempt: OnlineAttempt) { validateOnlineAttempt(exam, attempt); await write("attempts", owner, `${exam.id}:${exam.revision}`, attempt, { examId: exam.id }); }
export const emptyStudioWorkspace = (): StudioWorkspace => ({ config: emptyStudioConfig(), sources: [], session: null, importText: "", selectedId: null });
const workspaceKey = (owner: string | null) => `mindcanvas:exam-studio:v2:${own(owner)}`;
export function loadStudioWorkspace(owner: string | null): StudioWorkspace {
  const raw = localStorage.getItem(workspaceKey(owner)); if (!raw) return emptyStudioWorkspace(); if (raw.length > 3000000) throw new Error("Bản nháp đề vượt 3 MB.");
  const value = JSON.parse(raw) as StudioWorkspace;
  if (!value?.config || !["word", "online"].includes(value.config.output) || !Array.isArray(value.config.types) || typeof value.config.subject !== "string" || typeof value.config.level !== "string" || typeof value.config.instructions !== "string" || !["vi", "en"].includes(value.config.language) || !["easy", "medium", "hard"].includes(value.config.difficulty) || !Array.isArray(value.sources) || value.sources.length > 6 || value.sources.some(source => !source || typeof source.id !== "string" || typeof source.name !== "string") || typeof value.importText !== "string" || value.importText.length > 2000000 || (value.separateText !== undefined && (typeof value.separateText !== "string" || value.separateText.length > 120000)) || (value.session && (typeof value.session.id !== "string" || typeof value.session.prompt !== "string" || value.session.prompt.length > 100000 || !value.session.config || !Array.isArray(value.session.sources)))) throw new Error("Bản nháp Manual không đọc được.");
  return value;
}
export function persistStudioWorkspace(owner: string | null, value: StudioWorkspace) { const raw = JSON.stringify(value); if (raw.length > 3000000) throw new Error("Bản nháp vượt 3 MB; hãy lưu JSON vào file riêng."); localStorage.setItem(workspaceKey(owner), raw); }
