import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getHealthStatus } from "../src/health.js";

test("health reports the server package version", () => {
  const payload = getHealthStatus();
  const packageVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  assert.equal(payload.release, packageVersion);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "server");
  assert.equal(typeof payload.aiConfigured, "boolean");
});

test("health exposes only the documented public fields", () => {
  assert.deepEqual(Object.keys(getHealthStatus()).sort(), [
    "ai", "aiCapacity", "aiConfigured", "aiModelCount", "mode", "ok", "release",
  ]);
});
