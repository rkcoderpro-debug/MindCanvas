create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete set null, title text not null default 'Untitled note',
  content jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid references public.notes(id) on delete set null, file_path text not null, file_name text not null,
  extracted_text text, page_count integer, created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do update set display_name = excluded.display_name, avatar_url = excluded.avatar_url, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security; alter table public.folders enable row level security; alter table public.notes enable row level security; alter table public.documents enable row level security;
drop policy if exists "profiles own" on public.profiles;
drop policy if exists "folders own" on public.folders;
drop policy if exists "notes own" on public.notes;
drop policy if exists "documents own" on public.documents;
create policy "profiles own" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "folders own" on public.folders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notes own" on public.notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "documents own" on public.documents for all using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
drop policy if exists "document objects read own" on storage.objects;
drop policy if exists "document objects insert own" on storage.objects;
drop policy if exists "document objects delete own" on storage.objects;
create policy "document objects read own" on storage.objects for select using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "document objects insert own" on storage.objects for insert with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "document objects delete own" on storage.objects for delete using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
