-- Read-only metadata checks after installation. Also run authenticated role tests
-- in staging: metadata alone cannot prove correct runtime authorization.
select c.relname as table_name,c.relrowsecurity as rls_enabled,
 has_table_privilege('authenticated',c.oid,'INSERT') as direct_insert_must_be_false,
 has_table_privilege('authenticated',c.oid,'UPDATE') as direct_update_must_be_false,
 has_table_privilege('authenticated',c.oid,'DELETE') as direct_delete_must_be_false
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('rental_customers','rental_business','rental_bookings','rental_invoices','rental_ledger','rental_allocations') order by c.relname;
select has_function_privilege('authenticated','public.rental_api(text,jsonb,uuid)','EXECUTE') as authenticated_rpc_expected_true,
 has_function_privilege('anon','public.rental_api(text,jsonb,uuid)','EXECUTE') as anon_rpc_expected_false;
select role,permission_key,allowed from public.role_permissions
where permission_key in ('view_rentals','manage_rentals','view_billing','manage_billing','refund_payments','view_own_rentals') order by role,permission_key;
select pubname,tablename from pg_publication_tables where pubname='supabase_realtime' and tablename like 'rental_%' order by tablename;
