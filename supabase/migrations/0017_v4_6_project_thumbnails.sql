-- MindCanvas V4.6: compact project-card previews.
-- The snapshot contains no original media data and is safe to read for a
-- collaborator who can already read the parent note.

alter table public.notes add column if not exists thumbnail jsonb;

grant select, insert, update, delete on table public.notes to authenticated;
notify pgrst, 'reload schema';
