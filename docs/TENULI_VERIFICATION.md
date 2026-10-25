# v1.16.0 security update — 24 October 2026

See `../SECURITY_UPDATE.md` for the current release evidence and limitations. Demo runtime code is removed from the application and release assets. Browser workflow tests now sign in through intercepted Supabase requests backed by a Node-only fixture. Existing PDF renderer and SQL upgrades are unchanged.

Commands: `npm test`, `npm run build`, `npm audit --json`; `node scripts/verify-login.mjs --production`, `node scripts/verify-two-documents.mjs --production`, `node scripts/verify-grouped-billing.mjs --production` with a local Playwright/Chromium installation.

Earlier verification below records the behavior of the named previous releases; references to demo access are historical, not instructions for this version.

---

# Tenuli Auto Care v1.15.0 verification

Verified on 24 October 2026 using synthetic data. No live database, account/password or deployment was changed.

## Current release

- **All 32 Node test entries passed**, including the actual SQL in local PGlite, existing accounting/rounding, advances/payments/refunds/credits, supplier costs/profit, permissions, password mocks, installer, document history and grouped billing. The modern-layout tests verify future-only snapshot tags, immutable earlier documents, new/revised receiving notes and invoices, repeat installation and restricted trigger access.
- **Production build passed** with TypeScript and Vite. The optional PGlite demo retains its existing filesystem/eval and large-chunk warnings; there are no build errors.
- **Historical appearance:** all **37 pages** in four v1.14.0 English/Sinhala receiving and final-bill fixtures were compared after rendering to pixels. Every page was identical. Stored snapshots and financial reports also remain unchanged after the upgrade. The old renderer and its CSS remain in place.
- **24 modern document cases:** short/long receiving, no advance, optional details, short final bills, all four sections, long final bills, large amounts, maximum-length unbroken item descriptions/notes, paid, refund-due and numbered revised copies were checked in English and Sinhala. First-page/continuation layout, continuous numbering, section subtotals, body/footer clearance, signature count and numeric-cell overflow were checked.
- **A4 output:** selected cases were downloaded and printed through the real application export actions. Download and browser-print media boxes are A4, with matching page counts and identical on-screen/print content. Short receiving and final-bill examples fit one page in both languages. Long receiving cases use 3 pages; deliberately long 32-item final bills use 13 English / 14 Sinhala pages. Maximum-length unbroken descriptions plus notes use 4 pages; quantities/prices/charges appear only on each item's first visual row. Large-value final bills fit one page, with complete decimals.
- **Visual checks:** rendered PDF pages were inspected for header size, 13 mm margins, Sinhala text, section tables, continued rows, large values, payment-summary emphasis, signatures and footer separation. Currency appears once in table headings and alongside payment totals; stored values are formatted to two decimals using existing LKR rules.
- **Production workflow browser check passed:** receiving with advance → internal pricing/approval → repair completion → final bill → issued PDF viewer/current ledger → partial/final payment → numbered copies → unchanged originals → separate handover. The LKR 20,000/5,000/15,000 example preserves revenue and does not duplicate the advance. No-advance Sinhala receiving, PDF download/print/sharing dispatch/fallback and 390 px phone forms passed.
- **Grouped billing browser regression passed:** suggestions/custom descriptions, category selection, inclusion/exclusion, M/R internal estimates, discounts, row removal, continuous numbering and updated payment copies remain working. Login browser regression also passed validation, show/hide, loading/duplicate-submit prevention, mocked sign-in/out, permissions and 320–1440 px English/Sinhala layouts.
- New work-summary forms no longer automatically copy the entire item list. Existing staff-entered completion details remain the initial values for a revision. No authentication, permission, financial calculation or handover logic was changed.

## Reproduce

Inside `insuredrive-web`: `npm ci`, `npm test`, `npm run build`.

For optional browser checks, install Playwright locally (`npm install --no-save --package-lock=false playwright`, then `npx playwright install chromium`) and run:

