-- Who actually runs an event when the posting account isn't the host, e.g. a
-- hub page (macclubhub, msuclubs) promoting another club's event, or a
-- collaboration. Null when the posting club runs it.

alter table public.events add column hosted_by text;
