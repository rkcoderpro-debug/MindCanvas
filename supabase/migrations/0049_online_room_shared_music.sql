begin;

alter table public.online_rooms
  add column playlist_id text check (playlist_id ~ '^[A-Za-z0-9_-]{1,160}$'),
  add column playlist_index integer not null default 0 check (playlist_index between 0 and 4999),
  add column music_lease_until timestamptz;
alter table public.online_room_tracks
  alter column video_id drop not null,
  add column playlist_id text check (playlist_id ~ '^[A-Za-z0-9_-]{1,160}$'),
  add constraint online_room_track_one_source check (num_nonnulls(video_id,playlist_id)=1);
create unique index online_room_playlist_once on public.online_room_tracks(room_id,playlist_id) where playlist_id is not null;

-- Use the most recent live lease as the stop boundary if the last client disappeared.
update public.online_rooms r set music_lease_until=coalesce((
  select max(m.lease_until) from public.online_room_members m where m.room_id=r.id and m.seat is not null
), r.play_at) where kind='music' and music_enabled;

-- A host's absence never closes a music room with an active listener.
create or replace function public.online_room_is_open(r public.online_rooms)
returns boolean language sql stable security definer set search_path='' as $$
  select r.closed_at is null and (not r.classroom_scope or r.classroom_id is not null) and
    (r.official or (r.host_id is not null and
      (case when r.kind='music' then coalesce((
        select max(m.last_seen) from public.online_room_members m where m.room_id=r.id and m.admission='allowed'
      ),r.created_at) else coalesce((
        select m.last_seen from public.online_room_members m where m.room_id=r.id and m.user_id=r.host_id
      ),r.created_at) end) > now()-interval '3 minutes'))
$$;

