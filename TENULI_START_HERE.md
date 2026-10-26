# Start Tenuli Auto Care v1.19.1

**Current release: [docs/V1_19_1_PHOTO_REMOVAL.md](docs/V1_19_1_PHOTO_REMOVAL.md).** Vehicle-photo uploading, galleries and Local Photo Storage settings are removed. Estimates no longer depend on photo queues or folder/camera permissions. Existing stored photos, legacy job metadata and issued documents are retained; supplier bill attachments and logo uploads remain available. A working v1.19.0 installation needs no database migration for this change. The version-specific notes below describe earlier features and prerequisites.

**Catalogue introduced in v1.19.0: see docs/V1_19_CATALOGUE_SETUP.md.** Built-in 600-item selection needs no new SQL on v1.18.1; optional shared saving uses TENULI_CATALOGUE_UPGRADE.sql.

**Read docs/V1_18_SETUP.md first.** The required v1.18 operations-bill upgrade and current instructions supersede older version-specific notes below. Existing v1.17 installations need `supabase/TENULI_OPERATIONS_BILL_UPGRADE.sql`.

Read **SECURITY_UPDATE.md** first. Existing v1.15.0 databases need no new SQL migration for this security update. Demo access is removed; use your real account. Earlier PDF upgrades remain documented in **MODERN_CUSTOMER_PDFS_UPDATE.md**. The two-document workflow, financial records, login design and existing permissions remain in place.

## Run the web application

1. Extract the complete ZIP into a new folder. Keep your previous version as a backup.
2. Install Node.js 22.18 or newer within 22.x (the supplied launch scripts already check for Node).
3. Double-click `START_WEB.bat`; open the local URL printed in the terminal. On Mac/Linux run `npm ci` and `npm run dev` inside `insuredrive-web`.
4. Sign in using your existing active staff account. Demo access has been removed; the first sign-in after this upgrade starts a new browser session.
5. If workshop setup is missing, install the database upgrade below, then sign in normally. This source ZIP excludes local environment values. For local use, copy `insuredrive-web/.env.example` to `.env.local` beside `package.json`, fill the existing public Supabase URL and publishable key, and restart the server. For Netlify, keep these values in its build environment settings.

**සිංහල:** ZIP එක සම්පූර්ණයෙන් extract කර `START_WEB.bat` විවෘත කරන්න. Demo පිවිසුම ඉවත් කර ඇත. ඔබගේ සැබෑ සක්‍රිය ගිණුමෙන් පිවිසෙන්න. v1.15.0 සිට මෙම ආරක්ෂක update එකට අලුත් SQL migration එකක් අවශ්‍ය නැත.

## Add the workshop tables to your existing Supabase project

The delivered source does not modify your remote database automatically.

1. Back up the existing database and verify the setup in a staging copy.
2. In the **existing project's** Supabase SQL Editor, run **`supabase/ENABLE_AUTOMART.sql`** from this ZIP as the database owner. You can also download or copy it from the new Automart setup screen. It installs missing Rentals first, then missing Repair Billing / Shop Costs & Profit, and updates simple billing and customer documents, all in one transaction. Completed installations can safely run it again: existing records, document numbers, and explicit permission denials stay unchanged.
3. The installer requires the existing insurance/RBAC/advanced-security setup. If it reports missing prerequisites, inspect `supabase/PRECHECK_RENTALS.sql` and follow `docs/WEB_RENTALS_SETUP.md` to resolve only the missing prerequisites. It refuses partial/custom installations rather than overwriting them.
4. Run `supabase/VERIFY_TENULI.sql`, then click **Check access again** in the app, or sign out and back in. Administrators get missing default workshop grants. Deliberately denied role/user permissions remain denied; review them in **Access & audit** if access is still blocked. Grant individual workshop permissions to officers as appropriate. Owners cannot access internal workshop functions.
5. If you manage schema changes through an already baselined Supabase CLI project, the original individual migrations remain included. Choose the SQL Editor installer or your normal migration process; do not blindly run both or push all historical migrations over an existing database.
6. Deploy `insuredrive-web/dist` after `npm run build` to an HTTPS static host at its domain root. Existing Auth accounts remain in use. Generate the static build locally or through Netlify; generated build output is excluded from the source ZIP. The build/dev scripts regenerate the downloadable setup file from the authoritative migrations.

Never run `insuredrive-web/tests/fixtures/database/platform.sql`, test fixtures, or test setup on a real database. Those are synthetic test platforms.

## Two workshop functions

**Repair Billing:** use **Receive vehicle** to select an existing customer/vehicle or enter their details, describe the problem and requested repairs, and optionally confirm an advance. **Issue receiving note** records the job, advance and A4 receiving acknowledgement together. No advance and unknown repair prices are allowed. This does not approve the repair or insurer coverage.

Use **Pricing, approvals & accounting** for the internal estimate, customer/insurer decisions, start and complete actions. Price every included item before issuing the final bill; excluded items remain in the editable draft. The four core sections remain Replacement, Removal & Refitting, Repair and Paint Items, followed by populated Miscellaneous Items and Other Charges. New line total = quantity × unit price − discount; no tax controls are shown.

