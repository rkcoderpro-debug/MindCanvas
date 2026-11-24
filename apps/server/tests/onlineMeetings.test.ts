import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
process.env.SUPABASE_URL = "https://supabase.unit.test";
process.env.SUPABASE_PUBLISHABLE_KEY = "unit-test-public-key";
const { config } = await import("../src/config.js");
const { onlineMeetings } = await import("../src/onlineMeetings.js");

test("meeting API issues a short room-only grant based on the server session and presenter permission", async t => {
  const user = "7a000000-0000-4000-8000-000000000001";
  const room = "7a000000-0000-4000-8000-000000000002";
  const client = "7a000000-0000-4000-8000-000000000003";
  const original = { ...config };
  const originalFetch = globalThis.fetch;
  Object.assign(config, {
    SUPABASE_URL: "https://supabase.unit.test", SUPABASE_SERVICE_ROLE_KEY: "service-test",
    LIVEKIT_URL: "wss://livekit.unit.test", LIVEKIT_API_KEY: "livekit-test-key", LIVEKIT_API_SECRET: "test-signing-key-not-for-production",
  });
  let screen = false, allowed = true;
  let dbRequest: unknown;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) {
      if (new Headers(init?.headers).get("Authorization") !== "Bearer active-user-session") return new Response(null, { status: 401 });
      return Response.json({ id: user });
    }
    if (url.endsWith("/rest/v1/rpc/online_meeting_session")) {
      dbRequest = JSON.parse(String(init?.body));
      return allowed ? Response.json({ name: "Learner", screen }) : Response.json({ message: "ONLINE_MEDIA_DENIED" }, { status: 400 });
    }
    throw new Error("Unexpected outbound request");
  });
  const app = express();
  app.use(express.json(), onlineMeetings);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  t.after(() => { server.close(); Object.assign(config, original); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/${room}/token`;
  const getGrant = (auth: string, data: object = { client }) => originalFetch(url, {
    method: "POST", headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  assert.equal((await getGrant("invalid")).status, 401);
  assert.equal((await getGrant("active-user-session", { client, actor: user })).status, 400);
  const response = await getGrant("active-user-session");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(dbRequest, { p_room: room, p_actor: user, p_client: client });
  const first = await response.json() as { token: string; url: string };
  assert.equal(first.url, "wss://livekit.unit.test/");
  const claims = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
  const attendee = claims(first.token);
  assert.equal(attendee.sub, user);
  assert.equal(attendee.video.room, `mindcanvas-${room}`);
  assert.equal(attendee.video.canPublishData, false);
  assert.ok(!attendee.video.roomAdmin);
  assert.equal(attendee.exp - attendee.nbf, 60);
  assert.deepEqual(attendee.video.canPublishSources, ["camera", "microphone"]);
  screen = true;
  const presenter = await (await getGrant("active-user-session")).json() as { token: string };
  assert.deepEqual(claims(presenter.token).video.canPublishSources, ["camera", "microphone", "screen_share", "screen_share_audio"]);
  allowed = false;
  assert.equal((await getGrant("active-user-session")).status, 403);
});

test("deletion uses the authenticated actor and succeeds after the database approves it, without a seat or live media", async t => {
  const owner = "7a000000-0000-4000-8000-000000000001";
  const guest = "7a000000-0000-4000-8000-000000000004";
  const room = "7a000000-0000-4000-8000-000000000002";
  const original = { ...config }, localFetch = globalThis.fetch;
  Object.assign(config, { SUPABASE_URL: "https://supabase.unit.test", SUPABASE_SERVICE_ROLE_KEY: "service-test" });
  const requests: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = String(input);
    const authorization = new Headers(init?.headers).get("Authorization");
    if (url.endsWith("/auth/v1/user")) {
      if (authorization === "Bearer host") return Response.json({ id: owner });
      if (authorization === "Bearer visitor") return Response.json({ id: guest });
      return new Response(null, { status: 401 });
    }
    if (url.endsWith("/rest/v1/rpc/delete_online_room")) {
      assert.equal(authorization,"Bearer service-test");
      const data = JSON.parse(String(init?.body));
      requests.push(data);
      return data.p_actor === owner ? Response.json({ deleted: true, kind: "music" }) : Response.json({ message: "ONLINE_HOST_ONLY" }, { status: 400 });
    }
    throw new Error("Unexpected outbound request");
  });
  const app = express();
  app.use(express.json(), onlineMeetings);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  t.after(() => { server.close(); Object.assign(config, original); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const remove = (token: string) => localFetch(`http://127.0.0.1:${address.port}/${room}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ actor: owner }),
  });
  assert.equal((await remove("invalid")).status, 401);
  assert.equal((await remove("visitor")).status, 403);
  const response = await remove("host");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.deepEqual(requests, [{ p_room: room, p_actor: guest }, { p_room: room, p_actor: owner }]);
});
