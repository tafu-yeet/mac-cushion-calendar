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
   `post-images` bucket.
3. **Extract:** Claude Haiku reads each new post (caption + image). When it
   finds free food, Claude Sonnet rechecks the post and its dates win;
   disagreements become review notes (`worker/extractors/two_stage.py`).
4. **Review:** free-food events at 0.9+ confidence that Sonnet agreed with,
   with a start time, open to all, run by the posting club, and unlike any
   event already known, are published right away and marked "auto-approved"
   (`worker/auto_approve.py`; `AUTO_APPROVE_MIN_CONFIDENCE=none` turns this
   off). Everything else waits as `pending` until it's approved at `/admin`.

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
