-- InsureDrive v1.5 Advanced Admin Security Upgrade
-- Run AFTER RBAC_UPGRADE_RUN_THIS.sql on the existing Supabase database.
-- Safe to re-run: objects are created/replaced idempotently where practical.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Rich Sri Lankan profile fields + account status
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles add column if not exists nic_number text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists alternative_phone text;
alter table public.profiles add column if not exists address_line_1 text;
alter table public.profiles add column if not exists address_line_2 text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists postal_code text;
alter table public.profiles add column if not exists preferred_language text not null default 'English';
alter table public.profiles add column if not exists emergency_contact_name text;
alter table public.profiles add column if not exists emergency_contact_number text;
alter table public.profiles add column if not exists profile_photo_url text;
alter table public.profiles add column if not exists last_activity_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_account_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active', 'inactive', 'suspended'));
  end if;
end $$;

update public.profiles
set account_status = case when is_active then 'active' else 'inactive' end
where account_status is null
   or account_status not in ('active', 'inactive', 'suspended');

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_account_status on public.profiles(account_status);
create unique index if not exists idx_profiles_nic_unique
  on public.profiles(lower(nic_number)) where nic_number is not null and btrim(nic_number) <> '';

-- ---------------------------------------------------------------------------
-- 2. Vehicle registration detail fields
-- ---------------------------------------------------------------------------
alter table public.vehicles add column if not exists fuel_type text;
alter table public.vehicles add column if not exists color text;
alter table public.vehicles add column if not exists registration_date date;

create index if not exists idx_vehicles_user_id on public.vehicles(user_id);
create index if not exists idx_vehicles_registration_lower on public.vehicles(lower(registration_number));

-- ---------------------------------------------------------------------------
-- 3. Fine-grained permissions
-- ---------------------------------------------------------------------------
create table if not exists public.permissions (
  permission_key text primary key,
  name text not null,
  category text not null,
  description text,
  admin_only boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role public.app_role not null,
  permission_key text not null references public.permissions(permission_key) on delete cascade,
  allowed boolean not null default true,
  primary key (role, permission_key)
);

create table if not exists public.user_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_key text not null references public.permissions(permission_key) on delete cascade,
  allowed boolean not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

create index if not exists idx_user_permissions_user on public.user_permissions(user_id);
create index if not exists idx_user_permissions_permission on public.user_permissions(permission_key);

insert into public.permissions(permission_key, name, category, description, admin_only) values
  ('view_own_profile', 'View own profile', 'Profile', 'View the authenticated user profile', false),
  ('edit_own_profile', 'Edit own profile', 'Profile', 'Edit approved personal profile columns', false),
  ('view_all_users', 'View all users', 'Users & access', 'View all application users', true),
  ('view_vehicle_owners', 'View vehicle owners', 'Users & access', 'View customer Vehicle Owner profiles', false),
  ('create_users', 'Create users', 'Users & access', 'Create Vehicle Owner and Insurance Officer accounts', true),
  ('manage_roles', 'Manage roles', 'Users & access', 'Change protected base roles', true),
  ('manage_user_status', 'Manage account status', 'Users & access', 'Activate, deactivate or suspend accounts', true),
  ('manage_access_privileges', 'Manage access privileges', 'Users & access', 'Set user-specific permission overrides', true),
  ('view_all_vehicles', 'View all vehicles', 'Vehicles', 'View portfolio vehicles', false),
  ('view_own_vehicles', 'View own vehicles', 'Vehicles', 'View vehicles assigned to the authenticated owner', false),
  ('add_vehicle', 'Add vehicles', 'Vehicles', 'Register and assign vehicles', true),
  ('edit_all_vehicles', 'Edit vehicles', 'Vehicles', 'Edit registered vehicle details', true),
  ('deactivate_vehicles', 'Deactivate vehicles', 'Vehicles', 'Activate or deactivate vehicle records', true),
  ('view_all_policies', 'View all policies', 'Policies', 'View operational insurance portfolio', false),
  ('view_own_policies', 'View own policies', 'Policies', 'View policies belonging to authenticated owner', false),
  ('create_policies', 'Create policies', 'Policies', 'Issue insurance policies', false),
  ('edit_policies', 'Edit policies', 'Policies', 'Edit policy details', false),
  ('renew_policies', 'Renew policies', 'Policies', 'Renew insurance policies', false),
  ('request_renewal', 'Request renewal', 'Policies', 'Request renewal of own policy', false),
  ('void_policies', 'Void policies', 'Policies', 'Void policies', true),
  ('view_all_notifications', 'View all notifications', 'Notifications', 'View operational notification history', false),
  ('view_own_notifications', 'View own notifications', 'Notifications', 'View own reminder history', false),
  ('resend_notifications', 'Resend notifications', 'Notifications', 'Request reminder resend', false),
  ('view_reports', 'View reports', 'Reports', 'View administrator reports', true),
  ('view_operational_reports', 'View operational reports', 'Reports', 'View limited officer reporting', false),
  ('view_login_activities', 'View login activity', 'Security', 'View authentication activity', true),
  ('view_audit_logs', 'View audit logs', 'Security', 'View protected system audit trail', true),
  ('manage_system_settings', 'Manage system settings', 'System', 'Manage application system settings', true)
