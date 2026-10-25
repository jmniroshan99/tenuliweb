-- InsureDrive production RBAC upgrade - 2026-08-12
-- Run this ONCE in Supabase SQL Editor for an existing v1.3 database.
-- It is intentionally idempotent where PostgreSQL permits.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profile / operational columns
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.vehicles add column if not exists is_active boolean not null default true;
alter table public.insurance_policies add column if not exists policy_state text not null default 'active';
alter table public.notification_history add column if not exists read_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'insurance_policies_policy_state_check'
  ) then
    alter table public.insurance_policies
      add constraint insurance_policies_policy_state_check
      check (policy_state in ('active', 'renewed', 'void'));
  end if;
end $$;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and (p.email is null or p.email = '');

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_email on public.profiles(lower(email));
create index if not exists idx_vehicles_active on public.vehicles(is_active);
create index if not exists idx_policies_policy_number on public.insurance_policies(policy_number);
create index if not exists idx_policies_state_expiry on public.insurance_policies(policy_state, expiry_date);
create index if not exists idx_notification_history_policy on public.notification_history(policy_id);

-- ---------------------------------------------------------------------------
-- Renewal requests
-- ---------------------------------------------------------------------------
create table if not exists public.renewal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null references public.insurance_policies(id) on delete cascade,
  note text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'rejected')),
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, policy_id, status)
);
create index if not exists idx_renewal_requests_status on public.renewal_requests(status, created_at desc);
create index if not exists idx_renewal_requests_user on public.renewal_requests(user_id, created_at desc);
alter table public.renewal_requests enable row level security;

-- ---------------------------------------------------------------------------
-- Security helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;
revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public.current_user_is_active() from public;
grant execute on function public.current_user_is_active() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: drop v1.3 policies and recreate strict role policies
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_by_role" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_by_role" on public.profiles;

create policy "profiles_select_by_role" on public.profiles
for select to authenticated using (
  auth.uid() = id
  or (public.current_user_is_active() and public.current_user_role() = 'administrator')
  or (public.current_user_is_active() and public.current_user_role() = 'insurance_officer' and role = 'vehicle_owner')
);

create policy "profiles_insert_own" on public.profiles
for insert to authenticated with check (auth.uid() = id and role = 'vehicle_owner');

create policy "profiles_update_by_role" on public.profiles
for update to authenticated using (
  public.current_user_is_active()
  and (auth.uid() = id or public.current_user_role() = 'administrator')
) with check (
  public.current_user_is_active()
  and (auth.uid() = id or public.current_user_role() = 'administrator')
);

-- Column-level hardening: role, email and active-state are not directly client-writable.
revoke insert, update on table public.profiles from authenticated;
grant insert (id, full_name, phone, role, province, district)
on table public.profiles to authenticated;
grant update (full_name, phone, province, district, updated_at)
on table public.profiles to authenticated;

-- Vehicles
drop policy if exists "vehicles_select_by_role" on public.vehicles;
drop policy if exists "vehicles_insert_by_role" on public.vehicles;
drop policy if exists "vehicles_update_by_role" on public.vehicles;
drop policy if exists "vehicles_delete_by_role" on public.vehicles;
drop policy if exists "vehicles_delete_admin" on public.vehicles;

create policy "vehicles_select_by_role" on public.vehicles
for select to authenticated using (
  public.current_user_is_active()
  and (auth.uid() = user_id or public.current_user_role() in ('insurance_officer', 'administrator'))
);
create policy "vehicles_insert_by_role" on public.vehicles
for insert to authenticated with check (
  public.current_user_is_active()
  and (
    (auth.uid() = user_id and public.current_user_role() = 'vehicle_owner')
    or (
      public.current_user_role() in ('insurance_officer', 'administrator')
      and exists (
        select 1 from public.profiles p
        where p.id = user_id and p.role = 'vehicle_owner' and p.is_active = true
      )
    )
  )
);
create policy "vehicles_update_by_role" on public.vehicles
for update to authenticated using (
  public.current_user_is_active()
  and (auth.uid() = user_id or public.current_user_role() in ('insurance_officer', 'administrator'))
) with check (
  public.current_user_is_active()
  and (auth.uid() = user_id or public.current_user_role() in ('insurance_officer', 'administrator'))
);
create policy "vehicles_delete_admin" on public.vehicles
for delete to authenticated using (
  public.current_user_is_active() and public.current_user_role() = 'administrator'
);

