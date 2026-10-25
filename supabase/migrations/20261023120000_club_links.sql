-- Links in clubs' Instagram bios, and on the link-in-bio pages they lead to
-- (Linktree and the like): worker/bio_links.py. They tie a club to its Rubric
-- page and events, and give "link in bio" registration its real link.
alter table public.clubs
  add column links jsonb not null default '[]'::jsonb, -- [{url, title, via: "bio" or the link page's host}]
  add column links_checked_at timestamptz;             -- when the link-in-bio page was last read

-- A club's own bio linking its Rubric page is a match as good as Rubric's
-- Instagram link, and better than a name.
alter table public.rubric_societies drop constraint rubric_societies_match_method_check;
alter table public.rubric_societies add constraint rubric_societies_match_method_check
  check (match_method = any (array['instagram', 'name', 'person', 'bio']));