on conflict (permission_key) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  admin_only = excluded.admin_only;

-- Reset role defaults to the v1.5 policy model.
delete from public.role_permissions;

-- Administrator: all published permissions.
insert into public.role_permissions(role, permission_key, allowed)
select 'administrator'::public.app_role, permission_key, true
from public.permissions
on conflict do nothing;

-- Insurance Officer: operational policy/customer access, but NO vehicle creation/edit/admin security.
insert into public.role_permissions(role, permission_key, allowed) values
  ('insurance_officer', 'view_own_profile', true),
  ('insurance_officer', 'edit_own_profile', true),
  ('insurance_officer', 'view_vehicle_owners', true),
  ('insurance_officer', 'view_all_vehicles', true),
  ('insurance_officer', 'view_all_policies', true),
  ('insurance_officer', 'view_own_policies', true),
  ('insurance_officer', 'create_policies', true),
  ('insurance_officer', 'edit_policies', true),
  ('insurance_officer', 'renew_policies', true),
  ('insurance_officer', 'view_all_notifications', true),
  ('insurance_officer', 'view_own_notifications', true),
  ('insurance_officer', 'resend_notifications', true),
  ('insurance_officer', 'view_operational_reports', true)
on conflict do nothing;

-- Vehicle Owner: read own vehicle/policy/reminder data and edit approved profile fields.
insert into public.role_permissions(role, permission_key, allowed) values
  ('vehicle_owner', 'view_own_profile', true),
  ('vehicle_owner', 'edit_own_profile', true),
  ('vehicle_owner', 'view_own_vehicles', true),
  ('vehicle_owner', 'view_own_policies', true),
  ('vehicle_owner', 'request_renewal', true),
  ('vehicle_owner', 'view_own_notifications', true)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. Security activity tables
-- ---------------------------------------------------------------------------
create table if not exists public.login_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  attempted_email text,
  event_type text not null,
  success boolean not null default false,
  occurred_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  device_type text,
  platform text,
  browser text,
  session_id text,
  failure_reason text
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_login_activity_user on public.login_activity(user_id);
create index if not exists idx_login_activity_occurred on public.login_activity(occurred_at desc);
create index if not exists idx_login_activity_event on public.login_activity(event_type, occurred_at desc);
create index if not exists idx_login_activity_email on public.login_activity(lower(attempted_email));
create index if not exists idx_audit_actor on public.audit_logs(actor_user_id, created_at desc);
create index if not exists idx_audit_target on public.audit_logs(target_user_id, created_at desc);
create index if not exists idx_audit_action on public.audit_logs(action, created_at desc);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Security helpers and effective permissions
-- ---------------------------------------------------------------------------
create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select is_active = true and account_status = 'active'
    from public.profiles where id = auth.uid()
  ), false);
$$;
revoke all on function public.current_user_is_active() from public;
grant execute on function public.current_user_is_active() to authenticated;

create or replace function public.get_effective_permissions()
returns table(permission_key text)
language sql
stable
security definer
set search_path = public
as $$
  select p.permission_key
  from public.permissions p
  left join public.role_permissions rp
    on rp.permission_key = p.permission_key
   and rp.role = (select role from public.profiles where id = auth.uid())
  left join public.user_permissions up
    on up.permission_key = p.permission_key
   and up.user_id = auth.uid()
  where public.current_user_is_active()
    and coalesce(up.allowed, rp.allowed, false) = true
    and (
      p.admin_only = false
      or (select role from public.profiles where id = auth.uid()) = 'administrator'
    )
  order by p.permission_key;
