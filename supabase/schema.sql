-- Profiles (extends auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique,
  full_name text,
  bio text,
  avatar_url text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Owner read" on public.profiles for select using (auth.uid() = id);
create policy "Owner update" on public.profiles for update using (auth.uid() = id);

-- Connected platforms
create table public.connected_platforms (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  platform text not null,
  platform_username text,
  platform_user_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  connected_at timestamptz default now(),
  is_active boolean default true,
  unique(user_id, platform)
);
alter table public.connected_platforms enable row level security;
create policy "Owner all" on public.connected_platforms for all using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage policies for avatars bucket
create policy "Public read" on storage.objects for select using (bucket_id = 'avatars');
create policy "Auth upload" on storage.objects for insert with check (
  bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Auth update" on storage.objects for update using (
  bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- Scheduled posts
-- State machine: pending → preparing → prepared → completed/failed
-- Migration required (run in Supabase SQL Editor if upgrading):
--   UPDATE public.scheduled_posts SET status = 'pending' WHERE status = 'processing';
--   ALTER TABLE public.scheduled_posts DROP CONSTRAINT IF EXISTS scheduled_posts_status_check;
--   ALTER TABLE public.scheduled_posts ADD CONSTRAINT scheduled_posts_status_check
--     CHECK (status IN ('pending', 'preparing', 'prepared', 'publishing', 'completed', 'failed'));
--   ALTER TABLE public.scheduled_posts ADD COLUMN IF NOT EXISTS prepared_containers JSONB;
--   DROP INDEX IF EXISTS idx_scheduled_pending;
--   CREATE INDEX idx_scheduled_active ON public.scheduled_posts (scheduled_at, status)
--     WHERE status IN ('pending', 'preparing', 'prepared');
create table public.scheduled_posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  platforms text[] not null,
  scheduled_at timestamptz not null,
  status text default 'pending' check (status in ('pending', 'preparing', 'prepared', 'publishing', 'completed', 'failed')),
  prepared_containers jsonb,
  results jsonb,
  media_urls text[],
  media_types text[],
  aspect_mode text default 'original',
  pad_color text default '#FFFFFF',
  image_quality integer default 92,
  crop_offsets jsonb,
  thumbnail_url text,
  filter_settings jsonb,
  ig_post_type text default 'reel' check (ig_post_type in ('post', 'reel', 'story')),
  created_at timestamptz default now()
);
alter table public.scheduled_posts enable row level security;
create policy "Owner all" on public.scheduled_posts for all using (auth.uid() = user_id);
create index idx_scheduled_active on public.scheduled_posts (scheduled_at, status)
  where status in ('pending', 'preparing', 'prepared');

-- Storage policies for media bucket (Instagram uploads)
create policy "Public read media" on storage.objects for select using (bucket_id = 'media');
create policy "Auth upload media" on storage.objects for insert with check (
  bucket_id = 'media' and auth.uid() is not null);
create policy "Auth update media" on storage.objects for update using (
  bucket_id = 'media' and auth.uid() is not null);

-- Mastodon app credentials cache — one row per instance.
-- Service role writes (via server action); no client access needed.
create table if not exists public.mastodon_apps (
  instance text primary key,
  client_id text not null,
  client_secret text not null,
  created_at timestamptz default now()
);
alter table public.mastodon_apps enable row level security;
-- No policies = service role only. Anon/auth cannot read or write.