- `node scripts/verify-two-documents.mjs --production`
- `node scripts/verify-grouped-billing.mjs --production`
- `node scripts/verify-login.mjs --production`
- `node scripts/verify-modern-pdfs.mjs`
- `node scripts/verify-two-documents-pdf.mjs` for the preserved v1.14.0 layout.

Document fixtures run on development-only test pages. Production workflow checks use the SQL-backed in-memory synthetic demo. QA screenshots and synthetic documents are internal test outputs and are not included as customer records.

## Limits and installation

Use `MODERN_CUSTOMER_PDFS_UPDATE.md` and the supplied additive migration. Without the upgrade, newly issued snapshots continue using the older layout. Explicit numbered revisions receive the new layout; historical originals are never silently changed.

Not tested: hosted Supabase migration/RLS/Auth/Storage and live advisors, real password changes/MFA/policies, simultaneous PostgreSQL connections, deployed Safari/Firefox, physical phones/printers/native OS share sheets, Windows launchers or Flutter build/signing. Native source and login design remain included. No site was deployed and no APK was built.

PDF downloads retain the raster export for Sinhala fidelity and are not tagged/searchable-text PDFs. Documents are reconstructed from immutable versioned snapshots; separate PDF-binary storage is not added.

Automatic approval review blocked the Supabase CLI's unrelated external telemetry after the migration filename was created. It was not retried; the SQL was completed and verified locally. No live migration depends on that blocked request.

## Previous release evidence

The records below are retained for history; their counts and layout descriptions refer to earlier releases.

# Tenuli Auto Care v1.14.0 verification

Verified on 24 October 2026 using synthetic data. No live database, real password, account or deployment was changed.

## Current release

- **All 28 Node test entries passed.** Actual migration tests run in local PGlite. Existing billing/rounding, rentals, payments/refunds/credits, external shop allocations and profit, historical totals, role isolation, installer, password-flow mocks, service documents, grouped billing and pagination tests remain passing.
- **Production build passed** with TypeScript and Vite. Optional synthetic PGlite demo warnings about filesystem shims/eval and bundle size remain; there are no build errors.
- **Arrival and advance:** optional advance, no advance, no confirmed prices, unchanged customer/insurer approval, required confirmation/method, atomic rollback, request-key retries, changed-payload rejection, immutable receiving snapshots and restricted financial visibility passed.
- **Financial example:** LKR 20,000 invoice minus LKR 5,000 advance leaves LKR 15,000. One LKR 15,000 collection and its duplicate retry result in two payment entries (one advance, one balance), total paid LKR 20,000, zero balance and unchanged LKR 20,000 revenue. A separate test uses LKR 3,000 then LKR 12,000. Zero/negative-invalid amounts, overpayment, stale balance, pending invoice prices, refunds and credits are covered.
- **History and separation:** copies retain one financial invoice; original receiving/invoice/copy snapshots remain unchanged. Legacy invoices can acquire a combined final-bill copy without changing revenue. Handover requires a separate authorized confirmation and server time. Paid and unpaid handover both leave ledger totals unchanged. No new separate completion note or customer payment receipt is required.
- **Permissions:** owner/inactive access, manage-repairs-only staff, billing visibility and payment-management restrictions are checked. Private tables and payment helpers cannot be called directly as a client; catalog assertions verify anonymous RPC denial and guarded authenticated access. Database-wide live security/performance advisors were not run.
- **Production browser workflow passed:** existing-customer suggestion/custom entry → advance receiving note → pricing/discount → approval/start/complete → review final bill → actual PDF preview beside live summary → partial/final collection → numbered copies → old PDF history → separate handover. Desktop and 390 px phone forms did not overflow. English/Sinhala PDF downloads, A4 print and user-initiated sharing dispatch/fallback passed. No browser exceptions occurred.
- **Grouped billing browser regression passed:** all four sections, continuous numbering, custom/suggested descriptions, category changes, excluded rows, row removal, M/R internal estimates, discounts, original snapshots, payments and revised final bills. Newly issued estimates stay internal without customer PDF actions.
- **PDF overflow fixtures passed:** English receiving 7 A4 pages, Sinhala receiving 5, English final bill 13, Sinhala final bill 12. Download and browser-print files have A4 media boxes. First/last pages, item tables, Sinhala text, final payment summary and signatures were visually inspected. The ordinary LKR 20,000 example fits one A4 page. Long-text model tests retain every grapheme and use word boundaries for new templates; older templates keep their established pagination.
- **Login production regression passed:** validation, show/hide password, keyboard Enter, translated error/rate-limit messages, loading/double-submit guard, help, language/theme persistence, mocked sign-in/sign-out, permissions and 320–1440 px English/Sinhala layouts. Password-flow tests use mocked Supabase responses; no real credential was used or changed.

