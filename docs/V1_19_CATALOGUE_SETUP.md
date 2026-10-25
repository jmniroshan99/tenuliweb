# Tenuli v1.19.0 catalogue setup

## Run the updated system

1. Extract the complete ZIP into a new folder. Retain the same existing database, accounts and public configuration in `insuredrive-web/.env.local`.
2. Windows: open `START_WEB.bat`. Mac/Linux: inside `insuredrive-web`, run `npm ci` then `npm run dev`. The launcher requires Node 22.18+; verification used Node 24.22.1.
3. Open Repair Billing → New/Edit Estimate. Select Add work section, then search the Service / part field. All six sections contain 100 built-in selections even with empty job history.
4. The verified static build is included in `insuredrive-web/dist`. Rebuild with `npm run build` and deploy through the existing hosting process when ready.

For an existing v1.18.1 database, **no migration is needed for the 600 built-in suggestions or custom estimate descriptions**. The optional shared-saving upgrade is explained below. Existing earlier operations-bill/blue-header prerequisites still apply when upgrading an older installation; see `V1_18_SETUP.md` and `BLUE_LETTERHEAD_UPDATE.md`. The current combined `supabase/ENABLE_AUTOMART.sql` includes all upgrades in order.

## Select or add an item

- Start typing a description or alias; for example, “head light” finds Headlamp assembly and “AC” finds relevant air-conditioning entries. Suggestions stay in the selected section.
- Click a suggestion, or use Arrow Up/Down followed by Enter. Escape closes the list; Tab moves onward. Show more reveals another 20 results; End reaches the last matching option.
- Other / Custom item is always available. Choose it and type your own description in the same field. Its section stays unchanged. Save/reopen/revision uses the ordinary estimate workflow.
- Selection changes the description only. Quantity, unit, position, price, discount, inclusion and accepted package amounts remain controlled by the existing editor. New unpriced rows remain M/R. Enter prices separately.
- Previous descriptions available through the signed-in user's authorized job list are merged with the catalogue and deduplicated. Actual job usage ranks suggestions; no global popularity data or customer identities are sent to an external search service.
- English is the canonical seeded catalogue language. The UI supports English/Sinhala; selected common entries have Sinhala search/display text, other entries retain English labels. Sinhala custom descriptions remain searchable and save normally. This is not a claim that all 600 entries have been translated.

The catalogue describes possible parts, materials, services and actual expenses. It does not assert that Tenuli provides every specialist service. Select only applicable work. Some procedures are alternatives or are bundled; avoid charging twice for work included in an accepted package. Part supply, labour and consumables are distinct selections and are never auto-added together.

## Optional shared custom suggestions

To let authorized administrators publish custom descriptions for future staff use, run `supabase/TENULI_CATALOGUE_UPGRADE.sql` in the **existing Supabase project's SQL Editor** as the owner. This small additive upgrade creates a private catalogue table and a permission-checked RPC. It does not edit jobs, prices, payments or document history and is safe to repeat.

An administrator who also holds the existing `manage_system_settings` permission sees **Save as a shared suggestion** below a custom description when the shared service is available. Clicking it publishes only the section, description and unit; saving the estimate alone never publishes it. An equivalent retry returns the existing shared entry. Staff without this permission can still use built-in/history suggestions and save custom estimate rows.

If shared suggestions cannot load, the built-in catalogue and estimate saving remain available. Use Retry shared suggestions after the upgrade or a connection recovery. Shared entries are held in the existing app project's database. No cross-project or cross-account browser cache is introduced; sign-out/role restrictions remain in force. Shared catalogue editing/hiding is not added as a new staff workflow in this release.

## Catalogue files and maintenance

- `insuredrive-web/src/data/repair-catalogue-parts.ts`: 100 replacement parts and 100 removal/refitting operations.
- `insuredrive-web/src/data/repair-catalogue-services.ts`: 100 repairs and 100 paint/refinishing operations.
- `insuredrive-web/src/data/repair-catalogue-materials.ts`: 100 miscellaneous materials and 100 optional services/expense types.
- `docs/catalogue/Tenuli_Repair_Catalogue_600_Items.json`: all 600 records, IDs, aliases, units and per-section counts.
- `docs/catalogue/REPAIR_CATALOGUE_AND_COUNTS.md`: human-readable lists and counts.

After a source-catalogue edit, run `node scripts/export-repair-catalogue.mjs` inside `insuredrive-web` to regenerate the review files. Keep IDs stable, avoid aliases/positions as separate records, and run `npm test` plus `npm run build`.

The two blue A4 customer documents, existing issued snapshots, local photos, pricing, approvals and separate handover are retained. This delivery updates source/build artifacts; it does not deploy the application or run SQL on the live database. Native Flutter build/signing instructions remain unchanged; the new selector is a browser feature.
