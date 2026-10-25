-- InsureDrive v1.5.6 - Vehicle Compliance / Due Calculation Upgrade
-- Adds Revenue Licence, Emission and Fitness certificate history, RLS,
-- configurable Sri Lanka compliance settings and audit logging.
-- Run AFTER ADVANCED_ADMIN_SECURITY_RUN_THIS.sql,
-- VEHICLE_OWNER_ASSIGNMENT_RUN_THIS.sql and NOTIFICATIONS_FCM_UPGRADE_RUN_THIS.sql.
-- Safe to re-run.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Permission published to the existing fine-grained access system.
--    Administrator receives it by default. Insurance Officers DO NOT receive
--    it by default, but an Administrator may explicitly grant it as a user
--    override. Vehicle Owners are never allowed to manage compliance records.
-- ---------------------------------------------------------------------------
insert into public.permissions(permission_key, name, category, description, admin_only)
values (
  'manage_revenue_licence',
  'Manage revenue licence',
  'Vehicle compliance',
  'Create and update Revenue Licence, emission and fitness compliance records',
  false
)
on conflict (permission_key) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  admin_only = excluded.admin_only;

insert into public.role_permissions(role, permission_key, allowed)
values ('administrator'::public.app_role, 'manage_revenue_licence', true)
on conflict (role, permission_key) do update set allowed = excluded.allowed;

-- ---------------------------------------------------------------------------
-- 2. Revenue Licence history. Actual licence expiry is authoritative when
--    present. source = estimated is supported for calculated assistance only.
-- ---------------------------------------------------------------------------
create table if not exists public.vehicle_revenue_licences (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  licence_number text not null,
  issue_date date not null,
  expiry_date date not null,
  source text not null default 'manual',
  verified_at timestamptz,
  annual_fee numeric(12,2),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint revenue_licence_date_order check (expiry_date >= issue_date),
  constraint revenue_licence_source_check check (source in ('actual','verified','manual','estimated')),
  constraint revenue_licence_fee_check check (annual_fee is null or annual_fee >= 0)
);

alter table public.vehicle_revenue_licences
  add column if not exists notes text;

alter table public.vehicle_revenue_licences
  drop constraint if exists revenue_licence_source_check;
alter table public.vehicle_revenue_licences
  add constraint revenue_licence_source_check
  check (source in ('actual','verified','manual','estimated'));

create index if not exists idx_revenue_licence_vehicle_expiry
  on public.vehicle_revenue_licences(vehicle_id, expiry_date desc);
create index if not exists idx_revenue_licence_expiry
  on public.vehicle_revenue_licences(expiry_date);
create index if not exists idx_revenue_licence_number_lower
  on public.vehicle_revenue_licences(lower(licence_number));

-- ---------------------------------------------------------------------------
-- 3. Emission certificate history.
-- ---------------------------------------------------------------------------
create table if not exists public.vehicle_emission_certificates (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  certificate_number text,
  provider text,
  issue_date date not null,
  expiry_date date not null,
  is_required boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emission_certificate_date_order check (expiry_date >= issue_date)
);

create index if not exists idx_emission_vehicle_expiry
  on public.vehicle_emission_certificates(vehicle_id, expiry_date desc);
create index if not exists idx_emission_expiry
  on public.vehicle_emission_certificates(expiry_date);

-- ---------------------------------------------------------------------------
-- 4. Fitness certificate history. Some vehicle categories do not require one.
-- ---------------------------------------------------------------------------
create table if not exists public.vehicle_fitness_certificates (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  certificate_number text,
  issue_date date,
  expiry_date date,
  is_required boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fitness_certificate_required_dates check (
    is_required = false or (issue_date is not null and expiry_date is not null)
  ),
  constraint fitness_certificate_date_order check (
    issue_date is null or expiry_date is null or expiry_date >= issue_date
  )
);

create index if not exists idx_fitness_vehicle_expiry
  on public.vehicle_fitness_certificates(vehicle_id, expiry_date desc);
create index if not exists idx_fitness_expiry
  on public.vehicle_fitness_certificates(expiry_date)
  where expiry_date is not null;