## Reproduce

Inside `insuredrive-web`, run `npm ci`, `npm test`, `npm run build`. For optional browser checks, install Playwright locally (`npm install --no-save --package-lock=false playwright`, then `npx playwright install chromium`) and run:

- `node scripts/verify-two-documents.mjs --production`
- `node scripts/verify-grouped-billing.mjs --production`
- `node scripts/verify-login.mjs --production`
- `node scripts/verify-two-documents-pdf.mjs`

`verify-service-workflow.mjs` now delegates to the two-document workflow check. PDF fixtures start a development-only test page; they are not part of the production entry point. Browser checks use the in-memory synthetic demo or mocked Auth. QA screenshots and synthetic PDFs are internal outputs and are not packaged as customer records.

## Limits and deployment checks

Apply the supplied additive migration in staging, then run `supabase/VERIFY_TENULI.sql` and test real administrator/staff permissions before using production records. The source includes the migration; it has not been applied to the hosted project.

Not tested: live Supabase migration/Auth/RLS/Storage/advisors, configured real password policy/MFA and actual sign-in with a changed password, real simultaneous PostgreSQL sessions, physical devices/printers/native OS share sheets, deployed Safari/Firefox, Windows launchers, and native Flutter build/signing. PostgreSQL locking/idempotency logic was exercised sequentially in PGlite, not under multi-session server load.

PDFs are generated from preserved immutable/versioned snapshots; separate PDF-binary storage is not added. Downloaded PDFs use raster output for Sinhala and are not tagged/searchable-text documents. Native sharing was simulated; unsupported sharing downloaded the PDF. No APK or hosted deployment is delivered.

## Previous release evidence

The following verification records are retained for history; their counts and old document workflows do not describe the current release.

# Tenuli Auto Care v1.13.1 verification

Verified on 24 October 2026 with synthetic records and intercepted Auth responses. No live database, account, password or production deployment was changed.

## Current release

- **All 26 existing Node test entries passed.** Billing, payments, profit, permissions, installer, historical snapshots, document revisions and password-flow regressions remain green.
- **Clean production build passed** with TypeScript and Vite. The optional PGlite demo still produces its pre-existing filesystem/eval and bundle-size warnings.
- **Login UI passed in production Chromium:** required/invalid email validation; keyboard Enter; password masking/show/hide; translated invalid-credential and rate-limit messages; help expansion; loading and duplicate-submit prevention; demo disabled while signing in; theme/language persistence; mocked successful sign-in, permission-filtered navigation and sign-out. Password whitespace was preserved, and raw passwords were absent from browser storage and URLs. Mock responses use the existing Supabase client; they do not establish that a live account can sign in.
- **Responsive layouts:** English and Sinhala were checked at 320, 360, 390, 768, 1024 and 1440 px without horizontal page overflow. Desktop and phone screenshots were visually inspected internally. The phone form uses 16 px inputs; no remote image/font downloads are required.
- **Grouped billing production regression passed:** four sections, M/R, inclusion/exclusion, custom items, category changes, removal, discounts, totals, invoice/payment revisions, original snapshots, mobile editing and Sinhala PDF output.
- **Service-document production regression passed:** arrival → receiving note → approval → repair → invoice/payment → completion note → explicit handover, unchanged balance, earlier revisions, mobile forms, English/Sinhala PDF download and A4 printing. No browser exceptions were observed.
- Original issued financial records, SQL migrations, Auth/permissions logic and prior workshop modules are unchanged by this design release. There is **no new SQL migration**.

