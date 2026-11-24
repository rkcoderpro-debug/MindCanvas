begin;

create extension if not exists pgcrypto;
alter table public.online_rooms add column if not exists room_code text check (room_code ~ '^[0-9]{6}$');
alter table public.online_rooms add column if not exists entry_mode text not null default 'link' check (entry_mode in ('link','approval','password'));
alter table public.online_rooms add column if not exists password_hash text;
alter table public.online_rooms add column if not exists deleted_at timestamptz;
alter table public.online_rooms add column if not exists media_cleanup_pending boolean not null default false;
create unique index if not exists online_room_code_unique on public.online_rooms(room_code) where room_code is not null;

-- PostgreSQL may install pgcrypto in public or in the provider extensions schema.
create or replace function public.online_room_password_crypt(p_password text,p_hash text default null)
returns text language plpgsql security definer set search_path='' as $$
declare ns text; calculated text;
begin
  select n.nspname into ns from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  if ns is null then raise exception 'ONLINE_UNAVAILABLE'; end if;
  if p_hash is null then
    execute pg_catalog.format('select %1$I.crypt($1,%1$I.gen_salt(''bf'',10))',ns) into calculated using p_password;
  else
    execute pg_catalog.format('select %I.crypt($1,$2)',ns) into calculated using p_password,p_hash;
  end if;
  return calculated;
end;
$$;

create or replace function public.online_room_allocate_code()
returns text language plpgsql security definer set search_path='' as $$
declare raw bytea; candidate text;
begin
  -- Serialize allocation and keep the unique index as the final protection.
  perform pg_catalog.pg_advisory_xact_lock(8930041662044::bigint);
  for attempt in 1..64 loop
    raw:=pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
    candidate:=lpad(((get_byte(raw,0)::bigint*16777216+get_byte(raw,1)*65536+get_byte(raw,2)*256+get_byte(raw,3))%1000000)::text,6,'0');
    if not exists(select 1 from public.online_rooms where room_code=candidate) then return candidate; end if;
  end loop;
  raise exception 'ONLINE_OPEN_LIMIT';
end;
$$;

create or replace function public.online_room_assign_code()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.room_code is null and new.deleted_at is null then new.room_code:=public.online_room_allocate_code(); end if;
  return new;
end;
$$;
drop trigger if exists online_room_assign_code on public.online_rooms;
create trigger online_room_assign_code before insert on public.online_rooms for each row execute function public.online_room_assign_code();
do $$
declare rid uuid;
begin
  for rid in select id from public.online_rooms where room_code is null and deleted_at is null and (closed_at is null or official) loop
    update public.online_rooms set room_code=public.online_room_allocate_code() where id=rid;
  end loop;
end;
$$;

create table if not exists public.online_room_entry_limits (
  actor uuid not null references auth.users(id) on delete cascade,
  operation text not null check(operation in ('lookup','password')),
  started_at timestamptz not null,
  attempts integer not null,
  primary key(actor,operation)
);
alter table public.online_room_entry_limits enable row level security;
revoke all on public.online_room_entry_limits from public,anon,authenticated;
create or replace function public.online_room_allow_entry_attempt(p_actor uuid,p_operation text,p_limit integer,p_period interval)
returns boolean language plpgsql security definer set search_path='' as $$
declare accepted integer;
begin
  insert into public.online_room_entry_limits as a(actor,operation,started_at,attempts)
  values(p_actor,p_operation,now(),1)
  on conflict(actor,operation) do update
  set started_at=case when a.started_at<=now()-p_period then now() else a.started_at end,
      attempts=case when a.started_at<=now()-p_period then 1 else a.attempts+1 end
  where a.started_at<=now()-p_period or a.attempts<p_limit
  returning attempts into accepted;
  return accepted is not null;
end;
$$;

