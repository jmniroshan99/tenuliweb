-- InsureDrive v1.6.2 BUILD21 verification
-- Run after 20260818_dashboard_offline_gps_fix.sql from Supabase SQL Editor.

-- 1) Business date + required functions.
select public.colombo_business_date() as colombo_business_date;

select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('dashboard_metrics_v2','colombo_business_date','estimated_revenue_expiry')
order by proname;

-- 2) Exact due-window boundary check used by dashboard_metrics_v2.
with d as (select public.colombo_business_date() as today), cases(label, expiry_date) as (
  select 'yesterday', today - 1 from d union all
  select 'today', today from d union all
  select 'tomorrow', today + 1 from d union all
  select 'day_10', today + 10 from d union all
  select 'day_11', today + 11 from d
)
select label, expiry_date,
  expiry_date < (select today from d) as is_expired,
  expiry_date between (select today from d) and (select today + 10 from d) as is_due,
  expiry_date > (select today + 10 from d) as is_valid
from cases
order by expiry_date;

-- 3) Execute metrics as the CURRENT authenticated user when this query is run
-- through an authenticated client/session. In SQL Editor auth.uid() may be null;
-- section 4 below also simulates one active account from each role when present.
select auth.uid() as current_auth_uid,
       case when auth.uid() is null then null else public.dashboard_metrics_v2() end
         as current_role_dashboard_metrics;

-- 4) Role-aware smoke test. This uses transaction-local JWT claims and does not
-- modify profiles or permissions. Missing roles are simply skipped.
begin;
create temporary table if not exists _v162_role_metrics (
  tested_role text,
  user_id uuid,
  metrics jsonb
) on commit drop;
truncate _v162_role_metrics;

do $$
declare
  r record;
begin
  for r in
    select distinct on (role) id, role::text as role
    from public.profiles
    where is_active = true and account_status = 'active'
      and role in ('administrator','insurance_officer','vehicle_owner')
    order by role, created_at
  loop
    perform set_config('request.jwt.claim.sub', r.id::text, true);
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', r.id::text, 'role', 'authenticated')::text,
      true
    );
    insert into _v162_role_metrics(tested_role, user_id, metrics)
    values (r.role, r.id, public.dashboard_metrics_v2());
  end loop;
end $$;

select
  tested_role,
  user_id,
  metrics->>'vehicles' as vehicles,
  metrics->>'policies' as policies,
  metrics->>'active_policies' as active_policies,
  metrics->>'expiring_policies' as expiring_policies,
  metrics->>'expired_policies' as expired_policies,
  metrics->>'insurance_due' as insurance_due,
  metrics->>'insurance_expired' as insurance_expired,
  metrics->>'revenue_due' as revenue_due,
  metrics->>'revenue_expired' as revenue_expired,
  metrics->>'emission_due' as emission_due,
  metrics->>'emission_expired' as emission_expired,
  metrics->>'fitness_due' as fitness_due,
  metrics->>'fitness_expired' as fitness_expired,
  metrics->>'pending_renewals' as pending_renewals,
  metrics->>'fully_compliant_vehicles' as fully_compliant_vehicles
from _v162_role_metrics
order by tested_role;

-- Vehicle Owner isolation check: owner metric count must not include another
-- owner's active vehicles. A PASS row means no cross-owner over-count was found.
select
  m.user_id as owner_id,
  (m.metrics->>'vehicles')::bigint as dashboard_vehicle_count,
  case when public.has_permission('view_own_vehicles') then
    (select count(*) from public.vehicles v where v.is_active = true and v.user_id = m.user_id)
  else 0 end as expected_owner_vehicle_count,
  ((m.metrics->>'vehicles')::bigint = case when public.has_permission('view_own_vehicles') then
    (select count(*) from public.vehicles v where v.is_active = true and v.user_id = m.user_id)
  else 0 end) as owner_vehicle_isolation_pass
from _v162_role_metrics m
where m.tested_role = 'vehicle_owner';

rollback;

-- 5) Offline GPS schema/idempotency support.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'vehicle_locations'
  and column_name in ('client_point_id','client_received_at','was_queued')
order by column_name;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'uq_vehicle_locations_device_client_point';

-- 6) Dashboard invalidation tables must be in Supabase Realtime publication.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in (
    'vehicles','insurance_policies','vehicle_revenue_licences',
    'vehicle_emission_certificates','vehicle_fitness_certificates',
    'renewal_requests','profiles'
  )
order by tablename;
