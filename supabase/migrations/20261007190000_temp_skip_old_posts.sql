-- TEMPORARY: during the catch-up for the 305 newly activated clubs, posts older
-- than 7 days are stored but never sent to the LLM. This enforces it in the
-- database while the worker on the server still runs code with a 14-day
-- cutoff. Drop it once the server runs MAX_POST_AGE_DAYS=7 (see the follow-up
-- migration that removes it).

create function public.skip_posts_older_than_7_days()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.extraction_status = 'pending' and new.posted_at < now() - interval '7 days' then
    new.extraction_status := 'skipped';
  end if;
  return new;
end;
$$;

create trigger posts_skip_older_than_7_days
  before insert on public.posts
  for each row execute function public.skip_posts_older_than_7_days();
