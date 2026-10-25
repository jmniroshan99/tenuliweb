-- Read-only prerequisite check. Run on the existing project before migration.
-- Every prerequisite row must be true; rental_api_already_exists should be false
-- before a first installation. No customer or account data is returned.
select name, present from (values
 ('app_role', to_regtype('public.app_role') is not null),
 ('profiles', to_regclass('public.profiles') is not null),
 ('vehicles', to_regclass('public.vehicles') is not null),
 ('permissions', to_regclass('public.permissions') is not null),
 ('role_permissions', to_regclass('public.role_permissions') is not null),
 ('user_permissions', to_regclass('public.user_permissions') is not null),
 ('audit_logs', to_regclass('public.audit_logs') is not null),
 ('current_user_role', to_regprocedure('public.current_user_role()') is not null),
 ('current_user_is_active', to_regprocedure('public.current_user_is_active()') is not null),
 ('has_permission', to_regprocedure('public.has_permission(text)') is not null),
 ('get_effective_permissions', to_regprocedure('public.get_effective_permissions()') is not null),
 ('rental_api_already_exists', to_regprocedure('public.rental_api(text,jsonb,uuid)') is not null)
) as checks(name,present);
select table_name,column_name,data_type from information_schema.columns
where table_schema='public' and ((table_name='profiles' and column_name in ('role','is_active','account_status'))
 or (table_name='vehicles' and column_name in ('id','user_id','is_active','updated_at')))
order by table_name,column_name;