revoke insert, update on table public.vehicles from authenticated;
grant insert (
  user_id, owner_name, registration_number, vehicle_type, make, model,
  manufacture_year, chassis_number, engine_number, province, district, image_path
) on table public.vehicles to authenticated;
grant update (
  owner_name, registration_number, vehicle_type, make, model,
  manufacture_year, chassis_number, engine_number, province, district, image_path, updated_at
) on table public.vehicles to authenticated;

-- Policies: owners are read-only. Officers/admins issue/edit/renew. Admin may delete/void.
drop policy if exists "policies_select_by_role" on public.insurance_policies;
drop policy if exists "policies_insert_by_role" on public.insurance_policies;
drop policy if exists "policies_update_by_role" on public.insurance_policies;
drop policy if exists "policies_delete_by_role" on public.insurance_policies;
drop policy if exists "policies_insert_operational" on public.insurance_policies;
drop policy if exists "policies_update_operational" on public.insurance_policies;
drop policy if exists "policies_delete_admin" on public.insurance_policies;

create policy "policies_select_by_role" on public.insurance_policies
for select to authenticated using (
  public.current_user_is_active()
  and (auth.uid() = user_id or public.current_user_role() in ('insurance_officer', 'administrator'))
);
create policy "policies_insert_operational" on public.insurance_policies
for insert to authenticated with check (
  public.current_user_is_active()
  and public.current_user_role() in ('insurance_officer', 'administrator')
  and exists (
    select 1 from public.vehicles v
    join public.profiles p on p.id = v.user_id
    where v.id = vehicle_id
      and v.user_id = user_id
      and v.is_active = true
      and p.role = 'vehicle_owner'
      and p.is_active = true
  )
);
create policy "policies_update_operational" on public.insurance_policies
for update to authenticated using (
  public.current_user_is_active()
  and public.current_user_role() in ('insurance_officer', 'administrator')
) with check (
  public.current_user_is_active()
  and public.current_user_role() in ('insurance_officer', 'administrator')
);
create policy "policies_delete_admin" on public.insurance_policies
for delete to authenticated using (
  public.current_user_is_active() and public.current_user_role() = 'administrator'
);

revoke insert, update on table public.insurance_policies from authenticated;
grant insert (
  user_id, vehicle_id, provider, policy_number, insurance_type,
  start_date, expiry_date, premium, currency_code, document_path
) on table public.insurance_policies to authenticated;
grant update (
  provider, policy_number, insurance_type, start_date, expiry_date,
  premium, document_path, updated_at
) on table public.insurance_policies to authenticated;

-- Device tokens: private to owner and only for active sessions.
drop policy if exists "tokens_select_own" on public.device_tokens;
drop policy if exists "tokens_insert_own" on public.device_tokens;
drop policy if exists "tokens_update_own" on public.device_tokens;
drop policy if exists "tokens_delete_own" on public.device_tokens;
create policy "tokens_select_own" on public.device_tokens for select to authenticated
using (public.current_user_is_active() and auth.uid() = user_id);
create policy "tokens_insert_own" on public.device_tokens for insert to authenticated
with check (public.current_user_is_active() and auth.uid() = user_id);
create policy "tokens_update_own" on public.device_tokens for update to authenticated
using (public.current_user_is_active() and auth.uid() = user_id)
with check (public.current_user_is_active() and auth.uid() = user_id);
create policy "tokens_delete_own" on public.device_tokens for delete to authenticated
using (public.current_user_is_active() and auth.uid() = user_id);

