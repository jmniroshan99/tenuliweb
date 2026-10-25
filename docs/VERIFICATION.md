# Verification record — 24 October 2026

All execution here used local synthetic data. No live Supabase migration, credential, deployment, real customer record, payment processor or Android device was used.

## Completed

| Check | Result and scope |
| --- | --- |
| TypeScript + Vite production build | Passed. Output recorded in `verification/web-build.txt`. |
| Rental backend tests | 22 assertions passed using PGlite PostgreSQL with the exact rental migration and synthetic existing-platform prerequisites. |
| Utility tests | 4 passed: exact minor-unit input, Colombo time conversion, 1,000 unique valid UUIDs, advance/deposit separation. |
| Dependency audit | `npm audit` reported 0 vulnerabilities at verification time; JSON report included. |
| Migration consistency | Canonical SQL, timestamp migration and browser demo SQL are byte-identical. |
| Dart syntax | Standalone Dart formatter parsed/formatted the five changed/new Dart files. This is NOT Flutter static analysis or a build. |
| Browser rental workflow | Created UI Synthetic Customer and a DEMO-003 booking, saved edited pickup/return dates, confirmed, checked out at 1,000 km, returned at 1,380 km after 3 days, previewed quote, recorded 10,000 advance and separate 15,000 deposit, issued invoice INV-2026-000002 and opened its invoice view. Total 33,000, allocated 10,000, due 23,000; separate deposit 15,000. |
| Date-input regression | Browser test found a controlled datetime input could display a changed value while saving the old state. Forms now submit native named FormData. Repeating the workflow saved the exact chosen dates and produced three billed days. |
| Sinhala and pagination | Sinhala navigation/customer/invoice HTML rendered. Development PDF fixture rendered 27 item lines over 3 page sections with repeated details and final totals; PDF generation reached the ready state. |
| Responsive dialog | At a 375 × 760 iframe viewport, booking dialog rectangle was x=17,y=17,width=341,height=726, with scrollable form content. Desktop invoice dialog also stayed within the viewport. |

Node's test runner lists five top-level tests: the database file executes 22 assertions, and the other file registers four individual utility tests. Thus the report is **22 database checks + 4 utility tests**, not a claim of 26 independent Node test suites.

Database checks cover idempotent retry/payload mismatch, daily periods, overlap rejection, stale versions, invalid odometers, the required LKR fixture, advances/deposits, duplicate issuance/client tampering, invoice immutability, deposit application/refunds, overpayment/refund rejection, owner redaction and direct/RPC isolation, second-owner isolation, officer defaults, suspended accounts, refund/void/reissue/numbering, invalid dates, boundaries/rounding, null-version/null-charge attacks, forged deposit methods, inactive vehicles, final-charge correction and sequence width overflow.

## Not verified / blockers

- **True simultaneous PostgreSQL sessions:** PGlite is single-session, so overlap assertions do not prove contention behavior. `tests/concurrency.mjs` provides independent PostgreSQL clients testing overlapping confirmation, same-booking duplicate issuance, distinct concurrent invoice numbers, same-key payment retries and overpayment races. It was not run: this environment could not initialize the attempted non-root PostgreSQL instance. Run it only against an empty disposable PostgreSQL database with a setup superuser, following the opt-in below.
- **Downloaded PDF output:** html2canvas rendering and PDF generation completed and exposed a ready download link. This managed browser did not return a download event, and its URL security policy explicitly blocked observing the generated `blob:` PDF page. The blocked route was not bypassed. Actual downloaded file integrity, Sinhala rendering in an external PDF viewer, printer output and WhatsApp/mobile share remain unverified. Test these locally; do not treat the HTML preview as proof of the downloaded file.
- **Flutter analyze/APK:** automatic approval review rejected the Flutter validation command because it attempted to contact the link-local cloud metadata service, which can expose instance credentials. No workaround was attempted. Standalone Dart syntax formatting succeeded, but dependency resolution, Flutter analysis, Android build, APK installation and native UI behavior are unverified. The original existing tests were not run under Flutter. The supplied archive had no `pubspec.lock`; a Flutter lockfile could not be generated without resolving Flutter dependencies. Run `flutter pub get` in your approved environment and commit its generated lockfile. The new web app includes its verified `package-lock.json`.
- **Live integration:** no live Supabase auth/RLS/Realtime, pre-existing migration state, existing insurance/compliance/GPS functions, notifications/FCM, permissions UI, browser/native reconnect or real two-device synchronization was tested. The synthetic platform intentionally implements only the minimum contracts needed by rental tests. See the staging acceptance checklist in `WEB_RENTALS_SETUP.md`.
- **Device coverage:** phone-width iframe and desktop layout checks are not a substitute for real Android/iOS/Safari, keyboard/screen-reader or thermal-printer testing.

## Reproduce local checks

From `insuredrive-web` with Node.js 22.18+:

```powershell
npm ci
npm test
npm run build
npm audit
npm run dev
```

For manual visual fixtures on the dev server open `/tests/pdf-fixture.html` and `/tests/responsive-fixture.html`. These use synthetic data; they are not entry points in the production build. The PDF fixture has a 27-line A4 case, a native-dialog case and an 80 mm receipt toggle.

For the independent session script, use an entirely new empty disposable database. The script refuses existing `public.profiles`/`auth` installations but this guard is not a reason to use a real database. It deliberately creates fixture schemas/roles and leaves its test records:

```powershell
$env:INSUREDRIVE_ALLOW_TEST_DB = '1'
$env:TEST_DATABASE_URL = 'postgresql://TEST_USER:TEST_PASSWORD@localhost:5432/insuredrive_disposable_test'
node tests/concurrency.mjs
Remove-Item Env:TEST_DATABASE_URL
Remove-Item Env:INSUREDRIVE_ALLOW_TEST_DB
```

Logs and fixture data contain no real users. Secret/private-key pattern inspection found only the original notification example's placeholder. Dependency folders, build outputs, actual environment files, SDK downloads and temporary PostgreSQL runtime files are excluded from the source ZIP.