$$;
revoke all on function public.get_effective_permissions() from public;
grant execute on function public.get_effective_permissions() to authenticated;

-- Server-side permission helper. RLS uses this so custom deny overrides cannot be bypassed
-- by calling Supabase directly from a modified client.
create or replace function public.has_permission(target_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select coalesce(up.allowed, rp.allowed, false)
    from public.permissions p
    left join public.role_permissions rp
      on rp.permission_key = p.permission_key
     and rp.role = (select role from public.profiles where id = auth.uid())
    left join public.user_permissions up
      on up.permission_key = p.permission_key
     and up.user_id = auth.uid()
    where p.permission_key = target_permission_key
      and public.current_user_is_active()
      and (
        p.admin_only = false
        or (select role from public.profiles where id = auth.uid()) = 'administrator'
      )
  ), false);
$$;
revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

-- Fine-grained overrides may reduce privileges. They may only grant capabilities that
-- are valid for the target base role; Vehicle Owner can never be granted policy/vehicle
-- administration and Insurance Officer can never receive Administrator privileges.
create or replace function public.permission_allowed_for_role(
  target_role public.app_role,
  target_permission_key text
)
returns boolean
language sql
immutable
as $$
  select case
    when target_role = 'administrator' then true
    when target_role = 'insurance_officer' then target_permission_key in (
      'view_own_profile','edit_own_profile','view_vehicle_owners','view_all_vehicles',
      'view_all_policies','view_own_policies','create_policies','edit_policies',
      'renew_policies','view_all_notifications','view_own_notifications',
      'resend_notifications','view_operational_reports'
    )
    when target_role = 'vehicle_owner' then target_permission_key in (
      'view_own_profile','edit_own_profile','view_own_vehicles','view_own_policies',
      'request_renewal','view_own_notifications'
    )
    else false
  end;
$$;

create or replace function public.admin_set_user_permission(
  target_user_id uuid,
  target_permission_key text,
  new_allowed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role public.app_role;
  target_role public.app_role;
  is_admin_only boolean;
begin
  select role into caller_role from public.profiles
  where id = auth.uid() and is_active = true and account_status = 'active';
  if caller_role is distinct from 'administrator'::public.app_role
     or not public.has_permission('manage_access_privileges') then
    raise exception 'Administrator access required';
  end if;

  select role into target_role from public.profiles where id = target_user_id;
  if target_role is null then raise exception 'Target user not found'; end if;

  select admin_only into is_admin_only
  from public.permissions where permission_key = target_permission_key;
  if is_admin_only is null then raise exception 'Unknown permission'; end if;
  if is_admin_only and target_role <> 'administrator'::public.app_role then
    raise exception 'This permission is restricted to Administrators';
  end if;
  if not public.permission_allowed_for_role(target_role, target_permission_key) then
    raise exception 'This permission cannot be assigned to the selected role';
  end if;
  if target_user_id = auth.uid()
     and target_permission_key in ('manage_access_privileges','manage_roles','manage_user_status')
     and new_allowed = false then
    raise exception 'You cannot revoke your own critical Administrator access';
  end if;

  insert into public.user_permissions(user_id, permission_key, allowed, granted_by, updated_at)
  values (target_user_id, target_permission_key, new_allowed, auth.uid(), now())
  on conflict (user_id, permission_key) do update
    set allowed = excluded.allowed,
        granted_by = auth.uid(),
        updated_at = now();

  insert into public.audit_logs(actor_user_id, target_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), target_user_id,
    case when new_allowed then 'PERMISSION_GRANTED' else 'PERMISSION_REVOKED' end,
    'user_permission', target_permission_key,
    jsonb_build_object('permission', target_permission_key, 'allowed', new_allowed)
  );
end;
$$;
revoke all on function public.admin_set_user_permission(uuid, text, boolean) from public;
grant execute on function public.admin_set_user_permission(uuid, text, boolean) to authenticated;

