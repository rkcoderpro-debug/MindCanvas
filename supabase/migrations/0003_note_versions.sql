-- Additive migration for explicit, user-owned recovery checkpoints.
-- Autosave still writes the current note only; this table is written when the
-- user chooses Save checkpoint (and before a version restore).
create table if not exists public.note_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  label text,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists note_versions_owner_note_idx
  on public.note_versions (user_id, note_id, version desc);

alter table public.note_versions enable row level security;
drop policy if exists "note versions own" on public.note_versions;
create policy "note versions own" on public.note_versions
  for all using (
    user_id = auth.uid()
    and exists (
      select 1 from public.notes
      where notes.id = note_versions.note_id
        and notes.user_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.notes
      where notes.id = note_versions.note_id
        and notes.user_id = auth.uid()
    )
  );
