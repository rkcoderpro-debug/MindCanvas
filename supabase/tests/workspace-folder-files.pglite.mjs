// Run with PGLITE_ENTRY=/absolute/path/to/pglite/dist/index.js node supabase/tests/workspace-folder-files.pglite.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.env.PGLITE_ENTRY) throw new Error("Set PGLITE_ENTRY to PGlite dist/index.js");
const url = pathToFileURL(process.env.PGLITE_ENTRY);
const { PGlite } = await import(url);
const { pgcrypto } = await import(new URL("./contrib/pgcrypto.js", url));
const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    grant usage on schema public,auth,storage to anon,authenticated;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text,metadata jsonb,primary key(bucket_id,name));
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
    alter table storage.objects enable row level security;
    grant select,insert,delete on storage.objects to authenticated;
  `);
  const migrate = name => readFile(new URL(`../migrations/${name}`, import.meta.url),"utf8");
  await db.exec(await migrate("0001_mindcanvas.sql"));
  await db.exec("grant select,insert,update,delete on folders,notes to authenticated;");
  const owner = "64000000-0000-4000-8000-000000000001", stranger = "64000000-0000-4000-8000-000000000002";
  const parent = "65000000-0000-4000-8000-000000000001", child = "65000000-0000-4000-8000-000000000002";
  const note = "65500000-0000-4000-8000-000000000001", file = "66000000-0000-4000-8000-000000000001";
  const otherFolder = "67000000-0000-4000-8000-000000000001", otherFile = "68000000-0000-4000-8000-000000000001";
  const state = (sql, params=[]) => db.query(sql,params);
  const first = async (sql, params=[]) => (await state(sql,params)).rows[0];
  await state("insert into auth.users(id) values ($1),($2)",[owner,stranger]);
  await state("insert into folders(id,user_id,name) values ($1,$2,'Kiến trúc máy tính')",[parent,owner]);
  await state("insert into notes(id,user_id,folder_id) values ($1,$2,$3)",[note,owner,parent]);
  const migration = await migrate("0044_workspace_folder_files.sql");
  await db.exec(migration);
  await db.exec(migration);
  const login = async who => {
    await db.exec("reset role; set role authenticated");
    await state("select set_config('request.jwt.claim.sub',$1,false)",[who]);
  };
  const mkdir = (id, who, dir) => state("insert into folders(id,user_id,parent_id,name) values ($1,$2,$3,'Bài tập')",[id,who,dir]);
  const addFile = (id, who, dir, size=4) => state("insert into workspace_files(id,user_id,folder_id,name,size_bytes) values ($1,$2,$3,'Bài 1.pcapng',$4)",[id,who,dir,size]);
  const upload = (path, length) => state("insert into storage.objects values ('workspace-files',$1,jsonb_build_object('size',$2::int))",[path,length]);
  const finish = async id => (await first("select finish_workspace_file($1) as ok",[id])).ok;
  const path = `${owner}/${file}`;
  const selected = async () => (await state("select id,folder_id,ready from workspace_files order by id")).rows;

  await login(owner);
  assert.deepEqual(await first("select parent_id from folders where id=$1",[parent]),{parent_id:null});
  await mkdir(child,owner,parent);
  await assert.rejects(mkdir(otherFolder,owner,otherFolder),/WORKSPACE_FOLDER_PARENT/);
  await assert.rejects(state("update folders set parent_id=$1 where id=$2",[child,parent]),/WORKSPACE_FOLDER_PARENT/);
  await assert.rejects(addFile(file,owner,parent,41943041),/size_bytes_check/);
  await assert.rejects(upload(path,4),/row-level security/);
  await addFile(file,owner,parent);
  assert.equal(await finish(file),false);
  await assert.rejects(state("update workspace_files set ready=true where id=$1",[file]),/permission denied/);
  await upload(path,6);
  assert.equal(await finish(file),false);
  await state("delete from storage.objects where name=$1",[path]);
  await upload(path,4);
  assert.equal(await finish(file),true);
  assert.equal((await selected())[0].ready,true);

  await login(stranger);
  assert.deepEqual((await state("select id from folders")).rows,[]);
  assert.deepEqual(await selected(),[]);
  assert.deepEqual((await state("select name from storage.objects where name=$1",[path])).rows,[]);
  assert.equal((await state("delete from storage.objects where name=$1 returning name",[path])).rows.length,0);
  assert.equal(await finish(file),false);
  await assert.rejects(mkdir(otherFolder,stranger,parent),/WORKSPACE_FOLDER_PARENT/);
  await assert.rejects(addFile(otherFile,stranger,child),/workspace_files_owned_folder_fk/);
  await assert.rejects(addFile(otherFile,owner,null),/row-level security/);
  await assert.rejects(upload(`${owner}/${otherFile}`,4),/row-level security/);
  await mkdir(otherFolder,stranger,null);

  await login(owner);
  await assert.rejects(state("update workspace_files set folder_id=$1 where id=$2",[otherFolder,file]),/workspace_files_owned_folder_fk/);
  await state("update workspace_files set folder_id=$1 where id=$2",[child,file]);
  assert.equal((await selected())[0].folder_id,child);
  await state("update workspace_files set folder_id=$1 where id=$2",[parent,file]);
  await state("delete from folders where id=$1",[parent]);
  assert.deepEqual(await first("select parent_id from folders where id=$1",[child]),{parent_id:null});
  assert.deepEqual(await first("select folder_id from notes where id=$1",[note]),{folder_id:null});
  assert.deepEqual(await selected(),[{ id:file, folder_id:null, ready:true }]);
  assert.equal((await state("select name from storage.objects where name=$1",[path])).rows.length,1);
  await state("delete from storage.objects where name=$1",[path]);
  await state("delete from workspace_files where id=$1",[file]);
  assert.deepEqual(await selected(),[]);
  await db.exec("reset role; set role anon");
  await assert.rejects(selected(),/permission denied/);
  await assert.rejects(finish(file),/permission denied/);
  console.log("Workspace folder SQL passed: migration replay, folder nesting, owner isolation, byte limit, private Storage, and safe folder deletion.");
} finally { await db.close(); }
