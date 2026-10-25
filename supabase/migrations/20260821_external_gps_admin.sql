-- Administrator-managed external GPS adapters.
-- Apply after 20260816_gps_tracking.sql.
create table if not exists public.external_gps_configs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  tracking_device_id uuid not null references public.vehicle_tracking_devices(id) on delete cascade,
  name text not null,
  provider text not null default 'Generic HTTP',
  endpoint_url text not null check (endpoint_url ~ '^https://'),
  external_device_id text,
  api_token text,
  latitude_path text not null default 'latitude',
  longitude_path text not null default 'longitude',
  speed_path text default 'speed',
  is_active boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_external_gps_vehicle_active
  on public.external_gps_configs(vehicle_id) where is_active;
alter table public.external_gps_configs enable row level security;
revoke all on public.external_gps_configs from anon, authenticated;
-- Secrets are accessed only by the service-role Edge Function.

