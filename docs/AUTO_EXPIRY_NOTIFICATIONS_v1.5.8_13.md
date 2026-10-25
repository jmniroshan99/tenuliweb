# InsureDrive v1.5.8+13 — Automatic Expiry Notifications

## What was checked

The v1.5.8 source already contained FCM delivery logic for Insurance, Revenue Licence, Emission Certificate and Fitness Certificate expiry events. It also contained recipient-aware delivery to the assigned Vehicle Owner and every active Administrator.

The missing production piece was the actual **daily scheduler configuration**. The previous `cron_vehicle_compliance_example.sql` contained comments only, so a licence date reaching a reminder threshold would not automatically invoke the Edge Function unless an external scheduler was already configured.

## Fixes in this build

- Adds production daily `pg_cron` + `pg_net` schedules for insurance and vehicle compliance expiry dispatchers.
- Adds `check-vehicle-compliance` to `supabase/config.toml` with `verify_jwt = false`; the function itself now requires `x-cron-secret`.
- Makes both scheduled functions fail closed if `CRON_SECRET` is missing.
- Filters out inactive vehicles.
- Revenue Licence records with `source = estimated` do **not** create authoritative expiry push notifications.
- Historical/superseded Revenue Licence / emission / fitness records are skipped when a newer expiry record exists.
- Adds a Revenue Licence notification test button for Administrators.
- Push payloads and foreground local notifications use the `vehicle_compliance` high-importance channel and public lock-screen visibility. Device privacy settings can still hide notification text.
- Keeps default reminder thresholds: `30,10,7,3,1,0,-1`.
- `0` = expires today; `-1` = one-time expired follow-up the next day.

## One-time backend setup

### 1. Apply the v1.5.8 notification migration

Run in Supabase SQL Editor:

`supabase/ADMIN_GLOBAL_EXPIRY_NOTIFICATIONS_RUN_THIS.sql`

### 2. Firebase server credentials

The Android Firebase configuration in `firebase_options.dart` is **not** enough for Supabase Edge Functions to send FCM pushes. Keep Firebase server credentials only in Supabase secrets:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

For this Firebase project, `FIREBASE_PROJECT_ID` is `insureapp-49598`. Obtain `client_email` and `private_key` from a Firebase/Google service-account JSON. Never put the private key in Flutter, GitHub, or this ZIP.

### 3. Configure the cron secret and deploy

From the linked project root on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\configure_expiry_cron_secret.ps1
```

The script securely generates a random `CRON_SECRET`, saves it to Supabase Edge Function secrets, deploys the relevant functions, and prints one SQL statement for the matching Vault secret.

### 4. Enable daily scheduling

After creating the Vault secret, run:

`supabase/AUTO_EXPIRY_NOTIFICATIONS_SCHEDULE_RUN_THIS.sql`

The jobs run shortly after midnight Asia/Colombo every day.

### 5. Verify

Run:

`supabase/VERIFY_AUTO_EXPIRY_NOTIFICATIONS.sql`

and:

`supabase/VERIFY_ADMIN_GLOBAL_EXPIRY_NOTIFICATIONS.sql`

## Test without waiting for a real expiry

Login as an Administrator and open **Notification Settings → Notification Test → Test Revenue Licence Reminder**. This uses the real Supabase Edge Function + Firebase server credentials + stored phone FCM token and sends on the `vehicle_compliance` channel.

To verify the real automatic rule, use a test vehicle with a current/manual/verified Revenue Licence whose expiry is exactly 7, 3, 1 or 0 days from the Asia/Colombo date, then invoke `check-vehicle-compliance` with the cron secret or wait for the daily job. Dedupe prevents the same recipient/document/threshold from being inserted twice.

## Security

- Never commit `CRON_SECRET`.
- Never commit `FIREBASE_PRIVATE_KEY`.
- Never expose the Supabase service-role key to Flutter.
- The scheduler endpoints deliberately use `verify_jwt = false` because pg_cron authenticates using `x-cron-secret`; the handler rejects calls without the configured secret.
