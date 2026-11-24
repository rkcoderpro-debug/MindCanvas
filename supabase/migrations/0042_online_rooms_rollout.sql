begin;

alter table public.online_rooms add column if not exists classroom_id uuid references public.classrooms(id) on delete set null;
alter table public.online_rooms add column if not exists classroom_scope boolean not null default false;
alter table public.online_rooms add column if not exists chat_locked boolean not null default false;
create index if not exists online_rooms_classroom on public.online_rooms(classroom_id,created_at desc) where classroom_scope and closed_at is null;

create table if not exists public.online_room_rollout (
  singleton boolean primary key default true check(singleton),
  pilot_enabled boolean not null default false,
  open_limit integer not null default 20 check(open_limit between 1 and 100),
  public_limit integer not null default 6 check(public_limit between 1 and 25),
  check(public_limit<=open_limit)
);
insert into public.online_room_rollout(singleton) values(true) on conflict do nothing;
create table if not exists public.online_room_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.online_room_reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.online_rooms(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  message_id bigint,
  message_excerpt text,
  reason text not null check(reason in ('spam','harassment','inappropriate','other')),
  detail text not null default '' check(length(detail)<=400),
  status text not null default 'pending' check(status in ('pending','dismissed','resolved')),
  filed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create unique index if not exists online_room_report_once on public.online_room_reports(room_id,reporter_id,coalesce(message_id,0));
create index if not exists online_room_reports_recent on public.online_room_reports(status,filed_at desc);
create index if not exists online_room_reports_actor on public.online_room_reports(reporter_id,filed_at desc);

alter table public.online_room_rollout enable row level security;
alter table public.online_room_moderators enable row level security;
alter table public.online_room_reports enable row level security;
revoke all on public.online_room_rollout,public.online_room_moderators,public.online_room_reports from public,anon,authenticated;

create or replace function public.online_room_is_baseline(p_id uuid)
returns boolean language sql immutable set search_path='' as $$
  select p_id in ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002')
$$;

create or replace function public.online_room_class_allowed(r public.online_rooms,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select not r.classroom_scope or (p_actor is not null and exists (
    select 1 from public.classrooms c where c.id=r.classroom_id and
      (c.teacher_id=p_actor or (
        exists(select 1 from public.classroom_members m where m.class_id=c.id and m.student_id=p_actor and m.status='active')
        and exists(select 1 from public.teacher_student_links l where l.teacher_id=c.teacher_id and l.student_id=p_actor and l.status='accepted')
        and exists(select 1 from public.connections a where a.user_a=least(c.teacher_id,p_actor) and a.user_b=greatest(c.teacher_id,p_actor))
        and not exists(select 1 from public.connection_blocks b where (b.blocker_id=c.teacher_id and b.blocked_id=p_actor) or (b.blocker_id=p_actor and b.blocked_id=c.teacher_id))
      ))
  ))
$$;

create or replace function public.online_room_can_manage_for(r public.online_rooms,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(r.host_id=p_actor,false) or (r.official and exists(select 1 from public.online_room_moderators m where m.user_id=p_actor))
$$;

create or replace function public.online_room_limits()
returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.online_room_rollout; total bigint; visible bigint;
begin
  if new.closed_at is not null or public.online_room_is_baseline(new.id) then return new; end if;
  if tg_op='UPDATE' and old.closed_at is null and old.visibility=new.visibility then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(64943107241803::bigint);
  select * into cfg from public.online_room_rollout where singleton;
  if new.visibility='public' and not cfg.pilot_enabled then raise exception 'ONLINE_PILOT_OFF'; end if;
  select count(*),count(*) filter (where r.visibility='public') into total,visible from public.online_rooms r
  where r.id<>new.id and not public.online_room_is_baseline(r.id) and public.online_room_is_open(r);
  if total>=cfg.open_limit then raise exception 'ONLINE_OPEN_LIMIT'; end if;
  if new.visibility='public' and visible>=cfg.public_limit then raise exception 'ONLINE_PUBLIC_LIMIT'; end if;
  return new;
end;
$$;
drop trigger if exists online_room_limits on public.online_rooms;
create trigger online_room_limits before insert or update of closed_at,visibility on public.online_rooms
  for each row execute function public.online_room_limits();

insert into public.online_rooms(id,name,topic,visibility,layout,official,music_enabled,chat_locked,closed_at)
values
 ('60000000-0000-4000-8000-000000000003','Góc ôn bài','Một phòng yên lặng để cùng ôn bài và tập trung.','public','classroom',true,false,true,now()),
 ('60000000-0000-4000-8000-000000000004','Góc tự học','Vào phòng, chọn ghế và học theo nhịp của bạn.','public','compact',true,false,true,now())
on conflict(id) do nothing;

create or replace function public.online_classroom_room(p_class uuid,p_open boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare probe public.online_rooms; r public.online_rooms; c public.classrooms; u uuid:=auth.uid();
begin
  select * into c from public.classrooms where id=p_class;
  probe.classroom_scope:=true; probe.classroom_id:=p_class;
  if u is null or c.id is null or not public.online_room_class_allowed(probe,u) then raise exception 'ONLINE_CLASS_DENIED'; end if;
  if p_open then
    if u<>c.teacher_id then raise exception 'ONLINE_HOST_ONLY'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,6000));
  end if;
  select * into r from public.online_rooms a where a.classroom_id=p_class and a.classroom_scope and public.online_room_is_open(a) order by a.created_at desc limit 1;
  if r.id is not null then return jsonb_build_object('room',public.online_room_card(r)); end if;
  if not coalesce(p_open,false) then return jsonb_build_object('room',null); end if;
  if exists(select 1 from public.online_rooms a where not a.official and (a.created_by=u or a.host_id=u) and public.online_room_is_open(a))
    then raise exception 'ONLINE_ROOM_LIMIT'; end if;
  insert into public.online_rooms(kind,created_by,host_id,name,topic,visibility,layout,official,music_enabled,requires_approval,
    classroom_id,classroom_scope,chat_locked)
    values('meeting',u,u,left(c.name,64),'','private','table',false,false,false,c.id,true,false)
    returning * into r;
  return jsonb_build_object('room',public.online_room_card(r));
end;
$$;

create or replace function public.online_room_safety_action(r public.online_rooms,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); m public.online_room_chat; mid bigint; why text; detail text; rid uuid;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'ONLINE_INPUT'; end if;
  if p_action='chat_lock' then
    if not public.online_room_can_manage_for(r,u) then raise exception 'ONLINE_HOST_ONLY'; end if;
    if jsonb_typeof(p_payload->'locked') is distinct from 'boolean' then raise exception 'ONLINE_INPUT'; end if;
    update public.online_rooms set chat_locked=(p_payload->>'locked')::boolean where id=r.id;
    perform public.online_room_notify(r.id,'room');
  elsif p_action='report' then
    why:=p_payload->>'reason'; detail:=btrim(coalesce(p_payload->>'detail',''));
    if why is null or why not in ('spam','harassment','inappropriate','other') or length(detail)>400 then raise exception 'ONLINE_INPUT'; end if;
    if p_payload ? 'id' then
      if coalesce(p_payload->>'id','') !~ '^[1-9][0-9]{0,17}$' then raise exception 'ONLINE_INPUT'; end if;
      mid:=(p_payload->>'id')::bigint;
    end if;
    select id into rid from public.online_room_reports a where a.room_id=r.id and a.reporter_id=u and a.message_id is not distinct from mid;
    if rid is not null then return jsonb_build_object('state','active'); end if;
    if mid is not null then
      select * into m from public.online_room_chat where id=mid and room_id=r.id;
      if not found then raise exception 'ONLINE_MESSAGE_GONE'; end if;
      if m.author_id=u then raise exception 'ONLINE_INPUT'; end if;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,4206));
    if (select count(*) from public.online_room_reports a where a.reporter_id=u and a.filed_at>now()-interval '1 day')>=5
      then raise exception 'ONLINE_REPORT_LIMIT'; end if;
    insert into public.online_room_reports(room_id,reporter_id,message_id,message_excerpt,reason,detail)
      values(r.id,u,mid,m.body,why,detail) on conflict do nothing;
  else raise exception 'ONLINE_INPUT';
  end if;
  return jsonb_build_object('state','active');
