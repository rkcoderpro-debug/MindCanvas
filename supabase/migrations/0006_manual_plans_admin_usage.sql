-- Manual plan administration and usage telemetry.
-- Payments/webhooks are intentionally not part of this migration. An admin
-- assigns a plan after confirming payment outside MindCanvas.

create table if not exists public.plans (
  id text primary key check (id in ('free', 'plus', 'pro', 'max')),
  name text not null,
  price_vnd integer not null default 0 check (price_vnd >= 0),
  storage_limit_bytes bigint not null check (storage_limit_bytes > 0),
  ai_auto_monthly_limit integer not null check (ai_auto_monthly_limit >= 0),
  max_cards integer not null default 500 check (max_cards between 3 and 500),
  description text not null default '',
  sort_order integer not null,
  active boolean not null default true
);

insert into public.plans (id, name, price_vnd, storage_limit_bytes, ai_auto_monthly_limit, max_cards, description, sort_order)
values
  ('free', 'Free', 0, 52428800, 5, 500, 'Bắt đầu học và làm việc', 1),
  ('plus', 'Plus', 79000, 524288000, 20, 500, 'Cho nhu cầu học tập thường xuyên', 2),
  ('pro', 'Pro', 159000, 2147483648, 60, 500, 'Cho người dùng chuyên sâu', 3),
  ('max', 'Max', 299000, 10737418240, 150, 500, 'Toàn bộ giới hạn mở rộng', 4)
on conflict (id) do update set
  name = excluded.name,
  price_vnd = excluded.price_vnd,
  storage_limit_bytes = excluded.storage_limit_bytes,
  ai_auto_monthly_limit = excluded.ai_auto_monthly_limit,
  max_cards = excluded.max_cards,
  description = excluded.description,
  sort_order = excluded.sort_order;

create table if not exists public.account_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'active' check (status in ('active', 'paused', 'expired')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  note text
);

create index if not exists account_entitlements_plan_idx on public.account_entitlements(plan_id, status);

create table if not exists public.usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  ai_auto_count integer not null default 0 check (ai_auto_count >= 0),
  mind_map_count integer not null default 0 check (mind_map_count >= 0),
  flashcard_count integer not null default 0 check (flashcard_count >= 0),
  selection_count integer not null default 0 check (selection_count >= 0),
  upload_count integer not null default 0 check (upload_count >= 0),
  last_used_at timestamptz,
  primary key (user_id, month_start)
);

