-- Crate: Supabase Schema, Auth Trigger & Avatars Storage Bucket
-- Run inside the Supabase SQL Editor (100% Free Tier compatible)

-- 1. Create public.profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  mobile_number text not null default '',
  full_name text not null default '',
  avatar_url text not null default '',
  is_admin boolean not null default false,
  is_approved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2. Row Level Security Policies
-- Users can read their own profile
create policy "Users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Users can update their own onboarding details (cannot escalate is_admin or is_approved)
create policy "Users can update own onboarding fields"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and is_admin = (select is_admin from public.profiles where id = auth.uid())
    and is_approved = (select is_approved from public.profiles where id = auth.uid())
  );

-- Admins can view all profiles
create policy "Admins can view all profiles"
  on public.profiles
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- Admins can toggle is_approved on any user
create policy "Admins can update user approval"
  on public.profiles
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- 3. Automatic trigger on auth.users signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, mobile_number, full_name, avatar_url, is_admin, is_approved)
  values (
    new.id,
    coalesce(new.email, new.raw_user_meta_data ->> 'email', ''),
    coalesce(new.raw_user_meta_data ->> 'mobile_number', new.phone, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', ''),
    false,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. Storage bucket for user PFPs ('avatars')
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy "Authenticated users can upload their own avatar"
  on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own avatar"
  on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. Playback Tracking Table: public.play_history (30s threshold logging)
create table if not exists public.play_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  video_id text not null,
  title text not null,
  artist text not null,
  album_art text not null default '',
  played_at timestamptz not null default now()
);

create index if not exists idx_play_history_user_played_at
  on public.play_history (user_id, played_at desc);

create index if not exists idx_play_history_user_video
  on public.play_history (user_id, video_id);

alter table public.play_history enable row level security;

create policy "Users can read own play_history"
  on public.play_history
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own play_history"
  on public.play_history
  for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own play_history"
  on public.play_history
  for delete
  using (auth.uid() = user_id);

-- 6. Automated 30-Day Cleanup Function & Trigger (keeps storage lightweight)
create or replace function public.cleanup_expired_play_history()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.play_history
  where played_at < (now() - interval '30 days');
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.trg_fn_prune_play_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.play_history
  where played_at < (now() - interval '30 days');
  return new;
end;
$$;

drop trigger if exists trg_cleanup_expired_play_history on public.play_history;
create trigger trg_cleanup_expired_play_history
  after insert on public.play_history
  for each statement execute procedure public.trg_fn_prune_play_history();

-- 7. In-App Downloads Metadata Table: public.downloaded_tracks (maps videoId to internal sandbox URI)
create table if not exists public.downloaded_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  video_id text not null,
  title text not null,
  artist text not null,
  album_art text not null default '',
  local_file_uri text not null,
  downloaded_at timestamptz not null default now(),
  unique (user_id, video_id)
);

alter table public.downloaded_tracks enable row level security;

create policy "Users can read own downloaded_tracks"
  on public.downloaded_tracks
  for select
  using (auth.uid() = user_id);

create policy "Users can upsert own downloaded_tracks"
  on public.downloaded_tracks
  for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own downloaded_tracks"
  on public.downloaded_tracks
  for delete
  using (auth.uid() = user_id);


