-- Standing highlights: "keep highlighting X every Friday". Each rule names a club, a
-- pattern its event names match, and a weekday; a pg_cron job keeps the NEXT matching
-- event highlighted and un-highlights later ones, so the home page's "Coming up" spot
-- shows one card, not a stack of copies of a weekly event. Past events keep their
-- highlight (and highlighted_at) for the admin's Stats page.

create extension if not exists pg_cron;

create table private.standing_highlights (
  id bigint generated always as identity primary key,
  club_id bigint not null references public.clubs (id) on delete cascade,
  name_pattern text not null, -- case-insensitive regex on events.name
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 Monday … 7 Sunday
  timezone text not null, -- campus.config.json "timezone", for which day an event is on
  note text,
  created_at timestamptz not null default now()
);

create or replace function private.roll_standing_highlights() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  next_start timestamptz;
begin
  for r in select * from private.standing_highlights loop
    -- The next one that hasn't ended (no end time: assume 3 hours).
    select e.starts_at into next_start
    from public.events e
    where e.club_id = r.club_id
      and e.status = 'approved'
      and e.schedule_status <> 'cancelled'
      and e.name ~* r.name_pattern
      and extract(isodow from e.starts_at at time zone r.timezone) = r.weekday
      and coalesce(e.ends_at, e.starts_at + interval '3 hours') > now()
    order by e.starts_at
    limit 1;

    -- Later ones lose the highlight until their turn.
    update public.events e
    set highlighted = false, highlighted_at = null
    where e.club_id = r.club_id
      and e.name ~* r.name_pattern
      and e.highlighted
      and e.starts_at > now()
      and e.starts_at is distinct from next_start;

    -- The next one (every copy at that start, e.g. a Rubric and an Instagram listing) gets it.
    if next_start is not null then
      update public.events e
      set highlighted = true, highlighted_at = now()
      where e.club_id = r.club_id
        and e.name ~* r.name_pattern
        and e.status = 'approved'
        and e.starts_at = next_start
        and not e.highlighted;
    end if;
  end loop;
end;
$$;

revoke all on function private.roll_standing_highlights() from public, anon, authenticated;

-- Every 15 minutes, like the worker: right after one Friday's event ends, the next one takes over.
select cron.schedule('roll-standing-highlights', '*/15 * * * *', $$select private.roll_standing_highlights()$$);

-- The user's request (2026-11-13): highlight the Board Game Society's Friday board game night, every Friday.
insert into private.standing_highlights (club_id, name_pattern, weekday, timezone, note)
select id, 'board game', 5, 'America/Toronto', 'Friday Drop-In Board Game Nights (user asked: highlight every Friday)'
from public.clubs
where instagram_username = 'mcmasterboardgamesociety';

select private.roll_standing_highlights();
