# Tenuli Auto Care v1.16.0 — sign-in and web security

The demo button, demo administrator identity, demo API branches and browser sample database have been removed from the application. There is no demo URL, hidden switch or environment option. Sample SQL/data now exists only under `insuredrive-web/tests/fixtures/database` for local verification and is excluded from the production build.

## Install

1. Extract the complete ZIP into a **new folder**. Stop the previous local server before opening `START_WEB.bat`. On Mac/Linux: `cd insuredrive-web`, `npm ci`, `npm run dev`. Use Node.js 22.18 or newer within 22.x.
2. Keep your existing public Supabase configuration in `insuredrive-web/.env.local`, next to `package.json`. The supplied public configuration is retained. Use your real staff email/password; no account or password has been created, removed or reset.
3. Sign in again after upgrading. This version discards this project's old persistent browser login and stores new session tokens in tab storage. Language/theme preferences are preserved. Closing a tab normally ends local access; browser session restoration can restore tab storage, so **Sign out** on a shared device.
4. From v1.15.0, **no database migration is required for this update**. Existing billing, PDF snapshots, financial totals, permissions, authentication accounts and handover records are unchanged. If you have not applied the earlier PDF upgrade, follow `MODERN_CUSTOMER_PDFS_UPDATE.md` first.
5. Run `npm test` and `npm run build`. The complete clean `insuredrive-web/dist` is included. Deploy **only `dist`**, never the project root, tests, environment files or `node_modules`. Replace the old deployment atomically or remove its stale assets; do not merge old demo chunks into this build.

## Security changes

- Server-validated Supabase identity and an active matching profile are required before the workspace loads. Anonymous users and suspended/inactive profiles are rejected. Existing database permissions/RLS and guarded billing RPCs remain authoritative; hiding a control is never treated as authorization.
- Public configuration accepts a publishable key or compatible legacy `anon` JWT. Secret/service-role keys and unsafe public environment variables fail startup/build without printing their values. An HTTPS Supabase origin is required except loopback HTTP for local development. No project keys were rotated or privileged keys added.
- Session tokens use `sessionStorage`, with a memory-only fallback when browser storage is blocked. Passwords are never stored there. Tokens remain readable by same-origin JavaScript; this is **not** an HttpOnly-cookie backend. Sign-out clears the visible workspace immediately. If server revocation fails, local credentials are discarded and the page reloads with a clear notice; this does not claim other remote sessions were revoked.
- The release adds a Content Security Policy: same-origin scripts, no inline scripts or `eval`, configured Supabase connections, local fonts and the existing map tiles. Blob PDF previews/print/download remain supported. Inline styles are allowed for the existing renderer and map library.
- Response headers include anti-framing, MIME sniffing protection, no-referrer, limited browser capabilities and no-store caching. Development/preview bind to `127.0.0.1` by default.
- Every production build scans its output for demo code, test database/WebAssembly assets, source maps and privileged keys. Existing password-change verification, configured provider password rules and duplicate-submit guards remain in place.

## Production host setup

Serve the application over HTTPS. `dist/_headers` contains the generated response-header policy, including HSTS, for hosts that support that format. For a different host, configure the equivalent **HTTP response headers** in its server/CDN settings. The CSP also appears in the generated HTML, but a meta tag cannot enforce anti-framing, HSTS or other response-only headers. `vite preview` is for local checks, not a production server.

Use browser Developer Tools → Network → the document response to verify the headers after deployment. If your existing setup uses an additional trusted image/service origin, explicitly add that origin in `security-headers.ts` and rebuild; do not replace the policy with unrestricted wildcards.

In your existing Supabase project, review the actual Auth rate limits, password strength/leaked-password settings where available, allowed redirect URLs and whether public signups/anonymous sign-ins are needed by existing features. Verify RLS and account permissions in that same project. These hosted settings have **not** been changed or verified by this ZIP. Use `supabase/VERIFY_WEB_ACCESS_SECURITY.sql` for a read-only access inventory, plus your project's Security Advisor. Investigate findings before changing existing policies.

MFA/passkeys and CAPTCHA integration were not added. Do not assume they are enabled by this release. This update is targeted hardening, not a penetration-test certification or a guarantee that the entire hosted system is secure.

## Verification

- 37 automated test entries: configuration restrictions, secret-build rejection, session cleanup, existing password-change tests, billing/payment/profit calculations, document revisions, role isolation and database retries.
- Production build and release scan pass. `npm audit` reports **0 known vulnerabilities** in the installed lockfile at verification time (24 October 2026).
- Production Chromium tests: no demo button or `?demo=true` bypass; login validation/errors; duplicate login submission; suspended/anonymous rejection; role-filtered navigation; reload and tab-storage behavior; successful and failed-network sign-out; CSP blocks an injected inline script; English/Sinhala at 320–1440 px.
- Production billing browser tests use intercepted Supabase responses backed by Node PGlite. They exercise the real sign-in screen and production application, without shipping a demo or making live account requests. Arrival/advance, grouped items, partial/final payment, PDF preview controls/print/download, revisions and separate handover pass. No CSP violations were observed in that workflow. LKR 20,000 less LKR 5,000 advance leaves LKR 15,000; settlement does not duplicate revenue. Customer-entered HTML is displayed as text.
- The v1.15 PDF renderer and migrations are unchanged. This release reruns the customer workflow and grouped-billing checks; the complete 24-case visual PDF matrix is documented as prior v1.15 evidence, not claimed as a fresh run.

Not tested: native embedded PDF viewer rendering (the headless browser exposes the iframe but does not render its built-in PDF viewer; document preview and downloadable PDFs work), hosted Supabase Auth/RLS/Storage/advisors or actual credentials, real concurrent PostgreSQL sessions, deployed HTTPS/CDN headers, MFA/CAPTCHA, browser session restoration behavior across all browsers, physical printers/phones, native sharing, Windows launchers, Flutter/APK builds or a full penetration test. Source changes do not deploy themselves.

## Reproduce browser checks

Install Playwright/Chromium in your test environment (not in the production bundle), then run from `insuredrive-web`:

```sh
npm run build
node scripts/verify-login.mjs --production
node scripts/verify-two-documents.mjs --production
node scripts/verify-grouped-billing.mjs --production
```

The scripts also accept `PLAYWRIGHT_MODULE`, `CHROMIUM_EXECUTABLE_PATH`, `CHROMIUM_ARGS_JSON` and `TENULI_QA_DIR` for an existing browser installation. Synthetic fixtures are test-only: never execute them on your real database.

Official references consulted: [Supabase API keys](https://supabase.com/docs/guides/api/api-keys), [password security](https://supabase.com/docs/guides/auth/password-security), and [Supabase changelog](https://supabase.com/changelog).
