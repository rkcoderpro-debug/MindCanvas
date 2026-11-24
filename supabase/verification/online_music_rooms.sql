-- Execute on a local/staging database with test accounts only.
-- All account and room changes in this file are rolled back.
begin;

do $$
declare u uuid; i integer;
begin
  for i in 1..22 loop
    u:=('bc600000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    insert into auth.users(id,email) values(u,'rooms-qa-'||i||'@example.invalid');
  end loop;
  if has_function_privilege('anon','public.list_online_rooms()','execute')
    or has_table_privilege('authenticated','public.online_room_chat','select') then
    raise exception 'Room tables and unauthenticated RPC access must remain private';
  end if;
end;
$$;

set local role authenticated;
do $$
declare
  h uuid:='bc600000-0000-4000-8000-000000000001';
  g uuid:='bc600000-0000-4000-8000-000000000002';
  outsider uuid:='bc600000-0000-4000-8000-000000000003';
  official uuid:='60000000-0000-4000-8000-000000000001';
  room uuid; invite text; key uuid:=gen_random_uuid(); client uuid:=gen_random_uuid();
  second_tab uuid:=gen_random_uuid(); i integer; reply jsonb; track text; rev integer;
begin
  perform set_config('request.jwt.claim.sub',h::text,true);
  if not exists(select 1 from jsonb_array_elements(public.list_online_rooms()->'rooms') v where v->>'id'=official::text)
    then raise exception 'Official room is not discoverable'; end if;
  begin
    perform public.create_online_music_room('Public','', 'public','classroom',false,true);
    raise exception 'Unlisted account should not create public rooms';
  exception when raise_exception then if sqlerrm<>'ONLINE_PUBLIC_DENIED' then raise; end if; end;
  room:=public.create_online_music_room('Quiet hour','Piano','private','compact',true,true);
  if public.join_online_room(room,client)->>'state'<>'active' then raise exception 'Host did not get a seat'; end if;
  invite:=public.act_online_room(room,client,'invite')->>'invite';

  perform set_config('request.jwt.claim.sub',outsider::text,true);
  if exists(select 1 from jsonb_array_elements(public.list_online_rooms()->'rooms') v where v->>'id'=room::text)
    then raise exception 'Unlisted room escaped the lobby filter'; end if;
  if public.join_online_room(room,client)->>'state'<>'invite_required' then raise exception 'Private room omitted invitation check'; end if;
  if public.read_online_room_chat(room,client) ? 'messages' then raise exception 'Chat is readable outside the room'; end if;

  perform set_config('request.jwt.claim.sub',g::text,true);
  if public.join_online_room(room,client,invite)->>'state'<>'waiting' then raise exception 'Admission required'; end if;
  if public.online_room_can_listen('mindcanvas-online-room:'||room::text) then raise exception 'Waiting member received a channel subscription'; end if;
  perform set_config('request.jwt.claim.sub',h::text,true);
  if jsonb_array_length(public.read_online_room(room,client)->'waiting')<>1 then raise exception 'Host cannot see the waiting member'; end if;
  perform public.act_online_room(room,client,'admit',jsonb_build_object('id',g));
  perform public.act_online_room(room,client,'track','{"video_id":"QhYS_p4m09A","title":"Piano"}');
  rev:=(public.read_online_room(room,client)#>>'{playback,revision}')::integer;
  perform public.act_online_room(room,client,'play',jsonb_build_object('revision',rev));

  perform set_config('request.jwt.claim.sub',g::text,true);
  if public.join_online_room(room,client)->>'state'<>'active' then raise exception 'Admitted user cannot enter without the original link'; end if;
  if (public.read_online_room(room,client)#>>'{playback,playing}')::boolean is distinct from true then raise exception 'Late join lost playback state'; end if;
  if not public.online_room_can_listen('mindcanvas-online-room:'||room::text) then raise exception 'Active member needs event access'; end if;
  begin
    perform public.act_online_room(room,client,'pause',jsonb_build_object('revision',rev+1));
    raise exception 'Participant cannot pause a room';
  exception when raise_exception then if sqlerrm<>'ONLINE_HOST_ONLY' then raise; end if; end;
  perform public.act_online_room(room,client,'track','{"video_id":"i95_Luif45Y","title":"A suggestion"}');
  perform public.act_online_room(room,client,'chat',jsonb_build_object('body','Hello from seat 2','key',key));
  perform public.act_online_room(room,client,'chat',jsonb_build_object('body','Hello from seat 2','key',key));
  if jsonb_array_length(public.read_online_room_chat(room,client)->'messages')<>1 then raise exception 'Retried chat message was inserted twice'; end if;
  perform public.act_online_room(room,client,'seat','{"seat":20}');
  if public.join_online_room(room,second_tab)->>'state'<>'active' then raise exception 'Tab switch cannot reclaim seat'; end if;
  if public.ping_online_room(room,client,true)<>'other_tab' then raise exception 'Leaving the old tab released the new tab seat'; end if;
  reply:=public.read_online_room(room,second_tab);
  if jsonb_array_length(reply->'members')<>2 or (reply#>>'{members,1,seat}')::integer<>20 then raise exception 'Seat must survive without duplicates'; end if;
  if (public.ping_online_room(room,second_tab) <> 'active') then raise exception 'Active seat cannot renew'; end if;

  perform set_config('request.jwt.claim.sub',h::text,true);
  track:=public.read_online_room(room,client)#>>'{queue,0,id}';
  perform public.act_online_room(room,client,'track_decision',jsonb_build_object('id',track,'decision','approve'));
  perform public.act_online_room(room,client,'next',jsonb_build_object('revision',rev+1));
  if public.read_online_room(room,client)#>>'{playback,video_id}'<>'i95_Luif45Y' then raise exception 'Approved track did not start'; end if;
  begin
    perform public.act_online_room(room,client,'next',jsonb_build_object('revision',rev+1));
    raise exception 'Old playback command skipped another track';
  exception when raise_exception then if sqlerrm<>'ONLINE_PLAYBACK_CHANGED' then raise; end if; end;
  perform public.act_online_room(room,client,'remove_member',jsonb_build_object('id',g));
  perform set_config('request.jwt.claim.sub',g::text,true);
  if public.read_online_room_chat(room,second_tab)->>'state'<>'removed' then raise exception 'Removed member retained chat access'; end if;
  if public.join_online_room(room,client,invite)->>'state'<>'removed' then raise exception 'Removed member reused an invitation'; end if;
  perform set_config('request.jwt.claim.sub',h::text,true);
  if public.act_online_room(room,client,'close')->>'state'<>'closed' then raise exception 'Cannot close room'; end if;

  for i in 1..20 loop
    perform set_config('request.jwt.claim.sub','bc600000-0000-4000-8000-'||lpad(i::text,12,'0'),true);
    if public.join_online_room(official,client)->>'state'<>'active' then raise exception 'Expected a free seat for participant %',i; end if;
  end loop;
  perform set_config('request.jwt.claim.sub','bc600000-0000-4000-8000-000000000021',true);
  if public.join_online_room(official,client)->>'state'<>'full' then raise exception '21st participant exceeded capacity'; end if;
  perform set_config('request.jwt.claim.sub',h::text,true);
  perform public.ping_online_room(official,client,true);
  perform set_config('request.jwt.claim.sub','bc600000-0000-4000-8000-000000000021',true);
  if public.join_online_room(official,client)->>'state'<>'active' then raise exception 'Leaving did not free the seat'; end if;
end;
$$;

reset role;
rollback;
