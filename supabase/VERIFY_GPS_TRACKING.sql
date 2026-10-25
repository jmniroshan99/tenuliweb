-- InsureDrive GPS Tracking verification (read-only)
select 'tracking_tables' as check_name, count(*) as value
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'vehicle_tracking_pairing_codes','vehicle_tracking_devices','vehicle_locations',
    'vehicle_latest_location','vehicle_trips','vehicle_speed_events',
    'vehicle_geofences','vehicle_geofence_events','vehicle_tracking_settings',
    'vehicle_tracking_runtime','vehicle_tracking_audit'
  );

select 'realtime_latest_location' as check_name,
       count(*) as value
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'vehicle_latest_location';

select jobid, jobname, schedule, active
from cron.job
where jobname in ('insuredrive-tracker-offline-check', 'insuredrive-tracking-retention')
order by jobname;

select vehicle_id, speed_limit_kmh, movement_threshold_kmh,
       offline_after_seconds, moving_upload_seconds, stopped_upload_seconds
from public.vehicle_tracking_settings
order by updated_at desc
limit 10;

select v.registration_number, d.device_name, d.google_account_email,
       d.status, d.is_active, d.tracking_enabled, d.last_seen_at
from public.vehicle_tracking_devices d
join public.vehicles v on v.id = d.vehicle_id
order by d.paired_at desc
limit 20;

select v.registration_number, l.latitude, l.longitude, l.speed_kmh,
       l.is_moving, l.network_status, l.battery_level, l.received_at
from public.vehicle_latest_location l
join public.vehicles v on v.id = l.vehicle_id
order by l.received_at desc
limit 20;

-- Any row here is waiting for the five-minute tracker-health job to retry FCM.
select id, user_id, vehicle_id, notification_type, title, delivery_count, sent_at
from public.notification_history
where notification_type in (
  'vehicle_overspeed','vehicle_geofence_enter','vehicle_geofence_exit',
  'tracking_device_offline','tracking_device_online','tracker_paired','tracker_unpaired'
)
  and delivery_count = 0
order by sent_at desc
limit 30;
