import { Router, type Response } from "express";
import multer from "multer";
import { inflateRawSync } from "node:zlib";
import { z } from "zod";
import { config } from "./config.js";

const BUCKET = "meeting-room-files";
const MAX_FILE = 8 * 1024 * 1024;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE, files: 1, fields: 2, fieldSize: 64, parts: 4 } }).single("file");
const uid = z.string().uuid().transform(value => value.toLowerCase());
const slot = z.object({ client: uid, id: uid }).strict();
const reference = z.object({ client: uid }).strict();
type FileMeta = { name: string; mime: string; size: number; ready: boolean };
type PendingFile = { room: string; id: string };
class FileProblem extends Error {}

// Check the archive before handing it to the browser's Word renderer. Bound
// both the declared sizes and the actual bytes emitted by the deflate streams.
function isDocx(bytes: Buffer) {
  try {
    let end = bytes.length - 22;
    while (end >= Math.max(0, bytes.length - 65557) && (bytes.readUInt32LE(end) !== 0x06054b50 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length)) end--;
    if (end < Math.max(0, bytes.length - 65557) || bytes.readUInt32LE(end + 4) !== 0) return false;
    const count = bytes.readUInt16LE(end + 10), dir = bytes.readUInt32LE(end + 16);
    if (!count || count > 600 || count !== bytes.readUInt16LE(end + 8) || dir + bytes.readUInt32LE(end + 12) !== end) return false;
    let cursor = dir, expanded = 0;
    const names = new Set<string>();
    const extents: Array<[number, number]> = [];
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) return false;
      const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
      const packed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24), nameLen = bytes.readUInt16LE(cursor + 28), local = bytes.readUInt32LE(cursor + 42);
      const next = cursor + 46 + nameLen + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
      expanded += size;
      if (next > end || !nameLen || nameLen > 500 || expanded > 24 * 1024 * 1024 || local + 30 > dir || flags & 0x2041 ||
        bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 6) !== flags) return false;
      const name = bytes.subarray(cursor + 46, cursor + 46 + nameLen).toString("utf8");
      const offset = local + 30 + nameLen + bytes.readUInt16LE(local + 28);
      if (names.has(name) || name.includes("..") || name.includes("\\") || name.startsWith("/") || bytes.readUInt16LE(local + 26) !== nameLen ||
        !bytes.subarray(local + 30, local + 30 + nameLen).equals(bytes.subarray(cursor + 46, cursor + 46 + nameLen)) ||
        offset + packed > dir || (method !== 0 && method !== 8) || (method === 0 && size !== packed)) return false;
      extents.push([local, offset + packed]);
      if (method === 8 && inflateRawSync(bytes.subarray(offset, offset + packed), { maxOutputLength: Math.max(1, size) }).length !== size) return false;
      names.add(name); cursor = next;
    }
    extents.sort((a, b) => a[0] - b[0]);
    if (extents.some(([start], i) => i > 0 && start < extents[i-1][1])) return false;
    return cursor === end && names.has("[Content_Types].xml") && names.has("word/document.xml") && !names.has("word/vbaProject.bin");
  } catch { return false; }
}
export function meetingFileMime(name: string, bytes: Buffer) {
  const ext = name.toLowerCase().split(".").at(-1);
  if (ext === "pdf" && bytes.subarray(0,5).toString("ascii") === "%PDF-") return "application/pdf";
  if (ext === "png" && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (["jpg","jpeg"].includes(ext ?? "") && bytes.subarray(0,3).equals(Buffer.from([255,216,255]))) return "image/jpeg";
  if (ext === "webp" && bytes.subarray(0,4).toString("ascii") === "RIFF" && bytes.subarray(8,12).toString("ascii") === "WEBP") return "image/webp";
  if (ext === "docx" && isDocx(bytes)) return DOCX;
  if (ext === "txt" && !bytes.includes(0)) {
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); return "text/plain"; } catch { /* invalid text */ }
  }
  throw new FileProblem("ONLINE_FILE_TYPE");
}