end;
$$;

create or replace function public.online_room_chat_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.online_rooms; actor uuid;
begin
  if tg_table_name='online_room_chat' then actor:=new.author_id; else actor:=new.owner_id; end if;
  select * into r from public.online_rooms where id=new.room_id for update;
  if r.chat_locked and not public.online_room_can_manage_for(r,actor) then raise exception 'ONLINE_CHAT_LOCKED'; end if;
  return new;
end;
$$;
drop trigger if exists online_room_chat_guard on public.online_room_chat;
create trigger online_room_chat_guard before insert on public.online_room_chat for each row execute function public.online_room_chat_guard();
drop trigger if exists online_room_file_chat_guard on public.online_meeting_files;
create trigger online_room_file_chat_guard before insert on public.online_meeting_files for each row execute function public.online_room_chat_guard();

create or replace function public.online_room_is_open(r public.online_rooms)
returns boolean language sql stable security definer set search_path = '' as $$
  select r.closed_at is null and (not r.classroom_scope or r.classroom_id is not null) and
    (r.official or (r.host_id is not null and
      coalesce((select m.last_seen from public.online_room_members m where m.room_id=r.id and m.user_id=r.host_id),r.created_at)
        > now() - interval '3 minutes'))
$$;

create or replace function public.online_room_card(r public.online_rooms)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',r.id,'kind',r.kind,'name',r.name,'topic',r.topic,'visibility',r.visibility,
    'layout',r.layout,'official',r.official,'music_enabled',r.music_enabled,'requires_approval',r.requires_approval,
    'classroom_id',r.classroom_id,'chat_locked',r.chat_locked,'host_id',r.host_id,'host_name',case when r.official then 'MindCanvas' else
      public.online_room_display_name((select p.display_name from public.profiles p where p.id=r.host_id)) end,
    'occupancy',(select count(*) from public.online_room_members m where m.room_id=r.id and m.lease_until>now() and public.online_room_class_allowed(r,m.user_id)),
    'capacity',20)
