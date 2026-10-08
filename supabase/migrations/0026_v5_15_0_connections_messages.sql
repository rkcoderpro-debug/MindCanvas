-- Apply after 0025. Private connections and one-to-one learning conversations.
-- A code/link is a random 256-bit token; only its SHA-256 hash is persisted.
create table if not exists public.connection_invitations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text check (recipient_email is null or (recipient_email = lower(trim(recipient_email)) and length(recipient_email) between 3 and 320)),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  recipient_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(), resolved_at timestamptz
);
create index if not exists connection_invitations_sender on public.connection_invitations(sender_id,created_at desc);
create index if not exists connection_invitations_recipient on public.connection_invitations(recipient_email,status);

create table if not exists public.connections (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a,user_b), check (user_a < user_b)
);
create index if not exists connections_user_b on public.connections(user_b);
create table if not exists public.connection_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id,blocked_id), check (blocker_id <> blocked_id)
);
create index if not exists connection_blocks_blocked on public.connection_blocks(blocked_id);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '' check (length(body) <= 4000),
  resource_kind text check (resource_kind is null or resource_kind in ('quiz','flashcard','lab','document')),
  resource_id uuid,
  resource_title text check (resource_title is null or length(resource_title) <= 200),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  check ((resource_kind is null) = (resource_id is null)),
  check (length(trim(body)) > 0 or resource_id is not null)
);
create index if not exists direct_messages_sender on public.direct_messages(sender_id,recipient_id,created_at desc);
create index if not exists direct_messages_recipient on public.direct_messages(recipient_id,sender_id,created_at desc);
create table if not exists public.direct_message_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  peer_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key(user_id,peer_id), check (user_id <> peer_id)
);
create table if not exists public.connection_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (length(trim(reason)) between 10 and 1000),
  created_at timestamptz not null default now(), check (reporter_id <> reported_id)
);

alter table public.connection_invitations enable row level security;
alter table public.connections enable row level security;
alter table public.connection_blocks enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_message_reads enable row level security;
alter table public.connection_reports enable row level security;
drop policy if exists connection_invitations_read on public.connection_invitations;
create policy connection_invitations_read on public.connection_invitations for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid() or
    (status = 'pending' and recipient_email is not null and recipient_email = lower(auth.jwt()->>'email')));
drop policy if exists connections_read on public.connections;
create policy connections_read on public.connections for select to authenticated using (user_a = auth.uid() or user_b = auth.uid());
drop policy if exists connection_blocks_read on public.connection_blocks;
create policy connection_blocks_read on public.connection_blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists direct_messages_read on public.direct_messages;
create policy direct_messages_read on public.direct_messages for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists direct_message_reads_read on public.direct_message_reads;
create policy direct_message_reads_read on public.direct_message_reads for select to authenticated using (user_id = auth.uid());
-- Reports are write-only via RPC; no client has SELECT access to reports.
revoke all on public.connection_invitations,public.connections,public.connection_blocks,
  public.direct_messages,public.direct_message_reads,public.connection_reports from anon, authenticated;
grant select on public.connection_invitations,public.connections,public.connection_blocks,
  public.direct_messages,public.direct_message_reads to authenticated;

