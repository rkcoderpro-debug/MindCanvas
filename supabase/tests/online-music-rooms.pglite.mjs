// Run with PGLITE_ENTRY=/absolute/path/to/pglite/dist/index.js node supabase/tests/online-music-rooms.pglite.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.env.PGLITE_ENTRY) throw new Error("Set PGLITE_ENTRY to the installed PGlite dist/index.js.");
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_ENTRY));
const db = new PGlite();
try {
  // Minimal Supabase auth, profile, storage and Realtime schema for local SQL checks.
  // The event sink stands in for the hosted Realtime service.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema realtime; create schema storage;
    grant usage on schema public,auth,realtime,storage to anon,authenticated;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create table public.profiles(id uuid primary key,display_name text,avatar_url text);
    create table public.account_profile_details(user_id uuid primary key,avatar_slot smallint,avatar_revision uuid);
    create table storage.objects(bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select on storage.objects to authenticated;
    create table realtime.messages(topic text,extension text,payload jsonb,private boolean);
    alter table realtime.messages enable row level security;
    grant select,insert on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
    create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$
      insert into realtime.messages values ($3,'broadcast',$1,$4)
    $$;
    insert into auth.users(id) values ('70000000-0000-4000-8000-000000000001');
  `);
  const migration = await readFile(new URL("../migrations/0039_online_music_rooms.sql", import.meta.url), "utf8");
  await db.exec(migration);
  await db.exec(migration);
  await db.exec("set role authenticated; select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',false)");
  const { rows } = await db.query("select list_online_rooms() as lobby");
  assert.equal(rows[0].lobby.rooms.length, 2);
  await db.exec("reset role");
  await db.exec(await readFile(new URL("../verification/online_music_rooms.sql", import.meta.url), "utf8"));
  console.log("Online Rooms SQL passed: migration replay, private membership, moderation, capacity, tab switching, chat and playback.");
} finally {
  await db.close();
}
