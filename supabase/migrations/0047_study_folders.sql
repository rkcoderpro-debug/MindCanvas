begin;

create table if not exists public.study_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null check (area in ('quiz','flashcard','lab')),
  parent_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  unique(id,user_id,area),
  foreign key(parent_id,user_id,area) references public.study_folders(id,user_id,area) on delete cascade
);
create index if not exists study_folders_owner_area_parent on public.study_folders(user_id,area,parent_id);
create table if not exists public.study_folder_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null check (area in ('quiz','flashcard','lab')),
  item_id uuid not null,
  folder_id uuid not null,
  primary key(user_id,area,item_id),
  foreign key(folder_id,user_id,area) references public.study_folders(id,user_id,area) on delete cascade
);
create index if not exists study_folder_items_folder on public.study_folder_items(folder_id);

alter table public.study_folders enable row level security;
alter table public.study_folder_items enable row level security;
drop policy if exists study_folders_owner_read on public.study_folders;
create policy study_folders_owner_read on public.study_folders for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists study_folder_items_owner_read on public.study_folder_items;
create policy study_folder_items_owner_read on public.study_folder_items for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.study_folders,public.study_folder_items from public,anon,authenticated;
grant select on public.study_folders,public.study_folder_items to authenticated;

alter table public.workspace_share_grants drop constraint if exists workspace_share_grants_kind_check;
alter table public.workspace_share_grants add constraint workspace_share_grants_kind_check
  check (kind in ('folder','file','canvas','quiz','flashcard','learning_folder'));
alter table public.workspace_share_grants drop constraint if exists workspace_share_friend_file_only;
alter table public.workspace_share_grants drop constraint if exists workspace_share_friend_resource;
alter table public.workspace_share_grants add constraint workspace_share_friend_resource check (
  recipient_id is null or (kind in ('file','folder','learning_folder') and email='' and role='viewer' and recipient_id<>owner_id));
alter table public.direct_messages add column if not exists workspace_folder_card boolean not null default false;
alter table public.direct_messages drop constraint if exists workspace_folder_card_token_check;
alter table public.direct_messages add constraint workspace_folder_card_token_check check (
  not workspace_folder_card or workspace_file_token is not null);

