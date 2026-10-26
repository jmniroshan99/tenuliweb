# Tenuli Auto Care Web v1.19.1 — Vehicle-photo feature removal

Updated 26 October 2026.

## ඉක්මන් setup

1. ZIP එක extract කර `Tenuli_Auto_Care_Web` folder එකේ **ඇතුළත තිබෙන files/folders** දැනට තිබෙන GitHub repository එකේ root එකට update කරන්න. ZIP එකම upload නොකරන්න.
2. අලුත් source එකෙන් `insuredrive-web/src/features/LocalPhotos.tsx`, `insuredrive-web/src/lib/local-photos.ts` සහ `insuredrive-web/tests/local-photos.test.mjs` ඉවත් කර ඇත. පරණ folder එකට files copy කරනවා නම් මේ පැරණි files තුනත් ඉවත් කරන්න. පරණ source එකේ backup එකක් තබාගන්න.
3. `netlify.toml`, `insuredrive-web/`, `scripts/`, `supabase/` එකම repository root එකේ තබන්න. දැනට Netlify හි ඇති `VITE_SUPABASE_URL` සහ `VITE_SUPABASE_PUBLISHABLE_KEY` build variables තබාගන්න. `.env.local` GitHub වෙත upload නොකරන්න.
4. GitHub production branch එකට push කර Netlify deployment එක සාර්ථක වන තුරු බලන්න. දැනට වැඩ කරන v1.19.0 database එකට මෙම ඉවත් කිරීම සඳහා අලුත් SQL එකක් අවශ්‍ය නැත.
5. Local භාවිතයට Node 24 සමඟ `insuredrive-web` තුළ `npm ci`, `npm test`, `npm run dev` ක්‍රියාත්මක කරන්න. අවශ්‍ය public settings පමණක් `.env.example` සිට සාදන `.env.local` තුළ යොදන්න.

මෙම ZIP එක ලබාදීමෙන් live website එක හෝ database එක ස්වයංක්‍රීයව වෙනස් වන්නේ නැත.

## Changes

- Removed the vehicle-photo drop zone, Add Photos and Use camera controls, file inputs, previews, gallery, progress/retry/recovery controls and photo-specific limits/errors.
- Removed Local Photo Storage from Settings and the signed-in account's photo-queue activation.
- Removed photo loading/preparation guards, queue binding and local-photo save calls from estimate creation and revision. Estimates now save directly through the existing repair API, with existing financial validation intact.
- Removed photo-only CSS, modules, obsolete photo tests and the unused fake-indexeddb development dependency. Updated package and lockfile to v1.19.1.
- Renamed the former photoScope prop to catalogueScope; its project URL + user ID scope and catalogue permissions remain the same.
- Updated the isolated estimate fixture for photo-free create/save/reopen/revision checks. It remains excluded from the production build.

## Data and features retained

No live database, files, storage buckets, browser IndexedDB records or folder permissions were changed or deleted. Previously exported photos remain in their original folders; this release has no photo-gallery or recovery interface. Existing legacy photo_draft_id metadata remains supported and is not overwritten by a new queue identifier.

All supplied SQL files and the build installer are unchanged. The legacy TENULI_PRICING_PHOTOS_UPGRADE.sql file remains because it also implements price reviews and compatibility for existing records. Do not drop its tables or remove that SQL from the installer.

The six-section 600-item catalogue, custom items, customer/vehicle data, financial calculations, payments, pricing allocations, shop costs/profit, permissions and language support remain. Supplier bill PDF/image attachments and business-logo uploads are unrelated features and remain available. The document components, logo/assets, blue A4 letterhead and immutable issued snapshots are unchanged.

## Verification

| Check | Result |
|---|---|
| Existing regression suite plus new photo-free database case | 45 passed, 0 failed, 0 skipped |
| New database regression | Two estimates created without photo IDs; reopened and revised; lines, pending prices, discounts and Sinhala custom description retained; legacy photo metadata retained; unauthorized revision rejected |
| English/Sinhala component rendering | Four cases passed: new and legacy estimate in each language; no file inputs/photo controls; catalogue, M/R and required fields retained |
| Production build | Passed TypeScript, Vite and release-security checks with NETLIFY=true and the existing public configuration supplied only through process environment |
| Dependency versions | npm ls --depth=0 passed; package/lockfile agree; photo-only dependency removed |
| Protected files | 82 files byte-identical to uploaded ZIP, covering SQL, public assets, logo, catalogue data, documents, supplier attachments, repair API and Netlify configuration |
| Photo code removal | No removed component references, photo IndexedDB identifiers, folder-picker/camera APIs or photo classes remain in production source; removed feature strings absent from production assets |

The prior 58-test count included 14 tests for the removed photo module. Removing those and adding one photo-free estimate regression gives 45 current tests. Existing suites still cover prices, package rounding, advances, payments, profits, permissions and immutable historical documents.

Logs are in docs/verification/v1.19.1/. To repeat the additional component-render check, run `node tests/verify-photo-free-render.mjs` from insuredrive-web.

## Verification limits

- No GitHub push, live Netlify deployment, real account sign-in, production Supabase write, physical printing or native-device test was performed.
- The cloud browser could not reach the local fixture server; subsequent local-page access was blocked by its browser security policy. Interactive browser, keyboard, mobile-layout and real permission-dialog behavior could not be verified in this run. Component rendering is not browser interaction coverage.
- A clean offline npm install was attempted but the package cache lacked yallist. Tests/build used the supplied project's previously installed exact dependency versions, checked with npm ls. A fresh registry install was not verified in this restricted environment.
- No screenshots are supplied as evidence of an interactive browser test.

Older versioned reports and photo setup instructions are historical. This file describes the current release.
