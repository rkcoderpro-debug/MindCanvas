// Run against embedded Postgres: PGLITE_ENTRY=/absolute/path/to/pglite/dist/index.js node supabase/tests/quiz-studio.pglite.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.env.PGLITE_ENTRY) throw new Error("Set PGLITE_ENTRY to the installed PGlite dist/index.js.");
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_ENTRY));
const db = new PGlite();
const sql = name => readFile(new URL("../migrations/" + name, import.meta.url), "utf8");
const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const id = n => "20000000-0000-4000-8000-" + String(n).padStart(12, "0");
const question = n => ({ id: "q" + n, prompt: "Evaluate $x^2$ for x ≤ 2. " + n, options: ["One", "Two", "Three", "Four"], correctIndex: 1, explanation: "", sourcePage: null });
const create = (quizId, questions, mode = "ai_manual") => db.query("select public.create_quiz_studio($1, $2, $3, $4, $5) as quiz", [quizId, "Algebra", "", JSON.stringify(questions), mode]);
const actor = async (role, uid = "") => {
  await db.exec("reset role; set role " + role);
  await db.query("select set_config('jwt.test.uid', $1, false)", [uid]);
};
const usage = async uid => {
  await db.exec("reset role");
  return (await db.query("select ai_manual_count, ai_manual_reserved from public.usage_daily where user_id=$1", [uid])).rows;
};
try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''jwt.test.uid'', true), '''')::uuid';
    create table auth.users(id uuid primary key);
    create table public.documents(id uuid primary key references auth.users);
    create table public.plans(id text primary key, active boolean not null default true, max_cards integer, ai_auto_daily_limit integer, ai_manual_daily_limit integer, ai_manual_included boolean);
    create table public.account_entitlements(user_id uuid primary key references auth.users, plan_id text references public.plans, status text, expires_at timestamptz);
    insert into public.plans values ('free',true,3,1,1,false), ('pro',true,200,30,0,true);
  `);
  await db.query("insert into auth.users values ($1),($2)", [owner, other]);
  const quota = await sql("0007_v4_quota_subscriptions.sql");
  await db.exec(quota.slice(quota.indexOf("create table if not exists public.addons"), quota.indexOf("create table if not exists public.subscription_history")));
  await db.exec(quota.slice(quota.indexOf("create or replace function public.current_ai_period_start"), quota.indexOf("create or replace function public.release_ai_usage")));
  const quiz = await sql("0009_v4_3_learning_hub.sql");
  await db.exec(quiz.slice(quiz.indexOf("create table if not exists public.quiz_tests"), quiz.indexOf("create index if not exists quiz_tests_user_updated_idx")));
  await db.exec(await sql("0035_quiz_studio_manual.sql"));

  await actor("anon");
  await assert.rejects(create(id(1), [question(1)]), { code: "42501" });

  await actor("authenticated", owner);
  await assert.rejects(create(id(1), [1, 2, 3, 4].map(question)), { code: "MCQ01", detail: "3" });
  await assert.rejects(create(id(1), [{ ...question(1), options: ["A", "a", "B", "C"] }]), { code: "22023" });
  assert.deepEqual(await usage(owner), []);

  await actor("authenticated", other);
  assert.equal((await create(id(1), [question(1)], "manual")).rows[0].quiz.user_id, other);
  assert.deepEqual(await usage(other), []);

  await actor("authenticated", owner);
  // A same-ID save for a different owner fails after reserve, which must roll back.
  await assert.rejects(create(id(1), [question(2)]), { code: "23505" });
  assert.deepEqual(await usage(owner), []);

  await actor("authenticated", owner);
  const first = (await create(id(2), [question(1)])).rows[0].quiz;
  assert.equal(first.questions[0].prompt, question(1).prompt);
  assert.deepEqual((await create(id(2), [question(2)])).rows[0].quiz, first);
  await assert.rejects(create(id(3), [question(3)]), { code: "P0001" });
  assert.equal((await create(id(3), [question(3)], "manual")).rows[0].quiz.id, id(3));
  assert.deepEqual(await usage(owner), [{ ai_manual_count: 1, ai_manual_reserved: 0 }]);

  await db.query("insert into public.account_entitlements values ($1, 'pro', 'active', now() + interval '1 day')", [owner]);
  await actor("authenticated", owner);
  await assert.rejects(create(id(4), Array.from({ length: 101 }, (_, n) => question(n)), "manual"), { code: "MCQ01", detail: "100" });
  const proQuiz = (await create(id(4), Array.from({ length: 70 }, (_, n) => question(n)), "manual")).rows[0].quiz;
  assert.equal(proQuiz.questions.length, 70);
  console.log("Quiz Studio SQL: access, plan limit, validation, transactional usage, retry and manual mode passed.");
} finally {
  await db.close();
}
