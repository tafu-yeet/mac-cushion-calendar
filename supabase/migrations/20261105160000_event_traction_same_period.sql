-- Calendar adds go back to Oct 26 and seen and opened only to Nov 5, so comparing
-- them inflated "added per 100 seen". Count adds from when engagement counting began.
create or replace view public.event_traction with (security_invoker = true) as
select event_id, highlighted,
  count(*) filter (where action = 'seen') as seen,
  count(*) filter (where action = 'open') as opened,
  count(*) filter (where action = 'add') as added
from (
  select event_id, highlighted, action from public.event_engagement
  union all
  select event_id, highlighted, 'add' from public.calendar_adds
  where created_at >= (select min(created_at) from public.event_engagement)
) counts
group by event_id, highlighted;
