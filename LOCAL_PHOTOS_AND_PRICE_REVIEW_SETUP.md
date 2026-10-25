# Tenuli Auto Care 1.17 — setup and use

This updates the existing React/Vite web application in `insuredrive-web`. It preserves the supplied Flutter project, existing authentication and staff permissions, repair/rental billing, supplier costs, profit reporting and separate handover. There is no new demo login or privileged browser key.

## ඉක්මන් ආරම්භය

- ZIP එක සම්පූර්ණයෙන් extract කරන්න. දැනට තිබෙන database එක වෙනුවට අලුත් එකක් සාදන්න අවශ්‍ය නැත.
- `supabase/TENULI_PRICING_PHOTOS_UPGRADE.sql` දැනට තිබෙන project එකට යොදා web app එක refresh කරන්න.
- **Settings → Local Photo Storage → Choose Folder** වෙත ගොස් ඔබම folder එක තෝරා browser අවසර දෙන්න.
- Estimate එක save වූ පසු **Photos saved locally** යන තත්ත්වය දක්වා රැඳී සිටින්න. Permission නැතිනම් reconnect කරන්න; සහාය නැති browser එකක **Download Photos ZIP** ලබාගෙන ඔබම extract කරන්න.
- මෙම නිකුතුවේ සැබෑ Windows folder picker, mobile camera සහ live database පරීක්ෂා කර නැත. සම්පූර්ණ පරීක්ෂණ සටහන පහත දක්වා ඇත.

## Install

1. Extract the **complete** ZIP. Keep your existing database and account.
2. For an existing working v1.16 database, run the complete `supabase/TENULI_PRICING_PHOTOS_UPGRADE.sql` in that project's Supabase SQL Editor as its database owner. This is the one new required SQL Editor migration; it adds private immutable review history and extends the existing calculator and API dispatch. It does not rewrite issued documents, change payment records, reset permissions or create a photo bucket. Follow your normal database backup/release process.
3. For an older installation, use the regenerated `supabase/ENABLE_AUTOMART.sql` after its documented prerequisites. Do not run the base repair creation script separately over an installed database. The combined installer includes the new upgrade last and can be repeated. These SQL Editor installers do not mark a new Supabase CLI migration as applied; teams managing a separate CLI migration history should register this reviewed upgrade in their normal release process.
4. Windows: run `START_WEB.bat`. Or open a terminal in `insuredrive-web` and run `npm ci`, then `npm run dev`. Use the URL shown by Vite. Node 22.18+ or Node 24 is needed by the shipped Node TypeScript tests; validation here used Node 24.
5. Sign in with your existing active staff account. Refresh after the database upgrade. New estimate saves show an actionable migration error if the upgraded backend is not installed.
6. Production: `npm run build`; deploy the contents of `insuredrive-web/dist` using your existing deployment process, including the supplied security headers. Use HTTPS. Local development on `localhost` is also a secure context. An ordinary HTTP LAN hostname is not sufficient for the browser's secure photo APIs.

The supplied public Supabase configuration is retained in `insuredrive-web/.env.local`. Do not put service-role keys, passwords or other secrets in `VITE_` variables. No live database or deployment was modified while preparing this ZIP.

## First-time photo folder selection

1. Open **Settings → Local Photo Storage → Choose Folder** using an account with the existing `manage_repairs` permission.
2. Select a dedicated folder on this computer and explicitly allow read/write access in the browser's picker. The app shows its name and connection status; it does not assume a drive, username or absolute path.
3. Open **Repair Billing → New Estimate** (or revise a saved estimate). Add JPEG, PNG or WebP images, or use the camera chooser where supported. Limits are 10 MB per image, 40 images / 100 MB per job photo queue and 60 megapixels per decoded image. Add captions and labels, reorder or remove before saving. Photos are optional.
4. Save the estimate. Its database save finishes first. The separate photo status then changes from **Photos saving…** to **Photos saved locally** only after all original file writes and the manifest finish. Prices, approvals, payments and customer documents do not depend on photo writes.
5. If permission expires, use **Reconnect folder**. On failure use **Retry Saving Photos**, **Choose Another Folder**, or **Download Photos ZIP**. A ZIP download must be extracted by staff; it is never described as automatically extracted.

Folder layout below your selected destination:

```text
Tenuli Auto Care/Estimates/YYYY/MM/JOB-<stable-job-UUID>_<registration>/Photos/
```

Dates use the job creation time in Asia/Colombo. The first mapping is retained when the vehicle registration or estimate details change. A later account using the same authorized destination locates the existing job UUID folder and retains existing manifest entries when adding photos; another account’s pending browser queue is not read. A typical filename is `001_Front_<unique-photo-id>.jpg`. Existing filenames remain stable when captions, labels or ordering change; current order and labels are in `manifest.json`. Conflicting files with different checksums receive a fresh unique filename. The manifest records job/reference, original/saved filenames, caption, label, order, SHA-256 checksum and UTC ISO save timestamps, with Asia/Colombo grouping explicitly identified. Original image bytes are preserved; previews are separate thumbnails.

