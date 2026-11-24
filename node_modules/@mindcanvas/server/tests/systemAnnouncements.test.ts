import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

test("only a verified admin can list or publish system announcements via the API", async () => {
  process.env.SUPABASE_URL = "https://unit.supabase.invalid";
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-role-key";
  process.env.ADMIN_EMAIL = "admin@example.test";
  const { systemAnnouncementsAdmin } = await import("../src/systemAnnouncements.js");
  const serviceCalls: { url: URL; data: unknown; headers?: HeadersInit }[] = [];
  const userId = "00000000-0000-4000-8000-000000000001";
  const requestId = "00000000-0000-4000-8000-000000000002";
  const item = { id: requestId, title: "Maintenance", body: "Scheduled notice.", published_at: "2026-11-24T12:30:00.000000+00:00" };
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "unit.supabase.invalid");
    if (url.pathname === "/auth/v1/user") {
      const access = new Headers(init?.headers).get("authorization");
      return /^Bearer (admin|member)$/.test(access ?? "")
        ? Response.json({ id: userId, email: access === "Bearer admin" ? "ADMIN@example.test" : "member@example.test" })
        : Response.json({}, { status: 401 });
    }
    serviceCalls.push({ url, headers: init?.headers, data: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.pathname.endsWith("/publish_system_announcement")) return Response.json(item);
    if (url.pathname === "/rest/v1/system_announcements") return Response.json([item]);
    throw new Error("Unexpected request");
  };
  const app = express();
  app.use(express.json());
  app.use("/api/admin/system-announcements", systemAnnouncementsAdmin);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const local = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/system-announcements`;
    const send = (token: string, body: Record<string, unknown>) => nativeFetch(local, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const draft = { requestId, title: " Maintenance ", body: "Scheduled notice." };
    assert.equal((await nativeFetch(local)).status, 401);
    assert.equal((await nativeFetch(local, { headers: { Authorization: "Bearer member" } })).status, 403);
    assert.equal((await send("member", draft)).status, 403);
    assert.equal((await send("unverified", draft)).status, 401);
    assert.equal((await send("admin", { ...draft, body: " " })).status, 400);
    assert.equal(serviceCalls.length, 0);

    const sent = await send("admin", draft);
    assert.equal(sent.status, 201);
    assert.equal(sent.headers.get("cache-control"), "no-store");
    assert.deepEqual(await sent.json(), { item });
    assert.deepEqual(serviceCalls[0].data, { p_id: requestId, p_admin: userId, p_title: item.title, p_body: item.body });
    assert.equal(new Headers(serviceCalls[0].headers).get("authorization"), "Bearer test-role-key");
    const history = new URL(local);
    history.searchParams.set("before", item.published_at); history.searchParams.set("beforeId", requestId);
    const archive = await nativeFetch(history, { headers: { Authorization: "Bearer admin" } });
    assert.equal(archive.status, 200);
    assert.deepEqual(await archive.json(), { items: [item], hasMore: false });
    assert.match(serviceCalls[1].url.searchParams.get("or") ?? "", /published_at.lt/);
  } finally {
    globalThis.fetch = nativeFetch;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
