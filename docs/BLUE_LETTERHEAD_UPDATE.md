# v1.18.1 — solid blue bill header

The full letterhead area now uses solid blue (#07519A), white business text, and the supplied Capture.PNG logo on a white inset for legibility. This covers the grouped estimate header shown in the screenshot, both customer documents, and the current repair/rental document renderers. The rest of the bill and its accounting are unchanged.

## Install

1. Extract this complete source ZIP. Keep the same database, accounts and public environment configuration.
2. If v1.18.0 is installed, run `supabase/TENULI_BLUE_LETTERHEAD_UPGRADE.sql` in the existing Supabase project's SQL Editor. If upgrading from v1.17, run `TENULI_OPERATIONS_BILL_UPGRADE.sql` first, then the blue-header upgrade. The current `ENABLE_AUTOMART.sql` includes both for older compatible installations.
3. Run `START_WEB.bat`, or `npm ci` then `npm run dev` inside `insuredrive-web`. The verified static build is included in `insuredrive-web/dist`; rebuild with `npm run build` for normal deployment.
4. Issue a new document or use the existing authorized revision action. Old issued snapshots retain their previous header and logo; reprinting them does not change history.

The upgrade adds only a private function and insert triggers that freeze the chosen style in new snapshots. It is repeatable and does not change totals, payments, permissions or handover. It relies on the existing v1.18 configured-logo snapshot handling. No live database was modified for this delivery.

## Verification

- 53 automated tests passed; production build and release-security scan passed.
- Repeated blue-header upgrade preserved an already-issued v1.18 white-header note byte-for-byte as JSON. Future receiving/final documents, updated copies, repair receipts and rental invoices captured the blue marker and existing new-logo snapshot.
- Both sample PDFs in `docs/samples/` were regenerated from the shared template, rendered and visually inspected. Each fits one A4 page; the blue header, white text and original logo are intact. LKR 100,000 repair total / 20,000 advance / 80,000 remaining and fully paid final values remain correct.
- Logs: `docs/verification/v1.18.1/`. No live deployment, physical printing or native APK build was performed. Earlier cross-browser and download-transfer limitations remain in `V1_18_TEST_REPORT.md`.
