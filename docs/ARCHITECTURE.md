# Architecture

```text
Flutter (Android / iOS / Web)
  ├─ Supabase Auth session
  ├─ cached active profile + effective permissions
  ├─ role/permission-driven navigation
  └─ repository layer
          ↓
Supabase API / Edge Functions
          ↓
PostgreSQL
  ├─ profiles
  ├─ vehicles
  ├─ insurance_policies
  ├─ notification_history
  ├─ renewal_requests
  ├─ permissions / role_permissions / user_permissions
  ├─ login_activity
  └─ audit_logs
          ↓
RLS + column grants + protected RPCs
```

The client uses only a publishable Supabase key. Privileged credentials stay inside hosted Edge Functions.

### Vehicle rule

Only an active Administrator with the `add_vehicle`/vehicle-management permission can insert or modify vehicle records. Insurance Officers have read-only vehicle portfolio access; Vehicle Owners see only vehicles assigned to their own `auth.uid()`.

### Reminder backend

Scheduled Edge Functions evaluate policy expiry and send 10/7/3/1/0/-1 stage reminders. Notification history prevents duplicate stage records.
