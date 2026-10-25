-- InsureDrive v1.5.7 verification
select column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name='vehicle_revenue_licences'
  and column_name in ('licence_number','issue_date','expiry_date','source','annual_fee','notes')
order by column_name;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid='public.vehicle_revenue_licences'::regclass
  and conname='revenue_licence_source_check';

select indexname
from pg_indexes
where schemaname='public'
  and indexname in (
    'idx_revenue_licence_vehicle_expiry',
    'idx_emission_vehicle_expiry',
    'idx_fitness_vehicle_expiry',
    'idx_policy_vehicle_expiry'
  )
order by indexname;
