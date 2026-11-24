# Fo text accountability integration

## Verification boundary

The owner completed Ryluno’s independent website OAuth flow and supplied authenticated connection status and live tool schemas. The implemented contracts match that discovery: `ask_fo` accepts `message`, optional `conversationId` or `newConversation`; `get_fo_reply` accepts optional `conversationId` and `waitSeconds` (0–40). The adapter rechecks the live input/output schemas before every send or poll and fails closed on drift.

No real text check-in has been sent or verified end-to-end by this implementation. Unit tests use fake connections. A live test requires the owner to review and explicitly approve the exact message. Voice remains disabled; the discovered `start_fo_call` creates a browser voice link, not a phone-number call.

## Local setup and authentication

Use one local Node process and one owner, without public tunnels or shared hosting. The code requires development mode, `FO_DEV_ENABLED=true`, and `FO_DEV_PASSWORD` of at least 32 characters in ignored `.env.local`. Never use `NEXT_PUBLIC` for these values or any credentials.

Run `npm run dev -- --hostname localhost --port 3000`. In that same browser/profile, open Preferences → Fo accountability → Unlock local connection, enter the local development password, and select Connect Fo. Ryluno verifies the HttpOnly cookie before OAuth. The exact callback is `http://localhost:3000/api/fo/callback`. Complete Wajo consent and return to Preferences. Verify connection retrieves tool schemas without sending messages.

The official `@modelcontextprotocol/client` v2 OAuth provider uses dynamic client registration, public-client authentication (`none`), PKCE S256, scope `mcp`, pinned issuer/resource, and single-use state. No Copilot credentials are reused. Tokens and registration information remain server-memory-only. Restart requires unlocking and reconnecting. Local sessions expire after one hour. Disconnect clears local credentials but does not revoke Wajo consent.

Every endpoint except password login requires the local cookie. Origin/Host and development checks remain mandatory; writes require the exact matching Origin. Production fails closed. Callback behavior and guards are unchanged. Request/error logging must not expose OAuth parameters or tokens.

## Text workflow

1. Select an actual local study session. Ended scheduled sessions are described as missed. Optionally explicitly select a fresh Fo conversation; otherwise the current conversation is used.
2. Request a preview. The server freezes and signs the exact instructions, session reference and conversation choice, bound to the local login for ten minutes.
3. Read the preview, check the approval box, then select Confirm and send text. No message is sent merely by opening Preferences, preparing a draft, connecting, or refreshing saved status.
4. Working replies are polled automatically with `get_fo_reply` (`waitSeconds: 10`), with a delay between polls. Polling stops for a final reply, error, question, or after ten minutes. Keep waiting resumes read-only polling; Pause reply checking does not cancel Fo’s remote work. Reopening the panel loads saved status; Keep waiting resumes an outstanding reply.
5. Answers have their own exact preview and confirmation and continue the saved conversation. Internal conversation IDs are not exposed by the UI/API.

Fo has no structured approval flag in these tool outputs. Question/approval text detection conservatively pauses polling; it may pause on an ordinary question. SDK protocol-level input requests are never auto-approved or auto-resubmitted. Such requests require inspection in Fo directly. Text instructions forbid calls, outside messages, purchases, calendar changes and connected services; these are instructions to Fo, not a technical restriction on its account capabilities.

## Duplicate protection and recovery

A private `.ryluno-fo/requests.json` journal (ignored by Git, directory mode 700, files mode 600) records instructions, replies and private conversation references, never OAuth tokens. It is written and synced before dispatch. One initial check-in is permitted per session, with separately confirmed replies. An exclusive filesystem lock prevents concurrent operations across requests/processes. Active, unresolved-approval and uncertain-delivery requests block unrelated new sends. Duplicate tickets return saved status, never resubmit. The adapter also refuses a second `ask_fo` dispatch and disables automatic input fulfilment and transport reconnection retries.

Do not delete the journal to retry a message: that removes duplicate protection. A crash may leave `operation.lock` or a `sending` record. Sending stays blocked. Inspect Fo directly to establish whether the message ran before developer-assisted reconciliation; never automatically remove a stale lock or resend uncertain delivery. Poll failures can be resumed without resending the original message. Keep the same single Wajo account for this local installation.

Browser planner storage, onboarding, scheduling and review data are unchanged (`algopilot.v1`). The journal is separate from browser backups; treat it as private local data.

## Validation

Run TypeScript (`npx tsc --noEmit`), `npm run lint`, `npm test`, and `npm run build`. Tests cover local authorization, cookie verification, mocked OAuth/PKCE, failed connections, strict schema drift, signed approval binding, durable and concurrent duplicate suppression, ambiguous sends, approval pauses and asynchronous replies. They do not establish live message delivery.

SDK references: [OAuth](https://ts.sdk.modelcontextprotocol.io/v2/clients/oauth.md), [calling tools](https://ts.sdk.modelcontextprotocol.io/v2/clients/calling.md). Installed v2 declarations were also consulted for manual input-required handling.