create or replace function public.admin_remove_user_permission(
  target_user_id uuid,
  target_permission_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'administrator' and is_active = true and account_status = 'active'
  ) or not public.has_permission('manage_access_privileges') then
    raise exception 'Administrator access required';
  end if;

  delete from public.user_permissions
  where user_id = target_user_id and permission_key = target_permission_key;

  insert into public.audit_logs(actor_user_id, target_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), target_user_id, 'PERMISSION_OVERRIDE_RESET',
    'user_permission', target_permission_key,
    jsonb_build_object('permission', target_permission_key)
  );
end;
$$;
revoke all on function public.admin_remove_user_permission(uuid, text) from public;
grant execute on function public.admin_remove_user_permission(uuid, text) to authenticated;

-- Replace role change RPC with lockout protection + audit logging.
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
  old_role public.app_role;
  target_status text;
  active_admins bigint;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'administrator' and is_active = true and account_status = 'active'
  ) or not public.has_permission('manage_roles') then
    raise exception 'Administrator access required';
  end if;

  select role, account_status into old_role, target_status
  from public.profiles where id = target_user_id;
  if old_role is null then raise exception 'Target user not found'; end if;
  if old_role = new_role then return; end if;

  if old_role = 'administrator' and new_role <> 'administrator' and target_status = 'active' then
    select count(*) into active_admins
    from public.profiles
    where role = 'administrator' and is_active = true and account_status = 'active';
    if active_admins <= 1 then
      raise exception 'At least one active Administrator account must remain in the system.';
    end if;
  end if;

  update public.profiles set role = new_role, updated_at = now()
  where id = target_user_id;

  delete from public.user_permissions up
  where up.user_id = target_user_id
    and not public.permission_allowed_for_role(new_role, up.permission_key);

  insert into public.audit_logs(actor_user_id, target_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), target_user_id, 'ROLE_CHANGED', 'profile', target_user_id::text,
    jsonb_build_object('old_role', old_role::text, 'new_role', new_role::text)
  );
end;
$$;
revoke all on function public.admin_set_user_role(uuid, public.app_role) from public;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Tight RLS: ONLY Administrator can create/edit/deactivate vehicles
-- ---------------------------------------------------------------------------
drop policy if exists "vehicles_select_by_role" on public.vehicles;
drop policy if exists "vehicles_insert_by_role" on public.vehicles;
drop policy if exists "vehicles_update_by_role" on public.vehicles;
drop policy if exists "vehicles_delete_admin" on public.vehicles;
drop policy if exists "vehicles_insert_admin_only" on public.vehicles;
drop policy if exists "vehicles_update_admin_only" on public.vehicles;
drop policy if exists "vehicles_delete_admin_only" on public.vehicles;

create policy "vehicles_select_by_role" on public.vehicles
for select to authenticated using (
  public.current_user_is_active()
  and (
    (auth.uid() = user_id and public.has_permission('view_own_vehicles'))
    or public.has_permission('view_all_vehicles')
  )
);

create policy "vehicles_insert_admin_only" on public.vehicles
for insert to authenticated with check (
  public.current_user_is_active()
  and public.current_user_role() = 'administrator'
  and public.has_permission('add_vehicle')
  and exists (
    select 1 from public.profiles p
    where p.id = user_id
      and p.role = 'vehicle_owner'
      and p.is_active = true
      and p.account_status = 'active'
  )
);

create policy "vehicles_update_admin_only" on public.vehicles
for update to authenticated using (
  public.current_user_is_active()
  and public.current_user_role() = 'administrator'
  and public.has_permission('edit_all_vehicles')
) with check (
  public.current_user_is_active()
  and public.current_user_role() = 'administrator'
  and public.has_permission('edit_all_vehicles')
  and exists (
    select 1 from public.profiles p
    where p.id = user_id and p.role = 'vehicle_owner'
      and p.is_active = true and p.account_status = 'active'
  )
);

create policy "vehicles_delete_admin_only" on public.vehicles
for delete to authenticated using (
  public.current_user_is_active()
  and public.current_user_role() = 'administrator'
  and public.has_permission('deactivate_vehicles')
);

revoke insert, update, delete on table public.vehicles from authenticated;
grant select on table public.vehicles to authenticated;
grant insert (
  user_id, owner_name, registration_number, vehicle_type, make, model,
  manufacture_year, chassis_number, engine_number, province, district,
  fuel_type, color, registration_date, image_path
) on table public.vehicles to authenticated;
grant update (
  user_id, owner_name, registration_number, vehicle_type, make, model,
  manufacture_year, chassis_number, engine_number, province, district,
  fuel_type, color, registration_date, image_path, updated_at
) on table public.vehicles to authenticated;
grant delete on table public.vehicles to authenticated;

