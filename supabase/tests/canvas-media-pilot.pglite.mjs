// Isolated Postgres semantics test. Point PGLITE_ENTRY at the installed
// @electric-sql/pglite dist/index.js; does not connect to a Supabase project.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const pkg = process.env.PGLITE_ENTRY;
if (!pkg) throw new Error("Set PGLITE_ENTRY to the absolute path of @electric-sql/pglite/dist/index.js.");
const { PGlite } = await import(pathToFileURL(pkg));
const sql = async name => readFile(new URL("../migrations/" + name, import.meta.url), "utf8");
const db = new PGlite();
const owner = "a0000000-0000-4000-8000-000000000001";
const editor = "a0000000-0000-4000-8000-000000000002";
const viewer = "a0000000-0000-4000-8000-000000000003";
const outsider = "a0000000-0000-4000-8000-000000000004";
const project = "b0000000-0000-4000-8000-000000000001";
const otherProject = "b0000000-0000-4000-8000-000000000002";
const ref = "a".repeat(64), ref2 = "b".repeat(64);
const bucket = "canvas-media-private";
const compact = {
  type: "mindcanvas-board", version: 2, board: {
    id: project, media: [{ src: "mindcanvas-asset:" + ref }],
    background: { src: "mindcanvas-asset:" + ref }, embeds: [{ kind: "document", url: "mindcanvas-asset:" + ref2 }],
  },
};
const count = async table => (await db.query("select count(*)::int as n from " + table)).rows[0].n;
const actor = async id => {
  await db.exec("reset role; set role authenticated;");
  await db.query("select set_config('jwt.test.uid', $1, false)", [id]);
};
const insertObject = name => db.query("insert into storage.objects(bucket_id, name) values ($1,$2)", [bucket,name]);
const save = (data, base = 21) => db.query("update public.notes set content=$1, revision=revision+1 where id=$2 and revision=$3 returning revision", [JSON.stringify(data),project,base]);

try {
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''jwt.test.uid'', true), '''')::uuid';
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text not null, name text not null, unique (bucket_id, name));
    alter table storage.objects enable row level security;
    create table public.notes (id uuid primary key, user_id uuid not null, content jsonb not null default '{}', revision bigint default 21);
    create table public.project_members (project_id uuid, user_id uuid, role text);
    create table public.note_versions (note_id uuid, content jsonb);
    grant usage on schema storage,auth to authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
    alter table public.notes enable row level security;
    grant select, update on public.notes to authenticated;
  `);
  const collaboration = await sql("0011_v4_4_collaboration.sql");
  const accessFunctions = collaboration.slice(
    collaboration.indexOf("create or replace function public.can_access_project"),
    collaboration.indexOf("create or replace function public.log_project_activity"),
  );
  await db.exec(accessFunctions);
  await db.exec(`
    create policy read_note on public.notes for select to authenticated using (public.can_access_project(id, auth.uid()));
    create policy write_note on public.notes for update to authenticated using (public.can_edit_project(id, auth.uid()));
  `);
  await db.exec(await sql("0033_canvas_media_pilot.sql"));
  await db.query("insert into public.notes (id,user_id) values ($1,$2),($3,$2)", [project,owner,otherProject]);
  await db.query("insert into public.project_members values ($1,$2,'editor'),($1,$3,'viewer')",[project,editor,viewer]);
  await db.query("insert into public.canvas_media_pilot (project_id) values ($1)",[project]);

  await actor(owner);
  assert.equal((await db.query("select public.canvas_media_enabled($1) as enabled", [project])).rows[0].enabled, true);
  await assert.rejects(insertObject(otherProject + "/" + ref), /row-level security/);
  await assert.rejects(insertObject(project + "/bad"), /row-level security/);
  await insertObject(project + "/" + ref);
  await assert.rejects(save(compact), /not uploaded/);
  assert.equal((await db.query("select revision from public.notes where id=$1", [project])).rows[0].revision, 21);
  await actor(viewer);
  assert.equal(await count("storage.objects"), 1);
  await assert.rejects(insertObject(project + "/" + ref2), /row-level security/);
  assert.equal((await save(compact)).rows.length, 0);

  await actor(outsider);
  assert.equal(await count("storage.objects"), 0);
  await assert.rejects(insertObject(project + "/" + ref2), /row-level security/);

  await actor(editor);
  await insertObject(project + "/" + ref2);
  assert.equal((await save(compact)).rows[0].revision, 22);
  assert.equal((await save(compact)).rows.length, 0); // stale guard
  assert.equal((await db.query("delete from storage.objects returning name")).rows.length, 0);
  await assert.rejects(save({ type: "mindcanvas-board", version: 1, board: {} }, 22), /Update MindCanvas/);
  await db.exec("reset role;");
  assert.equal((await db.query("select converted from public.canvas_media_pilot")).rows[0].converted, true);
  await db.query("insert into public.note_versions values ($1,$2)", [project, JSON.stringify(compact)]);
  await db.exec("update public.canvas_media_pilot set allow_conversion=false;");
  await actor(owner);
  assert.equal((await db.query("select public.canvas_media_enabled($1) as enabled", [project])).rows[0].enabled, true);
  assert.equal((await save(compact,22)).rows[0].revision,23);
  console.log("Postgres smoke passed: private storage, opt-in, role permissions, atomic validation, revision guard, and legacy downgrade protection.");
} finally {
  await db.close();
}
