-- MindCanvas V4.2 flashcard study plans, daily progress and idempotent review events.
-- The calendar day for streaks is Asia/Ho_Chi_Minh (00:00–23:59). This is
-- intentionally separate from the AI quota reset at 12:00 Vietnam time.

create table if not exists public.flashcard_study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  source_type text not null check (source_type in ('decks', 'document', 'mixed')),
  deck_ids jsonb not null default '[]'::jsonb,
  source_document_id uuid references public.documents(id) on delete set null,
  daily_target integer not null check (daily_target between 1 and 500),
  daily_minutes integer not null default 20 check (daily_minutes between 5 and 180),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists flashcard_study_plans_one_active_idx
  on public.flashcard_study_plans(user_id) where status = 'active';

create index if not exists flashcard_study_plans_user_updated_idx
  on public.flashcard_study_plans(user_id, updated_at desc);

create table if not exists public.flashcard_study_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  context_key text not null check (char_length(trim(context_key)) between 1 and 180),
  plan_id uuid references public.flashcard_study_plans(id) on delete cascade,
  target_count integer not null default 1 check (target_count between 1 and 500),
  reviewed_count integer not null default 0 check (reviewed_count >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  assigned_card_ids jsonb not null default '[]'::jsonb,
  reviewed_card_ids jsonb not null default '[]'::jsonb,
  forgotten_card_ids jsonb not null default '[]'::jsonb,
  completed boolean not null default false,
  first_review_at timestamptz,
  last_review_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, study_date, context_key)
);

create index if not exists flashcard_study_days_user_date_idx
  on public.flashcard_study_days(user_id, study_date desc);

create table if not exists public.flashcard_study_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  context_key text not null,
  plan_id uuid references public.flashcard_study_plans(id) on delete set null,
  card_id uuid references public.flashcards(id) on delete set null,
  rating text not null check (rating in ('again', 'hard', 'good', 'easy')),
  goal_unit smallint not null default 1 check (goal_unit in (0, 1)),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists flashcard_study_events_user_date_idx
  on public.flashcard_study_events(user_id, study_date desc);

alter table public.flashcard_study_plans enable row level security;
alter table public.flashcard_study_days enable row level security;
alter table public.flashcard_study_events enable row level security;

drop policy if exists "flashcard study plans are readable by owner" on public.flashcard_study_plans;
create policy "flashcard study plans are readable by owner"
  on public.flashcard_study_plans for select using (user_id = auth.uid());

drop policy if exists "flashcard study plans are insertable by owner" on public.flashcard_study_plans;
create policy "flashcard study plans are insertable by owner"
  on public.flashcard_study_plans for insert with check (
    user_id = auth.uid()
    and (source_document_id is null or exists (
      select 1 from public.documents d where d.id = source_document_id and d.user_id = auth.uid()
    ))
  );

drop policy if exists "flashcard study plans are updateable by owner" on public.flashcard_study_plans;
create policy "flashcard study plans are updateable by owner"
  on public.flashcard_study_plans for update using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (source_document_id is null or exists (
      select 1 from public.documents d where d.id = source_document_id and d.user_id = auth.uid()
    ))
  );

drop policy if exists "flashcard study plans are deletable by owner" on public.flashcard_study_plans;
create policy "flashcard study plans are deletable by owner"
  on public.flashcard_study_plans for delete using (user_id = auth.uid());

drop policy if exists "flashcard study days are readable by owner" on public.flashcard_study_days;
create policy "flashcard study days are readable by owner"
  on public.flashcard_study_days for select using (user_id = auth.uid());

drop policy if exists "flashcard study days are insertable by owner" on public.flashcard_study_days;
create policy "flashcard study days are insertable by owner"
  on public.flashcard_study_days for insert with check (
    user_id = auth.uid()
    and (plan_id is null or exists (
      select 1 from public.flashcard_study_plans p where p.id = plan_id and p.user_id = auth.uid()
    ))
  );

drop policy if exists "flashcard study days are updateable by owner" on public.flashcard_study_days;
create policy "flashcard study days are updateable by owner"
  on public.flashcard_study_days for update using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (plan_id is null or exists (
      select 1 from public.flashcard_study_plans p where p.id = plan_id and p.user_id = auth.uid()
    ))
  );

drop policy if exists "flashcard study events are readable by owner" on public.flashcard_study_events;
create policy "flashcard study events are readable by owner"
  on public.flashcard_study_events for select using (user_id = auth.uid());