-- Profile access: owner sees self, Officer may see Vehicle Owners, Administrator may see all.
drop policy if exists "profiles_select_by_role" on public.profiles;
drop policy if exists "profiles_update_by_role" on public.profiles;
create policy "profiles_select_by_role" on public.profiles
for select to authenticated using (
  -- A signed-in user may always read their own profile so the client can show
  -- active/inactive/suspended status before signing them out. All other profile
  -- access still requires an active account and the appropriate privilege.
  auth.uid() = id
  or (
    public.current_user_is_active()
    and (
      public.has_permission('view_all_users')
      or (role = 'vehicle_owner' and public.has_permission('view_vehicle_owners'))
    )
  )
);
create policy "profiles_update_by_role" on public.profiles
for update to authenticated using (
  public.current_user_is_active()
  and (
    (auth.uid() = id and public.has_permission('edit_own_profile'))
    or (public.current_user_role() = 'administrator' and public.has_permission('view_all_users'))
  )
) with check (
  public.current_user_is_active()
  and (
    (auth.uid() = id and public.has_permission('edit_own_profile'))
    or (public.current_user_role() = 'administrator' and public.has_permission('view_all_users'))
  )
);

revoke update on table public.profiles from authenticated;
grant update (
  full_name, phone, nic_number, date_of_birth, gender, alternative_phone,
  address_line_1, address_line_2, city, province, district, postal_code,
  preferred_language, emergency_contact_name, emergency_contact_number,
  profile_photo_url, updated_at
) on table public.profiles to authenticated;

-- Fine-grained policy access. Base role + user overrides are enforced by PostgreSQL.
drop policy if exists "policies_select_by_role" on public.insurance_policies;
drop policy if exists "policies_insert_operational" on public.insurance_policies;
drop policy if exists "policies_update_operational" on public.insurance_policies;
drop policy if exists "policies_delete_admin" on public.insurance_policies;
create policy "policies_select_by_role" on public.insurance_policies
for select to authenticated using (
  public.current_user_is_active()
  and (
    (auth.uid() = user_id and public.has_permission('view_own_policies'))
    or public.has_permission('view_all_policies')
  )
);
create policy "policies_insert_operational" on public.insurance_policies
for insert to authenticated with check (
  public.current_user_is_active()
  and public.current_user_role() in ('insurance_officer','administrator')
  and public.has_permission('create_policies')
  and exists (
    select 1 from public.vehicles v
    join public.profiles p on p.id = v.user_id
    where v.id = vehicle_id and v.user_id = user_id and v.is_active = true
      and p.role = 'vehicle_owner' and p.is_active = true and p.account_status = 'active'
  )
);
create policy "policies_update_operational" on public.insurance_policies
for update to authenticated using (
  public.current_user_is_active()
  and public.current_user_role() in ('insurance_officer','administrator')
  and public.has_permission('edit_policies')
) with check (
  public.current_user_is_active()
  and public.current_user_role() in ('insurance_officer','administrator')
  and public.has_permission('edit_policies')
);
create policy "policies_delete_admin" on public.insurance_policies
for delete to authenticated using (
  public.current_user_is_active()
  and public.current_user_role() = 'administrator'
  and public.has_permission('void_policies')
);

-- Notifications respect custom view permissions. Only the owner may mark their own reminder read.
drop policy if exists "history_select_by_role" on public.notification_history;
drop policy if exists "history_update_own_read" on public.notification_history;
create policy "history_select_by_role" on public.notification_history
for select to authenticated using (
  public.current_user_is_active()
  and (
    (auth.uid() = user_id and public.has_permission('view_own_notifications'))
    or public.has_permission('view_all_notifications')
  )
);
create policy "history_update_own_read" on public.notification_history
for update to authenticated using (
  public.current_user_is_active() and auth.uid() = user_id
  and public.has_permission('view_own_notifications')
) with check (
  public.current_user_is_active() and auth.uid() = user_id
  and public.has_permission('view_own_notifications')
);