create or replace function public.study_folder_save(p_area text,p_id uuid,p_parent uuid,p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  saved uuid;
  folder_depth integer;
begin
  if actor is null or p_area is null or p_area not in ('quiz','flashcard','lab') then raise exception 'SHARE_FORBIDDEN'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'SHARE_INVALID'; end if;
  if p_id is not null then
    update public.study_folders set name=btrim(p_name)
      where id=p_id and user_id=actor and area=p_area returning id into saved;
    if saved is null then raise exception 'SHARE_FORBIDDEN'; end if;
    return saved;
  end if;
  if p_parent is not null then
    with recursive ancestors(id,parent_id,depth) as (
      select f.id,f.parent_id,1 from public.study_folders f where f.id=p_parent and f.user_id=actor and f.area=p_area
      union all
      select f.id,f.parent_id,a.depth+1 from public.study_folders f join ancestors a on a.parent_id=f.id
        where f.user_id=actor and f.area=p_area and a.depth<16
    ) select max(depth) into folder_depth from ancestors;
    if folder_depth is null then raise exception 'SHARE_FORBIDDEN'; end if;
    if folder_depth>=16 then raise exception 'SHARE_INVALID'; end if;
  end if;
  insert into public.study_folders (user_id,area,parent_id,name) values(actor,p_area,p_parent,btrim(p_name)) returning id into saved;
  return saved;
end $$;

create or replace function public.ws_share_friend_allowed(p_owner uuid,p_kind text,p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(public.learning_share_tier(p_owner)>=public.learning_required_tier(
    case when p_kind='learning_folder' then (select area from public.study_folders where id=p_id and user_id=p_owner)
    else 'document' end),false);
$$;


create or replace function public.ws_share_resource(p_kind text,p_id uuid)
returns table(owner_id uuid,parent_id uuid,canvas_id uuid,title text)
language sql stable security definer set search_path='' as $$
  select f.user_id,f.parent_id,null::uuid,f.name from public.folders f where p_kind='folder' and f.id=p_id
  union all
  select f.user_id,f.folder_id,f.canvas_id,f.name from public.workspace_files f where p_kind='file' and f.id=p_id and f.ready
    and (f.canvas_id is null or exists(select 1 from public.notes n cross join lateral jsonb_array_elements(n.content->'board'->'embeds') e
      where n.id=f.canvas_id and n.user_id=f.user_id and n.deleted_at is null and e->>'kind'='document' and e->>'id'=f.embed_id::text))
  union all
  select n.user_id,n.folder_id,null,n.title from public.notes n where p_kind='canvas' and n.id=p_id and n.deleted_at is null
  union all
  select q.user_id,null,null,q.title from public.quiz_tests q where p_kind='quiz' and q.id=p_id
  union all
  select d.user_id,d.folder_id,d.project_id,d.name from public.flashcard_decks d where p_kind='flashcard' and d.id=p_id
  union all
  select f.user_id,f.parent_id,null,f.name from public.study_folders f where p_kind='learning_folder' and f.id=p_id
  union all
  select l.user_id,null,null,l.title from public.lab_projects l where p_kind='lab' and l.id=p_id;
$$;

create or replace function public.ws_share_role(p_token text,p_actor uuid,p_proof text,p_kind text,p_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare g public.workspace_share_grants; target record; root record; folder uuid; allowed boolean;
begin
  select * into g from public.workspace_share_grants where token=p_token;
  if g.id is null then return null; end if;
  select * into root from public.ws_share_resource(g.kind,g.resource_id);
  if root.owner_id is distinct from g.owner_id then return null; end if;
  select * into target from public.ws_share_resource(p_kind,p_id);
  if target.owner_id is distinct from g.owner_id then return null; end if;

  allowed:=g.kind=p_kind and g.resource_id=p_id;
  if not allowed and g.kind='canvas' then
    allowed:=p_kind='file' and target.canvas_id is not distinct from g.resource_id;
  end if;
  if not allowed and g.kind='folder' and p_kind in ('folder','canvas','file','flashcard') then
    folder:=target.parent_id;
    -- Documents in a Canvas follow it when the Canvas moves.
    if p_kind='file' and target.canvas_id is not null then
      select n.folder_id into folder from public.notes n where n.id=target.canvas_id and n.user_id=g.owner_id and n.deleted_at is null;
    end if;
    with recursive ancestors(id,parent_id,depth) as (
      select f.id,f.parent_id,1 from public.folders f where f.id=folder and f.user_id=g.owner_id
      union all
      select f.id,f.parent_id,a.depth+1 from public.folders f join ancestors a on a.parent_id=f.id and f.user_id=g.owner_id where a.depth<16
    ) select exists(select 1 from ancestors where id=g.resource_id) into allowed;
  end if;
  if not allowed and g.kind='learning_folder' then
    if p_kind='learning_folder' then
      folder:=target.parent_id;
    elsif p_kind in ('quiz','flashcard','lab') then
      select i.folder_id into folder from public.study_folder_items i
        where i.user_id=g.owner_id and i.area=p_kind and i.item_id=p_id;
    else
      folder:=null;
    end if;
    with recursive ancestors(id,parent_id,depth) as (
      select f.id,f.parent_id,1 from public.study_folders f where f.id=folder and f.user_id=g.owner_id
      union all
      select f.id,f.parent_id,a.depth+1 from public.study_folders f join ancestors a on a.parent_id=f.id
        where f.user_id=g.owner_id and a.depth<16
    ) select exists(select 1 from ancestors where id=g.resource_id) into allowed;
  end if;
  if not allowed then return null; end if;
  if p_actor=g.owner_id then return 'owner'; end if;
  if g.recipient_id is not null then
    if p_actor=g.recipient_id and public.ws_share_file_friends_connected(g.owner_id,g.recipient_id)
      and public.ws_share_friend_allowed(g.owner_id,g.kind,g.resource_id) then return 'viewer'; end if;
    return null;
  end if;
  if g.kind='learning_folder' then
    if g.email='' then return 'viewer'; end if;
    return null;
  end if;
  if g.email='' then return case when g.role='editor' and p_actor is not null then 'editor' else 'viewer' end; end if;
  if exists(select 1 from auth.users u where u.id=p_actor and u.email_confirmed_at is not null and lower(u.email)=g.email) then return g.role; end if;
  if g.role='viewer' and p_proof is not null and exists(select 1 from public.workspace_share_proofs k
    where k.grant_id=g.id and k.hash=p_proof and k.expires_at>now()) then return 'viewer'; end if;
  return null;
end $$;

create or replace function public.ws_share_manage(p_actor uuid,p_kind text,p_id uuid,p_op text,p_email text default '',p_role text default 'viewer',p_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; target record; addr text:=lower(btrim(coalesce(p_email,''))); changed uuid;
begin
  select * into target from public.ws_share_resource(p_kind,p_id);
  if p_actor is null or target.owner_id is distinct from p_actor then raise exception 'SHARE_FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_kind||p_id::text,453));
  if p_kind='lab' then raise exception 'SHARE_INVALID'; end if;
  if p_op='set' then
    if p_kind='learning_folder' then
      if addr<>'' or p_role is distinct from 'viewer' then raise exception 'SHARE_INVALID'; end if;
    end if;
    if p_role is null or p_role not in ('viewer','editor') or p_token is null or (addr<>'' and length(addr)>254) then raise exception 'SHARE_INVALID'; end if;
    if addr<>'' and (select count(*) from public.workspace_share_grants where owner_id=p_actor and kind=p_kind and resource_id=p_id and email<>'' and recipient_id is null)>=100
      and not exists(select 1 from public.workspace_share_grants where owner_id=p_actor and kind=p_kind and resource_id=p_id and email=addr and recipient_id is null) then raise exception 'SHARE_RATE'; end if;
    insert into public.workspace_share_grants(owner_id,kind,resource_id,email,role,token)
      values(p_actor,p_kind,p_id,addr,p_role,p_token)
    on conflict(owner_id,kind,resource_id,email) where recipient_id is null do update set role=excluded.role where workspace_share_grants.role<>excluded.role returning id into changed;
    if changed is not null then
      delete from public.workspace_share_challenges where grant_id=changed;
      delete from public.workspace_share_proofs where grant_id=changed;
    end if;
  elsif p_op='remove' then
    delete from public.workspace_share_grants where owner_id=p_actor and kind=p_kind and resource_id=p_id and email=addr and recipient_id is null;
  elsif p_op<>'list' then raise exception 'SHARE_INVALID';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('email',g.email,'role',g.role,'token',g.token) order by g.email),'[]'::jsonb) into result
    from public.workspace_share_grants g where g.owner_id=p_actor and g.kind=p_kind and g.resource_id=p_id and g.recipient_id is null;
  return result;
end $$;

create or replace function public.ws_share_received(p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(out) order by out.created_at desc),'[]'::jsonb) from (
    select g.kind,g.role,g.token,r.title,g.created_at
    from public.workspace_share_grants g
    cross join lateral public.ws_share_resource(g.kind,g.resource_id) r
    where r.owner_id=g.owner_id and (
      (g.recipient_id=p_actor and public.ws_share_file_friends_connected(g.owner_id,p_actor)
        and public.ws_share_friend_allowed(g.owner_id,g.kind,g.resource_id))
      or (g.recipient_id is null and g.email<>'' and exists(
        select 1 from auth.users u where u.id=p_actor and u.email_confirmed_at is not null and lower(u.email)=g.email))
    )
    order by g.created_at desc limit 200
  ) out;
$$;

create or replace function public.ws_share_read(p_token text,p_actor uuid,p_proof text,p_kind text default null,p_id uuid default null,p_op text default 'view',p_payload jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.workspace_share_grants; k text; ident uuid; r text; title text; result jsonb; q public.quiz_tests; file_record public.workspace_files;
begin
  select * into g from public.workspace_share_grants where token=p_token;
  if g.id is null then raise exception 'SHARE_FORBIDDEN'; end if;
  k:=coalesce(p_kind,g.kind); ident:=coalesce(p_id,g.resource_id);
  r:=public.ws_share_role(p_token,p_actor,p_proof,k,ident);
  if r is null then
    if g.recipient_id is not null and p_actor is null and p_op='view' and p_kind is null and p_id is null
      and exists(select 1 from public.ws_share_resource(g.kind,g.resource_id) root where root.owner_id=g.owner_id)
      and public.ws_share_file_friends_connected(g.owner_id,g.recipient_id)
      and public.ws_share_friend_allowed(g.owner_id,g.kind,g.resource_id)
    then return jsonb_build_object('state','sign-in','audience','friend'); end if;
    if g.email<>'' and (p_kind is null and p_id is null)
      and exists(select 1 from public.ws_share_resource(g.kind,g.resource_id) root where root.owner_id=g.owner_id)
    then return jsonb_build_object('state',case when g.role='viewer' then 'verify' else 'sign-in' end); end if;
    raise exception 'SHARE_FORBIDDEN';
  end if;
  select x.title into title from public.ws_share_resource(k,ident) x;
  if p_op='asset' then
    if k<>'canvas' or coalesce(p_payload->>'digest','') !~ '^[a-f0-9]{64}$' then raise exception 'SHARE_FORBIDDEN'; end if;
    if not exists(select 1 from public.notes n where n.id=ident and n.content->>'version'='2' and (
      n.content#>>'{board,background,src}'='mindcanvas-asset:'||(p_payload->>'digest')
      or exists(select 1 from jsonb_array_elements(n.content#>'{board,media}') el where el->>'src'='mindcanvas-asset:'||(p_payload->>'digest'))
      or exists(select 1 from jsonb_array_elements(n.content#>'{board,embeds}') el where el->>'kind'='document' and el->>'url'='mindcanvas-asset:'||(p_payload->>'digest'))
    )) then raise exception 'SHARE_FORBIDDEN'; end if;
    return jsonb_build_object('ok',true);
  elsif p_op='upload' then
    if r not in ('owner','editor') or k not in ('file','folder') then raise exception 'SHARE_FORBIDDEN'; end if;
    return jsonb_build_object('owner',g.owner_id);
  elsif p_op='download' then
    if k<>'file' then raise exception 'SHARE_FORBIDDEN'; end if;
    select * into file_record from public.workspace_files where id=ident and ready;
    if file_record.id is null then raise exception 'SHARE_FORBIDDEN'; end if;
    return jsonb_build_object('owner',file_record.user_id,'object',coalesce(file_record.object_id,file_record.id),'title',file_record.name,'size',file_record.size_bytes);
  elsif p_op='submit' then
    if k<>'quiz' then raise exception 'SHARE_INVALID'; end if;
    select * into q from public.quiz_tests where id=ident;
    if q.updated_at::text is distinct from p_payload->>'revision' then raise exception 'SHARE_CONFLICT'; end if;
    if jsonb_typeof(p_payload->'answers') is distinct from 'array' or jsonb_array_length(p_payload->'answers')<>jsonb_array_length(q.questions) then raise exception 'SHARE_INVALID'; end if;
    return (select jsonb_build_object('score',count(*) filter(where item->'correctIndex'=p_payload->'answers'->((n-1)::integer)), 'total',count(*),
      'answers',jsonb_agg(jsonb_build_object('correct',item->'correctIndex','explanation',item->>'explanation') order by n))
      from jsonb_array_elements(q.questions) with ordinality qs(item,n));
  elsif p_op<>'view' then raise exception 'SHARE_INVALID';
  end if;

  if k='folder' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.kind,x.title),'[]'::jsonb) into result from (
      select 'folder' kind,d.id,d.name title from public.folders d where d.parent_id=ident and d.user_id=g.owner_id
      union all select 'file',a.id,a.name from public.workspace_files a where a.folder_id=ident and a.canvas_id is null and a.ready and a.user_id=g.owner_id
      union all select 'canvas',n.id,n.title from public.notes n where n.folder_id=ident and n.deleted_at is null and n.user_id=g.owner_id
      union all select 'flashcard',d.id,d.name from public.flashcard_decks d where d.folder_id=ident and d.user_id=g.owner_id
    ) x;
  elsif k='learning_folder' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.kind,x.title),'[]'::jsonb) into result from (
      select 'learning_folder' kind,f.id,f.name title from public.study_folders f
        where f.parent_id=ident and f.user_id=g.owner_id
      union all
      select i.area,i.item_id,child.title from public.study_folder_items i
        cross join lateral public.ws_share_resource(i.area,i.item_id) child
        where i.folder_id=ident and i.user_id=g.owner_id and child.owner_id=g.owner_id
    ) x;
  elsif k='lab' then
    select jsonb_build_object('html',l.program_html,'allowExternalResources',l.allow_external_resources,'viewerConfig',l.viewer_config)
      into result from public.lab_projects l where l.id=ident and l.user_id=g.owner_id;
  elsif k='canvas' then
    select jsonb_build_object('board',n.content->'board','revision',n.updated_at::text,'version',coalesce(n.content->'version','1'::jsonb),
      'files',(select coalesce(jsonb_agg(jsonb_build_object('kind','file','id',f.id,'title',f.name,'embed',f.embed_id) order by f.name),'[]'::jsonb)
        from public.workspace_files f where f.canvas_id=ident and f.user_id=g.owner_id and f.ready
          and exists(select 1 from jsonb_array_elements(n.content->'board'->'embeds') e where e->>'kind'='document' and e->>'id'=f.embed_id::text))) into result from public.notes n where n.id=ident;
  elsif k='quiz' then
    select * into q from public.quiz_tests where id=ident;
    select jsonb_build_object('description',q.description,'revision',q.updated_at::text,'questions',
      jsonb_agg((case when r in ('owner','editor') then jsonb_build_object('correctIndex',item->'correctIndex','explanation',item->>'explanation') else '{}'::jsonb end)
      || jsonb_build_object('id',item->>'id','prompt',item->>'prompt','options',item->'options') order by n))
    into result from jsonb_array_elements(q.questions) with ordinality qs(item,n);
  elsif k='flashcard' then
    select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'front',c.front,'back',c.back,'revision',c.updated_at::text) order by c.created_at,c.id),'[]'::jsonb)
      into result from public.flashcards c where c.deck_id=ident and c.user_id=g.owner_id;
  elsif k='file' then
    select jsonb_build_object('size',f.size_bytes,'revision',f.content_revision) into result from public.workspace_files f where f.id=ident;
  end if;
  return jsonb_build_object('state','ok','kind',k,'id',ident,'title',title,'role',r,'signInToEdit',p_actor is null and g.role='editor','data',result);
