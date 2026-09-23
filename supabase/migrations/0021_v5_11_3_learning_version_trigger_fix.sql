-- MindCanvas V5.11.3: repair the shared learning version trigger.
--
-- Migration 0018 used one trigger function for quiz_tests, flashcards and
-- lab_projects. PostgreSQL evaluates OLD/NEW against the table that fired the
-- trigger, so OLD.questions raises 42703 when the flashcards trigger runs.
-- Keep one table-specific function per trigger to make the record shape clear.

alter table public.quiz_tests
  add column if not exists content_version integer not null default 1;
alter table public.flashcards
  add column if not exists content_version integer not null default 1;
alter table public.lab_projects
  add column if not exists content_version integer not null default 1;

create or replace function public.learning_bump_quiz_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.questions is distinct from new.questions or old.title is distinct from new.title then
    new.content_version := old.content_version + 1;
  end if;
  return new;
end $$;

create or replace function public.learning_bump_card_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.front is distinct from new.front or old.back is distinct from new.back then
    new.content_version := old.content_version + 1;
  end if;
  return new;
end $$;

create or replace function public.learning_bump_lab_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.program_html is distinct from new.program_html or old.title is distinct from new.title then
    new.content_version := old.content_version + 1;
  end if;
  return new;
end $$;

drop trigger if exists learning_quiz_version on public.quiz_tests;
create trigger learning_quiz_version before update on public.quiz_tests
  for each row execute function public.learning_bump_quiz_version();

drop trigger if exists learning_card_version on public.flashcards;
create trigger learning_card_version before update on public.flashcards
  for each row execute function public.learning_bump_card_version();

drop trigger if exists learning_lab_version on public.lab_projects;
create trigger learning_lab_version before update on public.lab_projects
  for each row execute function public.learning_bump_lab_version();

-- Leave the obsolete shared function out of the active trigger graph. Drop it
-- only after all dependent triggers have been replaced; this also makes a
-- failed 0018 installation safe to repair with this migration.
drop function if exists public.learning_bump_version();
