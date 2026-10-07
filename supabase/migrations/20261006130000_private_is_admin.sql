-- Move is_admin() out of the API-exposed public schema so it can't be called
-- through /rest/v1/rpc. Policies reference the function itself, not its name,
-- so they keep working after the move.

create schema if not exists private;
grant usage on schema private to anon, authenticated;

alter function public.is_admin() set schema private;

-- Lets the admin UI check "am I an admin?" by reading its own row.
grant select on public.admins to authenticated;
create policy "Users can see their own admin row" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));
