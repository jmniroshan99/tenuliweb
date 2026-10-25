-- InsureDrive v1.5.8+15 final notification health check.
-- Safe read-only checks. This file does not reveal token or secret values.

-- 1) Scheduler must be active.
select jobid, jobname, schedule, active
from cron.job
where jobname in (
  'insuredrive-insurance-expiry-hourly',
  'insuredrive-vehicle-compliance-expiry-hourly'
)
order by jobname;

-- 2) Latest pg_net responses. Look for status_code=200.
select id, status_code, error_msg, created, content
from net._http_response
order by id desc
limit 10;

-- 3) Parsed latest dispatcher result.
select
  id,
  status_code,
  content::jsonb ->> 'ok' as ok,
  coalesce(content::jsonb ->> 'recordsChecked', content::jsonb ->> 'policiesChecked') as records_checked,
  content::jsonb ->> 'notificationsCreated' as notifications_created,
  content::jsonb ->> 'pushesSent' as pushes_sent,
  content::jsonb ->> 'duplicates' as duplicates,
  content::jsonb ->> 'retriesAttempted' as retries_attempted,
  content::jsonb ->> 'recipientsWithoutDevices' as recipients_without_devices,
  content::jsonb ->> 'staleTokensDeactivated' as stale_tokens_deactivated,
  content::jsonb -> 'warnings' as warnings,
  content::jsonb -> 'errors' as errors
from net._http_response
where status_code = 200
order by id desc
limit 5;

-- 4) Active device registration summary. Tokens are not printed.
select
  user_id,
  platform,
  is_active,
  count(*) as token_count,
  max(updated_at) as latest_token_update
from public.device_tokens
group by user_id, platform, is_active
order by latest_token_update desc nulls last;

-- 5) Latest notification history.
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

-- 6) Retryable notifications still waiting for an active device or successful FCM delivery.
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
order by sent_at desc
limit 30;