## Reproduce

Run `npm ci`, `npm test` and `npm run build` inside `insuredrive-web`. For optional browser checks, install Playwright locally (`npm install --no-save --package-lock=false playwright`, then `npx playwright install chromium`) and run:

- `node scripts/verify-login.mjs --production`
- `node scripts/verify-grouped-billing.mjs --production`
- `node scripts/verify-service-workflow.mjs --production`

Login checks intercept all remote requests and use only synthetic Auth/API responses. Workshop checks use the in-memory synthetic demo. QA screenshots are internal test outputs, not customer documents.

## Not tested for this release

Real credentials, hosted Supabase Auth/RLS/Storage, password policies/MFA, real simultaneous PostgreSQL sessions, deployed Safari/Firefox, physical phones/keyboard autofill services, physical printers and native sharing, Windows launchers, and Flutter build/signing. Existing multi-page PDF evidence below is retained from v1.13.0; this release reran the workflow PDF checks but did not rerun the 14-page fixtures because document code did not change. Native Flutter login design is unchanged. No APK or public deployment was created.

## Previous release evidence

The following records are retained for history.

# Tenuli Auto Care v1.13.0 verification

Verified on 24 October 2026 with synthetic records. No live database, account password or production deployment was changed.

## Current release

- **All 26 Node test entries passed.** Existing rental, repair, simple-billing, password, installer, receiving/completion and handover checks remain passing. The new SQL suite exercises the actual grouped-billing migration; three new model tests check grouping, numbering, pagination and existing-item suggestions.
- **Production build passed** (TypeScript and Vite). The optional PGlite demo still produces filesystem/eval warnings and a large-chunk notice; there are no build errors.
- **Historical protection:** old issued estimates and invoices retain their exact snapshots after the update and repeated installation. This includes an old invoice containing historical financial components. New customer documents have an explicit template version and exclude unchecked draft rows. Revision copies preserve charges and do not insert another financial invoice, change revenue, record a payment or change profit.
- **Billing invariants:** M/R stays pending; included unpriced rows block invoicing. New quantity × price − discount, inclusion/exclusion, section totals, payments, credits and balance snapshots were checked. Customer and insurer approvals stay unchanged by document formatting. The example's priced items total LKR 19,800. Pricing the pending replacement at quantity 2 × LKR 1,000 − LKR 100 gives LKR 21,700; a LKR 5,000 payment appears on the next numbered copy with LKR 16,700 remaining.
- **Authorization:** private copy tables have RLS and no direct client grants. Copy update/deletion is rejected. Invoice-copy reads and writes honor existing billing permissions; estimate-copy writes use repair management. Owner access, duplicate/stale revision requests, missing reasons and reused request IDs with different payloads were tested. Existing installer checks preserve explicit permission denials.
- **Production browser workflow:** created a four-section estimate using an existing-item suggestion and custom descriptions; moved a row between sections; excluded and removed rows; checked the live total; issued the estimate; confirmed prices and discount in a new revision; approved/started/completed the job; issued an invoice; recorded payment; issued a numbered revised copy; reopened the original; and downloaded English/Sinhala PDFs. The original retained its earlier amounts. No browser exceptions occurred.
- **Regression browser workflow:** the complete receiving-note → repair → invoice/payment → completion-note → confirmed vehicle handover flow passed on the production build, including previous-copy reopening, mobile receiving forms, PDF/print and sharing-control checks. Handover leaves the outstanding balance unchanged.
- **Responsive and PDF checks:** inspected the 390 px bill editor with no horizontal dialog overflow. The supplied example fits one A4 page. Long English/Sinhala fixtures retain all included rows across A4 pages, repeated section/table headers, continuous numbering and one subtotal per section. The long Sinhala fixture produced 14 pages without clipping; downloaded and browser-print versions were inspected. Customer copies omit excluded descriptions, costs/profit and the removed disclaimer. Downloaded PDFs keep raster rendering for Sinhala support.

