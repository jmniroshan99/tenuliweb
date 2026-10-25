-- InsureDrive v1.6.2 BUILD21
-- Authoritative role-aware dashboard metrics + offline GPS idempotency.
-- Safe/idempotent for an existing production database.

begin;

create or replace function public.colombo_business_date()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Colombo')::date;
$$;
grant execute on function public.colombo_business_date() to authenticated;

create or replace function public.estimated_revenue_expiry(
  p_registration_date date,
  p_business_date date default public.colombo_business_date()
)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  candidate date;
  target_year integer;
  target_month integer;
  target_day integer;
  last_day integer;
  initial_days integer := 7;
begin
  if p_registration_date is null then return null; end if;
  select coalesce(numeric_value, 7)::integer
    into initial_days
  from public.vehicle_compliance_settings
  where setting_key = 'new_vehicle_initial_days';
  initial_days := coalesce(initial_days, 7);

  if p_business_date - p_registration_date between 0 and 30 then
    return p_registration_date + initial_days;
  end if;

  target_year := extract(year from p_business_date)::integer;
  target_month := extract(month from p_registration_date)::integer;
  target_day := extract(day from p_registration_date)::integer;
  last_day := extract(day from (date_trunc('month', make_date(target_year, target_month, 1))
    + interval '1 month - 1 day'))::integer;
  candidate := make_date(target_year, target_month, least(target_day, last_day));

  if candidate < p_business_date then
    target_year := target_year + 1;
    last_day := extract(day from (date_trunc('month', make_date(target_year, target_month, 1))
      + interval '1 month - 1 day'))::integer;
    candidate := make_date(target_year, target_month, least(target_day, last_day));
  end if;
  return candidate;
end;
$$;
grant execute on function public.estimated_revenue_expiry(date, date) to authenticated;

