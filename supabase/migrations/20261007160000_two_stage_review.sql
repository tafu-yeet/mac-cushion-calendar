-- Two-stage extraction: a cheap first pass, then a stronger model rechecks
-- posts with free food.
--   start_time_known: false when the post gives a date but no start time
--                     (starts_at is then midnight that day).
--   review_notes:     disagreements between the two passes, shown to the reviewer.
--   llm_usage.purpose: which stage made the call (extract | verify).

alter table public.events
  add column start_time_known boolean not null default true,
  add column review_notes text[] not null default '{}';

alter table public.llm_usage
  add column purpose text;
