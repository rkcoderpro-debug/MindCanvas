-- Additive migration: keep every existing note and existing per-user RLS policies.
alter table public.notes add column if not exists is_favorite boolean not null default false;
alter table public.notes add column if not exists deleted_at timestamptz;
create index if not exists notes_owner_deleted_idx on public.notes (user_id, deleted_at);
