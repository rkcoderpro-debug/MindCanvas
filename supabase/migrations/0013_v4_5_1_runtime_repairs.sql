-- MindCanvas V4.5.1 follow-up: repair runtime RPC ambiguity and note writes.
--
-- Apply this migration after 0011_v4_4_collaboration.sql and
-- 0012_v4_5_1_share_rpc_repair.sql.  The earlier files can execute
-- successfully while an RPC still fails at runtime: PL/pgSQL treats the
-- RETURNS TABLE column `project_id` as a variable, so an unqualified
-- `project_id` in an UPDATE/WHERE clause is ambiguous.  Every table column
-- below is deliberately qualified with an alias.

create or replace function public.project_owner_id(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select n.user_id
  from public.notes as n
  where n.id = p_project_id;
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
    from public.notes as n
    where n.id = p_project_id
      and (
        n.user_id = p_user_id
        or exists (
          select 1
          from public.project_members as m
          where m.project_id = n.id
            and m.user_id = p_user_id
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
    from public.notes as n
    where n.id = p_project_id
      and (
        n.user_id = p_user_id
        or exists (
          select 1
          from public.project_members as m
          where m.project_id = n.id
            and m.user_id = p_user_id
            and m.role = 'editor'
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
  if auth.uid() is null or not public.can_access_project(p_project_id, auth.uid()) then
    raise exception 'Project is not accessible';
  end if;
  insert into public.project_activity as activity(project_id, actor_id, event_type, metadata)
  values (
    p_project_id,
    auth.uid(),
    left(trim(p_event_type), 80),
    coalesce(p_metadata, '{}'::jsonb)
  );
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
  if auth.uid() is null or public.project_owner_id(p_project_id) <> auth.uid() then
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

  update public.project_invitations as existing
  set status = 'revoked', revoked_at = now()
  where existing.project_id = p_project_id
    and lower(existing.email) = normalized_email
    and existing.status = 'pending';

  insert into public.project_invitations(project_id, inviter_id, email, role, token_hash, expires_at)
  values (p_project_id, auth.uid(), normalized_email, p_role, p_token_hash, p_expires_at)
  returning * into invitation;

  perform public.log_project_activity(
    p_project_id,
    'invited',
    jsonb_build_object('email', normalized_email, 'role', p_role)
  );
  return query
  select invitation.id,
         invitation.project_id,
         invitation.email,
         invitation.role,
         invitation.status,
         invitation.expires_at,
         invitation.created_at;
end;
$$;

create or replace function public.list_project_members(p_project_id uuid)
returns table(user_id uuid, role text, display_name text, avatar_url text, email text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_access_project(p_project_id, auth.uid()) then
    raise exception 'Project is not accessible';
  end if;
  return query
  select member.user_id,
         member.role,
         profile.display_name,
         profile.avatar_url,
         account.email::text,
         member.created_at
  from public.project_members as member
  left join public.profiles as profile on profile.id = member.user_id
  left join auth.users as account on account.id = member.user_id
  where member.project_id = p_project_id
  order by member.created_at asc;
end;
$$;

create or replace function public.list_project_invitations(p_project_id uuid)
returns table(id uuid, project_id uuid, email text, role text, status text, expires_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.project_owner_id(p_project_id) <> auth.uid() then
    raise exception 'Only the project owner can view invitations';
  end if;

  update public.project_invitations as existing
  set status = 'expired'
  where existing.project_id = p_project_id
    and existing.status = 'pending'
    and existing.expires_at <= now();

  return query
  select invitation.id,
         invitation.project_id,
         invitation.email,
         invitation.role,
         invitation.status,
         invitation.expires_at,
         invitation.created_at
  from public.project_invitations as invitation
  where invitation.project_id = p_project_id
  order by invitation.created_at desc;
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
  select candidate.*
  into invitation
  from public.project_invitations as candidate
  where candidate.id = p_invitation_id;

  if auth.uid() is null or invitation.id is null or invitation.inviter_id <> auth.uid() then
    return false;
  end if;

  update public.project_invitations as candidate
  set status = 'revoked', revoked_at = now()
  where candidate.id = p_invitation_id
    and candidate.status = 'pending';
  did_revoke := found;
  perform public.log_project_activity(
    invitation.project_id,
    'invitation_revoked',
    jsonb_build_object('invitation_id', p_invitation_id)
  );
  return did_revoke;
end;
$$;

create or replace function public.accept_project_invitation(p_token_hash text)
returns table(project_id uuid, role text, title text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  invitation public.project_invitations;
  account_email text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to accept an invitation';
  end if;

  select candidate.*
  into invitation
  from public.project_invitations as candidate
  where candidate.token_hash = p_token_hash
    and candidate.status = 'pending'
  for update;
  if invitation.id is null then
    raise exception 'This invitation is invalid, revoked or already used';
  end if;
  if invitation.expires_at <= now() then
    update public.project_invitations as candidate
    set status = 'expired'
    where candidate.id = invitation.id;
    raise exception 'This invitation has expired';
  end if;

  select lower(account.email)
  into account_email
  from auth.users as account
  where account.id = auth.uid();
  if account_email is null or account_email <> lower(invitation.email) then
    raise exception 'Sign in with the invited email address to accept this invitation';
  end if;
  if invitation.inviter_id = auth.uid() then
    raise exception 'The project owner cannot accept their own invitation';
  end if;

  insert into public.project_members(project_id, user_id, role)
  values (invitation.project_id, auth.uid(), invitation.role)
  on conflict on constraint project_members_pkey
  do update set role = excluded.role, updated_at = now();

  update public.project_invitations as candidate
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where candidate.id = invitation.id;
  perform public.log_project_activity(invitation.project_id, 'invitation_accepted', '{}'::jsonb);

  return query
  select note.id, invitation.role, note.title
  from public.notes as note
  where note.id = invitation.project_id;
end;
$$;

create or replace function public.set_project_member_role(p_project_id uuid, p_user_id uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  did_change boolean := false;
begin
  if auth.uid() is null
     or public.project_owner_id(p_project_id) <> auth.uid()
     or p_user_id = auth.uid()
     or p_role not in ('editor', 'viewer') then
    return false;
  end if;

  update public.project_members as member
  set role = p_role, updated_at = now()
  where member.project_id = p_project_id
    and member.user_id = p_user_id;
  did_change := found;
  perform public.log_project_activity(
    p_project_id,
    'member_role_changed',
    jsonb_build_object('user_id', p_user_id, 'role', p_role)
  );
  return did_change;
end;
$$;

create or replace function public.remove_project_member(p_project_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  did_remove boolean := false;
begin
  if auth.uid() is null
     or public.project_owner_id(p_project_id) <> auth.uid()
     or p_user_id = auth.uid() then
    return false;
  end if;

  delete from public.project_members as member
  where member.project_id = p_project_id
    and member.user_id = p_user_id;
  did_remove := found;
  perform public.log_project_activity(p_project_id, 'member_removed', jsonb_build_object('user_id', p_user_id));
  return did_remove;
end;
$$;

-- Recreate the note policies explicitly.  This removes any leftover broad
-- policy from 0001 and makes the insert check deterministic for authenticated
-- browser requests.  The check intentionally never accepts another user's
-- UUID; an expired/mismatched session must fail visibly instead.
alter table public.notes enable row level security;
drop policy if exists "notes own" on public.notes;
drop policy if exists "notes accessible to project members" on public.notes;
drop policy if exists "notes insert own" on public.notes;
drop policy if exists "notes update by project editors" on public.notes;
drop policy if exists "notes delete own" on public.notes;

create policy "notes accessible to project members"
  on public.notes for select
  to authenticated
  using (public.can_access_project(id, auth.uid()));

create policy "notes insert own"
  on public.notes for insert
  to authenticated
  with check (auth.uid() is not null and user_id = auth.uid());

create policy "notes update by project editors"
  on public.notes for update
  to authenticated
  using (public.can_edit_project(id, auth.uid()))
  with check (user_id = public.project_owner_id(id));

create policy "notes delete own"
  on public.notes for delete
  to authenticated
  using (user_id = auth.uid());

grant execute on function public.create_project_invitation(uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.list_project_members(uuid) to authenticated;
grant execute on function public.list_project_invitations(uuid) to authenticated;
grant execute on function public.revoke_project_invitation(uuid) to authenticated;
grant execute on function public.accept_project_invitation(text) to authenticated;
grant execute on function public.set_project_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
