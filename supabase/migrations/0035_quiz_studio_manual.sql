-- Create a quiz and, only for AI Manual, commit its usage in the same transaction.
create or replace function public.create_quiz_studio(
  p_quiz_id uuid, p_title text, p_description text, p_questions jsonb, p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_quiz public.quiz_tests;
  v_count integer;
  v_max integer;
  v_question jsonb;
  v_choice jsonb;
  v_unique_count integer;
  v_ids text[] := array[]::text[];
  v_request text := 'quiz-studio:' || v_user::text || ':' || p_quiz_id::text;
begin
  if v_user is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_quiz_id is null or p_mode is null or p_mode not in ('manual', 'ai_manual') then
    raise exception 'Invalid quiz input' using errcode = '22023';
  end if;
  -- A retry after a timeout returns the existing quiz without reserving another use.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request, 0));
  select * into v_quiz from public.quiz_tests where id = p_quiz_id and user_id = v_user;
  if found then return to_jsonb(v_quiz); end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 200
    or p_description is null or char_length(p_description) > 1000
    or jsonb_typeof(p_questions) is distinct from 'array'
  then
    raise exception 'Invalid quiz input' using errcode = '22023';
  end if;

  select least(100, coalesce(active_plan.max_cards, free_plan.max_cards, 50))
  into v_max
  from public.plans free_plan
  left join public.account_entitlements entitlement on entitlement.user_id = v_user
    and entitlement.status = 'active' and (entitlement.expires_at is null or entitlement.expires_at > now())
  left join public.plans active_plan on active_plan.id = entitlement.plan_id and active_plan.active
  where free_plan.id = 'free';
  v_max := coalesce(v_max, 50);
  v_count := jsonb_array_length(p_questions);
  if v_count > v_max then
    raise exception 'Quiz question limit exceeded' using errcode = 'MCQ01', detail = v_max::text;
  end if;
  if v_count = 0 then
    raise exception 'Quiz must contain at least one question' using errcode = '22023';
  end if;
  for v_question in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_question) is distinct from 'object'
      or jsonb_typeof(v_question->'id') is distinct from 'string'
      or char_length(btrim(v_question->>'id')) not between 1 and 120
      or jsonb_typeof(v_question->'prompt') is distinct from 'string'
      or char_length(btrim(v_question->>'prompt')) not between 1 and 8000
      or jsonb_typeof(v_question->'options') is distinct from 'array'
      or jsonb_typeof(v_question->'correctIndex') is distinct from 'number'
      or (v_question->>'correctIndex') not in ('0', '1', '2', '3')
      or jsonb_typeof(v_question->'explanation') is distinct from 'string'
      or char_length(v_question->>'explanation') > 8000
      or (
        v_question->'sourcePage' is not null and jsonb_typeof(v_question->'sourcePage') <> 'null'
        and (jsonb_typeof(v_question->'sourcePage') <> 'number' or (v_question->>'sourcePage') !~ '^[1-9][0-9]*$')
      )
      or (
        v_question->'topic' is not null
        and (jsonb_typeof(v_question->'topic') <> 'string' or char_length(v_question->>'topic') > 160)
      )
    then
      raise exception 'Invalid quiz question' using errcode = '22023';
    end if;
    if (v_question->>'id') = any(v_ids) then
      raise exception 'Quiz question IDs must be distinct' using errcode = '22023';
    end if;
    v_ids := array_append(v_ids, v_question->>'id');
    if jsonb_array_length(v_question->'options') <> 4 then
      raise exception 'Invalid quiz options' using errcode = '22023';
    end if;
    for v_choice in select value from jsonb_array_elements(v_question->'options') loop
      if jsonb_typeof(v_choice) <> 'string' or char_length(btrim(v_choice #>> '{}')) not between 1 and 2000 then
        raise exception 'Invalid quiz option' using errcode = '22023';
      end if;
    end loop;
    select count(distinct lower(btrim(option_text))) into v_unique_count
    from jsonb_array_elements_text(v_question->'options') as choices(option_text);
    if v_unique_count <> 4 then
      raise exception 'Quiz options must be distinct' using errcode = '22023';
    end if;
  end loop;

  if p_mode = 'ai_manual' then
    perform public.reserve_ai_usage(v_user, 'ai_manual', v_request);
  end if;
  insert into public.quiz_tests (id, user_id, title, description, questions)
  values (p_quiz_id, v_user, btrim(p_title), p_description, p_questions)
  returning * into v_quiz;
  if p_mode = 'ai_manual' then
    if (public.commit_ai_usage(v_request)->>'ok') is distinct from 'true' then
      raise exception 'Could not commit quiz usage' using errcode = 'MCQ02';
    end if;
  end if;
  return to_jsonb(v_quiz);
end;
$$;

revoke all on function public.create_quiz_studio(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_quiz_studio(uuid, text, text, jsonb, text) to authenticated;