end $$;

create or replace function public.ws_share_folder_friend(p_kind text,p_folder uuid,p_op text,p_peer uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target record; share_token text;
begin
  if p_kind is null or p_kind not in ('folder','learning_folder') then raise exception 'SHARE_INVALID'; end if;
  select * into target from public.ws_share_resource(p_kind,p_folder);
  if actor is null or target.owner_id is distinct from actor then raise exception 'SHARE_FORBIDDEN'; end if;
  if p_op='send' then
    if p_peer is null or p_peer=actor then raise exception 'CONNECTION_REQUIRED'; end if;
    if not public.ws_share_friend_allowed(actor,p_kind,p_folder) then raise exception 'SHARE_NOT_ALLOWED'; end if;
    -- Serialize disconnect/block and share the same message-rate lock as normal chat.
    perform 1 from public.connections where user_a=least(actor,p_peer) and user_b=greatest(actor,p_peer) for key share;
    if not found or not public.ws_share_file_friends_connected(actor,p_peer) then raise exception 'CONNECTION_REQUIRED'; end if;
    perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
    if (select count(*) from public.direct_messages where sender_id=actor and created_at>now()-interval '1 minute')>=20 then raise exception 'MESSAGE_RATE_LIMIT'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_kind||p_folder::text,453));
  if p_op='send' then
    if (select count(*) from public.workspace_share_grants where owner_id=actor and kind=p_kind and resource_id=p_folder and recipient_id is not null)>=100
      and not exists(select 1 from public.workspace_share_grants where owner_id=actor and kind=p_kind and resource_id=p_folder and recipient_id=p_peer) then raise exception 'SHARE_RATE'; end if;
    insert into public.workspace_share_grants(owner_id,kind,resource_id,role,token,recipient_id)
      values(actor,p_kind,p_folder,'viewer',left(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),48),p_peer)
      on conflict(owner_id,kind,resource_id,recipient_id) where recipient_id is not null
      do update set created_at=now() returning token into share_token;
    insert into public.direct_messages(sender_id,recipient_id,resource_kind,resource_id,resource_title,workspace_file_token,workspace_folder_card)
      values(actor,p_peer,'document',p_folder,left(target.title,200),share_token,true);
  elsif p_op='remove' then
    delete from public.workspace_share_grants where owner_id=actor and kind=p_kind and resource_id=p_folder and recipient_id=p_peer;
  elsif p_op is distinct from 'list' then raise exception 'SHARE_INVALID';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',g.recipient_id,'display_name',nullif(p.display_name,'')) order by g.created_at desc),'[]'::jsonb)
    from public.workspace_share_grants g left join public.profiles p on p.id=g.recipient_id
    where g.owner_id=actor and g.kind=p_kind and g.resource_id=p_folder and g.recipient_id is not null);
