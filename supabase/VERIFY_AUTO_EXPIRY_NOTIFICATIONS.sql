-- InsureDrive v1.5.8+14 - read-only verification helpers.

-- 1) Hourly retry-safe cron jobs. Expected: exactly 2 active rows.
select jobid, jobname, schedule, active
from cron.job
where jobname in (
  'insuredrive-insurance-expiry-hourly',
  'insuredrive-vehicle-compliance-expiry-hourly'
)
order by jobname;

-- 2) Active Administrator devices that can receive global expiry pushes.
select p.id as administrator_id,
       p.full_name,
       count(dt.id) filter (where dt.is_active = true) as active_android_ios_web_tokens
from public.profiles p
left join public.device_tokens dt on dt.user_id = p.id
where p.role = 'administrator'
  and p.account_status = 'active'
  and p.is_active = true
group by p.id, p.full_name
order by p.full_name nulls last;

-- 3) Revenue Licence records that are due on configured default thresholds
-- relative to the authoritative Asia/Colombo business date.
with thresholds(days_remaining) as (
  values (30),(10),(7),(3),(1),(0),(-1)
), current_revenue as (
  select distinct on (r.vehicle_id)
         r.id,
         r.vehicle_id,
         r.licence_number,
         r.expiry_date,
         r.source
  from public.vehicle_revenue_licences r
  join public.vehicles v on v.id = r.vehicle_id
  where v.is_active = true
    and r.source <> 'estimated'
  order by r.vehicle_id, r.expiry_date desc, r.updated_at desc
)
select cr.id,
       cr.vehicle_id,
       v.registration_number,
       cr.licence_number,
       cr.expiry_date,
       cr.source,
       (cr.expiry_date - public.colombo_business_date()) as days_remaining
from current_revenue cr
join public.vehicles v on v.id = cr.vehicle_id
join thresholds t
  on t.days_remaining = (cr.expiry_date - public.colombo_business_date())
order by cr.expiry_date, v.registration_number;

-- 4) Recent Revenue Licence notifications.
select id,
       user_id,
       owner_id,
       vehicle_id,
       document_id,
       notification_type,
       reminder_days,
       expiry_date,
       priority,
       recipient_scope,
       delivery_count,
       sent_at
from public.notification_history
where notification_type = 'revenue_licence_expiry'
order by sent_at desc
limit 50;

-- 5) Recent cron execution outcomes if pg_cron exposes run details.
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid in (
  select jobid from cron.job
  where jobname in (
    'insuredrive-insurance-expiry-hourly',
    'insuredrive-vehicle-compliance-expiry-hourly'
  )
)
order by start_time desc
limit 20;
