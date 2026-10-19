# Mac Cushion Calendar

Every public McMaster event in one place, starting with the ones that have free
food. A worker reads club Instagram posts, an LLM pulls out the events, and an
admin approves them; only confident, double-checked events skip the wait.

## Philosophy

Campus life is scattered across hundreds of club Instagram accounts. Unless you
follow the right pages and catch the right story, you miss things. Cushion puts
every public campus event in one place, organized and searchable: a search
engine for things to do.

It's built for one moment. You've got downtime tomorrow and want something to
do. You open Cushion, say when you're free, and see everything happening in
that window: free food, socials, games, talks, sports, shows. Finding something
fun should take seconds, not an evening of scrolling.

What that means for how it's built:

- **Everything in one place.** Every club and every kind of event, big or
  small, is listed the same way. You shouldn't need to know a club exists to
  find its events.
- **Find, don't scroll.** Events are organized by when, what, and where. You
  filter by the time you're free, what you're in the mood for, and whether it
  costs anything.
- **Right, or it doesn't show.** A wrong time or room is worse than no listing.
  Details come from the club's own post and are double-checked before they're
  published. Anything the post leaves unclear is shown as unclear ("time TBD"),
  never guessed.
- **Credit the clubs.** Cushion sends people to clubs; it doesn't replace them.
  Every listing links back to the original post.
- **Quick on a phone.** No account and no app: open the site and see what's on
  now and next.
- **Free food is the hook.** It's the most universal reason to show up, so it
  came first and stays one tap away. The goal is everything worth showing up
  for.

## Project layout

| Folder | What it is |
| --- | --- |
| `worker/` | Python worker: fetches posts, stores them and their images, extracts events |
| `src/` | Next.js site: public pages, admin review queue, and club list |
| `supabase/migrations/` | Database schema and row level security |
| `campus.config.json` | School-specific values (name, timezone, campus buildings), shared by both |

## How the worker works

1. **Fetch:** each active club is checked on its own interval. The public
   profile page is loaded through residential proxies (`worker/fetchers/profile_page.py`);
   if every attempt is blocked, Apify's Instagram Scraper is the fallback.
2. **Store:** new posts are saved, and their images go to the private
   `post-images` bucket. Reels and other videos are saved but not read: clubs
   post a flyer for anything they promote, so a reel mostly duplicates it
   (`SKIP_REELS=false` reads them again).
3. **Extract:** Claude Haiku reads each new post (caption + image) and pulls
   out its events: category, cost, free food, date, time, place. When it
   finds an event, Claude Sonnet rechecks the post and its reading wins;
   disagreements become review notes (`worker/extractors/two_stage.py`).
4. **Review:** an event publishes itself when Sonnet read it the same way as
   Haiku (or, where they disagreed, an Opus tie-breaker sided with Sonnet), it
   has a start time, the confidence is 0.9+ with free food or 0.75+ without,
   and it isn't another club's event or an off-campus collab. Copies sort
   themselves out (a copy of a published event, the less complete of two
   pending copies, a teaser once the dated post arrives, and a date a newer
   post moved are rejected with a note), and pending events expire when their
   date passes. Everything else waits as `pending` at `/admin`. See
   `worker/auto_approve.py`; `AUTO_APPROVE_MIN_CONFIDENCE=none` turns
   auto-approval off.
5. **Rubric:** hourly, the worker also reads McMaster's listing on Rubric
   (campus.hellorubric.com, the MSU's club platform; `worker/rubric.py`) at
   most one request a second, and maps each Rubric club to our Instagram
   account, by the Instagram link the club gave Rubric or by name (unsure
   links wait at `/admin/clubs`). `worker/merge.py` then matches Rubric events
   to Instagram ones (same club, same day, starting within an hour) and takes
   each field from the more trustworthy source: Rubric for time, place, price
   and tickets; Instagram for free food, description and image. Disagreements
   and unsure matches wait at `/admin` ("Needs a look"); a deleted post or an
   event gone from Rubric is flagged, never deleted. `RUBRIC_MERGE=apply`
   (the default) saves the merge; `RUBRIC_MERGE=report` only prints it
   (`python merge.py --from 2026-10-19 --to 2026-10-25` for a range).

Every request is logged: `fetch_logs` (club, backend, status, bytes) and
`llm_usage` (tokens and estimated cost; `python usage.py` for totals).

## Running the worker

Needs Python 3.10+ and `worker/.env` (copy `worker/.env.example`; keys are never committed).

```
cd worker
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python check_setup.py     # verifies keys, database, Claude, proxy, images
.venv\Scripts\python run.py             # one cycle
```

### Scheduling on a Windows server

Clone the repo, copy `worker/.env` into the clone, then from an administrator
PowerShell in the `worker` folder:

```
powershell -ExecutionPolicy Bypass -File deploy\setup-windows.ps1
```

It installs the packages, runs `check_setup.py`, and registers a scheduled task
that runs every 15 minutes (never overlapping itself) with daily logs in
`worker/logs/`.

## Running the site

Needs Node 20+ and `.env.local` (copy `.env.example`).

```
npm install
npm run dev        # http://localhost:3000/admin
```
