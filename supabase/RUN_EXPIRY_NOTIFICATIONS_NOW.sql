-- InsureDrive v1.5.8+13 - manually invoke both expiry dispatchers now.
-- Requires the Vault secret `insuredrive_cron_secret` created during scheduler setup.
-- This uses the same production code and dedupe rules as the daily cron jobs.

create extension if not exists pg_net;

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
) as insurance_request_id;

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
) as compliance_request_id;
