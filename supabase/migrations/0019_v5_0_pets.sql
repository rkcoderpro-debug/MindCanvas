-- v5.0 study companion. Apply after 0018_v4_9_learning_shares.sql.
-- Pet state is account-scoped; the browser keeps a local fallback for guests
-- and for offline sessions. Activity events are idempotent by event_id.
create table if not exists public.pet_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pet_kind text not null default 'cat' check (pet_kind in ('cat','dog','fox','rabbit')),
  pet_name text not null default 'Milo' check (char_length(trim(pet_name)) between 1 and 40),
  vitality integer not null default 72 check (vitality between 0 and 100),
  xp bigint not null default 0 check (xp >= 0),
  total_study_seconds bigint not null default 0 check (total_study_seconds >= 0),
  last_active_at timestamptz,
  last_decay_at timestamptz,
  daily_study_date date,
  daily_study_seconds integer not null default 0 check (daily_study_seconds >= 0),
  daily_vitality_gain integer not null default 0 check (daily_vitality_gain between 0 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pet_activity_events (
  event_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null check (activity_type in ('workspace','flashcard','quiz','lab')),
  seconds integer not null check (seconds between 1 and 300),
  occurred_at timestamptz not null default now()
);
create index if not exists pet_activity_user_time on public.pet_activity_events(user_id, occurred_at desc);

alter table public.pet_profiles enable row level security;
alter table public.pet_activity_events enable row level security;
drop policy if exists pet_profiles_owner_read on public.pet_profiles;
create policy pet_profiles_owner_read on public.pet_profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists pet_activity_owner_read on public.pet_activity_events;
create policy pet_activity_owner_read on public.pet_activity_events for select to authenticated using (user_id = auth.uid());

-- Direct writes stay unavailable to clients; the two RPCs below are the only
-- write path and always use auth.uid() as the account owner.
revoke all on public.pet_profiles, public.pet_activity_events from public, anon, authenticated;
grant select on public.pet_profiles, public.pet_activity_events to authenticated;

create or replace function public.get_my_pet()
returns public.pet_profiles
language plpgsql security definer set search_path = '' as $$
declare
  v public.pet_profiles;
  v_reference timestamptz;
  v_loss integer;
begin
  if auth.uid() is null then raise exception 'Sign in to load your pet'; end if;
  insert into public.pet_profiles(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into v from public.pet_profiles where user_id = auth.uid() for update;
  v_reference := coalesce(v.last_decay_at, v.last_active_at);
  if v_reference is not null and now() - v_reference > interval '48 hours' then
    v_loss := greatest(1, floor(extract(epoch from (now() - v_reference - interval '48 hours')) / 86400)::integer) * 5;
    update public.pet_profiles
      set vitality = greatest(20, vitality - v_loss), last_decay_at = now(), updated_at = now()
      where user_id = auth.uid();
    select * into v from public.pet_profiles where user_id = auth.uid();
  end if;
  return v;
end $$;

create or replace function public.update_my_pet(p_kind text, p_name text)
returns public.pet_profiles
language plpgsql security definer set search_path = '' as $$
declare v public.pet_profiles; v_name text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'Sign in to update your pet'; end if;
  if p_kind is null or p_kind not in ('cat','dog','fox','rabbit') or char_length(v_name) not between 1 and 40 then
    raise exception 'Invalid pet settings';
  end if;
  insert into public.pet_profiles(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.pet_profiles
    set pet_kind = p_kind, pet_name = v_name, updated_at = now()
    where user_id = auth.uid();
  select * into v from public.pet_profiles where user_id = auth.uid();
  return v;
end $$;

create or replace function public.record_pet_activity(p_event_id uuid, p_seconds integer, p_activity_type text)
returns public.pet_profiles
language plpgsql security definer set search_path = '' as $$
declare
  v public.pet_profiles;
  v_inserted integer;
  v_date date;
  v_daily_seconds integer;
  v_previous_gain integer;
  v_next_gain integer;
  v_gain integer;
begin
  if auth.uid() is null then raise exception 'Sign in to record study time'; end if;
  if p_event_id is null or p_seconds is null or p_seconds not between 1 and 300 or p_activity_type is null or p_activity_type not in ('workspace','flashcard','quiz','lab') then
    raise exception 'Invalid pet activity';
  end if;
  insert into public.pet_activity_events(event_id,user_id,activity_type,seconds)
    values (p_event_id,auth.uid(),p_activity_type,p_seconds)
    on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  select * into v from public.get_my_pet();
  if v_inserted = 0 then return v; end if;

  v_date := timezone('Asia/Ho_Chi_Minh', now())::date;
  v_daily_seconds := case when v.daily_study_date = v_date then v.daily_study_seconds else 0 end;
  v_previous_gain := case when v.daily_study_date = v_date then v.daily_vitality_gain else 0 end;
  v_next_gain := least(24, floor((v_daily_seconds + p_seconds) / 300)::integer * 2);
  v_gain := greatest(0, v_next_gain - v_previous_gain);
  update public.pet_profiles set
    vitality = least(100, vitality + v_gain),
    xp = xp + floor(p_seconds / 60)::bigint,
    total_study_seconds = total_study_seconds + p_seconds,
    last_active_at = now(), last_decay_at = null,
    daily_study_date = v_date, daily_study_seconds = v_daily_seconds + p_seconds,
    daily_vitality_gain = v_next_gain, updated_at = now()
    where user_id = auth.uid();
  select * into v from public.pet_profiles where user_id = auth.uid();
  return v;
end $$;

revoke all on function public.get_my_pet(), public.update_my_pet(text,text), public.record_pet_activity(uuid,integer,text) from public, anon;
grant execute on function public.get_my_pet(), public.update_my_pet(text,text), public.record_pet_activity(uuid,integer,text) to authenticated;

notify pgrst, 'reload schema';
