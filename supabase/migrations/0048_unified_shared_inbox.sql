begin;

create table if not exists public.workspace_share_visits (
  recipient_id uuid not null references auth.users(id) on delete cascade,
  grant_id uuid not null references public.workspace_share_grants(id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (recipient_id, grant_id)
);
create index if not exists workspace_share_visits_grant on public.workspace_share_visits(grant_id);
alter table public.workspace_share_visits enable row level security;
revoke all on public.workspace_share_visits from public, anon, authenticated;

-- A public link has no recipient until an account successfully opens it.
-- Record the grant, so an explicit revocation also removes the inbox entry.
create or replace function public.ws_share_open(p_token text,p_actor uuid,p_proof text,p_kind text,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result := public.ws_share_read(p_token,p_actor,p_proof,p_kind,p_id);
  if p_actor is not null and result->>'state'='ok' then
    insert into public.workspace_share_visits(recipient_id,grant_id)
    select p_actor,g.id from public.workspace_share_grants g
    where g.token=p_token and g.email='' and g.recipient_id is null and g.owner_id<>p_actor
    on conflict (recipient_id,grant_id) do nothing;
  end if;
  return result;
end $$;

create or replace function public.ws_share_received(p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with candidates as (
    select g.*,g.created_at as received_at
    from public.workspace_share_grants g
    where g.recipient_id=p_actor
    union all
    select g.*,g.created_at
    from public.workspace_share_grants g
    join auth.users u on u.id=p_actor and u.email_confirmed_at is not null and lower(u.email)=g.email
    where g.recipient_id is null and g.email<>''
    union all
    select g.*,v.opened_at
    from public.workspace_share_visits v
    join public.workspace_share_grants g on g.id=v.grant_id
    where v.recipient_id=p_actor and g.email='' and g.recipient_id is null
  ), accessible as (
    select c.kind,c.resource_id as id,c.token,r.title,c.received_at as created_at,
      p.display_name as owner_name,
      public.ws_share_role(c.token,p_actor,null,c.kind,c.resource_id) as role
    from candidates c
    cross join lateral public.ws_share_resource(c.kind,c.resource_id) r
    left join public.profiles p on p.id=c.owner_id
    where c.owner_id<>p_actor and r.owner_id=c.owner_id
  ), unique_items as (
    select distinct on (kind,id) kind,id,token,title,created_at,owner_name,role
    from accessible where role in ('viewer','editor')
    order by kind,id,(role='editor') desc,created_at desc,token
  )
  select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at desc,item.kind,item.id),'[]'::jsonb)
  from unique_items item;
$$;

revoke all on function public.ws_share_open(text,uuid,text,text,uuid),public.ws_share_received(uuid) from public,anon,authenticated;
grant execute on function public.ws_share_open(text,uuid,text,text,uuid),public.ws_share_received(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
