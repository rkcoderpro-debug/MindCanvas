begin;

create or replace function public.list_flashcard_deck_totals(p_deck_ids uuid[])
returns table(deck_id uuid, total bigint, due bigint)
language sql stable security invoker set search_path = '' as $$
  select d.id, count(c.id), count(c.id) filter (where c.due_at <= now())
  from public.flashcard_decks d
  left join public.flashcards c on c.deck_id = d.id and c.user_id = d.user_id
  where d.user_id = auth.uid() and d.id = any(p_deck_ids)
  group by d.id
$$;

create or replace function public.list_connection_inbox()
returns table(peer_id uuid, display_name text, unread_count bigint, connected_at timestamptz,
  avatar_url text, avatar_slot smallint, avatar_revision uuid, last_message_at timestamptz,
  last_message_body text, last_resource_kind text, last_resource_title text, last_message_outgoing boolean)
language sql stable security invoker set search_path = '' as $$
  select p.peer_id, p.display_name, p.unread_count, p.connected_at, p.avatar_url, p.avatar_slot, p.avatar_revision,
    preview.created_at, left(preview.body, 160), preview.resource_kind, preview.resource_title,
    preview.sender_id = auth.uid()
  from public.list_connections_with_profile() p
  left join lateral (
    select m.* from (
      (select m.id, m.created_at, m.sender_id, m.body, m.resource_kind, m.resource_title
       from public.direct_messages m where m.sender_id = auth.uid() and m.recipient_id = p.peer_id
       order by m.created_at desc, m.id desc limit 1)
      union all
      (select m.id, m.created_at, m.sender_id, m.body, m.resource_kind, m.resource_title
       from public.direct_messages m where m.sender_id = p.peer_id and m.recipient_id = auth.uid()
       order by m.created_at desc, m.id desc limit 1)
    ) m order by m.created_at desc, m.id desc limit 1
  ) preview on true
  order by preview.created_at desc nulls last, p.connected_at desc, p.peer_id
$$;

revoke all on function public.list_flashcard_deck_totals(uuid[]), public.list_connection_inbox() from public, anon;
grant execute on function public.list_flashcard_deck_totals(uuid[]), public.list_connection_inbox() to authenticated;

commit;
