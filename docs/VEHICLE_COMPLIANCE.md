# InsureDrive v1.5.6 — Vehicle Compliance & Due Calculation

This release adds a centralized due-calculation layer for insurance, Revenue Licence, emission and fitness records while preserving the existing authentication, RBAC, owner assignment, FCM notifications, Sinhala/English and light/dark themes.

## Authoritative dates

- Insurance: use the actual `insurance_policies.expiry_date` from the policy/certificate.
- Revenue Licence: prefer the latest actual `vehicle_revenue_licences.expiry_date`.
- Registration-date calculation is only an estimate when no actual Revenue Licence expiry is stored.
- Emission/Fitness: use the actual certificate expiry dates. No expiry is fabricated.
- Date-only calculations are centralized in `lib/services/compliance_calculator.dart`.

## Status bands

- >10 days: Valid
- 4–10 days: Due Soon
- 2–3 days: Urgent
- 1 day: Expires Tomorrow
- 0 days: Expires Today
- <0 days: Expired
- Missing authoritative date: Unknown, except Fitness defaults to Not Required until configured.

## Database setup

Run in Supabase SQL Editor after the previous v1.5.4/v1.5.5 migrations:

1. `supabase/VEHICLE_COMPLIANCE_RUN_THIS.sql`
2. `supabase/VERIFY_VEHICLE_COMPLIANCE.sql`

The migration creates:

- `vehicle_revenue_licences`
- `vehicle_emission_certificates`
- `vehicle_fitness_certificates`
- `vehicle_compliance_settings`
- `sri_lanka_public_holidays`
- latest-record security-invoker views
- RLS policies and indexes
- compliance audit triggers
- the `manage_revenue_licence` fine-grained permission

Administrator receives `manage_revenue_licence` by default. Insurance Officers do not. An Administrator can explicitly grant it to an Officer through the existing access privilege mechanism. Vehicle Owners can only read compliance records for their own assigned vehicles.

## Official Revenue Licence service

The Flutter UI opens the official Government service externally:

`https://www.gov.lk/services/erl/es/erl/view/index.action`

InsureDrive does not scrape or bypass CAPTCHA, OTP or government access controls, and calculated dates are explicitly labelled as estimates.

## FCM compliance reminders

Deploy the new scheduled function:

```cmd
npx supabase functions deploy check-vehicle-compliance
```

It uses the same Firebase service-account secrets as the existing notification functions. Optional reminder configuration:

```cmd
npx supabase secrets set COMPLIANCE_REMINDER_DAYS="30,10,7,3,1,0,-1"
```

Schedule the function once daily. Use `CRON_SECRET` for a protected scheduled invocation. Notification dedupe keys include document type, document ID, reminder offset and due date.

The Android channel is `vehicle_compliance`.

## Flutter setup

This release adds `url_launcher` for the official-service button.

```cmd
flutter clean
flutter pub get
flutter analyze
flutter test
flutter run -d chrome
```

For Android release after your Android platform files are configured:

```cmd
flutter build apk --release
```

APK output:

`build\app\outputs\flutter-apk\app-release.apk`

## Main files changed

- `lib/models/vehicle_compliance.dart`
- `lib/services/compliance_calculator.dart`
- `lib/data/supabase_repository.dart`
- `lib/state/insurance_controller.dart`
- `lib/screens/compliance_screen.dart`
- `lib/screens/app_shell.dart`
- `lib/screens/dashboard_screen.dart`
- `lib/notifications/notification_service.dart`
- `lib/security/permissions.dart`
- `lib/l10n/app_localizations.dart`
- `pubspec.yaml`
- `supabase/VEHICLE_COMPLIANCE_RUN_THIS.sql`
- `supabase/VERIFY_VEHICLE_COMPLIANCE.sql`
- `supabase/functions/check-vehicle-compliance/index.ts`
- `supabase/functions/check-expiring-policies/index.ts`
- `test/compliance_calculator_test.dart`

## Revenue Licence history
When a licence is renewed, use **Add Renewal Record** rather than overwriting the prior record. This inserts a new row so previous licence history remains available.
