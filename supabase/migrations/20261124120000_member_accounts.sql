-- Member accounts: a profile per account, the interests picked in the welcome survey, followed
-- clubs, weekly class blocks for "Fits my schedule", "Remind me" requests, email choices with a
-- consent log (Canada's anti-spam law, CASL), a log of every email sent, and the days each
-- member used the site (Stats). Browsing stays sign-in free; none of this touches the public tables.
--
-- Every member table is the member's own: row level security lets a signed-in member read and
-- change only their own rows. Admins get totals (public.member_totals), never anyone's rows.
-- Email choices change only through functions that also write the consent log, so the two can't
-- disagree. The site's email job reads recipients with the service role.

-- ── Profiles ─────────────────────────────────────────────────────────────────────────────

-- Account numbers in sign-up order: the first 500 are founding members.
create sequence private.member_number_seq;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  display_name text check (char_length(display_name) <= 60),
  member_number bigint unique,                 -- null for accounts that existed before members (the admin)
  founding_member boolean not null default false,
  onboarded_at timestamptz,                    -- finished or skipped the welcome survey
  -- Email choices, all off until the member turns one on (consent is logged in email_consents).
  email_digest boolean not null default false,       -- Sunday picks for the week ahead
  email_club_posts boolean not null default false,   -- a followed club posted a new event, at most one a day
  email_reminders boolean not null default false,    -- "Remind me" emails, an hour before
  email_token uuid not null default gen_random_uuid() unique  -- in unsubscribe links; no sign-in needed
);

alter table public.profiles enable row level security;

create policy "Members can read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Members can update their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Only the name and the survey step: numbers and email choices aren't the member's to write.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, onboarded_at) on public.profiles to authenticated;

-- A profile once the email address is confirmed: right away for Google, after the emailed code
-- or link otherwise. Typos and abandoned sign-ups never take a founding number.
create function private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n bigint;
begin
  if new.email_confirmed_at is null or (tg_op = 'UPDATE' and old.email_confirmed_at is not null) then
    return new;
  end if;
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;
  n := nextval('private.member_number_seq');
  insert into public.profiles (id, display_name, member_number, founding_member)
  values (
    new.id,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 60), ''),
    n,
    n <= 500
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger create_profile_on_confirm
  after insert or update of email_confirmed_at on auth.users
  for each row execute function private.create_profile();

-- Accounts from before members (the admin's): a profile with no number, survey done.
insert into public.profiles (id, onboarded_at)
select id, now() from auth.users where email_confirmed_at is not null
on conflict (id) do nothing;

-- ── What members pick and follow ───────────────────────────────────────────────────────────

-- The welcome survey: event categories (events.category's values, src/lib/categories.ts) and free food.
create table public.user_interests (
  user_id uuid not null references public.profiles (id) on delete cascade,
  interest text not null check (interest in ('social', 'sports', 'arts', 'learn', 'give', 'meetings', 'other', 'free_food')),
  created_at timestamptz not null default now(),
  primary key (user_id, interest)
);

create table public.club_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  club_id bigint not null references public.clubs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, club_id)
);
create index club_follows_club_idx on public.club_follows (club_id);

-- "Fits my schedule": weekly busy times only. No course names, codes or rooms.
create table public.busy_blocks (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),                      -- ISO: 1 is Monday
  start_minute smallint not null check (start_minute between 0 and 1439),          -- minutes after midnight, campus time
  end_minute smallint not null check (end_minute between 1 and 1440 and end_minute > start_minute),
  term_ends_on date not null,                                                       -- the block stops applying after this day
  source text not null check (source in ('ics', 'grid')),
  created_at timestamptz not null default now()
);
create index busy_blocks_user_idx on public.busy_blocks (user_id);

