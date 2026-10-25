# Publish Tenuli Auto Care through GitHub and Netlify

Prepared 25 October 2026. This package is the v1.19.0 web application with the 600-item catalogue and blue A4 document design.

## 1. Extract the web ZIP

Extract the ZIP on your computer. Open the inner `Tenuli_Auto_Care_Web` folder. It must contain `netlify.toml`, `insuredrive-web`, `scripts`, `supabase` and `docs` together.

Do not upload the ZIP itself as the repository's application. Commit the extracted source files. Keep the complete folder structure; the web app's prebuild command reads the sibling `scripts` and `supabase` directories.

## 2. Put the source on GitHub

Use the GitHub account that owns your intended repository. A private repository is a suitable choice for business application source; Netlify can be given access to that repository.

### GitHub Desktop option

1. Sign into GitHub Desktop with the correct account.
2. If creating a new repository, use File → New repository, choose your repository name and a local parent folder, then create it. Copy the **contents** of `Tenuli_Auto_Care_Web` into that new local repository folder. Commit, then Publish repository. Keep the repository private if that is your intended visibility.
3. If using an existing repository, clone it first. Copy these source contents into the clone, review changes, commit and Push origin. If the existing repository already contains a different application/layout, review it before replacing files.

The repository root must show `netlify.toml` and `insuredrive-web/` immediately, without another Tenuli folder around them. `.env.local`, `node_modules`, `dist`, keys and browser photo data must not appear in the commit. The included ignore rules handle normal generated files.

### Git commands option — new empty repository

Create a new empty repository in the intended GitHub account first. Open Command Prompt in the extracted `Tenuli_Auto_Care_Web` folder, then run:

```sh
git init
git add .
git commit -m "Add Tenuli Auto Care web application"
git branch -M main
```

Copy the exact HTTPS repository URL from GitHub, then run these commands after replacing the placeholder:

```sh
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

Use Git's normal browser/device authentication. Do not put passwords or tokens in commands, source files or chat. If the repository already has commits, clone it and work from that clone instead of force-pushing over its history.

## 3. Connect GitHub to Netlify

In Netlify, choose **Add new project → Import an existing project → GitHub** (the dashboard wording may say Add new site). Authorize the intended repository, select it, and use branch `main` or your established production branch.

The included root `netlify.toml` specifies:

| Setting | Value |
| --- | --- |
| Base directory | `insuredrive-web` |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node.js version | `24` |

The publish directory is relative to the base directory, so the deployed files come from `insuredrive-web/dist`. Let Netlify read the configuration file rather than adding the base twice. Do not select the entire source folder as the publish directory. The SPA fallback is configured without overriding real assets, and Vite generates the app's existing security headers.

## 4. Add the two Supabase build variables

Before deploying, use Netlify's environment-variable settings and add the following for production builds:

| Variable | Value source |
| --- | --- |
| `VITE_SUPABASE_URL` | Your existing Supabase project's HTTPS URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The same existing project's publishable key |

You can copy these from your current working app's `insuredrive-web/.env.local` or the existing Supabase project's API settings. The example file contains placeholders only. Keep these values in Netlify's build environment; do not commit your local env file. Only public client configuration is used; a service-role or secret key must never be used in VITE variables.

Vite embeds the public configuration and the corresponding CSP into the build. If either value changes, redeploy. The package now fails early on Netlify if its required configuration is missing or invalid, instead of publishing a sign-in page that cannot connect.

`NODE_VERSION=24` and the npm dev-dependency include flag are already set in `netlify.toml`. TypeScript and Vite are build dependencies. Do not remove devDependencies from the build install.

## 5. Deploy and verify

Click Deploy. A successful build runs the setup-file generator, TypeScript, Vite and the release-security check. Open the exact HTTPS URL that Netlify returns.

Check sign-in with your existing active account, saved records, all six catalogue sections, custom items, both A4 document types and permissions. Reload the page, check the logo/Sinhala font and confirm the browser reports no CSP/network errors. Do not record a real payment just to test deployment.

After the repository is linked, normal pushes to the configured production branch trigger Netlify builds. Use the deployment log to diagnose failures; when sharing a log, omit tokens/passwords/private information.

## 6. Keep the existing Supabase backend

Netlify hosts the frontend. It does not replace Supabase Auth, database or Storage. Reuse the existing project to keep accounts, jobs and financial records. No hosting migration/reset is required. Only apply a feature upgrade if your database is missing that specific feature; see the existing setup documents.

Once the final domain is known, review Supabase Authentication → URL Configuration and set the intended production Site URL. Preserve any still-required existing client URLs. Add exact permitted redirect URLs only for flows the app actually uses. The current application uses password sign-in and does not process OAuth/recovery callbacks merely because a URL is allowlisted; changing these settings does not add those flows.

## 7. Local vehicle photos when changing domains

Pending photo queues, folder permissions and local-file handles belong to the original browser profile and site origin. Moving from localhost to a Netlify URL, or later to a custom domain, does not move that browser storage.

Before switching, finish local photo saves or download the pending photos ZIP from the old site. Keep that old browser data until recovery is complete. On the final stable HTTPS domain, open Local Photo Storage and choose the folder again. Existing locally saved files remain on the computer; galleries may require reselecting files because old browser handles are unavailable on the new origin. Photos are not automatically uploaded to Netlify or cloud storage.

## Troubleshooting

- **package.json not found:** verify the root folder structure and base directory.
- **Cannot find ../scripts or SQL file:** the repository must include the sibling `scripts/` and `supabase/` folders.
- **Missing Supabase configuration / sign-in unavailable:** set both VITE variables on Netlify's build environment and redeploy.
- **TypeScript or Vite missing:** keep devDependencies installed for the build; use the supplied config.
- **Blank page / assets fail:** publish `dist` relative to base `insuredrive-web`; keep the generated security headers and configured fallback.
- **Permission denied after sign-in:** check the existing application's active account and permissions. Deployment does not grant new roles.
- **Shared catalogue unavailable:** built-in 600 items still work; apply `TENULI_CATALOGUE_UPGRADE.sql` only if you need administrator shared saving and it is not already installed.
- **Photo gallery empty after moving domains:** the previous site's browser storage has not transferred; follow the local-photo step above.

## Verification scope

The separate package is checked with a clean dependency install, the existing automated suite and a production build using the existing public configuration supplied through build environment variables. Source archives are scanned to exclude real env files, privileged keys, dependencies and build output. A local build is not a live Netlify deployment; final hosting/auth/device checks require your chosen repository, Netlify account and resulting URL.

## Official references

- https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/
- https://docs.netlify.com/build/configure-builds/overview/
- https://docs.netlify.com/build/configure-builds/manage-dependencies/
- https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/
- https://supabase.com/docs/guides/auth/redirect-urls
