import { Router, type Response } from "express";
import { AccessToken, RoomServiceClient, ServerError, TrackSource } from "livekit-server-sdk";
import { z } from "zod";
import { requireUser } from "./auth.js";
import { config } from "./config.js";
import { meetingFiles } from "./meetingFiles.js";

const uuid = z.string().uuid();
const session = z.object({ client: uuid }).strict();
const command = z.object({
  client: uuid, name: z.enum(["presenter", "mute", "remove", "transfer", "close"]), target: uuid.nullish(),
}).strict().refine(value => value.name === "close" ? !value.target : value.name === "presenter" || Boolean(value.target));
const unavailable = ["ONLINE_MEDIA_DISABLED", "ONLINE_MEDIA_PROVIDER", "ONLINE_MEDIA_DATABASE"];
const denied = ["ONLINE_MEDIA_DENIED", "ONLINE_HOST_ONLY"];
class MeetingError extends Error {}

export function meetingProvider() {
  const { LIVEKIT_URL: endpoint, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = config;
  if (!endpoint || !key?.trim() || !secret?.trim()) return null;
  const url = new URL(endpoint);
  if (url.protocol !== "wss:" || url.username || url.password || url.search || url.hash) return null;
  return { url: url.href, key: key.trim(), secret: secret.trim(), rooms: new RoomServiceClient(url.href.replace(/^wss:/, "https:"), key.trim(), secret.trim(), { requestTimeout: 5 }) };
}

async function db<T>(name: "online_meeting_session" | "online_meeting_manage", args: Record<string, string | null>): Promise<T> {
  const key = config.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config.SUPABASE_URL || !key) throw new MeetingError("ONLINE_MEDIA_DATABASE");
  let response: globalThis.Response;
  try {
    response = await fetch(`${config.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }) },
      body: JSON.stringify(args), signal: AbortSignal.timeout(8000),
    });
  } catch { throw new MeetingError("ONLINE_MEDIA_DATABASE"); }
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new MeetingError([...denied, "ONLINE_MEMBER_GONE", "ONLINE_INPUT", "ONLINE_CLASS_HOST"].includes(result?.message) ? result.message : "ONLINE_MEDIA_DATABASE");
  if (!result) throw new MeetingError("ONLINE_MEDIA_DATABASE");
  return result as T;
}

function respond(res: Response, error: unknown) {
  const code = error instanceof MeetingError ? error.message : "ONLINE_MEDIA_PROVIDER";
  return res.status(denied.includes(code) ? 403 : unavailable.includes(code) ? 503 : 400).json({ code });
}
const missing = (error: unknown) => error instanceof ServerError && (error.status === 404 || error.code === "not_found");
async function ifPresent<T>(operation: () => Promise<T>) {
  try { return await operation(); } catch (error) { if (!missing(error)) throw error; }
}
const publishSources = (screen: boolean) => [TrackSource.CAMERA, TrackSource.MICROPHONE, ...(screen ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : [])];
const permissions = (screen: boolean) => ({ canSubscribe: true, canPublish: true, canPublishData: false, canPublishSources: publishSources(screen) });
type MeetingState = { state: "active" | "closed"; presenter?: string | null };
const operations = new Map<string, Promise<unknown>>();
// Keep permission updates and token issuance ordered for the same room in this API instance.
function inRoom<T>(id: string, operation: () => Promise<T>) {
  const next = (operations.get(id) ?? Promise.resolve()).catch(() => undefined).then(operation);
  operations.set(id, next);
  const cleanup = () => { if (operations.get(id) === next) operations.delete(id); };
  void next.then(cleanup, cleanup);
  return next;
}

export const onlineMeetings = Router();
onlineMeetings.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
onlineMeetings.use(requireUser);
onlineMeetings.use("/:room/files", meetingFiles);

onlineMeetings.post("/:room/token", async (req, res) => {
  const id = uuid.safeParse(req.params.room), data = session.safeParse(req.body);
  if (!id.success || !data.success) return respond(res, new MeetingError("ONLINE_INPUT"));
  try {
    const result = await inRoom(id.data, async () => {
      const { name, screen } = await db<{ name: string; screen: boolean }>("online_meeting_session", {
        p_room: id.data, p_actor: req.userId!, p_client: data.data.client,
      });
      const live = meetingProvider();
      if (!live) throw new MeetingError("ONLINE_MEDIA_DISABLED");
      const token = new AccessToken(live.key, live.secret, { identity: req.userId!, name, ttl: "60s" });
      token.addGrant({ room: `mindcanvas-${id.data}`, roomJoin: true, ...permissions(screen) });
      return { url: live.url, token: await token.toJwt() };
    });
    return res.json(result);
  } catch (error) { return respond(res, error); }
});

onlineMeetings.post("/:room/manage", async (req, res) => {
  const id = uuid.safeParse(req.params.room), parsed = command.safeParse(req.body);
  if (!id.success || !parsed.success) return respond(res, new MeetingError("ONLINE_INPUT"));
  const { client, name, target } = parsed.data;
  try {
    const result = await inRoom(id.data, async () => {
      const result = await db<MeetingState>("online_meeting_manage", {
        p_room: id.data, p_actor: req.userId!, p_client: client, p_operation: name, p_target: target ?? null,
      });
      const live = meetingProvider();
      if (!live) {
        if (name === "mute") throw new MeetingError("ONLINE_MEDIA_DISABLED");
        return result;
      }
      const rooms = live.rooms, room = `mindcanvas-${id.data}`;
      if (name === "close") await ifPresent(() => rooms.deleteRoom(room));
      else if (name === "mute" && target) {
        const participant = await ifPresent(() => rooms.getParticipant(room, target));
        await Promise.all(participant?.tracks.filter(track => track.source === TrackSource.MICROPHONE && !track.muted)
          .map(track => ifPresent(() => rooms.mutePublishedTrack(room, target, track.sid, true))) ?? []);
      } else {
        if (name === "remove" && target) await ifPresent(() => rooms.removeParticipant(room, target));
        const people = await ifPresent(() => rooms.listParticipants(room)) ?? [];
        const setScreen = (identity: string, screen: boolean) =>
          ifPresent(() => rooms.updateParticipant(room, identity, { permission: permissions(screen) }));
        // Reconcile every connection, including after a partial provider failure.
        await Promise.all(people.filter(person => person.identity !== result.presenter && person.permission?.canPublishSources.includes(TrackSource.SCREEN_SHARE))
          .map(person => setScreen(person.identity, false)));
        if (result.presenter && people.some(person => person.identity === result.presenter && !person.permission?.canPublishSources.includes(TrackSource.SCREEN_SHARE))) {
          await setScreen(result.presenter, true);
        }
      }
      return result;
    });
    return res.json({ state: result.state });
  } catch (error) { return respond(res, error); }
});