## Recovery and privacy

- Directory handles and queues are scoped to the validated signed-in account and app origin/project. Signing out clears memory; another account cannot read that account's queue through the app. Browser storage may be cleared or evicted and is **not a permanent backup**.
- If browser storage is unavailable/full, the app keeps available originals in the current tab and shows a warning. Keep the tab open, save locally or download ZIP, and keep the originals. After losing the tab, those files must be reselected.
- Unbound photo drafts can be recovered from **New Estimate → Recover photo draft**. This restores the photo selection, not unsaved customer or financial form entries. A draft identifier in the saved job prevents accidentally creating a duplicate estimate from the same photo draft.
- For a saved job, use its internal gallery. **Recover gallery from local folder** can rediscover that job's UUID and manifest in the selected destination even after a registration change or cleared browser metadata. It reads only the authorized Estimates tree. Missing or changed files are identified; reselect originals to recover them.
- Removing an already exported photo from the gallery does not delete the file on disk. Disconnect removes the app's remembered destination, not exported files. Browser/OS permission revocation is managed by the browser/OS.
- Local exported files are protected by the computer's filesystem permissions, not by Tenuli login permissions. Browser data is isolated in the application's UI, not encrypted against someone controlling the computer or browser profile. Keep independent backups and use appropriate computer accounts.
- No photo upload occurs automatically. No OCR or handwriting-to-charge import is performed. Closing the app stops work; there is no background desktop service. Keep the app open until the local-save status completes.

## Estimate and pricing workflow

Customer, Vehicle and Repair Details are grouped. Phone/make/model are optional. Accident/insurance/claim/assessor/chassis/manufacture fields are under More details. Job/reference/revision/date are shown without inventing references.

The four original categories remain in order, followed by optional Miscellaneous Items and Other Charges. Only populated sections are shown. Each row supports historical suggestions or custom descriptions, optional position, quantity/unit price/discount, inclusion, customer-facing notes, separate internal notes, unverified reference annotations and reordering within its section. Customer row numbering remains continuous across categories.

Blank unit prices remain **M/R**, with a known-price subtotal. Final invoices are blocked until included line amounts are explicitly confirmed. An authorized user may explicitly accept an item amount while the original unknown quotation remains null in internal history. Unknown codes such as R/C stay internal/unverified and do not become charges.

Open the saved job's **Price Review · internal** panel:

1. Select one item, or multiple included items for **Group Price / Package Amount**.
2. Enter a proposed amount, reason and optional supporting note/document reference. Inspect the allocation preview, then record the proposal. This does not change prices or approvals.
3. Enter a decision reason and explicitly accept or reject. Accepted pricing creates a new numbered working estimate revision and resets customer/insurer approvals separately. The review records the original quotes, proposal, accepted amount, difference, actor and server time. Not Required can be explicitly recorded for an item.
4. Packages require confirmed selected prices and a positive quoted subtotal; resolve M/R first. The agreed amount is allocated in integer cents proportionally to current line amounts. Largest fractional remainders get leftover cents, with stable item ID as the tie-breaker. No extra package charge is added. Quantities and original unit quotations are retained internally, while the accepted line total is authoritative.
5. Accepted pricing locks quoted quantity/price inputs in the editor. Use **Return to quoted pricing for this revision** to explicitly clear an agreement before editing quoted inputs. Old review history remains immutable. Issued invoices and handed-over jobs require the existing correction workflow.

There are still exactly two customer document types: receiving/advance acknowledgment and final bill. Estimates, reviews, unverified annotations and photos are internal. Existing issued snapshots are unchanged; new copies follow the established revision/correction workflow.

## Browser support and verification

Feature detection is used for `showDirectoryPicker`; both a secure context and a user click are required. Desktop Chromium browsers such as Chrome/Edge are the intended automatic-folder-save target, subject to current browser/OS policy. Unsupported browsers use the ZIP fallback. Mobile camera and picker availability vary; do not assume desktop capabilities on a phone.

**No browser/OS combination was certified for real automatic local saving in this environment.** Chrome was used for the isolated UI fixture, including 390 px iframe layout, Sinhala labels, work section entry, pending subtotal and saving an estimate without photos. The preview was HTTP, so its unavailable-directory fallback was observed. File writes, revoked permission, full disk, restart recovery and account switching were tested with simulated filesystem/IndexedDB adapters, not real OS permission dialogs.

Official API references: [MDN showDirectoryPicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) and [Chrome File System Access guidance](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access).

See `docs/V1_17_TEST_REPORT.md` for results and outstanding checks. The scanned estimate and annotated photograph mentioned in the request were not present among the supplied inputs; the written requirements were used. No Green Auto Lanka details, customer data, signatures, stamps or policy wording were copied.