-- "Remind me": an email an hour before the event starts.
create table public.event_reminders (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id bigint not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index event_reminders_event_idx on public.event_reminders (event_id);

alter table public.user_interests enable row level security;
alter table public.club_follows enable row level security;
alter table public.busy_blocks enable row level security;
alter table public.event_reminders enable row level security;

create policy "Members can read their own interests" on public.user_interests
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Members can add their own interests" on public.user_interests
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Members can remove their own interests" on public.user_interests
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Members can read their own follows" on public.club_follows
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Members can follow clubs" on public.club_follows
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Members can unfollow clubs" on public.club_follows
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Members can read their own busy blocks" on public.busy_blocks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Members can add their own busy blocks" on public.busy_blocks
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Members can remove their own busy blocks" on public.busy_blocks
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Members can read their own reminders" on public.event_reminders
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Members can ask for reminders" on public.event_reminders
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Members can cancel their reminders" on public.event_reminders
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.user_interests, public.club_follows, public.busy_blocks, public.event_reminders from anon, authenticated;
grant select, insert, delete on public.user_interests, public.club_follows, public.event_reminders to authenticated;
grant select, delete on public.busy_blocks to authenticated;
grant insert (user_id, weekday, start_minute, end_minute, term_ends_on, source) on public.busy_blocks to authenticated;

-- ── Email: consent and sends ───────────────────────────────────────────────────────────────

-- One row per consent given. Withdrawing fills in withdrawn_at; giving it again adds a row.
create table public.email_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('digest', 'club_posts', 'reminders')),
  granted_at timestamptz not null default now(),
  source text not null check (source in ('signup', 'welcome', 'settings', 'remind_button')),
  wording text check (char_length(wording) <= 500),   -- what the member agreed to, as shown
  withdrawn_at timestamptz,
  withdrawn_source text check (withdrawn_source in ('settings', 'unsubscribe_link', 'list_unsubscribe'))
);
create index email_consents_user_idx on public.email_consents (user_id, type);

alter table public.email_consents enable row level security;
create policy "Members can read their own consents" on public.email_consents
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.email_consents from anon, authenticated;
grant select on public.email_consents to authenticated;

-- Every email the site sends. The row is claimed (status 'sending') before the email goes out,
-- and (user_id, dedupe_key) is unique, so a rerun or a second job can never send it again.
create table public.email_sends (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('digest', 'club_posts', 'reminder')),
  dedupe_key text not null,                      -- digest:2026-11-30, club_posts:2026-11-24, reminder:2623
  event_ids bigint[] not null default '{}',
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  provider_id text,                              -- Resend's id for the email
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, dedupe_key)
);
create index email_sends_kind_idx on public.email_sends (kind, created_at desc);

alter table public.email_sends enable row level security;
create policy "Admins can read email sends" on public.email_sends
  for select to authenticated using ((select private.is_admin()));
revoke all on public.email_sends from anon, authenticated;
grant select on public.email_sends to authenticated;

