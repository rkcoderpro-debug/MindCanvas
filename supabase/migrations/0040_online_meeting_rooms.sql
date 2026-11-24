begin;

alter table public.online_rooms drop constraint if exists online_rooms_kind_check;
alter table public.online_rooms add constraint online_rooms_kind_check check (kind in ('music','meeting'));
alter table public.online_rooms drop constraint if exists online_rooms_layout_check;
alter table public.online_rooms add constraint online_rooms_layout_check check (
  (kind='music' and layout in ('classroom','compact')) or (kind='meeting' and layout in ('table','compact'))
);
alter table public.online_rooms add column if not exists presenter_id uuid references auth.users(id) on delete set null;
alter table public.online_room_members add column if not exists hand_raised_at timestamptz;
alter table public.online_room_members add column if not exists reaction text;
alter table public.online_room_members add column if not exists reaction_at timestamptz;

update public.online_rooms set video_id='3Lfr3BhvkQY', video_title='Piano học tập · 24/7', attribution=null,
  play_offset=0, play_at=now(), is_playing=true, play_loop=true, play_rev=play_rev+1
where id='60000000-0000-4000-8000-000000000001'::uuid and video_id is distinct from '3Lfr3BhvkQY';

-- Keep working v6.0 music RPCs. The wrappers reuse the original seats, permissions and chat.
do $$
begin
  if to_regprocedure('public.join_online_room_v600(uuid,uuid,text)') is null then
    alter function public.join_online_room(uuid,uuid,text) rename to join_online_room_v600;
    alter function public.read_online_room(uuid,uuid) rename to read_online_room_v600;
    alter function public.act_online_room(uuid,uuid,text,jsonb) rename to act_online_room_v600;
  end if;
end;
$$;

create or replace function public.create_online_meeting_room(p_name text,p_topic text,p_visibility text,p_layout text,p_approval boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare room uuid;
begin
  if p_layout is null or p_layout not in ('table','compact') then raise exception 'ONLINE_INPUT'; end if;
  room:=public.create_online_music_room(p_name,p_topic,p_visibility,'classroom',p_approval,false);
  update public.online_rooms set kind='meeting',layout=p_layout,music_enabled=false where id=room;
  return room;
end;
$$;

create or replace function public.join_online_room(p_room uuid,p_client uuid,p_invite text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.online_rooms; result jsonb; was_empty boolean; previous_client uuid;
begin
  if auth.uid() is null then raise exception 'ONLINE_AUTH'; end if;
  select * into r from public.online_rooms where id=p_room for update;
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

create or replace function public.online_meeting_presenter(r public.online_rooms)
returns uuid language sql stable security definer set search_path = '' as $$
  -- A guest leaving temporarily does not silently change the provider's permissions.
  select coalesce(r.presenter_id,r.host_id)
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
    join public.online_room_members m on m.room_id=p_room and m.user_id=(x.item->>'id')::uuid;
  return result||jsonb_build_object('members',members,'presenter_id',public.online_meeting_presenter(r));
end;
$$;

create or replace function public.act_online_room(p_room uuid,p_client uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.online_rooms; state text; emoji text;
begin
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

-- Both entry points below are service-role only. The API obtains the actor ID from
-- the authenticated Supabase token, never from request fields supplied by the browser.
create or replace function public.online_meeting_session(p_room uuid,p_actor uuid,p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.online_rooms;
begin
  select * into r from public.online_rooms where id=p_room and kind='meeting';
  if r.id is null or not public.online_room_is_open(r) or not exists(
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

revoke all on function public.join_online_room_v600(uuid,uuid,text),public.read_online_room_v600(uuid,uuid),
  public.act_online_room_v600(uuid,uuid,text,jsonb),public.online_meeting_presenter(public.online_rooms),
  public.online_meeting_session(uuid,uuid,uuid),public.online_meeting_manage(uuid,uuid,uuid,text,uuid),
  public.create_online_meeting_room(text,text,text,text,boolean),public.join_online_room(uuid,uuid,text),
  public.read_online_room(uuid,uuid),public.act_online_room(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_online_meeting_room(text,text,text,text,boolean),public.join_online_room(uuid,uuid,text),
  public.read_online_room(uuid,uuid),public.act_online_room(uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.online_meeting_session(uuid,uuid,uuid),public.online_meeting_manage(uuid,uuid,uuid,text,uuid) to service_role;

commit;
