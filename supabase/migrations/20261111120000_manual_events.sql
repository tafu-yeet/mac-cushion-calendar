-- Events added by hand, for ones a club announced somewhere we don't read (a story,
-- a dated "TBD" on a schedule flyer). They have no post, Rubric listing or series,
-- so the site links their Instagram button to the club's profile instead.
alter table public.events
  drop constraint events_source_check,
  add constraint events_source_check check (source in ('instagram', 'rubric', 'both', 'series', 'manual')),
  drop constraint events_have_a_source,
  add constraint events_have_a_source check (post_id is not null or rubric_eid is not null or series_id is not null or source = 'manual');
