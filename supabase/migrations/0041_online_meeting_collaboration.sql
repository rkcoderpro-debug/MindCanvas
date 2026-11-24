begin;

create table if not exists public.online_meeting_canvases (
  room_id uuid primary key references public.online_rooms(id) on delete cascade,
  revision integer not null default 1,
  on_stage boolean not null default true,
  allow_edit boolean not null default false,
  board jsonb not null
);
alter table public.online_meeting_canvases enable row level security;
revoke all on public.online_meeting_canvases from public, anon, authenticated;

create or replace function public.online_meeting_canvas(p_room uuid,p_client uuid,p_op text,p_revision integer default null,p_board jsonb default null,p_flag boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.online_rooms; c public.online_meeting_canvases; state text; host boolean; reply jsonb;
begin
  if p_op is null or p_op not in ('read','start','stage','permission','save') then raise exception 'ONLINE_INPUT'; end if;
  if p_op='read' then select * into r from public.online_rooms where id=p_room;
  else select * into r from public.online_rooms where id=p_room for update;
  end if;
  state:=public.online_room_session_state(r,p_client);
  if state<>'active' then return jsonb_build_object('state',state); end if;
  if r.kind<>'meeting' then raise exception 'ONLINE_INPUT'; end if;
  host:=coalesce(r.host_id=auth.uid(),false);
  select * into c from public.online_meeting_canvases where room_id=p_room;
  if p_op='read' then
    if c.room_id is null or (not host and not c.on_stage) then return jsonb_build_object('state','active','canvas',null); end if;
  elsif p_op='save' then
    if c.room_id is null or not c.on_stage or not (host or c.allow_edit) then raise exception 'ONLINE_CANVAS_READ_ONLY'; end if;
    if c.revision is distinct from p_revision then return jsonb_build_object('state','active','conflict',true); end if;
  elsif not host then raise exception 'ONLINE_HOST_ONLY';
  elsif p_op='start' and c.room_id is not null then raise exception 'ONLINE_CANVAS_EXISTS';
  elsif p_op in ('stage','permission') then
    if c.room_id is null or p_flag is null then raise exception 'ONLINE_INPUT'; end if;
    if p_op='stage' then
      update public.online_meeting_canvases set on_stage=p_flag, allow_edit=case when p_flag then allow_edit else false end, revision=revision+1 where room_id=p_room returning * into c;
    else
      if not c.on_stage then raise exception 'ONLINE_CANVAS_READ_ONLY'; end if;
      update public.online_meeting_canvases set allow_edit=p_flag, revision=revision+1 where room_id=p_room returning * into c;
    end if;
  end if;

  if p_op in ('start','save') then
    if p_board is null or jsonb_typeof(p_board) is distinct from 'object' then raise exception 'ONLINE_INPUT'; end if;
    if octet_length(p_board::text)>1048576 then raise exception 'ONLINE_CANVAS_TOO_BIG'; end if;
    if jsonb_typeof(p_board->'title') is distinct from 'string' or length(btrim(p_board->>'title')) not between 1 and 100
      or jsonb_typeof(p_board->'viewport') is distinct from 'object'
      or p_board->'media' is distinct from '[]'::jsonb or p_board->'embeds' is distinct from '[]'::jsonb
      or (p_board ? 'background' and (p_board->>'background' not in ('plain','dots','grid','ruled','graph','isometric') or jsonb_typeof(p_board->'background')<>'string'))
      or p_board ? 'sourceDocuments'
      or exists(select 1 from unnest(array['nodes','edges','shapes','texts','drawings']) k where jsonb_typeof(p_board->k) is distinct from 'array')
      then raise exception 'ONLINE_INPUT'; end if;
    if p_op='start' then
      insert into public.online_meeting_canvases(room_id,board) values(p_room,p_board) returning * into c;
    else
      update public.online_meeting_canvases set board=p_board,revision=revision+1 where room_id=p_room returning * into c;
    end if;
  end if;

  if p_op<>'read' then perform public.online_room_notify(p_room,'canvas'); end if;
  reply:=jsonb_build_object('revision',c.revision,'title',c.board->>'title','on_stage',c.on_stage,'allow_edit',c.allow_edit,'can_edit',c.on_stage and (host or c.allow_edit));
  if p_op<>'save' and (p_op<>'read' or p_revision is distinct from c.revision) and (c.on_stage or host) then
    reply:=reply||jsonb_build_object('board',c.board);
  end if;
  return jsonb_build_object('state','active','canvas',reply);
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('meeting-room-files','meeting-room-files',false,8388608,array['application/pdf',
'application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg','image/webp','text/plain'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- A restrictive policy protects this bucket even when other application policies grant broader Storage access.
drop policy if exists "Meeting uploads through API only" on storage.objects;
create policy "Meeting uploads through API only" on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id<>'meeting-room-files') with check (bucket_id<>'meeting-room-files');

create table if not exists public.online_meeting_files (
  room_id uuid not null references public.online_rooms(id),
  id uuid not null,
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  mime text not null,
  size_bytes integer not null check (size_bytes between 1 and 8388608),
  created_at timestamptz not null default now(),
  ready boolean not null default false,
  chat_id bigint unique references public.online_room_chat(id) on delete set null,
  primary key(room_id,id)
);
alter table public.online_meeting_files enable row level security;
revoke all on public.online_meeting_files from public, anon, authenticated;

create or replace function public.online_meeting_file(p_room uuid,p_actor uuid,p_client uuid,p_file uuid,p_op text,p_name text default null,p_mime text default null,p_size integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.online_meeting_files; mid bigint;
begin
  if p_op is null or p_op not in ('reserve','commit','read') or p_file is null then raise exception 'ONLINE_INPUT'; end if;
  if p_op<>'read' then perform 1 from public.online_rooms where id=p_room for update; end if;
  perform public.online_meeting_session(p_room,p_actor,p_client);
  select * into f from public.online_meeting_files where room_id=p_room and id=p_file;
  if p_op='read' then
    if not coalesce(f.ready,false) or f.chat_id is null then raise exception 'ONLINE_FILE_GONE'; end if;
  elsif p_op='reserve' then
    if p_name is null or length(btrim(p_name)) not between 1 and 160 or p_name ~ '[[:cntrl:]/\\]' or p_size is null or p_size not between 1 and 8388608
      or p_mime is null or p_mime not in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/png','image/jpeg','image/webp','text/plain') then raise exception 'ONLINE_INPUT'; end if;
    if f.id is not null then
      if f.owner_id=p_actor and f.ready and f.chat_id is not null and f.name=p_name and f.mime=p_mime and f.size_bytes=p_size then
        return jsonb_build_object('ready',true);
      end if;
      raise exception 'ONLINE_FILE_PENDING';
    end if;
    if (select count(*) from public.online_meeting_files where room_id=p_room and owner_id=p_actor and created_at>now()-interval '30 seconds')>=3 then
      raise exception 'ONLINE_RATE'; end if;
    if (select count(*)>=20 or coalesce(sum(size_bytes),0)+p_size>41943040 from public.online_meeting_files where room_id=p_room) then
      raise exception 'ONLINE_FILE_QUOTA'; end if;
    insert into public.online_meeting_files(room_id,id,owner_id,name,mime,size_bytes)
      values(p_room,p_file,p_actor,p_name,p_mime,p_size) returning * into f;
  else
    if f.id is null or f.owner_id is distinct from p_actor or f.created_at < now()-interval '10 minutes' then raise exception 'ONLINE_FILE_GONE'; end if;
    if not f.ready then
      insert into public.online_room_chat(room_id,author_id,message_key,body)
        values(p_room,p_actor,gen_random_uuid(),f.name) returning id into mid;
      update public.online_meeting_files set ready=true,chat_id=mid where room_id=p_room and id=p_file returning * into f;
      delete from public.online_room_chat where room_id=p_room and id <= (
        select id from public.online_room_chat where room_id=p_room order by id desc offset 300 limit 1);
      perform public.online_room_notify(p_room,'chat');
    end if;
  end if;
  return jsonb_build_object('ready',f.ready,'name',f.name,'mime',f.mime,'size',f.size_bytes);
end;
$$;

-- Storage removal comes first. Postgres never deletes rows from storage.objects directly.
create or replace function public.online_meeting_file_cleanup(p_room uuid default null,p_file uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_room is null and p_file is null then
    return (select coalesce(jsonb_agg(jsonb_build_object('room',t.room_id,'id',t.id)),'[]'::jsonb) from (
      select f.room_id,f.id from public.online_meeting_files f join public.online_rooms r on r.id=f.room_id
      where (not f.ready and f.created_at < now()-interval '1 hour') or (f.ready and f.chat_id is null)
        or (f.created_at < now()-interval '7 days' and not public.online_room_is_open(r))
      order by f.created_at limit 20) t);
  end if;
  delete from public.online_meeting_files where room_id=p_room and id=p_file
    and (not ready or chat_id is null or (created_at < now()-interval '7 days' and
      exists(select 1 from public.online_rooms r where r.id=p_room and not public.online_room_is_open(r))));
  return jsonb_build_object('ok',found);
end;
$$;

-- Preserve the v6.0 chat payload and add structured file metadata, never an object URL.
create or replace function public.read_online_room_chat(p_room uuid,p_client uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.online_rooms; state text;
begin
  select * into r from public.online_rooms where id=p_room;
  state:=public.online_room_session_state(r,p_client);
  if state<>'active' then return jsonb_build_object('state',state); end if;
  return jsonb_build_object('state','active','messages',coalesce((
    select jsonb_agg(jsonb_build_object('id',m.id::text,'author_id',m.author_id,
      'name',public.online_room_display_name(p.display_name),'body',m.body,'created_at',m.created_at)
      || case when f.id is null then '{}'::jsonb else jsonb_build_object('file',jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',f.size_bytes)) end order by m.id)
    from (select * from public.online_room_chat where room_id=p_room order by id desc limit 80) m
    left join public.profiles p on p.id=m.author_id
    left join public.online_meeting_files f on f.chat_id=m.id and f.room_id=p_room and f.ready),'[]'::jsonb));
end;
$$;

revoke all on function public.online_meeting_canvas(uuid,uuid,text,integer,jsonb,boolean), public.read_online_room_chat(uuid,uuid),
  public.online_meeting_file(uuid,uuid,uuid,uuid,text,text,text,integer),public.online_meeting_file_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.online_meeting_canvas(uuid,uuid,text,integer,jsonb,boolean),public.read_online_room_chat(uuid,uuid) to authenticated;
grant execute on function public.online_meeting_file(uuid,uuid,uuid,uuid,text,text,text,integer),public.online_meeting_file_cleanup(uuid,uuid) to service_role;
commit;
