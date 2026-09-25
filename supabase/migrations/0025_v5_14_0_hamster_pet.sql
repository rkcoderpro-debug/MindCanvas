-- Add the hamster companion to the account-scoped pet profile.
-- Run after 0024_v5_13_0_lab_cdn_resources.sql.

alter table public.pet_profiles
  drop constraint if exists pet_profiles_pet_kind_check;

alter table public.pet_profiles
  add constraint pet_profiles_pet_kind_check
  check (pet_kind in ('cat','dog','fox','rabbit','hamster'));

create or replace function public.update_my_pet(p_kind text, p_name text)
returns public.pet_profiles
language plpgsql security definer set search_path = '' as $$
declare
  v public.pet_profiles;
  v_name text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'Sign in to update your pet'; end if;
  if p_kind is null or p_kind not in ('cat','dog','fox','rabbit','hamster') or char_length(v_name) not between 1 and 40 then
    raise exception 'Invalid pet settings';
  end if;
  insert into public.pet_profiles(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.pet_profiles
    set pet_kind = p_kind, pet_name = v_name, updated_at = now()
    where user_id = auth.uid();
  select * into v from public.pet_profiles where user_id = auth.uid();
  return v;
end $$;

revoke all on function public.update_my_pet(text,text) from public, anon;
grant execute on function public.update_my_pet(text,text) to authenticated;

notify pgrst, 'reload schema';