## Reproduce

Run `npm ci`, `npm test` and `npm run build` inside `insuredrive-web`. Optional browser checks: install Playwright locally (`npm install --no-save --package-lock=false playwright`, then `npx playwright install chromium`) and run `node scripts/verify-grouped-billing.mjs --production` and `node scripts/verify-service-workflow.mjs --production`. They use the synthetic demo. Long PDF fixtures are development-only files under `tests/`.

## Not completed in this environment

Live Supabase migration/RLS/Auth/Storage, hosted advisors against the configured app project, actual credentials and password policies/MFA, simultaneous PostgreSQL sessions, physical printers, native phone share sheets, deployed Safari/Firefox/mobile devices, Windows launchers and Flutter build/signing were not tested. Password regression uses mocks. The new billing screens are in the web portal; no APK or public deployment was created.

## Previous release evidence

The following records are retained for history. Their release counts are not the current test count.

# Tenuli Auto Care v1.12.0 verification

Verified on 24 October 2026 with synthetic records. No live database, authentication account or production deployment was changed.

## Current release

- **All 22 Node test entries passed**, including the existing rental/repair money, payment, profit, permissions, simple-billing, password-flow and installer regressions. The new service-document SQL test uses the actual migrations in PGlite; the two pagination tests check content preservation and Sinhala grapheme boundaries.
- **Production build passed** with TypeScript and Vite. Existing warnings from the optional PGlite demo's filesystem shims/eval remain; no build errors.
- **Document workflow:** a receiving note creates a draft job with a unique linked job number, pending price and pending approval. Premature completion/handover is rejected. Completed jobs issue notes with or without an invoice. Actual collection requires an explicit confirmation and records server time.
- **Historical accuracy:** originals survive correction revisions, later payments and repeat installations. Note tables and handover events reject UPDATE/DELETE. Invoice/payment/credit balances are captured under the same transaction lock as billing; issuing and handing over do not change finance/profit totals. Handover captures a new note revision; the prior copy still says handover was not recorded.
- **Revisions and authorization:** correction reasons, optimistic job versions, expected document revisions, idempotent retries and mismatched-payload rejection are checked. Reopening a completed job invalidates the previous completion note for handover. Handed-over jobs require a new job for later repairs. Owners and inactive users are denied; staff without billing rights cannot read or issue invoice-bearing completion copies. Customer snapshots contain no private cost/profit or tax fields.
- **Browser:** the complete production-build workflow was exercised in headless Chromium: arrival → receiving PDF/print → pricing revision → customer approval → start → complete → invoice → partial payment → completion note → explicit handover → historical note reopening. LKR 190 total, LKR 50 paid and LKR 140 outstanding stay unchanged by handover. Both English and Sinhala documents were downloaded. Desktop and 390 px mobile layouts, optional details and mobile receiving forms were checked. No browser exceptions were observed.
- **Printing and sharing:** Print now opens an isolated document window because native stacked dialogs could obscure browser printing. The clean A4 print output and downloaded PDF were inspected. User-initiated native sharing dispatch was checked with a browser stub; unsupported sharing falls back to a download. The actual operating-system share sheet was not exercised.
- **Long Sinhala PDF:** a five-page synthetic note preserved all content, billing summary, handover and signatures. Every page fit the 794 × 1123 screen A4 layout; the print output contained five A4 pages with readable Sinhala. Downloaded PDFs retain the existing raster-based output; browser printing can retain selectable text.

## Reproduce

