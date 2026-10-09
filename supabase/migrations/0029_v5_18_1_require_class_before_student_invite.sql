-- Apply after 0028. A teacher must create a class before inviting a connected user
-- to become their student. Keep the guard in the RPC for older clients as well.
create or replace function public.request_teacher_student(p_student uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  if not exists(select 1 from public.classrooms where teacher_id=auth.uid())
    then raise exception 'CLASS_REQUIRED'; end if;
  if not public.connection_is_active(p_student) then raise exception 'CONNECTION_REQUIRED'; end if;
  if (select count(*) from public.teacher_student_links where teacher_id=auth.uid() and created_at>now()-interval '1 day')>=20
    then raise exception 'REQUEST_RATE_LIMIT'; end if;
  insert into public.teacher_student_links(teacher_id,student_id) values(auth.uid(),p_student)
    on conflict(teacher_id,student_id) do update set status='pending',created_at=now(),responded_at=null
    where public.teacher_student_links.status='declined';
end $$;

revoke all on function public.request_teacher_student(uuid) from public,anon;
grant execute on function public.request_teacher_student(uuid) to authenticated;
