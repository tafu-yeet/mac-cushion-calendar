-- Communities (campus.config.json "communities"): Pride, a faith, a culture,
-- a program... for the /communities page. A club's apply to all its events;
-- an event can add its own ("women-only" from a club that isn't a women's
-- club). worker/communities.py decides both with Claude.
alter table public.clubs
  add column communities text[] not null default '{}',
  add column communities_checked_at timestamptz;

alter table public.events
  add column communities text[] not null default '{}',
  add column communities_checked_at timestamptz;

create index events_communities_idx on public.events using gin (communities);
