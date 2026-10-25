-- ================================================================
-- InsureDrive v1.6.0 - Dedicated Android Car Audio GPS Tracking
-- Run AFTER the existing InsureDrive v1.5.8 schema / RBAC upgrades.
-- Safe to re-run.
-- ================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------
-- Visibility helper: tracking is intentionally limited to the assigned
-- vehicle owner and Administrators. Insurance Officers are not granted
-- location visibility by default.
-- ----------------------------------------------------------------
create or replace function public.can_view_vehicle_tracking(p_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and (
        v.user_id = auth.uid()
        or public.current_user_role() = 'administrator'
      )
  );
$$;

revoke all on function public.can_view_vehicle_tracking(uuid) from public;
grant execute on function public.can_view_vehicle_tracking(uuid) to authenticated;

-- ----------------------------------------------------------------
-- Pairing codes are generated and consumed only through the secure Edge
-- Function. Only a hash is stored in PostgreSQL.
-- ----------------------------------------------------------------
create table if not exists public.vehicle_tracking_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint vehicle_tracking_pairing_expiry_check check (expires_at > created_at)
);

create index if not exists idx_tracking_pairing_vehicle_expiry
  on public.vehicle_tracking_pairing_codes(vehicle_id, expires_at desc);
create index if not exists idx_tracking_pairing_hash
  on public.vehicle_tracking_pairing_codes(code_hash)
  where used_at is null;

-- ----------------------------------------------------------------
-- One ACTIVE dedicated tracker per vehicle and one ACTIVE vehicle per device.
-- Old rows are retained for audit/history after unpairing.
-- ----------------------------------------------------------------
create table if not exists public.vehicle_tracking_devices (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_uid text not null,
  device_secret_hash text not null,
  device_name text not null default 'InsureDrive Car Audio',
  google_account_email text,
  platform text not null default 'android',
  device_model text,
  android_version text,
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  status text not null default 'offline',
  tracking_enabled boolean not null default true,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  unpaired_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint vehicle_tracking_device_status_check
    check (status in ('paired','online','offline','revoked')),
  constraint vehicle_tracking_device_platform_check
    check (platform in ('android','ios','web'))
);

create unique index if not exists uq_active_tracking_device_vehicle
  on public.vehicle_tracking_devices(vehicle_id)
  where is_active = true;
create unique index if not exists uq_active_tracking_device_uid
  on public.vehicle_tracking_devices(device_uid)
  where is_active = true;
create index if not exists idx_tracking_devices_owner
  on public.vehicle_tracking_devices(owner_id, is_active);
create index if not exists idx_tracking_devices_last_seen
  on public.vehicle_tracking_devices(last_seen_at desc)
  where is_active = true;

-- ----------------------------------------------------------------
-- Per-vehicle tracking configuration.
-- ----------------------------------------------------------------
create table if not exists public.vehicle_tracking_settings (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  speed_limit_kmh numeric(6,2) not null default 80,
  movement_threshold_kmh numeric(6,2) not null default 5,
  offline_after_seconds integer not null default 180,
  moving_upload_seconds integer not null default 7,
  stopped_upload_seconds integer not null default 60,
  overspeed_cooldown_seconds integer not null default 300,
  trip_stop_after_seconds integer not null default 180,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint tracking_speed_limit_check check (speed_limit_kmh between 5 and 300),
  constraint tracking_movement_threshold_check check (movement_threshold_kmh between 0 and 50),
  constraint tracking_offline_check check (offline_after_seconds between 30 and 86400),
  constraint tracking_upload_moving_check check (moving_upload_seconds between 3 and 300),
  constraint tracking_upload_stopped_check check (stopped_upload_seconds between 10 and 3600),
  constraint tracking_cooldown_check check (overspeed_cooldown_seconds between 30 and 86400),
  constraint tracking_trip_stop_check check (trip_stop_after_seconds between 30 and 3600)
);

-- ----------------------------------------------------------------
-- Raw telemetry. Edge Functions are the only writer.
-- ----------------------------------------------------------------
create table if not exists public.vehicle_locations (
  id bigint generated by default as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  device_id uuid not null references public.vehicle_tracking_devices(id) on delete cascade,
  trip_id uuid,
  latitude double precision not null,
  longitude double precision not null,
  speed_kmh numeric(7,2) not null default 0,
  heading numeric(7,2),
  accuracy numeric(8,2),
  altitude numeric(10,2),
  provider text,
  battery_level integer,
  is_charging boolean,
  network_status text,
  is_moving boolean not null default false,
  recorded_at timestamptz not null,
  device_timestamp timestamptz,
  received_at timestamptz not null default now(),
  constraint vehicle_location_latitude_check check (latitude between -90 and 90),
  constraint vehicle_location_longitude_check check (longitude between -180 and 180),
  constraint vehicle_location_speed_check check (speed_kmh between 0 and 300),
  constraint vehicle_location_battery_check check (battery_level is null or battery_level between 0 and 100)
);

