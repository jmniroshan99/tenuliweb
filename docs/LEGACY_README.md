> **Web + Rentals source update (1.9.0+24):** start with [START_HERE_SINHALA.md](START_HERE_SINHALA.md) and [web setup](docs/WEB_RENTALS_SETUP.md). Original documentation below is retained and may describe earlier versions. No APK is included.

# InsureDrive v1.6.0 Dedicated Vehicle GPS Tracking

This release adds secure dedicated Android car-audio/head-unit GPS tracking while retaining the confirmed v1.5.8 expiry notification, Firebase, Supabase, RBAC and vehicle-compliance workflows. Gmail/Google account information is optional identity metadata only; location and speed come from Android GPS/Location Services.

Main additions: Live Tracking dashboard, secure one-vehicle/one-device pairing, current GPS speed/location, movement-derived trips, route history, overspeed alerts, circular geofences, online/offline tracker alerts, bounded offline telemetry retry, RLS-protected tracking tables and future OBD-II integration boundary. High-frequency route points are stored once in `vehicle_locations` (linked to trips by `trip_id`) and a daily retention job bounds raw telemetry growth.

Start with `GPS_TRACKING_SETUP_FIRST.txt` and `docs/GPS_TRACKING.md`.

## v1.5.8 Administrator Global Expiry Alerts

Active Administrators now receive recipient-specific system-wide expiry alerts for Insurance, Revenue Licence, Emission and Fitness records. See `docs/ADMIN_GLOBAL_EXPIRY_NOTIFICATIONS_v1.5.8.md` and run `supabase/ADMIN_GLOBAL_EXPIRY_NOTIFICATIONS_RUN_THIS.sql` before deploying the updated notification Edge Functions.

# InsureDrive – Sri Lanka Vehicle Insurance Manager v1.5.6

Flutter + Supabase/PostgreSQL vehicle-insurance management application with production-oriented RBAC, Administrator-only vehicle registration, user-specific access privileges, richer customer profiles, login activity and audit logs.

## v1.5.6 Vehicle Compliance

This source now includes centralized Insurance / Revenue Licence / Emission / Fitness due-date calculations, a bilingual Vehicle Compliance screen, official Government Revenue Licence link, configurable penalty/holiday data, compliance RLS/audit logging and duplicate-protected FCM compliance reminders. See `docs/VEHICLE_COMPLIANCE.md`.

Run `supabase/VEHICLE_COMPLIANCE_RUN_THIS.sql` after the earlier RBAC / owner-assignment / notifications migrations.

## Midnight Electric Blue UI Theme

The whole application now uses a reference-inspired dark navy/electric-blue visual system. It is intentionally lightweight: the global background uses simple gradients and the existing screens continue to rely on Material 3 surfaces, so the visual upgrade does not add image-heavy or shader-heavy loading costs.

Core palette:
- Background: `#071226` / `#050B18`
- Deep navy: `#0A1D57`
- Electric blue: `#2168ED`
- Bright accent: `#3984FF`
- Soft blue: `#6192E9`
- Primary text: `#F3F7FF`
- Secondary text: `#A9BAD9`

See `docs/THEME_GUIDE.md` for the design system. The application supports the Midnight Electric Blue dark theme and the professional light theme, with saved English/Sinhala language preference.

## Access model

### Administrator
- Only role that can register, reassign, edit or deactivate vehicles.
- Manages users, roles, account status and user-specific permissions.
- Reviews user-specific login activity plus searchable/filterable audit trails.
- Manages policies, reminders, reports, Login Activity and Audit Logs.

### Insurance Officer
- Views Vehicle Owner customers and their registered vehicles.
- Creates, edits and renews insurance policies when the permission is enabled.
- Cannot register/edit/deactivate vehicles, manage users/roles or view security logs.

### Vehicle Owner
- Views only vehicles assigned to their Supabase user ID.
- Views own insurance and notifications and can request renewal.
- Edits approved personal profile details.
- Cannot add vehicles or issue/edit insurance policies.

Flutter hides unauthorized UI, but backend security does not depend on hidden buttons. PostgreSQL RLS, column grants, protected RPCs and Edge Functions enforce sensitive privileges independently.

## Existing database upgrade

If you already applied the v1.4 `RBAC_UPGRADE_RUN_THIS.sql`, do **not** recreate the database.

1. Supabase Dashboard → **SQL Editor** → **New query**.
2. Open `supabase/ADVANCED_ADMIN_SECURITY_RUN_THIS.sql`.
3. Copy the complete file into SQL Editor and click **Run**.
4. Open a new query and run `supabase/VERIFY_ADVANCED_ADMIN_SECURITY.sql`.

For a brand-new Supabase project, first apply the base schema/RBAC files described in `docs/SUPABASE_SETUP.md`, then apply the advanced upgrade.

## v1.5.4 Administrator vehicle-owner assignment

After the existing advanced security upgrade, run:

1. `supabase/VEHICLE_OWNER_ASSIGNMENT_RUN_THIS.sql`
2. `supabase/VERIFY_VEHICLE_OWNER_ASSIGNMENT.sql`

The v1.5.4 assignment layer removes ordinary client UPDATE access to `vehicles.user_id` and routes reassignment through the protected `assign_vehicle_owner` RPC. The RPC validates the authenticated Administrator and the active Vehicle Owner on the server and records ownership audit events. See `docs/VEHICLE_OWNER_ASSIGNMENT.md`.

Because the current production schema keeps `vehicles.user_id NOT NULL`, vehicles cannot be left unassigned; use **Change Owner** to reassign directly to another active Vehicle Owner.

The v1.5 advanced migration adds:
- `profiles.account_status` (`active`, `inactive`, `suspended`)
- rich Sri Lankan customer profile fields
- vehicle fuel type, colour and registration date
- `permissions`, `role_permissions`, `user_permissions`
- `login_activity` and `audit_logs`
- server-side effective permission checks
- Administrator-only vehicle INSERT/UPDATE/DELETE RLS
- permission-aware profile/policy/notification RLS
- last-active-Administrator protection
- security/performance indexes

## Edge Functions

Deploy/redeploy from the project root with Supabase CLI:

```bash
supabase login
supabase link --project-ref ssykwhwnujxkzokpdeey
supabase functions deploy admin-manage-users
supabase functions deploy record-login-activity
supabase functions deploy send-policy-reminder
supabase functions deploy check-expiring-policies
```

- `admin-manage-users`: secure Owner/Officer creation and active/inactive/suspended account management.
- `record-login-activity`: login success/failure, logout and session-restored activity. Passwords/tokens are never stored.
- `send-policy-reminder`: operational resend workflow.
- `check-expiring-policies`: scheduled 10/7/3/1/0/-1 reminder stages.

The Flutter project contains no `service_role` key. Supabase injects server secrets into hosted Edge Functions.

## Push notification secrets

Configure server-side Firebase/cron secrets as described in `docs/FIREBASE_SETUP.md`, for example:

```bash
supabase secrets set FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
supabase secrets set FIREBASE_CLIENT_EMAIL=YOUR_CLIENT_EMAIL
supabase secrets set FIREBASE_PRIVATE_KEY="YOUR_PRIVATE_KEY"
supabase secrets set CRON_SECRET="YOUR_LONG_RANDOM_SECRET"
supabase secrets set REMINDER_DAYS="10,7,3,1,0,-1"
```

Never put Firebase private keys in Flutter.

## Flutter setup

```cmd
flutter clean
flutter pub get
flutter analyze
flutter test
flutter run -d chrome
```

For Android:

```cmd
flutter devices
flutter run
```

Release APK:

```cmd
flutter build apk --release
```

Output:

```text
build\app\outputs\flutter-apk\app-release.apk
```

If Web support is missing:

```cmd
scripts\repair_web_windows.bat
```

## Supabase client configuration

The app uses `supabase_flutter`. `lib/config/app_config.dart` contains/accepts a Supabase **publishable** client key. Never place any of these in Flutter:

- Supabase `service_role`
- Supabase secret key
- PostgreSQL database password
- Firebase private key

You can override the publishable configuration at build time:

```cmd
flutter run -d chrome ^
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co ^
  --dart-define=SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

## Sri Lanka defaults retained

- Currency: **LKR**
- Country code: **+94**
- Timezone: **Asia/Colombo**
- 9 provinces / 25 districts
- Sri Lankan motor insurer / cover defaults

## Reminder schedule retained

The scheduled backend supports:

- 30 days before expiry (informational)
- 10 days before expiry
- 7 days
- 3 days
- 1 day
- expiry day
- expired stage

Duplicate reminders are protected by the notification-history design.

## Important deployment files

- `RUN_ADVANCED_SECURITY_FIRST.txt`
- `supabase/ADVANCED_ADMIN_SECURITY_RUN_THIS.sql`
- `supabase/VERIFY_ADVANCED_ADMIN_SECURITY.sql`
- `supabase/migrations/20260813_advanced_admin_security.sql`
- `docs/ADVANCED_ADMIN_SECURITY.md`

## Security principle

If the Flutter UI and PostgreSQL permissions ever disagree, **PostgreSQL/RLS wins**. Fix the client flow rather than weakening RLS.

## v1.5.1 role-display repair
If `admin@insuredrive.lk` appears as **Vehicle Owner**, run
`supabase/FIX_BOOTSTRAP_ROLES_RUN_THIS.sql`, sign out, and sign in again.
The Dart role parser is now strict and no longer silently converts unknown database
role values to `vehicle_owner`.

## v1.5.3 — Sinhala + Light/Dark UI

This build adds an app-wide English/Sinhala switch, persistent theme selection,
a new light electric-blue theme, the existing Midnight Blue dark theme, and a
Sinhala-safe bold typography stack. Controls are available before and after
login. See `docs/LANGUAGE_AND_THEME.md`.
