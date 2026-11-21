import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoardState } from "@mindcanvas/shared";
import { parseBoard } from "./board";

export const CANVAS_MEDIA_BUCKET = "canvas-media-private";
const REF = "mindcanvas-asset:";
const DIGEST = /^[a-f0-9]{64}$/;
const PROJECT_ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const MEDIA_SOURCE = /^data:(?:image|audio|video)\/[a-z0-9.+-]+(?:;[^,]*)?,/i;
const DOCUMENT_SOURCE = /^data:application\/(?:pdf|vnd\.openxmlformats-officedocument\.(?:wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet));base64,/i;
const MAX_ASSET_BYTES = 55 * 1024 * 1024;
const CACHE_BYTES = 32 * 1024 * 1024;
const MAX_CLOUD_BOARD_BYTES = 2 * 1024 * 1024;
type CloudRow = { type: "mindcanvas-board"; version: 1 | 2; board: BoardState };
type MediaTransport = {
  exists: (path: string) => Promise<boolean>;
  put: (path: string, body: Blob) => Promise<void>;
  get: (path: string) => Promise<Blob>;
};
type SourceCacheEntry = { path: string; value: string };
const sources = new Map<string, SourceCacheEntry>();
const knownObjects = new Set<string>();
let cachedBytes = 0;

