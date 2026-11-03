-- The rest of a tagged link's labels, when it has them: utm_medium (qr, story,
-- bio) and utm_content (which poster or version). Visitors can set them too.
alter table public.scans
  add column utm_medium text check (char_length(utm_medium) between 1 and 100),
  add column utm_content text check (char_length(utm_content) between 1 and 100);

grant insert (utm_medium, utm_content) on public.scans to anon;