From `insuredrive-web`, run `npm ci`, `npm test`, and `npm run build`. The optional browser regression is `scripts/verify-service-workflow.mjs --production`; install Playwright locally first (`npm install --no-save --package-lock=false playwright`, then `npx playwright install chromium`) and run `node scripts/verify-service-workflow.mjs --production`. It starts a local preview server and uses only the synthetic demo. `tests/service-pdf-fixture.html` is a development-only long Sinhala fixture. Generated QA files are not customer documents.

## Not completed in this environment

Live Supabase migration/RLS/Auth/Storage, real credentials and configured password policies/MFA, simultaneous PostgreSQL sessions, hosted Supabase advisors for the configured app project, physical printers, iOS/Android native share sheets, deployed Safari/Firefox/mobile devices, Windows batch launchers and Flutter build/signing were not tested. Password-flow regression tests passed with mocks; no real account password was changed. The new screens are in the web portal. No public deployment was performed.

## Previous release evidence

The following records describe earlier releases and are retained for history; their test counts are not the current release count.

# Tenuli Auto Care v1.11.0 verification

Verified on 24 October 2026 using synthetic records. No live Supabase database or account password was changed.

## Current release results

- **Production build passed:** TypeScript and Vite. Existing PGlite demo-only filesystem/eval warnings remain; there are no build errors.
- **All 19 Node test entries passed.** This includes the existing 22 rental database checks, 16 repair database checks, repeatable installer checks, money/date/pagination and role visibility tests, six password-flow tests, and the new simple-billing database regression suite.
- **Historical integrity:** applying the new upgrade twice leaves repair and rental invoice snapshots, stored balances and historical profit unchanged. Existing installer tests preserve permission denials, records and numbering. New taxed writes are rejected; new repair and rental invoices use simple pricing.
- **Billing and reversals:** verified quantity × price − discount, partial payments, overpayment rejection, provisional costs, cost confirmation, supplier payment separation, refunds, credits, and one-amount partial/full credits against historical records. Older unbilled jobs require an explicit pricing revision. The regression test caught and fixed a pre-existing SQL variable qualification bug in the estimate-revision path.
- **Permissions:** owners and unpermitted staff cannot access private costs or operations. Existing role/user denies are retained. No privileged key is introduced. The new private credit-splitting helper is not callable by client roles. Database schema changes were verified against local PGlite, not a hosted project.
- **Real browser billing flow on the production build:** estimate → approval → job completion → A4 invoice → customer payment → 80 mm receipt → external cost allocation → supplier payment → cost completion → profit report. LKR 30,000 sales − LKR 21,000 costs = LKR 9,000 profit; after a LKR 10,000 receipt, balance is LKR 20,000. New PDFs and CSV exports have no tax breakdowns. Optional details remain saved while collapsed.
- **Password browser flow on the production build:** actual Supabase JavaScript client with isolated, synthetic HTTP responses verified current-password rejection, server password-strength errors, show/hide controls, confirmation validation, authenticated password update, subsequent new-password verification, normal sign-out/sign-in, Sinhala switching, and owner menu isolation. Password inputs clear after an attempt and no plaintext test passwords appear in localStorage/sessionStorage. Node tests separately cover a failed verification request after a committed password change.
- **Focused production regression:** saved and revised an estimate through the UI after the SQL fix; verified the changed amount. Checked Sinhala repair fields and the rental booking form without tax controls.
- **Responsive/PDF inspection:** checked 390 px phone and desktop views without page/dialog overflow. Visually inspected the simpler estimate form, administrator password screen, A4 invoice/profit PDF and thermal receipt dimensions. Invoice/report PDFs are A4; the receipt is 80 mm wide. PDF output remains raster-based rather than tagged/searchable text.
- **Native source:** removed rental tax controls/summary rows and formatted the edited Dart file successfully. The formatter reported the unavailable flutter_lints package in this container; this is not a native build result.

## Not verified here

