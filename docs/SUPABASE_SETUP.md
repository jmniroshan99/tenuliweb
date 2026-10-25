# Supabase setup — InsureDrive v1.4

The Flutter client uses `supabase_flutter` with a Supabase Project URL and publishable client key from `lib/config/app_config.dart` (or `--dart-define` overrides).

## Existing v1.3 project

1. Open Supabase SQL Editor.
2. Run `supabase/RBAC_UPGRADE_RUN_THIS.sql` once.
3. Run `supabase/VERIFY_RBAC.sql` to review tables, RLS, policies, roles and protected functions.
4. Deploy the three functions in `supabase/functions/` as described in the root README.

Do not rerun the old schema against an existing database.

## New project

Run `supabase/schema.sql`. It contains the base tables followed by the production RBAC upgrade.

## Expected tables

- `profiles`
- `vehicles`
- `insurance_policies`
- `device_tokens`
- `notification_history`
- `renewal_requests`

## Roles

- `vehicle_owner`
- `insurance_officer`
- `administrator`

New Auth users start as `vehicle_owner`. Administrative account creation/activation is server-side, and role promotion is performed with the protected admin RPC.

## Flutter

```cmd
flutter pub get
flutter run -d chrome
```

Optional project override:

```cmd
flutter run -d chrome ^
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co ^
  --dart-define=SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Never put a service-role key, Supabase secret key, PostgreSQL password or Firebase private key in Flutter.