-- Renewal request access also follows effective permissions.
drop policy if exists "renewal_request_owner_insert" on public.renewal_requests;
drop policy if exists "renewal_request_select_by_role" on public.renewal_requests;
drop policy if exists "renewal_request_operational_update" on public.renewal_requests;
create policy "renewal_request_owner_insert" on public.renewal_requests
for insert to authenticated with check (
  public.current_user_is_active() and auth.uid() = user_id
  and public.has_permission('request_renewal')
  and exists (select 1 from public.insurance_policies p where p.id = policy_id and p.user_id = auth.uid())
);
create policy "renewal_request_select_by_role" on public.renewal_requests
for select to authenticated using (
  public.current_user_is_active()
  and (auth.uid() = user_id or public.has_permission('view_all_policies'))
);
create policy "renewal_request_operational_update" on public.renewal_requests
for update to authenticated using (
  public.current_user_is_active()
  and public.current_user_role() in ('insurance_officer','administrator')
  and public.has_permission('renew_policies')
) with check (
  public.current_user_is_active()
  and public.current_user_role() in ('insurance_officer','administrator')
  and public.has_permission('renew_policies')
);

-- Permission/security tables are read only to active Administrators; writes use RPC/Edge Functions.
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;
alter table public.login_activity enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "permissions_admin_select" on public.permissions;
drop policy if exists "role_permissions_admin_select" on public.role_permissions;
drop policy if exists "user_permissions_admin_select" on public.user_permissions;
drop policy if exists "login_activity_admin_select" on public.login_activity;
drop policy if exists "audit_logs_admin_select" on public.audit_logs;

create policy "permissions_admin_select" on public.permissions
for select to authenticated using (
  public.current_user_is_active() and public.current_user_role() = 'administrator'
  and public.has_permission('manage_access_privileges')
);
create policy "role_permissions_admin_select" on public.role_permissions
for select to authenticated using (
  public.current_user_is_active() and public.current_user_role() = 'administrator'
  and public.has_permission('manage_access_privileges')
);
create policy "user_permissions_admin_select" on public.user_permissions
for select to authenticated using (
  public.current_user_is_active() and public.current_user_role() = 'administrator'
  and public.has_permission('manage_access_privileges')
);
create policy "login_activity_admin_select" on public.login_activity
for select to authenticated using (
  public.current_user_is_active() and public.current_user_role() = 'administrator'
  and public.has_permission('view_login_activities')
);
create policy "audit_logs_admin_select" on public.audit_logs
for select to authenticated using (
  public.current_user_is_active() and public.current_user_role() = 'administrator'
  and public.has_permission('view_audit_logs')
);

revoke insert, update, delete on public.permissions from authenticated;
revoke insert, update, delete on public.role_permissions from authenticated;
revoke insert, update, delete on public.user_permissions from authenticated;
revoke insert, update, delete on public.login_activity from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
grant select on public.permissions, public.role_permissions, public.user_permissions,
  public.login_activity, public.audit_logs to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Protected vehicle activation with audit log
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_vehicle_active(
  target_vehicle_id uuid,
  new_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_active boolean;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'administrator' and is_active = true and account_status = 'active'
  ) then
    raise exception 'Administrator access required';
  end if;
  select is_active into old_active from public.vehicles where id = target_vehicle_id;
  if old_active is null then raise exception 'Vehicle not found'; end if;
  if not public.has_permission('deactivate_vehicles') then
    raise exception 'You do not have permission to deactivate vehicles';
  end if;
  update public.vehicles set is_active = new_active, updated_at = now()
  where id = target_vehicle_id;
end;
$$;
revoke all on function public.admin_set_vehicle_active(uuid, boolean) from public;
grant execute on function public.admin_set_vehicle_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Audit direct vehicle/policy/profile data operations
-- ---------------------------------------------------------------------------
create or replace function public.audit_vehicle_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_name text;
  entity uuid;
  owner uuid;
  registration text;
begin
  if tg_op = 'DELETE' then
    entity := old.id;
    owner := old.user_id;
    registration := old.registration_number;
    action_name := 'VEHICLE_DELETED';
  elsif tg_op = 'INSERT' then
    entity := new.id;
    owner := new.user_id;
    registration := new.registration_number;
    action_name := 'VEHICLE_CREATED';
  else
    entity := new.id;
    owner := new.user_id;
    registration := new.registration_number;
    if old.is_active is distinct from new.is_active then
      action_name := case when new.is_active then 'VEHICLE_ACTIVATED' else 'VEHICLE_DEACTIVATED' end;
    else
      action_name := 'VEHICLE_UPDATED';
    end if;
  end if;

  insert into public.audit_logs(actor_user_id, target_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), owner, action_name, 'vehicle', entity::text,
    jsonb_build_object('registration_number', registration, 'owner_id', owner)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_vehicle_write on public.vehicles;
