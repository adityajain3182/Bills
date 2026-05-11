-- Tally / Bills — Supabase schema and Row Level Security
--
-- Paste this into the Supabase SQL Editor and run it as a single script.
-- Idempotent: safe to re-run; each block is "if not exists" or uses replace.
--
-- Data model:
--   profiles       — 1:1 with auth.users; display name + default currency
--   groups         — top-level container; has owner + members
--   group_members  — join table: which auth users can access which group
--   people         — named members of a group (may be linked to an auth user)
--   expenses       — line items
--   settlements    — payments that clear debt
--   invites        — group invites by email, accepted by signing in
--
-- Sync strategy:
--   Every row has updated_at (last modified) and deleted_at (soft delete).
--   Client pulls rows where updated_at > last_pull and merges by LWW.
--   Client pushes locally-dirty rows with upsert.
--
-- Keys are client-generated UUIDs (text) so offline-created rows can sync
-- without renumbering.

------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------

create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text,
  display_name text not null default '',
  default_currency text not null default 'USD',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.groups (
  id          text primary key,
  name        text not null,
  emoji       text not null default '🧾',
  currency    text not null default 'USD',
  member_ids  text[] not null default '{}',
  archived    boolean not null default false,
  owner_id    uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists groups_owner_idx     on public.groups (owner_id);
create index if not exists groups_updated_idx   on public.groups (updated_at);

create table if not exists public.group_members (
  group_id  text not null references public.groups on delete cascade,
  user_id   uuid not null references auth.users on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.people (
  id              text primary key,
  group_id        text references public.groups on delete cascade,
  name            text not null,
  avatar_color    text not null,
  linked_user_id  uuid references auth.users on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
-- people.group_id used to be NOT NULL; drop the constraint if a v1 schema is
-- still in place so we can hold global ("Me"-style) people too.
alter table public.people alter column group_id drop not null;
create index if not exists people_group_idx   on public.people (group_id);
create index if not exists people_updated_idx on public.people (updated_at);

create table if not exists public.expenses (
  id            text primary key,
  group_id      text not null references public.groups on delete cascade,
  description   text not null,
  amount        bigint not null,             -- minor units (cents)
  currency      text not null,
  date          bigint not null,             -- epoch ms
  paid_by       jsonb not null,              -- [{ personId, amount }]
  splits        jsonb not null,              -- [{ personId, amount }]
  split_method  text not null,               -- 'equal' | 'exact' | 'percent' | 'shares'
  split_config  jsonb not null,
  category      text not null default 'general',
  notes         text,
  owner_id      uuid not null references auth.users on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists expenses_group_idx   on public.expenses (group_id);
create index if not exists expenses_updated_idx on public.expenses (updated_at);

create table if not exists public.settlements (
  id              text primary key,
  group_id        text not null references public.groups on delete cascade,
  from_person_id  text not null,
  to_person_id    text not null,
  amount          bigint not null,
  currency        text not null,
  date            bigint not null,
  note            text,
  owner_id        uuid not null references auth.users on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists settlements_group_idx   on public.settlements (group_id);
create index if not exists settlements_updated_idx on public.settlements (updated_at);

create table if not exists public.invites (
  id            uuid primary key default uuid_generate_v4(),
  group_id      text not null references public.groups on delete cascade,
  invited_email text not null,
  invited_by    uuid not null references auth.users on delete cascade,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists invites_email_idx on public.invites (lower(invited_email));
create index if not exists invites_group_idx on public.invites (group_id);

------------------------------------------------------------------------
-- updated_at trigger
------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles', 'groups', 'people', 'expenses', 'settlements'
  ]) loop
    execute format(
      'drop trigger if exists trg_touch_%1$s on public.%1$s; ' ||
      'create trigger trg_touch_%1$s before update on public.%1$s ' ||
      'for each row execute function public.touch_updated_at();',
      t
    );
  end loop;
end;
$$;

------------------------------------------------------------------------
-- Auto-create profile + accept pending invites on signup
------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  -- Auto-accept invites that target this email
  insert into public.group_members (group_id, user_id)
  select i.group_id, new.id
  from public.invites i
  where lower(i.invited_email) = lower(new.email)
    and i.accepted_at is null
  on conflict do nothing;

  update public.invites
     set accepted_at = now()
   where lower(invited_email) = lower(new.email)
     and accepted_at is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------
-- Helper: can the current user see a given group?
------------------------------------------------------------------------

create or replace function public.is_group_member(g_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.groups g
     where g.id = g_id and g.owner_id = auth.uid()
  ) or exists (
    select 1 from public.group_members m
     where m.group_id = g_id and m.user_id = auth.uid()
  );
$$;

------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.people        enable row level security;
alter table public.expenses      enable row level security;
alter table public.settlements   enable row level security;
alter table public.invites       enable row level security;

-- profiles: each user sees their own row + rows of users they share a group with
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1
        from public.group_members me
        join public.group_members them on them.group_id = me.group_id
       where me.user_id = auth.uid() and them.user_id = profiles.id
    )
    or exists (
      -- group owners are visible to their members and vice-versa
      select 1 from public.groups g
       where g.owner_id = profiles.id
         and (g.owner_id = auth.uid() or public.is_group_member(g.id))
    )
  );

drop policy if exists profiles_upsert on public.profiles;
create policy profiles_upsert on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid());

-- groups
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select using (public.is_group_member(id));

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert with check (owner_id = auth.uid());

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update using (public.is_group_member(id))
              with check (public.is_group_member(id));

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete using (owner_id = auth.uid());

-- group_members
drop policy if exists gm_select on public.group_members;
create policy gm_select on public.group_members
  for select using (public.is_group_member(group_id));

drop policy if exists gm_insert on public.group_members;
create policy gm_insert on public.group_members
  for insert with check (
    -- owner can add anyone; user can add themselves if invited
    exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
    or user_id = auth.uid()
  );

drop policy if exists gm_delete on public.group_members;
create policy gm_delete on public.group_members
  for delete using (
    exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
    or user_id = auth.uid()
  );

-- expenses / settlements: anyone in the group can do everything
do $$
declare t text;
begin
  for t in select unnest(array['expenses','settlements']) loop
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_group_member(group_id));', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_group_member(group_id));', t);
    execute format('drop policy if exists %1$s_update on public.%1$s;', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s;', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_group_member(group_id));', t);
  end loop;
