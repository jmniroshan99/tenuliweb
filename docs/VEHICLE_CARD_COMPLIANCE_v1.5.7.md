# Vehicle-card compliance v1.5.7

The Vehicles screen now derives document status from authoritative expiry dates already loaded by the controller. No `days_remaining` value is persisted.

## Card flow

`Vehicle -> current policy / latest revenue licence / latest emission / latest fitness -> ComplianceCalculator -> vehicle card + compliance details + reminders`

Revenue Licence order of trust remains:

1. Existing government-verified record (only if legitimately created/verified outside the manual editor)
2. Actual licence details entered from the physical/current licence
3. Manual entry
4. Registration-date calculated estimate

The UI never promotes a manual record to Government Verified.

## Existing database

Run `supabase/VEHICLE_CARD_COMPLIANCE_RUN_THIS.sql` after the v1.5.6 compliance migration. It adds `notes`, permits the `actual` source value, and confirms the key indexes.

## Official service

The Government Revenue Licence URL opens in an external browser. InsureDrive does not scrape CAPTCHA/OTP pages or claim calculated dates are government verified.
