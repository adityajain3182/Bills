-- Tally / Bills — schema migration v1 → v2
--
-- Safe to run on a project that has v1 applied. Idempotent — safe to re-run.
--
-- Fixes:
--   1. people.group_id was NOT NULL but locally people are a per-user global
--      pool (the "Me" person from onboarding has no groupId). Sync filtered
--      those out, so sharing a group left other devices unable to see the
--      payer/member rows. group_id is now nullable, and RLS keys off
--      groups.member_ids[] for visibility.

alter table public.people alter column group_id drop not null;

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
    linked_user_id = auth.uid() or public.can_see_person(id)
  );

drop policy if exists people_insert on public.people;
create policy people_insert on public.people
  for insert with check (
    linked_user_id = auth.uid()
    or (group_id is not null and public.is_group_member(group_id))
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
