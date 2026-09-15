-- MindCanvas V4.5.9 follow-up: make owner note writes deterministic.
-- Apply after 0014_v4_5_9_share_inbox_pricing.sql.
--
-- The shared SELECT policy is still needed for collaborators, but a new
-- owner row must be recognized directly by RLS. This also keeps INSERTs that
-- return no columns independent from the collaboration lookup functions.

alter table public.notes enable row level security;

drop policy if exists "notes own" on public.notes;
drop policy if exists "notes accessible to project members" on public.notes;
drop policy if exists "notes insert own" on public.notes;
drop policy if exists "notes update by project editors" on public.notes;
drop policy if exists "notes delete own" on public.notes;

create policy "notes accessible to project members"
  on public.notes for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.can_access_project(id, (select auth.uid()))
  );

create policy "notes insert own"
  on public.notes for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "notes update by project editors"
  on public.notes for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.can_edit_project(id, (select auth.uid()))
  )
  with check (user_id = public.project_owner_id(id));

create policy "notes delete own"
  on public.notes for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.notes to authenticated;

notify pgrst, 'reload schema';
