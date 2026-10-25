# Tenuli Auto Care v1.17 verification — 2026-10-25

## Completed checks

- `npm ci` completed; the new test-only `fake-indexeddb` dependency is pinned in the lockfile.
- `npm test`: **52 entries passed, 0 failed, 0 skipped**. Several entries execute database integration scripts containing many assertions.
- Production `npm run build`: TypeScript, Vite and the release security scan passed. Generated production files include no demo entry point, PGlite/test database, WebAssembly, source maps or privileged keys. Existing CSP and security headers are retained.
- Additive SQL upgrade applied twice in an isolated PGlite database. The repeatable combined installer is covered by the existing installer tests. No live Supabase database was accessed or changed.
- Browser inspection used a separate, synthetic test fixture with blank backend configuration. It is not a production route and is not included in `dist`.

## Local photo checks (14 automated tests)

Multiple original files; exact byte checksums; captions and ordering; stable filenames; repeated retries without duplicate photo writes; unchanged folder after registration/revision changes; Colombo date boundary; Windows invalid/reserved names; revoked permission; full-disk/write failure; partial success; manifest failure and retry; filename collision without overwrite; account isolation; restart recovery using a new memory session and persisted simulated IndexedDB; quota failure retaining a non-durable memory queue; cancellation on account change/disconnect; unsupported-directory ZIP structure and original bytes; wrong type/empty/oversized files; missing originals; recovery from manifest; unsafe manifest path rejection; another account appending to the same authorized job folder while preserving existing exported photos; explicit gallery removal updating the manifest without deleting disk files.

Filesystem permission and disk failures are **simulated**. Simulated IndexedDB restart coverage is not a real browser restart or real stored-directory-handle test. ZIP tests parse the stored entries and compare original bytes; they do not assert that a browser downloaded or extracted a file.

## Pricing/database checks

- Six categories and optional details survive the new API. Duplicate/empty item IDs are rejected.
- Null prices remain M/R and do not become zero. Pending included items block final issuance.
- Proposals and rejected reviews do not alter totals. Accepted pricing requires an explicit decision, creates a numbered working revision and resets customer/insurer approvals separately.
- Original quoted prices, including null originals, are retained in immutable review history. Accepted line amounts are authoritative without inventing a rounded unit price.
- Exact proportional integer allocations, deterministic rounding remainder, fractional quantities, stale reviews, invalid/null versions, repeated request IDs and forged allocation metadata are covered.
- The original photo-draft identifier is immutable through revisions and prevents duplicate job creation from a recovered draft.
- Existing issued invoice snapshots and profit reports remain unchanged after upgrade. New customer snapshots omit internal notes, unverified annotations and private review IDs.
- Existing receiving/advance → final invoice → payment collection → numbered copy → separate handover dispatch remains intact. No package line duplicates revenue; payments are idempotent; report totals are unchanged by document copies.
- Owner/unauthorized-staff denials and private table protection are checked. Old documents/reviews cannot be updated/deleted; the established invoice void status transition still works.
- Existing rental, repair, supplier-cost, profit, authentication, password, permission and document regression tests pass.

## Browser checks actually performed

| Surface | Result |
|---|---|
| Chrome, isolated HTTP desktop preview | Grouped details, six-section selection, custom row entry, live known-price subtotal, M/R, English/Sinhala switch, edits retained during language switch, estimate saved without photos: passed |
| Same Chrome, 390 px iframe viewport | Responsive form and work-row controls visually inspected; Other Charges row creation worked |
| Same HTTP preview | Unavailable-directory fallback notice was correctly shown |
| Real automatic directory saving | **Not tested/certified in any browser/OS combination** |

Chrome/Edge desktop over HTTPS or localhost are intended targets for the user-clicked File System Access picker, according to the linked official browser guidance. Capability detection decides actual availability. This is compatibility guidance, not a claim of a successful device test. Unsupported browsers offer ZIP download. The UI preview used HTTP and therefore could not establish real native directory permission.

## Not tested here / deployment acceptance checks

- Real Windows/macOS/Linux folder selection, persisted directory handles across browser restart, real permission renewal/revocation, unplugged/network drives, real full-disk recovery and operating-system filesystem behavior.
- Real Edge, Firefox, Safari, Android or iOS; physical-device mobile camera capture, drag-and-drop/file chooser uploads, actual browser ZIP downloads/extraction, very large photo queues under memory pressure.
- Multiple browser tabs/devices/processes editing the same manifest simultaneously; lock and merge code exists, but real concurrency was not exercised. The destination filesystem can also be changed externally.
- Live Supabase/PostgREST deployment, production account switching/auth expiry, external shop file storage, real customer data, database migration history registration or production hosting.
- New PDF visual exports/printing with actual customer records. Snapshot integrity, totals, privacy, pagination models and old document regressions passed; no real customer PDF was generated in this run.
- Flutter/native builds, APK generation and native repair-photo parity. The supplied native source is retained unchanged.
- Comparison with the scanned estimate/annotated photograph, which were not supplied. No OCR suggestions or handwritten financial amounts were imported.

Before deployment acceptance, exercise the first-time folder flow and a real save/retry/restart on the staff's actual browsers. The detailed setup guide lists the visible steps. Raw automated test/build logs are in `docs/verification/v1.17/`.