end $$;


create or replace function public.study_folder_move(p_area text,p_item uuid,p_folder uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
begin
  if actor is null or p_area is null or p_area not in ('quiz','flashcard','lab') then raise exception 'SHARE_FORBIDDEN'; end if;
  if p_folder is not null and not exists(select 1 from public.study_folders where id=p_folder and user_id=actor and area=p_area) then
    raise exception 'SHARE_FORBIDDEN';
  end if;
  if not exists(select 1 from public.ws_share_resource(p_area,p_item) r where r.owner_id=actor) then return false; end if;
  if p_folder is null then
    delete from public.study_folder_items where user_id=actor and area=p_area and item_id=p_item;
  else
    insert into public.study_folder_items (user_id,area,item_id,folder_id) values(actor,p_area,p_item,p_folder)
      on conflict(user_id,area,item_id) do update set folder_id=excluded.folder_id;
  end if;
  return true;
end $$;

create or replace function public.study_folder_item_deleted()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.study_folder_items where user_id=old.user_id and area=TG_ARGV[0] and item_id=old.id;
  return old;
end $$;
drop trigger if exists study_folder_quiz_deleted on public.quiz_tests;
create trigger study_folder_quiz_deleted after delete on public.quiz_tests
  for each row execute function public.study_folder_item_deleted('quiz');
drop trigger if exists study_folder_flashcard_deleted on public.flashcard_decks;
create trigger study_folder_flashcard_deleted after delete on public.flashcard_decks
  for each row execute function public.study_folder_item_deleted('flashcard');
drop trigger if exists study_folder_lab_deleted on public.lab_projects;
create trigger study_folder_lab_deleted after delete on public.lab_projects
  for each row execute function public.study_folder_item_deleted('lab');

revoke all on function public.study_folder_save(text,uuid,uuid,text),public.study_folder_move(text,uuid,uuid),
  public.ws_share_folder_friend(text,uuid,text,uuid),public.ws_share_friend_allowed(uuid,text,uuid),
  public.study_folder_item_deleted() from public,anon,authenticated;
grant execute on function public.study_folder_save(text,uuid,uuid,text),public.study_folder_move(text,uuid,uuid),
  public.ws_share_folder_friend(text,uuid,text,uuid) to authenticated;

commit;
