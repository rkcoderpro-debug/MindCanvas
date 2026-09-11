-- V3.1 Flashcards MVP: owner-scoped decks and review cards.
-- Apply after 0001_mindcanvas.sql and the project-management migrations.

create table if not exists public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  project_id uuid references public.notes(id) on delete set null,
  folder_id uuid references public.folders(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists flashcard_decks_user_updated_idx
  on public.flashcard_decks(user_id, updated_at desc);

alter table public.flashcard_decks enable row level security;

drop policy if exists "flashcard decks are readable by owner" on public.flashcard_decks;
create policy "flashcard decks are readable by owner"
  on public.flashcard_decks for select
  using (user_id = auth.uid());

drop policy if exists "flashcard decks are insertable by owner" on public.flashcard_decks;
create policy "flashcard decks are insertable by owner"
  on public.flashcard_decks for insert
  with check (
    user_id = auth.uid()
    and (project_id is null or exists (
      select 1 from public.notes n where n.id = project_id and n.user_id = auth.uid()
    ))
    and (folder_id is null or exists (
      select 1 from public.folders f where f.id = folder_id and f.user_id = auth.uid()
    ))
  );

drop policy if exists "flashcard decks are updateable by owner" on public.flashcard_decks;
create policy "flashcard decks are updateable by owner"
  on public.flashcard_decks for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (project_id is null or exists (
      select 1 from public.notes n where n.id = project_id and n.user_id = auth.uid()
    ))
    and (folder_id is null or exists (
      select 1 from public.folders f where f.id = folder_id and f.user_id = auth.uid()
    ))
  );

drop policy if exists "flashcard decks are deletable by owner" on public.flashcard_decks;
create policy "flashcard decks are deletable by owner"
  on public.flashcard_decks for delete
  using (user_id = auth.uid());

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.flashcard_decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.notes(id) on delete set null,
  front text not null check (char_length(trim(front)) between 1 and 20000),
  back text not null check (char_length(trim(back)) between 1 and 20000),
  source_page integer check (source_page is null or source_page > 0),
  due_at timestamptz not null default timezone('utc', now()),
  interval_days integer not null default 0 check (interval_days >= 0),
  ease numeric(4, 2) not null default 2.50 check (ease >= 1.30 and ease <= 10),
  repetitions integer not null default 0 check (repetitions >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists flashcards_user_deck_due_idx
  on public.flashcards(user_id, deck_id, due_at);

alter table public.flashcards enable row level security;

drop policy if exists "flashcards are readable by owner" on public.flashcards;
create policy "flashcards are readable by owner"
  on public.flashcards for select
  using (user_id = auth.uid());

drop policy if exists "flashcards are insertable by owner" on public.flashcards;
create policy "flashcards are insertable by owner"
  on public.flashcards for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.flashcard_decks d
      where d.id = deck_id and d.user_id = auth.uid()
    )
    and (project_id is null or exists (
      select 1 from public.notes n where n.id = project_id and n.user_id = auth.uid()
    ))
  );

drop policy if exists "flashcards are updateable by owner" on public.flashcards;
create policy "flashcards are updateable by owner"
  on public.flashcards for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.flashcard_decks d
      where d.id = deck_id and d.user_id = auth.uid()
    )
    and (project_id is null or exists (
      select 1 from public.notes n where n.id = project_id and n.user_id = auth.uid()
    ))
  );

drop policy if exists "flashcards are deletable by owner" on public.flashcards;
create policy "flashcards are deletable by owner"
  on public.flashcards for delete
  using (user_id = auth.uid());
