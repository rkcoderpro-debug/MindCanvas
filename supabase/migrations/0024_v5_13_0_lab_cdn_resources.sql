-- v5.13.0: opt-in allowlisted CDN resources for Lab HTML.
-- External libraries are loaded only by the client-side sandbox CSP. Lab
-- connections (including Gemini/API calls) remain blocked by connect-src none.

alter table public.lab_projects
  add column if not exists allow_external_resources boolean not null default false;

create or replace function public.learning_bump_lab_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.program_html is distinct from new.program_html
    or old.title is distinct from new.title
    or old.allow_external_resources is distinct from new.allow_external_resources then
    new.content_version := old.content_version + 1;
  end if;
  return new;
end $$;

-- Keep the sender's resource consent with a saved recipient-owned snapshot.
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
    insert into public.lab_projects(id,user_id,title,subject,learner_level,program_html,allow_external_resources,content_version,created_at,updated_at)
      select v_copy,auth.uid(),l.title,l.subject,l.learner_level,l.program_html,l.allow_external_resources,coalesce(l.content_version,1),now(),now()
      from public.lab_projects l where l.id=p_id and l.user_id=v_owner returning title into v_title;
  end if;
  if v_title is null then raise exception 'RESOURCE_REMOVED'; end if;
  insert into public.learning_saved_copies(user_id,kind,source_resource_id,owner_id,copy_resource_id,source_title,owner_name)
    values(auth.uid(),p_kind,p_id,v_owner,v_copy,v_title,v_owner_name);
  return v_copy;
end $$;
revoke all on function public.save_learning_copy(text,uuid) from public,anon;
grant execute on function public.save_learning_copy(text,uuid) to authenticated;

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
    select jsonb_build_object('id',l.id,'title',l.title,'subject',l.subject,'learner_level',l.learner_level,
      'program_html',l.program_html,'allow_external_resources',l.allow_external_resources,
      'content_version',l.content_version,'updated_at',l.updated_at)
      into result from public.lab_projects l where l.id=p_id;
  else
    select jsonb_build_object('id',d.id,'title',d.file_name,'file_name',d.file_name,'file_path',d.file_path,
      'file_size_bytes',d.file_size_bytes,'page_count',d.page_count,'updated_at',d.created_at)
      into result from public.documents d where d.id=p_id;
  end if;
  if result is null then raise exception 'RESOURCE_REMOVED'; end if;
  return result;
end $$;
revoke all on function public.get_learning_shared_content(text,uuid) from public,anon;
grant execute on function public.get_learning_shared_content(text,uuid) to authenticated;
