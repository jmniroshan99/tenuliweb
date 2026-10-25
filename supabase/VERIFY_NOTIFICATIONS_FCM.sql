-- InsureDrive v1.5.5 notification upgrade verification.

select c.relname as table_name, c.relrowsecurity as row_security
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('device_tokens','notification_history','notification_preferences')
order by c.relname;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('device_tokens','notification_history','notification_preferences')
order by table_name, ordinal_position;

select policyname, tablename, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('device_tokens','notification_history','notification_preferences')
order by tablename, policyname;

select tablename, indexname
from pg_indexes
where schemaname = 'public'
  and tablename in ('device_tokens','notification_history','notification_preferences')
order by tablename, indexname;

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('register_device_token','unregister_device_token')
order by routine_name;