After completion, choose **Review & Issue Final Bill**. Work performed, parts replaced and optional recommendations/warranty are combined with the invoice. Use **View Issued Bill**, then **View PDF**, to show its issued PDF alongside the current ledger summary. The earlier PDF keeps its captured amounts. **Collect Balance** defaults to the outstanding amount; select a payment method, optionally reduce the amount for a partial payment, and explicitly confirm receipt. Use **Issue updated final bill** for a numbered copy with the latest amounts. This does not create another financial invoice or recognize revenue again.

**Record Vehicle Handover** is a separate authorized confirmation, with server-recorded time. Printing, viewing, billing and payment never record handover automatically. An authorized handover can leave a balance outstanding; it does not mark the bill paid. Original PDFs can be regenerated from their immutable issued snapshots; every correction/payment-summary copy stays in document history.

Estimates, approvals, refunds, credits and audit entries remain internal. Historical estimates, receipts and completion notes remain accessible under **Internal records & historical documents**. New payments use the existing ledger without requiring a third customer document. Total paid = confirmed payments including advances − refunds. Balance = invoice total − applicable credits − total paid. Existing customer/insurer contribution rules are retained. An active invoice locks its charges; use the existing credit/refund and void workflow for charge corrections before revising. No insurance confirmation or claim submission is automatic.

**Shop Costs & Profit:** add suppliers and each purchase/direct expense. Enter total estimated cost and leave actual cost blank until confirmed. Record the full cost as one amount; estimated cost is optional. Supplier reference, unit, category, due date and terms are under More details. Private PDF/image attachments up to 5 MB remain available. Internal labour and transport use no supplier. Allocate quantity to one or several jobs. Unallocated quantities remain stock and are not charged to a job. Each bill/job pair has one immutable allocation; split planned allocations into separate bill rows when needed. Returns/credits stay traceable to the original bill and job. After an unused-stock credit, further allocations on that bill are blocked; fully credit the remaining unused stock before recording an adjusted replacement purchase. There is no automatic stock resale workflow.

Confirm actual costs, then mark the job's direct costs complete. The report remains provisional until all allocated costs are confirmed and the manager explicitly marks them complete, including zero-cost jobs. Supplier payments change cash and payables; they never reduce profit a second time. The report shows **profit = sales revenue − recorded job costs**, excluding general business overheads. Historical records retain their original accounting basis; no existing totals are rewritten.

Sales revenue = issued invoice sales amount − credits against that invoice. Profit = sales revenue − actual allocated job costs after supplier credits. Margin = gross profit / revenue; markup = gross profit / direct cost. Zero denominators display N/A. Uninvoiced jobs have zero recognized revenue. Estimated profit uses estimate charges and estimated direct costs. Net cash is separate: customer receipts less refunds minus supplier payments proportionally allocated by purchased quantity.

Date filters select a job cohort by invoice date, falling back to job creation date; values are lifetime totals as of report generation, not period cash movements. Search finds jobs, customers and vehicles. CSV/PDF internal exports require both profit-view and export permissions.

## Password changes

Administrators can change their own password in **Settings → Security → Change Password**. Enter the current password and the new password twice. The app checks the current password, uses the configured Supabase password rules, and verifies a fresh sign-in with the new password. See the update guide for validation messages.

## Documents and business details

Use **Bill settings** in Repair Billing to edit Tenuli's name, address, contact details, footer and logo. Upload a PNG/JPEG/WebP logo up to 280 KB, or keep the included Tenuli logo. Changes affect future issued documents only.

New customer documents use only the two A4 types above. They show customer charges and payments, never internal supplier costs or profit. Historical customer documents retain their existing format and totals. Choose Sinhala or English with the existing language control. Use **View PDF**, **Download PDF**, **Print**, or **Share PDF** after preparing the PDF. Sharing only starts after a user action; unsupported sharing falls back to a download. Choose A4 paper; additional A4 pages are created for long content. Customer notes are visible on customer documents, so keep internal cost details in the dedicated shop-cost records.

PDFs are rendered in the browser from immutable, versioned database snapshots. New payment-summary copies have a revision number and timestamp; opening the original never merges in later payments. The live ledger summary is separately labelled and refreshable. There is no separate server archive of PDF binary files; retain downloaded files if you also need a byte-for-byte archive. Sinhala download PDFs preserve the appearance using raster rendering; they are not tagged/searchable-text PDFs.

## Compatibility and limits

Flutter branding and source icons are updated. Native repair screens are not added; open the browser client for the two new workshop functions. Original Flutter build/signing/Firebase steps still apply. No APK is included. Internal identifiers such as `insuredrive-web`, `INSUREDRIVE_WEB_URL` and the Android application ID are intentionally preserved so existing authentication, package updates and integrations continue to work. Existing Edge Function notification text is rebranded in source; redeploy those functions through your normal deployment process when desired.

Attachments require live Supabase Storage. Reload the module to see another staff member's recent changes; optimistic job versions prevent overwriting an edited job. Number sequences may have gaps after a failed transaction; they are never reused. Failed write retries retain the same request key in the browser session to prevent duplicate records.

For rollback, revert the web build and disable workshop permissions. Do not drop tables, reset sequences or remove financial history after real records exist. Use a reviewed forward migration for corrections.