create trigger trg_audit_vehicle_write
after insert or update or delete on public.vehicles
for each row execute function public.audit_vehicle_write();

create or replace function public.audit_policy_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_name text;
  entity uuid;
  owner uuid;
  policy_no text;
  vehicle uuid;
begin
  if tg_op = 'DELETE' then
    entity := old.id; owner := old.user_id; policy_no := old.policy_number; vehicle := old.vehicle_id;
    action_name := 'POLICY_DELETED';
  elsif tg_op = 'INSERT' then
    entity := new.id; owner := new.user_id; policy_no := new.policy_number; vehicle := new.vehicle_id;
    action_name := 'POLICY_CREATED';
  else
    entity := new.id; owner := new.user_id; policy_no := new.policy_number; vehicle := new.vehicle_id;
    if old.policy_state is distinct from new.policy_state and new.policy_state = 'void' then
      action_name := 'POLICY_VOIDED';
    elsif old.policy_state is distinct from new.policy_state and new.policy_state = 'renewed' then
      action_name := 'POLICY_RENEWED';
    else
      action_name := 'POLICY_UPDATED';
    end if;
  end if;

  insert into public.audit_logs(actor_user_id, target_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), owner, action_name, 'insurance_policy', entity::text,
    jsonb_build_object('policy_number', policy_no, 'vehicle_id', vehicle)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_policy_write on public.insurance_policies;
create trigger trg_audit_policy_write
after insert or update or delete on public.insurance_policies
for each row execute function public.audit_policy_write();

