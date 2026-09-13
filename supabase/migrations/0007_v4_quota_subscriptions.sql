-- MindCanvas V4.0 quota, AI Manual add-on, subscription history and storage repair.
-- This migration is additive so it can be applied after 0006 without rewriting
-- an already-applied migration. Payments/webhooks remain outside the app.

alter table public.plans
  add column if not exists ai_auto_daily_limit integer not null default 0,
  add column if not exists ai_manual_daily_limit integer not null default 0,
  add column if not exists ai_manual_included boolean not null default false;

-- Cast the first multiplier to bigint so the 2 GB and 10 GB products do not
-- overflow PostgreSQL's 32-bit integer arithmetic before assignment.
update public.plans
set
  storage_limit_bytes = case id
    when 'free' then 20::bigint * 1024 * 1024
    when 'plus' then 500::bigint * 1024 * 1024
    when 'pro' then 2::bigint * 1024 * 1024 * 1024
    when 'max' then 10::bigint * 1024 * 1024 * 1024
  end,
  ai_auto_daily_limit = case id when 'free' then 1 when 'plus' then 20 when 'pro' then 60 when 'max' then 150 end,
  ai_manual_daily_limit = case id when 'free' then 3 else 0 end,
  ai_manual_included = case id when 'free' then false else true end,
  ai_auto_monthly_limit = case id when 'free' then 30 when 'plus' then 600 when 'pro' then 1800 when 'max' then 4500 end,
  max_cards = case id when 'free' then 50 when 'plus' then 100 when 'pro' then 200 when 'max' then 500 end;

create table if not exists public.addons (
  id text primary key check (id in ('ai_manual')),
  name text not null,
  price_vnd integer not null default 0 check (price_vnd >= 0),
  description text not null default '',
  active boolean not null default true
);

insert into public.addons (id, name, price_vnd, description, active)
values ('ai_manual', 'AI Manual', 29000, 'AI Manual không giới hạn cho tài khoản Free', true)
on conflict (id) do update set
  name = excluded.name,
  price_vnd = excluded.price_vnd,
  description = excluded.description,
  active = excluded.active;

create table if not exists public.account_addons (
  user_id uuid not null references auth.users(id) on delete cascade,
  addon_id text not null references public.addons(id),
  status text not null default 'active' check (status in ('active', 'paused', 'expired')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  note text,
  primary key (user_id, addon_id)
);

create index if not exists account_addons_status_idx on public.account_addons(addon_id, status, expires_at);

create table if not exists public.usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  ai_auto_count integer not null default 0 check (ai_auto_count >= 0),
  ai_manual_count integer not null default 0 check (ai_manual_count >= 0),
  ai_auto_reserved integer not null default 0 check (ai_auto_reserved >= 0),
  ai_manual_reserved integer not null default 0 check (ai_manual_reserved >= 0),
  last_used_at timestamptz,
  primary key (user_id, period_start)
);

create table if not exists public.ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('ai_auto', 'ai_manual')),
  period_start timestamptz not null,
  status text not null default 'reserved' check (status in ('reserved', 'committed', 'released')),
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index if not exists ai_usage_reservations_user_idx on public.ai_usage_reservations(user_id, period_start, status);

create table if not exists public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  change_type text not null check (change_type in ('plan', 'addon', 'plan_and_addon')),
  previous_plan_id text references public.plans(id),
  new_plan_id text references public.plans(id),
  previous_addon_enabled boolean not null default false,
  new_addon_enabled boolean not null default false,
  previous_expires_at timestamptz,
  new_expires_at timestamptz,
  changed_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists subscription_history_user_created_idx on public.subscription_history(user_id, created_at desc);

alter table public.addons enable row level security;
alter table public.account_addons enable row level security;
alter table public.usage_daily enable row level security;
alter table public.ai_usage_reservations enable row level security;
alter table public.subscription_history enable row level security;

