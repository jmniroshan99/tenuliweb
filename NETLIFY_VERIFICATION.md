# Netlify web-package verification — v1.19.1, 26 October 2026

Vehicle-photo uploading, gallery and Local Photo Storage have been removed. The web package retains its existing GitHub → Netlify configuration, sibling build helper, SQL dependencies, catalogue, customer documents and unrelated attachments.

- Automated tests: **45 passed, 0 failed, 0 skipped**.
- English/Sinhala component-render checks: four cases passed.
- Production build with NETLIFY=true and the existing public settings supplied through the process environment: TypeScript, Vite and release-security checks passed.
- Dependency version check: npm ls --depth=0 passed.
- netlify.toml is byte-identical to the uploaded package: base insuredrive-web, build npm run build, publish dist, Node 24, SPA fallback unchanged.
- A fresh offline dependency install was unavailable because a package was missing from the cache. Existing exact installed dependency versions were reused for verification.
- Interactive cloud-browser checks were blocked; no browser or mobile interaction success is claimed.

See [docs/V1_19_1_PHOTO_REMOVAL.md](docs/V1_19_1_PHOTO_REMOVAL.md) for the change report, setup steps, evidence and limits. Current logs are under docs/verification/v1.19.1/. Reports under earlier version directories are historical.

No live site, GitHub repository or database was changed. Keep the existing Supabase project and public Netlify environment variables. No new database migration is needed for this removal from a working v1.19.0 installation.