-- Notifications: owners see their own; operational roles audit all; only owners mark their own read.
drop policy if exists "history_select_by_role" on public.notification_history;
drop policy if exists "history_update_own_read" on public.notification_history;
create policy "history_select_by_role" on public.notification_history
for select to authenticated using (
  public.current_user_is_active()
  and (auth.uid() = user_id or public.current_user_role() in ('insurance_officer', 'administrator'))
);
create policy "history_update_own_read" on public.notification_history
for update to authenticated using (
  public.current_user_is_active() and auth.uid() = user_id
) with check (
  public.current_user_is_active() and auth.uid() = user_id
);
revoke update on table public.notification_history from authenticated;
grant update (read_at) on table public.notification_history to authenticated;

-- Renewal requests
drop policy if exists "renewal_request_owner_insert" on public.renewal_requests;
drop policy if exists "renewal_request_select_by_role" on public.renewal_requests;
drop policy if exists "renewal_request_operational_update" on public.renewal_requests;
create policy "renewal_request_owner_insert" on public.renewal_requests
for insert to authenticated with check (
  public.current_user_is_active()
  and auth.uid() = user_id
  and exists (
    select 1 from public.insurance_policies p
    where p.id = policy_id and p.user_id = auth.uid()
  )
);
create policy "renewal_request_select_by_role" on public.renewal_requests
for select to authenticated using (
  public.current_user_is_active()
  and (auth.uid() = user_id or public.current_user_role() in ('insurance_officer', 'administrator'))
);
create policy "renewal_request_operational_update" on public.renewal_requests
for update to authenticated using (
  public.current_user_is_active() and public.current_user_role() in ('insurance_officer', 'administrator')
) with check (
  public.current_user_is_active() and public.current_user_role() in ('insurance_officer', 'administrator')
);

revoke insert, update on table public.renewal_requests from authenticated;
grant insert (user_id, policy_id, note) on table public.renewal_requests to authenticated;
grant update (status, handled_by, handled_at) on table public.renewal_requests to authenticated;