create or replace function public.dashboard_metrics_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  role_value public.app_role;
  today date := public.colombo_business_date();
  result jsonb;
  can_all_vehicles boolean := false;
  can_all_policies boolean := false;
  can_all_users boolean := false;
  can_view_owners boolean := false;
  can_all_notifications boolean := false;
  can_login_activity boolean := false;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not public.current_user_is_active() then raise exception 'Account inactive'; end if;

  role_value := public.current_user_role();
  can_all_vehicles := public.has_permission('view_all_vehicles');
  can_all_policies := public.has_permission('view_all_policies');
  can_all_users := public.has_permission('view_all_users');
  can_view_owners := public.has_permission('view_vehicle_owners') or can_all_users;
  can_all_notifications := public.has_permission('view_all_notifications');
  can_login_activity := public.has_permission('view_login_activities');

  with visible_vehicles as (
    select v.*
    from public.vehicles v
    where v.is_active = true
      and (
        (role_value = 'vehicle_owner' and v.user_id = uid and public.has_permission('view_own_vehicles'))
        or (role_value <> 'vehicle_owner' and can_all_vehicles)
      )
  ),
  visible_policies as (
    select p.*
    from public.insurance_policies p
    where p.policy_state <> 'void'
      and (
        (role_value = 'vehicle_owner' and p.user_id = uid and public.has_permission('view_own_policies'))
        or (role_value <> 'vehicle_owner' and can_all_policies)
      )
  ),
  vehicle_docs as (
    select
      v.id as vehicle_id,
      cp.expiry_date as insurance_expiry,
      coalesce(rv.expiry_date, public.estimated_revenue_expiry(v.registration_date, today)) as revenue_expiry,
      em.expiry_date as emission_expiry,
      em.is_required as emission_required,
      ft.expiry_date as fitness_expiry,
      ft.is_required as fitness_required
    from visible_vehicles v
    left join lateral (
      select p.expiry_date
      from public.insurance_policies p
      where p.vehicle_id = v.id and p.policy_state = 'active'
      order by p.expiry_date desc, p.created_at desc
      limit 1
    ) cp on true
    left join lateral (
      select r.expiry_date
      from public.vehicle_revenue_licences r
      where r.vehicle_id = v.id
      order by r.expiry_date desc, r.created_at desc
      limit 1
    ) rv on true
    left join lateral (
      select e.expiry_date, e.is_required
      from public.vehicle_emission_certificates e
      where e.vehicle_id = v.id
      order by e.expiry_date desc, e.created_at desc
      limit 1
    ) em on true
    left join lateral (
      select f.expiry_date, f.is_required
      from public.vehicle_fitness_certificates f
      where f.vehicle_id = v.id
      order by f.expiry_date desc nulls last, f.created_at desc
      limit 1
    ) ft on true
  )
  select jsonb_build_object(
    'users', case when can_all_users then (select count(*) from public.profiles) else 0 end,
    'vehicle_owners', case when can_view_owners then
      (select count(*) from public.profiles where role = 'vehicle_owner' and is_active = true and account_status = 'active') else 0 end,
    'insurance_officers', case when can_all_users then
      (select count(*) from public.profiles where role = 'insurance_officer' and is_active = true and account_status = 'active') else 0 end,
    'vehicles', (select count(*) from visible_vehicles),
    'policies', (select count(*) from visible_policies),
    'active_policies', (select count(*) from visible_policies where policy_state = 'active' and expiry_date > today + 10),
    'expiring_policies', (select count(*) from visible_policies where policy_state = 'active' and expiry_date between today and today + 10),
    'expired_policies', (select count(*) from visible_policies where policy_state = 'active' and expiry_date < today),
    'insurance_due', (select count(*) from vehicle_docs where insurance_expiry between today and today + 10),
    'insurance_expired', (select count(*) from vehicle_docs where insurance_expiry < today),
    'revenue_due', (select count(*) from vehicle_docs where revenue_expiry between today and today + 10),
    'revenue_expired', (select count(*) from vehicle_docs where revenue_expiry < today),
    'emission_due', (select count(*) from vehicle_docs where coalesce(emission_required, true) = true and emission_expiry between today and today + 10),
    'emission_expired', (select count(*) from vehicle_docs where coalesce(emission_required, true) = true and emission_expiry < today),
    'fitness_due', (select count(*) from vehicle_docs where fitness_required = true and fitness_expiry between today and today + 10),
    'fitness_expired', (select count(*) from vehicle_docs where fitness_required = true and fitness_expiry < today),
    'expired_documents', (
      (select count(*) from vehicle_docs where insurance_expiry < today) +
      (select count(*) from vehicle_docs where revenue_expiry < today) +
      (select count(*) from vehicle_docs where coalesce(emission_required, true) = true and emission_expiry < today) +
      (select count(*) from vehicle_docs where fitness_required = true and fitness_expiry < today)
    ),
    'fully_compliant_vehicles', (
      select count(*) from vehicle_docs
      where insurance_expiry > today + 10
        and revenue_expiry > today + 10
        and (
          emission_required = false
          or (coalesce(emission_required, true) = true and emission_expiry > today + 10)
        )
        and (fitness_required is null or fitness_required = false or fitness_expiry > today + 10)
    ),
    'notifications', case
      when role_value = 'vehicle_owner' and public.has_permission('view_own_notifications') then
        (select count(*) from public.notification_history where user_id = uid)
      when role_value <> 'vehicle_owner' and can_all_notifications then
        (select count(*) from public.notification_history)
      else 0 end,
    'pending_renewals', case
      when role_value = 'vehicle_owner' and public.has_permission('request_renewal') then
        (select count(*) from public.renewal_requests where user_id = uid and status = 'pending')
      when role_value <> 'vehicle_owner' and can_all_policies then
        (select count(*) from public.renewal_requests where status = 'pending')
      else 0 end,
    'successful_logins_today', case when can_login_activity then
      (select count(*) from public.login_activity where event_type = 'login_success' and success = true
        and (occurred_at at time zone 'Asia/Colombo')::date = today) else 0 end,
    'failed_logins_today', case when can_login_activity then
      (select count(*) from public.login_activity where event_type = 'login_failed'
        and (occurred_at at time zone 'Asia/Colombo')::date = today) else 0 end
  ) into result;

  return result;
end;
$$;
revoke all on function public.dashboard_metrics_v2() from public;
grant execute on function public.dashboard_metrics_v2() to authenticated;

-- Stable client-side idempotency for offline GPS retries.
alter table public.vehicle_locations
  add column if not exists client_point_id uuid,
  add column if not exists client_received_at timestamptz,
  add column if not exists was_queued boolean not null default false;

create unique index if not exists uq_vehicle_locations_device_client_point
  on public.vehicle_locations(device_id, client_point_id)
  where client_point_id is not null;

-- Realtime invalidation tables for lightweight dashboard refreshes.
do $$
declare
  t text;
begin
  foreach t in array array[
    'vehicles','insurance_policies','vehicle_revenue_licences',
    'vehicle_emission_certificates','vehicle_fitness_certificates',
    'renewal_requests','profiles'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;
