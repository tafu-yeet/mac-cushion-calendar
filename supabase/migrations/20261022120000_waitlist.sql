-- Waitlist sign-ups from /waitlist, shared on Instagram to gauge interest.
-- Visitors never read or write the table directly: they join through
-- join_waitlist() and see only the total through waitlist_count(). Admins
-- read the list and can remove someone who asks.

create table public.waitlist (
  id bigint generated always as identity primary key,
  email text not null unique
    check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Opted in to the newsletter too, with the time they did (unticked by default).
  newsletter boolean not null default false,
  newsletter_consent_at timestamptz,
  -- Which link they came from: /waitlist?from=story, post, bio, friend...
  source text check (source ~ '^[a-z0-9-]{1,30}$'),
  -- The wording they agreed to when they signed up. Canada's anti-spam law
  -- (CASL) asks senders to keep a record of consent.
  consent text not null check (char_length(consent) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

create policy "Admins can read the waitlist" on public.waitlist
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can remove people from the waitlist" on public.waitlist
  for delete to authenticated using ((select private.is_admin()));

-- Adds an email, or ticks the newsletter for one already on the list.
-- Returns true when the email is new.
create function public.join_waitlist(p_email text, p_newsletter boolean, p_source text, p_consent text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  added boolean;
begin
  insert into public.waitlist as w (email, newsletter, newsletter_consent_at, source, consent)
  values (lower(trim(p_email)), p_newsletter, case when p_newsletter then now() end, nullif(p_source, ''), p_consent)
  on conflict (email) do update
    set newsletter = true, newsletter_consent_at = now(), consent = excluded.consent
    where p_newsletter and not w.newsletter
  returning (xmax = 0) into added;
  return coalesce(added, false);
end;
$$;

-- How many people have joined, for the "84 people on the list" line.
create function public.waitlist_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.waitlist;
$$;

revoke execute on function public.join_waitlist(text, boolean, text, text) from public;
revoke execute on function public.waitlist_count() from public;
grant execute on function public.join_waitlist(text, boolean, text, text) to anon, authenticated;
grant execute on function public.waitlist_count() to anon, authenticated;