export function clearCanvasCloudMediaCache() {
  sources.clear(); knownObjects.clear(); cachedBytes = 0;
}
export function isCompactCanvas(value: unknown): boolean {
  const envelope = value as Partial<CloudRow> | null;
  return envelope?.type === "mindcanvas-board" && envelope.version === 2;
}
function cache(scope: string, path: string, value: string) {
  const key = scope + "/" + path;
  if (!knownObjects.has(key)) {
    if (knownObjects.size >= 2048) knownObjects.delete(knownObjects.values().next().value!);
    knownObjects.add(key);
  }
  if (sources.has(key) || value.length > CACHE_BYTES) return;
  while (cachedBytes + value.length > CACHE_BYTES && sources.size) {
    const oldest = sources.keys().next().value!;
    cachedBytes -= sources.get(oldest)!.value.length;
    sources.delete(oldest);
  }
  sources.set(key, { path, value }); cachedBytes += value.length;
}
async function sha256(source: string) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)));
  return Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
}
function pathFor(projectId: string, digest: string) {
  if (!PROJECT_ID.test(projectId) || !DIGEST.test(digest)) throw new Error("Tham chiếu ảnh của canvas không hợp lệ.");
  return projectId.toLowerCase() + "/" + digest;
}
function checkSource(value: string, pattern: RegExp) {
  if (typeof value !== "string" || !pattern.test(value) || value.length > MAX_ASSET_BYTES) throw new Error("Tệp nhúng của canvas không hợp lệ hoặc vượt giới hạn lưu trữ.");
}
async function mapSources(board: BoardState, visit: (src: string, pattern: RegExp) => Promise<string>) {
  const background = typeof board.background === "object"
    ? { ...board.background, src: await visit(board.background.src, MEDIA_SOURCE) } : board.background;
  const media: BoardState["media"] = [];
  for (const item of board.media) media.push({ ...item, src: await visit(item.src, MEDIA_SOURCE) });
  const embeds: BoardState["embeds"] = [];
  for (const item of board.embeds) {
    embeds.push(item.kind === "document" && typeof item.url === "string" && (DOCUMENT_SOURCE.test(item.url) || item.url.startsWith(REF))
      ? { ...item, url: await visit(item.url, DOCUMENT_SOURCE) } : item);
  }
  return { ...board, background, media, embeds };
}
async function verifyObject(io: MediaTransport, path: string, digest: string, pattern: RegExp) {
  const blob = await io.get(path);
  if (blob.size > MAX_ASSET_BYTES) throw new Error("Tệp ảnh trên đám mây vượt giới hạn.");
  const text = await blob.text();
  checkSource(text, pattern);
  if (await sha256(text) !== digest) throw new Error("Tệp ảnh trên đám mây không khớp với bản đã lưu.");
  return text;
}
export async function packCloudCanvas(scope: string, board: BoardState, io: MediaTransport): Promise<CloudRow> {
  const required = new Map<string, { digest: string; source: string; pattern: RegExp }>();
  const prefix = scope + "/" + board.id.toLowerCase() + "/";
  const digestBySource = new Map<string, string>();
  for (const [key, entry] of sources) if (key.startsWith(prefix)) digestBySource.set(entry.value, entry.path.slice(-64));
  const compact = await mapSources(board, async (source, pattern) => {
    checkSource(source, pattern);
    const digest = digestBySource.get(source) ?? await sha256(source);
    digestBySource.set(source, digest);
    const path = pathFor(board.id, digest);
    required.set(path, { digest, source, pattern });
    return REF + digest;
  });
  const envelope: CloudRow = { type: "mindcanvas-board", version: 2, board: compact };
  if (new Blob([JSON.stringify(envelope)]).size > MAX_CLOUD_BOARD_BYTES) throw new Error("Dữ liệu canvas không chứa ảnh vẫn vượt giới hạn đồng bộ của bản thử.");
  // Persist files before publishing references. Never send an inline fallback
  // if a file fails to upload or if the note later fails its revision check.
  for (const [path, { source, digest, pattern }] of required) {
    if (knownObjects.has(scope + "/" + path)) continue;
    if (await io.exists(path)) await verifyObject(io, path, digest, pattern);
    else {
      try { await io.put(path, new Blob([source], { type: "application/octet-stream" })); }
      catch (error) {
        // A retry or another tab may already have uploaded this immutable file.
        if (!await io.exists(path)) throw error;
        await verifyObject(io, path, digest, pattern);
      }
    }
    cache(scope, path, source);
  }
  return envelope;
}
export async function unpackCloudCanvas(scope: string, id: string, title: string | undefined, value: unknown, io: MediaTransport): Promise<BoardState> {
  const envelope = value as Partial<CloudRow> | null;
  const raw = envelope?.board ?? value as BoardState;
  const board = { ...raw, id, title: title ?? raw?.title };
  if (!isCompactCanvas(value)) return parseBoard(board);
  if (envelope?.board?.id !== id || !Array.isArray(board.media) || !Array.isArray(board.embeds)) throw new Error("Dữ liệu ảnh của canvas không hợp lệ.");
  const restored = await mapSources(board, async (reference, pattern) => {
    if (typeof reference !== "string" || !reference.startsWith(REF)) throw new Error("Canvas thiếu tham chiếu ảnh đã lưu.");
    const digest = reference.slice(REF.length);
    const path = pathFor(id, digest);
    const existing = sources.get(scope + "/" + path)?.value;
    const source = existing ?? await verifyObject(io, path, digest, pattern);
    checkSource(source, pattern);
    cache(scope, path, source);
    return source;
  });
  return parseBoard(restored);
}
export function canvasMediaTransport(client: SupabaseClient, signal?: AbortSignal): MediaTransport {
  const bucket = () => client.storage.from(CANVAS_MEDIA_BUCKET);
  // upload()/exists() do not accept AbortSignal. Stop the draft pipeline
  // after the budget; a late upload can be verified and reused on retry.
  const wait = <T>(start: () => Promise<T>): Promise<T> => {
    if (!signal) return start();
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(signal.reason ?? new Error("Canvas media request timed out"));
      if (signal.aborted) { abort(); return; }
      signal.addEventListener("abort", abort, { once: true });
      Promise.resolve().then(start).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  };
  return {
    async exists(path) {
      const { data, error } = await wait(() => bucket().exists(path));
      if (error && data !== false) throw error;
      return data === true;
    },
    async put(path, body) {
      const { error } = await wait(() => bucket().upload(path, body, { upsert: false, cacheControl: "0", contentType: "application/octet-stream" }));
      if (error) throw error;
    },
    async get(path) {
      const { data, error } = await bucket().download(path, {}, { signal, cache: "no-store" });
      if (error || !data) throw error ?? new Error("Không tải được ảnh của canvas.");
      return data;
    },
  };
}
export async function canvasMediaEnabled(client: SupabaseClient, id: string, signal: AbortSignal) {
  const { data, error } = await client.rpc("canvas_media_enabled", { p_project_id: id }).abortSignal(signal);
  if (error?.code === "PGRST202") throw new Error("Cần áp dụng migration 0033 trước khi bật đồng bộ ảnh canvas.");
  if (error) throw error;
  return data === true;
}

export async function reserveCanvasMediaDraft(client: SupabaseClient, id: string, signal: AbortSignal) {
  const { data, error } = await client.rpc("canvas_media_reserve_draft", { p_project_id: id }).abortSignal(signal);
  if (error?.code === "PGRST202") throw new Error("Cần áp dụng migration 0034 trước khi bật đồng bộ ảnh cho tất cả canvas.");
  if (error) throw error;
  return data === true;
}
