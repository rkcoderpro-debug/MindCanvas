-- MindCanvas V4.3.1: keep the quiz session mode and question order so review
-- mode can target questions the learner previously missed.

alter table public.quiz_attempts
  add column if not exists mode text not null default 'learn';

alter table public.quiz_attempts
  add column if not exists question_ids jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quiz_attempts'::regclass
      and conname = 'quiz_attempts_mode_check'
  ) then
    alter table public.quiz_attempts
      add constraint quiz_attempts_mode_check check (mode in ('learn', 'practice', 'exam', 'review'));
  end if;
end $$;

alter table public.quiz_attempts
  drop constraint if exists quiz_attempts_question_ids_check;

alter table public.quiz_attempts
  add constraint quiz_attempts_question_ids_check
  check (jsonb_typeof(question_ids) = 'array');