-- ---------------------------------------------------------------------------
-- New user trigger: every account starts as owner; admin backend may promote later.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, role, province, district, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'vehicle_owner',
    coalesce(new.raw_user_meta_data->>'province', 'Western'),
    coalesce(new.raw_user_meta_data->>'district', 'Colombo'),
    true
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Protected role/admin operations
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_role(
  target_user_id uuid,
  new_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_admins integer;
  target_role public.app_role;
begin
  if not public.current_user_is_active()
     or public.current_user_role() is distinct from 'administrator'::public.app_role then
    raise exception 'Administrator access required';
  end if;

  select role into target_role from public.profiles where id = target_user_id;
  if target_role = 'administrator' and new_role <> 'administrator' then
    select count(*) into active_admins
    from public.profiles
    where role = 'administrator' and is_active = true;
    if active_admins <= 1 then
      raise exception 'At least one active administrator must remain';
    end if;
  end if;

  update public.profiles
  set role = new_role, updated_at = now()
  where id = target_user_id;
end;
$$;
revoke all on function public.admin_set_user_role(uuid, public.app_role) from public;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;

create or replace function public.admin_set_vehicle_active(
  target_vehicle_id uuid,
  new_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_active()
     or public.current_user_role() is distinct from 'administrator'::public.app_role then
    raise exception 'Administrator access required';
  end if;
  update public.vehicles set is_active = new_active, updated_at = now()
  where id = target_vehicle_id;
end;
$$;
revoke all on function public.admin_set_vehicle_active(uuid, boolean) from public;
grant execute on function public.admin_set_vehicle_active(uuid, boolean) to authenticated;

create or replace function public.admin_void_policy(target_policy_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_active()
     or public.current_user_role() is distinct from 'administrator'::public.app_role then
    raise exception 'Administrator access required';
  end if;
  update public.insurance_policies
  set policy_state = 'void', updated_at = now()
  where id = target_policy_id;
end;
$$;
revoke all on function public.admin_void_policy(uuid) from public;
grant execute on function public.admin_void_policy(uuid) to authenticated;

create or replace function public.renew_policy(
  source_policy_id uuid,
  new_policy_number text,
  new_start_date date,
  new_expiry_date date,
  new_premium numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row public.insurance_policies%rowtype;
  new_id uuid;
begin
  if not public.current_user_is_active()
     or public.current_user_role() not in ('insurance_officer', 'administrator') then
    raise exception 'Operational access required';
  end if;
  if new_expiry_date < new_start_date then
    raise exception 'Invalid policy expiry date';
  end if;

  select * into source_row from public.insurance_policies
  where id = source_policy_id for update;
  if not found then raise exception 'Policy not found'; end if;
  if source_row.policy_state <> 'active' then
    raise exception 'Only an active policy can be renewed';
  end if;
  if not exists (
    select 1
    from public.vehicles v
    join public.profiles p on p.id = v.user_id
    where v.id = source_row.vehicle_id
      and v.user_id = source_row.user_id
      and v.is_active = true
      and p.role = 'vehicle_owner'
      and p.is_active = true
  ) then
    raise exception 'Vehicle owner is inactive or unavailable';
  end if;
  if trim(new_policy_number) = '' then raise exception 'New policy number required'; end if;
  if new_premium < 0 then raise exception 'Premium cannot be negative'; end if;

  insert into public.insurance_policies (
    user_id, vehicle_id, provider, policy_number, insurance_type,
    start_date, expiry_date, premium, currency_code, document_path,
    renewed_from, created_by, policy_state
  ) values (
    source_row.user_id, source_row.vehicle_id, source_row.provider,
    upper(trim(new_policy_number)), source_row.insurance_type,
    new_start_date, new_expiry_date, new_premium, 'LKR', source_row.document_path,
    source_row.id, auth.uid(), 'active'
  ) returning id into new_id;

  update public.insurance_policies
  set policy_state = 'renewed', updated_at = now()
  where id = source_policy_id;

  return new_id;
end;
$$;
revoke all on function public.renew_policy(uuid, text, date, date, numeric) from public;
grant execute on function public.renew_policy(uuid, text, date, date, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Role-aware dashboard counts. Security-definer avoids downloading whole tables.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.app_role;
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not public.current_user_is_active() then raise exception 'Account inactive'; end if;
  r := public.current_user_role();

  if r = 'vehicle_owner' then
    select jsonb_build_object(
      'vehicle_owners', 0,
      'insurance_officers', 0,
      'vehicles', (select count(*) from public.vehicles where user_id = uid and is_active = true),
      'policies', (select count(*) from public.insurance_policies where user_id = uid and policy_state <> 'void'),
      'active_policies', (select count(*) from public.insurance_policies where user_id = uid and policy_state = 'active' and expiry_date > current_date + 10),
      'expiring_policies', (select count(*) from public.insurance_policies where user_id = uid and policy_state = 'active' and expiry_date between current_date and current_date + 10),
      'expired_policies', (select count(*) from public.insurance_policies where user_id = uid and policy_state = 'active' and expiry_date < current_date),
      'notifications', (select count(*) from public.notification_history where user_id = uid),
      'pending_renewals', (select count(*) from public.renewal_requests where user_id = uid and status = 'pending')
    ) into result;
  else
    select jsonb_build_object(
      'vehicle_owners', (select count(*) from public.profiles where role = 'vehicle_owner' and is_active = true),
      'insurance_officers', (select count(*) from public.profiles where role = 'insurance_officer' and is_active = true),
      'vehicles', (select count(*) from public.vehicles where is_active = true),
      'policies', (select count(*) from public.insurance_policies where policy_state <> 'void'),
      'active_policies', (select count(*) from public.insurance_policies where policy_state = 'active' and expiry_date > current_date + 10),
      'expiring_policies', (select count(*) from public.insurance_policies where policy_state = 'active' and expiry_date between current_date and current_date + 10),
      'expired_policies', (select count(*) from public.insurance_policies where policy_state = 'active' and expiry_date < current_date),
      'notifications', (select count(*) from public.notification_history),
      'pending_renewals', (select count(*) from public.renewal_requests where status = 'pending')
    ) into result;
  end if;
  return result;
end;
$$;
revoke all on function public.dashboard_metrics() from public;
grant execute on function public.dashboard_metrics() to authenticated;
