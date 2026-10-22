-- The site launched without a waitlist (2026-10-22): remove it. It never had a sign-up.
drop function if exists public.join_waitlist(text, boolean, text, text);
drop function if exists public.waitlist_count();
drop table if exists public.waitlist;
