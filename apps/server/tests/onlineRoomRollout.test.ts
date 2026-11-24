import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import express from "express";
import { AccessToken } from "livekit-server-sdk";

process.env.SUPABASE_URL = "https://supabase.unit.test";
process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable";
const { config } = await import("../src/config.js");
const { onlineRoomWebhook, onlineRoomAdmin } = await import("../src/onlineRoomRollout.js");

test("room deployment accepts only signed provider usage and restricts the rollout console to admin", async t => {
  const past = { ...config };
  const webFetch = globalThis.fetch;
  const id = "7a000000-0000-4000-8000-000000000001", room = "7a000000-0000-4000-8000-000000000002";
  const key = "lk-unit-key", secret = "lk-unit-secret-not-for-use";
  Object.assign(config,{ SUPABASE_SERVICE_ROLE_KEY:"service-test",ADMIN_EMAIL:"manager@unit.test",LIVEKIT_API_KEY:key,LIVEKIT_API_SECRET:secret });
  let rtcRequest:Record<string,unknown>|undefined, changeRequest:Record<string,unknown>|undefined;
  t.mock.method(globalThis,"fetch",async (url,init) => {
    const path = new URL(String(url)).pathname;
    const credential = new Headers(init?.headers).get("authorization");
    if (path === "/auth/v1/user") return Response.json({ id,email:credential === "Bearer admin" ? "manager@unit.test" : "learner@unit.test" });
    assert.equal(credential,"Bearer service-test");
    if (path.endsWith("/online_room_rtc_event")) {
      rtcRequest = JSON.parse(String(init?.body));
      return Response.json({ tracked:true,allowed:true });
    }
    if (path.endsWith("/online_room_admin_change")) changeRequest = JSON.parse(String(init?.body));
    return Response.json({ ok:true });
  });
  const app = express();
  app.post("/webhook",express.text({ type:"application/webhook+json" }),onlineRoomWebhook);
  app.use("/admin",express.json(),onlineRoomAdmin);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const s = app.listen(0,"127.0.0.1",() => resolve(s));
  });
  t.after(() => { server.close(); Object.assign(config,past); });
  const addr = server.address();
  assert.ok(addr && typeof addr !== "string");
  const base = `http://127.0.0.1:${addr.port}`;
  const body = JSON.stringify({ event:"participant_joined",room:{ sid:"RM_123",name:`mindcanvas-${room}` },participant:{ sid:"PA_123",identity:id },createdAt:String(Math.floor(Date.now()/1000)) });
  const token = new AccessToken(key,secret,{ ttl:"60s" });
  token.sha256 = createHash("sha256").update(body).digest("base64");
  assert.equal((await webFetch(base+"/webhook",{ method:"POST",headers:{ "Content-Type":"application/webhook+json" },body })).status,401);
  assert.equal(rtcRequest,undefined);
  assert.equal((await webFetch(base+"/webhook",{ method:"POST",headers:{ "Content-Type":"application/webhook+json",Authorization:await token.toJwt() },body })).status,204);
  assert.deepEqual(rtcRequest,{ p_actor:id,p_event:"participant_joined",p_participant:"PA_123",p_room:room,p_room_sid:"RM_123",p_at:new Date(Number(JSON.parse(body).createdAt)*1000).toISOString() });
  assert.equal((await webFetch(base+"/admin",{ headers:{ Authorization:"Bearer learner" } })).status,403);
  assert.equal((await webFetch(base+"/admin",{ method:"POST",headers:{ Authorization:"Bearer admin","Content-Type":"application/json" },body:JSON.stringify({ op:"billing",downstreamGb:3,costUsd:0 }) })).status,200);
  assert.deepEqual(changeRequest,{ p_actor:id,p_op:"billing",p_downstream_gb:3,p_cost_usd:0 });
});