$$;

create or replace function public.online_room_can_host_public()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select pilot_enabled from public.online_room_rollout where singleton),false) and exists(select 1 from public.online_room_public_hosts where user_id=auth.uid())
$$;

create or replace function public.online_room_can_manage(r public.online_rooms)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.online_room_can_manage_for(r,auth.uid())
$$;

create or replace function public.online_room_can_listen(p_topic text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.online_room_members m join public.online_rooms r on r.id=m.room_id
    where m.user_id=auth.uid() and m.lease_until>now() and public.online_room_is_open(r)
      and public.online_room_class_allowed(r,m.user_id) and p_topic='mindcanvas-online-room:'||m.room_id::text)
$$;

create or replace function public.online_room_avatar_allowed(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.online_room_members viewer join public.online_rooms r on r.id=viewer.room_id
      join public.online_room_members person on person.room_id=r.id
      join public.account_profile_details d on d.user_id=person.user_id
    where viewer.user_id=auth.uid() and viewer.lease_until>now() and person.lease_until>now()
      and public.online_room_class_allowed(r,viewer.user_id) and public.online_room_class_allowed(r,person.user_id) and p_path = person.user_id::text||'/avatar-'||d.avatar_slot::text||'.jpg' and public.online_room_is_open(r))
$$;

create or replace function public.list_online_rooms()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'can_create_public',public.online_room_can_host_public(),
    'rooms',coalesce((select jsonb_agg(public.online_room_card(x) order by x.official desc,x.created_at desc)
      from (select r.* from public.online_rooms r where auth.uid() is not null and r.closed_at is null
        and public.online_room_class_allowed(r,auth.uid())
        and (r.visibility='public' or r.classroom_scope or r.host_id=auth.uid() or exists(
          select 1 from public.online_room_members m where m.room_id=r.id and m.user_id=auth.uid() and m.admission<>'removed'))
        and public.online_room_is_open(r)
        order by r.official desc,r.created_at desc,r.id limit 60) x),'[]'::jsonb))
$$;

