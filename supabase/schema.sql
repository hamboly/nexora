-- ============================================================
-- Nexora — Supabase schema (phase 2: cloud sync & auth)
-- Run this in the SQL Editor of your NEW "nexora" project.
-- ============================================================

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Per-user dashboard settings (theme, style, layout, sizes, orders)
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Notes
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);

-- Todos
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- Movie/series watchlist
create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  year text,
  link text,
  created_at timestamptz not null default now()
);

-- Game records (trivia best, RPS stats, higher-lower best)
create table if not exists public.game_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trivia_best int not null default 0,
  rps jsonb not null default '{"w":0,"l":0,"t":0,"streak":0,"bestStreak":0}'::jsonb,
  hl_best int not null default 0,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Row Level Security: users can only ever touch their own rows
-- ------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.user_settings enable row level security;
alter table public.notes        enable row level security;
alter table public.todos        enable row level security;
alter table public.watchlist    enable row level security;
alter table public.game_stats   enable row level security;

create policy "own profile"   on public.profiles      for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own settings"  on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notes"     on public.notes         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own todos"     on public.todos         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own watchlist" on public.watchlist     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own games"     on public.game_stats    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create a profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
