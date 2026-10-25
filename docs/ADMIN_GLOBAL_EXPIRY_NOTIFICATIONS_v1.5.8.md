# InsureDrive v1.5.8 — Administrator Global Expiry Notifications

## Business rule
Every **active Administrator** receives every authoritative expiry alert across the system. Administrator delivery does not depend on vehicle ownership or assignment.

Owner delivery remains private to the assigned Vehicle Owner. Insurance Officers are not added as global expiry recipients.

## Covered expiry types
- Insurance
- Vehicle Revenue Licence
- Emission Certificate
- Fitness Certificate

Default reminder thresholds remain `30,10,7,3,1,0,-1` (`-1` is the one-time expired follow-up).

## Backend design
`supabase/functions/_shared/expiry_notifications.ts` centralizes:
- active Administrator lookup by role/status
- owner + Administrator recipient resolution
- recipient-aware duplicate keys
- per-recipient notification history
- FCM delivery to all active device tokens
- invalid token deactivation
- English/Sinhala copy selection
- Asia/Colombo-aligned expiry metadata

Administrator preferences do not suppress system-wide expiry alerts. Owner preferences continue to apply to owner copies.

## Database migration
Run in Supabase SQL Editor:

`supabase/ADMIN_GLOBAL_EXPIRY_NOTIFICATIONS_RUN_THIS.sql`

Then verify with:

`supabase/VERIFY_ADMIN_GLOBAL_EXPIRY_NOTIFICATIONS.sql`

The migration removes the legacy global `UNIQUE(policy_id, reminder_days)` constraint because it prevented multiple recipients from receiving the same policy threshold. Duplicate protection now relies on `dedupe_key`, which includes the recipient user ID.

## Deploy Edge Functions
From the linked Supabase project root:

```bash
npx supabase functions deploy check-expiring-policies
npx supabase functions deploy check-vehicle-compliance
npx supabase functions deploy send-policy-reminder
npx supabase functions deploy send-push-notification
```

The `_shared` module is bundled with the functions that import it.

## Flutter behavior
Administrators load their own recipient-specific global notification records, so the bell badge represents unread alerts for the current Administrator only. Administrator notification filters include Insurance, Revenue Licence, Emission, Fitness, Urgent and Expired.

Owners continue to load only their own notification rows. Officers preserve operational notification visibility but do not receive generated global expiry push copies.

## Firebase
Keep these only in Supabase secrets:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Never place Firebase server credentials, Supabase service-role credentials, or database passwords in Flutter/GitHub.

## Verification scenario
Create/choose an expiry record that matches a configured threshold, then invoke the relevant scheduler. Query `notification_history` and confirm:
- one `vehicle_owner` row when the owner is eligible
- one `administrator_global` row for every active Administrator
- no row for inactive/suspended Administrators
- no automatic global recipient row for Insurance Officers
- distinct recipient-aware `dedupe_key` values
