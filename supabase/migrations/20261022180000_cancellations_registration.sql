-- Cancellations and registration, before the public launch.

-- Whether the event is still on. events.status is the review state
-- (pending/approved/...); this is what the club says about the event itself.
-- Cancelled events stay listed with a badge until their date has passed.
alter table public.events
  add column schedule_status text not null default 'scheduled'
    check (schedule_status in ('scheduled', 'cancelled', 'postponed'));

-- Registration, from the caption first, then Rubric (worker/registration.py):
-- required, recommended ("RSVP appreciated"), drop_in, or unknown (the default:
-- the source doesn't say). Where to register, a link if there is one, and the
-- words it was decided from. signup_required is the old yes/no, no longer shown.
alter table public.events
  add column registration text not null default 'unknown'
    check (registration in ('required', 'recommended', 'drop_in', 'unknown')),
  add column registration_where text
    check (registration_where in ('rubric', 'link_in_bio', 'form', 'qr_code', 'at_the_door', 'other')),
  add column registration_url text check (char_length(registration_url) <= 500),
  add column registration_note text check (char_length(registration_note) <= 300),
  add column registration_checked_at timestamptz;

-- When the event's source (its Instagram post, or its Rubric listing) was last
-- seen still there: "Last checked: 3 hours ago" on the event page.
alter table public.events add column checked_at timestamptz;

update public.events e set checked_at = r.last_seen_at
from public.rubric_events r
where r.eid = e.rubric_eid and r.missing_since is null;

-- A caption the club edited after we first stored it: the old one is kept, and
-- the post's events are re-read and compared (worker/recheck.py).
alter table public.posts
  add column previous_caption text,
  add column caption_changed_at timestamptz,
  add column rechecked_at timestamptz; -- last re-read after a caption change

-- "This got cancelled" on event pages sends feedback of its own type; two
-- reports for the same event flag it for review.
alter table public.feedback drop constraint feedback_type_check;
alter table public.feedback add constraint feedback_type_check
  check (type in ('wrong_info', 'missing_event', 'idea', 'bug', 'cancelled'));

create function private.flag_reported_cancellations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'cancelled' and new.event_id is not null
     and (select count(*) from public.feedback f
          where f.type = 'cancelled' and f.event_id = new.event_id and not f.done) >= 2 then
    update public.events
    set flags = array_append(flags, 'reported_cancelled'),
        review_notes = array_append(review_notes, 'Two or more visitors reported this event as cancelled (admin Feedback page).')
    where id = new.event_id and not ('reported_cancelled' = any (flags));
  end if;
  return new;
end;
$$;

create trigger feedback_flag_cancellations
  after insert on public.feedback
  for each row execute function private.flag_reported_cancellations();
