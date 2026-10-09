-- Apply after 0030. Derive private activity from existing sources; store only read receipts.
create table if not exists public.activity_notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  source_id uuid not null,
  read_at timestamptz not null default now(),
  primary key(user_id,kind,source_id)
);
alter table public.activity_notification_reads enable row level security;
revoke all on public.activity_notification_reads from public,anon,authenticated;

create or replace function public.list_activity_notifications()
returns jsonb language sql stable security definer set search_path = '' as $$
  with events as (
    select 'message'::text kind,m.id source_id,m.sender_id actor_id,'Tin nhắn mới'::text title,
      case when m.resource_kind is null then left(m.body,120)
        else 'Đã chia sẻ '||case m.resource_kind when 'quiz' then 'Quiz' when 'flashcard' then 'Flashcard' when 'lab' then 'Lab' else 'tài liệu' end||coalesce(': '||m.resource_title,'') end preview,
      m.created_at,'connections'::text target,m.sender_id target_id
    from (select distinct on (sender_id) * from public.direct_messages
      where recipient_id=auth.uid() order by sender_id,created_at desc,id desc) m
    where public.connection_is_active(m.sender_id)
    union all
    select 'connection_invite',i.id,i.sender_id,'Lời mời kết nối',
      coalesce(nullif(p.display_name,''),'Một người dùng')||' muốn kết nối',i.created_at,'connections',null::uuid
    from public.connection_invitations i left join public.profiles p on p.id=i.sender_id
    where i.status='pending' and i.expires_at>now() and i.recipient_email=lower(auth.jwt()->>'email')
      and not exists(select 1 from public.connection_blocks b where
        (b.blocker_id=auth.uid() and b.blocked_id=i.sender_id) or (b.blocker_id=i.sender_id and b.blocked_id=auth.uid()))
    union all
    select 'learning_invite',i.id,i.owner_id,'Lời mời chia sẻ học liệu',
      case i.kind when 'quiz' then 'Quiz' when 'flashcard' then 'Flashcard' when 'document' then 'Tài liệu' else 'Lab' end||' được chia sẻ với bạn',
      i.created_at,'shared',i.resource_id
    from public.learning_share_invitations i
    where i.status='pending' and i.expires_at>now() and i.email=lower(auth.jwt()->>'email')
      and public.learning_resource_owner(i.kind,i.resource_id,i.owner_id)
      and public.learning_share_tier(i.owner_id)>=public.learning_required_tier(i.kind)
    union all
    select 'shared_learning',m.resource_id,m.owner_id,'Học liệu đã chia sẻ',
      case m.kind when 'quiz' then 'Quiz' when 'flashcard' then 'Flashcard' when 'document' then 'Tài liệu' else 'Lab' end||' đã có trong mục chia sẻ',
      m.created_at,'shared',m.resource_id
    from public.learning_share_members m
    where m.user_id=auth.uid() and m.invitation_id is null
      and public.learning_resource_owner(m.kind,m.resource_id,m.owner_id)
      and public.learning_share_tier(m.owner_id)>=public.learning_required_tier(m.kind)
      and not exists(select 1 from public.direct_messages dm where dm.recipient_id=auth.uid()
        and dm.sender_id=m.owner_id and dm.resource_kind=m.kind and dm.resource_id=m.resource_id)
    union all
    select 'class_invite',m.class_id,c.teacher_id,'Lời mời vào lớp',c.name,m.created_at,'classrooms',m.class_id
    from public.classroom_members m join public.classrooms c on c.id=m.class_id
    where m.student_id=auth.uid() and m.status='pending'
    union all
    select 'teacher_invite',l.teacher_id,l.teacher_id,'Lời mời học trò',
      coalesce(nullif(p.display_name,''),'Giáo viên')||' muốn kết nối học tập',l.created_at,'classrooms',null::uuid
    from public.teacher_student_links l left join public.profiles p on p.id=l.teacher_id
    where l.student_id=auth.uid() and l.status='pending'
    union all
    select 'assignment',a.id,c.teacher_id,'Bài tập mới',a.title,a.created_at,'classrooms',a.class_id
    from public.class_assignments a join public.classrooms c on c.id=a.class_id
    join public.classroom_members m on m.class_id=a.class_id and m.student_id=auth.uid()
    where m.status='active' and a.archived_at is null and a.created_at>=m.created_at
    union all
    select 'project_invite',i.id,i.inviter_id,'Canvas được chia sẻ','Lời mời cộng tác đang chờ',
      i.created_at,'workspace',i.project_id
    from public.project_invitations i where i.status='pending' and i.expires_at>now()
      and lower(i.email)=lower(auth.jwt()->>'email')
  )
  select coalesce(jsonb_agg(to_jsonb(n) order by n.read_at nulls first,n.created_at desc,n.source_id desc),'[]'::jsonb)
  from (select e.kind,e.source_id,e.actor_id,e.title,e.preview,e.created_at,e.target,e.target_id,
      coalesce(case when r.read_at>=e.created_at then r.read_at end,case when e.kind='message' then (
        select d.last_read_at from public.direct_message_reads d
        where d.user_id=auth.uid() and d.peer_id=e.actor_id and d.last_read_at>=e.created_at
      ) end) read_at
    from events e left join public.activity_notification_reads r
      on r.user_id=auth.uid() and r.kind=e.kind and r.source_id=e.source_id
    order by read_at nulls first,e.created_at desc,e.source_id desc limit 100) n
$$;

create or replace function public.mark_activity_notification_read(p_kind text,p_source uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from jsonb_array_elements(public.list_activity_notifications()) item
    where item->>'kind'=p_kind and item->>'source_id'=p_source::text) then raise exception 'ACCESS_DENIED'; end if;
  insert into public.activity_notification_reads(user_id,kind,source_id) values(auth.uid(),p_kind,p_source)
  on conflict(user_id,kind,source_id) do update set read_at=excluded.read_at;
end $$;

create or replace function public.accept_learning_invitation_by_id(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  select token_hash into v_hash from public.learning_share_invitations
    where id=p_id and status='pending' and expires_at>now() and email=lower(auth.jwt()->>'email');
  if v_hash is null then raise exception 'ACCESS_DENIED'; end if;
  return public.accept_learning_invitation(v_hash);
end $$;

create or replace function public.respond_connection_invitation_by_id(p_id uuid,p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  select token_hash into v_hash from public.connection_invitations
    where id=p_id and status='pending' and expires_at>now() and recipient_email=lower(auth.jwt()->>'email');
  if v_hash is null then raise exception 'ACCESS_DENIED'; end if;
  perform public.respond_connection_invitation(v_hash,p_action);
end $$;

revoke all on function public.list_activity_notifications(),
  public.mark_activity_notification_read(text,uuid),public.accept_learning_invitation_by_id(uuid),
  public.respond_connection_invitation_by_id(uuid,text) from public,anon;
grant execute on function public.list_activity_notifications(),
  public.mark_activity_notification_read(text,uuid),public.accept_learning_invitation_by_id(uuid),
  public.respond_connection_invitation_by_id(uuid,text) to authenticated;