-- Turns one email choice on or off for `uid` and logs it. The only way the choices change.
create function private.record_email_choice(uid uuid, choice text, enabled boolean, how text, shown text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if choice not in ('digest', 'club_posts', 'reminders') then
    raise exception 'unknown email choice %', choice;
  end if;
  update public.profiles set
    email_digest = case when choice = 'digest' then enabled else email_digest end,
    email_club_posts = case when choice = 'club_posts' then enabled else email_club_posts end,
    email_reminders = case when choice = 'reminders' then enabled else email_reminders end
  where id = uid;
  if not found then
    raise exception 'no profile';
  end if;
  if enabled then
    insert into public.email_consents (user_id, type, source, wording)
    select uid, choice, how, left(shown, 500)
    where not exists (
      select 1 from public.email_consents where user_id = uid and type = choice and withdrawn_at is null
    );
  else
    update public.email_consents set withdrawn_at = now(), withdrawn_source = how
    where user_id = uid and type = choice and withdrawn_at is null;
  end if;
end $$;

-- A signed-in member's own choice: sign-up box, welcome step, settings, or a "Remind me" tap.
create function public.set_email_choice(choice text, enabled boolean, how text, shown text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  if (enabled and how not in ('signup', 'welcome', 'settings', 'remind_button'))
     or (not enabled and how <> 'settings') then
    raise exception 'not allowed: %', how;
  end if;
  perform private.record_email_choice((select auth.uid()), choice, enabled, how, shown);
end $$;

-- Unsubscribe from a link in an email, no sign-in needed: the profile's email_token is the key.
-- choice 'all' turns every email off. Returns false when the token matches no one.
create function public.unsubscribe(token uuid, choice text, how text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  c text;
begin
  if how not in ('unsubscribe_link', 'list_unsubscribe') then
    raise exception 'not allowed: %', how;
  end if;
  select id into uid from public.profiles where email_token = token;
  if uid is null then
    return false;
  end if;
  foreach c in array (case when choice = 'all' then array['digest', 'club_posts', 'reminders'] else array[choice] end) loop
    perform private.record_email_choice(uid, c, false, how, null);
  end loop;
  return true;
end $$;

-- Who gets which email, for the site's email job only (the service role).
create function public.email_recipients()
returns table (
  user_id uuid, email text, display_name text, email_token uuid,
  email_digest boolean, email_club_posts boolean, email_reminders boolean
)
language sql security definer set search_path = '' as $$
  select p.id, u.email::text, p.display_name, p.email_token, p.email_digest, p.email_club_posts, p.email_reminders
  from public.profiles p
  join auth.users u on u.id = p.id
  where (p.email_digest or p.email_club_posts or p.email_reminders) and u.email is not null
$$;

revoke all on function private.record_email_choice(uuid, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.set_email_choice(text, boolean, text, text) from public, anon;
grant execute on function public.set_email_choice(text, boolean, text, text) to authenticated;
revoke all on function public.unsubscribe(uuid, text, text) from public;
grant execute on function public.unsubscribe(uuid, text, text) to anon, authenticated;
revoke all on function public.email_recipients() from public, anon, authenticated;
grant execute on function public.email_recipients() to service_role;

-- ── Member activity, for Stats ─────────────────────────────────────────────────────────────

-- One row per member per campus day they used the site: nothing about what they did. Signed-out
-- visits stay in public.visits, never linked to an account. Admins aren't counted.
create table public.member_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
create index member_days_day_idx on public.member_days (day);

alter table public.member_days enable row level security;
create policy "Members log their own days" on public.member_days
  for insert to authenticated with check (user_id = (select auth.uid()) and not (select private.is_admin()));
revoke all on public.member_days from anon, authenticated;
grant insert on public.member_days to authenticated;

-- Totals for the admin's Stats page: counts only, never a member's rows. Weeks start on Monday.
create function public.member_totals()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not (select private.is_admin()) then
    raise exception 'admins only';
  end if;
  with days as (
    select user_id, (date_trunc('week', day))::date as week from public.member_days group by 1, 2
  ),
  weeks as (
    select d.week,
      count(*) as active,
      count(*) filter (where exists (select 1 from days e where e.user_id = d.user_id and e.week = d.week - 7)) as came_back
    from days d group by d.week
  ),
  joined as (
    select (date_trunc('week', created_at at time zone 'America/Toronto'))::date as week, count(*) as joined
    from public.profiles where member_number is not null group by 1
  )
  select jsonb_build_object(
    'members', (select count(*) from public.profiles where member_number is not null),
    'founding', (select count(*) from public.profiles where founding_member),
    'onboarded', (select count(*) from public.profiles where member_number is not null and onboarded_at is not null),
    'digest', (select count(*) from public.profiles where email_digest),
    'club_posts', (select count(*) from public.profiles where email_club_posts),
    'reminders', (select count(*) from public.event_reminders),
    'follows', (select count(*) from public.club_follows),
    'following_anyone', (select count(distinct user_id) from public.club_follows),
    'with_schedule', (select count(distinct user_id) from public.busy_blocks),
    'emails_sent_7d', (select count(*) from public.email_sends where status = 'sent' and sent_at > now() - interval '7 days'),
    'emails_failed_7d', (select count(*) from public.email_sends where status = 'failed' and created_at > now() - interval '7 days'),
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object('week', w.week, 'active', w.active, 'came_back', w.came_back,
                                          'joined', coalesce(j.joined, 0)) order by w.week desc)
      from (select * from weeks order by week desc limit 8) w
      left join joined j using (week)
    ), '[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.member_totals() from public, anon;
grant execute on function public.member_totals() to authenticated;
