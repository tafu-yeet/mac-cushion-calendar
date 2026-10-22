-- Feedback from the site: "Something wrong with this event?" on event pages,
-- "Missing an event? Tell us." under the lists, and "Send feedback" in the
-- footer. Visitors can only add rows; admins read them and tick them off.

create table public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  type text not null check (type in ('wrong_info', 'missing_event', 'idea', 'bug')),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  contact text check (char_length(contact) <= 200), -- an Instagram handle or email, if they left one
  event_id bigint references public.events (id) on delete set null,
  page_url text check (char_length(page_url) <= 500),
  user_agent text check (char_length(user_agent) <= 500),
  done boolean not null default false -- ticked off in the admin
);

create index feedback_created_at_idx on public.feedback (created_at desc);
create index feedback_event_id_idx on public.feedback (event_id);

alter table public.feedback enable row level security;

create policy "Anyone can send feedback" on public.feedback
  for insert to anon, authenticated with check (not done);
create policy "Admins can read feedback" on public.feedback
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can mark feedback done" on public.feedback
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
