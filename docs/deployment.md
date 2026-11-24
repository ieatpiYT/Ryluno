# Setup and deployment

Nothing has been pushed or publicly deployed by this change. Use a private preview first. Never paste private keys, passwords, OAuth codes, call links or tokens into chat.

## 1. Repair local Git

Git currently fails because macOS Command Line Tools are missing. In the Mac's **Terminal** app, run:

```sh
xcode-select --install
```

Choose **Install**, accept the license, and wait for completion. Then run `git --version` and `git status --short` in the project folder. If the install dialog is unavailable, download **Command Line Tools for Xcode** from https://developer.apple.com/download/all/ and run its installer. Do not run reset/clean or discard existing work.

The configured origin is `https://github.com/ieatpiYT/Ryluno.git`. The Git index contains no tracked environment files or private Fo journal. A read-only index scan is not a substitute for reviewing the actual diff once Git works.

## 2. Create Supabase

1. Go to https://supabase.com/dashboard → **New project**. Select your organization. Enter **Project name: Ryluno**, generate a database password and save it in your password manager, choose a nearby **Region**, then **Create new project**. Wait until the project is ready.
2. Sidebar **SQL Editor** → **New query**. Paste the contents of [001_core.sql](../supabase/migrations/001_core.sql), then **Run**. Run it once. This creates profiles, the study aggregate and RLS views, Fo connections/state/history, preferences, locks and indexes. Do not disable RLS to fix an error.
3. Create another query and run [002_scheduler.sql](../supabase/migrations/002_scheduler.sql). It adds scheduler indexes but does not send or schedule anything. Then run [003_dispatch_claim.sql](../supabase/migrations/003_dispatch_claim.sql) to install atomic dispatch and stale-event cancellation.
4. **Project Settings** (gear) → **Data API**: copy **Project URL**. **Project Settings → API Keys**: copy the **Publishable key**. Dashboard versions also expose these under the project's **Connect** dialog.
5. In **API Keys**, use the **Legacy anon, service_role API keys** tab to reveal **service_role**. Store it only in the local environment file or Vercel's private environment-variable field. It bypasses RLS and must never be a `NEXT_PUBLIC_` variable. The user-facing API uses the publishable key and verified user session; the service key is limited to server Fo/scheduling code.
6. Sidebar **Authentication → Sign In / Providers → Email**: enable email sign-in and **Confirm email**. For a real launch, configure your own SMTP provider under **Authentication → Email → SMTP Settings**; the default test mail service has delivery/recipient limits.
7. **Authentication → URL Configuration**: initially set **Site URL** to `http://localhost:3000`. Add **Redirect URL** `http://localhost:3000/auth/callback`, then **Save changes**. The email must be opened in the browser that started signup because the flow uses PKCE.

The study document deliberately stores problems and attempts together, with RLS-protected `problems`, `attempts`, `study_sessions`, `adaptive_reviews`, and `study_preferences` views. Saving replaces one complete version atomically; it does not append duplicate attempts. Fo credentials have no authenticated-browser read policy.

## 3. Local environment

Copy [.env.example](../.env.example) to `.env.local`. Preserve any existing development values. Set:

| Variable | Value | Browser exposed? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from Supabase | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key | Yes |
| `APP_ORIGIN` | `http://localhost:3000`, without trailing slash | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key | **No** |
| `FO_TOKEN_ENCRYPTION_KEY` | Base64-encoded 32 random bytes | **No** |
| `CRON_SECRET` | At least 32 random bytes encoded as hex | **No** |
| `FO_HTTPS_CALLBACK_VERIFIED` | `false` until a live HTTPS callback passes | No |
| `FO_AUTOMATION_VERIFIED` | `false` until supervised automation verification | No |

Generate the two random values locally with your password manager, or run these in your own Terminal and paste the outputs directly into the environment fields:

```sh
openssl rand -base64 32
openssl rand -hex 32
```

Do not share the output in chat. Restart `npm run dev -- --hostname localhost --port 3000` after setting variables. Create an account, confirm the email and sign in. Before creating a study plan, select **Import browser data** to copy existing practice into an empty account. Confirm the prompt. This import is one-time; the local copy remains intact. Export before importing if uncertain.

Signing in never automatically uploads browser data. Cloud saves show pending/error status and block further edits while unresolved. Export unsaved work before reloading after a conflict. Signing out removes the active account UI; account data is not written into device-only localStorage.

## 4. Fo authorization and capability checks

The existing development path remains separate: **Settings → Fo check-ins → Connect in local development** uses `FO_DEV_ENABLED` and `FO_DEV_PASSWORD` and the callback `http://localhost:3000/api/fo/callback`.

The new account path uses **Today → Connect Fo**, with callback:

- Local: `http://localhost:3000/api/companion/callback`
- Production: `https://YOUR-PRODUCTION-DOMAIN/api/companion/callback`
- Preview: `https://YOUR-EXACT-PREVIEW-DOMAIN/api/companion/callback`

The SDK dynamically registers that exact redirect URI with Wajo's advertised registration endpoint. No shared Wajo API key is used. Public OAuth metadata advertises S256, refresh tokens and public clients; it does **not** prove that your production HTTPS URL will be accepted.