create or replace function public.lookup_online_room_code(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.online_rooms; u uuid:=auth.uid();
begin
  if u is null then raise exception 'ONLINE_AUTH'; end if;
  if p_code is null or p_code !~ '^[0-9]{6}$' then return jsonb_build_object('state','not_found'); end if;
  if not public.online_room_allow_entry_attempt(u,'lookup',15,interval '1 minute') then return jsonb_build_object('state','rate'); end if;
  select * into r from public.online_rooms where room_code=p_code and deleted_at is null;
  if r.id is null or not public.online_room_is_open(r) or not public.online_room_class_allowed(r,u) then
    return jsonb_build_object('state','not_found');
  end if;
  return jsonb_build_object('state','found','id',r.id);
end;
$$;

create or replace function public.create_online_room_v640(p_kind text,p_name text,p_topic text,p_visibility text,p_layout text,
  p_suggestions boolean default false,p_mode text default 'approval',p_password text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r uuid; saved_hash text;
begin
  if auth.uid() is null then raise exception 'ONLINE_AUTH'; end if;
  if p_kind is null or p_kind not in ('music','meeting') or p_visibility is null or p_visibility not in ('private','public')
    or p_mode is null or p_mode not in ('approval','password') then raise exception 'ONLINE_INPUT'; end if;
  if p_visibility='private' and p_mode='password' then
    if p_password is null or char_length(p_password) not between 6 and 64 or octet_length(p_password)>72 or btrim(p_password)='' then
      raise exception 'ONLINE_PASSWORD_FORMAT'; end if;
  elsif p_password is not null then raise exception 'ONLINE_INPUT';
  end if;
  if p_kind='meeting' then
    r:=public.create_online_meeting_room(p_name,p_topic,p_visibility,p_layout,p_mode='approval');
  else
    r:=public.create_online_music_room(p_name,p_topic,p_visibility,p_layout,p_mode='approval',p_suggestions);
  end if;
  if p_visibility='private' then
    if p_mode='password' then saved_hash:=public.online_room_password_crypt(p_password); end if;
    update public.online_rooms set entry_mode=p_mode,password_hash=saved_hash where id=r;
  end if;
  return r;
end;
$$;

create or replace function public.online_room_card(r public.online_rooms)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',r.id,'kind',r.kind,'name',r.name,'topic',r.topic,'visibility',r.visibility,
    'layout',r.layout,'official',r.official,'music_enabled',r.music_enabled,'requires_approval',r.requires_approval,
    'code',r.room_code,'entry_mode',case when r.classroom_scope then 'classroom' when r.visibility='public' then 'open' else r.entry_mode end,'classroom_id',r.classroom_id,'chat_locked',r.chat_locked,'host_id',r.host_id,'host_name',case when r.official then 'MindCanvas' else
      public.online_room_display_name((select p.display_name from public.profiles p where p.id=r.host_id)) end,
    'occupancy',(select count(*) from public.online_room_members m where m.room_id=r.id and m.lease_until>now() and public.online_room_class_allowed(r,m.user_id)),
    'capacity',20)
$$;

create or replace function public.online_room_join_v630(p_room uuid,p_client uuid,p_invite text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.online_rooms; result jsonb; was_empty boolean; previous_client uuid;
begin
  if auth.uid() is null then raise exception 'ONLINE_AUTH'; end if;
  select * into r from public.online_rooms where id=p_room for update;
  if r.classroom_scope then
    if not public.online_room_class_allowed(r,auth.uid()) then return jsonb_build_object('state','class_required'); end if;
    if p_client is not null and public.online_room_is_open(r) then
      insert into public.online_room_members(room_id,user_id,admission) values(p_room,auth.uid(),'allowed')
      on conflict(room_id,user_id) do nothing;
    end if;
  end if;
  if r.official and r.music_enabled and r.play_loop then
    was_empty:=not exists (select 1 from public.online_room_members m where m.room_id=p_room and m.lease_until>now());
  end if;
  if r.kind='meeting' then
    select client_id into previous_client from public.online_room_members
      where room_id=p_room and user_id=auth.uid() and lease_until>now();
  end if;
  result:=public.join_online_room_v600(p_room,p_client,p_invite);
  if result->>'state'='active' then
    if was_empty then
      update public.online_rooms set play_at=now(),play_offset=0,play_rev=play_rev+1,is_playing=true where id=p_room;
    end if;
    if r.kind='meeting' and previous_client is distinct from p_client then
      update public.online_room_members set hand_raised_at=null,reaction=null,reaction_at=null
        where room_id=p_room and user_id=auth.uid();
    end if;
  end if;
  return result;
end;
$$;

create or replace function public.online_room_rtc_invalid()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) from (
    select distinct r.id as room,m.actor_id as actor from public.online_room_rtc_sessions m join public.online_room_rtc_rooms lk on lk.sid=m.room_sid
    join public.online_rooms r on r.id=lk.room_id
    where m.joined_at>now()-interval '1 day' and m.left_at is null and lk.finished_at is null and (r.deleted_at is not null or (r.classroom_scope
      and (not public.online_room_is_open(r) or not public.online_room_class_allowed(r,m.actor_id))))
    order by r.id,m.actor_id limit 100
  ) v
$$;

create or replace function public.join_online_room_v640(p_room uuid,p_client uuid,p_invite text default null,
  p_code text default null,p_password text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.online_rooms; u uuid:=auth.uid(); has_member boolean;
begin
  if u is null or p_client is null then raise exception 'ONLINE_AUTH'; end if;
  select * into r from public.online_rooms where id=p_room for update;
  if r.id is null or r.deleted_at is not null then return jsonb_build_object('state','closed'); end if;
  if r.visibility='private' and not r.classroom_scope and r.host_id is distinct from u then
    select exists(select 1 from public.online_room_members where room_id=p_room and user_id=u) into has_member;
    if not has_member and public.online_room_is_open(r) then
      if r.entry_mode='password' then
        if p_code is null or p_code is distinct from r.room_code then return jsonb_build_object('state','invite_required'); end if;
        if p_password is null then return jsonb_build_object('state','password_required'); end if;
        if not public.online_room_allow_entry_attempt(u,'password',5,interval '1 minute') then return jsonb_build_object('state','password_rate'); end if;
        if octet_length(p_password)>72 or char_length(p_password) not between 6 and 64 or r.password_hash is null then
          return jsonb_build_object('state','password_invalid');
        end if;
        if public.online_room_password_crypt(p_password,r.password_hash) is distinct from r.password_hash then
          return jsonb_build_object('state','password_invalid');
        end if;
        insert into public.online_room_members(room_id,user_id,admission) values(p_room,u,'allowed');
      elsif p_code is not null and p_code=r.room_code then
        if (select count(*) from public.online_room_members where room_id=p_room and admission='waiting')>=40 then
          return jsonb_build_object('state','waiting_full');
        end if;
        insert into public.online_room_members(room_id,user_id,admission) values(p_room,u,'waiting');
        perform public.online_room_notify(p_room,'room');
      end if;
    end if;
  end if;
  return public.online_room_join_v630(p_room,p_client,p_invite);
end;
$$;

-- Legacy clients still have to pass the same access policy.
create or replace function public.join_online_room(p_room uuid,p_client uuid,p_invite text default null)
returns jsonb language sql security definer set search_path='' as $$
  select public.join_online_room_v640(p_room,p_client,p_invite,null,null)
$$;

create or replace function public.delete_online_room(p_room uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.online_rooms;
begin
  select * into r from public.online_rooms where id=p_room for update;
  if p_actor is null or r.id is null or r.official or r.host_id is distinct from p_actor
    or (r.classroom_scope and not public.online_room_class_allowed(r,p_actor)) then
    raise exception 'ONLINE_HOST_ONLY';
  end if;
  if r.deleted_at is null then
    update public.online_rooms set deleted_at=now(),closed_at=coalesce(closed_at,now()),
      invite_hash=null,invite_expires_at=null,password_hash=null,presenter_id=null,media_cleanup_pending=(kind='meeting') where id=p_room;
    delete from public.online_room_members where room_id=p_room;
    -- Chat deletion detaches private file references for the existing storage sweeper.
    delete from public.online_room_chat where room_id=p_room;
    delete from public.online_room_tracks where room_id=p_room;
    delete from public.online_meeting_canvases where room_id=p_room;
    perform public.online_room_notify(p_room,'room');
  end if;
  return jsonb_build_object('kind',r.kind,'deleted',true);
end;
$$;

create or replace function public.online_room_media_purges(p_done uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_done is not null then
    -- Reconcile again after short-lived, pre-deletion LiveKit tokens have expired.
    update public.online_rooms set media_cleanup_pending=false
      where id=p_done and deleted_at<=now()-interval '90 seconds' and media_cleanup_pending;
    return jsonb_build_object('ok',true);
  end if;
  return (select coalesce(jsonb_agg(a.id),'[]'::jsonb) from (
    select id from public.online_rooms where deleted_at is not null and media_cleanup_pending order by deleted_at limit 40
  ) a);
end;
$$;

revoke all on function public.online_room_password_crypt(text,text),public.online_room_allocate_code(),
  public.online_room_assign_code(),public.online_room_allow_entry_attempt(uuid,text,integer,interval),
  public.online_room_join_v630(uuid,uuid,text),public.lookup_online_room_code(text),
  public.create_online_room_v640(text,text,text,text,text,boolean,text,text),public.join_online_room_v640(uuid,uuid,text,text,text),
  public.delete_online_room(uuid,uuid),public.online_room_media_purges(uuid) from public,anon,authenticated;
grant execute on function public.lookup_online_room_code(text),public.create_online_room_v640(text,text,text,text,text,boolean,text,text),
  public.join_online_room_v640(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.delete_online_room(uuid,uuid),public.online_room_media_purges(uuid) to service_role;

commit;
