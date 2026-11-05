-- Highlighted events: an admin picks one, the site bumps it to the top of its day.
-- A test of whether that gets an event more traction, so the site also counts, per
-- event, how often it's seen in a list, opened from one, and added to a calendar.
-- Nothing about the person is kept. Each count notes whether the event was
-- highlighted at the time, set here rather than trusted from the browser.

alter table public.events
  add column highlighted boolean not null default false,
  add column highlighted_at timestamptz;

create index events_highlighted_idx on public.events (starts_at) where highlighted;

create table public.event_engagement (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_id bigint not null references public.events (id) on delete cascade,
  action text not null check (action in ('seen', 'open')),  -- on screen in a list; tapped through from one
  highlighted boolean not null default false
);

create index event_engagement_event_id_idx on public.event_engagement (event_id);
create index event_engagement_created_at_idx on public.event_engagement (created_at desc);

alter table public.event_engagement enable row level security;

-- Visitors can add a count, never read one; only these columns (the rest are the database's).
create policy "Visitors can log engagement" on public.event_engagement
  for insert to anon with check (true);
create policy "Admins can read engagement" on public.event_engagement
  for select to authenticated using ((select private.is_admin()));

revoke insert on public.event_engagement from anon;
grant insert (event_id, action) on public.event_engagement to anon;

alter table public.calendar_adds add column highlighted boolean not null default false;

create function private.note_highlighted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.highlighted := coalesce((select e.highlighted from public.events e where e.id = new.event_id), false);
  return new;
end;
$$;

create trigger event_engagement_note_highlighted
  before insert on public.event_engagement
  for each row execute function private.note_highlighted();
create trigger calendar_adds_note_highlighted
  before insert on public.calendar_adds
  for each row execute function private.note_highlighted();

-- Per event, while highlighted and while not, for the admin's Stats page.
create view public.event_traction with (security_invoker = true) as
select event_id, highlighted,
  count(*) filter (where action = 'seen') as seen,
  count(*) filter (where action = 'open') as opened,
  count(*) filter (where action = 'add') as added
from (
  select event_id, highlighted, action from public.event_engagement
  union all
  select event_id, highlighted, 'add' from public.calendar_adds
) counts
group by event_id, highlighted;

revoke all on public.event_traction from anon;
grant select on public.event_traction to authenticated;
