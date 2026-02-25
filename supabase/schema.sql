-- ============================================================
-- AnikChat Production Database Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── PROFILES ───────────────────────────────────────────────
-- Auto-created when a user signs up via auth trigger
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  display_name text,
  avatar_url  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Users can view own profile"   on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── FOLDERS ────────────────────────────────────────────────
create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#6366f1',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.folders enable row level security;
create policy "Users manage own folders" on public.folders
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── CONVERSATIONS ──────────────────────────────────────────
create table if not exists public.conversations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  folder_id    uuid references public.folders(id) on delete set null,
  title        text not null default 'New Chat',
  summary      text,
  summarized_up_to int default 0,
  tags         text[] default '{}',
  token_usage  jsonb default '{}',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table public.conversations enable row level security;
create policy "Users manage own conversations" on public.conversations
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists conversations_user_id_idx on public.conversations(user_id);
create index if not exists conversations_updated_at_idx on public.conversations(updated_at desc);

-- ─── MESSAGES ───────────────────────────────────────────────
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null default '',
  images          text[] default '{}',
  token_count     int,
  parent_id       uuid references public.messages(id) on delete set null,
  sibling_index   int,
  total_siblings  int,
  created_at      timestamptz default now()
);
alter table public.messages enable row level security;
create policy "Users manage own messages" on public.messages
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists messages_conversation_id_idx on public.messages(conversation_id);
create index if not exists messages_created_at_idx on public.messages(created_at asc);

-- ─── USER CONFIG ────────────────────────────────────────────
-- Stores app settings (theme, system prompt, model params)
-- Does NOT store raw API keys (those go in user_api_keys)
create table if not exists public.user_config (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  active_provider_id text,
  active_model_id    text,
  temperature        float default 0.7,
  max_tokens         int   default 4096,
  top_p              float default 1,
  frequency_penalty  float default 0,
  presence_penalty   float default 0,
  system_prompt      text  default 'You are a helpful AI assistant.',
  appearance         jsonb default '{}',
  updated_at         timestamptz default now()
);
alter table public.user_config enable row level security;
create policy "Users manage own config" on public.user_config
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── USER API KEYS ──────────────────────────────────────────
-- API keys stored AES-GCM encrypted on the client side
-- The encrypted blob is safe to store here — only the user can decrypt
create table if not exists public.user_api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  provider_id  text not null,
  provider_name text not null,
  base_url     text not null,
  encrypted_key text not null,   -- AES-GCM encrypted, base64 encoded
  iv           text not null,    -- Initialization vector for AES-GCM
  models       jsonb default '[]',
  provider_type text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(user_id, provider_id)
);
alter table public.user_api_keys enable row level security;
create policy "Users manage own api keys" on public.user_api_keys
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── STORAGE BUCKET ─────────────────────────────────────────
-- Run separately in Supabase Dashboard → Storage → New Bucket
-- Name: chat-images | Public: false | File size limit: 10MB
-- (see Phase 5 setup instructions)