create function public.reconcile_online_room_music(p_room uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.online_rooms; deadline timestamptz; t timestamptz:=statement_timestamp(); cutoff timestamptz;
begin
  select * into r from public.online_rooms where id=p_room for update;
  if not found or r.kind<>'music' or not r.music_enabled or r.closed_at is not null
    or (r.video_id is null and r.playlist_id is null) then return; end if;
  select max(lease_until) into deadline from public.online_room_members
    where room_id=p_room and seat is not null and admission='allowed' and lease_until>t;
  if deadline is not null then
    if not r.is_playing then
      update public.online_rooms set is_playing=true,play_at=t,play_rev=play_rev+1,music_lease_until=deadline where id=p_room;
      perform public.online_room_notify(p_room,'room');
    elsif deadline is distinct from r.music_lease_until then
      update public.online_rooms set music_lease_until=deadline where id=p_room;
    end if;
  elsif r.is_playing then
    cutoff:=least(t,coalesce(r.music_lease_until,t));
    update public.online_rooms set is_playing=false,
      play_offset=play_offset+greatest(0,extract(epoch from cutoff-play_at)),
      play_at=cutoff,play_rev=play_rev+1,music_lease_until=null where id=p_room;
    perform public.online_room_notify(p_room,'room');
  end if;
end;
$$;

create function public.create_online_room_v6820(p_kind text,p_name text,p_topic text,p_visibility text,
  p_layout text,p_suggestions boolean,p_mode text,p_password text,
  p_video text default null,p_playlist text default null,p_title text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r uuid; title text:=nullif(btrim(p_title),'');
begin
  if (p_video is not null or p_playlist is not null) and
    (p_kind is distinct from 'music' or num_nonnulls(p_video,p_playlist)<>1 or
      coalesce(p_video !~ '^[A-Za-z0-9_-]{11}$',false) or
      coalesce(p_playlist !~ '^[A-Za-z0-9_-]{1,160}$',false) or length(coalesce(title,''))>96)
    then raise exception 'ONLINE_INPUT'; end if;
  r:=public.create_online_room_v640(p_kind,p_name,p_topic,p_visibility,p_layout,p_suggestions,p_mode,p_password);
  if p_video is not null or p_playlist is not null then
    update public.online_rooms set video_id=p_video,playlist_id=p_playlist,
      video_title=coalesce(title,case when p_playlist is null then 'YouTube' else 'Danh sách YouTube Music' end)
      where id=r;
  end if;
  return r;
end;
$$;

alter function public.join_online_room_v640(uuid,uuid,text,text,text) rename to join_online_room_before_shared_music;
create function public.join_online_room_v640(p_room uuid,p_client uuid,p_invite text default null,p_code text default null,p_password text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; was_empty boolean; prior public.online_rooms;
  t timestamptz:=statement_timestamp(); cutoff timestamptz;
begin
  select * into prior from public.online_rooms where id=p_room for update;
  select not exists(select 1 from public.online_room_members where room_id=p_room and seat is not null
    and admission='allowed' and lease_until>statement_timestamp()) into was_empty;
  result:=public.join_online_room_before_shared_music(p_room,p_client,p_invite,p_code,p_password);
  if result->>'state'='active' then
    if was_empty and prior.kind='music' and prior.music_enabled and
      (prior.video_id is not null or prior.playlist_id is not null) then
      -- The legacy official-room join resets its loop. Restore the held clock
      -- before starting it, including when the last client never sent Leave.
      cutoff:=least(t,coalesce(prior.music_lease_until,t));
      update public.online_rooms set is_playing=false,music_lease_until=null,
        play_offset=prior.play_offset+case when prior.is_playing
          then greatest(0,extract(epoch from cutoff-prior.play_at)) else 0 end
        where id=p_room;
    end if;
    perform public.reconcile_online_room_music(p_room);
  end if;
  return result;
end;
$$;

alter function public.ping_online_room(uuid,uuid,boolean) rename to ping_online_room_before_shared_music;
create function public.ping_online_room(p_room uuid,p_client uuid,p_leave boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
  result:=public.ping_online_room_before_shared_music(p_room,p_client,p_leave);
  if result in ('active','left','expired') then perform public.reconcile_online_room_music(p_room); end if;
  return result;
end;
$$;

alter function public.read_online_room(uuid,uuid) rename to read_online_room_before_shared_music;
create function public.read_online_room(p_room uuid,p_client uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; r public.online_rooms; tracks jsonb;
begin
  result:=public.read_online_room_before_shared_music(p_room,p_client);
  if result->>'state'<>'active' or result #>> '{room,kind}'<>'music' then return result; end if;
  select * into r from public.online_rooms where id=p_room;
  select coalesce(jsonb_agg(x.item || jsonb_build_object('playlist_id',q.playlist_id) order by x.n),'[]'::jsonb)
    into tracks from jsonb_array_elements(result->'queue') with ordinality x(item,n)
    join public.online_room_tracks q on q.room_id=p_room and q.id=(x.item->>'id')::uuid;
  return result || jsonb_build_object('queue',tracks,'playback', (result->'playback') ||
    jsonb_build_object('playlist_id',r.playlist_id,'playlist_index',r.playlist_index));
end;
$$;

create function public.advance_online_room_music(p_room uuid,p_restart boolean)
returns void language plpgsql security definer set search_path='' as $$
declare q public.online_room_tracks; t timestamptz:=statement_timestamp();
begin
  select * into q from public.online_room_tracks where room_id=p_room and status='queued' order by sort_key,id limit 1;
  if q.id is not null then
    delete from public.online_room_tracks where id=q.id;
    update public.online_rooms set video_id=q.video_id,playlist_id=q.playlist_id,video_title=q.title,attribution=null,
      play_loop=false,playlist_index=0,play_offset=0,play_at=t,play_rev=play_rev+1 where id=p_room;
  elsif p_restart then
    update public.online_rooms set playlist_index=0,play_offset=0,play_at=t,play_rev=play_rev+1 where id=p_room;
  else
    return;
  end if;
  perform public.reconcile_online_room_music(p_room);
  perform public.online_room_notify(p_room,'room');
end;
$$;

alter function public.act_online_room(uuid,uuid,text,jsonb) rename to act_online_room_before_shared_music;
create function public.act_online_room(p_room uuid,p_client uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.online_rooms; state text; result jsonb; manager boolean; video text; playlist text; title text;
  rev text; idx text; t timestamptz:=statement_timestamp();
begin
  select * into r from public.online_rooms where id=p_room for update;
  if r.kind is distinct from 'music' or p_action not in ('play','pause','track','next','music_ended','track_decision','remove_member') then
    return public.act_online_room_before_shared_music(p_room,p_client,p_action,p_payload);
  end if;
  state:=public.online_room_session_state(r,p_client);
  if state<>'active' then return jsonb_build_object('state',state); end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'ONLINE_INPUT'; end if;
  manager:=public.online_room_can_manage(r);
  if p_action in ('track_decision','remove_member') then
    result:=public.act_online_room_before_shared_music(p_room,p_client,p_action,p_payload);
    if p_action='track_decision' and r.video_id is null and r.playlist_id is null then
      perform public.advance_online_room_music(p_room,false);
    end if;
    if p_action='remove_member' then perform public.reconcile_online_room_music(p_room); end if;
    return result;
  end if;
  if not r.music_enabled or r.official then raise exception 'ONLINE_MUSIC_LOCKED'; end if;

  case p_action
    when 'pause' then raise exception 'ONLINE_MUSIC_LOCKED';
    when 'play' then
      if not manager then raise exception 'ONLINE_HOST_ONLY'; end if;
      perform public.reconcile_online_room_music(p_room);
    when 'track' then
      if not manager and not r.suggestions then raise exception 'ONLINE_SUGGESTIONS_OFF'; end if;
      video:=p_payload->>'video_id'; playlist:=p_payload->>'playlist_id'; title:=nullif(btrim(p_payload->>'title'),'');
      if num_nonnulls(video,playlist)<>1 or coalesce(video !~ '^[A-Za-z0-9_-]{11}$',false)
        or coalesce(playlist !~ '^[A-Za-z0-9_-]{1,160}$',false) or length(coalesce(title,''))>96
        then raise exception 'ONLINE_INPUT'; end if;
      if (select count(*) from public.online_room_tracks where room_id=p_room)>=30
        or (not manager and (select count(*) from public.online_room_tracks
          where room_id=p_room and requested_by=auth.uid() and status='pending')>=3)
        then raise exception 'ONLINE_QUEUE_FULL'; end if;
      if r.video_id=video or r.playlist_id=playlist or exists(select 1 from public.online_room_tracks
        where room_id=p_room and (video_id=video or playlist_id=playlist))
        then raise exception 'ONLINE_DUPLICATE_TRACK'; end if;
      title:=coalesce(title,case when playlist is null then 'YouTube' else 'Danh sách YouTube Music' end);
      insert into public.online_room_tracks(room_id,requested_by,video_id,playlist_id,title,status)
        values(p_room,auth.uid(),video,playlist,title,case when manager then 'queued' else 'pending' end);
      if manager and r.video_id is null and r.playlist_id is null then
        perform public.advance_online_room_music(p_room,false);
      else
        perform public.online_room_notify(p_room,'room');
      end if;
    when 'next','music_ended' then
      if p_action='next' and not manager then raise exception 'ONLINE_HOST_ONLY'; end if;
      rev:=p_payload->>'revision';
      if rev is distinct from r.play_rev::text then raise exception 'ONLINE_PLAYBACK_CHANGED'; end if;
      if p_action='next' then
        perform public.advance_online_room_music(p_room,false);
      elsif r.is_playing and (r.video_id is not null or r.playlist_id is not null) then
        idx:=p_payload->>'index';
        if r.playlist_id is not null and idx is distinct from r.playlist_index::text
          then raise exception 'ONLINE_PLAYBACK_CHANGED'; end if;
        if r.playlist_id is not null and p_payload->'has_next'='true'::jsonb and r.playlist_index<4999 then
          update public.online_rooms set playlist_index=playlist_index+1,play_offset=0,play_at=t,play_rev=play_rev+1 where id=p_room;
          perform public.online_room_notify(p_room,'room');
        else
          perform public.advance_online_room_music(p_room,true);
        end if;
      end if;
  end case;
  return jsonb_build_object('state','active');
end;
$$;

revoke all on function public.reconcile_online_room_music(uuid),public.advance_online_room_music(uuid,boolean),
  public.join_online_room_before_shared_music(uuid,uuid,text,text,text),public.ping_online_room_before_shared_music(uuid,uuid,boolean),
  public.read_online_room_before_shared_music(uuid,uuid),public.act_online_room_before_shared_music(uuid,uuid,text,jsonb),
  public.create_online_room_v6820(text,text,text,text,text,boolean,text,text,text,text,text),
  public.join_online_room_v640(uuid,uuid,text,text,text),public.ping_online_room(uuid,uuid,boolean),
  public.read_online_room(uuid,uuid),public.act_online_room(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_online_room_v6820(text,text,text,text,text,boolean,text,text,text,text,text),
  public.join_online_room_v640(uuid,uuid,text,text,text),public.ping_online_room(uuid,uuid,boolean),
  public.read_online_room(uuid,uuid),public.act_online_room(uuid,uuid,text,jsonb) to authenticated;

commit;
