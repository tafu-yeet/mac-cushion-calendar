-- Posts are read through Anthropic's Message Batches API (half price; results
-- in minutes to hours) instead of one call at a time (worker/batch_reader.py).
-- A post goes through up to two batches: the first reading, then, when it found
-- events, the check. Between them the first reading waits in posts.first_pass.

create table public.llm_batches (
  batch_id text primary key,               -- Anthropic's id, e.g. msgbatch_...
  stage text not null check (stage in ('extract', 'verify')),
  status text not null default 'open' check (status in ('open', 'done', 'failed')),
  request_count integer not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.posts
  add column read_batch text references public.llm_batches (batch_id) on delete set null,
  add column first_pass jsonb;             -- the first reading and its usage, while the check is pending

create index posts_read_batch_idx on public.posts (read_batch) where read_batch is not null;

-- The worker uses the secret key; nothing here is for the site.
alter table public.llm_batches enable row level security;
