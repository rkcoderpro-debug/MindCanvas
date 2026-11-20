-- Additive, opt-in per existing canvas. Do not enable a canvas until its
-- clients can read the version-2 format. No existing note is rewritten here.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('canvas-media-private', 'canvas-media-private', false, 57671680, array['application/octet-stream'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.canvas_media_pilot (
  project_id uuid primary key references public.notes(id) on delete cascade,
  allow_conversion boolean not null default true,
  converted boolean not null default false
);
alter table public.canvas_media_pilot enable row level security;
revoke all on public.canvas_media_pilot from public, anon, authenticated;

create or replace function public.canvas_media_enabled(p_project_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and public.can_edit_project(p_project_id, auth.uid())
    and exists (select 1 from public.canvas_media_pilot p
                where p.project_id = p_project_id and (p.allow_conversion or p.converted));
$$;
revoke all on function public.canvas_media_enabled(uuid) from public, anon;
grant execute on function public.canvas_media_enabled(uuid) to authenticated;

-- Cast only exact UUID/digest paths; callers cannot pick a different bucket or
-- arbitrary Storage key via a canvas reference.
create or replace function public.canvas_media_path_project(p_path text)
returns uuid language sql immutable set search_path = ''
as $$
  select case when p_path ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/[a-f0-9]{64}$'
    then split_part(p_path, '/', 1)::uuid else null end;
$$;
revoke all on function public.canvas_media_path_project(text) from public, anon;
grant execute on function public.canvas_media_path_project(text) to authenticated;

drop policy if exists "Canvas pilot media read" on storage.objects;
create policy "Canvas pilot media read" on storage.objects for select to authenticated
using (
  bucket_id = 'canvas-media-private'
  and public.can_access_project(public.canvas_media_path_project(name), (select auth.uid()))
);
drop policy if exists "Canvas pilot media insert" on storage.objects;
create policy "Canvas pilot media insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'canvas-media-private'
  and public.canvas_media_enabled(public.canvas_media_path_project(name))
);
-- No client UPDATE, overwrite or DELETE: historical revisions can still use
-- these files. Do not reuse this bucket for general document uploads.

create or replace function public.canvas_media_validate_references(p_project uuid, p_content jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  b jsonb := p_content -> 'board';
  ref text;
  doc jsonb;
begin
  if jsonb_typeof(b) is distinct from 'object'
     or b ->> 'id' is distinct from p_project::text
     or jsonb_typeof(b -> 'media') is distinct from 'array'
     or jsonb_typeof(b -> 'embeds') is distinct from 'array'
     or octet_length(p_content::text) > 2200000 then
    raise exception 'Invalid compact canvas media format' using errcode = '23514';
  end if;

  -- The UNION deduplicates files repeated in the background or in elements.
  for ref in
    select e ->> 'src' from jsonb_array_elements(b -> 'media') e
    union
    select b #>> '{background,src}' where jsonb_typeof(b -> 'background') = 'object'
    union
    select e ->> 'url' from jsonb_array_elements(b -> 'embeds') e
      where e ->> 'kind' = 'document' and (
        coalesce(e ->> 'url', '') like 'mindcanvas-asset:%'
        or coalesce(e ->> 'url', '') ilike 'data:%'
        or coalesce(e ->> 'documentId', '') = ''
      )
  loop
    if ref is null or ref !~ '^mindcanvas-asset:[a-f0-9]{64}$'
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'canvas-media-private'
           and o.name = p_project::text || '/' || substring(ref from 18)
       ) then
      raise exception 'Canvas references media that was not uploaded for this project' using errcode = '23514';
    end if;
  end loop;
end;
$$;
revoke all on function public.canvas_media_validate_references(uuid, jsonb) from public, anon, authenticated;

create or replace function public.canvas_media_guard_note()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  pilot public.canvas_media_pilot%rowtype;
  compact boolean := coalesce(new.content ->> 'type' = 'mindcanvas-board' and new.content -> 'version' = '2'::jsonb, false);
begin
  select * into pilot from public.canvas_media_pilot p where p.project_id = new.id;
  if not compact then
    if pilot.converted then
      raise exception 'Update MindCanvas before editing this canvas' using errcode = '23514';
    end if;
    return new;
  end if;
  if tg_op <> 'UPDATE' or not coalesce(pilot.allow_conversion or pilot.converted, false) then
    raise exception 'Canvas media pilot is disabled for this project' using errcode = '23514';
  end if;
  perform public.canvas_media_validate_references(new.id, new.content);
  if not pilot.converted then
    update public.canvas_media_pilot set converted = true
    where project_id = new.id and not converted;
  end if;
  return new;
end;
$$;
revoke all on function public.canvas_media_guard_note() from public, anon, authenticated;
drop trigger if exists canvas_media_guard_note on public.notes;
create trigger canvas_media_guard_note before insert or update of content on public.notes
for each row execute function public.canvas_media_guard_note();

create or replace function public.canvas_media_guard_version()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.content ->> 'type' = 'mindcanvas-board' and new.content -> 'version' = '2'::jsonb then
    if not exists (select 1 from public.canvas_media_pilot where project_id = new.note_id and converted) then
      raise exception 'Compact checkpoints require a converted canvas' using errcode = '23514';
    end if;
    perform public.canvas_media_validate_references(new.note_id, new.content);
  end if;
  return new;
end;
$$;
revoke all on function public.canvas_media_guard_version() from public, anon, authenticated;
drop trigger if exists canvas_media_guard_version on public.note_versions;
create trigger canvas_media_guard_version before insert or update of content on public.note_versions
for each row execute function public.canvas_media_guard_version();

commit;
