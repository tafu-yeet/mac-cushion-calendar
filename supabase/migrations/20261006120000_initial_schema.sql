-- Mac Cushion Calendar: clubs, raw Instagram posts, extracted events (review
-- queue), fetch logs, admins, and the private bucket for post images.
--
-- The worker writes with the service-role/secret key, which bypasses RLS.
-- Anonymous visitors can read clubs and approved events (plus the posts behind
-- them). Admins (rows in public.admins) can read and change everything.

-- Admins ----------------------------------------------------------------------

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
-- No policies: admins are added from the SQL editor or with the secret key.

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Clubs -----------------------------------------------------------------------

create table public.clubs (
  id bigint generated always as identity primary key,
  instagram_username text not null unique
    check (instagram_username ~ '^[a-z0-9._]{1,30}$'),
  name text not null,
  active boolean not null default true,
  poll_interval_minutes integer not null default 120 check (poll_interval_minutes > 0),
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Raw posts -------------------------------------------------------------------

create table public.posts (
  id text primary key,                       -- Instagram media id
  club_id bigint not null references public.clubs (id) on delete cascade,
  username text not null,
  shortcode text not null unique,
  caption text not null default '',
  posted_at timestamptz not null,
  image_url text,                            -- CDN URL (signed, expires)
  image_path text,                           -- object in the post-images bucket
  permalink text not null,
  media_type text,
  fetched_via text not null,                 -- backend: primary | apify
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'done', 'failed', 'skipped')),
  extraction jsonb,                          -- post-level model output
  extraction_error text,
  extracted_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index posts_club_posted_at_idx on public.posts (club_id, posted_at desc);
create index posts_pending_extraction_idx on public.posts (posted_at)
  where extraction_status = 'pending';

-- Events (review queue) -------------------------------------------------------

create table public.events (
  id bigint generated always as identity primary key,
  post_id text not null references public.posts (id) on delete cascade,
  club_id bigint not null references public.clubs (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  name text not null,
  event_type text not null default 'other',  -- free text, e.g. social, workshop
  tags text[] not null default '{}',
  has_free_food boolean not null default false,
  food_description text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  open_to_all boolean,
  confidence real check (confidence between 0 and 1),
  reason text,
  extracted jsonb,                           -- original model output, kept after edits
  model text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_status_starts_at_idx on public.events (status, starts_at);
create index events_post_id_idx on public.events (post_id);
create index events_club_id_idx on public.events (club_id);
create index events_reviewed_by_idx on public.events (reviewed_by);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- Fetch log: one row per request to Instagram or Apify ------------------------

create table public.fetch_logs (
  id bigint generated always as identity primary key,
  club_id bigint references public.clubs (id) on delete cascade,
  username text not null,
  backend text not null,                     -- primary | apify
  attempt integer not null,
  http_status integer,
  outcome text not null check (outcome in ('ok', 'retry', 'failed')),
  response_bytes integer not null default 0,
  via text,                                  -- proxy host:port, never credentials
  detail text,
  created_at timestamptz not null default now()
);

create index fetch_logs_club_created_at_idx on public.fetch_logs (club_id, created_at desc);

-- Row level security ----------------------------------------------------------

alter table public.clubs enable row level security;
alter table public.posts enable row level security;
alter table public.events enable row level security;
alter table public.fetch_logs enable row level security;

grant select on public.clubs, public.posts, public.events to anon;
grant select, insert, update, delete on public.clubs, public.posts, public.events to authenticated;
grant select on public.fetch_logs to authenticated;

-- Clubs: public list; admins manage.
create policy "Anyone can read clubs" on public.clubs
  for select to anon, authenticated using (true);
create policy "Admins can add clubs" on public.clubs
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admins can update clubs" on public.clubs
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete clubs" on public.clubs
  for delete to authenticated using ((select public.is_admin()));

-- Events: approved events are public (the site decides which kinds to show);
-- admins see and edit the whole queue.
create policy "Anyone can read approved events; admins read all" on public.events
  for select to anon, authenticated
  using (status = 'approved' or (select public.is_admin()));
create policy "Admins can add events" on public.events
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admins can update events" on public.events
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete events" on public.events
  for delete to authenticated using ((select public.is_admin()));

-- Posts: public only behind an approved event (for the link to the original).
create policy "Anyone can read posts of approved events; admins read all" on public.posts
  for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.events e
      where e.post_id = posts.id and e.status = 'approved'
    )
  );
create policy "Admins can update posts" on public.posts
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete posts" on public.posts
  for delete to authenticated using ((select public.is_admin()));

-- Fetch logs: admins only.
create policy "Admins can read fetch logs" on public.fetch_logs
  for select to authenticated using ((select public.is_admin()));

-- Post images -----------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', false)
on conflict (id) do nothing;

create policy "Admins can read post images" on storage.objects
  for select to authenticated
  using (bucket_id = 'post-images' and (select public.is_admin()));
