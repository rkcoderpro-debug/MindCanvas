-- MindCanvas V4.5.9 follow-up: repair both invitation Accept RPCs.
-- Apply after 0015_v4_5_9_notes_rls_repair.sql.
--
-- `RETURNS TABLE(project_id ...)` creates a PL/pgSQL output variable named
-- project_id. A positional ON CONFLICT target such as
-- `(project_id, user_id)` can therefore be reported as 42702. The named
-- primary-key constraint has no variable/column ambiguity.

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

create or replace function public.accept_project_invitation_by_id(p_invitation_id uuid)
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

  select lower(account.email)
  into account_email
  from auth.users as account
  where account.id = auth.uid();

  select candidate.*
  into invitation
  from public.project_invitations as candidate
  where candidate.id = p_invitation_id
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

grant execute on function public.accept_project_invitation(text) to authenticated;
grant execute on function public.accept_project_invitation_by_id(uuid) to authenticated;

notify pgrst, 'reload schema';
