-- Tally / Bills — migration 2026-05-12: switch my_email() to JWT-based +
-- add whoami() diagnostic.
--
-- Run this in the Supabase SQL Editor. Idempotent — re-runnable.
--
-- WHY
--   The previous my_email() did `select lower(email) from auth.users where
--   id = auth.uid()`. On Supabase setups where the function owner doesn't
--   have SELECT on auth.users, that returns no rows → my_email() returns
--   NULL → RLS WITH CHECK clauses evaluate to NULL → treated as false →
--   "new row violates row-level security policy" 403 on every insert.
--
--   This patch reads the email straight from the JWT via
--   `auth.jwt() ->> 'email'`, which doesn't depend on auth.users grants.
--
--   It also adds a `whoami()` RPC the app can call to surface a precise
--   error if something is still wrong (e.g. JWT missing the email claim).

create or replace function public.my_email()
returns text language sql stable
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.whoami()
returns jsonb language sql stable
as $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'jwt_email', auth.jwt() ->> 'email',
    'my_email', public.my_email()
  )
$$;
grant execute on function public.whoami() to authenticated;