On an HTTPS preview, select **Connect Fo**, complete Wajo consent, and verify you return to the same signed-in Ryluno account. If registration/consent rejects the URL, stop and ask Wajo support (https://wajo.ai/help#report-problem) to allow the exact HTTPS callback and confirm public-client dynamic registration for Ryluno. There is no verified dashboard control for an OAuth callback allowlist, so do not assume one exists. Do not weaken state, PKCE, origin checks, or use a shared account to work around rejection.

After successful HTTPS testing, set `FO_HTTPS_CALLBACK_VERIFIED=true`. This records operator sign-off; it is not itself evidence. Re-run the flow after domain changes. Rotating the encryption key invalidates stored connections; disconnect and reconnect every account rather than deleting request history.

Browser voice uses authenticated `start_fo_call` discovery and only invokes an empty argument object when the schema allows it. Returned links must be HTTPS Wajo URLs. The exact live result still needs verification. Outbound telephone reminders are disabled: recipient ownership and cancellable telephone actions have not been verified through this profile.

## 5. GitHub review and push

After Git is repaired:

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
node scripts/check-tracked-secrets.mjs
git status --short
git diff --check
git diff
```

Review changed and untracked files. Do not stage `.env.local`, `.ryluno-fo`, `.next`, tokens or logs. `.env.example` contains placeholders and is safe to commit. Obtain the owner's approval **before pushing**. Then commit the reviewed application changes on a branch and push to **ieatpiYT/Ryluno**. No push has been performed here.

## 6. Vercel preview and production

Obtain the owner's approval **before creating a public deployment**. Vercel previews may be reachable by others; use deployment protection where available. Do not assume a preview is private.

1. Go to https://vercel.com/dashboard → **Add New… → Project**.
2. Under **Import Git Repository**, connect GitHub if necessary and select **ieatpiYT/Ryluno → Import**. If missing, choose **Adjust GitHub App Permissions** and grant access to this repository only.
3. **Framework Preset: Next.js**. **Root Directory: `./`**. Keep the detected **Build Command: `npm run build`**, install command and output directory defaults. Use a supported Node 22 LTS runtime in **Settings → Build and Deployment → Node.js Version** (or the equivalent Node.js section).
4. Under **Environment Variables**, add the variables from the table. Do not add `FO_DEV_ENABLED` or `FO_DEV_PASSWORD` on Vercel. All private values must be unprefixed server variables.
5. Use a **separate Supabase project and encryption key for Preview**. Apply the migrations there too. Set Preview `APP_ORIGIN` to the exact preview hostname you will test; a stable branch/custom preview domain avoids changing it on each deployment. Never use `VERCEL_URL` as an unvalidated callback destination.
6. Production `APP_ORIGIN` must match **Settings → Domains** exactly, with `https://` and no trailing slash. Initially keep both Fo verification flags false. Click **Deploy** only after approval. Environment changes require a new deployment: **Deployments → … → Redeploy**.
7. In production Supabase **Authentication → URL Configuration**, set **Site URL** to the production origin and add `https://YOUR-PRODUCTION-DOMAIN/auth/callback`. In the separate preview Supabase project add the exact preview callback. Avoid a broad wildcard over arbitrary deployments.
8. Complete the HTTPS Fo flow described above. A fresh deployment should preserve connections and saved study data because they are in Supabase, not server memory.

## 7. Background scheduling

The official Vercel documentation checked on 2026-11-24 limits legacy Hobby cron to once per day with up to 59 minutes of timing variation, which is unsuitable for timely missed-session polling. This app uses **Supabase Cron** and `pg_net`, so no Vercel cron configuration or paid cron assumption is required. Confirm current plan limits at https://vercel.com/docs/cron-jobs/usage-and-pricing and https://supabase.com/docs/guides/cron.

1. Supabase sidebar **Database → Extensions**: search for and enable **pg_cron** and **pg_net**. Some dashboard versions expose **Cron** under **Integrations**; enable it there if offered.
2. Open **Integrations → Vault** (or **Database → Vault** in older dashboards) → **Add new secret**. Create `ryluno_app_origin` with the production origin and `ryluno_cron_secret` with the exact `CRON_SECRET` from Vercel. Never put these values in the committed SQL or chat.
3. In **SQL Editor → New query**, run [install-scheduler.sql](../supabase/install-scheduler.sql). It installs a five-minute polling job and hourly OAuth-state cleanup. Re-running replaces the named jobs.
4. In **Cron → Jobs**, inspect `ryluno-accountability` and its run history. Cron success means the HTTP request was enqueued, not that Fo delivery succeeded. Inspect `net._http_response` in SQL Editor for HTTP responses without copying request authorization headers. Also inspect `fo_requests` status in **Table Editor**.
5. For the first supervised test, temporarily set `FO_AUTOMATION_VERIFIED=true` in the private test deployment and redeploy. This gate is necessary to exercise the path; it is **not a claim that it already works**. Enable accountability only for the test account with explicit consent. After testing, leave the flag true only if every check below passes; otherwise revert to false and redeploy.
6. Disable the app preference to cancel queued requests. To stop all scheduled execution, disable the named Cron job or run `select cron.unschedule('ryluno-accountability');`. Already sent Fo work is not cancelled by stopping the scheduler.

Each tick examines persisted sessions, allows a 15-minute grace period, skips sessions older than 24 hours and skips users who recorded practice since the session began. Quiet hours are evaluated in the stored IANA timezone, including DST. Limits use a rolling 24-hour window. One dispatch per invocation bounds execution time; this MVP scheduler is for a small pilot, not high-volume fan-out. Duplicate executions use unique session keys and user locks. An uncertain send is never automatically retried. Delayed jobs outside the recovery window are skipped instead of sending stale reminders.

## 8. Release verification

Use [verification.md](verification.md). Required live checks include two real accounts, browser restart persistence, HTTPS OAuth, an explicitly approved text check-in and reply, browser voice creation, cancellation, duplicate execution, and a missed session with the browser closed. Record actual outcomes. Do not enable telephone reminders or describe this as shipped until the required live paths pass.
