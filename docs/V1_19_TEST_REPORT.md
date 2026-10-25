# v1.19.0 verification — 25 October 2026

## Results

- `npm test`: **58 passed, 0 failed**. Existing financial, document, authentication, permission, price-review, local-photo and installer suites remain passing. Log: `verification/v1.19/tests.txt`.
- `npm run build`: TypeScript, Vite production build and release-security scan passed. The test fixture and PGlite database are excluded from the release. Log: `verification/v1.19/build.txt`.
- Counts: Replacement 100; Removal & Refitting 100; Repair 100; Paint 100; Miscellaneous 100; Other Charges 100. Total 600 active entries, 600 distinct IDs and 600 normalized descriptions. Aliases/translations/custom action are not counted as additional items. Semantic review corrected overlapping material/inspection descriptions.

## Automated coverage added

- Empty-history catalogue availability, section filtering, count/identity uniqueness, no price fields or numbered/location filler.
- Head light → Headlamp alias, AC abbreviation avoiding irrelevant “accessory”/“actuator” matches, Sinhala text search and no-match handling.
- Built-in/shared/history deduplication, actual-use ranking, input immutability and exclusion of job/customer identity, internal notes and prices from suggestion payloads.
- Selecting a catalogue entry only changes description; pending M/R, quantities, discounts and accepted package amounts retain their financial effect.
- Optional shared saving: administrator plus settings permission required; owner/officer/anonymous/inactive/explicitly-denied access blocked; private-table direct reads/writes denied; RLS enabled; field validation and retry deduplication; repeat upgrade preserves data and one audit event.
- One-off custom description survives actual database save, reopen and authorized revision. Sharing is separate. Jobs/ledger/report and issued receiving snapshot stay unchanged after catalogue changes.
- The combined installer including the catalogue upgrade passes the existing repeat-install checks.

## Browser checks

Managed Chrome exercised the actual GroupedRepairEditor and selector in an isolated synthetic fixture with no job history or live writes. Verified all six 100-result sections, alias results, ArrowDown/Enter selection without form submission, End reaching result 100, Escape, persistent custom action, custom save/reopen and explicit sharing feedback.

A 390px-wide container was checked with Sinhala UI/text search. It used one column, had no horizontal overflow, and visually rendered the bundled Sinhala font and catalogue results. This was a narrow container in desktop Chrome, not a physical phone/onscreen keyboard test. Shared-button UI used an isolated fixture; real authorization/persistence was tested through PGlite RPC calls.

## Limits / not tested

- No live Supabase upgrade, authenticated live end-to-end issuance, remote security-advisor run or hosted deployment.
- No Safari, Firefox, Edge or physical mobile-device/touch/IME test. Keyboard and IME guards were reviewed; physical IME behaviour is not claimed as tested.
- No Flutter analyzer/build/APK signing; Flutter SDK is unavailable. Existing native source/assets are retained.
- No physical printer or new PDF-download run. Document code/styles were not modified by this change; immutable snapshot/PDF-model regression suites passed. Earlier PDF/browser limits remain in `V1_18_TEST_REPORT.md`.
- The seeded labels are English with a small set of Sinhala search/display labels and localized UI; the 600-item catalogue is not fully translated.

The optional shared feature has a tested standalone SQL Editor upgrade. The earlier CLI telemetry approval block was not retried, and no live CLI migration was performed. UI follows the existing app styles and supplied screenshot; the optional 12ui design service was unavailable without sign-in in this session.
