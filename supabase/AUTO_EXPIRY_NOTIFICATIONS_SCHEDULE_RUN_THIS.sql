-- InsureDrive v1.5.8+14 - reliable automatic expiry notification scheduler.
-- Project: ssykwhwnujxkzokpdeey
--
-- BEFORE running this file:
-- 1) Configure Supabase Edge Function secrets:
--      CRON_SECRET
--      FIREBASE_PROJECT_ID
--      FIREBASE_CLIENT_EMAIL
--      FIREBASE_PRIVATE_KEY
-- 2) Store the exact CRON_SECRET in Supabase Vault under:
--      insuredrive_cron_secret
-- 3) Deploy check-expiring-policies and check-vehicle-compliance with JWT
--    verification disabled (these endpoints authenticate with x-cron-secret).
--
-- RELIABILITY CHANGE:
-- The jobs run HOURLY rather than only once after midnight. Recipient-aware
-- dedupe prevents duplicate pushes once delivery_count > 0. A history row with
-- delivery_count = 0 remains retryable, so temporary Firebase/network/token
-- setup failures can recover automatically later on the same expiry day.
--
-- Minute mapping in Sri Lanka:
--   xx:35 UTC = xx+5:05 Asia/Colombo (insurance)
--   xx:40 UTC = xx+5:10 Asia/Colombo (vehicle compliance)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Fail early if the shared cron secret is missing from Vault.
do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'insuredrive_cron_secret'
      and nullif(decrypted_secret, '') is not null
  ) then
    raise exception 'Vault secret insuredrive_cron_secret is missing. Create it before scheduling InsureDrive expiry jobs.';
  end if;
end $$;

-- Re-running this setup replaces all older daily/hourly InsureDrive jobs.
do $$
declare
  existing_job bigint;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname in (
      'insuredrive-insurance-expiry-daily',
      'insuredrive-vehicle-compliance-expiry-daily',
      'insuredrive-insurance-expiry-hourly',
      'insuredrive-vehicle-compliance-expiry-hourly'
    )
  loop
    perform cron.unschedule(existing_job);
  end loop;
end $$;

select cron.schedule(
  'insuredrive-insurance-expiry-hourly',
  '35 * * * *',
  $cron$
    select net.http_post(
      url := 'https://ssykwhwnujxkzokpdeey.supabase.co/functions/v1/check-expiring-policies',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'insuredrive_cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $cron$
);

select cron.schedule(
  'insuredrive-vehicle-compliance-expiry-hourly',
  '40 * * * *',
  $cron$
    select net.http_post(
      url := 'https://ssykwhwnujxkzokpdeey.supabase.co/functions/v1/check-vehicle-compliance',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'insuredrive_cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $cron$
);

-- Confirm the two hourly jobs exist and are active.
select jobid, jobname, schedule, active, command
from cron.job
where jobname in (
  'insuredrive-insurance-expiry-hourly',
  'insuredrive-vehicle-compliance-expiry-hourly'
)
order by jobname;
