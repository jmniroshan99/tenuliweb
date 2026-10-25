-- InsureDrive v1.5.7 vehicle-card compliance patch
-- Safe to run after VEHICLE_COMPLIANCE_RUN_THIS.sql.

begin;

alter table public.vehicle_revenue_licences
  add column if not exists notes text;

alter table public.vehicle_revenue_licences
  drop constraint if exists revenue_licence_source_check;

alter table public.vehicle_revenue_licences
  add constraint revenue_licence_source_check
  check (source in ('actual','verified','manual','estimated'));

create index if not exists idx_revenue_licence_vehicle_expiry
  on public.vehicle_revenue_licences(vehicle_id, expiry_date desc);
create index if not exists idx_emission_vehicle_expiry
  on public.vehicle_emission_certificates(vehicle_id, expiry_date desc);
create index if not exists idx_fitness_vehicle_expiry
  on public.vehicle_fitness_certificates(vehicle_id, expiry_date desc)
  where expiry_date is not null;
create index if not exists idx_policy_vehicle_expiry
  on public.insurance_policies(vehicle_id, expiry_date desc);

commit;
