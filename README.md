# Tenuli Auto Care Web v1.19.0 — GitHub to Netlify

This separate package contains the React/Vite web application, its 600-item repair catalogue, A4 blue-letterhead documents, the required build helper and database setup files. It uses your existing Supabase backend and accounts. Flutter source and local environment values are excluded.

Start with **[NETLIFY_DEPLOY_GUIDE.md](NETLIFY_DEPLOY_GUIDE.md)**.

Keep these items side by side in the GitHub repository root:

- `netlify.toml`
- `insuredrive-web/`
- `scripts/`
- `supabase/`
- `docs/`

Upload/commit the extracted contents of this folder, not the ZIP file itself and not an extra surrounding folder. Keep `.gitignore`, `.nvmrc` and `insuredrive-web/.env.example` in the repository.

Netlify settings are included: base `insuredrive-web`, command `npm run build`, publish `dist`, Node `24`. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as Netlify build environment variables before deploying. No private/secret/service-role key is required.

The scripts retain their original sibling paths. Copying only `insuredrive-web/` will omit required setup dependencies. Netlify publishes only the built `dist`, not SQL/tests/source files from the repository. The existing downloadable installer SQL remains part of the app's normal setup assets.

Local checks inside `insuredrive-web`: `npm ci`, `npm test`, `npm run build`. To run locally, copy `.env.example` to `.env.local`, fill your existing public configuration, then `npm run dev`. `.env.local` is ignored by Git.

No database migration is required just for hosting. Feature-specific upgrades and verification notes remain in `docs/`. Local vehicle photos stay tied to their original browser/origin; follow the guide before switching from localhost to the hosted domain.
