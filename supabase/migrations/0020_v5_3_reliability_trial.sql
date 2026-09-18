-- MindCanvas v5.3: secure shared Quiz flow + Google Plus trial.
-- Apply after 0019.

-- Shared learners must not be able to SELECT quiz_tests directly because the
-- questions JSON contains correctIndex/explanation. Owners keep the original
-- owner-only SELECT policy from 0009; shared learners use security-definer RPCs.
drop policy if exists quiz_shared_read on public.quiz_tests;

create or replace function public.get_learning_shared_content(p_kind text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null or p_kind not in ('quiz','flashcard','lab') or not public.learning_share_allowed(p_kind,p_id) then
    raise exception 'ACCESS_REVOKED';
  end if;

  if p_kind='quiz' then
    select jsonb_build_object(
      'id',q.id,'title',q.title,'content_version',q.content_version,'updated_at',q.updated_at
    ) into result from public.quiz_tests q where q.id=p_id;
  elsif p_kind='flashcard' then
    select jsonb_build_object(
      'id',d.id,'name',d.name,'content_version',coalesce((select max(c.content_version) from public.flashcards c where c.deck_id=d.id),1),'updated_at',d.updated_at
    ) into result from public.flashcard_decks d where d.id=p_id;
  else
    select jsonb_build_object(
      'id',l.id,'title',l.title,'subject',l.subject,'learner_level',l.learner_level,
      'program_html',l.program_html,'content_version',l.content_version,'updated_at',l.updated_at
    ) into result from public.lab_projects l where l.id=p_id;
  end if;

  if result is null then raise exception 'RESOURCE_REMOVED'; end if;
  return result;
end $$;

revoke all on function public.get_learning_shared_content(text,uuid) from public,anon;
grant execute on function public.get_learning_shared_content(text,uuid) to authenticated;

-- The attempt row intentionally keeps the full versioned question snapshot for
-- authoritative server-side grading, but it is no longer directly selectable
-- by authenticated clients. Only RPCs expose the safe pre-submit/post-submit views.
drop policy if exists learning_attempt_read on public.learning_quiz_attempts;
revoke select on public.learning_quiz_attempts from authenticated;

create or replace function public.start_learning_quiz(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quiz_tests;
  a public.learning_quiz_attempts;
  public_questions jsonb;
begin
  if auth.uid() is null or not public.learning_share_allowed('quiz',p_id) then raise exception 'ACCESS_REVOKED'; end if;
  select * into q from public.quiz_tests where id=p_id;
  if q.id is null then raise exception 'RESOURCE_REMOVED'; end if;

  insert into public.learning_quiz_attempts(quiz_id,user_id,content_version,questions)
    values(p_id,auth.uid(),q.content_version,q.questions) returning * into a;

  select coalesce(jsonb_agg((item - 'correctIndex' - 'explanation') order by n),'[]'::jsonb)
    into public_questions
    from jsonb_array_elements(a.questions) with ordinality as question(item,n);

  return jsonb_build_object('id',a.id,'questions',public_questions,'version',a.content_version);
end $$;

-- Return the review payload only after the attempt is atomically completed.
drop function if exists public.finish_learning_quiz(uuid,jsonb);
create function public.finish_learning_quiz(p_attempt uuid,p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.learning_quiz_attempts;
  v_score integer;
  v_total integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.learning_quiz_attempts where id=p_attempt and user_id=auth.uid() for update;
  if a.id is null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if a.completed_at is not null then raise exception 'ATTEMPT_ALREADY_COMPLETED'; end if;
  if not public.learning_share_allowed('quiz',a.quiz_id) then raise exception 'ACCESS_REVOKED'; end if;

  v_total:=jsonb_array_length(a.questions);
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers)<>v_total then raise exception 'INVALID_ANSWERS'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_answers) answer(value)
    where jsonb_typeof(answer.value) not in ('number','null')
  ) then raise exception 'INVALID_ANSWERS'; end if;

  select count(*) into v_score
    from jsonb_array_elements(a.questions) with ordinality q(item,n)
    where p_answers->(q.n-1) = q.item->'correctIndex';

  update public.learning_quiz_attempts
    set answers=p_answers,score=v_score,completed_at=now()
    where id=p_attempt;

  return jsonb_build_object(
    'score',v_score,
    'total',v_total,
    'version',a.content_version,
    'questions',a.questions
  );
