-- Follower counts, read from the profile page the worker already fetches. Used to
-- decide which clubs to reach out to first (worker/club_scores.py).
alter table public.clubs
  add column followers integer,
  add column followers_at timestamptz;
