# v1.18.0 — A4 operations bills and supplied Tenuli logo

For the included v1.18.1 blue-header update, also follow `BLUE_LETTERHEAD_UPDATE.md`. Apply `TENULI_BLUE_LETTERHEAD_UPGRADE.sql` after the operations-bill upgrade below. The current combined installer includes both.

Use the same database and accounts. No live database, deployment or customer record was modified while preparing this release. These instructions take precedence over older version-specific guides.

## Existing v1.17 installation

1. Keep a backup of the existing source/database. Extract the complete ZIP into a new folder.
2. In the **existing Supabase project's SQL Editor**, run the complete `supabase/TENULI_OPERATIONS_BILL_UPGRADE.sql` as the database owner. This required additive upgrade enriches future snapshots with receiving information, repair lines and ledger summaries, and sets the supplied logo once. It does not recreate jobs, payments or document history. Repeating it is safe; later authorized logo changes remain respected.
3. Retain the existing public configuration in `insuredrive-web/.env.local`. The supplied file has the original URL and publishable key. No service-role key belongs in the browser. When updating a separate deployment, retain that deployment's existing environment.
4. Windows: open `START_WEB.bat`. Mac/Linux: run these commands inside `insuredrive-web`:

   ```sh
   npm ci
   npm run build
   npm run dev
   ```

   The launchers require Node 22.18+; this release was tested with Node 24.22.1. `BUILD_WEB.bat` and `TEST_WEB.bat` remain available. The static build is included in `insuredrive-web/dist`; deploy through your normal process when ready.
5. Sign in normally and open **Repair Billing → Job Details → Two customer documents**. Existing permissions and the two cards/actions remain in place.

For older/missing workshop installations, follow `TENULI_START_HERE.md` and use the current combined `supabase/ENABLE_AUTOMART.sql`. It includes pricing/photos and this update in dependency order. Do not reset the database or blindly run every historical migration. Never install `tests/fixtures` on a real database.

**සිංහල:** ZIP එක සම්පූර්ණයෙන් extract කරන්න. v1.17 සිට update කරන විට `supabase/TENULI_OPERATIONS_BILL_UPGRADE.sql` දැනට පවතින Supabase project එකේ SQL Editor මගින් යොදන්න. පසුව `START_WEB.bat` විවෘත කර ඔබගේ සැබෑ ගිණුමෙන් පිවිසෙන්න.

## The two documents

- Receiving automatically includes saved repair rows, receiving/customer/vehicle information, estimate total, recorded payments and estimated remaining amount. No advance is required. M/R prices remain pending; known-price subtotal and remaining amount are explicitly provisional.
- Completion uses the same template and saved breakdown. All included prices and existing completion/authorization requirements must be satisfied. The ledger determines Paid, Partially Paid, Unpaid or overpayment; completion does not pay a balance.
- Record actual payments through the existing payment action. Then use **Issue updated final bill**, with a reason, for a numbered payment-summary copy. Charges remain frozen; price changes use the established correction/revision workflow.
- Viewing, printing and downloading are read-only. Handover remains a separate explicit action.
- Only included customer-facing rows/notes print. Internal price proposals, costs, profit, unverified annotations, internal notes and vehicle photos stay internal. Package amounts are allocated to rows once; no additional package charge is created.
- Staff without billing access retain their existing unpriced receiving-note capability. They cannot view or issue the full priced receiving bill. Any access changes must use the existing authorized permission-management process.

## Logo and history

The exact attached Capture.PNG bytes are retained in `insuredrive-web/public/tenuli-capture-logo.png` and `assets/icon/tenuli-wordmark.png`. Web login/navigation, settings, cost reports and Flutter source assets use this wordmark. Future repair documents/payment receipts and rental invoices freeze the configured logo. Business settings remain the source for name, address, telephone, email and tagline.

Issued snapshots are not rewritten: they reprint with their original layout/logo/amounts. Use an existing numbered revision/correction action to issue a new version. The old logo asset is deliberately retained for history.

## Print, photos and native application

Choose A4 portrait, 100% scale and disable the browser's own headers/footers. Long bills paginate with repeated table headers and no eight-row limit. Sinhala uses bundled Noto Sans Sinhala. Totals/signatures remain together. Use the existing PDF buttons for application-generated PDFs.

Local photos are unchanged. Retain the same browser profile and application origin so account-scoped IndexedDB data and directory handles remain reachable. Do not clear site storage while photos are pending. Folder permission may need renewal. See `LOCAL_PHOTOS_AND_PRICE_REVIEW_SETUP.md` for folder selection, retry and ZIP fallback.

Flutter source/assets are updated, but no APK was built. Follow the existing Flutter/bootstrap/Firebase/signing instructions when rebuilding. The new Repair Billing documents run in the browser client.

## Samples and checks

The PDFs in `docs/samples/` use clearly labelled synthetic data and identical LKR 100,000 repair rows. The first shows LKR 20,000 advance / LKR 80,000 remaining. The final shows further recorded payments of LKR 30,000 + LKR 50,000 / zero balance. They are not customer records or payments.

Read `V1_18_TEST_REPORT.md` for checks and limitations. No deployment or live migration is included in this source delivery.