-- ---------------------------------------------------------------------------
-- 5. Configurable compliance settings and Sri Lankan public holidays.
--    No permanent holiday calendar is hard-coded.
-- ---------------------------------------------------------------------------
create table if not exists public.vehicle_compliance_settings (
  setting_key text primary key,
  numeric_value numeric,
  text_value text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.vehicle_compliance_settings(setting_key, numeric_value, text_value)
values
  ('revenue_payment_working_days', 3, 'Working days after the annual corresponding date'),
  ('new_vehicle_initial_days', 7, 'Initial Revenue Licence guidance for newly registered vehicles'),
  ('penalty_up_to_6_months_percent', 10, 'Estimated penalty percentage'),
  ('penalty_6_to_12_months_percent', 20, 'Estimated penalty percentage'),
  ('penalty_over_12_months_percent', 30, 'Estimated penalty percentage')
on conflict (setting_key) do nothing;

create table if not exists public.sri_lanka_public_holidays (
  holiday_date date primary key,
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. RLS helpers: access to compliance follows the vehicle's visibility.
-- ---------------------------------------------------------------------------
alter table public.vehicle_revenue_licences enable row level security;
alter table public.vehicle_emission_certificates enable row level security;
alter table public.vehicle_fitness_certificates enable row level security;
alter table public.vehicle_compliance_settings enable row level security;
alter table public.sri_lanka_public_holidays enable row level security;

drop policy if exists "revenue_licence_select_by_vehicle_access" on public.vehicle_revenue_licences;
drop policy if exists "revenue_licence_write_authorized" on public.vehicle_revenue_licences;
drop policy if exists "emission_select_by_vehicle_access" on public.vehicle_emission_certificates;
drop policy if exists "emission_write_authorized" on public.vehicle_emission_certificates;
drop policy if exists "fitness_select_by_vehicle_access" on public.vehicle_fitness_certificates;
drop policy if exists "fitness_write_authorized" on public.vehicle_fitness_certificates;

create policy "revenue_licence_select_by_vehicle_access"
on public.vehicle_revenue_licences for select to authenticated
using (
  public.current_user_is_active()
  and exists (
    select 1 from public.vehicles v
    where v.id = vehicle_id
      and (
        v.user_id = auth.uid()
        or public.has_permission('view_all_vehicles')
      )
  )
);

create policy "revenue_licence_write_authorized"
on public.vehicle_revenue_licences for all to authenticated
using (
  public.current_user_is_active()
  and public.current_user_role() in ('administrator','insurance_officer')
  and public.has_permission('manage_revenue_licence')
)
with check (
  public.current_user_is_active()
  and public.current_user_role() in ('administrator','insurance_officer')
  and public.has_permission('manage_revenue_licence')
  and exists (select 1 from public.vehicles v where v.id = vehicle_id)
);

create policy "emission_select_by_vehicle_access"
on public.vehicle_emission_certificates for select to authenticated
using (
  public.current_user_is_active()
  and exists (
    select 1 from public.vehicles v
    where v.id = vehicle_id
      and (v.user_id = auth.uid() or public.has_permission('view_all_vehicles'))
  )
);

create policy "emission_write_authorized"
on public.vehicle_emission_certificates for all to authenticated
using (
  public.current_user_is_active()
  and public.current_user_role() in ('administrator','insurance_officer')
  and public.has_permission('manage_revenue_licence')
)
with check (
  public.current_user_is_active()
  and public.current_user_role() in ('administrator','insurance_officer')
  and public.has_permission('manage_revenue_licence')
  and exists (select 1 from public.vehicles v where v.id = vehicle_id)
);

create policy "fitness_select_by_vehicle_access"
on public.vehicle_fitness_certificates for select to authenticated
using (
  public.current_user_is_active()
  and exists (
    select 1 from public.vehicles v
    where v.id = vehicle_id
      and (v.user_id = auth.uid() or public.has_permission('view_all_vehicles'))
  )
);

create policy "fitness_write_authorized"
on public.vehicle_fitness_certificates for all to authenticated
using (
  public.current_user_is_active()
  and public.current_user_role() in ('administrator','insurance_officer')
  and public.has_permission('manage_revenue_licence')
)
with check (
  public.current_user_is_active()
  and public.current_user_role() in ('administrator','insurance_officer')
  and public.has_permission('manage_revenue_licence')
  and exists (select 1 from public.vehicles v where v.id = vehicle_id)
);

drop policy if exists "compliance_settings_read" on public.vehicle_compliance_settings;
drop policy if exists "compliance_settings_admin_write" on public.vehicle_compliance_settings;
create policy "compliance_settings_read"
on public.vehicle_compliance_settings for select to authenticated
using (public.current_user_is_active());
create policy "compliance_settings_admin_write"
on public.vehicle_compliance_settings for all to authenticated
using (public.current_user_is_active() and public.current_user_role() = 'administrator')
with check (public.current_user_is_active() and public.current_user_role() = 'administrator');

drop policy if exists "holidays_read" on public.sri_lanka_public_holidays;
drop policy if exists "holidays_admin_write" on public.sri_lanka_public_holidays;
create policy "holidays_read"
on public.sri_lanka_public_holidays for select to authenticated
using (public.current_user_is_active());
create policy "holidays_admin_write"
on public.sri_lanka_public_holidays for all to authenticated
using (public.current_user_is_active() and public.current_user_role() = 'administrator')
with check (public.current_user_is_active() and public.current_user_role() = 'administrator');

grant select, insert, update on public.vehicle_revenue_licences to authenticated;
grant select, insert, update on public.vehicle_emission_certificates to authenticated;
grant select, insert, update on public.vehicle_fitness_certificates to authenticated;
grant select, insert, update, delete on public.vehicle_compliance_settings to authenticated;
grant select, insert, update, delete on public.sri_lanka_public_holidays to authenticated;

-- No client DELETE privilege for document history: history is preserved.
revoke delete on public.vehicle_revenue_licences from authenticated;
revoke delete on public.vehicle_emission_certificates from authenticated;
revoke delete on public.vehicle_fitness_certificates from authenticated;

-- ---------------------------------------------------------------------------
-- 7. Server-side business-date helpers use Asia/Colombo date.
-- ---------------------------------------------------------------------------
create or replace function public.colombo_business_date()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Colombo')::date;
$$;

grant execute on function public.colombo_business_date() to authenticated;

create or replace function public.compliance_status(expiry_date date)
returns text
language sql
stable
as $$
  select case
    when expiry_date is null then 'unknown'
    when expiry_date < public.colombo_business_date() then 'expired'
    when expiry_date = public.colombo_business_date() then 'expires_today'
    when expiry_date = public.colombo_business_date() + 1 then 'expires_tomorrow'
    when expiry_date <= public.colombo_business_date() + 3 then 'urgent'
    when expiry_date <= public.colombo_business_date() + 10 then 'due_soon'
    else 'valid'
  end;
$$;

grant execute on function public.compliance_status(date) to authenticated;

-- Latest-record views keep dashboards fast and preserve historical rows.
create or replace view public.latest_vehicle_revenue_licences
with (security_invoker = true)
as
select distinct on (vehicle_id) *
from public.vehicle_revenue_licences
order by vehicle_id, expiry_date desc, created_at desc;

create or replace view public.latest_vehicle_emission_certificates
with (security_invoker = true)
as
select distinct on (vehicle_id) *
from public.vehicle_emission_certificates
order by vehicle_id, expiry_date desc, created_at desc;

create or replace view public.latest_vehicle_fitness_certificates
with (security_invoker = true)
as
select distinct on (vehicle_id) *
from public.vehicle_fitness_certificates
order by vehicle_id, expiry_date desc nulls last, created_at desc;

grant select on public.latest_vehicle_revenue_licences to authenticated;
grant select on public.latest_vehicle_emission_certificates to authenticated;
grant select on public.latest_vehicle_fitness_certificates to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Automatic actor stamps + audit events.
-- ---------------------------------------------------------------------------
create or replace function public.stamp_compliance_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := coalesce(new.created_at, now());
  else
    new.updated_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.audit_compliance_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_name text;
  document_type text;
  target_vehicle uuid;
  target_owner uuid;
  old_payload jsonb;
  new_payload jsonb;
begin
  target_vehicle := new.vehicle_id;
  select user_id into target_owner from public.vehicles where id = target_vehicle;
  document_type := tg_table_name;

  if tg_table_name = 'vehicle_revenue_licences' then
    action_name := case when tg_op = 'INSERT' then 'REVENUE_LICENCE_CREATED' else 'REVENUE_LICENCE_UPDATED' end;
  elsif tg_table_name = 'vehicle_emission_certificates' then
    action_name := 'EMISSION_CERTIFICATE_UPDATED';
  else
    action_name := 'FITNESS_CERTIFICATE_UPDATED';
  end if;

  old_payload := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  new_payload := to_jsonb(new);

  insert into public.audit_logs(
    actor_user_id, target_user_id, action, entity_type, entity_id, metadata
  ) values (
    auth.uid(),
    target_owner,
    action_name,
    document_type,
    new.id::text,
    jsonb_build_object(
      'vehicle_id', target_vehicle,
      'old', old_payload,
      'new', new_payload
    )
  );
  return new;
end;
$$;

-- Revenue trigger
drop trigger if exists trg_stamp_revenue_licence_actor on public.vehicle_revenue_licences;
create trigger trg_stamp_revenue_licence_actor
before insert or update on public.vehicle_revenue_licences
for each row execute function public.stamp_compliance_actor();
drop trigger if exists trg_audit_revenue_licence on public.vehicle_revenue_licences;
create trigger trg_audit_revenue_licence
after insert or update on public.vehicle_revenue_licences
for each row execute function public.audit_compliance_write();

-- Emission trigger
drop trigger if exists trg_stamp_emission_actor on public.vehicle_emission_certificates;
create trigger trg_stamp_emission_actor
before insert or update on public.vehicle_emission_certificates
for each row execute function public.stamp_compliance_actor();
drop trigger if exists trg_audit_emission on public.vehicle_emission_certificates;
create trigger trg_audit_emission
after insert or update on public.vehicle_emission_certificates
for each row execute function public.audit_compliance_write();

-- Fitness trigger
drop trigger if exists trg_stamp_fitness_actor on public.vehicle_fitness_certificates;
create trigger trg_stamp_fitness_actor
before insert or update on public.vehicle_fitness_certificates
for each row execute function public.stamp_compliance_actor();
drop trigger if exists trg_audit_fitness on public.vehicle_fitness_certificates;
create trigger trg_audit_fitness
after insert or update on public.vehicle_fitness_certificates
for each row execute function public.audit_compliance_write();

commit;
