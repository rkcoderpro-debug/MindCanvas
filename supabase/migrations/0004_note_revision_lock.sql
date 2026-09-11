-- Additive migration for conflict-safe note autosave.
-- Existing notes remain readable; the first revision is zero.
alter table public.notes add column if not exists revision bigint not null default 0;
create index if not exists notes_owner_revision_idx on public.notes (user_id, id, revision);
