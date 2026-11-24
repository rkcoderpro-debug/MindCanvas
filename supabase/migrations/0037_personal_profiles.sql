-- Leave existing identity and collaboration views in place. Private fields
-- are stored separately and never selected by a peer's RPC.
begin;

create table if not exists public.account_profile_details (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(full_name) between 1 and 100),
  username text unique check (username ~ '^[a-z0-9][a-z0-9_]{2,23}$'),
  nickname text check (char_length(nickname) between 1 and 60),
  use_nickname boolean not null default false check (not use_nickname or nickname is not null),
  age smallint check (age between 1 and 120),
  gender text check (gender in ('female','male','other','prefer_not_to_say')),
  school text check (char_length(school) between 1 and 120),
  province text check (char_length(province) between 1 and 80),
  avatar_slot smallint check (avatar_slot in (1,2)),
  avatar_revision uuid,
  revision uuid not null default gen_random_uuid(),
  check ((avatar_slot is null) = (avatar_revision is null))
);
alter table public.account_profile_details enable row level security;
revoke all on public.account_profile_details from public, anon, authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('profile-avatars','profile-avatars',false,262144,array['image/jpeg'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.can_read_profile_avatar(p_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare avatar_owner uuid; path_slot smallint;
begin
  if auth.uid() is null or p_path !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/avatar-[12]\.jpg$' then return false; end if;
  avatar_owner := split_part(p_path,'/',1)::uuid;
  if avatar_owner = auth.uid() then return true; end if;
  path_slot := substring(p_path from 'avatar-([12])\.jpg$')::smallint;
  return public.connection_is_active(avatar_owner) and exists(
    select 1 from public.account_profile_details d where d.user_id=avatar_owner and d.avatar_slot=path_slot
  );
end $$;
revoke all on function public.can_read_profile_avatar(text) from public,anon;
grant execute on function public.can_read_profile_avatar(text) to authenticated;

drop policy if exists "Profile avatar reader" on storage.objects;
create policy "Profile avatar reader" on storage.objects for select to authenticated
using (bucket_id = 'profile-avatars' and public.can_read_profile_avatar(name));
create or replace function public.can_stage_profile_avatar(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and p_path in (auth.uid()::text||'/avatar-1.jpg',auth.uid()::text||'/avatar-2.jpg')
    and not exists(select 1 from public.account_profile_details d
      where d.user_id=auth.uid() and p_path=auth.uid()::text||'/avatar-'||d.avatar_slot::text||'.jpg');
$$;
revoke all on function public.can_stage_profile_avatar(text) from public,anon;
grant execute on function public.can_stage_profile_avatar(text) to authenticated;

drop policy if exists "Profile avatar owner insert" on storage.objects;
create policy "Profile avatar owner insert" on storage.objects for insert to authenticated
with check (bucket_id = 'profile-avatars' and public.can_stage_profile_avatar(name));
drop policy if exists "Profile avatar owner update" on storage.objects;
create policy "Profile avatar owner update" on storage.objects for update to authenticated
using (bucket_id = 'profile-avatars' and public.can_stage_profile_avatar(name))
with check (bucket_id = 'profile-avatars' and public.can_stage_profile_avatar(name));

create or replace function public.get_personal_profile()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'user_id',u.id,'revision',d.revision,'full_name',case when d.user_id is null then
        left(coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name','')),100) else d.full_name end,
    'username',d.username,'nickname',d.nickname,'use_nickname',coalesce(d.use_nickname,false),
    'age',d.age,'gender',d.gender,'school',d.school,'province',d.province,
    'display_name',coalesce(nullif(p.display_name,u.email), 'Người dùng MindCanvas'),
    'avatar_url',coalesce(p.avatar_url,u.raw_user_meta_data->>'avatar_url'),
    'avatar_slot',d.avatar_slot,'avatar_revision',d.avatar_revision
  ) into result from auth.users u left join public.profiles p on p.id=u.id
    left join public.account_profile_details d on d.user_id=u.id where u.id=auth.uid();
  if result is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return result;
end $$;

create or replace function public.save_personal_profile(
  p_full_name text, p_username text, p_nickname text, p_use_nickname boolean, p_age integer,
  p_gender text, p_school text, p_province text, p_avatar_action text, p_expected_revision uuid, p_expected_owner uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved public.account_profile_details;
  next_slot smallint;
  next_avatar_rev uuid;
  public_name text;
begin
  if owner_id is null or owner_id is distinct from p_expected_owner then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  p_full_name := nullif(btrim(p_full_name),'');
  p_username := nullif(lower(btrim(p_username)),'');
  p_nickname := nullif(btrim(p_nickname),'');
  p_school := nullif(btrim(p_school),'');
  p_province := nullif(btrim(p_province),'');
  p_gender := nullif(p_gender,'');
  p_use_nickname := coalesce(p_use_nickname,false);
  if p_avatar_action is null or p_avatar_action not in ('keep','replace','remove') then
    raise exception 'INVALID_AVATAR_ACTION' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mindcanvas:profile:'||owner_id::text,0));
  select * into saved from public.account_profile_details d where d.user_id=owner_id;
  if saved.revision is distinct from p_expected_revision then raise exception 'PROFILE_CHANGED' using errcode = '40001'; end if;
  next_slot := saved.avatar_slot;
  next_avatar_rev := saved.avatar_revision;
  if p_avatar_action = 'replace' then
    next_slot := case when saved.avatar_slot=1 then 2 else 1 end;
    if not exists(select 1 from storage.objects o where o.bucket_id='profile-avatars'
        and o.name=owner_id::text||'/avatar-'||next_slot::text||'.jpg') then
      raise exception 'AVATAR_UPLOAD_MISSING' using errcode = '22023';
    end if;
    next_avatar_rev := gen_random_uuid();
  elsif p_avatar_action = 'remove' then
    next_slot := null; next_avatar_rev := null;
  end if;
  if p_age is not null and p_age not between 1 and 120 then raise exception 'INVALID_AGE' using errcode = '22023'; end if;
  insert into public.account_profile_details (user_id,full_name,username,nickname,use_nickname,age,gender,school,province,avatar_slot,avatar_revision)
    values (owner_id,p_full_name,p_username,p_nickname,p_use_nickname,p_age::smallint,p_gender,p_school,p_province,next_slot,next_avatar_rev)
  on conflict (user_id) do update set full_name=excluded.full_name,username=excluded.username,nickname=excluded.nickname,use_nickname=excluded.use_nickname,
    age=excluded.age,gender=excluded.gender,school=excluded.school,province=excluded.province,avatar_slot=excluded.avatar_slot,
    avatar_revision=excluded.avatar_revision,revision=gen_random_uuid();
  public_name := coalesce(case when p_use_nickname then p_nickname end,p_full_name,'@'||p_username,'Người dùng MindCanvas');
  insert into public.profiles (id,display_name) values (owner_id,public_name)
    on conflict (id) do update set display_name=excluded.display_name,updated_at=now();
  return public.get_personal_profile();
end $$;

-- The legacy list remains available to old clients. The new projection only
-- includes visible names, avatar references, and the existing chat fields.
create or replace function public.list_connections_with_profile()
returns table(peer_id uuid, display_name text, unread_count bigint, connected_at timestamptz, avatar_url text, avatar_slot smallint, avatar_revision uuid)
language sql stable security definer set search_path = '' as $$
  select c.peer_id,c.display_name,c.unread_count,c.connected_at,p.avatar_url,d.avatar_slot,d.avatar_revision
  from public.list_connections() c
  left join public.profiles p on p.id=c.peer_id
  left join public.account_profile_details d on d.user_id=c.peer_id
  order by c.connected_at desc
$$;

revoke all on function public.get_personal_profile(), public.save_personal_profile(text,text,text,boolean,integer,text,text,text,text,uuid,uuid),
  public.list_connections_with_profile() from public,anon;
grant execute on function public.get_personal_profile(), public.save_personal_profile(text,text,text,boolean,integer,text,text,text,text,uuid,uuid),
  public.list_connections_with_profile() to authenticated;
commit;
