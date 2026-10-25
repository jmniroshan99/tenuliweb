-- InsureDrive v1.5.6 verification queries
select to_regclass('public.vehicle_revenue_licences') as revenue_table,
       to_regclass('public.vehicle_emission_certificates') as emission_table,
       to_regclass('public.vehicle_fitness_certificates') as fitness_table;

select relname, relrowsecurity
from pg_class
where relname in (
  'vehicle_revenue_licences',
  'vehicle_emission_certificates',
  'vehicle_fitness_certificates',
  'vehicle_compliance_settings',
  'sri_lanka_public_holidays'
)
order by relname;

select permission_key, name, category, admin_only
from public.permissions
where permission_key = 'manage_revenue_licence';

select role, permission_key, allowed
from public.role_permissions
where permission_key = 'manage_revenue_licence'
order by role;

select public.colombo_business_date() as colombo_business_date,
       public.compliance_status(public.colombo_business_date() + 10) as ten_day_status,
       public.compliance_status(public.colombo_business_date()) as today_status,
       public.compliance_status(public.colombo_business_date() - 1) as expired_status;

select setting_key, numeric_value, text_value
from public.vehicle_compliance_settings
order by setting_key;
