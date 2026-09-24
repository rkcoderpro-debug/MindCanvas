-- v5.12.0: recipients can save an independent, account-owned snapshot of
-- shared Quiz, Flashcard, Lab and Document resources.

alter table public.learning_share_invitations
  drop constraint if exists learning_share_invitations_kind_check;
alter table public.learning_share_invitations
  add constraint learning_share_invitations_kind_check
  check (kind in ('quiz','flashcard','lab','document'));
alter table public.learning_share_members
  drop constraint if exists learning_share_members_kind_check;
alter table public.learning_share_members
  add constraint learning_share_members_kind_check
  check (kind in ('quiz','flashcard','lab','document'));

create or replace function public.learning_required_tier(p_kind text)
returns integer language sql immutable as $$
  select case p_kind when 'quiz' then 1 when 'flashcard' then 1
    when 'lab' then 2 when 'document' then 2 else 100 end
$$;
revoke all on function public.learning_required_tier(text) from public, anon;
grant execute on function public.learning_required_tier(text) to authenticated;

create or replace function public.learning_resource_owner(p_kind text,p_id uuid,p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'quiz' then exists(select 1 from public.quiz_tests q where q.id=p_id and q.user_id=p_owner)
    when 'flashcard' then exists(select 1 from public.flashcard_decks d where d.id=p_id and d.user_id=p_owner)
    when 'lab' then exists(select 1 from public.lab_projects l where l.id=p_id and l.user_id=p_owner)
    when 'document' then exists(select 1 from public.documents d where d.id=p_id and d.user_id=p_owner)
    else false end
$$;
revoke all on function public.learning_resource_owner(text,uuid,uuid) from public,anon;
grant execute on function public.learning_resource_owner(text,uuid,uuid) to authenticated;

create or replace function public.create_learning_invitation(p_kind text,p_id uuid,p_email text,p_hash text,p_days integer default 7)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(trim(p_email));
begin
  if auth.uid() is null or not public.learning_resource_owner(p_kind,p_id,auth.uid()) then raise exception 'Owner access required'; end if;
  if public.learning_share_tier(auth.uid()) < public.learning_required_tier(p_kind) then raise exception 'Upgrade your plan to share this material'; end if;
  if p_kind not in ('quiz','flashcard','lab','document') or p_days not between 1 and 30
    or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation'; end if;
  if v_email = lower(auth.jwt()->>'email') then raise exception 'Cannot invite yourself'; end if;
  insert into public.learning_share_invitations(kind,resource_id,owner_id,email,token_hash,expires_at)
    values (p_kind,p_id,auth.uid(),v_email,p_hash,now()+make_interval(days=>p_days)) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.create_learning_invitation(text,uuid,text,text,integer) from public,anon;
grant execute on function public.create_learning_invitation(text,uuid,text,text,integer) to authenticated;

-- A saved copy has no FK to its source: it remains owned by the recipient if
-- the sender revokes access or deletes the original.
create table if not exists public.learning_saved_copies (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('quiz','flashcard','lab','document')),
  source_resource_id uuid not null,
  owner_id uuid not null,
  copy_resource_id uuid not null,
  source_title text not null,
  owner_name text not null,
  saved_at timestamptz not null default now(),
  primary key(user_id,kind,owner_id,source_resource_id),
  unique(user_id,kind,copy_resource_id)
);
create index if not exists learning_saved_copies_user on public.learning_saved_copies(user_id,kind,saved_at desc);
alter table public.learning_saved_copies enable row level security;
drop policy if exists learning_saved_copies_read on public.learning_saved_copies;
create policy learning_saved_copies_read on public.learning_saved_copies
  for select to authenticated using (user_id=auth.uid());
grant select on public.learning_saved_copies to authenticated;

-- Deleting a saved item removes only its provenance marker, which allows the
-- learner to save it again later. Source deletion never removes a recipient's
-- copy because source_resource_id intentionally has no FK.
create or replace function public.clear_learning_saved_copy_marker()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind text;
begin
  v_kind := case tg_table_name when 'quiz_tests' then 'quiz'
    when 'flashcard_decks' then 'flashcard' when 'lab_projects' then 'lab'
    when 'documents' then 'document' else null end;
  if v_kind is not null then
    delete from public.learning_saved_copies c
      where c.user_id=old.user_id and c.kind=v_kind and c.copy_resource_id=old.id;
  end if;
  return old;