end $$;

revoke all on function public.start_learning_quiz(uuid), public.finish_learning_quiz(uuid,jsonb) from public,anon;
grant execute on function public.start_learning_quiz(uuid), public.finish_learning_quiz(uuid,jsonb) to authenticated;

-- 3-day Google Plus trial. Eligibility is created on account creation and is
-- not tied to the activation date, so an eligible user can activate later.
create table if not exists public.account_plus_trials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  eligible_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz,
  consumed boolean not null default false,
  provider text not null default 'google',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((activated_at is null and expires_at is null) or (activated_at is not null and expires_at is not null))
);
alter table public.account_plus_trials enable row level security;
drop policy if exists plus_trial_owner_read on public.account_plus_trials;
create policy plus_trial_owner_read on public.account_plus_trials for select to authenticated using (user_id=auth.uid());

-- Keep the existing profile/free-plan bootstrap and add trial eligibility for
-- newly-created Google accounts.
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

  if coalesce(new.raw_app_meta_data->>'provider','')='google'
     or coalesce(new.raw_app_meta_data->'providers','[]'::jsonb) ? 'google' then
    insert into public.account_plus_trials(user_id,provider) values(new.id,'google')
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

-- Rollout bridge: accounts created in the three days immediately before this
-- migration receive the same onboarding entitlement; older accounts do not.
insert into public.account_plus_trials(user_id,eligible_at,provider)
select u.id,u.created_at,'google'
from auth.users u
where u.created_at >= now()-interval '3 days'
  and (coalesce(u.raw_app_meta_data->>'provider','')='google'
    or coalesce(u.raw_app_meta_data->'providers','[]'::jsonb) ? 'google')
on conflict(user_id) do nothing;

create or replace function public.get_my_plus_trial()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare t public.account_plus_trials;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into t from public.account_plus_trials where user_id=auth.uid();
  if t.user_id is null then
    return jsonb_build_object('eligible',false,'consumed',false,'active',false,'activatedAt',null,'expiresAt',null);
  end if;
  return jsonb_build_object(
    'eligible',not t.consumed,
    'consumed',t.consumed,
    'active',t.activated_at is not null and t.expires_at>now(),
    'activatedAt',t.activated_at,
    'expiresAt',t.expires_at
  );
end $$;

create or replace function public.activate_my_plus_trial()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.account_plus_trials;
  e public.account_entitlements;
  v_now timestamptz := now();
  v_expires timestamptz := now()+interval '3 days';
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into t from public.account_plus_trials where user_id=auth.uid() for update;
  if t.user_id is null then raise exception 'TRIAL_NOT_ELIGIBLE'; end if;
  if t.consumed then raise exception 'TRIAL_ALREADY_USED'; end if;

  select * into e from public.account_entitlements where user_id=auth.uid() for update;
  if e.user_id is not null and e.plan_id<>'free' and e.status='active' and (e.expires_at is null or e.expires_at>v_now) then
    raise exception 'TRIAL_PLAN_CONFLICT';
  end if;

  insert into public.account_entitlements(user_id,plan_id,status,assigned_at,expires_at,note)
  values(auth.uid(),'plus','active',v_now,v_expires,'Google 3-day Plus trial')
  on conflict(user_id) do update set
    plan_id='plus',status='active',assigned_at=v_now,expires_at=v_expires,note='Google 3-day Plus trial';

  update public.account_plus_trials
    set activated_at=v_now,expires_at=v_expires,consumed=true,updated_at=v_now
    where user_id=auth.uid()
    returning * into t;

  return jsonb_build_object('eligible',false,'consumed',true,'active',true,'activatedAt',t.activated_at,'expiresAt',t.expires_at);
end $$;

revoke all on function public.get_my_plus_trial(), public.activate_my_plus_trial() from public,anon;
grant execute on function public.get_my_plus_trial(), public.activate_my_plus_trial() to authenticated;
grant select on public.account_plus_trials to authenticated;

notify pgrst, 'reload schema';
