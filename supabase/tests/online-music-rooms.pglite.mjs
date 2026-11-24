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
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema realtime; create schema storage;
    grant usage on schema public,auth,realtime,storage to anon,authenticated,service_role;
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
  const meetings = await readFile(new URL("../migrations/0040_online_meeting_rooms.sql", import.meta.url), "utf8");
  await db.exec(meetings);
  await db.exec(meetings);
  const host = "7a000000-0000-4000-8000-000000000001", guest = "7a000000-0000-4000-8000-000000000002";
  const hostClient = "8a000000-0000-4000-8000-000000000001", guestClient = "8a000000-0000-4000-8000-000000000002";
  const piano = "60000000-0000-4000-8000-000000000001";
  const value = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
  const user = async id => {
    await db.exec("reset role; set role authenticated");
    await value("select set_config('request.jwt.claim.sub',$1,false) as value", [id]);
  };
  const service = () => db.exec("reset role; set role service_role");
  const unwrap = () => db.exec("reset role");
  await db.query("insert into auth.users(id) values ($1),($2)", [host, guest]);
  await db.query("update online_rooms set play_at=now()-interval '1 hour' where id=$1", [piano]);
  await user(host);
  assert.equal((await value("select join_online_room($1,$2) as value", [piano, hostClient])).state, "active");
  const playing = (await value("select read_online_room($1,$2) as value", [piano, hostClient])).playback;
  assert.equal(playing.video_id, "3Lfr3BhvkQY");
  assert.ok(playing.loop && playing.playing && Date.now() - Date.parse(playing.at) < 5000);
  await user(guest);
  assert.equal((await value("select join_online_room($1,$2) as value", [piano, guestClient])).state, "active");
  assert.equal((await value("select read_online_room($1,$2) as value", [piano, guestClient])).playback.revision, playing.revision);
  await user(host);
  assert.equal(await value("select ping_online_room($1,$2,true) as value", [piano, hostClient]), "left");
  await unwrap();
  assert.equal(await value("select video_id is null and not music_enabled as value from online_rooms where id='60000000-0000-4000-8000-000000000002'"), true);

  await user(host);
  const meeting = await value("select create_online_meeting_room('Team study','Algebra','private','table',true) as value");
  assert.equal((await value("select join_online_room($1,$2) as value", [meeting, hostClient])).state, "active");
  const state = await value("select read_online_room($1,$2) as value", [meeting, hostClient]);
  assert.equal(state.room.kind, "meeting");
  assert.equal(state.room.layout, "table");
  assert.equal(state.room.music_enabled, false);
  assert.equal(state.presenter_id, host);
  await assert.rejects(value("select online_meeting_session($1,$2,$3) as value", [meeting, host, hostClient]), /permission denied/);
  await assert.rejects(value("select online_meeting_manage($1,$2,$3,'close') as value", [meeting, host, hostClient]), /permission denied/);
  await assert.rejects(value("select act_online_room($1,$2,'close') as value", [meeting, hostClient]), /ONLINE_MEDIA_API_REQUIRED/);
  const invitation = (await value("select act_online_room($1,$2,'invite') as value", [meeting, hostClient])).invite;
  await user(guest);
  assert.equal((await value("select join_online_room($1,$2,$3) as value", [meeting, guestClient, invitation])).state, "waiting");
  await service();
  const media = (actor, client, room = meeting) => value("select online_meeting_session($1,$2,$3) as value", [room, actor, client]);
  const manage = (actor, client, command, target = null) => value("select online_meeting_manage($1,$2,$3,$4,$5) as value", [meeting, actor, client, command, target]);
  assert.equal((await media(host, hostClient)).screen, true);
  await assert.rejects(media(host, guestClient), /ONLINE_MEDIA_DENIED/);
  await assert.rejects(media(guest, guestClient), /ONLINE_MEDIA_DENIED/);
  await assert.rejects(media(guest, guestClient, piano), /ONLINE_MEDIA_DENIED/);
  await user(host);
  await value("select act_online_room($1,$2,'admit',jsonb_build_object('id',$3::uuid)) as value", [meeting, hostClient, guest]);
  await user(guest);
  assert.equal((await value("select join_online_room($1,$2) as value", [meeting, guestClient])).state, "active");
  await value("select act_online_room($1,$2,'hand',jsonb_build_object('raised',true)) as value", [meeting, guestClient]);
  await value("select act_online_room($1,$2,'reaction',jsonb_build_object('reaction','clap')) as value", [meeting, guestClient]);
  await assert.rejects(value("select act_online_room($1,$2,'reaction',jsonb_build_object('reaction','heart')) as value", [meeting, guestClient]), /ONLINE_RATE/);
  await user(host);
  const person = (await value("select read_online_room($1,$2) as value", [meeting, hostClient])).members.find(member => member.id === guest);
  assert.ok(person.hand_raised_at);
  assert.equal(person.reaction, "clap");
  await service();
  assert.equal((await media(guest, guestClient)).screen, false);
  await assert.rejects(manage(guest, guestClient, "presenter", guest), /ONLINE_HOST_ONLY/);
  assert.equal((await manage(host, hostClient, "presenter", guest)).presenter, guest);
  assert.equal((await media(host, hostClient)).screen, false);
  assert.equal((await media(guest, guestClient)).screen, true);
  assert.equal((await manage(host, hostClient, "presenter")).presenter, host);
  assert.equal((await manage(host, hostClient, "transfer", guest)).presenter, guest);
  assert.equal((await manage(guest, guestClient, "remove", host)).presenter, guest);
  await assert.rejects(media(host, hostClient), /ONLINE_MEDIA_DENIED/);
  assert.equal((await manage(guest, guestClient, "close")).state, "closed");
  await assert.rejects(media(guest, guestClient), /ONLINE_MEDIA_DENIED/);
  console.log("Meetings SQL passed: piano first arrival, invitations, media admission, distinct tab binding, reactions, presenter transfer, removal, and closure.");
} finally {
  await db.close();
}
