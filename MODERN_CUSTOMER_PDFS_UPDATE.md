> v1.16.0 also removes demo access and hardens web sign-in. Read `SECURITY_UPDATE.md` for the current installation instructions. The PDF upgrade below remains applicable when upgrading a pre-v1.15.0 database.

# Tenuli Auto Care 1.15.0 — modern A4 customer PDFs

## Simple installation

1. Extract the complete ZIP into a new folder. Keep your previous source and database backup.
2. For an existing **v1.14.0** installation, run **`supabase/TENULI_MODERN_PDFS_UPGRADE.sql`** in your existing app project's Supabase SQL Editor as database owner. This only tags future receiving notes and final bills/copies with the new layout version. It does not update historical rows, recalculate totals or change permissions. Test in staging first.
3. For an older installation, use the included current **`supabase/ENABLE_AUTOMART.sql`** instead. It installs missing workshop upgrades and includes the modern layout. Never run demo/test fixtures against real records.
4. Run **`supabase/VERIFY_TENULI.sql`**. The modern-layout check should report true and three enabled triggers; direct helper access should be false.
5. Keep your supplied public configuration in `insuredrive-web/.env.local` beside `package.json`. Do not add privileged authentication keys to frontend files.
6. With Node.js 22.18+ within 22.x, run `npm ci`, `npm test`, `npm run build` inside `insuredrive-web`. Use `START_WEB.bat` or `npm run dev` locally. Deploy the generated `dist` to your existing HTTPS static host at its domain root.

The equivalent migration file is `supabase/migrations/20261024122729_tenuli_modern_customer_pdfs.sql`. Use it through your normal, correctly baselined migration process instead of applying both upgrade routes. The source upgrade, migration and demo mirror are identical. No live project has been modified by this delivery.

**සිංහල:** ZIP එක සම්පූර්ණයෙන් extract කරන්න. දැනට v1.14.0 භාවිතා කරන්නේ නම් `TENULI_MODERN_PDFS_UPGRADE.sql` ඔබගේ පවතින Supabase ව්‍යාපෘතියට ක්‍රියාත්මක කරන්න. පසුව app එක නැවත ආරම්භ කරන්න. පැරණි ලේඛන වෙනස් නොවේ. නව ලේඛනයක් හෝ අංකිත සංශෝධිත පිටපතක් නිකුත් කළ විට නව සැලැස්ම ලැබේ.

## What changes

- Compact Tenuli header, readable navy text, cyan accents, white paper and light separators. Both customer documents use 210 × 297 mm A4 pages with 13 mm margins.
- Clearly labelled customer and vehicle blocks, document/job references, issue/completion/receiving times and revision information.
- Wider descriptions, right-aligned amounts, LKR column headings, continuous row numbers, section subtotals and repeated table headers/continued sections across pages.
- Receiving notes show an advance acknowledgement and its recorded dates/methods/references, or **No advance received**. They never invent a repair total or balance.
- Final bills show a distinct payment summary with the strongest emphasis on Outstanding Balance, a paid/partial/unpaid/refund-due label and the snapshot capture time.
- Short work summaries and replaced parts sit in two columns when they fit; long text flows naturally across pages. New final-bill forms start with an empty required work summary instead of repeating every item description automatically. Staff-entered saved text is retained.
- Page layout measures the actual rendered blocks after fonts/images load. Customer previews, downloads and print use the same pages. The payment summary and signatures remain together; the footer is separate from the content area.

## History and day-to-day use

The customer workflow still has only two document types:

1. Vehicle Receiving Note & Advance Acknowledgement.
2. Repair Completion & Final Bill.

Apply the upgrade before issuing a new document. Existing documents keep their previous template and rendering. To produce a new layout copy for an existing invoice, choose **Issue updated final bill**, enter a revision reason and issue the numbered copy. For a receiving note, use its revision action with a correction reason. Opening an old copy does not restyle it automatically.

Original invoice number/date, issued charges and every previous snapshot remain intact. Payments, credits, refunds, supplier costs, profit, approvals, permissions, login, password change and vehicle handover are unchanged. Layout actions do not record money or create another financial invoice. Historical financial components remain in the stored totals without adding tax breakdowns to the customer layout.

**View Issued Bill → View PDF** shows the captured copy. The separate current payment summary reads the ledger. **Collect Balance** still records an explicitly confirmed partial/final payment. Then issue an updated numbered copy if required. **Record Vehicle Handover** remains a separate confirmation.

PDFs are recreated from immutable, versioned snapshots. This release does not add a server archive of PDF binary files; retain downloaded files if byte-for-byte archival is required. Raster downloads preserve Sinhala appearance. Print on A4 with browser headers/footers disabled and default/100% scale; printing from the document's Print action opens an isolated page.

## Verification and remaining checks

See `docs/TENULI_VERIFICATION.md` for the final results and reproducible commands. Tests use synthetic data and the actual SQL in local PGlite; no live credentials or business records were used.

Live hosted Supabase migration, security/performance advisors, real multi-session database concurrency, actual password changes, physical printers/devices, native OS sharing, deployed Safari/Firefox, Windows launchers and Flutter build/signing were not tested. The native source is retained; this PDF redesign is in the web admin portal. No deployment or APK is included.

The Supabase CLI created the migration filename, but automatic approval review blocked its unrelated telemetry request. No telemetry retry was attempted. The SQL file was populated and verified locally; no live migration depends on that blocked step.
