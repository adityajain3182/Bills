-- Tally / Bills — Supabase schema v2 (clean rewrite)
--
-- This is a destructive re-install. It DROPs the previous tables and replaces
-- them with a simpler model where every group member is identified by EMAIL.
-- Paste this into the Supabase SQL Editor and run it.
--
-- WHY THIS LOOKS DIFFERENT FROM v1
--   - In v1 we had a separate `people` table whose rows belonged to a group.
--     But locally, people were a per-user global pool, which caused the
--     identifier to drift between devices and triggered RLS 403s.
--   - In v2 there is no people table. Members are identified by their email
--     address directly on `group_members`, `expenses.paid_by`, etc. Emails
--     are stable across devices and uniquely identify a Supabase auth user
--     once they sign up. No drift, no claiming, no link tables.
--
-- Data model
--   profiles       — 1:1 with auth.users; email is unique. Display name,
--                    avatar color, default currency.
--   groups         — top-level container. owner_email is denormalized.
--   group_members  — (group_id, email) pair. The email may or may not match
--                    a real auth.user yet — they're invited and will see the
--                    group as soon as they sign in with that email.
--   expenses       — paid_by / splits store [{email, amount}, …]
--   settlements    — from_email → to_email
--
-- RLS in plain English
--   - You can read a group if your email appears in its group_members.
--   - You can write a group only if you own it.
--   - You can read/write expenses and settlements in any group you're a
--     member of.
--   - You can read profiles that share a group with you (so the UI can
--     render display names + colors for other members).
--
-- The auth.users → profiles trigger ensures that signing up with email
-- foo@example.com creates a profile with that email immediately; any
-- group_members rows referencing foo@example.com become visible to that user
-- on their next pull. No "accept invite" step.

------------------------------------------------------------------------
-- DROP previous schema (v1 tables, functions, triggers)
------------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists trg_touch_profiles on public.profiles;
drop trigger if exists trg_touch_groups on public.groups;
drop trigger if exists trg_touch_people on public.people;
drop trigger if exists trg_touch_expenses on public.expenses;
drop trigger if exists trg_touch_settlements on public.settlements;
drop trigger if exists trg_touch_group_members on public.group_members;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.touch_updated_at() cascade;
drop function if exists public.is_group_member(text) cascade;
drop function if exists public.is_group_member(uuid) cascade;
drop function if exists public.can_see_person(text) cascade;
drop function if exists public.my_email() cascade;
drop function if exists public.is_in_group(uuid) cascade;

drop table if exists public.invites cascade;
drop table if exists public.settlements cascade;
drop table if exists public.expenses cascade;
drop table if exists public.people cascade;
drop table if exists public.group_members cascade;
drop table if exists public.groups cascade;
drop table if exists public.profiles cascade;

------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------

create extension if not exists "uuid-ossp";

create table public.profiles (
  user_id      uuid primary key references auth.users on delete cascade,
  email        text not null unique,                  -- lowercase
  display_name text not null default '',
  avatar_color text not null default '#e8765a',
  default_currency text not null default 'USD',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

create table public.groups (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  emoji       text not null default '🧾',
  currency    text not null default 'USD',
  owner_email text not null,                          -- lowercase
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index groups_owner_idx     on public.groups (lower(owner_email));
create index groups_updated_idx   on public.groups (updated_at);

create table public.group_members (
  group_id        uuid not null references public.groups on delete cascade,
  email           text not null,                      -- lowercase
  display_name    text,
  added_by_email  text,
  added_at        timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  primary key (group_id, email)
);
create index gm_email_idx   on public.group_members (lower(email));
create index gm_updated_idx on public.group_members (updated_at);

create table public.expenses (
  id            uuid primary key default uuid_generate_v4(),
  group_id      uuid not null references public.groups on delete cascade,
  description   text not null,
  amount        bigint not null,                      -- minor units
  currency      text not null,
  date          bigint not null,                      -- epoch ms
  paid_by       jsonb not null,                       -- [{ email, amount }]
  splits        jsonb not null,                       -- [{ email, amount }]
  split_method  text not null,
  split_config  jsonb not null,
  category      text not null default 'general',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index expenses_group_idx   on public.expenses (group_id);
create index expenses_updated_idx on public.expenses (updated_at);

create table public.settlements (
  id          uuid primary key default uuid_generate_v4(),
  group_id    uuid not null references public.groups on delete cascade,
  from_email  text not null,                          -- lowercase
  to_email    text not null,                          -- lowercase
  amount      bigint not null,
  currency    text not null,
  date        bigint not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index settlements_group_idx   on public.settlements (group_id);
create index settlements_updated_idx on public.settlements (updated_at);

------------------------------------------------------------------------
-- updated_at trigger
------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles', 'groups', 'group_members', 'expenses', 'settlements'
  ]) loop
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$s ' ||
      'for each row execute function public.touch_updated_at();',
      t
    );
  end loop;
end;
$$;

------------------------------------------------------------------------
-- Auto-create profile on signup
------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (email) do update set user_id = excluded.user_id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so they bypass RLS recursion)
------------------------------------------------------------------------

-- Read the email from the JWT directly. Faster than joining auth.users, and
-- doesn't depend on the function owner having SELECT on auth.users (which
-- has tripped people up on stricter Supabase setups).
create or replace function public.my_email()
returns text language sql stable
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_in_group(g_id uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
     where group_id = g_id
       and lower(email) = public.my_email()
       and deleted_at is null
  );
$$;

------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses      enable row level security;
alter table public.settlements   enable row level security;

-- Profiles: read yours, and anyone who shares a group with you.
create policy profiles_read on public.profiles for select using (
  user_id = auth.uid()
  or lower(email) = public.my_email()
  or exists (
    select 1
      from public.group_members mine
      join public.group_members theirs using (group_id)
     where lower(mine.email) = public.my_email()
       and lower(theirs.email) = lower(profiles.email)
  )
);
create policy profiles_insert on public.profiles
  for insert with check (user_id = auth.uid());
create policy profiles_update on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Groups: members read; only owner writes.
create policy groups_read on public.groups
  for select using (public.is_in_group(id));
create policy groups_insert on public.groups
  for insert with check (lower(owner_email) = public.my_email());
create policy groups_update on public.groups
  for update using (lower(owner_email) = public.my_email())
              with check (lower(owner_email) = public.my_email());
create policy groups_delete on public.groups
  for delete using (lower(owner_email) = public.my_email());

-- Group members: members read; only owner adds / removes.
create policy gm_read on public.group_members
  for select using (
    lower(email) = public.my_email() or public.is_in_group(group_id)
  );
create policy gm_insert on public.group_members
  for insert with check (
    exists (select 1 from public.groups
             where id = group_id and lower(owner_email) = public.my_email())
  );
create policy gm_update on public.group_members
  for update using (
    exists (select 1 from public.groups
             where id = group_id and lower(owner_email) = public.my_email())
  ) with check (
    exists (select 1 from public.groups
             where id = group_id and lower(owner_email) = public.my_email())
  );
create policy gm_delete on public.group_members
  for delete using (
    exists (select 1 from public.groups
             where id = group_id and lower(owner_email) = public.my_email())
  );

-- Expenses / Settlements: any member can CRUD anything in the group.
create policy expenses_all on public.expenses
  for all using (public.is_in_group(group_id))
         with check (public.is_in_group(group_id));
create policy settlements_all on public.settlements
  for all using (public.is_in_group(group_id))
         with check (public.is_in_group(group_id));