drop policy if exists "addons are publicly readable" on public.addons;
create policy "addons are publicly readable" on public.addons for select using (active = true);
drop policy if exists "account addons are readable by owner" on public.account_addons;
create policy "account addons are readable by owner" on public.account_addons for select using (user_id = auth.uid());
drop policy if exists "daily usage is readable by owner" on public.usage_daily;
create policy "daily usage is readable by owner" on public.usage_daily for select using (user_id = auth.uid());
drop policy if exists "subscription history is readable by owner" on public.subscription_history;
create policy "subscription history is readable by owner" on public.subscription_history for select using (user_id = auth.uid());

-- Recompute from source rows instead of applying deltas. Delta-based updates
-- could create a negative row when account_storage was missing and a note was
-- edited down in size, which caused the reported 23514 error.
create or replace function public.recompute_account_storage_for_user(p_user_id uuid)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_total bigint;
begin
  select
    coalesce((select sum(pg_column_size(n.content)::bigint) from public.notes n where n.user_id = p_user_id), 0)
    + coalesce((select sum(d.file_size_bytes)::bigint from public.documents d where d.user_id = p_user_id), 0)
  into v_total;
  v_total := greatest(0, coalesce(v_total, 0));
  insert into public.account_storage (user_id, storage_bytes, updated_at)
  values (p_user_id, v_total, timezone('utc', now()))
  on conflict (user_id) do update set
    storage_bytes = excluded.storage_bytes,
    updated_at = excluded.updated_at;
  return v_total;
end;
$$;

create or replace function public.sync_account_storage()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and OLD.user_id is distinct from NEW.user_id then
    perform public.recompute_account_storage_for_user(OLD.user_id);
  end if;
  perform public.recompute_account_storage_for_user(case when TG_OP = 'DELETE' then OLD.user_id else NEW.user_id end);
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

-- Friendly database-boundary guard. Existing accounts above a newly lowered
-- limit may still edit/delete content to reduce usage, but cannot increase it.
create or replace function public.guard_account_storage()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := NEW.user_id;
  v_existing bigint := 0;
  v_new_bytes bigint := 0;
  v_old_bytes bigint := 0;
  v_limit bigint;
begin
  select case
    when (ae.status is null or ae.status = 'active')
      and (ae.expires_at is null or ae.expires_at > now())
      then coalesce(p.storage_limit_bytes, free_plan.storage_limit_bytes)
    else free_plan.storage_limit_bytes
  end
  into v_limit
  from public.plans free_plan
  left join public.account_entitlements ae on ae.user_id = v_user_id
  left join public.plans p on p.id = ae.plan_id
  where free_plan.id = 'free'
  limit 1;

  if TG_TABLE_NAME = 'notes' then
    v_new_bytes := pg_column_size(NEW.content)::bigint;
    if TG_OP = 'UPDATE' then
      v_old_bytes := pg_column_size(OLD.content)::bigint;
    end if;
    select coalesce((select sum(pg_column_size(n.content)::bigint) from public.notes n where n.user_id = v_user_id and n.id <> NEW.id), 0)
      + coalesce((select sum(d.file_size_bytes)::bigint from public.documents d where d.user_id = v_user_id), 0)
    into v_existing;
  else
    v_new_bytes := coalesce(NEW.file_size_bytes, 0);
    if TG_OP = 'UPDATE' then
      v_old_bytes := coalesce(OLD.file_size_bytes, 0);
    end if;
    select coalesce((select sum(pg_column_size(n.content)::bigint) from public.notes n where n.user_id = v_user_id), 0)
      + coalesce((select sum(d.file_size_bytes)::bigint from public.documents d where d.user_id = v_user_id and d.id <> NEW.id), 0)
    into v_existing;
  end if;

  if v_existing + v_new_bytes > v_limit and (TG_OP = 'INSERT' or v_new_bytes > v_old_bytes) then
    raise exception 'Storage quota exceeded for this account'
      using errcode = 'P0001', detail = json_build_object('limitBytes', v_limit, 'usedBytes', v_existing, 'requestedBytes', v_new_bytes)::text;
  end if;
  return NEW;
