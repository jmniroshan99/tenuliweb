# Web and rental setup

This is an additive source release based on the supplied InsureDrive 1.8.0+23 archive. The original Flutter `web/` directory and existing GPS/notification services remain in place. The separate browser-native client is `insuredrive-web/`; Flutter source now identifies as 1.9.0+24. There is no built APK or hosted deployment in this package.

## Requirements and local preview

Use Node.js 22.18+ within the 22.x line (the tests use native TypeScript stripping), npm, and the existing Flutter/Android build tools for native builds. From Windows use START_WEB.bat, BUILD_WEB.bat and TEST_WEB.bat. Alternatively:

```powershell
cd insuredrive-web
npm ci
npm run dev
```

Open the URL Vite prints. The explicit synthetic demo needs no credentials, creates an in-memory PGlite database and executes the exact rental migration. It is reset on reload and never synchronizes with live data. Legacy insurance/admin demo records are read-only. Demo and test fixtures must NEVER be executed in a real Supabase database.

## Existing Supabase prerequisites

Do not assume the supplied SQL has already run. Review `docs/SUPABASE_SETUP.md` and the existing migration history against the deployed database. Back up before changes; test first in a staging copy.

The rental migration expects the existing `app_role` enum, `profiles`, `vehicles`, `permissions`, `role_permissions`, `user_permissions`, `audit_logs` and helpers `current_user_role()`, `current_user_is_active()`, `has_permission(text)`, `get_effective_permissions()` and `permission_allowed_for_role(app_role,text)` with their supplied contracts. Vehicle ownership stays in `vehicles.user_id`.

For an existing installation, verify the base schema, production RBAC, advanced administrator security and vehicle owner assignment upgrades. Relevant supplied scripts are `schema.sql`, `RBAC_UPGRADE_RUN_THIS.sql`, `ADVANCED_ADMIN_SECURITY_RUN_THIS.sql`, `VEHICLE_OWNER_ASSIGNMENT_RUN_THIS.sql`. Use the existing VERIFY scripts. For compliance/GPS/notifications screens also verify the applicable existing compliance, card details, notification/FCM, GPS and external GPS migrations. These are preserved in the archive; do not blindly reapply all old migrations to production.

Run the read-only `supabase/PRECHECK_RENTALS.sql` first and inspect all prerequisite results. After installation, use `supabase/VERIFY_RENTALS.sql` and the staging role tests.

Apply **one** copy of the new migration after prerequisites:

- Supabase SQL editor: run `supabase/RENTALS_UPGRADE.sql` once as the database owner; or
- An already correctly baselined Supabase CLI repository: apply `supabase/migrations/20261024043337_rental_billing.sql` through your normal reviewed migration process.

The two files are byte-identical. Do not run both. The new migration uses a transaction and intentionally fails if its new tables already exist. A failed transaction should be rolled back before a corrected retry. The frontend demo copy is also identical and is not a deployment script.

The migration adds rental permissions, checked transactional RPC, read policies and a private idempotency ledger. It extends the existing permission allow-list while retaining its prior function in `rental_private`. Do not reapply an older security migration over the new wrapper: doing so could remove recognition of the rental keys.

## Environment and login

Copy `insuredrive-web/.env.example` to `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_OR_LEGACY_ANON_KEY
```

Use the existing project's public configuration and existing users. Never put a service-role/secret key, Firebase service account or GPS provider secret in VITE variables, Dart defines or client source. Public frontend configuration is compiled into the browser bundle. Restart Vite after environment changes and rebuild for production changes.

The app checks active profile state and effective permissions before loading data. The initial administrator receives rental rights; insurance officers receive none by default. An administrator can grant the individual rental permissions through Access & audit. Owners get redacted summaries for their currently owned vehicles, with no renter identity, invoices or payment ledger.

Existing legacy modules rely on the existing RLS policies and RPC functions; missing tables show a useful load error. Test existing owner/officer/admin accounts against staging before launch. The same login identity is shared; browser and APK sessions are separate logins.