create index if not exists idx_vehicle_locations_vehicle_recorded
  on public.vehicle_locations(vehicle_id, recorded_at desc);
create index if not exists idx_vehicle_locations_device_recorded
  on public.vehicle_locations(device_id, recorded_at desc);
create index if not exists idx_vehicle_locations_trip_recorded
  on public.vehicle_locations(trip_id, recorded_at)
  where trip_id is not null;

-- ----------------------------------------------------------------
-- Latest-location table supports efficient Supabase Realtime subscriptions.
-- ----------------------------------------------------------------
create table if not exists public.vehicle_latest_location (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  device_id uuid not null references public.vehicle_tracking_devices(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  speed_kmh numeric(7,2) not null default 0,
  heading numeric(7,2),
  accuracy numeric(8,2),
  altitude numeric(10,2),
  provider text,
  battery_level integer,
  is_charging boolean,
  network_status text,
  is_moving boolean not null default false,
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint vehicle_latest_latitude_check check (latitude between -90 and 90),
  constraint vehicle_latest_longitude_check check (longitude between -180 and 180)
);

create index if not exists idx_vehicle_latest_received
  on public.vehicle_latest_location(received_at desc);

-- ----------------------------------------------------------------
-- Trips are movement-derived unless a future OBD/ignition integration provides
-- a reliable ignition signal. Do not treat GPS movement as ignition state.
-- ----------------------------------------------------------------
create table if not exists public.vehicle_trips (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  device_id uuid not null references public.vehicle_tracking_devices(id) on delete cascade,
  status text not null default 'active',
  detection_method text not null default 'movement',
  start_time timestamptz not null,
  end_time timestamptz,
  start_latitude double precision,
  start_longitude double precision,
  end_latitude double precision,
  end_longitude double precision,
  total_distance_km numeric(12,3) not null default 0,
  average_speed_kmh numeric(8,2) not null default 0,
  maximum_speed_kmh numeric(8,2) not null default 0,
  speed_sample_sum numeric(16,2) not null default 0,
  speed_sample_count integer not null default 0,
  point_count integer not null default 0,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_trip_status_check check (status in ('active','completed')),
  constraint vehicle_trip_detection_check check (detection_method in ('movement','obd_ignition'))
);

create unique index if not exists uq_vehicle_active_trip
  on public.vehicle_trips(vehicle_id)
  where status = 'active';
create index if not exists idx_vehicle_trips_vehicle_start
  on public.vehicle_trips(vehicle_id, start_time desc);

alter table public.vehicle_trips
  add column if not exists duration_seconds integer not null default 0;

alter table public.vehicle_locations
  drop constraint if exists vehicle_locations_trip_id_fkey;
alter table public.vehicle_locations
  add constraint vehicle_locations_trip_id_fkey
  foreign key (trip_id) references public.vehicle_trips(id) on delete set null;

-- Trip route points are stored once in public.vehicle_locations via trip_id.
-- A separate trip-points table is intentionally avoided to prevent duplicate
-- high-frequency GPS storage.

-- ----------------------------------------------------------------
-- Overspeed and geofence events.
-- ----------------------------------------------------------------
create table if not exists public.vehicle_speed_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  device_id uuid not null references public.vehicle_tracking_devices(id) on delete cascade,
  trip_id uuid references public.vehicle_trips(id) on delete set null,
  detected_speed_kmh numeric(7,2) not null,
  configured_limit_kmh numeric(7,2) not null,
  latitude double precision not null,
  longitude double precision not null,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_speed_events_vehicle_recorded
  on public.vehicle_speed_events(vehicle_id, recorded_at desc);

create table if not exists public.vehicle_geofences (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters numeric(10,2) not null default 250,
  notify_on_enter boolean not null default true,
  notify_on_exit boolean not null default true,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint geofence_latitude_check check (latitude between -90 and 90),
  constraint geofence_longitude_check check (longitude between -180 and 180),
  constraint geofence_radius_check check (radius_meters between 25 and 50000)
);

create index if not exists idx_geofences_vehicle_active
  on public.vehicle_geofences(vehicle_id, is_active);

create table if not exists public.vehicle_geofence_events (
  id uuid primary key default gen_random_uuid(),
  geofence_id uuid not null references public.vehicle_geofences(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  device_id uuid not null references public.vehicle_tracking_devices(id) on delete cascade,
  event_type text not null,
  latitude double precision not null,
  longitude double precision not null,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint geofence_event_type_check check (event_type in ('enter','exit'))
);

create index if not exists idx_geofence_events_vehicle_recorded
  on public.vehicle_geofence_events(vehicle_id, recorded_at desc);

-- ----------------------------------------------------------------
-- Runtime state used by the ingestion function to avoid noisy trip starts,
-- dedupe overspeed alerts and remember geofence transitions.
-- ----------------------------------------------------------------
create table if not exists public.vehicle_tracking_runtime (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  moving_streak integer not null default 0,
  stopped_since timestamptz,
  last_overspeed_at timestamptz,
  geofence_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_tracking_audit (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  device_id uuid references public.vehicle_tracking_devices(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tracking_audit_vehicle_created
  on public.vehicle_tracking_audit(vehicle_id, created_at desc);

-- ----------------------------------------------------------------
-- Row Level Security.
-- ----------------------------------------------------------------
alter table public.vehicle_tracking_pairing_codes enable row level security;
alter table public.vehicle_tracking_devices enable row level security;
alter table public.vehicle_tracking_settings enable row level security;
alter table public.vehicle_locations enable row level security;
alter table public.vehicle_latest_location enable row level security;
alter table public.vehicle_trips enable row level security;
alter table public.vehicle_speed_events enable row level security;
alter table public.vehicle_geofences enable row level security;
alter table public.vehicle_geofence_events enable row level security;
alter table public.vehicle_tracking_runtime enable row level security;
alter table public.vehicle_tracking_audit enable row level security;

-- Service-role-only tables have no authenticated policies.
revoke all on public.vehicle_tracking_pairing_codes from anon, authenticated;
revoke all on public.vehicle_tracking_runtime from anon, authenticated;

-- Tracking device metadata: owner sees own assigned vehicle device, admin sees all.
drop policy if exists tracking_devices_select_visible on public.vehicle_tracking_devices;
create policy tracking_devices_select_visible
on public.vehicle_tracking_devices for select to authenticated
using (public.can_view_vehicle_tracking(vehicle_id));

-- Settings: owners can read; only admins can write.
drop policy if exists tracking_settings_select_visible on public.vehicle_tracking_settings;
create policy tracking_settings_select_visible
on public.vehicle_tracking_settings for select to authenticated
using (public.can_view_vehicle_tracking(vehicle_id));

drop policy if exists tracking_settings_admin_insert on public.vehicle_tracking_settings;
create policy tracking_settings_admin_insert
on public.vehicle_tracking_settings for insert to authenticated
with check (public.current_user_role() = 'administrator');

drop policy if exists tracking_settings_admin_update on public.vehicle_tracking_settings;
create policy tracking_settings_admin_update
on public.vehicle_tracking_settings for update to authenticated
using (public.current_user_role() = 'administrator')
with check (public.current_user_role() = 'administrator');

-- Telemetry/history select-only access.
drop policy if exists vehicle_locations_select_visible on public.vehicle_locations;
create policy vehicle_locations_select_visible
on public.vehicle_locations for select to authenticated
using (public.can_view_vehicle_tracking(vehicle_id));

drop policy if exists vehicle_latest_select_visible on public.vehicle_latest_location;
create policy vehicle_latest_select_visible
on public.vehicle_latest_location for select to authenticated
using (public.can_view_vehicle_tracking(vehicle_id));

drop policy if exists vehicle_trips_select_visible on public.vehicle_trips;
create policy vehicle_trips_select_visible
on public.vehicle_trips for select to authenticated
using (public.can_view_vehicle_tracking(vehicle_id));

drop policy if exists speed_events_select_visible on public.vehicle_speed_events;
create policy speed_events_select_visible
on public.vehicle_speed_events for select to authenticated
using (public.can_view_vehicle_tracking(vehicle_id));

drop policy if exists geofence_events_select_visible on public.vehicle_geofence_events;
create policy geofence_events_select_visible
on public.vehicle_geofence_events for select to authenticated
using (public.can_view_vehicle_tracking(vehicle_id));

-- Geofences: owner can read, Administrator manages.
drop policy if exists geofences_select_visible on public.vehicle_geofences;
create policy geofences_select_visible
on public.vehicle_geofences for select to authenticated
using (public.can_view_vehicle_tracking(vehicle_id));

drop policy if exists geofences_admin_insert on public.vehicle_geofences;
create policy geofences_admin_insert
on public.vehicle_geofences for insert to authenticated
with check (public.current_user_role() = 'administrator');

drop policy if exists geofences_admin_update on public.vehicle_geofences;
create policy geofences_admin_update
on public.vehicle_geofences for update to authenticated
using (public.current_user_role() = 'administrator')
with check (public.current_user_role() = 'administrator');

drop policy if exists geofences_admin_delete on public.vehicle_geofences;
create policy geofences_admin_delete
on public.vehicle_geofences for delete to authenticated
using (public.current_user_role() = 'administrator');

-- Audit records visible to Administrators and the assigned owner.
drop policy if exists tracking_audit_select_visible on public.vehicle_tracking_audit;
create policy tracking_audit_select_visible
on public.vehicle_tracking_audit for select to authenticated
using (vehicle_id is not null and public.can_view_vehicle_tracking(vehicle_id));

-- Remove client writes to authoritative tracking data. Edge Functions use the
-- service-role and are unaffected by these grants.
revoke insert, update, delete on public.vehicle_tracking_devices from authenticated;
revoke insert, update, delete on public.vehicle_locations from authenticated;
revoke insert, update, delete on public.vehicle_latest_location from authenticated;
revoke insert, update, delete on public.vehicle_trips from authenticated;
revoke insert, update, delete on public.vehicle_speed_events from authenticated;
revoke insert, update, delete on public.vehicle_geofence_events from authenticated;
revoke insert, update, delete on public.vehicle_tracking_audit from authenticated;

grant select on public.vehicle_tracking_devices to authenticated;
grant select on public.vehicle_locations to authenticated;
grant select on public.vehicle_latest_location to authenticated;
grant select on public.vehicle_trips to authenticated;
grant select on public.vehicle_speed_events to authenticated;
grant select on public.vehicle_geofence_events to authenticated;
grant select on public.vehicle_tracking_audit to authenticated;
grant select, insert, update on public.vehicle_tracking_settings to authenticated;
grant select, insert, update, delete on public.vehicle_geofences to authenticated;

-- Realtime: add the compact latest-location table only (not high-volume raw points).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_latest_location'
  ) then
    alter publication supabase_realtime add table public.vehicle_latest_location;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_tracking_devices'
  ) then
    alter publication supabase_realtime add table public.vehicle_tracking_devices;
  end if;
end $$;

-- Cleanup expired unused pairing codes. Safe helper for scheduled/manual use.
create or replace function public.cleanup_expired_tracking_pairing_codes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  delete from public.vehicle_tracking_pairing_codes
  where used_at is null and expires_at < now() - interval '1 day';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.cleanup_expired_tracking_pairing_codes() from public;

-- Bounded retention for high-frequency telemetry. Trip summaries remain; raw
-- route points are retained for 90 days by default and event/audit history for
-- 730 days. Adjust the arguments if your operational retention policy differs.
create or replace function public.cleanup_vehicle_tracking_retention(
  p_raw_days integer default 90,
  p_event_days integer default 730
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_deleted integer := 0;
  speed_deleted integer := 0;
  geofence_deleted integer := 0;
  audit_deleted integer := 0;
begin
  if p_raw_days < 7 or p_event_days < 30 then
    raise exception 'Retention is too short';
  end if;

  delete from public.vehicle_locations
  where recorded_at < now() - make_interval(days => p_raw_days);
  get diagnostics raw_deleted = row_count;

  delete from public.vehicle_speed_events
  where recorded_at < now() - make_interval(days => p_event_days);
  get diagnostics speed_deleted = row_count;

  delete from public.vehicle_geofence_events
  where recorded_at < now() - make_interval(days => p_event_days);
  get diagnostics geofence_deleted = row_count;

  delete from public.vehicle_tracking_audit
  where created_at < now() - make_interval(days => p_event_days);
  get diagnostics audit_deleted = row_count;

  return jsonb_build_object(
    'raw_locations_deleted', raw_deleted,
    'speed_events_deleted', speed_deleted,
    'geofence_events_deleted', geofence_deleted,
    'audit_rows_deleted', audit_deleted
  );
end;
$$;

revoke all on function public.cleanup_vehicle_tracking_retention(integer, integer) from public;

-- Seed settings for existing active vehicles without overriding custom values.
insert into public.vehicle_tracking_settings(vehicle_id)
select id from public.vehicles
where is_active = true
on conflict (vehicle_id) do nothing;

select 'InsureDrive GPS tracking schema installed' as result;
