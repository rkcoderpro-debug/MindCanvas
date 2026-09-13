-- MindCanvas V4.3 Learning Hub: scheduled tasks and multiple-choice quizzes.
-- Flashcard study events remain idempotent through the V4.2 RPC. The web
-- client reconciles task completion after each event and stores the expanded
-- day row through an explicit upsert, which keeps this migration additive.

alter table public.flashcard_study_plans
  add column if not exists plan_mode text not null default 'ai';

alter table public.flashcard_study_plans
  add column if not exists schedule jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.flashcard_study_plans'::regclass
      and conname = 'flashcard_study_plans_plan_mode_check'
  ) then
    alter table public.flashcard_study_plans
      add constraint flashcard_study_plans_plan_mode_check check (plan_mode in ('ai', 'manual', 'hybrid'));
  end if;
end $$;

alter table public.flashcard_study_days
  add column if not exists task_ids jsonb not null default '[]'::jsonb;

alter table public.flashcard_study_days
  add column if not exists completed_task_ids jsonb not null default '[]'::jsonb;

alter table public.flashcard_study_days
  add column if not exists task_card_ids jsonb not null default '{}'::jsonb;

alter table public.flashcard_study_days
  add column if not exists task_count integer not null default 0 check (task_count >= 0);

alter table public.flashcard_study_days
  add column if not exists completed_task_count integer not null default 0 check (completed_task_count >= 0);

alter table public.flashcard_study_days
  add column if not exists rest_day boolean not null default false;

create table if not exists public.quiz_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 1000),
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 100),
  source_document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists quiz_tests_user_updated_idx
  on public.quiz_tests(user_id, updated_at desc);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quiz_tests(id) on delete cascade,
  score integer not null check (score >= 0),
  total integer not null check (total >= 1),
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  completed_at timestamptz not null default timezone('utc', now())
);

create index if not exists quiz_attempts_user_completed_idx
  on public.quiz_attempts(user_id, completed_at desc);

alter table public.quiz_tests enable row level security;
alter table public.quiz_attempts enable row level security;

drop policy if exists "quiz tests are readable by owner" on public.quiz_tests;
create policy "quiz tests are readable by owner"
  on public.quiz_tests for select using (user_id = auth.uid());

drop policy if exists "quiz tests are insertable by owner" on public.quiz_tests;
create policy "quiz tests are insertable by owner"
  on public.quiz_tests for insert with check (
    user_id = auth.uid()
    and (source_document_id is null or exists (
      select 1 from public.documents d where d.id = source_document_id and d.user_id = auth.uid()
    ))
  );

drop policy if exists "quiz tests are updateable by owner" on public.quiz_tests;
create policy "quiz tests are updateable by owner"
  on public.quiz_tests for update using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (source_document_id is null or exists (
      select 1 from public.documents d where d.id = source_document_id and d.user_id = auth.uid()
    ))
  );

drop policy if exists "quiz tests are deletable by owner" on public.quiz_tests;
create policy "quiz tests are deletable by owner"
  on public.quiz_tests for delete using (user_id = auth.uid());

drop policy if exists "quiz attempts are readable by owner" on public.quiz_attempts;
create policy "quiz attempts are readable by owner"
  on public.quiz_attempts for select using (user_id = auth.uid());

drop policy if exists "quiz attempts are insertable by owner" on public.quiz_attempts;
create policy "quiz attempts are insertable by owner"
  on public.quiz_attempts for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.quiz_tests q where q.id = quiz_id and q.user_id = auth.uid())
    and score <= total
  );

drop policy if exists "quiz attempts are updateable by owner" on public.quiz_attempts;
create policy "quiz attempts are updateable by owner"
  on public.quiz_attempts for update using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.quiz_tests q where q.id = quiz_id and q.user_id = auth.uid())
    and score <= total
  );

-- Keep expanded progress rows private. The existing V4.2 policies already
-- protect the table; these policies allow the V4.3 task fields to be saved by
-- the same owner without granting cross-account access.
drop policy if exists "flashcard study days are insertable by owner" on public.flashcard_study_days;
create policy "flashcard study days are insertable by owner"
  on public.flashcard_study_days for insert with check (
    user_id = auth.uid()
    and (plan_id is null or exists (
      select 1 from public.flashcard_study_plans p where p.id = plan_id and p.user_id = auth.uid()
    ))
  );

drop policy if exists "flashcard study days are updateable by owner" on public.flashcard_study_days;
create policy "flashcard study days are updateable by owner"
  on public.flashcard_study_days for update using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (plan_id is null or exists (
      select 1 from public.flashcard_study_plans p where p.id = plan_id and p.user_id = auth.uid()
    ))
  );