end;
$$;

drop trigger if exists notes_storage_usage_trigger on public.notes;
drop trigger if exists documents_storage_usage_trigger on public.documents;
drop trigger if exists notes_storage_guard_trigger on public.notes;
drop trigger if exists documents_storage_guard_trigger on public.documents;
create trigger notes_storage_guard_trigger before insert or update of content, user_id on public.notes for each row execute procedure public.guard_account_storage();
create trigger documents_storage_guard_trigger before insert or update of file_size_bytes, user_id on public.documents for each row execute procedure public.guard_account_storage();
create trigger notes_storage_usage_trigger after insert or update of content, user_id or delete on public.notes for each row execute procedure public.sync_account_storage();
create trigger documents_storage_usage_trigger after insert or update of file_size_bytes, user_id or delete on public.documents for each row execute procedure public.sync_account_storage();

insert into public.account_storage (user_id, storage_bytes)
select u.id,
  greatest(0,
    coalesce((select sum(pg_column_size(n.content)::bigint) from public.notes n where n.user_id = u.id), 0)
    + coalesce((select sum(d.file_size_bytes)::bigint from public.documents d where d.user_id = u.id), 0)
  )
from auth.users u
on conflict (user_id) do update set storage_bytes = excluded.storage_bytes, updated_at = timezone('utc', now());

create or replace function public.current_ai_period_start()
returns timestamptz
language sql
stable
as $$
  select (
    date_trunc('day', timezone('Asia/Ho_Chi_Minh', now()) - interval '12 hours')
    + interval '12 hours'
  ) at time zone 'Asia/Ho_Chi_Minh';
$$;

