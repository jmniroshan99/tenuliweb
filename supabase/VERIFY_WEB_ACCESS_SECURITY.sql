-- READ-ONLY INVENTORY, not a migration and not an automatic security approval.
-- Run in the EXISTING application project's SQL Editor. No user data is returned.
select n.nspname as schema_name,c.relname as table_name,c.relrowsecurity as rls_enabled,
 has_table_privilege('anon',c.oid,'SELECT') as anon_can_select,
 has_table_privilege('anon',c.oid,'INSERT') as anon_can_insert,
 has_table_privilege('anon',c.oid,'UPDATE') as anon_can_update,
 has_table_privilege('anon',c.oid,'DELETE') as anon_can_delete
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind='r' and n.nspname in ('public','repair_private','rental_private')
order by n.nspname,c.relname;

-- authenticated must not be able to directly change its authorization columns.
select column_name,
 has_column_privilege('authenticated','public.profiles',column_name,'UPDATE') as direct_update_allowed
from information_schema.columns
where table_schema='public' and table_name='profiles'
and column_name in ('role','is_active','account_status');

-- Billing RPCs should be denied to anon; private helpers should not be public APIs.
select n.nspname as schema_name,p.proname,
 pg_get_function_identity_arguments(p.oid) as arguments,
 p.prosecdef as security_definer,p.proconfig as function_settings,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('repair_api','rental_api'))
 or n.nspname in ('repair_private','rental_private')
order by n.nspname,p.proname;

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where schemaname='public' and tablename in ('profiles','rental_customers','rental_bookings','rental_invoices','rental_ledger')
order by tablename,policyname;
