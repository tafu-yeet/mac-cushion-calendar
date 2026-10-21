-- Events away from campus (a restaurant, an arena, a park, another school) get
-- their own section on the site. Set by the reader for new posts, from the
-- address for Rubric listings, and once for existing events by worker/off_campus.py.
alter table public.events add column off_campus boolean not null default false;
