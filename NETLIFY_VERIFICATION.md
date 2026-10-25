# Netlify web-package verification — 25 October 2026

- Separate, sanitized web-only tree retains the application, sibling build helper and SQL dependencies. Flutter code/assets, real env files, dependencies, caches and build output are excluded from the source ZIP.
- Clean `npm ci --include=dev`: passed.
- `npm test` from the separate tree: **58 passed, 0 failed**. Logs: `docs/verification/netlify/tests.txt`.
- Production build with `NETLIFY=true` and existing public Supabase configuration passed through the process environment: TypeScript, Vite and release-security check passed. Log: `docs/verification/netlify/build.txt`.
- Missing Netlify build configuration: build failed early with the intended configuration message and without printing key values.
- Parsed `netlify.toml`: base `insuredrive-web`, command `npm run build`, publish `dist`, Node `24`, non-forced SPA fallback. Existing files take precedence over the fallback.
- Git ignore verification: `.env.local`, node_modules and dist are ignored; `.env.example` and netlify.toml are not ignored.
- The runtime estimate editor, catalogue, document components and document CSS match the v1.19.0 application. The web copy adds only hosting configuration/documentation and the Netlify configuration guard.
- No credentials, real customer records or browser-local photo queues are included. Existing public client configuration is supplied separately through Netlify's build environment.

Not performed: GitHub push, live Netlify build/deployment, final-domain sign-in, Supabase URL configuration change, or browser/device checks on a hosted URL. A connected GitHub account was inspected, but an intended writable Tenuli repository has not been provided. Local build success is not a claim of live deployment.
