import { Router, type Request, type Response } from "express";
import { ServerError, WebhookReceiver, type WebhookEvent } from "livekit-server-sdk";
import { z } from "zod";
import { requireAdmin } from "./auth.js";
import { config } from "./config.js";
import { meetingProvider } from "./onlineMeetings.js";

const id = z.string().uuid();
const onOff = <T extends "preset" | "public_host" | "moderator">(op: T) =>
  z.object({ op: z.literal(op), target: id, enabled: z.boolean() }).strict();
const toggleReport = <T extends "dismiss_report" | "resolve_report" | "remove_reported_message">(op: T) =>
  z.object({ op: z.literal(op), target: id }).strict();
const adminInput = z.discriminatedUnion("op", [
  z.object({ op: z.literal("pilot"), enabled: z.boolean(), verified: z.boolean() }).strict(),
  z.object({ op: z.literal("limits"), openLimit: z.number().int().min(1).max(100), publicLimit: z.number().int().min(1).max(25) }).strict(),
  z.object({ op:z.literal("billing"),downstreamGb:z.number().min(0).max(10000000),costUsd:z.number().min(0).max(10000000) }).strict(),
  onOff("preset"), onOff("public_host"), onOff("moderator"),
  toggleReport("dismiss_report"), toggleReport("resolve_report"), toggleReport("remove_reported_message"),
]);
const known = new Set(["ONLINE_INPUT","ONLINE_PILOT_OFF","ONLINE_PILOT_METRICS_REQUIRED","ONLINE_OPEN_LIMIT","ONLINE_PUBLIC_LIMIT","ONLINE_MEMBER_GONE","ONLINE_REPORT_GONE","ONLINE_MESSAGE_GONE"]);
class RolloutError extends Error {}

async function db<T>(name: "online_room_admin_summary" | "online_room_admin_change" | "online_room_rtc_event" | "online_room_rtc_invalid", args: Record<string, unknown> = {}) {
  const key = config.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config.SUPABASE_URL || !key) throw new RolloutError("ONLINE_ROLLOUT_UNAVAILABLE");
  const response = await fetch(`${config.SUPABASE_URL.replace(/\/$/,"")}/rest/v1/rpc/${name}`, {
    method:"POST", body:JSON.stringify(args), signal:AbortSignal.timeout(8000),
    headers:{ apikey:key, ...(key.startsWith("sb_secret_") ? {} : { Authorization:`Bearer ${key}` }),"Content-Type":"application/json" },
  });
  const value = await response.json().catch(() => null);
  if (!response.ok || value === null) throw new RolloutError(known.has(value?.message) ? value.message : "ONLINE_ROLLOUT_UNAVAILABLE");
  return value as T;
}

function adminError(res: Response, error: unknown) {
  const code = error instanceof RolloutError ? error.message : "ONLINE_ROLLOUT_UNAVAILABLE";
  return res.status(code === "ONLINE_ROLLOUT_UNAVAILABLE" ? 503 : code === "ONLINE_INPUT" ? 400 : 409).json({ code });
}

export const onlineRoomAdmin = Router();
onlineRoomAdmin.use(requireAdmin);
onlineRoomAdmin.use((_req,res,next) => { res.set("Cache-Control","no-store"); next(); });
onlineRoomAdmin.get("/", async (_req,res) => {
  try { return res.json(await db("online_room_admin_summary")); }
  catch (error) { return adminError(res,error); }
});
onlineRoomAdmin.post("/", async (req,res) => {
  const parsed = adminInput.safeParse(req.body);
  if (!parsed.success) return adminError(res,new RolloutError("ONLINE_INPUT"));
  const data = parsed.data;
  try {
    await db("online_room_admin_change", {
      p_actor:req.userId!, p_op:data.op,
      ...("target" in data ? { p_target:data.target } : {}),
      ...("enabled" in data ? { p_enabled:data.enabled } : {}),
      ...("verified" in data ? { p_verified:data.verified } : {}),
      ...("downstreamGb" in data ? { p_downstream_gb:data.downstreamGb,p_cost_usd:data.costUsd } : {}),
      ...("openLimit" in data ? { p_open_limit:data.openLimit,p_public_limit:data.publicLimit } : {}),
    });
    return res.json(await db("online_room_admin_summary"));
  } catch (error) { return adminError(res,error); }
});

export function roomUsageEvent(event: WebhookEvent) {
  const prefix = "mindcanvas-";
  if (!event.room?.name.startsWith(prefix) || !["participant_joined","participant_left","room_finished"].includes(event.event)) return null;
  const room = id.safeParse(event.room.name.slice(prefix.length));
  if (!room.success || !/^RM_[A-Za-z0-9_-]{1,100}$/.test(event.room.sid)) return null;
  const at = new Date(Number(event.createdAt) * 1000);
  if (!Number.isFinite(at.getTime()) || at.getTime() <= 0) return null;
  if (event.event === "room_finished") return { p_room:room.data,p_room_sid:event.room.sid,p_event:event.event,p_at:at.toISOString() };
  const actor = id.safeParse(event.participant?.identity);
  if (!actor.success || !event.participant || !/^PA_[A-Za-z0-9_-]{1,100}$/.test(event.participant.sid)) return null;
  return { p_room:room.data,p_room_sid:event.room.sid,p_event:event.event,p_at:at.toISOString(),
    p_actor:actor.data,p_participant:event.participant.sid };
}

async function disconnectPeer(room: string,actor: string) {
  const live = meetingProvider();
  if (!live) return;
  try { await live.rooms.removeParticipant(`mindcanvas-${room}`,actor); }
  catch (error) {
    if (!(error instanceof ServerError) || (error.status !== 404 && error.code !== "not_found")) throw error;
  }
}

export async function onlineRoomWebhook(req: Request,res: Response) {
  const key = config.LIVEKIT_API_KEY?.trim(), secret = config.LIVEKIT_API_SECRET?.trim();
  if (!key || !secret) return res.sendStatus(503);
  if (typeof req.body !== "string" || !req.header("authorization")) return res.sendStatus(401);
  let event: WebhookEvent;
  try { event = await new WebhookReceiver(key,secret).receive(req.body,req.header("authorization")); }
  catch { return res.sendStatus(401); }
  const args = roomUsageEvent(event);
  if (!args) return res.sendStatus(204);
  try {
    const result = await db<{ tracked:boolean; allowed?:boolean; finished?:boolean }>("online_room_rtc_event",args);
    if (result.tracked && event.event === "participant_joined" && !result.allowed && !result.finished && args.p_actor) {
      await disconnectPeer(args.p_room,args.p_actor);
    }
    return res.sendStatus(204);
  } catch (error) {
    if (error instanceof RolloutError && error.message === "ONLINE_INPUT") return res.sendStatus(400);
    return res.sendStatus(503);
  }
}

export function startClassroomMediaReconciliation() {
  if (!config.LIVEKIT_API_KEY?.trim() || !config.LIVEKIT_API_SECRET?.trim() || !config.LIVEKIT_URL || !config.SUPABASE_SERVICE_ROLE_KEY) return;
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const targets = await db<{ room:string;actor:string }[]>("online_room_rtc_invalid");
      for (let i=0;i<targets.length;i+=10) await Promise.allSettled(targets.slice(i,i+10).map(x => disconnectPeer(x.room,x.actor)));
    } catch { /* The next scan will retry; standard room authorization remains enforced. */ }
    finally { running = false; }
  },30000);
  timer.unref();
}
