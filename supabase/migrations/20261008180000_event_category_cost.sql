-- The public site lists every event, not just free-food ones, so each event
-- gets a category for filtering and a cost.
alter table public.events
  add column category text not null default 'other'
    check (category in ('social', 'sports', 'arts', 'learn', 'give', 'meetings', 'other')),
  add column cost text not null default 'unknown' check (cost in ('free', 'paid', 'unknown')),
  add column price text;

-- Events read before this get a best guess from their type; the extractor
-- picks the category itself from now on.
update public.events set category = case event_type
  when 'social' then 'social'
  when 'sports' then 'sports'
  when 'cultural' then 'arts'
  when 'performance' then 'arts'
  when 'workshop' then 'learn'
  when 'info session' then 'learn'
  when 'career' then 'learn'
  when 'conference' then 'learn'
  when 'competition' then 'learn'
  when 'fundraiser' then 'give'
  when 'volunteering' then 'give'
  when 'meeting' then 'meetings'
  else 'other'
end;
