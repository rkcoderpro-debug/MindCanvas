import type { ExamSource } from "@mindcanvas/shared";
import type { OriginalInfo } from "./examOnline";
import { emptyNoteSettings, validateNoteResult, validateNoteSettings, type NoteResult, type NoteSettings } from "../../../../packages/shared/src/takenotes.js";
export type SavedNote = NoteResult & { id: string; owner: string; format: NoteSettings["format"] | "docx"; updatedAt: string; docxDataUrl?: string; documentId?: string; sources?: ExamSource[]; generationMode?: "auto" | "manual"; settings: NoteSettings };
export type NoteWorkspace = { settings: NoteSettings; mode: "auto" | "manual"; sources: ExamSource[]; sourceText: string; result: SavedNote | null; importText: string; manualOutput: "markdown" | "docx"; manualSources?: OriginalInfo[]; manualSession?: { id: string; signature: string; consumed: boolean } };
export const emptyNoteWorkspace = (): NoteWorkspace => ({ settings: emptyNoteSettings(), mode: "auto", sources: [], sourceText: "", result: null, importText: "", manualOutput: "markdown" });
const ownerKey = (owner: string | null) => owner ?? "guest";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mindcanvas-takenotes-v1", 1);
    request.onupgradeneeded = () => { for (const name of ["notes", "drafts"]) { const store = request.result.createObjectStore(name, { keyPath: "key" }); store.createIndex("owner", "owner"); } };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("Không mở được kho Takenote."));
  });
}
async function read<T>(store: string, owner: string | null, id: string): Promise<T | null> {
  const database = await open();
  try { return await new Promise((resolve, reject) => { const req = database.transaction(store).objectStore(store).get(`${ownerKey(owner)}:${id}`); req.onsuccess = () => resolve(req.result?.value ?? null); req.onerror = () => reject(req.error); }); }
  finally { database.close(); }
}
async function write(store: string, owner: string | null, id: string, value: unknown) {
  const database = await open();
  try { await new Promise<void>((resolve, reject) => { const tx = database.transaction(store, "readwrite"); tx.objectStore(store).put({ key: `${ownerKey(owner)}:${id}`, owner: ownerKey(owner), value }); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Không lưu được Takenote.")); }); }
  finally { database.close(); }
}
export async function loadNoteWorkspace(owner: string | null): Promise<NoteWorkspace> {
  const value = await read<NoteWorkspace>("drafts", owner, "workspace");
  if (!value) return emptyNoteWorkspace();
  validateNoteSettings(value.settings);
  if (!["auto", "manual"].includes(value.mode) || !Array.isArray(value.sources) || value.sources.length > 6 || typeof value.sourceText !== "string" || value.sourceText.length > 120000 || typeof value.importText !== "string" || value.importText.length > 1500000 || !["markdown", "docx"].includes(value.manualOutput)) throw new Error("Bản nháp Takenote không đọc được.");
  if (value.sources.some(source => !source || typeof source.id !== "string" || typeof source.name !== "string" || typeof source.text !== "string" || !Array.isArray(source.warnings))) throw new Error("Nguồn trong bản nháp Takenote không đọc được.");
  if (value.result && (value.result.owner !== ownerKey(owner) || !["knowledge", "html", "docx"].includes(value.result.format) || typeof value.result.content !== "string" || typeof value.result.title !== "string")) throw new Error("Kết quả trong bản nháp Takenote không đọc được.");
  return value;
}
export async function persistNoteWorkspace(owner: string | null, work: NoteWorkspace) { await write("drafts", owner, "workspace", work); }
function validateSavedNote(owner: string | null, note: SavedNote) {
  if (!note || note.owner !== ownerKey(owner) || !note.id || !["knowledge", "html", "docx"].includes(note.format)) throw new Error("Tài liệu không thuộc tài khoản hiện tại.");
  validateNoteSettings(note.settings);
  if (note.format !== "docx") validateNoteResult(note, note.format);
  else if (!note.docxDataUrl || !note.title.trim()) throw new Error("Thiếu file Word Takenote.");
}
export async function saveNote(owner: string | null, note: SavedNote) { validateSavedNote(owner, note); const saved = { ...note, updatedAt: new Date().toISOString() }; await write("notes", owner, saved.id, saved); return saved; }
export async function listNotes(owner: string | null): Promise<SavedNote[]> {
  const database = await open();
  try {
    const rows = await new Promise<Array<{ value: SavedNote }>>((resolve, reject) => { const req = database.transaction("notes").objectStore("notes").index("owner").getAll(ownerKey(owner)); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const notes = rows.map(row => row.value); notes.forEach(note => validateSavedNote(owner, note)); return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { database.close(); }
}
export async function deleteNote(owner: string | null, id: string) {
  const database = await open();
  try { await new Promise<void>((resolve, reject) => { const tx = database.transaction("notes", "readwrite"); tx.objectStore("notes").delete(`${ownerKey(owner)}:${id}`); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); }); }
  finally { database.close(); }
}
