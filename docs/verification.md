# Verification and release gate

## Launch sprint — 2026-11-25

Authenticated follow-up:
- Saved a clearly labelled temporary practice entry through the UI, reloaded, and retrieved revision 1 with its attempt from the authenticated workspace endpoint. Removed only that test entry using the current revision; cleanup returned 200.
- A save claiming a different account ID returned 409.
- Created a temporary second hosted Supabase account without sending email. Its authenticated client could not read the existing account's study document, Fo connection or request history; it could save and read only its own workspace. Browser-role execution of `disconnect_fo` was denied. Deleted the temporary account successfully afterward.
- The real user's persisted Fo connection successfully performed authenticated tool discovery. `start_fo_call` accepts an empty object and returns `joinUrl` and `expiresAt`; its description specifies a single-use browser link expiring after ten minutes, without a telephone number.
- Existing user-created voice requests are recorded as complete; actual audio has not been observed. One text-only check-in was prepared for explicit approval, not sent by the agent.
- Subsequent authenticated history inspection confirmed that the exact approved check-in had already been sent through Ryluno and received a real Fo response suggesting one 25-minute session at 8pm. A user reply of `ok` also received a completed response. The agent did not duplicate either message. The workspace still had zero scheduled sessions and automation was disabled; conversational agreement is not evidence of a scheduled reminder.
- Prepared a separate, unsent capability-only question about telephone ownership, account permission, cancellation, quiet hours and frequency limits. It explicitly forbids calls and scheduling. Awaiting approval and actual voice-audio confirmation.
- Owner subsequently confirmed two-way browser voice audio and approved the capability question. That question was sent once and asynchronously polled to `complete`. Fo said its own calling tool supports one-time profile-phone reminders and conversational cancellation, but explicitly could not verify an interface named `ask_fo`. Its stated ownership policy accepts profile information or the user's words; its quiet-hour/frequency description supplied no exact limits. This conversational response does not establish machine-verifiable ownership, cancellation or bounded telephone execution for Ryluno. No telephone reminder was created.
- Read-only inspection of the signed-in Wajo General settings confirmed an attached profile phone, OG Fo plan and America/Toronto timezone. The phone was redacted from reported output. Cancellation has not been exercised, and Ryluno's text-only dispatch intentionally prohibits telephone actions. Native Wajo testing would not by itself verify Ryluno telephone automation.
- Owner authorized a November 25, 8pm America/Toronto cancellation rehearsal. At approximately 6:55pm, Wajo created schedule `agent-action-33e14145-6eaf-4b2e-a3f8-a2087ad2a881-e0655ec2-02d1-43d9-a643-94d9549a499f`, but described it as a text reminder despite the telephone request. Immediately requested cancellation. Fo confirmed it cancelled and would not fire; the On radar list returned to the original four unrelated items with no rehearsal. This verifies native schedule cancellation, not telephone scheduling. Prepared a corrected telephone-only draft for separate approval; it has not been submitted. Vercel is open at login, awaiting the owner.

- Account header uses the existing panel, foreground and border theme variables. Browser computed styles confirmed a dark background and light text.
- All 40 automated tests, TypeScript, ESLint and production build passed.
- Required local environment fields are populated; HTTPS callback and automation flags remain false. Values were not logged.
- Unauthenticated workspace and cron requests returned 401; companion status rejected unauthenticated access (400). The available browser is at sign-in, so hosted persistence, cross-account isolation and per-user Fo authorization remain pending authenticated browser access.
- No external message, call, push or deployment was performed. Live text/reply, browser voice, telephone eligibility and browser-closed scheduling remain unverified.

## Resumed OAuth and cancellation verification — 2026-11-24

- OAuth discovery state is now serialized and restored with the per-user provider snapshot. The mocked HTTPS callback succeeds after constructing a fresh provider from that snapshot.
- Migration 004 makes disabling accountability and disconnecting Fo transactional, cancels queued requests, and restricts browser database privileges. Embedded PostgreSQL regression checks cover rollback, isolation and preservation of already-dispatched requests.
- Focused regression tests: 8 passed. Final full suite: 40 passed. TypeScript, ESLint and production build passed.
- These are local checks using mocked OAuth and embedded PostgreSQL, not live Wajo or hosted Supabase verification. No messages, calls, push or deployment were performed.