async function supabaseRequest(path: string, method: string, body?: RequestInit["body"], type?: string) {
  const key = config.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config.SUPABASE_URL || !key) throw new FileProblem("ONLINE_FILE_SERVICE");
  try {
    return await fetch(`${config.SUPABASE_URL.replace(/\/$/,"")}${path}`, { method, body, signal: AbortSignal.timeout(18000),
      headers: { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
        ...(type ? { "Content-Type": type } : {}), "Cache-Control": "no-store" } });
  } catch { throw new FileProblem("ONLINE_FILE_SERVICE"); }
}
const statuses: Record<string,number> = {
  ONLINE_MEDIA_DENIED: 403, ONLINE_CHAT_LOCKED: 403, ONLINE_FILE_GONE: 404, ONLINE_FILE_PENDING: 409, ONLINE_FILE_TYPE: 415,
  ONLINE_FILE_SIZE: 413, ONLINE_FILE_QUOTA: 413, ONLINE_RATE: 429, ONLINE_INPUT: 400, ONLINE_FILE_SERVICE: 503,
};
async function rpc<T>(name: "online_meeting_file" | "online_meeting_file_cleanup", args: Record<string, unknown>): Promise<T> {
  const response = await supabaseRequest(`/rest/v1/rpc/${name}`, "POST", JSON.stringify(args), "application/json");
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload === null) throw new FileProblem(typeof payload?.message === "string" && Object.hasOwn(statuses,payload.message) ? payload.message : "ONLINE_FILE_SERVICE");
  return payload as T;
}
const objectKey = (room: string,id: string) => `${room}/${id}`;
async function removeObject(room: string, id: string) {
  const response = await supabaseRequest(`/storage/v1/object/${BUCKET}`, "DELETE", JSON.stringify({ prefixes: [objectKey(room,id)] }), "application/json");
  if (!response.ok) throw new FileProblem("ONLINE_FILE_SERVICE");
  await rpc("online_meeting_file_cleanup",{ p_room: room, p_file: id });
}
let nextCleanup = 0;
function maybeCleanup() {
  if (Date.now() < nextCleanup) return;
  nextCleanup = Date.now() + 5 * 60_000;
  void rpc<PendingFile[]>("online_meeting_file_cleanup", {}).then(async candidates => {
    for (const item of candidates) await removeObject(item.room,item.id).catch(() => {});
  }).catch(() => {});
}
function problem(res: Response,error: unknown) {
  const code = error instanceof FileProblem ? error.message : "ONLINE_FILE_SERVICE";
  return res.status(statuses[code] ?? 503).json({ code });
}

// This router is mounted under onlineMeetings after requireUser.
export const meetingFiles = Router({ mergeParams: true });
let inflight = 0;
meetingFiles.post("/", (req,res,next) => {
  if (inflight >= 4) return problem(res, new FileProblem("ONLINE_RATE"));
  inflight++;
  res.once("close", () => { inflight--; });
  upload(req,res,error => {
    if (error) { problem(res,new FileProblem(error.code === "LIMIT_FILE_SIZE" ? "ONLINE_FILE_SIZE" : "ONLINE_INPUT")); return; }
    next();
  });
}, async (req,res) => {
  const room = uid.safeParse((req.params as { room?: string }).room), data = slot.safeParse(req.body);
  if (!room.success || !data.success || !req.file) return problem(res,new FileProblem("ONLINE_INPUT"));
  if (req.file.size < 1 || req.file.size > MAX_FILE) return problem(res,new FileProblem("ONLINE_FILE_SIZE"));
  const filename = Buffer.from(req.file.originalname, "latin1").toString("utf8");
  const name = Array.from((filename.includes("\uFFFD") ? req.file.originalname : filename).replace(/[\x00-\x1f\x7f/\\]/g,"_").trim()).slice(0,160).join("");
  if (!name) return problem(res,new FileProblem("ONLINE_INPUT"));
  const args = { p_room: room.data,p_actor: req.userId!,p_client: data.data.client,p_file: data.data.id };
  try {
    const mime = meetingFileMime(name, req.file.buffer);
    const state = await rpc<FileMeta>("online_meeting_file", { ...args,p_op:"reserve",p_name:name,p_mime:mime,p_size:req.file.size });
    if (!state.ready) {
      // An uncertain Storage write stays pending for the delayed sweeper.
      const stored = await supabaseRequest(`/storage/v1/object/${BUCKET}/${objectKey(room.data,data.data.id)}`, "POST", Uint8Array.from(req.file.buffer), mime);
      if (!stored.ok) throw new FileProblem("ONLINE_FILE_SERVICE");
      await stored.body?.cancel().catch(() => undefined);
      await rpc("online_meeting_file",{ ...args,p_op:"commit" });
    }
    return res.json({ ok:true });
  } catch (error) { return problem(res,error); }
  finally { maybeCleanup(); }
});
meetingFiles.post("/:file/content", async (req,res) => {
  const room = uid.safeParse((req.params as { room?: string }).room), file = uid.safeParse(req.params.file), data = reference.safeParse(req.body);
  if (!room.success || !file.success || !data.success) return problem(res,new FileProblem("ONLINE_INPUT"));
  try {
    const info = await rpc<FileMeta>("online_meeting_file",{ p_room:room.data,p_actor:req.userId!,p_client:data.data.client,p_file:file.data,p_op:"read" });
    const response = await supabaseRequest(`/storage/v1/object/${BUCKET}/${objectKey(room.data,file.data)}`,"GET");
    if (!response.ok) throw new FileProblem(response.status === 404 ? "ONLINE_FILE_GONE" : "ONLINE_FILE_SERVICE");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== info.size || bytes.length > MAX_FILE) throw new FileProblem("ONLINE_FILE_SERVICE");
    // Binary-only response. Preview uses a locally fetched blob and safe renderers.
    return res.set({ "Content-Type":info.mime, "Content-Disposition":"attachment", "X-Content-Type-Options":"nosniff" }).send(bytes);
  } catch (error) { return problem(res,error); }
});