## Production website

```powershell
cd insuredrive-web
npm ci
npm test
npm run build
```

Deploy only `insuredrive-web/dist` to an HTTPS static host. Serve the app at the domain root because assets use root-relative paths; configure an index.html fallback and correct JavaScript/WASM MIME types. Bundle includes lazy-loaded local demo assets. No privileged server key is needed by the web client. Configure your existing Supabase Auth site's URL/allowed redirects for the intended domain when needed by your authentication workflows. This client implements existing-account email/password sign-in; administrators can change their own password in Settings → Security. Account provisioning and other users’ password resets remain in the existing authorized process.

Authorize only intended origins in any existing Edge Function CORS configuration. Do not change GPS or FCM secrets. Web GPS shows authorized tracker data and trip routes; Android background tracking remains responsible for collection. The map uses OpenStreetMap tiles with attribution and therefore needs network access.

In Settings → Business details, enter the rental invoice business details. This release uses simple pricing without tax controls. Tenuli Auto Care branding is included; repair invoice logos can be edited in Repair Billing → Bill settings. See SIMPLE_BILLING_AND_PASSWORD_UPDATE.md for the required upgrade and historical-record handling.

## Rebuild Android

The existing installed 1.8.0 APK does not contain rentals. Use the updated source and your normal approved Flutter environment:

```powershell
flutter pub get
flutter analyze
flutter test
flutter build apk --release --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co --dart-define=SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY --dart-define=INSUREDRIVE_WEB_URL=https://YOUR_WEB_DOMAIN
```

Retain the existing Firebase setup, signing configuration and other required defines described by the original project. The new Rentals & Billing menu appears only after successful server permission loading. Mobile supports customers, bookings, checkout/return, extensions, final charges, invoice issue/view/void, payments, deposit application and refunds. PDFs/80 mm receipts open in the connected web portal, which requires the same user's web login; the APK does not locally render PDFs. Native build and device behavior were not verified here.

## First staging acceptance run

1. Sign in as admin in web and the rebuilt APK; confirm the same vehicle IDs/ownership.
2. Create a synthetic customer and booking in web. Verify it appears on APK after refresh and after reconnect.
3. Confirm, record checkout and return. Verify odometers and totals in both clients.
4. Use the documented LKR 33,000 fixture, allocate LKR 10,000 advance and hold LKR 15,000 deposit separately. Expect LKR 23,000 due.
5. Issue an invoice, record a partial payment, apply part of the deposit, refund the unused deposit and verify the ledger.
6. Update customer/business details and confirm issued invoice charge/contact snapshots do not change. Void/reissue via the documented refund path.
7. Test two simultaneous staff sessions booking the same vehicle and issuing payments. Run `tests/concurrency.mjs` only on a disposable database, never staging with real records.
8. Verify owner isolation, no officer default access, explicit grant/revoke and suspended-account denial through direct authenticated RPC as well as UI.
9. Download a Sinhala A4 PDF, reopen it, verify all pages, print A4 and select an 80 mm paper size on a thermal printer. Test user-initiated Share on the actual phone. PDFs use rasterized pages to preserve Sinhala shaping, so their text is not selectable.
10. Test 375 px and 768 px viewports, long forms, keyboard navigation and reconnect on actual devices. Some technical/status labels remain English when Sinhala is selected.

## Backup and recovery

Before migration keep a database backup and the original deployed source. If migration fails before commit, fix prerequisites and retry after rollback. If frontend deployment fails, roll back static hosting; existing app features remain independent of the new web client.

After rentals contain real data, do NOT drop rental tables, reset numbering, remove the private idempotency ledger or restore an older backup over later payments as a casual rollback. Disable rental permissions through the existing audited admin process and take a new backup. Reconcile issued documents/ledger before a database recovery or corrective forward migration. Do not rerun base schema scripts to undo this release. Roll back native app distribution separately if required.