## Automated checks

Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `node scripts/check-tracked-secrets.mjs`.

Tests include planner/review behavior, mocked Fo OAuth/text replies, encrypted credential integrity, missed-session eligibility and quiet hours, and actual PostgreSQL SQL execution in PGlite with synthetic identities. PGlite verifies migration syntax, RLS, optimistic saves, import duplicate prevention, OAuth state consumption and request reservations. It is not hosted Supabase Auth or a live multi-instance load test.

## Live checks (not completed by automated tests)

- [ ] In the configured deployment, create account A, confirm email and sign in. Reload and restart the browser; verify the session and study data persist.
- [ ] Import existing browser data once with consent. Try importing again; ensure no duplicated attempts. Preserve the original browser copy.
- [ ] Log practice, check review recommendations, edit availability, create sessions and explicitly confirm rescheduling.
- [ ] In a second browser profile create account B. Verify B cannot see A's problems, attempts, preferences, Fo requests or connection. Attempt a save after switching accounts in another tab; it must be rejected.
- [ ] Edit the same account in two tabs. The stale revision must fail without overwriting newer data; export unsaved work before reload.
- [ ] Connect different Fo accounts for A and B. Verify HTTPS callback success, state replay rejection, correct identity, and persistence after a new server deployment. Reconnect if refresh is unsupported/revoked; never substitute another user's connection.
- [ ] Review the exact demo message and obtain explicit approval. Send once, retrieve a real reply, and verify it in the user's Fo conversation. If Fo asks a question, separately preview/confirm the answer. A tool's `working` status is not delivered/completed evidence.
- [ ] Discover the authenticated browser voice schema, create a link once, and open it. Confirm actual browser audio. Do not label it an outbound telephone call.
- [ ] Enable the scheduler only for a consenting test account. Create a real study session ending at least 15 minutes ago (or wait through the grace period), do not record practice, close all app tabs and wait for Cron. Verify a real Fo message and durable result. `net._http_response` and the Fo request history must both agree.
- [ ] Trigger the cron endpoint twice for the same missed session; verify one reservation and at most one Fo request. Simulate failure after dispatch; confirm `sending`/`unknown` is not retried.
- [ ] Repeat with quiet hours active; no message should be sent. Test a delayed run with a session older than 24 hours; it must be skipped. Test a second eligible session inside the frequency cap; no extra dispatch.
- [ ] Disable accountability before a pending action. Verify cancellation and no later dispatch. Disconnect Fo and confirm study tracking still works.
- [ ] Test mobile width, keyboard navigation, error messages and export recovery.
- [ ] Review Git diff and secret scan, obtain approval, push, obtain deployment approval, then verify the deployed URL.

Outbound phone testing is blocked until machine-verifiable recipient ownership, explicit call consent, quiet hours, cancellation and bounded frequency are implemented and verified. Only the owner's verified phone may be used for a future approved call test.

Record date, environment, actual result and evidence location for each live check; never include tokens or private call links. Failed or untested checks remain unchecked.

## Local run on 2026-11-24

- 37 automated tests passed, including all three migrations in embedded PostgreSQL.
- TypeScript and ESLint passed; the Next.js production build passed after fixing the cache-components route configuration and clearing a cached sandbox compilation error.
- Production dependency audit: zero known vulnerabilities at the time of the run. This excludes development-only dependencies.
- In an isolated browser context, recorded a practice attempt, reloaded and confirmed it persisted. At 390px width, no horizontal overflow was detected. This exercised device-only storage, not Supabase.
- Unauthenticated workspace and scheduler requests were rejected. The unconfigured companion route also rejected access.
- The Git index scan found no tracked environment files/private journal or recognized credential formats. Full Git status/diff remain blocked by missing macOS Command Line Tools.
- No real Fo message/call, hosted Supabase login, HTTPS callback, hosted scheduler execution, Git push or public deployment was performed.
