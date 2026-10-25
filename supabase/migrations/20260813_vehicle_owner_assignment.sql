-- InsureDrive v1.5.4 - Administrator-only Vehicle Owner Assignment
-- Run AFTER ADVANCED_ADMIN_SECURITY_RUN_THIS.sql.
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. Track when the current owner was assigned + optimize owner searches
-- ---------------------------------------------------------------------------
alter table public.vehicles
  add column if not exists owner_assigned_at timestamptz not null default now();

create index if not exists idx_vehicles_owner_assigned_at
  on public.vehicles(owner_assigned_at desc);

create index if not exists idx_profiles_active_owner_name
  on public.profiles(lower(full_name))
  where role = 'vehicle_owner' and is_active = true and account_status = 'active';

create index if not exists idx_profiles_active_owner_email
  on public.profiles(lower(email))
  where role = 'vehicle_owner' and is_active = true and account_status = 'active';

create index if not exists idx_profiles_active_owner_nic
  on public.profiles(lower(nic_number))
  where role = 'vehicle_owner' and is_active = true and account_status = 'active'
    and nic_number is not null;

create index if not exists idx_profiles_active_owner_phone
  on public.profiles(phone)
  where role = 'vehicle_owner' and is_active = true and account_status = 'active';

-- ---------------------------------------------------------------------------
-- 2. Keep normal vehicle edits Administrator-only, but remove direct ability
--    to change ownership columns. Ownership changes MUST use the protected RPC.
-- ---------------------------------------------------------------------------
drop policy if exists "vehicles_update_admin_only" on public.vehicles;
create policy "vehicles_update_admin_only" on public.vehicles
for update to authenticated using (
  public.current_user_is_active()
  and public.current_user_role() = 'administrator'
  and public.has_permission('edit_all_vehicles')
) with check (
  public.current_user_is_active()
  and public.current_user_role() = 'administrator'
  and public.has_permission('edit_all_vehicles')
);

-- Revoke table-wide UPDATE then grant only safe metadata columns.
-- user_id, owner_name, owner_assigned_at and is_active are intentionally absent.
revoke update on table public.vehicles from authenticated;
grant update (
  registration_number,
  vehicle_type,
  make,
  model,
  manufacture_year,
  chassis_number,
  engine_number,
  province,
  district,
  fuel_type,
  color,
  registration_date,
  image_path,
  updated_at
) on table public.vehicles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Protected Administrator-only ownership assignment RPC
-- ---------------------------------------------------------------------------
create or replace function public.assign_vehicle_owner(
  target_vehicle_id uuid,
  target_owner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  old_owner_id uuid;
  target_owner public.profiles%rowtype;
  updated_vehicle public.vehicles%rowtype;
begin
  -- HARD RULE: role is checked directly. Custom permissions cannot make an
  -- Insurance Officer or Vehicle Owner eligible to assign ownership.
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_active()
     or public.current_user_role() <> 'administrator' then
    raise exception 'Administrator access required to assign vehicle owners';
  end if;

  if not public.has_permission('edit_all_vehicles') then
    raise exception 'You do not have permission to edit vehicles';
  end if;

  select * into target_owner
  from public.profiles
  where id = target_owner_id;

  if not found then
    raise exception 'Vehicle Owner not found';
  end if;

  if target_owner.role <> 'vehicle_owner'
     or target_owner.is_active is not true
     or target_owner.account_status <> 'active' then
    raise exception 'Selected user must be an active Vehicle Owner';
  end if;

  select user_id into old_owner_id
  from public.vehicles
  where id = target_vehicle_id
  for update;

  if not found then
    raise exception 'Vehicle not found';
  end if;

  if old_owner_id = target_owner_id then
    select * into updated_vehicle
    from public.vehicles
    where id = target_vehicle_id;
    return to_jsonb(updated_vehicle);
  end if;

  update public.vehicles
  set user_id = target_owner.id,
      owner_name = coalesce(nullif(btrim(target_owner.full_name), ''), target_owner.email),
      owner_assigned_at = now(),
      updated_at = now()
  where id = target_vehicle_id
  returning * into updated_vehicle;

  -- The existing vehicle audit trigger (replaced below) records the actor from
  -- auth.uid() and emits VEHICLE_OWNER_CHANGED / ASSIGNED / REMOVED as needed.
  return to_jsonb(updated_vehicle);
end;
$$;

revoke all on function public.assign_vehicle_owner(uuid, uuid) from public;
grant execute on function public.assign_vehicle_owner(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Specific ownership audit events while preserving existing vehicle audits
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
  metadata_payload jsonb;
begin
  if tg_op = 'DELETE' then
    entity := old.id;
    owner := old.user_id;
    registration := old.registration_number;
    action_name := 'VEHICLE_DELETED';
    metadata_payload := jsonb_build_object(
      'registration_number', registration,
      'owner_id', owner
    );
  elsif tg_op = 'INSERT' then
    entity := new.id;
    owner := new.user_id;
    registration := new.registration_number;
    action_name := 'VEHICLE_CREATED';
    metadata_payload := jsonb_build_object(
      'registration_number', registration,
      'owner_id', owner,
      'new_owner_id', owner
    );
  else
    entity := new.id;
    owner := new.user_id;
    registration := new.registration_number;

    if old.user_id is distinct from new.user_id then
      action_name := case
        when old.user_id is null and new.user_id is not null then 'VEHICLE_OWNER_ASSIGNED'
        when old.user_id is not null and new.user_id is null then 'VEHICLE_OWNER_REMOVED'
        else 'VEHICLE_OWNER_CHANGED'
      end;
      metadata_payload := jsonb_build_object(
        'registration_number', registration,
        'old_owner_id', old.user_id,
        'new_owner_id', new.user_id
      );
    elsif old.is_active is distinct from new.is_active then
      action_name := case
        when new.is_active then 'VEHICLE_ACTIVATED'
        else 'VEHICLE_DEACTIVATED'
      end;
      metadata_payload := jsonb_build_object(
        'registration_number', registration,
        'owner_id', owner
      );
    else
      action_name := 'VEHICLE_UPDATED';
      metadata_payload := jsonb_build_object(
        'registration_number', registration,
        'owner_id', owner
      );
    end if;
  end if;

  insert into public.audit_logs(
    actor_user_id,
    target_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    auth.uid(),
    owner,
    action_name,
    'vehicle',
    entity::text,
    metadata_payload
  );

  -- Vehicle creation already requires an owner in the current schema. Record
  -- the initial assignment as its own event as well as VEHICLE_CREATED.
  if tg_op = 'INSERT' and new.user_id is not null then
    insert into public.audit_logs(
      actor_user_id,
      target_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      auth.uid(),
      new.user_id,
      'VEHICLE_OWNER_ASSIGNED',
      'vehicle',
      new.id::text,
      jsonb_build_object(
        'registration_number', new.registration_number,
        'old_owner_id', null,
        'new_owner_id', new.user_id
      )
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Existing trigger continues using the replaced function.
drop trigger if exists trg_audit_vehicle_write on public.vehicles;
create trigger trg_audit_vehicle_write
after insert or update or delete on public.vehicles
for each row execute function public.audit_vehicle_write();

commit;

-- IMPORTANT CURRENT-SCHEMA RULE:
-- public.vehicles.user_id is NOT NULL. Therefore vehicles cannot be left
-- unassigned. To remove a current owner, the Administrator must reassign the
-- vehicle directly to another active Vehicle Owner.