create or replace function public.record_flashcard_study_event(
  p_event_id uuid,
  p_user_id uuid,
  p_study_date date,
  p_context_key text,
  p_plan_id uuid,
  p_card_id uuid,
  p_rating text,
  p_goal_unit smallint,
  p_target_count integer
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_day public.flashcard_study_days%rowtype;
  v_inserted boolean := false;
  v_target integer := greatest(1, least(500, coalesce(p_target_count, 1)));
  v_goal smallint := case when coalesce(p_goal_unit, 0) = 1 then 1 else 0 end;
begin
  if auth.uid() is null or p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'Study event user does not match the current session' using errcode = '42501';
  end if;
  if p_event_id is null or p_study_date is null or nullif(trim(p_context_key), '') is null then
    raise exception 'Invalid flashcard study event' using errcode = '22023';
  end if;
  if p_rating not in ('again', 'hard', 'good', 'easy') then
    raise exception 'Invalid flashcard rating' using errcode = '22023';
  end if;
  if p_plan_id is not null and not exists (
    select 1 from public.flashcard_study_plans p where p.id = p_plan_id and p.user_id = p_user_id
  ) then
    raise exception 'Study plan does not belong to the current user' using errcode = '42501';
  end if;
  if p_card_id is not null and not exists (
    select 1 from public.flashcards c where c.id = p_card_id and c.user_id = p_user_id
  ) then
    raise exception 'Flashcard does not belong to the current user' using errcode = '42501';
  end if;

  insert into public.flashcard_study_events (id, user_id, study_date, context_key, plan_id, card_id, rating, goal_unit)
  values (p_event_id, p_user_id, p_study_date, p_context_key, p_plan_id, p_card_id, p_rating, v_goal)
  on conflict (id) do nothing;
  v_inserted := found;

  if not v_inserted then
    select * into v_day from public.flashcard_study_days
    where user_id = p_user_id and study_date = p_study_date and context_key = p_context_key;
    if not found then
      raise exception 'Study event was recorded but its day is missing';
    end if;
    return to_jsonb(v_day);
  end if;

  insert into public.flashcard_study_days (
    user_id, study_date, context_key, plan_id, target_count, reviewed_count,
    retry_count, reviewed_card_ids, forgotten_card_ids, completed, first_review_at, last_review_at
  ) values (
    p_user_id, p_study_date, p_context_key, p_plan_id, v_target,
    case when p_card_id is null then v_goal else v_goal end,
    case when p_rating = 'again' then 1 else 0 end,
    case when p_card_id is null or v_goal = 0 then '[]'::jsonb else jsonb_build_array(p_card_id::text) end,
    case when p_card_id is null or p_rating <> 'again' then '[]'::jsonb else jsonb_build_array(p_card_id::text) end,
    v_goal >= v_target and (p_plan_id is null or p_rating <> 'again'),
    timezone('utc', now()), timezone('utc', now())
  )
  on conflict (user_id, study_date, context_key) do update set
    plan_id = coalesce(public.flashcard_study_days.plan_id, excluded.plan_id),
    target_count = greatest(public.flashcard_study_days.target_count, excluded.target_count),
    retry_count = public.flashcard_study_days.retry_count + excluded.retry_count,
    reviewed_card_ids = case
      when p_card_id is null or v_goal = 0 then public.flashcard_study_days.reviewed_card_ids
      when public.flashcard_study_days.reviewed_card_ids @> jsonb_build_array(p_card_id::text) then public.flashcard_study_days.reviewed_card_ids
      else public.flashcard_study_days.reviewed_card_ids || jsonb_build_array(p_card_id::text)
    end,
    forgotten_card_ids = case
      when p_card_id is null or p_rating <> 'again' then coalesce((select jsonb_agg(value) from jsonb_array_elements(public.flashcard_study_days.forgotten_card_ids) where value <> to_jsonb(p_card_id::text)), '[]'::jsonb)
      when public.flashcard_study_days.forgotten_card_ids @> jsonb_build_array(p_card_id::text) then public.flashcard_study_days.forgotten_card_ids
      else public.flashcard_study_days.forgotten_card_ids || jsonb_build_array(p_card_id::text)
    end,
    reviewed_count = public.flashcard_study_days.reviewed_count + case
      when p_card_id is null then v_goal
      when v_goal = 0 then 0
      when public.flashcard_study_days.reviewed_card_ids @> jsonb_build_array(p_card_id::text) then 0
      else 1
    end,
    completed = (
      public.flashcard_study_days.reviewed_count + case
        when p_card_id is null then v_goal
        when v_goal = 0 then 0
        when public.flashcard_study_days.reviewed_card_ids @> jsonb_build_array(p_card_id::text) then 0
        else 1
      end >= greatest(public.flashcard_study_days.target_count, excluded.target_count)
      and (p_plan_id is null or jsonb_array_length(case
        when p_card_id is null or p_rating <> 'again' then coalesce((select jsonb_agg(value) from jsonb_array_elements(public.flashcard_study_days.forgotten_card_ids) where value <> to_jsonb(p_card_id::text)), '[]'::jsonb)
        when public.flashcard_study_days.forgotten_card_ids @> jsonb_build_array(p_card_id::text) then public.flashcard_study_days.forgotten_card_ids
        else public.flashcard_study_days.forgotten_card_ids || jsonb_build_array(p_card_id::text)
      end) = 0)
    ),
    first_review_at = coalesce(public.flashcard_study_days.first_review_at, excluded.first_review_at),
    last_review_at = excluded.last_review_at,
    updated_at = timezone('utc', now());

  select * into v_day from public.flashcard_study_days
  where user_id = p_user_id and study_date = p_study_date and context_key = p_context_key;
  return to_jsonb(v_day);
end;
$$;

grant execute on function public.record_flashcard_study_event(uuid, uuid, date, text, uuid, uuid, text, smallint, integer) to authenticated;
revoke execute on function public.record_flashcard_study_event(uuid, uuid, date, text, uuid, uuid, text, smallint, integer) from anon, public;
