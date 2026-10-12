import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cases = [
  ["publishable", "anon", "publishable"],
  [undefined, "anon", "anon"],
  ["", "anon", "anon"],
  [" \t ", "anon", "anon"],
  ["  publishable  ", "anon", "publishable"],
  ["", "  anon  ", "anon"],
  [undefined, undefined, null],
  ["", "", null],
  ["  ", "  ", null],
] as const;

for (const [publishable, anon, expected] of cases) {
  test(`server key selection: publishable=${JSON.stringify(publishable)}, anon=${JSON.stringify(anon)}`, () => {
    const env = { ...process.env, SUPABASE_URL: "https://example.supabase.co" };
    for (const [name, value] of [["SUPABASE_PUBLISHABLE_KEY", publishable], ["SUPABASE_ANON_KEY", anon]] as const) {
      // Pin absent values to blank so a developer's local .env cannot inject
      // live credentials into this isolated configuration check.
      env[name] = value ?? "";
    }
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
      'const c = await import("./src/config.ts"); console.log(JSON.stringify({key: c.supabaseKey ?? null, configured: c.hasSupabase}));',
    ], { cwd: fileURLToPath(new URL("../", import.meta.url)), env, encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 0, "Isolated configuration process must start successfully");
    const output = JSON.parse(result.stdout.trim().split("\n").at(-1)!);
    assert.deepEqual(output, { key: expected, configured: Boolean(expected) });
  });
}
