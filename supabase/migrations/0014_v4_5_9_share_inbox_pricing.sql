-- MindCanvas V4.5.9: account-scoped share inbox and Max pricing.
-- Apply after 0013_v4_5_1_runtime_repairs.sql.

alter table public.project_invitations
  add column if not exists declined_by uuid references auth.users(id) on delete set null,
  add column if not exists declined_at timestamptz;

alter table public.project_invitations
  drop constraint if exists project_invitations_status_check;
alter table public.project_invitations
  add constraint project_invitations_status_check
  check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired'));

update public.plans
set price_vnd = 499000
where id = 'max';

create or replace function public.list_my_pending_project_invitations()
returns table(
  id uuid,
  project_id uuid,
  project_title text,
  inviter_id uuid,
  inviter_name text,
  email text,
  role text,
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  account_email text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to view invitations';
  end if;
  select lower(u.email) into account_email from auth.users as u where u.id = auth.uid();
  update public.project_invitations as invitation
  set status = 'expired'
  where lower(invitation.email) = account_email
    and invitation.status = 'pending'
    and invitation.expires_at <= now();

  return query
  select invitation.id,
         invitation.project_id,
         note.title,
         invitation.inviter_id,
         coalesce(profile.display_name, inviter.email::text, 'MindCanvas'),
         invitation.email,
         invitation.role,
         invitation.status,
         invitation.expires_at,
         invitation.created_at
  from public.project_invitations as invitation
  join public.notes as note on note.id = invitation.project_id
  join auth.users as inviter on inviter.id = invitation.inviter_id
  left join public.profiles as profile on profile.id = invitation.inviter_id
  where lower(invitation.email) = account_email
    and invitation.status = 'pending'
  order by invitation.created_at desc;
end;
$$;

create or replace function public.accept_project_invitation_by_id(p_invitation_id uuid)
returns table(project_id uuid, role text, title text)
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.project_invitations;
  account_email text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to accept an invitation';
  end if;
  select lower(u.email) into account_email from auth.users as u where u.id = auth.uid();
  select * into invitation
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
  on conflict on constraint project_members_pkey do update
    set role = excluded.role, updated_at = now();
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

create or replace function public.decline_project_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  account_email text;
  did_decline boolean := false;
begin
  if auth.uid() is null then return false; end if;
  select lower(u.email) into account_email from auth.users as u where u.id = auth.uid();
  update public.project_invitations as invitation
  set status = 'declined', declined_by = auth.uid(), declined_at = now()
  where invitation.id = p_invitation_id
    and invitation.status = 'pending'
    and lower(invitation.email) = account_email;
  did_decline := found;
  return did_decline;
end;
$$;

grant execute on function public.list_my_pending_project_invitations() to authenticated;
grant execute on function public.accept_project_invitation_by_id(uuid) to authenticated;
grant execute on function public.decline_project_invitation(uuid) to authenticated;

notify pgrst, 'reload schema';
