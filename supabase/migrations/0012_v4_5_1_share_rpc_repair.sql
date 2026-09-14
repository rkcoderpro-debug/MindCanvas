-- MindCanvas V4.5.1: repair the V4.4 sharing RPCs and refresh PostgREST.
--
-- Some hosted projects received the web bundle before migration 0011 was
-- applied (or retained an old PostgREST schema cache). This idempotent repair
-- keeps the V4.4 schema compatible, recreates the RPCs with their exact
-- parameter names, grants them to signed-in users and asks PostgREST to
-- reload immediately. Run migration 0011 first when the V4.4 tables do not
-- exist yet; the guards below make a partial/old deployment recoverable.

create table if not exists public.project_members (
  project_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('editor', 'viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx
  on public.project_members(user_id, updated_at desc);

create table if not exists public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.notes(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (char_length(trim(email)) between 3 and 320),
  role text not null default 'viewer' check (role in ('editor', 'viewer')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_invitations_project_idx
  on public.project_invitations(project_id, created_at desc);
create index if not exists project_invitations_email_idx
  on public.project_invitations(lower(email), status);

create table if not exists public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.notes(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_activity_project_idx
  on public.project_activity(project_id, created_at desc);

create or replace function public.project_owner_id(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select n.user_id from public.notes n where n.id = p_project_id;
$$;

create or replace function public.can_access_project(p_project_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notes n
    where n.id = p_project_id
      and (
        n.user_id = p_user_id
        or exists (
          select 1 from public.project_members m
          where m.project_id = n.id and m.user_id = p_user_id
        )
      )
  );
$$;

create or replace function public.can_edit_project(p_project_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notes n
    where n.id = p_project_id
      and (
        n.user_id = p_user_id
        or exists (
          select 1 from public.project_members m
          where m.project_id = n.id and m.user_id = p_user_id and m.role = 'editor'
        )
      )
  );
$$;

create or replace function public.log_project_activity(
  p_project_id uuid,
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_project(p_project_id, auth.uid()) then
    raise exception 'Project is not accessible';
  end if;
  insert into public.project_activity(project_id, actor_id, event_type, metadata)
  values (p_project_id, auth.uid(), left(trim(p_event_type), 80), coalesce(p_metadata, '{}'::jsonb));
end;
$$;

create or replace function public.create_project_invitation(
  p_project_id uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table(id uuid, project_id uuid, email text, role text, status text, expires_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(p_email));
  invitation public.project_invitations;
begin
  if public.project_owner_id(p_project_id) <> auth.uid() then
    raise exception 'Only the project owner can invite people';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid email is required';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'Invalid project role';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation token';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '14 days' then
    raise exception 'Invitation expiry must be within 14 days';
  end if;

  update public.project_invitations
  set status = 'revoked', revoked_at = now()
  where project_id = p_project_id
    and lower(email) = normalized_email
    and status = 'pending';

  insert into public.project_invitations(project_id, inviter_id, email, role, token_hash, expires_at)
  values (p_project_id, auth.uid(), normalized_email, p_role, p_token_hash, p_expires_at)
  returning * into invitation;

  perform public.log_project_activity(p_project_id, 'invited', jsonb_build_object('email', normalized_email, 'role', p_role));
  return query select invitation.id, invitation.project_id, invitation.email, invitation.role, invitation.status, invitation.expires_at, invitation.created_at;
end;
$$;

create or replace function public.list_project_members(p_project_id uuid)
returns table(user_id uuid, role text, display_name text, avatar_url text, email text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_project(p_project_id, auth.uid()) then
    raise exception 'Project is not accessible';
  end if;
  return query
  select m.user_id, m.role, p.display_name, p.avatar_url, u.email::text, m.created_at
  from public.project_members m
  left join public.profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  where m.project_id = p_project_id
  order by m.created_at asc;
end;
$$;

create or replace function public.list_project_invitations(p_project_id uuid)
returns table(id uuid, project_id uuid, email text, role text, status text, expires_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.project_owner_id(p_project_id) <> auth.uid() then
    raise exception 'Only the project owner can view invitations';
  end if;
  update public.project_invitations
  set status = 'expired'
  where project_id = p_project_id and status = 'pending' and expires_at <= now();
  return query
  select i.id, i.project_id, i.email, i.role, i.status, i.expires_at, i.created_at
  from public.project_invitations i
  where i.project_id = p_project_id
  order by i.created_at desc;
end;
$$;

create or replace function public.revoke_project_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.project_invitations;
  did_revoke boolean := false;
begin
  select * into invitation from public.project_invitations where id = p_invitation_id;
  if invitation.id is null or invitation.inviter_id <> auth.uid() then return false; end if;
  update public.project_invitations set status = 'revoked', revoked_at = now()
  where id = p_invitation_id and status = 'pending';
  did_revoke := found;
  perform public.log_project_activity(invitation.project_id, 'invitation_revoked', jsonb_build_object('invitation_id', p_invitation_id));
  return did_revoke;
end;
$$;

create or replace function public.accept_project_invitation(p_token_hash text)
returns table(project_id uuid, role text, title text)
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.project_invitations;
  account_email text;
begin
  select * into invitation
  from public.project_invitations
  where token_hash = p_token_hash and status = 'pending'
  for update;
  if invitation.id is null then
    raise exception 'This invitation is invalid, revoked or already used';
  end if;
  if invitation.expires_at <= now() then
    update public.project_invitations set status = 'expired' where id = invitation.id;
    raise exception 'This invitation has expired';
  end if;
  select lower(email) into account_email from auth.users where id = auth.uid();
  if account_email is null or account_email <> lower(invitation.email) then
    raise exception 'Sign in with the invited email address to accept this invitation';
  end if;
  if invitation.inviter_id = auth.uid() then
    raise exception 'The project owner cannot accept their own invitation';
  end if;

  insert into public.project_members(project_id, user_id, role)
  values (invitation.project_id, auth.uid(), invitation.role)
  on conflict (project_id, user_id) do update set role = excluded.role, updated_at = now();
  update public.project_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where id = invitation.id;
  perform public.log_project_activity(invitation.project_id, 'invitation_accepted', '{}'::jsonb);
  return query select n.id, invitation.role, n.title from public.notes n where n.id = invitation.project_id;
end;
$$;

create or replace function public.set_project_member_role(p_project_id uuid, p_user_id uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare did_change boolean := false;
begin
  if public.project_owner_id(p_project_id) <> auth.uid() or p_user_id = auth.uid() or p_role not in ('editor', 'viewer') then return false; end if;
  update public.project_members set role = p_role, updated_at = now() where project_id = p_project_id and user_id = p_user_id;
  did_change := found;
  perform public.log_project_activity(p_project_id, 'member_role_changed', jsonb_build_object('user_id', p_user_id, 'role', p_role));
  return did_change;
end;
$$;

create or replace function public.remove_project_member(p_project_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare did_remove boolean := false;
begin
  if public.project_owner_id(p_project_id) <> auth.uid() or p_user_id = auth.uid() then return false; end if;
  delete from public.project_members where project_id = p_project_id and user_id = p_user_id;
  did_remove := found;
  perform public.log_project_activity(p_project_id, 'member_removed', jsonb_build_object('user_id', p_user_id));
  return did_remove;
end;
$$;

alter table public.project_members enable row level security;
drop policy if exists "project members readable by collaborators" on public.project_members;
create policy "project members readable by collaborators"
  on public.project_members for select
  using (public.can_access_project(project_id, auth.uid()));
drop policy if exists "project members managed by owner" on public.project_members;
create policy "project members managed by owner"
  on public.project_members for all
  using (public.project_owner_id(project_id) = auth.uid())
  with check (public.project_owner_id(project_id) = auth.uid() and user_id <> auth.uid());

alter table public.project_invitations enable row level security;
alter table public.project_activity enable row level security;
drop policy if exists "project activity collaborators read" on public.project_activity;
create policy "project activity collaborators read"
  on public.project_activity for select
  using (public.can_access_project(project_id, auth.uid()));

grant execute on function public.create_project_invitation(uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.list_project_members(uuid) to authenticated;
grant execute on function public.list_project_invitations(uuid) to authenticated;
grant execute on function public.revoke_project_invitation(uuid) to authenticated;
grant execute on function public.accept_project_invitation(text) to authenticated;
grant execute on function public.set_project_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.notes;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

notify pgrst, 'reload schema';