create or replace function public.connection_is_active(p_peer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and p_peer is not null and auth.uid() <> p_peer
    and exists (select 1 from public.connections c where c.user_a=least(auth.uid(),p_peer) and c.user_b=greatest(auth.uid(),p_peer))
    and not exists (select 1 from public.connection_blocks b
      where (b.blocker_id=auth.uid() and b.blocked_id=p_peer) or (b.blocker_id=p_peer and b.blocked_id=auth.uid()))
$$;

create or replace function public.create_connection_invitation(p_email text, p_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := nullif(lower(trim(coalesce(p_email,''))),''); v_target uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_hash !~ '^[0-9a-f]{64}$' or (v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then raise exception 'INVALID_INVITATION'; end if;
  if v_email = lower(auth.jwt()->>'email') then raise exception 'CANNOT_INVITE_SELF'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.connection_invitations where sender_id=auth.uid() and created_at > now()-interval '1 day') >= 10 then raise exception 'INVITATION_RATE_LIMIT'; end if;
  if v_email is not null then
    select id into v_target from auth.users where lower(email)=v_email limit 1;
    if v_target is not null and (public.connection_is_active(v_target) or exists (
      select 1 from public.connection_blocks where (blocker_id=auth.uid() and blocked_id=v_target) or (blocker_id=v_target and blocked_id=auth.uid())
    )) then raise exception 'CONNECTION_UNAVAILABLE'; end if;
  end if;
  insert into public.connection_invitations(sender_id,recipient_email,token_hash)
    values(auth.uid(),v_email,p_hash) returning id into v_id;
  return v_id;
end $$;

create or replace function public.respond_connection_invitation(p_hash text,p_action text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.connection_invitations;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_action not in ('accepted','declined') then raise exception 'INVALID_ACTION'; end if;
  select * into v from public.connection_invitations where token_hash=p_hash for update;
  if v.id is null or v.status<>'pending' or v.expires_at<=now() or v.sender_id=auth.uid()
     or (v.recipient_email is not null and v.recipient_email is distinct from lower(auth.jwt()->>'email')) then
    raise exception 'INVITATION_UNAVAILABLE';
  end if;
  if exists (select 1 from public.connection_blocks where
    (blocker_id=v.sender_id and blocked_id=auth.uid()) or (blocker_id=auth.uid() and blocked_id=v.sender_id)) then raise exception 'CONNECTION_UNAVAILABLE'; end if;
  if p_action='accepted' then
    insert into public.connections(user_a,user_b) values(least(auth.uid(),v.sender_id),greatest(auth.uid(),v.sender_id)) on conflict do nothing;
  end if;
  update public.connection_invitations set status=p_action,recipient_id=auth.uid(),resolved_at=now() where id=v.id;
  return v.sender_id;
end $$;

create or replace function public.cancel_connection_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.connection_invitations set status='cancelled',resolved_at=now()
    where id=p_id and sender_id=auth.uid() and status='pending';
  if not found then raise exception 'INVITATION_UNAVAILABLE'; end if;
end $$;

create or replace function public.list_connections()
returns table(peer_id uuid, display_name text, unread_count bigint, connected_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select peer.id, coalesce(nullif(p.display_name,''),'Người dùng MindCanvas'),
    (select count(*) from public.direct_messages m where m.sender_id=peer.id and m.recipient_id=auth.uid()
      and m.created_at>coalesce((select r.last_read_at from public.direct_message_reads r where r.user_id=auth.uid() and r.peer_id=peer.id),'-infinity'::timestamptz)),
    c.created_at
  from public.connections c
  cross join lateral (select case when c.user_a=auth.uid() then c.user_b else c.user_a end as id) peer
  left join public.profiles p on p.id=peer.id
  where auth.uid() in (c.user_a,c.user_b) and public.connection_is_active(peer.id)
  order by c.created_at desc
$$;

create or replace function public.list_connection_invitations()
returns table(id uuid, sender_id uuid, sender_name text, recipient_email text, token_hash text,
  status text, expires_at timestamptz, outgoing boolean)
language sql stable security definer set search_path = '' as $$
  select i.id,i.sender_id,coalesce(nullif(p.display_name,''),'Người dùng MindCanvas'),
    i.recipient_email,i.token_hash,i.status,i.expires_at,(i.sender_id=auth.uid())
  from public.connection_invitations i left join public.profiles p on p.id=i.sender_id
  where i.sender_id=auth.uid() or (i.status='pending' and i.recipient_email is not null
    and i.recipient_email=lower(auth.jwt()->>'email'))
  order by i.created_at desc limit 100
$$;

create or replace function public.send_direct_message(p_peer uuid,p_body text,p_kind text default null,p_resource_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_body text := trim(coalesce(p_body,'')); v_title text;
begin
  if not public.connection_is_active(p_peer) then raise exception 'CONNECTION_REQUIRED'; end if;
  if length(v_body)>4000 or (v_body='' and p_resource_id is null) or ((p_kind is null) <> (p_resource_id is null)) then raise exception 'INVALID_MESSAGE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.direct_messages where sender_id=auth.uid() and created_at>now()-interval '1 minute')>=20 then raise exception 'MESSAGE_RATE_LIMIT'; end if;
  if p_resource_id is not null then
    if p_kind not in ('quiz','flashcard','lab','document') or not public.learning_resource_owner(p_kind,p_resource_id,auth.uid())
      or public.learning_share_tier(auth.uid())<public.learning_required_tier(p_kind) then raise exception 'SHARE_NOT_ALLOWED'; end if;
    insert into public.learning_share_members(kind,resource_id,owner_id,user_id)
      values(p_kind,p_resource_id,auth.uid(),p_peer)
      on conflict(kind,resource_id,user_id) do nothing;
    select case p_kind
      when 'quiz' then (select q.title from public.quiz_tests q where q.id=p_resource_id)
      when 'flashcard' then (select d.name from public.flashcard_decks d where d.id=p_resource_id)
      when 'lab' then (select l.title from public.lab_projects l where l.id=p_resource_id)
      when 'document' then (select d.file_name from public.documents d where d.id=p_resource_id)
    end into v_title;
  end if;
  insert into public.direct_messages(sender_id,recipient_id,body,resource_kind,resource_id,resource_title)
    values(auth.uid(),p_peer,v_body,p_kind,p_resource_id,left(v_title,200)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.mark_direct_messages_read(p_peer uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.connection_is_active(p_peer) then raise exception 'CONNECTION_REQUIRED'; end if;
  insert into public.direct_message_reads(user_id,peer_id,last_read_at) values(auth.uid(),p_peer,now())
    on conflict(user_id,peer_id) do update set last_read_at=excluded.last_read_at;
end $$;

create or replace function public.remove_connection(p_peer uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.connections where user_a=least(auth.uid(),p_peer) and user_b=greatest(auth.uid(),p_peer);
  if not found then raise exception 'CONNECTION_REQUIRED'; end if;
  delete from public.learning_share_members where (owner_id=auth.uid() and user_id=p_peer)
    or (owner_id=p_peer and user_id=auth.uid());
end $$;

create or replace function public.block_connection(p_peer uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_peer is null or p_peer=auth.uid() then raise exception 'INVALID_PEER'; end if;
  insert into public.connection_blocks(blocker_id,blocked_id) values(auth.uid(),p_peer) on conflict do nothing;
  delete from public.connections where user_a=least(auth.uid(),p_peer) and user_b=greatest(auth.uid(),p_peer);
  delete from public.learning_share_members where (owner_id=auth.uid() and user_id=p_peer)
    or (owner_id=p_peer and user_id=auth.uid());
  update public.connection_invitations set status='cancelled',resolved_at=now() where status='pending'
    and ((sender_id=auth.uid() and recipient_email=(select lower(email) from auth.users where id=p_peer))
      or (sender_id=p_peer and recipient_email=lower(auth.jwt()->>'email')));
end $$;

create or replace function public.list_blocked_connections()
returns table(peer_id uuid, display_name text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id,coalesce(nullif(p.display_name,''),'Người dùng MindCanvas'),b.created_at
  from public.connection_blocks b left join public.profiles p on p.id=b.blocked_id
  where b.blocker_id=auth.uid() order by b.created_at desc
$$;

create or replace function public.unblock_connection(p_peer uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.connection_blocks where blocker_id=auth.uid() and blocked_id=p_peer;
  if not found then raise exception 'BLOCK_NOT_FOUND'; end if;
end $$;

create or replace function public.report_connection(p_peer uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_peer is null or p_peer=auth.uid() or length(trim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'INVALID_REPORT'; end if;
  if not exists(select 1 from public.direct_messages where (sender_id=auth.uid() and recipient_id=p_peer) or (sender_id=p_peer and recipient_id=auth.uid()))
    and not exists(select 1 from public.connections where user_a=least(auth.uid(),p_peer) and user_b=greatest(auth.uid(),p_peer)) then raise exception 'CONNECTION_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.connection_reports where reporter_id=auth.uid() and created_at>now()-interval '1 day')>=3 then raise exception 'REPORT_RATE_LIMIT'; end if;
  insert into public.connection_reports(reporter_id,reported_id,reason) values(auth.uid(),p_peer,trim(p_reason));
end $$;

-- Only authenticated clients may call the guarded functions. Keep table mutation RPC-only.
do $$ declare f text; begin
  foreach f in array array[
    'connection_is_active(uuid)','create_connection_invitation(text,text)','respond_connection_invitation(text,text)',
    'cancel_connection_invitation(uuid)','list_connections()','list_connection_invitations()','send_direct_message(uuid,text,text,uuid)',
    'mark_direct_messages_read(uuid)','remove_connection(uuid)','block_connection(uuid)',
    'list_blocked_connections()','unblock_connection(uuid)','report_connection(uuid,text)'
  ] loop
    execute 'revoke all on function public.'||f||' from public,anon';
    execute 'grant execute on function public.'||f||' to authenticated';
  end loop;
end $$;
