# v1.17 change map

- `insuredrive-web/src/lib/local-photos.ts`: account-scoped IndexedDB queues, directory handles, immutable job folder lookup, original image validation/checksums, safe file writes, manifest merge/recovery and ZIP export.
- `insuredrive-web/src/features/LocalPhotos.tsx`: settings, photo selection/capture, gallery, captions/order/removal, progress/retry/recovery and download controls.
- `insuredrive-web/src/features/Repairs.tsx`, `RepairForms.tsx`, `GroupedRepairEditor.tsx`, `src/components/Controls.tsx`: grouped details, six work categories, optional position/internal notes, stable row order and separate post-estimate photo handling.
- `insuredrive-web/src/features/PriceReview.tsx`, `src/lib/price-review.ts`: proposals, explicit decisions, preserved quote history, package allocation preview and deterministic integer allocation.
- `insuredrive-web/src/lib/repair-model.ts`, `grouped-billing.ts`: agreed line amounts and six-category grouping while retaining M/R behavior.
- `insuredrive-web/src/features/ModernCustomerDocument.tsx`, `GroupedRepairDocument.tsx`: display positions and agreed line totals on new applicable snapshots. Historical snapshots are not rewritten.
- `insuredrive-web/src/App.tsx`, `src/style.css`: account transition isolation, personal photo settings and responsive styling.
- `supabase/TENULI_PRICING_PHOTOS_UPGRADE.sql`: the one new additive SQL Editor upgrade, with private immutable review records, guarded calculator/API extensions, duplicate-draft protection and document immutability.
- `scripts/build_automart_installer.mjs`, generated `supabase/ENABLE_AUTOMART.sql` and `insuredrive-web/public/setup/ENABLE_AUTOMART.sql`: append the new upgrade after existing modules.
- New automated tests, private test fixtures, pinned test-only IndexedDB simulator, setup guide and test report. Rebuilt `insuredrive-web/dist` is included. Dependencies and temporary QA output are excluded from the ZIP.

No live deployment, live database change or automatic photo upload was performed. Flutter sources, existing business configuration, payments, supplier-cost logic and permission definitions are retained.
