-- One row per Claude API call made by the extractor, for tracking token usage
-- and estimated cost.

create table public.claude_usage (
  id bigint generated always as identity primary key,
  post_id text references public.posts (id) on delete set null,
  model text not null,                          -- model that served the request
  stop_reason text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,     -- includes thinking tokens
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  cost_usd numeric(10, 6),                      -- estimate from list prices
  created_at timestamptz not null default now()
);

create index claude_usage_created_at_idx on public.claude_usage (created_at);
create index claude_usage_post_id_idx on public.claude_usage (post_id);

alter table public.claude_usage enable row level security;
grant select on public.claude_usage to authenticated;
create policy "Admins can read Claude usage" on public.claude_usage
  for select to authenticated using ((select private.is_admin()));
