-- Weekly programs: free soup Tuesday to Friday, a lunch every Tuesday. A person
-- enters one once (the admin's Weekly page); the worker (worker/series.py) lists
-- each day of it as an event, six weeks ahead, until it ends. A club's own post
-- about one of those days (the week's menu) is listed instead of that day's entry.

create table public.event_series (
  id bigint generated always as identity primary key,
  club_id bigint not null references public.clubs (id) on delete cascade,
  name text not null,
  category text not null default 'social'
    check (category in ('social', 'sports', 'arts', 'learn', 'give', 'meetings', 'other')),
  days smallint[] not null check (cardinality(days) > 0 and days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),  -- ISO: 1 Monday ... 7 Sunday
  start_time time not null,
  end_time time,
  location text,
  has_free_food boolean not null default false,
  food_description text,
  cost text not null default 'free' check (cost in ('free', 'paid', 'unknown')),
  open_to_all boolean not null default true,
  description text,
  source_url text check (source_url ~ '^https://'),  -- the post or page that announced it
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  skip_dates date[] not null default '{}',             -- reading week, a holiday
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_series_club_id_idx on public.event_series (club_id);

create trigger event_series_set_updated_at
  before update on public.event_series
  for each row execute function public.set_updated_at();

alter table public.event_series enable row level security;

-- Public, like the events it lists (the site shows "every Tuesday" from it); admins edit.
create policy "Anyone can read weekly programs" on public.event_series
  for select to anon, authenticated using (true);
create policy "Admins can add weekly programs" on public.event_series
  for insert to authenticated with check ((select private.is_admin()));
create policy "Admins can update weekly programs" on public.event_series
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete weekly programs" on public.event_series
  for delete to authenticated using ((select private.is_admin()));

-- Each day of a program is an event like any other, from neither a post nor Rubric.
alter table public.events
  add column series_id bigint references public.event_series (id) on delete cascade,
  drop constraint events_source_check,
  add constraint events_source_check check (source in ('instagram', 'rubric', 'both', 'series')),
  drop constraint events_have_a_source,
  add constraint events_have_a_source check (post_id is not null or rubric_eid is not null or series_id is not null);

create unique index events_series_day_key on public.events (series_id, starts_at);
