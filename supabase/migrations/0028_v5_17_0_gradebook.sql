-- Apply after 0027. Grade history and teacher-only gradebook/review RPCs.
create table if not exists public.class_grade_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  student_id uuid not null,
  actor_id uuid,
  old_points integer,
  new_points integer,
  old_feedback text not null default '',
  new_feedback text not null default '',
  reason text not null check (length(trim(reason)) between 1 and 500),
  source text not null check (source in ('auto','manual','migration')),
  created_at timestamptz not null default now(),
  foreign key (assignment_id,student_id) references public.class_submissions(assignment_id,student_id) on delete cascade
);
create index if not exists class_grade_events_submission on public.class_grade_events(assignment_id,student_id,created_at,id);
alter table public.class_grade_events enable row level security;
revoke all on public.class_grade_events from public,anon,authenticated;

-- Existing scores predate this audit; retain a snapshot, without inventing past edits.
insert into public.class_grade_events(assignment_id,student_id,actor_id,old_points,new_points,
  old_feedback,new_feedback,reason,source,created_at)
select s.assignment_id,s.student_id,null,null,s.points,'',s.feedback,
  'Trạng thái tại thời điểm nâng cấp','migration',coalesce(s.graded_at,s.submitted_at)
from public.class_submissions s
where (s.points is not null or s.graded_at is not null)
  and not exists(select 1 from public.class_grade_events e
    where e.assignment_id=s.assignment_id and e.student_id=s.student_id);

create or replace function public.audit_class_grade() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_reason text; v_source text;
begin
  if tg_op='INSERT' then
    if new.points is null and new.graded_at is null then return new; end if;
    v_source := 'auto'; v_reason := 'Điểm Quiz tự động';
    insert into public.class_grade_events(assignment_id,student_id,actor_id,new_points,new_feedback,reason,source)
      values(new.assignment_id,new.student_id,auth.uid(),new.points,new.feedback,v_reason,v_source);
    return new;
  end if;
  if old.points is not distinct from new.points and old.feedback is not distinct from new.feedback
    and old.graded_at is not distinct from new.graded_at then return new; end if;
  if new.graded_at is not null then
    v_source := 'manual';
    v_reason := nullif(trim(current_setting('mindcanvas.grade_reason',true)),'');
    if old.graded_at is not null and (v_reason is null or length(v_reason) not between 10 and 500)
      then raise exception 'GRADE_REASON_REQUIRED'; end if;
    v_reason := coalesce(v_reason,'Chấm lần đầu');
  else
    v_source := 'auto'; v_reason := 'Cập nhật lượt Quiz trước khi chấm';
  end if;
  insert into public.class_grade_events(assignment_id,student_id,actor_id,
    old_points,new_points,old_feedback,new_feedback,reason,source)
    values(new.assignment_id,new.student_id,auth.uid(),old.points,new.points,
      old.feedback,new.feedback,v_reason,v_source);
  return new;
end $$;
drop trigger if exists class_grade_audit on public.class_submissions;
create trigger class_grade_audit after insert or update of points,feedback,graded_at on public.class_submissions
  for each row execute function public.audit_class_grade();

-- The old four-argument mutation cannot preserve an explanation for corrections.
revoke all on function public.grade_class_submission(uuid,uuid,integer,text) from public,anon,authenticated;

