-- Global, lazy rollout. Enable the singleton switch after deploying a v2 reader.
-- No bulk rewrite or upload is performed by this migration.
begin;

create table if not exists public.canvas_media_rollout (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into public.canvas_media_rollout (singleton) values (true) on conflict do nothing;
alter table public.canvas_media_rollout enable row level security;
revoke all on public.canvas_media_rollout from public, anon, authenticated;

create or replace function public.canvas_media_global_enabled()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select enabled from public.canvas_media_rollout where singleton), false); $$;
revoke all on function public.canvas_media_global_enabled() from public, anon, authenticated;

-- Reserve a draft UUID before uploading its first assets, without publishing an
-- empty note. Only that authenticated user may use the prefix before the INSERT.
create table if not exists public.canvas_media_drafts (
  project_id uuid primary key,
  user_id uuid not null,
  expires_at timestamptz not null
);
create index if not exists canvas_media_drafts_user_idx on public.canvas_media_drafts(user_id, expires_at);
alter table public.canvas_media_drafts enable row level security;
revoke all on public.canvas_media_drafts from public, anon, authenticated;

create or replace function public.canvas_media_reserve_draft(p_project_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  reserved uuid;
begin
  if actor is null or p_project_id is null then
    raise exception 'Canvas draft is unavailable' using errcode = '42501';
  end if;
  if not public.canvas_media_global_enabled() then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mindcanvas:draft:' || actor::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mindcanvas:project:' || p_project_id::text, 0));
  if exists (select 1 from public.notes where id = p_project_id) then
    raise exception 'Canvas already exists' using errcode = '23505';
  end if;
  if not exists (select 1 from public.canvas_media_drafts where project_id = p_project_id and user_id = actor) then
    if (select count(*) from public.canvas_media_drafts where user_id = actor and expires_at > now()) >= 20 then
      raise exception 'Too many unfinished canvas uploads' using errcode = 'P0001';
    end if;
    if exists (select 1 from storage.objects where bucket_id = 'canvas-media-private' and name like p_project_id::text || '/%') then
      raise exception 'Canvas draft is unavailable' using errcode = '42501';
    end if;
  end if;
  insert into public.canvas_media_drafts as d(project_id, user_id, expires_at)
    values (p_project_id, actor, now() + interval '1 hour')
    on conflict (project_id) do update set expires_at = excluded.expires_at where d.user_id = actor
    returning project_id into reserved;
  if reserved is null then raise exception 'Canvas draft is unavailable' using errcode = '42501'; end if;
  return true;
end;
$$;
revoke all on function public.canvas_media_reserve_draft(uuid) from public, anon, authenticated;
grant execute on function public.canvas_media_reserve_draft(uuid) to authenticated;

create or replace function public.canvas_media_owns_pending_draft(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.canvas_media_drafts d
    where d.project_id = p_project_id and d.user_id = auth.uid() and d.expires_at > now()
  ) and not exists (select 1 from public.notes n where n.id = p_project_id);
$$;
revoke all on function public.canvas_media_owns_pending_draft(uuid) from public, anon, authenticated;
grant execute on function public.canvas_media_owns_pending_draft(uuid) to authenticated;