end;
$$;

-- people: visible if linked to me, or if referenced from any group I can see.
-- Locally a person is a global (per-user) entity that can appear in many
-- groups via groups.member_ids[]; the cloud reflects that.
create or replace function public.can_see_person(p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.groups g
     where (g.owner_id = auth.uid()
            or exists (select 1 from public.group_members m
                        where m.group_id = g.id and m.user_id = auth.uid()))
       and p_id = any(g.member_ids)
  );
$$;

drop policy if exists people_select on public.people;
create policy people_select on public.people
  for select using (
    linked_user_id = auth.uid()
    or public.can_see_person(id)
  );

drop policy if exists people_insert on public.people;
create policy people_insert on public.people
  for insert with check (
    -- I'm claiming this person as myself
    linked_user_id = auth.uid()
    -- or it's already attached to a group I can see (covers re-upserts during sync)
    or (group_id is not null and public.is_group_member(group_id))
    -- or this person id appears in some group I can see
    or public.can_see_person(id)
  );

drop policy if exists people_update on public.people;
create policy people_update on public.people
  for update using (
    linked_user_id = auth.uid() or public.can_see_person(id)
  ) with check (
    linked_user_id = auth.uid() or public.can_see_person(id)
  );

drop policy if exists people_delete on public.people;
create policy people_delete on public.people
  for delete using (
    linked_user_id = auth.uid() or public.can_see_person(id)
  );

-- invites: you can read invites for your own email; group owner can manage
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select using (
    invited_by = auth.uid()
    or lower(invited_email) = lower((select email from auth.users where id = auth.uid()))
  );

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert with check (
    invited_by = auth.uid()
    and exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites
  for delete using (
    invited_by = auth.uid()
    or lower(invited_email) = lower((select email from auth.users where id = auth.uid()))
  );

------------------------------------------------------------------------
-- Realtime (optional — turn on if you want live updates between devices)
------------------------------------------------------------------------

-- alter publication supabase_realtime add table public.groups, public.people,
--   public.expenses, public.settlements, public.group_members, public.invites;
