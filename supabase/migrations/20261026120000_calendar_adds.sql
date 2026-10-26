-- One row each time someone adds an event to their calendar through the site:
-- Google, Outlook, or the .ics file (Apple Calendar and others). The routes
-- that hand out the link or file record it, so nothing is tracked in the
-- browser and nothing about the person is kept. Admins see the totals.
create table public.calendar_adds (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_id bigint not null references public.events (id) on delete cascade,
  app text not null check (app in ('google', 'outlook', 'ics'))
);

create index calendar_adds_created_at_idx on public.calendar_adds (created_at desc);
create index calendar_adds_event_id_idx on public.calendar_adds (event_id);

alter table public.calendar_adds enable row level security;

create policy "The site records calendar adds" on public.calendar_adds
  for insert to anon, authenticated with check (true);
create policy "Admins can read calendar adds" on public.calendar_adds
  for select to authenticated using ((select private.is_admin()));
