-- Sends members' emails: every 15 minutes the database asks the site's email job
-- (src/app/api/cron/email/route.ts) to run. The job decides what's due (reminders an hour
-- ahead, at most one club-posts email a day, the Sunday picks after 6 PM campus time) and
-- logs every send in email_sends, so a run that repeats or overlaps never sends twice.
--
-- Apply this only after the site with the job is deployed and both copies of the secret exist:
--   1. Vercel: the CRON_SECRET environment variable.
--   2. Supabase SQL editor (never in a migration file):
--        select vault.create_secret('<the same value>', 'cron_secret');

create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'send-member-emails',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://www.maccushion.ca/api/cron/email',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  $$
);
