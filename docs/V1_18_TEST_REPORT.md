# v1.18.0 verification — 25 October 2026

## Automated results

- `npm test`: **53 passed, 0 failed**, Node 24.22.1 and the existing PGlite test platform. Log: `verification/v1.18/tests.txt`.
- `npm run build`: TypeScript, Vite production build and release-security checks passed. No demo entrypoint, synthetic fixtures, privileged keys, source maps or test database entered the production bundle. Log: `verification/v1.18/build.txt`.
- The combined installer passed repeat-install checks from insurance-only, rental-installed and workshop-installed fixtures, preserving jobs, sequences and explicit permission denials.
- The standalone upgrade was applied repeatedly to synthetic v1.17 data. Historical receiving/final snapshots and financial reports stayed identical.

New integration checks cover identical six-section receiving/final calculations, continuous numbering, excluded items, no advance, pending M/R prices and blocked final issue, discounts, Unpaid final without payment, LKR 20,000 advance on LKR 100,000 total, partial/full payments, credits/refunds/overpayment, unchanged charges on payment-summary revisions, exact 51/50 minor-unit package allocation, original quotations, changed registration/price revisions, immutable history, reprints creating no payments, separate handover and billing-role isolation. Exact supplied PNG bytes were checked in new receiving, repair receipt and rental-invoice snapshots; rental arithmetic remained unchanged.

The full suite also covers existing authentication/security, rentals, repairs, shop costs/profit, document history, price reviews, local-photo persistence/ZIP and formatting/pagination utilities. Browser-dependent photo failures were simulated; physical disk/permission tests were not repeated in this release.

## Browser and PDF checks

The actual shared React renderer was exercised in a separate synthetic fixture through managed Chrome. This fixture is excluded from the production entrypoint and makes no live writes.

- Both English everyday samples fit one 794×1123 CSS-pixel A4 page. Body/signatures stay above the footer.
- Sinhala shaping was visually inspected. Receiving fits one page; the fuller final example uses two without clipping.
- All six populated categories, package pricing and pending/no-advance notices were checked.
- Forty-eight deliberately long descriptions produced 17 English / 20 Sinhala pages. All 48 row numbers remained present, item-table headers repeated, and measured body/footer boundaries did not overlap. There is no eight-row limit.
- Print popup opened the correct bill without hidden measuring elements.
- Application PDF generation reached ready-to-save/share state. Cloud-browser blob-download transfer timed out, so successful saving through that browser was **not verified**.
- Delivered sample PDFs were exported from the same React template/CSS using WeasyPrint, then rendered with Poppler and visually inspected. Both are one A4 portrait page (595.28×841.89 points), with original logo, readable tables, intact signatures, synthetic-data labels and verified amounts. These exports do not establish successful browser downloading.

## Not tested / not performed

- Live Supabase migration, signed-in live end-to-end issuance or deployment. SQL behavior was tested on the local PostgreSQL-compatible test platform; validate on a staging copy before live use.
- Physical printer/driver margins, Safari, Firefox, Edge, iOS or Android device checks. No claim of testing these browsers/devices.
- Flutter build/analyzer, APK signing or installed-device icon/splash. Flutter SDK is unavailable here; source/assets only were updated.
- Full mobile visual regression, live Storage upload, multi-device synchronization or cross-device photo recovery. Existing mobile layouts/photo implementation were retained.
- Byte-for-byte historical PDF comparison. Issued JSON snapshots remain immutable; retain downloaded files if binary archival copies are required. The app's existing raster PDF path preserves Sinhala appearance but does not produce tagged/searchable-text Sinhala PDFs.

The Supabase CLI attempt was rejected by automatic approval review because it could send unknown telemetry. The deliverable uses the tested additive SQL Editor upgrade instead; no live CLI migration was attempted afterward.
