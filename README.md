# Mac Cushion Calendar

Shows McMaster students which public campus events are giving out free food.
A worker reads club Instagram posts, an LLM pulls out the events, and an admin
approves them before anything is published.

| Folder | What it is |
| --- | --- |
| `worker/` | Python worker: fetches posts, stores them and their images, extracts events |
| `src/` | Next.js site: admin review queue and club list (public pages to come) |
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
4. **Review:** every event lands in the queue as `pending`. Nothing is
   published until it's approved at `/admin`.

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
