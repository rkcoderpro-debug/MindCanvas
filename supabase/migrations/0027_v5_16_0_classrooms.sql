-- Apply after 0026. Teacher/student consent, private classes and assignments.
-- All client mutation and reading uses guarded RPCs; never expose answer snapshots.
create table if not exists public.teacher_student_links (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(), responded_at timestamptz,
  primary key (teacher_id,student_id), check (teacher_id <> student_id)
);
create index if not exists teacher_student_links_student on public.teacher_student_links(student_id,status);

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '' check (length(description)<=1000),
  created_at timestamptz not null default now()
);
create index if not exists classrooms_teacher on public.classrooms(teacher_id);
create table if not exists public.classroom_members (
  class_id uuid not null references public.classrooms(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active')),
  joined_at timestamptz, created_at timestamptz not null default now(),
  primary key (class_id,student_id)
);
create index if not exists classroom_members_student on public.classroom_members(student_id,status);
create table if not exists public.class_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classrooms(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  instructions text not null default '' check (length(instructions)<=4000),
  quiz_id uuid references public.quiz_tests(id) on delete set null,
  due_at timestamptz not null,
  max_points integer not null default 100 check (max_points between 1 and 1000),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (due_at > created_at)
);
create index if not exists class_assignments_class on public.class_assignments(class_id,due_at);
create table if not exists public.class_submissions (
  assignment_id uuid not null references public.class_assignments(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  note text not null default '' check (length(note)<=4000),
  attempt_id uuid references public.learning_quiz_attempts(id) on delete set null,
  auto_points integer,
  points integer,
  feedback text not null default '' check (length(feedback)<=4000),
  submitted_at timestamptz not null default now(), graded_at timestamptz,
  primary key (assignment_id,student_id)
);
create index if not exists class_submissions_student on public.class_submissions(student_id);

alter table public.teacher_student_links enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.class_assignments enable row level security;
alter table public.class_submissions enable row level security;
revoke all on public.teacher_student_links,public.classrooms,public.classroom_members,
  public.class_assignments,public.class_submissions from anon,authenticated;

create or replace function public.classroom_student_active(p_class uuid,p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_student=auth.uid() and exists(select 1 from public.classroom_members m join public.classrooms c on c.id=m.class_id
    join public.teacher_student_links l on l.teacher_id=c.teacher_id and l.student_id=m.student_id
    where m.class_id=p_class and m.student_id=p_student and m.status='active' and l.status='accepted'
      and public.connection_is_active(c.teacher_id))
$$;

-- Keep original direct sharing and add class Quiz access only while enrolled.
-- Do not add shared SELECT on quiz_tests: answer keys remain server-only.
create or replace function public.learning_share_allowed(p_kind text,p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.learning_share_members m
    where m.kind=p_kind and m.resource_id=p_id and m.user_id=auth.uid()
      and public.learning_resource_owner(m.kind,m.resource_id,m.owner_id)
      and public.learning_share_tier(m.owner_id)>=public.learning_required_tier(p_kind))
    or (p_kind='quiz' and exists(
      select 1 from public.class_assignments a join public.classrooms c on c.id=a.class_id
      where a.quiz_id=p_id and a.closed_at is null and public.classroom_student_active(c.id,auth.uid())
        and public.learning_resource_owner('quiz',p_id,c.teacher_id)
        and public.learning_share_tier(c.teacher_id)>=public.learning_required_tier('quiz')
    ))
$$;

create or replace function public.list_teacher_student_links()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('teacher_id',l.teacher_id,'student_id',l.student_id,
    'teacher_name',coalesce(tp.display_name,'Giáo viên'),'student_name',coalesce(sp.display_name,'Học trò'),
    'status',l.status) order by l.created_at desc),'[]'::jsonb)
  from public.teacher_student_links l
  left join public.profiles tp on tp.id=l.teacher_id left join public.profiles sp on sp.id=l.student_id
  where auth.uid() in (l.teacher_id,l.student_id) and public.connection_is_active(
    case when auth.uid()=l.teacher_id then l.student_id else l.teacher_id end)
$$;

create or replace function public.request_teacher_student(p_student uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.connection_is_active(p_student) then raise exception 'CONNECTION_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.teacher_student_links where teacher_id=auth.uid() and created_at>now()-interval '1 day')>=20
    then raise exception 'REQUEST_RATE_LIMIT'; end if;
  insert into public.teacher_student_links(teacher_id,student_id) values(auth.uid(),p_student)
    on conflict(teacher_id,student_id) do update set status='pending',created_at=now(),responded_at=null
    where public.teacher_student_links.status='declined';
end $$;

create or replace function public.respond_teacher_student(p_teacher uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.connection_is_active(p_teacher) then raise exception 'CONNECTION_REQUIRED'; end if;
  update public.teacher_student_links set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now()
    where teacher_id=p_teacher and student_id=auth.uid() and status='pending';
  if not found then raise exception 'REQUEST_UNAVAILABLE'; end if;
end $$;

create or replace function public.end_teacher_student(p_teacher uuid,p_student uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() not in (p_teacher,p_student) then raise exception 'ACCESS_DENIED'; end if;
  delete from public.teacher_student_links where teacher_id=p_teacher and student_id=p_student;
  if not found then raise exception 'RELATION_UNAVAILABLE'; end if;
  delete from public.classroom_members m using public.classrooms c
    where m.class_id=c.id and c.teacher_id=p_teacher and m.student_id=p_student;
end $$;

create or replace function public.create_classroom(p_name text,p_description text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 120 or length(coalesce(p_description,''))>1000 then raise exception 'INVALID_CLASS'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.classrooms where teacher_id=auth.uid())>=30 then raise exception 'CLASS_LIMIT'; end if;
  insert into public.classrooms(teacher_id,name,description) values(auth.uid(),trim(p_name),trim(coalesce(p_description,''))) returning id into v_id;
  return v_id;
end $$;

create or replace function public.list_classrooms()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'description',c.description,
    'teacher_id',c.teacher_id,'teacher_name',coalesce(p.display_name,'Giáo viên'),
    'status',case when c.teacher_id=auth.uid() then 'teacher' else m.status end,
    'student_count',(select count(*) from public.classroom_members cm where cm.class_id=c.id and cm.status='active'))
    order by c.created_at desc),'[]'::jsonb)
  from public.classrooms c left join public.classroom_members m on m.class_id=c.id and m.student_id=auth.uid()
  left join public.profiles p on p.id=c.teacher_id
  where c.teacher_id=auth.uid() or (m.student_id=auth.uid() and public.connection_is_active(c.teacher_id)
    and exists(select 1 from public.teacher_student_links l where l.teacher_id=c.teacher_id
      and l.student_id=auth.uid() and l.status='accepted'))
$$;

create or replace function public.invite_class_student(p_class uuid,p_student uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.classrooms where id=p_class and teacher_id=auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  if not public.connection_is_active(p_student) or not exists(select 1 from public.teacher_student_links
    where teacher_id=auth.uid() and student_id=p_student and status='accepted') then raise exception 'RELATION_REQUIRED'; end if;
  perform 1 from public.classrooms where id=p_class for update;
  if (select count(*) from public.classroom_members where class_id=p_class)>=100 then raise exception 'CLASS_FULL'; end if;
  insert into public.classroom_members(class_id,student_id) values(p_class,p_student) on conflict do nothing;
end $$;

create or replace function public.respond_class_invite(p_class uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_teacher uuid;
begin
  select teacher_id into v_teacher from public.classrooms where id=p_class;
  if not public.connection_is_active(v_teacher) or not exists(select 1 from public.teacher_student_links
    where teacher_id=v_teacher and student_id=auth.uid() and status='accepted') then raise exception 'RELATION_REQUIRED'; end if;
  if p_accept then
    update public.classroom_members set status='active',joined_at=now()
      where class_id=p_class and student_id=auth.uid() and status='pending';
  else
    delete from public.classroom_members where class_id=p_class and student_id=auth.uid() and status='pending';
  end if;
  if not found then raise exception 'INVITE_UNAVAILABLE'; end if;
end $$;

create or replace function public.remove_class_student(p_class uuid,p_student uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid()<>p_student and not exists(select 1 from public.classrooms where id=p_class and teacher_id=auth.uid())
    then raise exception 'ACCESS_DENIED'; end if;
  delete from public.classroom_members where class_id=p_class and student_id=p_student;
  if not found then raise exception 'MEMBER_UNAVAILABLE'; end if;
end $$;

create or replace function public.list_class_members(p_class uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not exists(select 1 from public.classrooms c where c.id=p_class and c.teacher_id=auth.uid())
    and not public.classroom_student_active(p_class,auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('student_id',m.student_id,
    'name',coalesce(p.display_name,'Học trò'),'status',m.status) order by m.created_at),'[]'::jsonb)
    into v_result from public.classroom_members m left join public.profiles p on p.id=m.student_id
    where m.class_id=p_class and (m.status='active' or exists(select 1 from public.classrooms c where c.id=p_class and c.teacher_id=auth.uid()));
  return v_result;
end $$;

create or replace function public.create_class_assignment(p_class uuid,p_title text,p_instructions text,p_due timestamptz,
  p_quiz uuid default null,p_max integer default 100)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.classrooms where id=p_class and teacher_id=auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 200 or length(coalesce(p_instructions,''))>4000
    or p_due is null or p_due<=now() or p_due>now()+interval '1 year' or p_max not between 1 and 1000
    then raise exception 'INVALID_ASSIGNMENT'; end if;
  if p_quiz is not null and (not public.learning_resource_owner('quiz',p_quiz,auth.uid())
    or public.learning_share_tier(auth.uid())<public.learning_required_tier('quiz')) then raise exception 'QUIZ_NOT_AVAILABLE'; end if;
  perform 1 from public.classrooms where id=p_class for update;
  if (select count(*) from public.class_assignments where class_id=p_class)>=500 then raise exception 'ASSIGNMENT_LIMIT'; end if;
  insert into public.class_assignments(class_id,title,instructions,due_at,quiz_id,max_points)
    values(p_class,trim(p_title),coalesce(p_instructions,''),p_due,p_quiz,p_max) returning id into v_id;
  return v_id;
end $$;

create or replace function public.list_class_assignments(p_class uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_teacher uuid; v_result jsonb;
begin
  select teacher_id into v_teacher from public.classrooms where id=p_class;
  if v_teacher is null or (v_teacher<>auth.uid() and not public.classroom_student_active(p_class,auth.uid()))
    then raise exception 'ACCESS_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'instructions',a.instructions,
    'quiz_id',a.quiz_id,'quiz_title',q.title,'due_at',a.due_at,'max_points',a.max_points,
    'closed_at',a.closed_at,'submitted_at',s.submitted_at,'note',s.note,
    'points',s.points,'auto_points',s.auto_points,'feedback',s.feedback,'graded_at',s.graded_at) order by a.due_at),'[]'::jsonb)
    into v_result from public.class_assignments a left join public.quiz_tests q on q.id=a.quiz_id
    left join public.class_submissions s on s.assignment_id=a.id and s.student_id=auth.uid()
    where a.class_id=p_class;
  return v_result;
end $$;

create or replace function public.submit_class_assignment(p_assignment uuid,p_note text,p_attempt uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.class_assignments; q public.learning_quiz_attempts; v_auto integer;
begin
  select * into a from public.class_assignments where id=p_assignment for update;
  if a.id is null or a.closed_at is not null or now()>a.due_at then raise exception 'DEADLINE_PASSED'; end if;
  if not public.classroom_student_active(a.class_id,auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  if length(coalesce(p_note,''))>4000 or (trim(coalesce(p_note,''))='' and p_attempt is null)
    then raise exception 'INVALID_SUBMISSION'; end if;
  if p_attempt is not null then
    if a.quiz_id is null then raise exception 'QUIZ_NOT_AVAILABLE'; end if;
    select * into q from public.learning_quiz_attempts where id=p_attempt and user_id=auth.uid()
      and quiz_id=a.quiz_id and completed_at is not null and started_at>=a.created_at and completed_at<=a.due_at;
    if q.id is null then raise exception 'ATTEMPT_UNAVAILABLE'; end if;
    v_auto := round(q.score::numeric / jsonb_array_length(q.questions) * a.max_points)::integer;
  end if;
  insert into public.class_submissions(assignment_id,student_id,note,attempt_id,auto_points,points)
    values(a.id,auth.uid(),coalesce(p_note,''),p_attempt,v_auto,v_auto)
    on conflict(assignment_id,student_id) do update set note=excluded.note,attempt_id=excluded.attempt_id,
      auto_points=excluded.auto_points,points=excluded.points,feedback='',graded_at=null,submitted_at=now()
    where public.class_submissions.graded_at is null;
  if not found then raise exception 'ALREADY_GRADED'; end if;
end $$;

create or replace function public.list_class_quiz_attempts(p_assignment uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.class_assignments; v_result jsonb;
begin
  select * into a from public.class_assignments where id=p_assignment;
  if a.id is null or a.quiz_id is null or not public.classroom_student_active(a.class_id,auth.uid())
    then raise exception 'ACCESS_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'score',q.score,
    'total',jsonb_array_length(q.questions),'completed_at',q.completed_at) order by q.completed_at desc),'[]'::jsonb)
    into v_result from (select * from public.learning_quiz_attempts
      where user_id=auth.uid() and quiz_id=a.quiz_id and completed_at is not null
        and started_at>=a.created_at and completed_at<=a.due_at
      order by completed_at desc limit 20) q;
  return v_result;
end $$;

create or replace function public.list_class_submissions(p_assignment uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not exists(select 1 from public.class_assignments a join public.classrooms c on c.id=a.class_id
    where a.id=p_assignment and c.teacher_id=auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('student_id',s.student_id,'name',coalesce(p.display_name,'Học trò'),
    'note',s.note,'submitted_at',s.submitted_at,'auto_points',s.auto_points,'points',s.points,
    'feedback',s.feedback,'graded_at',s.graded_at) order by s.submitted_at),'[]'::jsonb)
    into v_result from public.class_submissions s left join public.profiles p on p.id=s.student_id
    where s.assignment_id=p_assignment;
  return v_result;
end $$;

create or replace function public.grade_class_submission(p_assignment uuid,p_student uuid,p_points integer,p_feedback text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_max integer;
begin
  select a.max_points into v_max from public.class_assignments a join public.classrooms c on c.id=a.class_id
    where a.id=p_assignment and c.teacher_id=auth.uid();
  if v_max is null then raise exception 'ACCESS_DENIED'; end if;
  if p_points is null or p_points<0 or p_points>v_max or length(coalesce(p_feedback,''))>4000 then raise exception 'INVALID_GRADE'; end if;
  update public.class_submissions set points=p_points,feedback=coalesce(p_feedback,''),graded_at=now()
    where assignment_id=p_assignment and student_id=p_student;
  if not found then raise exception 'SUBMISSION_UNAVAILABLE'; end if;
end $$;

create or replace function public.close_class_assignment(p_assignment uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.class_assignments a set closed_at=now() from public.classrooms c
    where a.id=p_assignment and c.id=a.class_id and c.teacher_id=auth.uid() and a.closed_at is null;
  if not found then raise exception 'ACCESS_DENIED'; end if;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'classroom_student_active(uuid,uuid)','list_teacher_student_links()','request_teacher_student(uuid)',
    'respond_teacher_student(uuid,boolean)','end_teacher_student(uuid,uuid)',
    'create_classroom(text,text)','list_classrooms()','invite_class_student(uuid,uuid)',
    'respond_class_invite(uuid,boolean)','remove_class_student(uuid,uuid)','list_class_members(uuid)',
    'create_class_assignment(uuid,text,text,timestamp with time zone,uuid,integer)',
    'list_class_assignments(uuid)','submit_class_assignment(uuid,text,uuid)',
    'list_class_quiz_attempts(uuid)',
    'list_class_submissions(uuid)','grade_class_submission(uuid,uuid,integer,text)',
    'close_class_assignment(uuid)'
  ] loop
    execute 'revoke all on function public.'||f||' from public,anon';
    execute 'grant execute on function public.'||f||' to authenticated';
  end loop;
end $$;
notify pgrst, 'reload schema';