Live Supabase Auth credentials, configured password policies or MFA, live database migration/RLS/Storage, real multi-session PostgreSQL contention, deployed browsers, Windows batch execution, Flutter build/signing and native devices still need verification in your environment. The connected account does not expose the configured app project for live administration. The current password feature and workshop modules run in the web portal. No production deployment was performed.

## Earlier release evidence

The results below record previous releases. Current release checks above supersede their test counts and tax UI descriptions.

> v1.10.1 admin-portal fix: see `../AUTOMART_ADMIN_FIX.md` for new installer and navigation regression checks. The full current `npm test` run passes 12 entries. The v1.10.0 workflow results below remain applicable.

# Tenuli Auto Care v1.10.0 verification

Verified on 24 October 2026 against the supplied source and a synthetic local database. No live Supabase data was changed.

## Automated checks

`npm test` passed: eight Node test entries, comprising 22 existing rental database checks, 16 repair database checks and six focused money/date/identifier/document-layout tests. The repair tests execute the actual additive SQL using PGlite. They cover the LKR 19,800 reference total with one pending price; invoice rejection for pending items; idempotent retry and mismatched retry payload; optimistic versions; duplicate invoice rejection; immutable issued snapshots; customer partial payments and credits; direct cost allocation; unconfirmed costs; supplier credits and refunds; payment/cost separation; invalid lines; unused-stock return limits; cancellation with fully reversed cost history; raw-table denial; owner/staff isolation; export permissions; suspended users; and customer-document redaction.

`npm run build` passed TypeScript and the Vite production build. Vite reports the existing PGlite demo bundle's Node filesystem shim/eval warnings; PGlite is lazy loaded only for the explicit synthetic demo. It is not used for live Supabase access.

The Dart formatter successfully parsed all 69 Flutter source files with `--output=none`. This is a syntax check, not a Flutter build or native device test. Native Android/iOS build, signing, notifications and Windows batch execution were not verified here.

## Browser workflow

Headless Chromium exercised the actual React UI → repair API adapter → guarded SQL running in local PGlite → returned records → UI:

- Created an estimate, issued its snapshot, recorded customer approval, started and completed the job, and issued an invoice.
- Downloaded an A4 invoice PDF, recorded a LKR 10,000 partial customer payment, and downloaded an 80 mm receipt PDF.
- Added an external supplier, recorded a LKR 21,000 purchase, allocated it to the LKR 30,000 job, recorded a partial supplier payment, and marked costs complete.
- Verified LKR 30,000 revenue, LKR 21,000 direct costs, LKR 9,000 gross profit, 30% margin and LKR 20,000 receivable in the report. Supplier payment did not reduce profit.
- Downloaded authorized CSV and internal PDF reports. CSV financial columns are LKR values with two decimal places.
- Uploaded a custom PNG business logo and verified its saved value through the guarded API.
- Generated a 28-item estimate with long Sinhala text and one pending price, producing 10 A4 PDF pages without lost rows. Visually inspected the invoice and final estimate page, including totals, provisional note, signatures and footer.
- Checked desktop and 390 px mobile layouts. Wide tables scroll inside their container; the page does not overflow the viewport.

Test PDFs were inspected locally and are not packaged as customer documents. PDF sizes were approximately 172 KB for the one-page invoice, 84 KB for the thermal receipt, and 2.35 MB for the deliberately long ten-page estimate. PDFs preserve Sinhala through raster rendering; they are not tagged/searchable text PDFs.

## Deployment checks still required

The tests do not verify your remote project's migration history, real authentication configuration, Storage policies, actual printer support, multi-session PostgreSQL lock contention or native setup. Before using real records, apply the migration in staging, run `VERIFY_TENULI.sql`, sign in as the intended administrator/officer/owner accounts, and verify private attachment upload and access denial using real Supabase sessions. Confirm sharing/80 mm printing on the target device. No live migration, public deployment or APK build was performed.

Review the accounting rules and allocation/stock-return limits in `TENULI_START_HERE.md`. Gross profit excludes general overheads and input tax; it is not a statutory net-profit calculation.
