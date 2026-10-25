-- InsureDrive v1.5.4 Vehicle Owner Assignment verification

select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'vehicles'
  and column_name in ('user_id', 'owner_name', 'owner_assigned_at')
order by column_name;

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'assign_vehicle_owner';

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'vehicles'
order by policyname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('vehicles', 'profiles')
  and (
    indexname like 'idx_vehicles_owner%'
    or indexname like 'idx_profiles_active_owner%'
  )
order by indexname;

-- Recent assignment audit events
select created_at, actor_user_id, target_user_id, action, entity_id, metadata
from public.audit_logs
where action in (
  'VEHICLE_OWNER_ASSIGNED',
  'VEHICLE_OWNER_CHANGED',
  'VEHICLE_OWNER_REMOVED'
)
order by created_at desc
limit 20;
