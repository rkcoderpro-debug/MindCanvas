-- Apply after 0017. Private, email-bound invitations; Free recipients may study.
create or replace function public.learning_share_tier(p_user uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select case coalesce((select ae.plan_id from public.account_entitlements ae
    where ae.user_id = p_user and ae.status = 'active'
      and (ae.expires_at is null or ae.expires_at > now())), 'free')
    when 'max' then 3 when 'pro' then 2 when 'plus' then 1 else 0 end
$$;
revoke all on function public.learning_share_tier(uuid) from public, anon;
grant execute on function public.learning_share_tier(uuid) to authenticated;

-- Keep the tier rule in one SQL function.  PostgreSQL parses CASE expressions
-- differently in some PL/pgSQL contexts; the original migration used a bare
-- CASE directly after `<`, which caused 42601 syntax errors on line 123.
create or replace function public.learning_required_tier(p_kind text)
returns integer language sql immutable as $$
  select case p_kind when 'quiz' then 1 when 'flashcard' then 1 when 'lab' then 2 else 100 end
$$;
revoke all on function public.learning_required_tier(text) from public, anon;
grant execute on function public.learning_required_tier(text) to authenticated;

create table if not exists public.lab_projects (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  subject text not null check (subject in ('physics','chemistry','other')),
  learner_level text not null default '', program_html text not null
    check (length(program_html) between 1 and 1500000),
  content_version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Bound private HTML storage even when a client bypasses frontend limits.
create or replace function public.guard_learning_lab_storage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_bytes bigint; v_count integer;
begin
  perform 1 from auth.users where id=new.user_id for update;
  select count(*),coalesce(sum(octet_length(program_html)),0) into v_count,v_bytes
    from public.lab_projects where user_id=new.user_id and id<>new.id;
  if v_count >= 50 or v_bytes+octet_length(new.program_html)>50*1024*1024 then
    raise exception 'Lab cloud limit: 50 projects or 50 MB';
  end if;
  return new;
end $$;
drop trigger if exists learning_lab_storage on public.lab_projects;
create trigger learning_lab_storage before insert or update on public.lab_projects
  for each row execute function public.guard_learning_lab_storage();

create table if not exists public.learning_share_invitations (
  id uuid primary key default gen_random_uuid(), kind text not null check (kind in ('quiz','flashcard','lab')),
  resource_id uuid not null, owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and length(email) between 3 and 320),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  expires_at timestamptz not null, created_at timestamptz not null default now(),
  accepted_at timestamptz, recipient_id uuid references auth.users(id) on delete set null
);
create index if not exists learning_invites_owner on public.learning_share_invitations(owner_id,kind,resource_id);
create index if not exists learning_invites_email on public.learning_share_invitations(email,status);

create table if not exists public.learning_share_members (
  kind text not null check (kind in ('quiz','flashcard','lab')),
  resource_id uuid not null, owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invitation_id uuid references public.learning_share_invitations(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(kind,resource_id,user_id), check (owner_id <> user_id)
);
create index if not exists learning_members_recipient on public.learning_share_members(user_id);

create or replace function public.learning_resource_owner(p_kind text,p_id uuid,p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'quiz' then exists(select 1 from public.quiz_tests q where q.id=p_id and q.user_id=p_owner)
    when 'flashcard' then exists(select 1 from public.flashcard_decks d where d.id=p_id and d.user_id=p_owner)
    when 'lab' then exists(select 1 from public.lab_projects l where l.id=p_id and l.user_id=p_owner)
    else false end
$$;
revoke all on function public.learning_resource_owner(text,uuid,uuid) from public,anon;
grant execute on function public.learning_resource_owner(text,uuid,uuid) to authenticated;

create or replace function public.learning_share_allowed(p_kind text,p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.learning_share_members m
    where m.kind=p_kind and m.resource_id=p_id and m.user_id=auth.uid()
      and public.learning_resource_owner(m.kind,m.resource_id,m.owner_id)
      and public.learning_share_tier(m.owner_id) >= public.learning_required_tier(p_kind))
$$;
revoke all on function public.learning_share_allowed(text,uuid) from public,anon;
grant execute on function public.learning_share_allowed(text,uuid) to authenticated;

alter table public.quiz_tests add column if not exists content_version integer not null default 1;
alter table public.flashcards add column if not exists content_version integer not null default 1;
create or replace function public.learning_bump_version() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name='quiz_tests' and (old.questions is distinct from new.questions or old.title is distinct from new.title) then
    new.content_version := old.content_version+1;
  elsif tg_table_name='flashcards' and (old.front is distinct from new.front or old.back is distinct from new.back) then
    new.content_version := old.content_version+1;
  elsif tg_table_name='lab_projects' and (old.program_html is distinct from new.program_html or old.title is distinct from new.title) then
    new.content_version := old.content_version+1;
  end if;
  return new;
end $$;
drop trigger if exists learning_quiz_version on public.quiz_tests;
create trigger learning_quiz_version before update on public.quiz_tests for each row execute function public.learning_bump_version();
drop trigger if exists learning_card_version on public.flashcards;
create trigger learning_card_version before update on public.flashcards for each row execute function public.learning_bump_version();
drop trigger if exists learning_lab_version on public.lab_projects;
create trigger learning_lab_version before update on public.lab_projects for each row execute function public.learning_bump_version();

alter table public.lab_projects enable row level security;
alter table public.learning_share_invitations enable row level security;
alter table public.learning_share_members enable row level security;
drop policy if exists lab_read on public.lab_projects;
create policy lab_read on public.lab_projects for select to authenticated
  using (user_id=auth.uid() or public.learning_share_allowed('lab',id));
drop policy if exists lab_create on public.lab_projects;
create policy lab_create on public.lab_projects for insert to authenticated with check (user_id=auth.uid() and public.learning_share_tier(auth.uid())>=2);
drop policy if exists lab_change on public.lab_projects;
create policy lab_change on public.lab_projects for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists lab_delete on public.lab_projects;
create policy lab_delete on public.lab_projects for delete to authenticated using (user_id=auth.uid());
drop policy if exists learning_invites_read on public.learning_share_invitations;
create policy learning_invites_read on public.learning_share_invitations for select to authenticated
  using (owner_id=auth.uid() or (status='pending' and email=lower(auth.jwt()->>'email')));
drop policy if exists learning_members_read on public.learning_share_members;
create policy learning_members_read on public.learning_share_members for select to authenticated
  using (owner_id=auth.uid() or user_id=auth.uid());
drop policy if exists quiz_shared_read on public.quiz_tests;
create policy quiz_shared_read on public.quiz_tests for select to authenticated
  using (public.learning_share_allowed('quiz',id));
drop policy if exists decks_shared_read on public.flashcard_decks;
create policy decks_shared_read on public.flashcard_decks for select to authenticated
  using (public.learning_share_allowed('flashcard',id));
drop policy if exists cards_shared_read on public.flashcards;
create policy cards_shared_read on public.flashcards for select to authenticated
  using (public.learning_share_allowed('flashcard',deck_id));

-- No client can insert grants or invitations directly. The RPC checks owner and tier.
create or replace function public.create_learning_invitation(p_kind text,p_id uuid,p_email text,p_hash text,p_days integer default 7)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(trim(p_email));
begin
  if auth.uid() is null or not public.learning_resource_owner(p_kind,p_id,auth.uid()) then raise exception 'Owner access required'; end if;
  if public.learning_share_tier(auth.uid()) < public.learning_required_tier(p_kind) then raise exception 'Upgrade your plan to share this material'; end if;
  if p_kind not in ('quiz','flashcard','lab') or p_days not between 1 and 30 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation'; end if;
  if v_email = lower(auth.jwt()->>'email') then raise exception 'Cannot invite yourself'; end if;
  insert into public.learning_share_invitations(kind,resource_id,owner_id,email,token_hash,expires_at)
  values (p_kind,p_id,auth.uid(),v_email,p_hash,now()+make_interval(days=>p_days)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.accept_learning_invitation(p_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.learning_share_invitations; v_email text := lower(auth.jwt()->>'email');
begin
  if auth.uid() is null or v_email is null then raise exception 'Sign in to accept the invitation'; end if;
  select * into v from public.learning_share_invitations where token_hash=p_hash for update;
  if v.id is null or v.email<>v_email or v.status<>'pending' or v.expires_at<=now() then raise exception 'Invitation invalid, expired, or belongs to another account'; end if;
  if not public.learning_resource_owner(v.kind,v.resource_id,v.owner_id) or public.learning_share_tier(v.owner_id) < public.learning_required_tier(v.kind) then raise exception 'Sharing is paused or material removed'; end if;
  insert into public.learning_share_members(kind,resource_id,owner_id,user_id,invitation_id)
  values (v.kind,v.resource_id,v.owner_id,auth.uid(),v.id)
  on conflict(kind,resource_id,user_id) do update set invitation_id=excluded.invitation_id;
  update public.learning_share_invitations set status='accepted',accepted_at=now(),recipient_id=auth.uid() where id=v.id;
  return jsonb_build_object('kind',v.kind,'resourceId',v.resource_id);
end $$;

create or replace function public.revoke_learning_share(p_invitation uuid default null,p_kind text default null,p_id uuid default null,p_recipient uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.learning_share_invitations;
begin
  if p_invitation is not null then
    select * into v from public.learning_share_invitations where id=p_invitation and owner_id=auth.uid() for update;
    if v.id is null then raise exception 'Owner access required'; end if;
    update public.learning_share_invitations set status='revoked' where id=v.id;
    if v.recipient_id is not null then
      delete from public.learning_share_members where kind=v.kind and resource_id=v.resource_id and user_id=v.recipient_id;
    end if;
  elsif p_recipient is not null and public.learning_resource_owner(p_kind,p_id,auth.uid()) then
    delete from public.learning_share_members where kind=p_kind and resource_id=p_id and user_id=p_recipient and owner_id=auth.uid();
    update public.learning_share_invitations set status='revoked' where owner_id=auth.uid() and kind=p_kind and resource_id=p_id and recipient_id=p_recipient;
  else raise exception 'Owner access required'; end if;
end $$;

create table if not exists public.learning_quiz_attempts (
  id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.quiz_tests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content_version integer not null, questions jsonb not null, answers jsonb,
  score integer, started_at timestamptz not null default now(), completed_at timestamptz,
  check (score is null or score>=0)
);
create index if not exists learning_quiz_attempts_user on public.learning_quiz_attempts(user_id,quiz_id);
alter table public.learning_quiz_attempts enable row level security;
drop policy if exists learning_attempt_read on public.learning_quiz_attempts;
create policy learning_attempt_read on public.learning_quiz_attempts for select to authenticated using (user_id=auth.uid());
create or replace function public.start_learning_quiz(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q public.quiz_tests; a public.learning_quiz_attempts;
begin
  if not public.learning_share_allowed('quiz',p_id) then raise exception 'Access revoked or sharing paused'; end if;
  select * into q from public.quiz_tests where id=p_id;
  insert into public.learning_quiz_attempts(quiz_id,user_id,content_version,questions)
    values(p_id,auth.uid(),q.content_version,q.questions) returning * into a;
  return jsonb_build_object('id',a.id,'questions',a.questions,'version',a.content_version);
end $$;
create or replace function public.finish_learning_quiz(p_attempt uuid,p_answers jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare a public.learning_quiz_attempts; v_score integer; v_total integer;
begin
  select * into a from public.learning_quiz_attempts where id=p_attempt and user_id=auth.uid() for update;
  if a.id is null or a.completed_at is not null or not public.learning_share_allowed('quiz',a.quiz_id) then raise exception 'Attempt unavailable or access revoked'; end if;
  v_total:=jsonb_array_length(a.questions);
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers)<>v_total then raise exception 'Invalid answers'; end if;
  select count(*) into v_score from jsonb_array_elements(a.questions) with ordinality q(item,n)
    where p_answers->(q.n-1) = q.item->'correctIndex';
  update public.learning_quiz_attempts set answers=p_answers,score=v_score,completed_at=now() where id=p_attempt;
  return v_score;
end $$;

create table if not exists public.learning_card_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.flashcards(id) on delete cascade,
  content_version integer not null default 1,
  rating text check (rating in ('again','hard','good','easy')),
  reviewed_count integer not null default 0,
  due_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(user_id,card_id)
);
alter table public.learning_card_progress enable row level security;
drop policy if exists card_progress_read on public.learning_card_progress;
create policy card_progress_read on public.learning_card_progress for select to authenticated using (user_id=auth.uid() and exists(select 1 from public.flashcards c where c.id=card_id and public.learning_share_allowed('flashcard',c.deck_id)));
create or replace function public.rate_learning_card(p_card uuid,p_rating text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.flashcards;
begin
  select * into c from public.flashcards where id=p_card;
  if c.id is null or not public.learning_share_allowed('flashcard',c.deck_id) or p_rating is null or p_rating not in ('again','hard','good','easy') then raise exception 'Card unavailable or access revoked'; end if;
  insert into public.learning_card_progress(user_id,card_id,content_version,rating,reviewed_count,due_at)
  values(auth.uid(),p_card,c.content_version,p_rating,1,now()+case p_rating when 'again' then interval '1 minute' when 'hard' then interval '1 day' when 'good' then interval '3 days' else interval '7 days' end)
  on conflict(user_id,card_id) do update set content_version=excluded.content_version,rating=excluded.rating,
    reviewed_count=learning_card_progress.reviewed_count+1,due_at=excluded.due_at,updated_at=now();
end $$;

revoke all on function public.create_learning_invitation(text,uuid,text,text,integer),public.accept_learning_invitation(text),public.revoke_learning_share(uuid,text,uuid,uuid),public.start_learning_quiz(uuid),public.finish_learning_quiz(uuid,jsonb),public.rate_learning_card(uuid,text) from public,anon;
grant execute on function public.create_learning_invitation(text,uuid,text,text,integer),public.accept_learning_invitation(text),public.revoke_learning_share(uuid,text,uuid,uuid),public.start_learning_quiz(uuid),public.finish_learning_quiz(uuid,jsonb),public.rate_learning_card(uuid,text) to authenticated;

-- Inbox metadata includes owner name; content is still fetched through RLS.
create or replace function public.list_learning_shares()
returns table(kind text,resource_id uuid,owner_name text,title text,updated_at timestamptz,status text)
language sql stable security definer set search_path = '' as $$
  select m.kind,m.resource_id,coalesce(p.display_name,'Người chia sẻ')::text,
    case m.kind when 'quiz' then (select q.title from public.quiz_tests q where q.id=m.resource_id)
      when 'flashcard' then (select d.name from public.flashcard_decks d where d.id=m.resource_id)
      else (select l.title from public.lab_projects l where l.id=m.resource_id) end,
    case m.kind when 'quiz' then (select q.updated_at from public.quiz_tests q where q.id=m.resource_id)
      when 'flashcard' then (select d.updated_at from public.flashcard_decks d where d.id=m.resource_id)
      else (select l.updated_at from public.lab_projects l where l.id=m.resource_id) end,
    case when not public.learning_resource_owner(m.kind,m.resource_id,m.owner_id) then 'removed'
      when public.learning_share_tier(m.owner_id) < public.learning_required_tier(m.kind) then 'paused'
      else 'active' end::text
  from public.learning_share_members m left join public.profiles p on p.id=m.owner_id
  where m.user_id=auth.uid()
$$;
revoke all on function public.list_learning_shares() from public,anon;
grant execute on function public.list_learning_shares() to authenticated;

grant select,insert,update,delete on public.lab_projects to authenticated;
grant select on public.learning_share_invitations,public.learning_share_members,
  public.learning_quiz_attempts,public.learning_card_progress to authenticated;

notify pgrst, 'reload schema';
