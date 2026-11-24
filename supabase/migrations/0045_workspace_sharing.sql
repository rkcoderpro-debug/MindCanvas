begin;

alter table public.workspace_files add column if not exists object_id uuid;
alter table public.workspace_files add column if not exists canvas_id uuid references public.notes(id) on delete set null;
alter table public.workspace_files add column if not exists embed_id text;
alter table public.workspace_files add column if not exists content_revision uuid not null default gen_random_uuid();
create unique index if not exists workspace_files_canvas_embed on public.workspace_files(canvas_id,embed_id) where canvas_id is not null;

create table if not exists public.workspace_share_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('folder','file','canvas','quiz','flashcard')),
  resource_id uuid not null,
  email text not null default '',
  role text not null check (role in ('viewer','editor')),
  token text not null unique check (token ~ '^[a-f0-9]{48}$'),
  created_at timestamptz not null default now(),
  unique(owner_id,kind,resource_id,email)
);
create index if not exists workspace_share_grants_email on public.workspace_share_grants(email) where email <> '';
create table if not exists public.workspace_share_challenges (
  grant_id uuid primary key references public.workspace_share_grants(id) on delete cascade,
  hash text not null,
  issued_at timestamptz not null default now(),
  attempts integer not null default 0
);
create table if not exists public.workspace_share_proofs (
  grant_id uuid not null references public.workspace_share_grants(id) on delete cascade,
  hash text not null,
  expires_at timestamptz not null,
  primary key(grant_id,hash)
);
create table if not exists public.workspace_share_mail_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  attempts int not null,
  primary key(user_id,day)
);
alter table public.workspace_share_grants enable row level security;
alter table public.workspace_share_challenges enable row level security;
alter table public.workspace_share_proofs enable row level security;
alter table public.workspace_share_mail_limits enable row level security;
revoke all on public.workspace_share_grants,public.workspace_share_challenges,public.workspace_share_proofs,public.workspace_share_mail_limits from public,anon,authenticated;

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
  select d.user_id,d.folder_id,d.project_id,d.name from public.flashcard_decks d where p_kind='flashcard' and d.id=p_id;
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
  if not allowed then return null; end if;
  if p_actor=g.owner_id then return 'owner'; end if;
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
  if p_op='set' then
    if p_role is null or p_role not in ('viewer','editor') or p_token is null or (addr<>'' and length(addr)>254) then raise exception 'SHARE_INVALID'; end if;
    if addr<>'' and (select count(*) from public.workspace_share_grants where owner_id=p_actor and kind=p_kind and resource_id=p_id and email<>'')>=100
      and not exists(select 1 from public.workspace_share_grants where owner_id=p_actor and kind=p_kind and resource_id=p_id and email=addr) then raise exception 'SHARE_RATE'; end if;
    insert into public.workspace_share_grants(owner_id,kind,resource_id,email,role,token)
      values(p_actor,p_kind,p_id,addr,p_role,p_token)
    on conflict(owner_id,kind,resource_id,email) do update set role=excluded.role where workspace_share_grants.role<>excluded.role returning id into changed;
    if changed is not null then
      delete from public.workspace_share_challenges where grant_id=changed;
      delete from public.workspace_share_proofs where grant_id=changed;
    end if;
  elsif p_op='remove' then
    delete from public.workspace_share_grants where owner_id=p_actor and kind=p_kind and resource_id=p_id and email=addr;
  elsif p_op<>'list' then raise exception 'SHARE_INVALID';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('email',g.email,'role',g.role,'token',g.token) order by g.email),'[]'::jsonb) into result
    from public.workspace_share_grants g where g.owner_id=p_actor and g.kind=p_kind and g.resource_id=p_id;
  return result;
end $$;

