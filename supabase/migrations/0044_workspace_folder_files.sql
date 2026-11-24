begin;

alter table public.folders add column if not exists parent_id uuid;
create unique index if not exists folders_owner_id_idx on public.folders(user_id,id);
create index if not exists folders_parent_idx on public.folders(user_id,parent_id);
do $$ begin
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.folders'::regclass and conname='folders_parent_owner_fk') then
    alter table public.folders add constraint folders_parent_owner_fk foreign key(user_id,parent_id)
      references public.folders(user_id,id) on delete set null(parent_id);
  end if;
end $$;

-- A folder is created under an existing parent. Deleting a parent moves its
-- immediate children to the root. Other writes cannot reparent a subtree.
create or replace function public.guard_workspace_folder_parent()
returns trigger language plpgsql set search_path='' as $$
declare depth int;
begin
  if tg_op='UPDATE' then
    if new.id<>old.id or new.user_id<>old.user_id or (new.parent_id is not null and new.parent_id is distinct from old.parent_id) then
      raise exception 'WORKSPACE_FOLDER_PARENT';
    end if;
  elsif new.parent_id is not null then
    with recursive ancestors(id,parent_id,level) as (
      select f.id,f.parent_id,1 from public.folders f where f.user_id=new.user_id and f.id=new.parent_id
      union all
      select f.id,f.parent_id,a.level+1 from ancestors a join public.folders f on f.id=a.parent_id and f.user_id=new.user_id
      where a.level<16
    ) select max(level) into depth from ancestors;
    if depth is null or depth>=16 or new.id=new.parent_id then raise exception 'WORKSPACE_FOLDER_PARENT'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists workspace_folder_parent_guard on public.folders;
create trigger workspace_folder_parent_guard before insert or update of id,user_id,parent_id on public.folders
for each row execute function public.guard_workspace_folder_parent();
revoke all on function public.guard_workspace_folder_parent() from public,anon,authenticated;

create table if not exists public.workspace_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid,
  name text not null check (char_length(name) between 1 and 255 and name !~ '[[:cntrl:]]'),
  size_bytes bigint not null check (size_bytes between 0 and 41943040),
  ready boolean not null default false,
  created_at timestamptz not null default now(),
  constraint workspace_files_owned_folder_fk foreign key(user_id,folder_id)
    references public.folders(user_id,id) on delete set null(folder_id)
);
create index if not exists workspace_files_owner_order_idx on public.workspace_files(user_id,created_at desc,id);
create index if not exists workspace_files_folder_idx on public.workspace_files(user_id,folder_id);
alter table public.workspace_files enable row level security;
revoke all on public.workspace_files from public,anon,authenticated;
grant select,delete on public.workspace_files to authenticated;
grant insert(id,user_id,folder_id,name,size_bytes) on public.workspace_files to authenticated;
grant update(folder_id,name) on public.workspace_files to authenticated;
drop policy if exists workspace_files_own on public.workspace_files;
create policy workspace_files_own on public.workspace_files for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('workspace-files','workspace-files',false,41943040,array['application/octet-stream'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists workspace_files_objects_read on storage.objects;
drop policy if exists workspace_files_objects_upload on storage.objects;
drop policy if exists workspace_files_objects_delete on storage.objects;
create policy workspace_files_objects_read on storage.objects for select to authenticated using
  (bucket_id='workspace-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy workspace_files_objects_upload on storage.objects for insert to authenticated with check
  (bucket_id='workspace-files' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(
    select 1 from public.workspace_files f where f.user_id=(select auth.uid()) and not f.ready and storage.objects.name=f.user_id::text||'/'||f.id::text
  ));
create policy workspace_files_objects_delete on storage.objects for delete to authenticated using
  (bucket_id='workspace-files' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Finalize only when Storage confirms the exact byte count; clients can
-- rename or move their rows, but cannot mark a missing file as ready.
create or replace function public.finish_workspace_file(p_id uuid)
returns boolean language sql security definer set search_path='' as $$
  with finalized as (
    update public.workspace_files f set ready=true where f.id=p_id and f.user_id=auth.uid()
      and exists(select 1 from storage.objects o where o.bucket_id='workspace-files'
        and o.name=f.user_id::text||'/'||f.id::text and o.metadata->>'size'=f.size_bytes::text)
    returning 1
  ) select exists(select 1 from finalized)
$$;
revoke all on function public.finish_workspace_file(uuid) from public,anon,authenticated;
grant execute on function public.finish_workspace_file(uuid) to authenticated;
commit;
