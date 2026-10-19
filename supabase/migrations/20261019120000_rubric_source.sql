-- Rubric (campus.hellorubric.com), the MSU's club platform, as a second event
-- source next to Instagram. The worker stores Rubric's records as received
-- (rubric_events), maps Rubric clubs to ours (rubric_societies), and merges each
-- Rubric event into the matching Instagram event or adds it on its own
-- (worker/rubric.py, worker/merge.py).

-- Rubric clubs and which of our Instagram accounts they are --------------------

create table public.rubric_societies (
  society_id bigint primary key,
  name text not null,
  instagram_username text,                       -- from the club's own Rubric profile, when it gives one
  aliases text[] not null default '{}',          -- other names it goes by: "MSB", "McMaster School of Bhangra"
  club_id bigint references public.clubs (id) on delete set null,
  extra_club_ids bigint[] not null default '{}', -- more Instagram accounts of the same club
  match_method text check (match_method in ('instagram', 'name', 'person')),
  match_score real,
  match_status text not null default 'none'
    check (match_status in ('confirmed', 'review', 'none', 'rejected')),
  raw jsonb,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rubric_societies_club_id_idx on public.rubric_societies (club_id);

-- Rubric events as received -------------------------------------------------------

create table public.rubric_events (
  eid bigint primary key,
  society_id bigint not null references public.rubric_societies (society_id),
  title text not null,
  category text,                         -- Rubric's event type, e.g. "Party/BBQ/Social"
  price_info text,                       -- as listed: "Free", "$5.00 - $10.00"
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,                         -- tidied: "MUSC Clubspace, McMaster University Student Centre"
  address text,                          -- as given
  description text,                      -- plain text
  tickets jsonb not null default '[]',   -- [{name, amount, open}]
  collaborator_ids bigint[] not null default '{}',
  image_url text,
  url text not null,
  rubric_status text,                    -- Rubric's eventStatus, e.g. "Online"
  search jsonb not null,                 -- the search result as received
  detail jsonb,                          -- the event details as received
  content_hash text not null,            -- of the fields above, to notice changes
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),  -- when those fields last changed; Rubric gives no edit time
  missing_since timestamptz,             -- no longer listed; kept, never deleted
  detail_fetched_at timestamptz
);

create index rubric_events_starts_at_idx on public.rubric_events (starts_at);
create index rubric_events_society_id_idx on public.rubric_events (society_id);

-- Events: either source, or both ------------------------------------------------

alter table public.events
  alter column post_id drop not null,
  add column source text not null default 'instagram' check (source in ('instagram', 'rubric', 'both')),
  add column rubric_eid bigint unique references public.rubric_events (eid),
  add column food_source text check (food_source in ('instagram', 'rubric', 'both')),
  add column signup_required boolean,
  add column ticket_url text,
  add column image_url text,                       -- Rubric's image, for events without a post
  add column description text,                     -- Rubric's description, for events without a post
  add column reviewed_fields text[] not null default '{}',  -- fields a person set; merging never overwrites them
  add column flags text[] not null default '{}',   -- e.g. instagram_post_deleted, rubric_missing, changed_on_instagram
  add column conflicts jsonb not null default '{}', -- {field: {rubric, instagram}} for a person to settle
  add constraint events_have_a_source check (post_id is not null or rubric_eid is not null);

create index events_rubric_eid_idx on public.events (rubric_eid);

-- A post that has gone from the club's profile (deleted or archived). The event
-- it announced stays: a deleted post doesn't mean the event was cancelled.
alter table public.posts add column deleted_at timestamptz;

-- Rubric and Instagram events that may be the same, waiting for a person -----------

create table public.event_matches (
  rubric_eid bigint not null references public.rubric_events (eid) on delete cascade,
  event_id bigint not null references public.events (id) on delete cascade,
  score real not null,
  reasons jsonb not null default '{}',
  status text not null default 'review' check (status in ('review', 'merged', 'separate')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (rubric_eid, event_id)
);

create index event_matches_event_id_idx on public.event_matches (event_id);
create index event_matches_decided_by_idx on public.event_matches (decided_by);

-- Row level security: the worker writes with the secret key; admins read and decide.

alter table public.rubric_societies enable row level security;
alter table public.rubric_events enable row level security;
alter table public.event_matches enable row level security;

grant select, update on public.rubric_societies, public.event_matches to authenticated;
grant select on public.rubric_events to authenticated;

create policy "Admins can read Rubric clubs" on public.rubric_societies
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can update Rubric clubs" on public.rubric_societies
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can read Rubric events" on public.rubric_events
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can read event matches" on public.event_matches
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can decide event matches" on public.event_matches
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
