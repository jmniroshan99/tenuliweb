# InsureDrive v1.5.6 — changed/added files

## Added
- `VEHICLE_COMPLIANCE_UPDATE.txt`
- `docs/VEHICLE_COMPLIANCE.md`
- `docs/VEHICLE_COMPLIANCE_FILES_CHANGED.md`
- `lib/models/vehicle_compliance.dart`
- `lib/services/compliance_calculator.dart`
- `lib/services/revenue_licence_verification_service.dart`
- `lib/screens/compliance_screen.dart`
- `supabase/VEHICLE_COMPLIANCE_RUN_THIS.sql`
- `supabase/VERIFY_VEHICLE_COMPLIANCE.sql`
- `supabase/migrations/20260814_vehicle_compliance_upgrade.sql`
- `supabase/functions/check-vehicle-compliance/index.ts`
- `supabase/cron_vehicle_compliance_example.sql`
- `test/compliance_calculator_test.dart`

## Updated
- `README.md`
- `UPGRADE_NOTES.md`
- `pubspec.yaml`
- `lib/data/supabase_repository.dart`
- `lib/l10n/app_localizations.dart`
- `lib/notifications/notification_service.dart`
- `lib/screens/app_shell.dart`
- `lib/screens/dashboard_screen.dart`
- `lib/screens/notification_settings_screen.dart`
- `lib/screens/reports_screen.dart`
- `lib/security/permissions.dart`
- `lib/state/insurance_controller.dart`
- `supabase/functions/check-expiring-policies/index.ts`

## History behavior
Revenue Licence renewals can be added with **Add Renewal Record**, which inserts a new licence row instead of overwriting the previous record.
