-- InsureDrive v1.5 Advanced Admin Security verification (read-only)

-- 1) New security tables
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('permissions','role_permissions','user_permissions','login_activity','audit_logs')
order by table_name;

-- 2) Rich profile fields
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in (
    'account_status','nic_number','date_of_birth','gender','alternative_phone',
    'address_line_1','address_line_2','city','postal_code','preferred_language',
    'emergency_contact_name','emergency_contact_number','profile_photo_url','last_activity_at'
  )
order by column_name;

-- 3) Vehicle fields
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'vehicles'
  and column_name in ('fuel_type','color','registration_date')
order by column_name;

-- 4) Default permission counts by role
select role, count(*) as default_permissions
from public.role_permissions
where allowed = true
group by role
order by role;

-- 5) Vehicle INSERT must be Administrator-only
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'vehicles'
order by policyname;

-- 6) Fine-grained RLS policies
select policyname, tablename, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles','insurance_policies','notification_history','renewal_requests',
    'permissions','role_permissions','user_permissions','login_activity','audit_logs'
  )
order by tablename, policyname;

-- 7) Protected RPCs/helpers
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'get_effective_permissions','has_permission','permission_allowed_for_role',
    'admin_set_user_permission','admin_remove_user_permission','admin_set_user_role',
    'admin_set_vehicle_active','admin_void_policy','renew_policy','dashboard_metrics'
  )
order by routine_name;

-- 8) Current users and account statuses
select email, role, account_status, is_active
from public.profiles
order by role, email;
