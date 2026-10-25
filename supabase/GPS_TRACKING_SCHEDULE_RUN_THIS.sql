-- InsureDrive GPS tracking health scheduler.
-- Run AFTER GPS_TRACKING_RUN_THIS.sql and after CRON_SECRET is stored in
-- Supabase Vault as insuredrive_cron_secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'insuredrive_cron_secret'
      and nullif(decrypted_secret, '') is not null
  ) then
    raise exception 'Vault secret insuredrive_cron_secret is missing.';
  end if;
end $$;

do $$
declare existing_job bigint;
begin
  for existing_job in
    select jobid from cron.job
    where jobname in ('insuredrive-tracker-offline-check', 'insuredrive-tracking-retention')
  loop
    perform cron.unschedule(existing_job);
  end loop;
end $$;

select cron.schedule(
  'insuredrive-tracker-offline-check',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://ssykwhwnujxkzokpdeey.supabase.co/functions/v1/check-tracking-offline',
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

-- Daily bounded-retention cleanup. Trip summaries stay in vehicle_trips;
-- high-frequency route telemetry is kept for 90 days by default.
select cron.schedule(
  'insuredrive-tracking-retention',
  '20 3 * * *',
  $cron$
    select public.cleanup_vehicle_tracking_retention(90, 730);
  $cron$
);

select jobid, jobname, schedule, active
from cron.job
where jobname in ('insuredrive-tracker-offline-check', 'insuredrive-tracking-retention')
order by jobname;