create or replace function public.online_room_session_state(r public.online_rooms,p_client uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare m public.online_room_members;
begin
  if auth.uid() is null then raise exception 'ONLINE_AUTH'; end if;
  if r.id is null then return 'closed'; end if;
  if not public.online_room_class_allowed(r,auth.uid()) then return 'class_required'; end if;
  select * into m from public.online_room_members where room_id=r.id and user_id=auth.uid();
  if m.admission='removed' then return 'removed'; end if;
  if not public.online_room_is_open(r) then return 'closed'; end if;
  if m.admission='waiting' then return 'waiting'; end if;
  if m.lease_until is null or m.lease_until<=now() then return 'expired'; end if;
  if m.client_id is distinct from p_client then return 'other_tab'; end if;
  return 'active';
end;
$$;

create or replace function public.join_online_room(p_room uuid,p_client uuid,p_invite text default null)
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

create or replace function public.read_online_room(p_room uuid,p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; r public.online_rooms; members jsonb;
begin
  result:=public.read_online_room_v600(p_room,p_client);
  if result->>'state'<>'active' or result #>> '{room,kind}'<>'meeting' then return result; end if;
  select * into r from public.online_rooms where id=p_room;
  select coalesce(jsonb_agg(x.item || jsonb_build_object('hand_raised_at',m.hand_raised_at,
      'reaction',case when m.reaction_at > now()-interval '8 seconds' then m.reaction else null end,
      'reaction_at',case when m.reaction_at > now()-interval '8 seconds' then m.reaction_at else null end) order by x.n),'[]'::jsonb)
    into members
    from jsonb_array_elements(result->'members') with ordinality x(item,n)
    join public.online_room_members m on m.room_id=p_room and m.user_id=(x.item->>'id')::uuid
    where public.online_room_class_allowed(r,m.user_id);
  return result||jsonb_build_object('members',members,'presenter_id',public.online_meeting_presenter(r));
end;
$$;

create or replace function public.act_online_room(p_room uuid,p_client uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.online_rooms; state text; emoji text;
begin
  if p_action in ('report','chat_lock','invite') then
    select * into r from public.online_rooms where id=p_room for update;
    state:=public.online_room_session_state(r,p_client);
    if state<>'active' then return jsonb_build_object('state',state); end if;
    if p_action='invite' and r.classroom_scope then raise exception 'ONLINE_CLASS_DENIED'; end if;
    if p_action<>'invite' then return public.online_room_safety_action(r,p_action,p_payload); end if;
  end if;
  if not (p_action in ('hand','reaction','remove_member','transfer','close')) then
    return public.act_online_room_v600(p_room,p_client,p_action,p_payload);
  end if;
  select * into r from public.online_rooms where id=p_room for update;
  if r.kind is distinct from 'meeting' then return public.act_online_room_v600(p_room,p_client,p_action,p_payload); end if;
  state:=public.online_room_session_state(r,p_client);
  if state<>'active' then return jsonb_build_object('state',state); end if;
  if p_action in ('remove_member','transfer','close') then raise exception 'ONLINE_MEDIA_API_REQUIRED'; end if;
  if p_action='hand' then
    if jsonb_typeof(p_payload->'raised') is distinct from 'boolean' then raise exception 'ONLINE_INPUT'; end if;
    update public.online_room_members set hand_raised_at=
      case when (p_payload->>'raised')::boolean then coalesce(hand_raised_at,now()) else null end
      where room_id=p_room and user_id=auth.uid();
  else
    emoji:=p_payload->>'reaction';
    if emoji is null or emoji not in ('clap','heart','like') then raise exception 'ONLINE_INPUT'; end if;
    update public.online_room_members set reaction=emoji,reaction_at=now()
      where room_id=p_room and user_id=auth.uid() and (reaction_at is null or reaction_at<=now()-interval '2 seconds');
    if not found then raise exception 'ONLINE_RATE'; end if;
  end if;
  perform public.online_room_notify(p_room,'room');
  return jsonb_build_object('state','active');
end;
$$;

create or replace function public.online_meeting_session(p_room uuid,p_actor uuid,p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.online_rooms;
begin
  select * into r from public.online_rooms where id=p_room and kind='meeting';
  if r.id is null or not public.online_room_is_open(r) or not public.online_room_class_allowed(r,p_actor) or not exists(
    select 1 from public.online_room_members where room_id=p_room and user_id=p_actor
      and client_id=p_client and admission='allowed' and lease_until>now()
  ) then raise exception 'ONLINE_MEDIA_DENIED'; end if;
  return jsonb_build_object('name',public.online_room_display_name((select p.display_name from public.profiles p where p.id=p_actor)),
    'screen',public.online_meeting_presenter(r) is not distinct from p_actor);
end;
$$;

create or replace function public.online_meeting_manage(p_room uuid,p_actor uuid,p_client uuid,p_operation text,p_target uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.online_rooms; previous uuid; target_state public.online_room_members;
begin
  select * into r from public.online_rooms where id=p_room and kind='meeting' for update;
  -- A repeated close may retry a failed provider disconnect, but only by the last host.
  if r.id is not null and r.closed_at is not null and p_operation='close' and p_actor=r.host_id
    then return jsonb_build_object('state','closed'); end if;
  perform public.online_meeting_session(p_room,p_actor,p_client);
  if r.host_id is distinct from p_actor then raise exception 'ONLINE_HOST_ONLY'; end if;
  if p_operation is null or p_operation not in ('close','presenter','mute','remove','transfer') then raise exception 'ONLINE_INPUT'; end if;
  if r.classroom_scope and p_operation='transfer' then raise exception 'ONLINE_CLASS_HOST'; end if;
  if r.classroom_scope and p_target is not null and p_operation='presenter' and not public.online_room_class_allowed(r,p_target) then raise exception 'ONLINE_MEMBER_GONE'; end if;
  previous:=public.online_meeting_presenter(r);
  if p_operation='close' then
    update public.online_rooms set closed_at=now(),invite_hash=null,invite_expires_at=null,presenter_id=null where id=p_room;
    update public.online_room_members set seat=null,client_id=null,lease_until=null,hand_raised_at=null,reaction=null,reaction_at=null
      where room_id=p_room and seat is not null;
    perform public.online_room_notify(p_room,'room');
    return jsonb_build_object('state','closed');
  end if;
  select * into target_state from public.online_room_members where room_id=p_room and user_id=p_target;
  if p_operation='presenter' and p_target is null then p_target:=p_actor; end if;
  if p_operation='presenter' and p_target=p_actor then
    update public.online_rooms set presenter_id=null where id=p_room returning * into r;
  elsif p_operation='remove' and target_state.admission='removed' then
    return jsonb_build_object('state','active','former',p_target,'presenter',public.online_meeting_presenter(r));
  else
    if p_target is null or p_target=p_actor or target_state.user_id is null or target_state.admission<>'allowed'
      or (p_operation<>'remove' and (target_state.lease_until is null or target_state.lease_until<=now()))
      then raise exception 'ONLINE_MEMBER_GONE'; end if;
    if p_operation='presenter' then
      update public.online_rooms set presenter_id=p_target where id=p_room returning * into r;
    elsif p_operation='mute' then
      return jsonb_build_object('state','active');
    elsif p_operation='remove' then
      update public.online_room_members set admission='removed',seat=null,client_id=null,lease_until=null,
        hand_raised_at=null,reaction=null,reaction_at=null where room_id=p_room and user_id=p_target;
      update public.online_rooms set presenter_id=null where id=p_room and presenter_id=p_target returning * into r;
      if not found then select * into r from public.online_rooms where id=p_room; end if;
    elsif p_operation='transfer' then
      update public.online_rooms set host_id=p_target,presenter_id=null where id=p_room returning * into r;
    else raise exception 'ONLINE_INPUT';
    end if;
  end if;
  perform public.online_room_notify(p_room,'room');
  return jsonb_build_object('state','active','former',previous,'presenter',public.online_meeting_presenter(r));
end;
$$;

-- Only aggregate durations are exposed to admins. No camera, audio, or media payload is stored.
create table if not exists public.online_room_rtc_rooms (
  sid text primary key,
  room_id uuid not null,
  finished_at timestamptz,
  observed_at timestamptz not null default now()
);
create table if not exists public.online_room_rtc_sessions (
  room_sid text not null references public.online_room_rtc_rooms(sid) on delete cascade,
  participant_sid text not null,
  actor_id uuid,
  joined_at timestamptz,
  left_at timestamptz,
  primary key(room_sid,participant_sid)
);
create index if not exists online_room_rtc_recent on public.online_room_rtc_rooms(observed_at);
create index if not exists online_room_rtc_open on public.online_room_rtc_sessions(room_sid) where left_at is null;
alter table public.online_room_rtc_rooms enable row level security;
alter table public.online_room_rtc_sessions enable row level security;
revoke all on public.online_room_rtc_rooms,public.online_room_rtc_sessions from public,anon,authenticated;

create or replace function public.online_room_rtc_event(p_room uuid,p_room_sid text,p_event text,p_at timestamptz,p_participant text default null,p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare terminal timestamptz; ok boolean;
begin
  if p_at is null or p_at>now()+interval '5 minutes' or p_at<now()-interval '60 days'
    or coalesce(p_room_sid,'') !~ '^RM_[A-Za-z0-9_-]{1,100}$'
    or p_event is null or p_event not in ('participant_joined','participant_left','room_finished') then raise exception 'ONLINE_INPUT'; end if;
  if not exists(select 1 from public.online_rooms where id=p_room and kind='meeting') then return jsonb_build_object('tracked',false); end if;
  if p_event<>'room_finished' and (p_actor is null or coalesce(p_participant,'') !~ '^PA_[A-Za-z0-9_-]{1,100}$') then raise exception 'ONLINE_INPUT'; end if;
  insert into public.online_room_rtc_rooms(sid,room_id,finished_at)
    values(p_room_sid,p_room,case when p_event='room_finished' then p_at end)
    on conflict(sid) do update set finished_at=coalesce(least(public.online_room_rtc_rooms.finished_at,excluded.finished_at),public.online_room_rtc_rooms.finished_at,excluded.finished_at),
      observed_at=now()
    where public.online_room_rtc_rooms.room_id=excluded.room_id
    returning finished_at into terminal;
  if not found then raise exception 'ONLINE_INPUT'; end if;
  if p_event<>'room_finished' then
    insert into public.online_room_rtc_sessions(room_sid,participant_sid,actor_id,joined_at,left_at)
      values(p_room_sid,p_participant,p_actor,case when p_event='participant_joined' then p_at end,case when p_event='participant_left' then p_at end)
      on conflict(room_sid,participant_sid) do update set joined_at=least(public.online_room_rtc_sessions.joined_at,excluded.joined_at),
        left_at=least(public.online_room_rtc_sessions.left_at,excluded.left_at)
      where public.online_room_rtc_sessions.actor_id=excluded.actor_id;
  end if;
  delete from public.online_room_rtc_rooms where observed_at<now()-interval '60 days';
  select exists(select 1 from public.online_rooms r join public.online_room_members m on m.room_id=r.id and m.user_id=p_actor
    where r.id=p_room and m.admission='allowed' and m.lease_until>now() and public.online_room_is_open(r) and public.online_room_class_allowed(r,p_actor)) into ok;
  return jsonb_build_object('tracked',true,'allowed',ok,'finished',terminal is not null);
end;
$$;

create or replace function public.online_room_rtc_invalid()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) from (
    select distinct r.id as room,m.actor_id as actor from public.online_room_rtc_sessions m join public.online_room_rtc_rooms lk on lk.sid=m.room_sid
    join public.online_rooms r on r.id=lk.room_id
    where m.joined_at>now()-interval '1 day' and m.left_at is null and lk.finished_at is null and r.classroom_scope
      and (not public.online_room_is_open(r) or not public.online_room_class_allowed(r,m.actor_id))
    order by r.id,m.actor_id limit 100
  ) v
$$;

-- Values copied from the actual provider dashboard by an administrator.
create table if not exists public.online_room_cost_checks (
  period date primary key,
  downstream_gb numeric(12,3) not null check(downstream_gb between 0 and 10000000),
  cost_usd numeric(12,4) not null check(cost_usd between 0 and 10000000),
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null
);
alter table public.online_room_cost_checks enable row level security;
revoke all on public.online_room_cost_checks from public,anon,authenticated;

create or replace function public.online_room_admin_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare start_of_month timestamptz; total numeric; seen bigint; ended bigint; last_seen timestamptz; opened bigint; visible bigint; eligible boolean; v public.online_room_rollout;
begin
  start_of_month:=date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
  select * into v from public.online_room_rollout where singleton;
  select count(*),count(*) filter(where r.visibility='public') into opened,visible from public.online_rooms r
    where not public.online_room_is_baseline(r.id) and public.online_room_is_open(r);
  select max(observed_at) into last_seen from public.online_room_rtc_rooms;
  select exists(select 1 from public.online_room_rtc_rooms r join public.online_room_rtc_sessions p on p.room_sid=r.sid
    where p.joined_at>now()-interval '7 days' and p.left_at is not null and least(p.left_at,r.finished_at)>p.joined_at) into eligible;
  select coalesce(sum(extract(epoch from least(p.left_at,r.finished_at,now())-greatest(p.joined_at,start_of_month)))
      filter(where p.left_at is not null and least(p.left_at,r.finished_at,now())>greatest(p.joined_at,start_of_month)),0),
    count(*) filter(where p.left_at is null and r.finished_at is null),count(*) filter(where p.left_at is not null)
    into total,seen,ended from public.online_room_rtc_rooms r join public.online_room_rtc_sessions p on p.room_sid=r.sid
    where p.joined_at is not null and coalesce(least(p.left_at,r.finished_at),now())>=start_of_month;
  return jsonb_build_object('pilot_enabled',v.pilot_enabled,'open_limit',v.open_limit,'public_limit',v.public_limit,
    'open_count',opened,'public_count',visible,'measured_minutes',round(total/60,2),'open_sessions',seen,'closed_sessions',ended,
    'latest_webhook',last_seen,'pilot_ready',eligible,'period_start',start_of_month,
    'billing',(select jsonb_build_object('downstream_gb',c.downstream_gb,'cost_usd',c.cost_usd,'recorded_at',c.recorded_at)
      from public.online_room_cost_checks c where c.period=(start_of_month at time zone 'Asia/Ho_Chi_Minh')::date),
    'presets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'open',a.closed_at is null) order by a.id)
      from public.online_rooms a where a.id in('60000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000004')),'[]'::jsonb),
    'public_hosts',coalesce((select jsonb_agg(user_id order by user_id) from public.online_room_public_hosts),'[]'::jsonb),
    'moderators',coalesce((select jsonb_agg(user_id order by user_id) from public.online_room_moderators),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(to_jsonb(a) order by a.filed_at desc) from (
      select b.id,b.reason,b.detail,b.message_excerpt,b.filed_at,r.name as room_name,b.message_id is not null as has_message,
        exists(select 1 from public.online_room_chat c where c.id=b.message_id and c.room_id=b.room_id) as can_remove
      from public.online_room_reports b join public.online_rooms r on r.id=b.room_id where b.status='pending' order by b.filed_at desc limit 80
    ) a),'[]'::jsonb)
  );
end;
$$;

create or replace function public.online_room_admin_change(p_actor uuid,p_op text,p_target uuid default null,p_enabled boolean default null,
  p_open_limit integer default null,p_public_limit integer default null,p_verified boolean default false,
  p_downstream_gb numeric default null,p_cost_usd numeric default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rp public.online_room_reports; cfg public.online_room_rollout;
begin
  if p_actor is null or p_op is null then raise exception 'ONLINE_INPUT'; end if;
  if p_op='limits' then
    if p_open_limit is null or p_public_limit is null or p_open_limit not between 1 and 100 or p_public_limit not between 1 and least(25,p_open_limit)
      then raise exception 'ONLINE_INPUT'; end if;
    perform pg_catalog.pg_advisory_xact_lock(64943107241803::bigint);
    update public.online_room_rollout set open_limit=p_open_limit,public_limit=p_public_limit where singleton;
  elsif p_op='pilot' then
    if p_enabled is null then raise exception 'ONLINE_INPUT'; end if;
    perform pg_catalog.pg_advisory_xact_lock(64943107241803::bigint);
    select * into cfg from public.online_room_rollout where singleton;
    if p_enabled and not cfg.pilot_enabled then
      if not coalesce(p_verified,false) or not exists(select 1 from public.online_room_cost_checks
        where period=date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')::date) or not exists (
        select 1 from public.online_room_rtc_rooms r join public.online_room_rtc_sessions p on p.room_sid=r.sid
        where p.joined_at>now()-interval '7 days' and p.left_at is not null and least(p.left_at,r.finished_at)>p.joined_at)
        then raise exception 'ONLINE_PILOT_METRICS_REQUIRED'; end if;
    end if;
    update public.online_room_rollout set pilot_enabled=p_enabled where singleton;
  elsif p_op='billing' then
    if p_downstream_gb is null or p_cost_usd is null or p_downstream_gb not between 0 and 10000000 or p_cost_usd not between 0 and 10000000
      then raise exception 'ONLINE_INPUT'; end if;
    insert into public.online_room_cost_checks(period,downstream_gb,cost_usd,recorded_by)
      values(date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')::date,p_downstream_gb,p_cost_usd,p_actor)
      on conflict(period) do update set downstream_gb=excluded.downstream_gb,cost_usd=excluded.cost_usd,recorded_at=now(),recorded_by=p_actor;
  elsif p_op='preset' then
    if p_enabled is null or p_target is null or p_target not in('60000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000004') then raise exception 'ONLINE_INPUT'; end if;
    update public.online_rooms set closed_at=case when p_enabled then null else now() end where id=p_target;
    if not p_enabled then
      update public.online_room_members set seat=null,client_id=null,lease_until=null where room_id=p_target;
    end if;
    perform public.online_room_notify(p_target,'room');
  elsif p_op in ('public_host','moderator') then
    if p_enabled is null or p_target is null then raise exception 'ONLINE_INPUT'; end if;
    if p_enabled and not exists(select 1 from auth.users where id=p_target) then raise exception 'ONLINE_MEMBER_GONE'; end if;
    if p_op='public_host' then
      if p_enabled then insert into public.online_room_public_hosts(user_id) values(p_target) on conflict do nothing;
      else delete from public.online_room_public_hosts where user_id=p_target; end if;
    else
      if p_enabled then insert into public.online_room_moderators(user_id) values(p_target) on conflict do nothing;
      else delete from public.online_room_moderators where user_id=p_target; end if;
    end if;
  elsif p_op in ('dismiss_report','resolve_report','remove_reported_message') then
    select * into rp from public.online_room_reports where id=p_target and status='pending' for update;
    if not found then raise exception 'ONLINE_REPORT_GONE'; end if;
    if p_op='remove_reported_message' then
      if rp.message_id is null then raise exception 'ONLINE_MESSAGE_GONE'; end if;
      delete from public.online_room_chat where room_id=rp.room_id and id=rp.message_id;
      perform public.online_room_notify(rp.room_id,'chat');
    end if;
    update public.online_room_reports set status=case when p_op='dismiss_report' then 'dismissed' else 'resolved' end,
      reviewed_at=now(),reviewed_by=p_actor where id=rp.id;
  else raise exception 'ONLINE_INPUT';
  end if;
  delete from public.online_room_reports where reviewed_at<now()-interval '90 days';
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.online_room_class_allowed(public.online_rooms,uuid),public.online_room_is_baseline(uuid),
  public.online_room_can_manage_for(public.online_rooms,uuid),public.online_room_limits(),
  public.online_classroom_room(uuid,boolean),public.online_room_safety_action(public.online_rooms,text,jsonb),public.online_room_chat_guard(),
  public.online_room_rtc_event(uuid,text,text,timestamptz,text,uuid),public.online_room_rtc_invalid(),
  public.online_room_admin_summary(),public.online_room_admin_change(uuid,text,uuid,boolean,integer,integer,boolean,numeric,numeric) from public,anon,authenticated;
grant execute on function public.online_classroom_room(uuid,boolean) to authenticated;
grant execute on function public.online_room_rtc_event(uuid,text,text,timestamptz,text,uuid),public.online_room_rtc_invalid(),
  public.online_room_admin_summary(),public.online_room_admin_change(uuid,text,uuid,boolean,integer,integer,boolean,numeric,numeric) to service_role;
commit;
