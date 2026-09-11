import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { requireUser } from "../src/auth.js";
import { hasSupabase } from "../src/config.js";

test("protected routes fail closed when Supabase authentication is not configured", async (context) => {
  if (hasSupabase) { context.skip("The test environment has live Supabase configuration."); return; }
  let status = 0, payload: unknown, continued = false;
  const request = { header: () => undefined } as unknown as Request;
  const response = {
    status(code: number) { status = code; return this; },
    json(value: unknown) { payload = value; return this; },
  } as unknown as Response;
  const next = (() => { continued = true; }) as NextFunction;
  await requireUser(request, response, next);
  assert.equal(status, 503); assert.equal(continued, false);
  assert.deepEqual(payload, { error: "Supabase authentication is not configured." });
});