create or replace function public.reserve_ai_usage(
  p_user_id uuid,
  p_mode text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_period timestamptz := public.current_ai_period_start();
  v_auto_limit integer;
  v_manual_limit integer;
  v_manual_unlimited boolean := false;
  v_daily public.usage_daily;
  v_existing public.ai_usage_reservations;
  v_used integer;
  v_reserved integer;
  v_limit integer;
begin
  if p_mode not in ('ai_auto', 'ai_manual') then raise exception 'Invalid AI quota mode'; end if;
  if p_request_id is null or length(trim(p_request_id)) < 8 then raise exception 'Invalid AI quota request id'; end if;

  select ai_auto_daily_limit, ai_manual_daily_limit
  into v_auto_limit, v_manual_limit
  from public.plans where id = 'free';

  select
    case when ae.status = 'active' and (ae.expires_at is null or ae.expires_at > now()) then p.ai_auto_daily_limit else free_plan.ai_auto_daily_limit end,
    case when ae.status = 'active' and (ae.expires_at is null or ae.expires_at > now()) then p.ai_manual_daily_limit else free_plan.ai_manual_daily_limit end,
    case when ae.status = 'active' and (ae.expires_at is null or ae.expires_at > now()) then p.ai_manual_included else free_plan.ai_manual_included end
  into v_auto_limit, v_manual_limit, v_manual_unlimited
  from public.plans free_plan
  left join public.account_entitlements ae on ae.user_id = p_user_id
  left join public.plans p on p.id = ae.plan_id
  where free_plan.id = 'free'
  limit 1;

  if exists (
    select 1 from public.account_addons aa
    where aa.user_id = p_user_id and aa.addon_id = 'ai_manual' and aa.status = 'active'
      and (aa.expires_at is null or aa.expires_at > now())
  ) then v_manual_unlimited := true; end if;

  if p_mode = 'ai_auto' then v_limit := v_auto_limit; else v_limit := case when v_manual_unlimited then null else v_manual_limit end; end if;

  select * into v_existing from public.ai_usage_reservations where request_id = p_request_id and user_id = p_user_id;
  if found and v_existing.status in ('reserved', 'committed') then
    return jsonb_build_object('ok', true, 'duplicate', true, 'reservationId', v_existing.id, 'mode', v_existing.mode, 'periodStart', v_existing.period_start, 'limit', v_limit);
  end if;
  if found then delete from public.ai_usage_reservations where id = v_existing.id; end if;

  insert into public.usage_daily (user_id, period_start)
  values (p_user_id, v_period)
  on conflict (user_id, period_start) do nothing;
  select * into v_daily from public.usage_daily where user_id = p_user_id and period_start = v_period for update;
  if p_mode = 'ai_auto' then v_used := v_daily.ai_auto_count; v_reserved := v_daily.ai_auto_reserved; else v_used := v_daily.ai_manual_count; v_reserved := v_daily.ai_manual_reserved; end if;
  if v_limit is not null and v_used + v_reserved >= v_limit then
    raise exception 'AI quota reached' using errcode = 'P0001', detail = json_build_object('mode', p_mode, 'limit', v_limit, 'used', v_used, 'periodStart', v_period)::text;
  end if;

  if p_mode = 'ai_auto' then
    update public.usage_daily set ai_auto_reserved = ai_auto_reserved + 1, last_used_at = timezone('utc', now()) where user_id = p_user_id and period_start = v_period;
  else
    update public.usage_daily set ai_manual_reserved = ai_manual_reserved + 1, last_used_at = timezone('utc', now()) where user_id = p_user_id and period_start = v_period;
  end if;
  insert into public.ai_usage_reservations (request_id, user_id, mode, period_start) values (p_request_id, p_user_id, p_mode, v_period) returning * into v_existing;
  return jsonb_build_object('ok', true, 'duplicate', false, 'reservationId', v_existing.id, 'mode', p_mode, 'periodStart', v_period, 'limit', v_limit, 'used', v_used, 'remaining', case when v_limit is null then null else greatest(0, v_limit - v_used - v_reserved - 1) end);
end;
$$;

create or replace function public.commit_ai_usage(p_request_id text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_res public.ai_usage_reservations;
begin
  select * into v_res from public.ai_usage_reservations where request_id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_res.status = 'committed' then return jsonb_build_object('ok', true, 'duplicate', true, 'reservationId', v_res.id); end if;
  if v_res.status <> 'reserved' then return jsonb_build_object('ok', false, 'reason', v_res.status); end if;
  if v_res.mode = 'ai_auto' then
    update public.usage_daily set ai_auto_reserved = greatest(0, ai_auto_reserved - 1), ai_auto_count = ai_auto_count + 1, last_used_at = timezone('utc', now()) where user_id = v_res.user_id and period_start = v_res.period_start;
  else
    update public.usage_daily set ai_manual_reserved = greatest(0, ai_manual_reserved - 1), ai_manual_count = ai_manual_count + 1, last_used_at = timezone('utc', now()) where user_id = v_res.user_id and period_start = v_res.period_start;
  end if;
  update public.ai_usage_reservations set status = 'committed', completed_at = timezone('utc', now()) where id = v_res.id;
  return jsonb_build_object('ok', true, 'duplicate', false, 'reservationId', v_res.id);
end;
$$;

create or replace function public.release_ai_usage(p_request_id text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_res public.ai_usage_reservations;
begin
  select * into v_res from public.ai_usage_reservations where request_id = p_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_res.status <> 'reserved' then return jsonb_build_object('ok', true, 'duplicate', true, 'status', v_res.status); end if;
  if v_res.mode = 'ai_auto' then
    update public.usage_daily set ai_auto_reserved = greatest(0, ai_auto_reserved - 1) where user_id = v_res.user_id and period_start = v_res.period_start;
  else
    update public.usage_daily set ai_manual_reserved = greatest(0, ai_manual_reserved - 1) where user_id = v_res.user_id and period_start = v_res.period_start;
  end if;
  update public.ai_usage_reservations set status = 'released', completed_at = timezone('utc', now()) where id = v_res.id;
  return jsonb_build_object('ok', true, 'duplicate', false, 'status', 'released');
end;
$$;

create or replace function public.admin_assign_subscription(
  p_admin_user_id uuid,
  p_user_id uuid,
  p_plan_id text,
  p_addon_enabled boolean,
  p_expires_at timestamptz default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_old_plan text;
  v_old_status text;
  v_old_expires timestamptz;
  v_old_addon boolean := false;
  v_change_type text;
begin
  if not exists (select 1 from public.plans where id = p_plan_id and active) then raise exception 'Invalid plan'; end if;
  select plan_id, status, expires_at into v_old_plan, v_old_status, v_old_expires from public.account_entitlements where user_id = p_user_id;
  select exists (
    select 1 from public.account_addons where user_id = p_user_id and addon_id = 'ai_manual' and status = 'active' and (expires_at is null or expires_at > now())
  ) into v_old_addon;

  insert into public.account_entitlements (user_id, plan_id, status, assigned_by, assigned_at, expires_at, note)
  values (p_user_id, p_plan_id, 'active', p_admin_user_id, timezone('utc', now()), p_expires_at, p_note)
  on conflict (user_id) do update set plan_id = excluded.plan_id, status = excluded.status, assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at, expires_at = excluded.expires_at, note = excluded.note;

  insert into public.account_addons (user_id, addon_id, status, assigned_by, assigned_at, expires_at, note)
  values (p_user_id, 'ai_manual', case when p_addon_enabled then 'active' else 'paused' end, p_admin_user_id, timezone('utc', now()), p_expires_at, p_note)
  on conflict (user_id, addon_id) do update set status = excluded.status, assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at, expires_at = excluded.expires_at, note = excluded.note;

  v_change_type := case
    when coalesce(v_old_plan, 'free') <> p_plan_id and v_old_addon <> p_addon_enabled then 'plan_and_addon'
    when coalesce(v_old_plan, 'free') <> p_plan_id or v_old_expires is distinct from p_expires_at then 'plan'
    else 'addon'
  end;
  if coalesce(v_old_plan, 'free') <> p_plan_id
    or v_old_addon <> p_addon_enabled
    or v_old_expires is distinct from p_expires_at
    or v_old_status is distinct from 'active'
    or p_note is not null then
    insert into public.subscription_history (user_id, change_type, previous_plan_id, new_plan_id, previous_addon_enabled, new_addon_enabled, previous_expires_at, new_expires_at, changed_by, note)
    values (p_user_id, v_change_type, coalesce(v_old_plan, 'free'), p_plan_id, v_old_addon, p_addon_enabled, v_old_expires, p_expires_at, p_admin_user_id, p_note);
  end if;
  insert into public.admin_audit_log (admin_user_id, target_user_id, action, before_state, after_state)
  values (p_admin_user_id, p_user_id, 'assign_subscription', jsonb_build_object('planId', coalesce(v_old_plan, 'free'), 'status', v_old_status, 'addonEnabled', v_old_addon, 'expiresAt', v_old_expires, 'note', p_note), jsonb_build_object('planId', p_plan_id, 'addonEnabled', p_addon_enabled, 'expiresAt', p_expires_at, 'note', p_note));
  return jsonb_build_object('ok', true, 'changeType', v_change_type);
end;
$$;

revoke all on function public.recompute_account_storage_for_user(uuid) from public, anon, authenticated;
revoke all on function public.current_ai_period_start() from public, anon, authenticated;
revoke all on function public.reserve_ai_usage(uuid, text, text) from public, anon, authenticated;
revoke all on function public.commit_ai_usage(text) from public, anon, authenticated;
revoke all on function public.release_ai_usage(text) from public, anon, authenticated;
revoke all on function public.admin_assign_subscription(uuid, uuid, text, boolean, timestamptz, text) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, text) to service_role;
grant execute on function public.commit_ai_usage(text) to service_role;
grant execute on function public.release_ai_usage(text) to service_role;
grant execute on function public.admin_assign_subscription(uuid, uuid, text, boolean, timestamptz, text) to service_role;