-- Current persisted source/project footprint. This is separate from the
-- monthly upload counter because the storage limit is per account, not per
-- calendar month.
create table if not exists public.account_storage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  units integer not null default 1 check (units > 0),
  bytes bigint not null default 0 check (bytes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists usage_events_user_created_idx on public.usage_events(user_id, created_at desc);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.plans enable row level security;
alter table public.account_entitlements enable row level security;
alter table public.usage_monthly enable row level security;
alter table public.usage_events enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.account_storage enable row level security;

drop policy if exists "plans are publicly readable" on public.plans;
create policy "plans are publicly readable" on public.plans for select using (active = true);
drop policy if exists "entitlements are readable by owner" on public.account_entitlements;
create policy "entitlements are readable by owner" on public.account_entitlements for select using (user_id = auth.uid());
drop policy if exists "monthly usage is readable by owner" on public.usage_monthly;
create policy "monthly usage is readable by owner" on public.usage_monthly for select using (user_id = auth.uid());
drop policy if exists "usage events are readable by owner" on public.usage_events;
create policy "usage events are readable by owner" on public.usage_events for select using (user_id = auth.uid());
drop policy if exists "account storage is readable by owner" on public.account_storage;
create policy "account storage is readable by owner" on public.account_storage for select using (user_id = auth.uid());

alter table public.documents add column if not exists file_size_bytes bigint not null default 0 check (file_size_bytes >= 0);

create or replace function public.sync_account_storage()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_delta bigint := 0;
begin
  if TG_TABLE_NAME = 'notes' then
    v_user_id := case when TG_OP = 'DELETE' then OLD.user_id else NEW.user_id end;
    if TG_OP = 'INSERT' then v_delta := pg_column_size(NEW.content)::bigint;
    elsif TG_OP = 'UPDATE' then v_delta := pg_column_size(NEW.content)::bigint - pg_column_size(OLD.content)::bigint;
    else v_delta := -pg_column_size(OLD.content)::bigint;
    end if;
  else
    v_user_id := case when TG_OP = 'DELETE' then OLD.user_id else NEW.user_id end;
    if TG_OP = 'INSERT' then v_delta := NEW.file_size_bytes;
    elsif TG_OP = 'UPDATE' then v_delta := NEW.file_size_bytes - OLD.file_size_bytes;
    else v_delta := -OLD.file_size_bytes;
    end if;
  end if;
  if TG_OP = 'DELETE' then
    update public.account_storage
       set storage_bytes = greatest(0, storage_bytes + v_delta),
           updated_at = timezone('utc', now())
     where user_id = v_user_id;
  else
    insert into public.account_storage (user_id, storage_bytes, updated_at)
    values (v_user_id, v_delta, timezone('utc', now()))
    on conflict (user_id) do update set storage_bytes = greatest(0, account_storage.storage_bytes + excluded.storage_bytes), updated_at = timezone('utc', now());
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

drop trigger if exists notes_storage_usage_trigger on public.notes;
create trigger notes_storage_usage_trigger after insert or update of content or delete on public.notes for each row execute procedure public.sync_account_storage();
drop trigger if exists documents_storage_usage_trigger on public.documents;
create trigger documents_storage_usage_trigger after insert or update of file_size_bytes or delete on public.documents for each row execute procedure public.sync_account_storage();

insert into public.account_storage (user_id, storage_bytes)
select u.id,
  coalesce((select sum(pg_column_size(n.content)::bigint) from public.notes n where n.user_id = u.id), 0)
  + coalesce((select sum(d.file_size_bytes)::bigint from public.documents d where d.user_id = u.id), 0)
from auth.users u
on conflict (user_id) do update set storage_bytes = excluded.storage_bytes, updated_at = timezone('utc', now());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do update set display_name = excluded.display_name, avatar_url = excluded.avatar_url, updated_at = now();
  insert into public.account_entitlements (user_id, plan_id)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

insert into public.account_entitlements (user_id, plan_id)
select u.id, 'free' from auth.users u
on conflict (user_id) do nothing;

create or replace function public.record_usage(
  p_user_id uuid,
  p_kind text,
  p_units integer default 1,
  p_bytes bigint default 0,
  p_metadata jsonb default '{}'::jsonb
)
returns public.usage_monthly
language plpgsql
security definer set search_path = public
as $$
declare
  v_month date := date_trunc('month', timezone('utc', now()))::date;
  v_row public.usage_monthly;
begin
  if p_units < 1 or p_bytes < 0 then raise exception 'Invalid usage amount'; end if;
  insert into public.usage_events (user_id, kind, units, bytes, metadata)
  values (p_user_id, p_kind, p_units, p_bytes, coalesce(p_metadata, '{}'::jsonb));
  insert into public.usage_monthly (user_id, month_start, storage_bytes, ai_auto_count, mind_map_count, flashcard_count, selection_count, upload_count, last_used_at)
  values (
    p_user_id, v_month,
    case when p_kind = 'document_upload' then p_bytes else 0 end,
    case when p_kind like 'ai_%' then p_units else 0 end,
    case when p_kind = 'ai_mind_map' then p_units else 0 end,
    case when p_kind = 'ai_flashcards' then greatest(p_units, coalesce((p_metadata->>'cardCount')::integer, p_units)) else 0 end,
    case when p_kind = 'ai_selection' then p_units else 0 end,
    case when p_kind = 'document_upload' then p_units else 0 end,
    timezone('utc', now())
  )
  on conflict (user_id, month_start) do update set
    storage_bytes = usage_monthly.storage_bytes + excluded.storage_bytes,
    ai_auto_count = usage_monthly.ai_auto_count + excluded.ai_auto_count,
    mind_map_count = usage_monthly.mind_map_count + excluded.mind_map_count,
    flashcard_count = usage_monthly.flashcard_count + excluded.flashcard_count,
    selection_count = usage_monthly.selection_count + excluded.selection_count,
    upload_count = usage_monthly.upload_count + excluded.upload_count,
    last_used_at = excluded.last_used_at
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.record_usage(uuid, text, integer, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.record_usage(uuid, text, integer, bigint, jsonb) to service_role;
