-- InsureDrive v1.5.8+14 - end-to-end expiry notification verification.
-- Safe diagnostic queries: this file DOES NOT print secret values.

-- 1) Vault cron secret must exist.
select
  name,
  case when nullif(decrypted_secret, '') is not null then 'configured' else 'missing' end as status
from vault.decrypted_secrets
where name = 'insuredrive_cron_secret';

-- 2) Hourly retry-safe jobs should exist and be active.
select jobid, jobname, schedule, active
from cron.job
where jobname in (
  'insuredrive-insurance-expiry-hourly',
  'insuredrive-vehicle-compliance-expiry-hourly'
)
order by jobname;

-- 3) Active device tokens by user/platform. Token values are deliberately hidden.
select
  user_id,
  platform,
  count(*) filter (where is_active) as active_tokens,
  max(updated_at) as last_token_update
from public.device_tokens
group by user_id, platform
order by last_token_update desc nulls last;

-- 4) Recent notification delivery state. delivery_count = 0 means retryable.
select
  id,
  user_id,
  notification_type,
  recipient_scope,
  expiry_date,
  reminder_days,
  priority,
  delivery_count,
  sent_at
from public.notification_history
order by sent_at desc
limit 30;

-- 5) Retryable failed/pending expiry notifications.
select
  id,
  user_id,
  notification_type,
  recipient_scope,
  expiry_date,
  reminder_days,
  delivery_count,
  sent_at
from public.notification_history
where coalesce(delivery_count, 0) = 0
  and notification_type in (
    'insurance_expiry',
    'revenue_licence_expiry',
    'emission_expiry',
    'fitness_expiry'
  )
order by sent_at desc
limit 30;

-- 6) Recent pg_net Edge Function responses.
select
  id,
  status_code,
  error_msg,
  content::jsonb ->> 'ok' as ok,
  coalesce(
    content::jsonb ->> 'recordsChecked',
    content::jsonb ->> 'policiesChecked'
  ) as checked,
  content::jsonb ->> 'notificationsCreated' as notifications_created,
  content::jsonb ->> 'pushesSent' as pushes_sent,
  content::jsonb ->> 'retriesAttempted' as retries_attempted,
  content::jsonb ->> 'recipientsWithoutDevices' as recipients_without_devices,
  content::jsonb ->> 'duplicates' as duplicates,
  content::jsonb -> 'errors' as errors,
  created
from net._http_response
order by id desc
limit 20;
