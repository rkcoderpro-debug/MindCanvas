import { test } from "node:test";
import assert from "node:assert/strict";
import { AiScheduler } from "../src/aiScheduler.js";
import { AIError } from "../src/gemini.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return { promise, resolve };
}

test("shares capacity fairly and allows only one active job per user", async () => {
  const scheduler = new AiScheduler(2, 10, 1000);
  const first = deferred<string>(), second = deferred<string>(), other = deferred<string>();
  const started: string[] = [];
  const a1 = scheduler.run("user-a", async () => { started.push("a1"); return first.promise; });
  const a2 = scheduler.run("user-a", async () => { started.push("a2"); return second.promise; });
  const b1 = scheduler.run("user-b", async () => { started.push("b1"); return other.promise; });
  await Promise.resolve();
  assert.deepEqual(started, ["a1", "b1"]);
  assert.deepEqual(scheduler.snapshot(), { active: 2, queued: 1 });
  first.resolve("first"); await a1; await Promise.resolve();
  assert.deepEqual(started, ["a1", "b1", "a2"]);
  second.resolve("second"); other.resolve("other");
  assert.deepEqual(await Promise.all([a2, b1]), ["second", "other"]);
  assert.deepEqual(scheduler.snapshot(), { active: 0, queued: 0 });
});

test("rejects excess queued work with a retryable AI_BUSY error", async () => {
  const scheduler = new AiScheduler(1, 1, 1000);
  const active = deferred<void>(), queued = deferred<void>();
  const first = scheduler.run("user-a", () => active.promise);
  const second = scheduler.run("user-b", () => queued.promise);
  await assert.rejects(scheduler.run("user-c", async () => undefined), error => {
    const typed = error as AIError;
    return typed.code === "AI_BUSY" && typed.status === 429 && typed.retryAfterSeconds === 15;
  });
  active.resolve(); await first; queued.resolve(); await second;
});

test("one account cannot fill the shared queue", async () => {
  const scheduler = new AiScheduler(1, 10, 1000, 1);
  const active = deferred<void>(), queued = deferred<void>();
  const first = scheduler.run("user-a", () => active.promise);
  const second = scheduler.run("user-a", () => queued.promise);
  await assert.rejects(scheduler.run("user-a", async () => undefined), (error: unknown) => (error as AIError).code === "AI_BUSY");
  const other = scheduler.run("user-b", async () => "available-for-another-user");
  assert.equal(scheduler.snapshot().queued, 2);
  active.resolve(); await first;
  queued.resolve(); await second;
  assert.equal(await other, "available-for-another-user");
});
