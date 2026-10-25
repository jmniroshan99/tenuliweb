-- InsureDrive v1.5.8 verification - read-only.

-- 1. Required notification_history columns.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notification_history'
  and column_name in (
    'user_id','owner_id','policy_id','vehicle_id','document_id','expiry_date',
    'reminder_days','notification_type','priority','recipient_scope','dedupe_key','read_at'
  )
order by column_name;

-- 2. Old global policy/day uniqueness MUST be absent.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.notification_history'::regclass
  and contype = 'u';

-- 3. Active Administrators who will receive global expiry alerts.
select id, full_name, role, account_status, is_active, preferred_language
from public.profiles
where role = 'administrator'
  and account_status = 'active'
  and is_active = true
order by full_name nulls last, id;

-- 4. Active Administrator FCM device count.
select p.id as administrator_id,
       p.full_name,
       count(dt.id) filter (where dt.is_active = true) as active_device_tokens
from public.profiles p
left join public.device_tokens dt on dt.user_id = p.id
where p.role = 'administrator'
  and p.account_status = 'active'
  and p.is_active = true
group by p.id, p.full_name
order by p.full_name nulls last;

-- 5. Recent administrator-global delivery records after the scheduler is run.
select id, user_id, owner_id, vehicle_id, policy_id, document_id,
       notification_type, reminder_days, expiry_date, priority,
       recipient_scope, delivery_count, read_at, sent_at
from public.notification_history
where recipient_scope = 'administrator_global'
order by sent_at desc
limit 50;

-- 6. Detect duplicate recipient-aware keys. Expected: zero rows.
select dedupe_key, count(*)
from public.notification_history
where dedupe_key is not null
group by dedupe_key
having count(*) > 1;
