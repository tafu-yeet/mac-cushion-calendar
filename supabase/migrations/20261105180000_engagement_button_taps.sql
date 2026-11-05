-- Cards show the whole event, so people rarely need to open one: "opened" alone
-- undersells interest. Also count taps on a card's or event page's buttons: opening
-- the Add to calendar menu, the Instagram post, and tickets or sign-up.
alter table public.event_engagement drop constraint event_engagement_action_check;
alter table public.event_engagement add constraint event_engagement_action_check
  check (action in ('seen', 'open', 'calendar_menu', 'instagram', 'tickets'));

create or replace view public.event_traction with (security_invoker = true) as
select event_id, highlighted,
  count(*) filter (where action = 'seen') as seen,
  count(*) filter (where action = 'open') as opened,
  count(*) filter (where action = 'add') as added,
  count(*) filter (where action = 'calendar_menu') as calendar_menu,
  count(*) filter (where action = 'instagram') as instagram,
  count(*) filter (where action = 'tickets') as tickets
from (
  select event_id, highlighted, action from public.event_engagement
  union all
  select event_id, highlighted, 'add' from public.calendar_adds
  where created_at >= (select min(created_at) from public.event_engagement)
) counts
group by event_id, highlighted;
