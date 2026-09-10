import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { generateGemini, clearGeminiCooldowns, modelOrder } from "../src/gemini.js";
const options = { apiKey: "test-key", baseUrl: "https://example.test", models: "gemini-3.8-flash,gemini-3.7-flash,gemini-2.5-flash", timeoutMs: 1000 };
const input = { text: "Document", documentId: "doc" };
const graph = { title: "Map", nodes: [{ id: "root", label: "Topic", parentId: null }], edges: [] };
const ok = (value = graph) => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] });
afterEach(clearGeminiCooldowns);
test("deduplicates model IDs preserving explicit priority", () => assert.deepEqual(modelOrder(" models/gemini-3.8-flash,gemini-3.8-flash,gemini-2.5-flash "), ["gemini-3.8-flash", "gemini-2.5-flash"]));
test("503 then 429 then success; key stays in header", async () => {
  const urls: string[] = [];
  const request: typeof fetch = async (url, init) => { urls.push(String(url)); assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "test-key"); return urls.length === 1 ? new Response(null, { status: 503 }) : urls.length === 2 ? new Response(null, { status: 429 }) : ok(); };
  const result = await generateGemini(input, options, request);
  assert.equal(result.model, "gemini-2.5-flash"); assert.equal(result.graph.sourceDocumentId, "doc");
  assert.ok(urls[0].includes("gemini-3.8-flash")); assert.ok(urls[1].includes("gemini-3.7-flash")); assert.ok(urls.every(url => !url.includes("test-key")));
});
test("403 stops without spending attempts on other models", async () => {
  let calls = 0; await assert.rejects(generateGemini(input, options, async () => { calls++; return new Response(null, { status: 403 }); }), /HTTP 403/); assert.equal(calls, 1);
});
test("missing key returns config error, never demo", async () => {
  await assert.rejects(generateGemini(input, { ...options, apiKey: "" }, async () => { throw new Error("must not call"); }), /GEMINI_API_KEY/);
});
test("timeout falls back", async () => {
  let calls = 0; const result = await generateGemini(input, options, async () => { if (++calls === 1) throw new DOMException("timeout", "TimeoutError"); return ok(); }); assert.equal(result.model, "gemini-3.7-flash");
});
test("broken graph references fall back", async () => {
  let calls = 0; const result = await generateGemini(input, options, async () => ++calls === 1 ? ok({ ...graph, nodes: [{ id: "root", label: "Topic", parentId: "missing" as any }] }) : ok()); assert.equal(result.model, "gemini-3.7-flash");
});
test("safety block stops without model fallback", async () => {
  let calls = 0; await assert.rejects(generateGemini(input, options, async () => { calls++; return Response.json({ promptFeedback: { blockReason: "SAFETY" } }); }), /chặn/); assert.equal(calls, 1);
});
test("all failed reports controlled errors, never demo or secret", async () => {
  await assert.rejects(generateGemini(input, options, async () => { throw new Error("test-key private document"); }), error => { const message = (error as Error).message; return message.includes("AI") === false && message.includes("NETWORK") && !message.includes("test-key") && !message.includes("private document"); });
});
test("Retry-After cooldown skips unavailable model on next request", async () => {
  const short = { ...options, models: "gemini-3.8-flash,gemini-2.5-flash" };
  let calls = 0; const request: typeof fetch = async () => ++calls === 1 ? new Response(null, { status: 429, headers: { "Retry-After": "60" } }) : ok();
  await generateGemini(input, short, request); await generateGemini(input, short, request); assert.equal(calls, 3);
});