end $$;
revoke all on function public.clear_learning_saved_copy_marker() from public,anon;
drop trigger if exists learning_saved_copy_cleanup_quiz on public.quiz_tests;
create trigger learning_saved_copy_cleanup_quiz after delete on public.quiz_tests
  for each row execute function public.clear_learning_saved_copy_marker();
drop trigger if exists learning_saved_copy_cleanup_deck on public.flashcard_decks;
create trigger learning_saved_copy_cleanup_deck after delete on public.flashcard_decks
  for each row execute function public.clear_learning_saved_copy_marker();
drop trigger if exists learning_saved_copy_cleanup_lab on public.lab_projects;
create trigger learning_saved_copy_cleanup_lab after delete on public.lab_projects
  for each row execute function public.clear_learning_saved_copy_marker();
drop trigger if exists learning_saved_copy_cleanup_document on public.documents;
create trigger learning_saved_copy_cleanup_document after delete on public.documents
  for each row execute function public.clear_learning_saved_copy_marker();

create or replace function public.get_saved_learning_copy(p_kind text,p_source_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select c.copy_resource_id from public.learning_saved_copies c
  where c.user_id=auth.uid() and c.kind=p_kind and c.source_resource_id=p_source_id
  limit 1
$$;
revoke all on function public.get_saved_learning_copy(text,uuid) from public,anon;
grant execute on function public.get_saved_learning_copy(text,uuid) to authenticated;

create or replace function public.list_my_learning_copy_sources()
returns table(kind text,copy_id uuid,source_id uuid,source_title text,owner_name text,saved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.kind,c.copy_resource_id,c.source_resource_id,c.source_title,c.owner_name,c.saved_at
  from public.learning_saved_copies c where c.user_id=auth.uid()
$$;
revoke all on function public.list_my_learning_copy_sources() from public,anon;
grant execute on function public.list_my_learning_copy_sources() to authenticated;

-- Quiz copies retain their answer keys because they are now owned by the
-- recipient. The shared read flow remains RPC-only and continues stripping
-- keys until submission.
create or replace function public.save_learning_copy(p_kind text,p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_copy uuid := gen_random_uuid();
  v_existing uuid;
  v_title text;
  v_owner uuid;
  v_owner_name text;
  v_deck public.flashcard_decks;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind not in ('quiz','flashcard','lab') then raise exception 'INVALID_RESOURCE_KIND'; end if;
  if not public.learning_share_allowed(p_kind,p_id) then raise exception 'ACCESS_REVOKED'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text),hashtext(p_kind||':'||p_id::text));
  select c.copy_resource_id into v_existing from public.learning_saved_copies c
    where c.user_id=auth.uid() and c.kind=p_kind and c.source_resource_id=p_id;
  if v_existing is not null then return v_existing; end if;

  select m.owner_id,coalesce(p.display_name,'Người chia sẻ') into v_owner,v_owner_name
    from public.learning_share_members m left join public.profiles p on p.id=m.owner_id
    where m.kind=p_kind and m.resource_id=p_id and m.user_id=auth.uid();
  if v_owner is null then raise exception 'ACCESS_REVOKED'; end if;

  if p_kind='quiz' then
    insert into public.quiz_tests(id,user_id,title,description,questions,source_document_id,created_at,updated_at)
      select v_copy,auth.uid(),q.title,q.description,q.questions,null,now(),now()
      from public.quiz_tests q where q.id=p_id and q.user_id=v_owner returning title into v_title;
  elsif p_kind='flashcard' then
    select * into v_deck from public.flashcard_decks d where d.id=p_id and d.user_id=v_owner;
    if v_deck.id is null then raise exception 'RESOURCE_REMOVED'; end if;
    v_title := v_deck.name;
    insert into public.flashcard_decks(id,user_id,name,project_id,folder_id,created_at,updated_at)
      values(v_copy,auth.uid(),v_deck.name,null,null,now(),now());
    insert into public.flashcards(id,deck_id,user_id,project_id,front,back,source_page,due_at,interval_days,ease,repetitions,lapses,created_at,updated_at,content_version)
      select gen_random_uuid(),v_copy,auth.uid(),null,c.front,c.back,c.source_page,now(),0,2.50,0,0,now(),now(),coalesce(c.content_version,1)
      from public.flashcards c where c.deck_id=p_id and c.user_id=v_owner order by c.created_at;
  else
    insert into public.lab_projects(id,user_id,title,subject,learner_level,program_html,content_version,created_at,updated_at)
      select v_copy,auth.uid(),l.title,l.subject,l.learner_level,l.program_html,coalesce(l.content_version,1),now(),now()
      from public.lab_projects l where l.id=p_id and l.user_id=v_owner returning title into v_title;
  end if;
  if v_title is null then raise exception 'RESOURCE_REMOVED'; end if;
  insert into public.learning_saved_copies(user_id,kind,source_resource_id,owner_id,copy_resource_id,source_title,owner_name)
    values(auth.uid(),p_kind,p_id,v_owner,v_copy,v_title,v_owner_name);
  return v_copy;
end $$;
revoke all on function public.save_learning_copy(text,uuid) from public,anon;
grant execute on function public.save_learning_copy(text,uuid) to authenticated;

-- This helper is called by Storage's SELECT policy. Its definer context can
-- safely resolve a shared document row without granting table-wide document
-- reads to recipients.
create or replace function public.learning_shared_document_path_allowed(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.documents d
    join public.learning_share_members m on m.kind='document' and m.resource_id=d.id and m.owner_id=d.user_id
    where d.file_path=p_path and m.user_id=auth.uid()
      and public.learning_share_allowed('document',d.id)
  )
$$;
revoke all on function public.learning_shared_document_path_allowed(text) from public,anon;
grant execute on function public.learning_shared_document_path_allowed(text) to authenticated;
drop policy if exists "document objects read by learning shares" on storage.objects;
create policy "document objects read by learning shares" on storage.objects for select to authenticated
  using (bucket_id='documents' and public.learning_shared_document_path_allowed(name));

create or replace function public.get_learning_shared_content(p_kind text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or p_kind not in ('quiz','flashcard','lab','document')
    or not public.learning_share_allowed(p_kind,p_id) then raise exception 'ACCESS_REVOKED'; end if;
  if p_kind='quiz' then
    select jsonb_build_object('id',q.id,'title',q.title,'content_version',q.content_version,'updated_at',q.updated_at)
      into result from public.quiz_tests q where q.id=p_id;
  elsif p_kind='flashcard' then
    select jsonb_build_object('id',d.id,'name',d.name,'content_version',coalesce((select max(c.content_version) from public.flashcards c where c.deck_id=d.id),1),'updated_at',d.updated_at)
      into result from public.flashcard_decks d where d.id=p_id;
  elsif p_kind='lab' then
    select jsonb_build_object('id',l.id,'title',l.title,'subject',l.subject,'learner_level',l.learner_level,'program_html',l.program_html,'content_version',l.content_version,'updated_at',l.updated_at)
      into result from public.lab_projects l where l.id=p_id;
  else
    select jsonb_build_object('id',d.id,'title',d.file_name,'file_name',d.file_name,'file_path',d.file_path,
      'file_size_bytes',d.file_size_bytes,'page_count',d.page_count,
      'updated_at',d.created_at)
      into result from public.documents d where d.id=p_id;
  end if;
  if result is null then raise exception 'RESOURCE_REMOVED'; end if;
  return result;
end $$;
revoke all on function public.get_learning_shared_content(text,uuid) from public,anon;
grant execute on function public.get_learning_shared_content(text,uuid) to authenticated;

-- Finalize a Storage copy atomically with the recipient-owned documents row
-- and idempotency marker. The client removes the copied object if this fails.
create or replace function public.save_shared_document_copy(p_source_id uuid,p_copy_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_source public.documents;
  v_owner uuid;
  v_owner_name text;
  v_existing uuid;
  v_extension text;
  v_target_path text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text),hashtext('document:'||p_source_id::text));
  select c.copy_resource_id into v_existing from public.learning_saved_copies c
    where c.user_id=auth.uid() and c.kind='document' and c.source_resource_id=p_source_id;
  if v_existing is not null then return jsonb_build_object('copy_id',v_existing,'already_saved',true); end if;
  if not public.learning_share_allowed('document',p_source_id) then raise exception 'ACCESS_REVOKED'; end if;
  select d.* into v_source from public.documents d where d.id=p_source_id;
  if v_source.id is null then raise exception 'RESOURCE_REMOVED'; end if;
  select m.owner_id,coalesce(p.display_name,'Người chia sẻ') into v_owner,v_owner_name
    from public.learning_share_members m left join public.profiles p on p.id=m.owner_id
    where m.kind='document' and m.resource_id=p_source_id and m.user_id=auth.uid();
  if v_owner is null or v_source.user_id<>v_owner then raise exception 'ACCESS_REVOKED'; end if;
  if p_copy_id is null or exists(select 1 from public.documents d where d.id=p_copy_id) then raise exception 'INVALID_COPY_ID'; end if;
  v_extension := lower(regexp_replace(v_source.file_path,'^.*\.',''));
  if v_extension !~ '^[a-z0-9]{1,8}$' then v_extension := 'bin'; end if;
  v_target_path := auth.uid()::text||'/'||p_copy_id::text||'.'||v_extension;
  if not exists(select 1 from storage.objects o where o.bucket_id='documents' and o.name=v_target_path) then
    raise exception 'DOCUMENT_COPY_NOT_FOUND';
  end if;
  insert into public.documents(id,user_id,note_id,file_path,file_name,extracted_text,page_count,file_size_bytes)
    values(p_copy_id,auth.uid(),null,v_target_path,v_source.file_name,v_source.extracted_text,v_source.page_count,v_source.file_size_bytes);
  insert into public.learning_saved_copies(user_id,kind,source_resource_id,owner_id,copy_resource_id,source_title,owner_name)
    values(auth.uid(),'document',p_source_id,v_owner,p_copy_id,v_source.file_name,v_owner_name);
  return jsonb_build_object('copy_id',p_copy_id,'already_saved',false);
end $$;
revoke all on function public.save_shared_document_copy(uuid,uuid) from public,anon;
grant execute on function public.save_shared_document_copy(uuid,uuid) to authenticated;

create or replace function public.list_learning_shares()
returns table(kind text,resource_id uuid,owner_name text,title text,updated_at timestamptz,status text)
language sql stable security definer set search_path = '' as $$
  select m.kind,m.resource_id,coalesce(p.display_name,'Người chia sẻ')::text,
    case m.kind when 'quiz' then (select q.title from public.quiz_tests q where q.id=m.resource_id)
      when 'flashcard' then (select d.name from public.flashcard_decks d where d.id=m.resource_id)
      when 'lab' then (select l.title from public.lab_projects l where l.id=m.resource_id)
      else (select d.file_name from public.documents d where d.id=m.resource_id) end,
    case m.kind when 'quiz' then (select q.updated_at from public.quiz_tests q where q.id=m.resource_id)
      when 'flashcard' then (select d.updated_at from public.flashcard_decks d where d.id=m.resource_id)
      when 'lab' then (select l.updated_at from public.lab_projects l where l.id=m.resource_id)
      else (select d.created_at from public.documents d where d.id=m.resource_id) end,
    case when not public.learning_resource_owner(m.kind,m.resource_id,m.owner_id) then 'removed'
      when public.learning_share_tier(m.owner_id) < public.learning_required_tier(m.kind) then 'paused'
      else 'active' end::text
  from public.learning_share_members m left join public.profiles p on p.id=m.owner_id
  where m.user_id=auth.uid()
$$;
revoke all on function public.list_learning_shares() from public,anon;
grant execute on function public.list_learning_shares() to authenticated;

notify pgrst, 'reload schema';
