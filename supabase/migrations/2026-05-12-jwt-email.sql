-- Tally / Bills — migration 2026-05-12: switch my_email() to JWT-based
--
-- The previous my_email() did `select lower(email) from auth.users where
-- id = auth.uid()` which can fail silently on Supabase setups where the
-- function owner lacks SELECT on auth.users — leaving my_email() returning
-- NULL, which made RLS WITH CHECK clauses evaluate to NULL → false → 403
-- "new row violates row-level security policy" on every insert.
--
-- This patch swaps to `auth.jwt() ->> 'email'`, which:
--   * does not depend on auth.users access,
--   * is faster (no join),
--   * never returns NULL for a properly-signed-in user.
--
-- Safe to re-run.

create or replace function public.my_email()
returns text language sql stable
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;
