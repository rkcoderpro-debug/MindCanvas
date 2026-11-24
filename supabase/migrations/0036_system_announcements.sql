-- Independent of personal activity and private messages. One row per broadcast.
begin;

create table if not exists public.system_announcements (
  id uuid primary key,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now()
);
create index if not exists system_announcements_delivery on public.system_announcements(published_at desc, id desc);
create table if not exists public.system_announcement_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  announcement_id uuid not null references public.system_announcements(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(user_id, announcement_id)
);
alter table public.system_announcements enable row level security;
alter table public.system_announcement_reads enable row level security;
revoke all on public.system_announcements, public.system_announcement_reads from public, anon, authenticated;
grant select on public.system_announcements to service_role;

create or replace function public.publish_system_announcement(p_id uuid, p_admin uuid, p_title text, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.system_announcements;
begin
  p_title := btrim(p_title);
  p_body := btrim(p_body);
  if p_id is null or p_admin is null or p_title is null or p_body is null or
      char_length(p_title) not between 1 and 120 or char_length(p_body) not between 1 and 4000 then
    raise exception 'INVALID_ANNOUNCEMENT' using errcode = '22023';
  end if;
  insert into public.system_announcements (id, title, body, created_by)
    values (p_id, p_title, p_body, p_admin) on conflict (id) do nothing;
  select * into saved from public.system_announcements a where a.id = p_id;
  if saved.created_by is distinct from p_admin or saved.title is distinct from p_title or saved.body is distinct from p_body then
    raise exception 'ANNOUNCEMENT_REQUEST_CONFLICT' using errcode = '23505';
  end if;
  return jsonb_build_object('id',saved.id,'title',saved.title,'body',saved.body,'published_at',saved.published_at);
end $$;

create or replace function public.list_system_announcements(p_before_at timestamptz default null, p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare joined_at timestamptz;
begin
  if (p_before_at is null) <> (p_before_id is null) then raise exception 'INVALID_CURSOR' using errcode = '22023'; end if;
  select u.created_at into joined_at from auth.users u where u.id = auth.uid();
  if joined_at is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  return (
    with feed as materialized (
      select a.id, a.title, a.body, a.published_at
      from public.system_announcements a
      where a.published_at >= joined_at and a.published_at <= now()
        and (p_before_at is null or (a.published_at,a.id) < (p_before_at,p_before_id))
      order by a.published_at desc, a.id desc limit 31
    ), page as (
      select f.*, r.read_at from feed f
      left join public.system_announcement_reads r on r.announcement_id = f.id and r.user_id = auth.uid()
      order by f.published_at desc, f.id desc limit 30
    )
    select jsonb_build_object(
      'items', (select coalesce(jsonb_agg(to_jsonb(p) order by p.published_at desc,p.id desc),'[]'::jsonb) from page p),
      'hasMore', (select count(*) > 30 from feed),
      'unreadCount', (select count(*) from public.system_announcements a
        where a.published_at >= joined_at and a.published_at <= now()
        and not exists (select 1 from public.system_announcement_reads r where r.user_id = auth.uid() and r.announcement_id = a.id))
    )
  );
end $$;

create or replace function public.mark_system_announcement_read(p_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare first_read timestamptz;
begin
  if not exists(select 1 from public.system_announcements a join auth.users u on u.id = auth.uid()
      where a.id = p_id and a.published_at >= u.created_at and a.published_at <= now()) then
    raise exception 'ANNOUNCEMENT_UNAVAILABLE' using errcode = '42501';
  end if;
  insert into public.system_announcement_reads (user_id,announcement_id)
    values (auth.uid(),p_id) on conflict do nothing;
  select r.read_at into first_read from public.system_announcement_reads r where r.user_id=auth.uid() and r.announcement_id=p_id;
  return first_read;
end $$;

revoke all on function public.publish_system_announcement(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.publish_system_announcement(uuid,uuid,text,text) to service_role;
revoke all on function public.list_system_announcements(timestamptz,uuid), public.mark_system_announcement_read(uuid) from public, anon;
grant execute on function public.list_system_announcements(timestamptz,uuid), public.mark_system_announcement_read(uuid) to authenticated;
commit;
