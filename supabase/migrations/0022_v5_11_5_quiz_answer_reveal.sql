-- Apply after 0020 and 0021. An immediate-feedback attempt records each
-- selected answer before returning that question's key/explanation.
alter table public.learning_quiz_attempts
  add column if not exists answer_reveal_mode text not null default 'submit';

create or replace function public.start_learning_quiz_immediate(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q public.quiz_tests; a public.learning_quiz_attempts; public_questions jsonb;
begin
  if auth.uid() is null or not public.learning_share_allowed('quiz',p_id) then raise exception 'ACCESS_REVOKED'; end if;
  select * into q from public.quiz_tests where id=p_id;
  if q.id is null then raise exception 'RESOURCE_REMOVED'; end if;
  insert into public.learning_quiz_attempts(quiz_id,user_id,content_version,questions,answers,answer_reveal_mode)
    values(p_id,auth.uid(),q.content_version,q.questions,
      coalesce((select jsonb_agg('null'::jsonb) from generate_series(1,jsonb_array_length(q.questions))),'[]'::jsonb),
      'instant') returning * into a;
  select coalesce(jsonb_agg((item - 'correctIndex' - 'explanation') order by n),'[]'::jsonb)
    into public_questions from jsonb_array_elements(a.questions) with ordinality as question(item,n);
  return jsonb_build_object('id',a.id,'questions',public_questions,'version',a.content_version);
end $$;

create or replace function public.reveal_learning_quiz_answer(p_attempt uuid,p_question_index integer,p_answer integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.learning_quiz_attempts;
  v_question jsonb;
  v_total integer;
  v_answers jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.learning_quiz_attempts where id=p_attempt and user_id=auth.uid() for update;
  if a.id is null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if a.completed_at is not null then raise exception 'ATTEMPT_ALREADY_COMPLETED'; end if;
  if a.answer_reveal_mode <> 'instant' then raise exception 'INVALID_ANSWERS'; end if;
  if not public.learning_share_allowed('quiz',a.quiz_id) then raise exception 'ACCESS_REVOKED'; end if;
  v_total := jsonb_array_length(a.questions);
  if p_question_index is null or p_question_index < 0 or p_question_index >= v_total
    or p_answer is null or p_answer < 0 or p_answer > 3 then raise exception 'INVALID_ANSWERS'; end if;
  v_question := a.questions->p_question_index;
  if a.answers->p_question_index is not null and a.answers->p_question_index <> 'null'::jsonb then
    if a.answers->p_question_index <> to_jsonb(p_answer) then raise exception 'ANSWER_ALREADY_RECORDED'; end if;
  else
    select coalesce(jsonb_agg(
      case when n-1 = p_question_index then to_jsonb(p_answer)
        else coalesce(a.answers->((n-1)::integer),'null'::jsonb) end order by n
    ),'[]'::jsonb) into v_answers from generate_series(1,v_total) as n;
    update public.learning_quiz_attempts set answers=v_answers where id=a.id;
  end if;
  return jsonb_build_object('correctIndex',v_question->'correctIndex','explanation',v_question->'explanation');
end $$;

-- Keep server-recorded immediate answers authoritative at submission. The
-- ordinary submit-only flow still accepts the client's complete answer array.
create or replace function public.finish_learning_quiz(p_attempt uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.learning_quiz_attempts; v_score integer; v_total integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.learning_quiz_attempts where id=p_attempt and user_id=auth.uid() for update;
  if a.id is null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if a.completed_at is not null then raise exception 'ATTEMPT_ALREADY_COMPLETED'; end if;
  if not public.learning_share_allowed('quiz',a.quiz_id) then raise exception 'ACCESS_REVOKED'; end if;
  v_total := jsonb_array_length(a.questions);
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) <> v_total then raise exception 'INVALID_ANSWERS'; end if;
  if exists (select 1 from jsonb_array_elements(p_answers) answer(value)
    where jsonb_typeof(answer.value) not in ('number','null')) then raise exception 'INVALID_ANSWERS'; end if;
  if a.answer_reveal_mode = 'instant' and a.answers is distinct from p_answers then raise exception 'INVALID_ANSWERS'; end if;
  select count(*) into v_score from jsonb_array_elements(a.questions) with ordinality q(item,n)
    where p_answers->((q.n-1)::integer) = q.item->'correctIndex';
  update public.learning_quiz_attempts set answers=p_answers,score=v_score,completed_at=now() where id=p_attempt;
  return jsonb_build_object('score',v_score,'total',v_total,'version',a.content_version,'questions',a.questions);
end $$;

revoke all on function public.start_learning_quiz_immediate(uuid),
  public.reveal_learning_quiz_answer(uuid,integer,integer) from public,anon;
grant execute on function public.start_learning_quiz_immediate(uuid),
  public.reveal_learning_quiz_answer(uuid,integer,integer) to authenticated;
notify pgrst, 'reload schema';
