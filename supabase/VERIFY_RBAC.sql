-- InsureDrive RBAC verification (read-only)
-- Run after supabase/RBAC_UPGRADE_RUN_THIS.sql.

-- 1) Required application tables.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'vehicles', 'insurance_policies', 'device_tokens',
    'notification_history', 'renewal_requests'
  )
order by table_name;

-- 2) RLS must be enabled.
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles', 'vehicles', 'insurance_policies', 'device_tokens',
    'notification_history', 'renewal_requests'
  )
order by tablename;

-- 3) Review policies and commands.
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles', 'vehicles', 'insurance_policies', 'device_tokens',
    'notification_history', 'renewal_requests'
  )
order by tablename, policyname;

-- 4) Verify the three seeded/demo-role accounts if you created them.
select u.email, p.role, p.is_active, p.province, p.district
from auth.users u
left join public.profiles p on p.id = u.id
where u.email in (
  'admin@insuredrive.lk',
  'officer@insuredrive.lk',
  'owner@insuredrive.lk'
)
order by u.email;

-- 5) Verify protected functions are present.
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'admin_set_user_role',
    'admin_set_vehicle_active',
    'admin_void_policy',
    'renew_policy',
    'dashboard_metrics',
    'current_user_role',
    'current_user_is_active'
  )
order by routine_name;