-- Audit ordinary profile edits performed by an authenticated app user/admin.
create or replace function public.audit_profile_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    insert into public.audit_logs(actor_user_id, target_user_id, action, entity_type, entity_id, metadata)
    values (
      auth.uid(), new.id, 'USER_UPDATED', 'profile', new.id::text,
      jsonb_build_object('profile_fields_updated', true)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists trg_audit_profile_write on public.profiles;
create trigger trg_audit_profile_write
after update of full_name, phone, nic_number, date_of_birth, gender, alternative_phone,
  address_line_1, address_line_2, city, province, district, postal_code,
  preferred_language, emergency_contact_name, emergency_contact_number, profile_photo_url
on public.profiles
for each row execute function public.audit_profile_write();

-- Secure policy RPCs also respect effective privileges.
create or replace function public.admin_void_policy(target_policy_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_active()
     or public.current_user_role() <> 'administrator'
     or not public.has_permission('void_policies') then
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
     or public.current_user_role() not in ('insurance_officer','administrator')
     or not public.has_permission('renew_policies') then
    raise exception 'Operational renewal access required';
  end if;
  if new_expiry_date < new_start_date then raise exception 'Invalid policy expiry date'; end if;
  select * into source_row from public.insurance_policies where id = source_policy_id for update;
  if not found then raise exception 'Policy not found'; end if;
  if source_row.policy_state <> 'active' then raise exception 'Only an active policy can be renewed'; end if;
  if not exists (
    select 1 from public.vehicles v join public.profiles p on p.id = v.user_id
    where v.id = source_row.vehicle_id and v.user_id = source_row.user_id
      and v.is_active = true and p.role = 'vehicle_owner'
      and p.is_active = true and p.account_status = 'active'
  ) then raise exception 'Vehicle owner is inactive or unavailable'; end if;
  if btrim(new_policy_number) = '' then raise exception 'New policy number required'; end if;
  if new_premium < 0 then raise exception 'Premium cannot be negative'; end if;

  insert into public.insurance_policies (
    user_id, vehicle_id, provider, policy_number, insurance_type,
    start_date, expiry_date, premium, currency_code, document_path,
    renewed_from, created_by, policy_state
  ) values (
    source_row.user_id, source_row.vehicle_id, source_row.provider,
    upper(btrim(new_policy_number)), source_row.insurance_type,
    new_start_date, new_expiry_date, new_premium, 'LKR', source_row.document_path,
    source_row.id, auth.uid(), 'active'
  ) returning id into new_id;
  update public.insurance_policies set policy_state = 'renewed', updated_at = now()
  where id = source_policy_id;
  return new_id;
end;
$$;
revoke all on function public.renew_policy(uuid, text, date, date, numeric) from public;
grant execute on function public.renew_policy(uuid, text, date, date, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Dashboard metrics including security activity
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  role_value public.app_role;
begin
  select role into role_value from public.profiles where id = uid;
  if not public.current_user_is_active() then return '{}'::jsonb; end if;

  if role_value = 'vehicle_owner' then
    return jsonb_build_object(
      'users', 0,
      'vehicle_owners', 0,
      'insurance_officers', 0,
      'vehicles', case when public.has_permission('view_own_vehicles') then
        (select count(*) from public.vehicles where user_id = uid and is_active = true) else 0 end,
      'policies', case when public.has_permission('view_own_policies') then
        (select count(*) from public.insurance_policies where user_id = uid and policy_state <> 'void') else 0 end,
      'active_policies', case when public.has_permission('view_own_policies') then
        (select count(*) from public.insurance_policies where user_id = uid and policy_state = 'active' and expiry_date > current_date + 10) else 0 end,
      'expiring_policies', case when public.has_permission('view_own_policies') then
        (select count(*) from public.insurance_policies where user_id = uid and policy_state = 'active' and expiry_date between current_date and current_date + 10) else 0 end,
      'expired_policies', case when public.has_permission('view_own_policies') then
        (select count(*) from public.insurance_policies where user_id = uid and policy_state = 'active' and expiry_date < current_date) else 0 end,
      'notifications', case when public.has_permission('view_own_notifications') then
        (select count(*) from public.notification_history where user_id = uid) else 0 end,
      'pending_renewals', case when public.has_permission('request_renewal') then
        (select count(*) from public.renewal_requests where user_id = uid and status = 'pending') else 0 end,
      'successful_logins_today', 0,
      'failed_logins_today', 0
    );
  end if;

  return jsonb_build_object(
    'users', case when public.has_permission('view_all_users') then
      (select count(*) from public.profiles) else 0 end,
    'vehicle_owners', case when public.has_permission('view_vehicle_owners') or public.has_permission('view_all_users') then
      (select count(*) from public.profiles where role = 'vehicle_owner' and account_status = 'active') else 0 end,
    'insurance_officers', case when public.has_permission('view_all_users') then
      (select count(*) from public.profiles where role = 'insurance_officer' and account_status = 'active') else 0 end,
    'vehicles', case when public.has_permission('view_all_vehicles') then
      (select count(*) from public.vehicles where is_active = true) else 0 end,
    'policies', case when public.has_permission('view_all_policies') then
      (select count(*) from public.insurance_policies where policy_state <> 'void') else 0 end,
    'active_policies', case when public.has_permission('view_all_policies') then
      (select count(*) from public.insurance_policies where policy_state = 'active' and expiry_date > current_date + 10) else 0 end,
    'expiring_policies', case when public.has_permission('view_all_policies') then
      (select count(*) from public.insurance_policies where policy_state = 'active' and expiry_date between current_date and current_date + 10) else 0 end,
    'expired_policies', case when public.has_permission('view_all_policies') then
      (select count(*) from public.insurance_policies where policy_state = 'active' and expiry_date < current_date) else 0 end,
    'notifications', case when public.has_permission('view_all_notifications') then
      (select count(*) from public.notification_history) else 0 end,
    'pending_renewals', case when public.has_permission('view_all_policies') then
      (select count(*) from public.renewal_requests where status = 'pending') else 0 end,
    'successful_logins_today', case when public.has_permission('view_login_activities') then
      (select count(*) from public.login_activity where event_type = 'login_success' and success = true and occurred_at >= date_trunc('day', now())) else 0 end,
    'failed_logins_today', case when public.has_permission('view_login_activities') then
      (select count(*) from public.login_activity where event_type = 'login_failed' and occurred_at >= date_trunc('day', now())) else 0 end
  );
end;
$$;
revoke all on function public.dashboard_metrics() from public;
grant execute on function public.dashboard_metrics() to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Verification helper query (results only; safe to run)
-- ---------------------------------------------------------------------------
select 'InsureDrive advanced admin security upgrade applied' as status;