create or replace function public.ws_share_mail(p_token text,p_actor uuid,p_op text,p_code text default null,p_proof text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.workspace_share_grants; check_row public.workspace_share_challenges; quota int; target record;
begin
  select * into g from public.workspace_share_grants where token=p_token for update;
  if g.id is null or g.email='' then raise exception 'SHARE_FORBIDDEN'; end if;
  select * into target from public.ws_share_resource(g.kind,g.resource_id);
  if target.owner_id is distinct from g.owner_id then raise exception 'SHARE_FORBIDDEN'; end if;
  if p_op='invite' then
    if p_actor is distinct from g.owner_id then raise exception 'SHARE_FORBIDDEN'; end if;
  elsif p_op='challenge' then
    if g.role<>'viewer' or p_code is null then raise exception 'SHARE_FORBIDDEN'; end if;
    insert into public.workspace_share_challenges(grant_id,hash) values(g.id,p_code)
      on conflict(grant_id) do update set hash=excluded.hash,issued_at=now(),attempts=0
      where workspace_share_challenges.issued_at<=now()-interval '60 seconds' returning attempts into quota;
    if quota is null then raise exception 'SHARE_RATE'; end if;
  elsif p_op='verify' then
    if g.role<>'viewer' or p_code is null or p_proof is null then return '{"ok":false}'; end if;
    update public.workspace_share_challenges set attempts=attempts+1 where grant_id=g.id
      and attempts<6 and issued_at>now()-interval '10 minutes' returning * into check_row;
    if check_row.grant_id is null or check_row.hash is distinct from p_code then return '{"ok":false}'; end if;
    delete from public.workspace_share_challenges where grant_id=g.id;
    delete from public.workspace_share_proofs where grant_id=g.id and expires_at<=now();
    insert into public.workspace_share_proofs(grant_id,hash,expires_at) values(g.id,p_proof,now()+interval '8 hours');
    return '{"ok":true}';
  else raise exception 'SHARE_INVALID';
  end if;
  quota:=null;
  insert into public.workspace_share_mail_limits(user_id,day,attempts) values(g.owner_id,current_date,1)
  on conflict(user_id,day) do update set attempts=workspace_share_mail_limits.attempts+1
    where workspace_share_mail_limits.attempts<60 returning attempts into quota;
  if quota is null then raise exception 'SHARE_RATE'; end if;
  delete from public.workspace_share_mail_limits where user_id=g.owner_id and day<current_date-7;
  return jsonb_build_object('email',g.email,'role',g.role,'title',target.title);
end $$;

create or replace function public.ws_share_received(p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(out) order by out.created_at desc),'[]'::jsonb) from (
    select g.kind,g.role,g.token,r.title,g.created_at
    from auth.users u join public.workspace_share_grants g on g.email=lower(u.email) and g.email<>''
    cross join lateral public.ws_share_resource(g.kind,g.resource_id) r
    where u.id=p_actor and u.email_confirmed_at is not null and g.owner_id=r.owner_id
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

create or replace function public.ws_share_write(p_token text,p_actor uuid,p_kind text,p_id uuid,p_op text,p jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.workspace_share_grants; r text; target record; f public.workspace_files; staged uuid; orig uuid; new_questions jsonb;
begin
  if p_actor is null then raise exception 'SHARE_FORBIDDEN'; end if;
  if p_op='attach' then
    select * into target from public.ws_share_resource('canvas',p_id);
    if p_kind<>'canvas' or target.owner_id is distinct from p_actor then raise exception 'SHARE_FORBIDDEN'; end if;
    g.owner_id:=p_actor;
    if not exists(select 1 from public.notes n cross join lateral jsonb_array_elements(n.content->'board'->'embeds') e
      where n.id=p_id and n.user_id=p_actor and n.deleted_at is null and e->>'kind'='document' and e->>'id'=p->>'embed') then raise exception 'SHARE_CONFLICT'; end if;
  else
    select * into g from public.workspace_share_grants where token=p_token for share;
    -- Check after locking the resource: a concurrent move must not carry
    -- an edit through using the resource's former folder permissions.
    if p_kind='file' then perform 1 from public.workspace_files where id=p_id for update;
    elsif p_kind='folder' then perform 1 from public.folders where id=p_id for update;
    elsif p_kind='canvas' then perform 1 from public.notes where id=p_id for update;
    elsif p_kind='quiz' then perform 1 from public.quiz_tests where id=p_id for update;
    elsif p_kind='flashcard' then perform 1 from public.flashcard_decks where id=p_id for update; end if;
    r:=public.ws_share_role(p_token,p_actor,null,p_kind,p_id);
    if r is null or r not in ('owner','editor') then raise exception 'SHARE_FORBIDDEN'; end if;
  end if;
  if p_op in ('attach','replace','add-file') then
    staged:=(p->>'object')::uuid;
    if not exists(select 1 from storage.objects o where o.bucket_id='workspace-files' and o.name=g.owner_id::text||'/'||staged::text and o.metadata->>'size'=p->>'size') then raise exception 'SHARE_INVALID'; end if;
    if p_op='replace' and p_kind='file' then
      select * into f from public.workspace_files where id=p_id and ready and user_id=g.owner_id for update;
      if f.id is null or f.content_revision::text is distinct from p->>'revision' then raise exception 'SHARE_CONFLICT'; end if;
      orig:=coalesce(f.object_id,f.id);
      update public.workspace_files set size_bytes=(p->>'size')::bigint,object_id=staged,content_revision=gen_random_uuid()
        where id=f.id and user_id=g.owner_id;
    elsif p_op='add-file' and p_kind='folder' then
      insert into public.workspace_files(id,user_id,folder_id,name,size_bytes,ready) values(staged,g.owner_id,p_id,p->>'name',(p->>'size')::bigint,true);
    elsif p_op='attach' then
      perform pg_advisory_xact_lock(hashtextextended(p_id::text||(p->>'embed'),449));
      select * into f from public.workspace_files where canvas_id=p_id and embed_id=p->>'embed' and user_id=g.owner_id for update;
      if f.id is not null then
        orig:=coalesce(f.object_id,f.id);
        update public.workspace_files set size_bytes=(p->>'size')::bigint,object_id=staged,name=p->>'name',content_revision=gen_random_uuid() where id=f.id;
        return jsonb_build_object('id',f.id,'old',orig);
      end if;
      insert into public.workspace_files(id,user_id,canvas_id,embed_id,name,size_bytes,ready)
        values(staged,g.owner_id,p_id,p->>'embed',p->>'name',(p->>'size')::bigint,true);
    else raise exception 'SHARE_INVALID';
    end if;
    return jsonb_build_object('id',case when p_op='replace' then p_id else staged end,'old',orig);
  elsif p_op='mkdir' and p_kind='folder' then
    insert into public.folders(user_id,parent_id,name) values(g.owner_id,p_id,left(btrim(p->>'title'),80));
  elsif p_op='rename' and p_kind='folder' then
    update public.folders set name=left(btrim(p->>'title'),80) where id=p_id and user_id=g.owner_id;
  elsif p_op='rename' and p_kind='file' then
    update public.workspace_files set name=p->>'title' where id=p_id and user_id=g.owner_id and ready;
  elsif p_op='rename' and p_kind='flashcard' then
    update public.flashcard_decks set name=p->>'title',updated_at=clock_timestamp() where id=p_id and user_id=g.owner_id;
  elsif p_op='card' and p_kind='flashcard' then
    if p->>'id' is null then
      insert into public.flashcards(deck_id,user_id,front,back) values(p_id,g.owner_id,p->>'front',p->>'back');
    else
      update public.flashcards set front=p->>'front',back=p->>'back',updated_at=clock_timestamp()
        where id=(p->>'id')::uuid and deck_id=p_id and user_id=g.owner_id and updated_at::text=p->>'revision';
      if not found then raise exception 'SHARE_CONFLICT'; end if;
    end if;
    update public.flashcard_decks set updated_at=clock_timestamp() where id=p_id and user_id=g.owner_id;
  elsif p_op='quiz' and p_kind='quiz' then
    new_questions:=p->'questions';
    if jsonb_typeof(new_questions) is distinct from 'array' or jsonb_array_length(new_questions) not between 1 and 100 then raise exception 'SHARE_INVALID'; end if;
    if exists(select 1 from jsonb_array_elements(new_questions) item where item->>'prompt' is null or length(btrim(item->>'prompt'))=0
      or coalesce(jsonb_typeof(item->'options'),'')<>'array' or coalesce(item->>'correctIndex','') !~ '^[0-3]$') then raise exception 'SHARE_INVALID'; end if;
    if exists(select 1 from jsonb_array_elements(new_questions) item where jsonb_array_length(item->'options')<>4
      or exists(select 1 from jsonb_array_elements(item->'options') option where jsonb_typeof(option)<>'string' or length(btrim(option#>>'{}'))=0)) then raise exception 'SHARE_INVALID'; end if;
    if (select count(distinct e->>'id') from jsonb_array_elements(new_questions) e)<>jsonb_array_length(new_questions) then raise exception 'SHARE_INVALID'; end if;
    update public.quiz_tests q set title=p->>'title',description=coalesce(p->>'description',''),questions=(
      select jsonb_agg(coalesce((select jsonb_strip_nulls(jsonb_build_object('sourcePage',old->'sourcePage','topic',old->'topic'))
        from jsonb_array_elements(q.questions) old where old->>'id'=item->>'id' limit 1),'{}'::jsonb)||item order by n)
      from jsonb_array_elements(new_questions) with ordinality items(item,n)),updated_at=clock_timestamp()
      where id=p_id and user_id=g.owner_id and updated_at::text=p->>'revision';
  elsif p_op='canvas' and p_kind='canvas' then
    if jsonb_typeof(p->'board') is distinct from 'object' or p->'board'->>'id' is distinct from p_id::text then raise exception 'SHARE_INVALID'; end if;
    update public.notes set title=p->'board'->>'title',
      content=jsonb_set(content,'{board}',((p->'board')-'media'-'embeds'-'background'-'sourceDocuments')
        || jsonb_strip_nulls(jsonb_build_object('media',coalesce(content#>'{board,media}','[]'::jsonb),
           'embeds',coalesce(content#>'{board,embeds}','[]'::jsonb),'background',content#>'{board,background}',
           'sourceDocuments',content#>'{board,sourceDocuments}'))),updated_at=clock_timestamp(),revision=revision+1,thumbnail=null
      where id=p_id and user_id=g.owner_id and deleted_at is null and updated_at::text=p->>'revision';
  else raise exception 'SHARE_INVALID';
  end if;
  if not found then raise exception 'SHARE_CONFLICT'; end if;
  return '{"ok":true}';
end $$;

create or replace function public.ws_share_attachments(p_actor uuid,p_canvas uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null or not exists(select 1 from public.notes n where n.id=p_canvas and n.user_id=p_actor and n.deleted_at is null)
    then raise exception 'SHARE_FORBIDDEN'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'embed',f.embed_id,'title',f.name)),'[]'::jsonb)
    from public.workspace_files f where f.user_id=p_actor and f.canvas_id=p_canvas and f.ready);
end $$;
create or replace function public.ws_share_folder_attachments(p_actor uuid,p_folder uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null or not exists(select 1 from public.folders where id=p_folder and user_id=p_actor)
    then raise exception 'SHARE_FORBIDDEN'; end if;
  return (with recursive dirs(id,depth) as (
    select p_folder,1 union all select f.id,d.depth+1 from public.folders f join dirs d on f.parent_id=d.id
      where f.user_id=p_actor and d.depth<16
  )
  select coalesce(jsonb_agg(jsonb_build_object('canvas',n.id,'embed',e->>'id','name',coalesce(e->>'fileName',e->>'title','document'),
        'document',e->>'documentId')),'[]'::jsonb)
  from public.notes n join dirs d on d.id=n.folder_id
    cross join lateral jsonb_array_elements(n.content#>'{board,embeds}') e
    where n.user_id=p_actor and n.deleted_at is null and e->>'kind'='document'
      and not exists(select 1 from public.workspace_files f where f.canvas_id=n.id and f.embed_id::text=e->>'id' and f.user_id=p_actor and f.ready));
end $$;
revoke all on function public.ws_share_folder_attachments(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ws_share_folder_attachments(uuid,uuid) to service_role;

revoke all on function public.ws_share_attachments(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ws_share_attachments(uuid,uuid) to service_role;

revoke all on function public.ws_share_resource(text,uuid),public.ws_share_role(text,uuid,text,text,uuid),
  public.ws_share_manage(uuid,text,uuid,text,text,text,text),public.ws_share_mail(text,uuid,text,text,text),public.ws_share_received(uuid),
  public.ws_share_read(text,uuid,text,text,uuid,text,jsonb),public.ws_share_write(text,uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ws_share_resource(text,uuid),public.ws_share_manage(uuid,text,uuid,text,text,text,text),
  public.ws_share_mail(text,uuid,text,text,text),public.ws_share_received(uuid),
  public.ws_share_read(text,uuid,text,text,uuid,text,jsonb),public.ws_share_write(text,uuid,text,uuid,text,jsonb) to service_role;

commit;
