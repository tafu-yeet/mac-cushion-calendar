-- One row per visit from a QR code (a link with ?utm_source=..., like a poster's),
-- logged by the browser once per session (src/components/scan-tracker.tsx). Not
-- for admins or automated browsers. Admins see counts per source.
create table public.scans (
  id bigint generated always as identity primary key,
  utm_source text not null check (char_length(utm_source) between 1 and 100),
  path text not null check (char_length(path) between 1 and 300),
  user_agent text check (char_length(user_agent) <= 500),
  created_at timestamptz not null default now()
);

create index scans_created_at_idx on public.scans (created_at desc);

alter table public.scans enable row level security;

-- Visitors can add a scan, never read one. Only these columns: the id and time are the database's.
create policy "Visitors can log a scan" on public.scans
  for insert to anon with check (true);
create policy "Admins can read scans" on public.scans
  for select to authenticated using ((select private.is_admin()));

revoke insert on public.scans from anon;
grant insert (utm_source, path, user_agent) on public.scans to anon;
