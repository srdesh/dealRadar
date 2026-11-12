-- Run once in the Supabase SQL Editor after enabling pg_cron, pg_net and Vault.
-- Replace placeholders, then store the values in Vault. Do not commit real credentials.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'dealradar_project_url');
select vault.create_secret('YOUR_SUPABASE_PUBLISHABLE_KEY', 'dealradar_publishable_key');
select vault.create_secret('YOUR_LONG_RANDOM_INGEST_SECRET', 'dealradar_ingest_secret');

select cron.schedule(
  'dealradar-ingest-every-30-minutes',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'dealradar_project_url') || '/functions/v1/ingest-offers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'dealradar_publishable_key'),
      'x-dealradar-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dealradar_ingest_secret')
    ),
    body := '{"action":"ingest"}'::jsonb
  );
  $$
);

-- Expiry is also processed after each ingestion run. This separate daily job
-- ensures expiry continues even if all sources are temporarily unavailable.
select cron.schedule(
  'dealradar-expire-daily',
  '17 3 * * *',
  $$ select public.expire_dealradar_offers(); $$
);