create or replace function public.canvas_media_enabled(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and public.can_edit_project(p_project_id, auth.uid())
    and exists (select 1 from public.notes n where n.id = p_project_id and n.deleted_at is null)
    and (public.canvas_media_global_enabled() or exists (
      select 1 from public.canvas_media_pilot p where p.project_id = p_project_id and (p.allow_conversion or p.converted)
    ));
$$;

create or replace function public.canvas_media_draft_upload_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.canvas_media_global_enabled();
$$;
revoke all on function public.canvas_media_draft_upload_enabled() from public, anon, authenticated;
grant execute on function public.canvas_media_draft_upload_enabled() to authenticated;

drop policy if exists "Canvas pilot media read" on storage.objects;
create policy "Canvas pilot media read" on storage.objects for select to authenticated
using (bucket_id = 'canvas-media-private' and (
  public.can_access_project(public.canvas_media_path_project(name), (select auth.uid()))
  or public.canvas_media_owns_pending_draft(public.canvas_media_path_project(name))
));
drop policy if exists "Canvas pilot media insert" on storage.objects;
create policy "Canvas pilot media insert" on storage.objects for insert to authenticated
with check (bucket_id = 'canvas-media-private' and (
  public.canvas_media_enabled(public.canvas_media_path_project(name))
  or (public.canvas_media_owns_pending_draft(public.canvas_media_path_project(name))
      and public.canvas_media_draft_upload_enabled())
));

-- Account quota includes the current canvas's unique referenced files.
alter table public.notes add column if not exists canvas_media_bytes bigint not null default 0 check (canvas_media_bytes >= 0);

create or replace function public.canvas_media_reference_bytes(p_project uuid, p_content jsonb)
returns bigint language sql stable security definer set search_path = '' as $$
  with b as (select p_content -> 'board' as board), refs as (
    select e ->> 'src' as ref from b, jsonb_array_elements(b.board -> 'media') e
    union select board #>> '{background,src}' from b
    union select e ->> 'url' from b, jsonb_array_elements(b.board -> 'embeds') e where e ->> 'kind' = 'document'
  )
  select coalesce(sum(case when o.metadata ->> 'size' ~ '^[0-9]{1,12}$' then (o.metadata ->> 'size')::bigint else 0 end), 0)::bigint
  from refs join storage.objects o on o.bucket_id = 'canvas-media-private' and o.name = p_project::text || '/' || substring(ref from 18)
  where ref ~ '^mindcanvas-asset:[a-f0-9]{64}$';
$$;
revoke all on function public.canvas_media_reference_bytes(uuid,jsonb) from public, anon, authenticated;

create or replace function public.canvas_media_guard_note()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  compact boolean := coalesce(new.content ->> 'type' = 'mindcanvas-board' and new.content -> 'version' = '2'::jsonb, false);
  was_compact boolean := false;
  draft_owner uuid;
begin
  if tg_op = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mindcanvas:project:' || new.id::text, 0));
    select user_id into draft_owner from public.canvas_media_drafts where project_id = new.id for update;
    if draft_owner is not null and draft_owner <> new.user_id then
      raise exception 'Canvas draft is unavailable' using errcode = '42501';
    end if;
    if draft_owner is null and exists (select 1 from storage.objects where bucket_id = 'canvas-media-private' and name like new.id::text || '/%') then
      raise exception 'Canvas draft is unavailable' using errcode = '42501';
    end if;
  else
    was_compact := coalesce(old.content ->> 'type' = 'mindcanvas-board' and old.content -> 'version' = '2'::jsonb, false);
  end if;
  if not compact then
    if was_compact or exists (select 1 from public.canvas_media_pilot where project_id = new.id and converted) then
      raise exception 'Update MindCanvas before editing this canvas' using errcode = '23514';
    end if;
    new.canvas_media_bytes := 0;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not (public.canvas_media_global_enabled() and draft_owner is not null and draft_owner = new.user_id
      and public.canvas_media_owns_pending_draft(new.id)) then
      raise exception 'Canvas draft is unavailable' using errcode = '42501';
    end if;
  elsif not (was_compact or public.canvas_media_global_enabled() or exists (
    select 1 from public.canvas_media_pilot where project_id = new.id and (allow_conversion or converted)
  )) then
    raise exception 'Canvas media pilot is disabled for this project' using errcode = '23514';
  end if;
  perform public.canvas_media_validate_references(new.id, new.content);
  new.canvas_media_bytes := public.canvas_media_reference_bytes(new.id, new.content);
  return new;
end;
$$;

-- A metadata-only client write cannot spoof the computed size. If both content
-- and size are supplied, this trigger runs before the reference validator.
create or replace function public.canvas_media_reset_client_bytes()
returns trigger language plpgsql set search_path = '' as $$
begin new.canvas_media_bytes := old.canvas_media_bytes; return new; end;
$$;
drop trigger if exists canvas_media_bytes_server_owned on public.notes;
create trigger canvas_media_bytes_server_owned before update of canvas_media_bytes on public.notes
for each row execute function public.canvas_media_reset_client_bytes();

create or replace function public.canvas_media_mark_converted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.content ->> 'type' = 'mindcanvas-board' and new.content -> 'version' = '2'::jsonb then
    insert into public.canvas_media_pilot(project_id, allow_conversion, converted) values (new.id, false, true)
      on conflict (project_id) do update set converted = true where not canvas_media_pilot.converted;
    if tg_op = 'INSERT' then delete from public.canvas_media_drafts where project_id = new.id; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.canvas_media_mark_converted() from public, anon, authenticated;
drop trigger if exists canvas_media_mark_converted on public.notes;
create trigger canvas_media_mark_converted after insert or update of content on public.notes
for each row execute function public.canvas_media_mark_converted();

create or replace function public.recompute_account_storage_for_user(p_user_id uuid)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_total bigint;
begin
  select
    coalesce((select sum((pg_column_size(n.content)::bigint + n.canvas_media_bytes)) from public.notes n where n.user_id = p_user_id), 0)
    + coalesce((select sum(d.file_size_bytes)::bigint from public.documents d where d.user_id = p_user_id), 0)
  into v_total;
  v_total := greatest(0, coalesce(v_total, 0));
  insert into public.account_storage (user_id, storage_bytes, updated_at)
  values (p_user_id, v_total, timezone('utc', now()))
  on conflict (user_id) do update set
    storage_bytes = excluded.storage_bytes,
    updated_at = excluded.updated_at;
  return v_total;
end;
$$;


create or replace function public.guard_account_storage()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := NEW.user_id;
  v_existing bigint := 0;
  v_new_bytes bigint := 0;
  v_old_bytes bigint := 0;
  v_limit bigint;
begin
  select case
    when (ae.status is null or ae.status = 'active')
      and (ae.expires_at is null or ae.expires_at > now())
      then coalesce(p.storage_limit_bytes, free_plan.storage_limit_bytes)
    else free_plan.storage_limit_bytes
  end
  into v_limit
  from public.plans free_plan
  left join public.account_entitlements ae on ae.user_id = v_user_id
  left join public.plans p on p.id = ae.plan_id
  where free_plan.id = 'free'
  limit 1;

  if TG_TABLE_NAME = 'notes' then
    v_new_bytes := pg_column_size(NEW.content)::bigint + NEW.canvas_media_bytes;
    if TG_OP = 'UPDATE' then
      v_old_bytes := pg_column_size(OLD.content)::bigint + OLD.canvas_media_bytes;
    end if;
    select coalesce((select sum((pg_column_size(n.content)::bigint + n.canvas_media_bytes)) from public.notes n where n.user_id = v_user_id and n.id <> NEW.id), 0)
      + coalesce((select sum(d.file_size_bytes)::bigint from public.documents d where d.user_id = v_user_id), 0)
    into v_existing;
  else
    v_new_bytes := coalesce(NEW.file_size_bytes, 0);
    if TG_OP = 'UPDATE' then
      v_old_bytes := coalesce(OLD.file_size_bytes, 0);
    end if;
    select coalesce((select sum((pg_column_size(n.content)::bigint + n.canvas_media_bytes)) from public.notes n where n.user_id = v_user_id), 0)
      + coalesce((select sum(d.file_size_bytes)::bigint from public.documents d where d.user_id = v_user_id and d.id <> NEW.id), 0)
    into v_existing;
  end if;

  if v_existing + v_new_bytes > v_limit and (TG_OP = 'INSERT' or v_new_bytes > v_old_bytes) then
    raise exception 'Storage quota exceeded for this account'
      using errcode = 'P0001', detail = json_build_object('limitBytes', v_limit, 'usedBytes', v_existing, 'requestedBytes', v_new_bytes)::text;
  end if;
  return NEW;
end;
$$;


commit;
