# InsureDrive v1.5.5 — Notification Upgrade Files Changed

Compared with v1.5.4 Owner Assignment, this release changes/adds 30 files and removes none.

## Flutter client

- `pubspec.yaml` — Firebase Messaging/local notification/settings dependencies; version 1.5.5+9.
- `lib/main.dart` — initializes the notification service without blocking the app when Firebase is not configured.
- `lib/firebase_options.dart` — safe template replaced by `flutterfire configure`.
- `lib/notifications/notification_service.dart` — FCM permission, token lifecycle, channels, foreground display and tap routing.
- `lib/models/notification_preferences.dart` — category preferences + permission state model.
- `lib/models/app_notification.dart` — generic policy/vehicle/security notification model.
- `lib/data/supabase_repository.dart` — secure token registration, preferences and push function calls.
- `lib/state/insurance_controller.dart` — login/logout token lifecycle, preferences, tests and event push hooks.
- `lib/screens/app_shell.dart` — one-time permission explainer, deep-link routing and Notification Settings navigation.
- `lib/screens/notification_settings_screen.dart` — permission status, categories, Open Settings and admin tests.
- `lib/screens/notifications_screen.dart` — generic notification icons/status and safe resend behavior.
- `lib/l10n/app_localizations.dart` — English/Sinhala notification UI strings.

## Supabase

- `supabase/NOTIFICATIONS_FCM_UPGRADE_RUN_THIS.sql`
- `supabase/VERIFY_NOTIFICATIONS_FCM.sql`
- `supabase/migrations/20260813_notifications_fcm_upgrade.sql`
- `supabase/schema.sql` — fresh database schema includes the notification upgrade.
- `supabase/config.toml` — registers `send-push-notification`.
- `supabase/functions/send-push-notification/index.ts` — secure role-aware FCM dispatcher.
- `supabase/functions/admin-manage-users/index.ts` — sends account-status security notice before suspended-device tokens are disabled.
- `supabase/functions/send-policy-reminder/index.ts` — bilingual/preference-aware manual reminder resend.
- `supabase/functions/check-expiring-policies/index.ts` — bilingual/preference-aware 10/7/3/1/0/-1 scheduled reminders.
- `supabase/.env.notifications.example` — secret-name template only; contains no real credentials.

## Android / setup documentation

- `scripts/configure_android_notifications.ps1` — patches a freshly generated Android folder with notification permissions, desugaring, release icon retention, and the existing Windows cache workaround.
- `docs/FIREBASE_NOTIFICATIONS_SETUP.md` — full Firebase/Supabase/Android/iOS/deployment/test guide.
- `docs/FIREBASE_SETUP.md` — points to the new complete guide.
- `NOTIFICATIONS_FCM_UPDATE.txt` — concise release notes.
- `VALIDATION_REPORT.txt` — v1.5.5 static validation scope and user-side verification boundaries.

## Tests

- `test/notification_preferences_test.dart`
- `test/app_notification_test.dart`