create or replace function public.record_class_grade(p_assignment uuid,p_student uuid,p_points integer,
  p_feedback text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_submission public.class_submissions; v_max integer; v_reason text := trim(coalesce(p_reason,''));
begin
  select a.max_points into v_max from public.class_assignments a join public.classrooms c on c.id=a.class_id
    where a.id=p_assignment and c.teacher_id=auth.uid();
  if v_max is null then raise exception 'ACCESS_DENIED'; end if;
  if p_points is null or p_points<0 or p_points>v_max or length(coalesce(p_feedback,''))>4000
    or length(v_reason)>500 then raise exception 'INVALID_GRADE'; end if;
  select * into v_submission from public.class_submissions
    where assignment_id=p_assignment and student_id=p_student for update;
  if v_submission.assignment_id is null then raise exception 'SUBMISSION_UNAVAILABLE'; end if;
  if v_submission.graded_at is not null and length(v_reason)<10 then raise exception 'GRADE_REASON_REQUIRED'; end if;
  perform pg_catalog.set_config('mindcanvas.grade_reason',coalesce(nullif(v_reason,''),'Chấm lần đầu'),true);
  update public.class_submissions set points=p_points,feedback=coalesce(p_feedback,''),graded_at=now()
    where assignment_id=p_assignment and student_id=p_student;
end $$;

-- One assignment at a time: the exact rows used by the gradebook and exports.
create or replace function public.list_assignment_gradebook(p_assignment uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_class uuid; v_result jsonb;
begin
  select a.class_id into v_class from public.class_assignments a join public.classrooms c on c.id=a.class_id
    where a.id=p_assignment and c.teacher_id=auth.uid();
  if v_class is null then raise exception 'ACCESS_DENIED'; end if;
  with roster as (
    select m.student_id from public.classroom_members m where m.class_id=v_class and m.status='active'
    union
    select s.student_id from public.class_submissions s where s.assignment_id=p_assignment
  )
  select coalesce(jsonb_agg(jsonb_build_object('student_id',r.student_id,
    'name',coalesce(nullif(p.display_name,''),'Học trò'),
    'status',case when s.assignment_id is null then 'not_submitted'
      when s.graded_at is null then 'pending' else 'graded' end,
    'submitted_at',s.submitted_at,'note',s.note,'auto_points',s.auto_points,
    'points',s.points,'feedback',s.feedback,'graded_at',s.graded_at,
    'wrong_count',case when q.id is null then null else
      (select count(*) from jsonb_array_elements(q.questions) with ordinality item(question,n)
        where q.answers->((item.n-1)::integer) is distinct from item.question->'correctIndex') end,
    'quiz_total',case when q.id is null then null else jsonb_array_length(q.questions) end)
    order by coalesce(p.display_name,'Học trò'),r.student_id),'[]'::jsonb)
    into v_result from roster r left join public.profiles p on p.id=r.student_id
    left join public.class_submissions s on s.assignment_id=p_assignment and s.student_id=r.student_id
    left join public.learning_quiz_attempts q on q.id=s.attempt_id and q.user_id=s.student_id
      and q.completed_at is not null;
  return v_result;
end $$;

-- Only the teacher may review the attempt actually submitted to this assignment.
-- Unfinished or unsubmitted attempts are never returned, even if the teacher owns the Quiz.
create or replace function public.review_class_quiz_submission(p_assignment uuid,p_student uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not exists(select 1 from public.class_assignments a join public.classrooms c on c.id=a.class_id
    where a.id=p_assignment and c.teacher_id=auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('number',item.n,'prompt',item.question->>'prompt',
    'options',item.question->'options','answer',q.answers->((item.n-1)::integer),
    'correct_index',item.question->'correctIndex','explanation',item.question->>'explanation',
    'correct',q.answers->((item.n-1)::integer)=item.question->'correctIndex') order by item.n),'[]'::jsonb)
    into v_result from public.class_submissions s
    join public.class_assignments a on a.id=s.assignment_id
    join public.learning_quiz_attempts q on q.id=s.attempt_id and q.user_id=s.student_id
      and q.quiz_id=a.quiz_id and q.completed_at is not null
    cross join lateral jsonb_array_elements(q.questions) with ordinality item(question,n)
    where s.assignment_id=p_assignment and s.student_id=p_student;
  return v_result;
end $$;

create or replace function public.list_class_grade_history(p_assignment uuid,p_student uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_class uuid; v_teacher uuid; v_result jsonb;
begin
  select a.class_id,c.teacher_id into v_class,v_teacher from public.class_assignments a
    join public.classrooms c on c.id=a.class_id where a.id=p_assignment;
  if v_class is null or (v_teacher<>auth.uid() and
    (p_student<>auth.uid() or not public.classroom_student_active(v_class,auth.uid())))
    then raise exception 'ACCESS_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('old_points',e.old_points,'new_points',e.new_points,
    'old_feedback',e.old_feedback,'new_feedback',e.new_feedback,'reason',e.reason,'source',e.source,
    'actor_name',case when e.actor_id is null then 'Hệ thống' else
      coalesce(nullif(p.display_name,''),'Người dùng') end,'created_at',e.created_at)
    order by e.created_at,e.id),'[]'::jsonb)
    into v_result from public.class_grade_events e left join public.profiles p on p.id=e.actor_id
    where e.assignment_id=p_assignment and e.student_id=p_student;
  return v_result;
end $$;

do $$ declare f text; begin
  foreach f in array array['record_class_grade(uuid,uuid,integer,text,text)',
    'list_assignment_gradebook(uuid)','review_class_quiz_submission(uuid,uuid)',
    'list_class_grade_history(uuid,uuid)'] loop
    execute 'revoke all on function public.'||f||' from public,anon';
    execute 'grant execute on function public.'||f||' to authenticated';
  end loop;
end $$;
notify pgrst, 'reload schema';
