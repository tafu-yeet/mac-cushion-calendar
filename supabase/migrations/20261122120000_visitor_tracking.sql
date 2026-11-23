-- Anonymous visitors, to measure weekly active visitors and whether they come back.
-- The browser makes up a random id (crypto.randomUUID) on its first visit and keeps it
-- in localStorage as "mcc_vid" (src/lib/visitor.ts). Nothing else about the person is
-- stored with it: no IP address, user agent, name or email. Admins and automated
-- browsers aren't counted. Only admins (the Stats page) and the service role read any of it.

-- The id on the counts the site already keeps. Older rows stay null.
alter table public.event_engagement add column visitor_id uuid;
alter table public.calendar_adds add column visitor_id uuid;

create index event_engagement_visitor_idx on public.event_engagement (visitor_id, created_at);
create index calendar_adds_visitor_idx on public.calendar_adds (visitor_id, created_at);

-- Visitors send event_engagement rows themselves, with insert rights on named columns
-- only; add the new one. calendar_adds rows come from the site's server, whose insert
-- right already covers every column.
grant insert (visitor_id) on public.event_engagement to anon;

-- One row per visitor per day they come (src/components/visit-tracker.tsx).
create table public.visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  visitor_id uuid not null,
  path text check (char_length(path) <= 300),
  -- Where they came from, as a category only: the referrer, utm_source or user agent it
  -- was worked out from isn't kept.
  referrer_source text check (referrer_source in ('instagram', 'direct', 'google', 'other')),
  is_new boolean not null default false  -- this browser's first visit
);

create index visits_visitor_idx on public.visits (visitor_id, created_at);
create index visits_created_at_idx on public.visits (created_at desc);

alter table public.visits enable row level security;

-- Visitors can add a visit, never read, change or delete one. Only these columns: the id
-- and time are the database's.
create policy "Visitors can log a visit" on public.visits
  for insert to anon with check (true);

-- Admins read them on the Stats page, like event_engagement and calendar_adds.
create policy "Admins can read visits" on public.visits
  for select to authenticated using ((select private.is_admin()));

revoke all on public.visits from anon, authenticated;
grant insert (visitor_id, path, referrer_source, is_new) on public.visits to anon;
grant select on public.visits to authenticated;

-- ── Metrics, for admins and the service role ──────────────────────────────────────────
-- Weeks start on Monday, campus time. A visitor's first week is the week of their first
-- visit; anyone seen before is returning.

-- Each week: visitors who came, how many were new, how many came back.
create view public.weekly_active with (security_invoker = true) as
with v as (
  select visitor_id, (date_trunc('week', created_at at time zone 'America/Toronto'))::date as week
  from public.visits
),
firsts as (
  select visitor_id, min(week) as first_week from v group by visitor_id
)
select v.week,
  count(distinct v.visitor_id) as visitors,
  count(distinct v.visitor_id) filter (where f.first_week = v.week) as new_visitors,
  count(distinct v.visitor_id) filter (where f.first_week < v.week) as returning_visitors
from v join firsts f using (visitor_id)
group by v.week
order by v.week;

-- Each week's new visitors: the share who came back 1, 2 and 4 weeks later. Null until
-- that week has started.
create view public.weekly_retention with (security_invoker = true) as
with v as (
  select distinct visitor_id, (date_trunc('week', created_at at time zone 'America/Toronto'))::date as week
  from public.visits
),
cohorts as (
  select visitor_id, min(week) as cohort_week from v group by visitor_id
),
came_back as (
  select c.cohort_week,
    exists (select 1 from v where v.visitor_id = c.visitor_id and v.week = c.cohort_week + 7) as week_1,
    exists (select 1 from v where v.visitor_id = c.visitor_id and v.week = c.cohort_week + 14) as week_2,
    exists (select 1 from v where v.visitor_id = c.visitor_id and v.week = c.cohort_week + 28) as week_4
  from cohorts c
),
this_week as (
  select (date_trunc('week', now() at time zone 'America/Toronto'))::date as week
)
select b.cohort_week,
  count(*) as new_visitors,
  case when b.cohort_week + 7 <= t.week then round(100.0 * count(*) filter (where b.week_1) / count(*), 1) end as week_1_pct,
  case when b.cohort_week + 14 <= t.week then round(100.0 * count(*) filter (where b.week_2) / count(*), 1) end as week_2_pct,
  case when b.cohort_week + 28 <= t.week then round(100.0 * count(*) filter (where b.week_4) / count(*), 1) end as week_4_pct
from came_back b cross join this_week t
group by b.cohort_week, t.week
order by b.cohort_week;

-- Each week: per visitor who came, how many events they opened, Instagram and ticket or
-- sign-up taps, and calendar adds. Counts only rows that carry a visitor id.
create view public.engagement_per_visitor with (security_invoker = true) as
with active as (
  select (date_trunc('week', created_at at time zone 'America/Toronto'))::date as week,
    count(distinct visitor_id) as visitors
  from public.visits
  group by 1
),
taps as (
  select (date_trunc('week', created_at at time zone 'America/Toronto'))::date as week,
    count(*) filter (where action = 'open') as opens,
    count(*) filter (where action = 'instagram') as instagram,
    count(*) filter (where action = 'tickets') as tickets
  from public.event_engagement
  where visitor_id is not null
  group by 1
),
adds as (
  select (date_trunc('week', created_at at time zone 'America/Toronto'))::date as week, count(*) as calendar_adds
  from public.calendar_adds
  where visitor_id is not null
  group by 1
)
select a.week, a.visitors,
  round(coalesce(t.opens, 0)::numeric / a.visitors, 2) as opens_per_visitor,
  round(coalesce(t.instagram, 0)::numeric / a.visitors, 2) as instagram_per_visitor,
  round(coalesce(t.tickets, 0)::numeric / a.visitors, 2) as tickets_per_visitor,
  round(coalesce(d.calendar_adds, 0)::numeric / a.visitors, 2) as calendar_adds_per_visitor
from active a
left join taps t using (week)
left join adds d using (week)
order by a.week;

-- The views run as the reader (security_invoker), so a signed-in reader who isn't an
-- admin passes the grant but the tables' admin-only policies leave every count empty.
-- Visitors (anon) can't select them at all.
revoke all on public.weekly_active, public.weekly_retention, public.engagement_per_visitor from anon, authenticated;
grant select on public.weekly_active, public.weekly_retention, public.engagement_per_visitor to authenticated, service_role;
