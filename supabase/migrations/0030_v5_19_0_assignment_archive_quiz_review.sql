-- Apply after 0029. Preserve submissions and grade history when a teacher archives work.
alter table public.class_assignments add column if not exists archived_at timestamptz;
alter table public.class_assignments add column if not exists archived_was_open boolean not null default false;
create index if not exists class_assignments_archived on public.class_assignments(class_id,archived_at,due_at);

create or replace function public.set_class_assignment_archived(p_assignment uuid,p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_archived is null then raise exception 'ACCESS_DENIED'; end if;
  update public.class_assignments a
  set archived_at=case when p_archived then now() else null end,
      closed_at=case when p_archived then coalesce(a.closed_at,now())
        when a.archived_was_open and a.due_at>now() then null else a.closed_at end,
      archived_was_open=case when p_archived then a.closed_at is null else false end
  from public.classrooms c
  where a.id=p_assignment and a.class_id=c.id and c.teacher_id=auth.uid()
    and ((p_archived and a.archived_at is null) or (not p_archived and a.archived_at is not null));
  if not found then raise exception 'ACCESS_DENIED'; end if;
end $$;

-- Include archived work for the teacher and students who have submitted it.
-- Unsubmitted archived work is hidden from students.
create or replace function public.list_class_assignments(p_class uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_teacher uuid; v_result jsonb;
begin
  select teacher_id into v_teacher from public.classrooms where id=p_class;
  if v_teacher is null or (v_teacher<>auth.uid() and not public.classroom_student_active(p_class,auth.uid()))
    then raise exception 'ACCESS_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'instructions',a.instructions,
    'quiz_id',a.quiz_id,'quiz_title',q.title,'due_at',a.due_at,'max_points',a.max_points,
    'closed_at',a.closed_at,'archived_at',a.archived_at,'submitted_at',s.submitted_at,'note',s.note,
    'points',s.points,'auto_points',s.auto_points,'feedback',s.feedback,'graded_at',s.graded_at) order by a.due_at),'[]'::jsonb)
    into v_result from public.class_assignments a left join public.quiz_tests q on q.id=a.quiz_id
    left join public.class_submissions s on s.assignment_id=a.id and s.student_id=auth.uid()
    where a.class_id=p_class and (a.archived_at is null or v_teacher=auth.uid() or s.student_id=auth.uid());
  return v_result;
end $$;

-- The student may review only their own completed attempt belonging to this assignment.
-- Answer keys from unfinished attempts never leave the server.
create or replace function public.review_own_class_quiz_attempt(p_assignment uuid,p_attempt uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.class_assignments; q public.learning_quiz_attempts; v_questions jsonb;
begin
  select * into a from public.class_assignments where id=p_assignment;
  if a.id is null or a.quiz_id is null or not public.classroom_student_active(a.class_id,auth.uid())
    then raise exception 'ACCESS_DENIED'; end if;
  select * into q from public.learning_quiz_attempts
    where id=p_attempt and user_id=auth.uid() and quiz_id=a.quiz_id and completed_at is not null
      and started_at>=a.created_at and completed_at<=a.due_at;
  if q.id is null then raise exception 'ATTEMPT_UNAVAILABLE'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('number',item.n,'prompt',item.question->>'prompt',
    'options',item.question->'options','answer',q.answers->((item.n-1)::integer),
    'correct_index',item.question->'correctIndex','explanation',item.question->>'explanation',
    'correct',q.answers->((item.n-1)::integer)=item.question->'correctIndex') order by item.n),'[]'::jsonb)
    into v_questions from jsonb_array_elements(q.questions) with ordinality item(question,n);
  return jsonb_build_object('id',q.id,'score',q.score,'total',jsonb_array_length(q.questions),
    'completed_at',q.completed_at,'questions',v_questions);
end $$;

revoke all on function public.set_class_assignment_archived(uuid,boolean),
  public.review_own_class_quiz_attempt(uuid,uuid) from public,anon;
grant execute on function public.set_class_assignment_archived(uuid,boolean),
  public.review_own_class_quiz_attempt(uuid,uuid) to authenticated;
