# Fo integration: evidence and boundaries

## Official evidence retrieved on 2026-11-24

- [OAuth authorization metadata](https://mcp.api.wajo.ai/.well-known/oauth-authorization-server): issuer `https://mcp.api.wajo.ai`, S256, authorization_code and refresh_token grants, dynamic registration, scope `mcp`, public clients (`none`). A production HTTPS callback has not been exercised.
- [MCP tools](https://wajo.ai/docs/mcp-tools.md): `/fo` is a separate account-scoped profile. `ask_fo` delegates work; `get_fo_reply` polls. `/mcp` has schedule management tools, and schedules are created conversationally. Those `/mcp` tools must not be assumed present at `/fo`.
- [Fo tasks](https://wajo.ai/help#claude-tasks): calls and other real-world actions may be delegated to Fo, and browser voice can be started on the current device.
- [Calls and texts](https://wajo.ai/help#outside-us) and [phone ownership](https://wajo.ai/help#change-phone): Fo can call supported countries; changing a profile phone requires texting a code from that phone. The reviewed `/fo` contracts do not expose a machine-verifiable ownership check to Ryluno.

| Capability | Ryluno implementation | Live verification |
| --- | --- | --- |
| Text conversation | Exact preview, explicit confirmation, asynchronous polling, confirmed replies | Real check-in and user reply verified in the local authenticated app on 2026-11-25 |
| Browser voice | Discovers `start_fo_call`, accepts only schemas allowing empty inputs, validates HTTPS Wajo output link, durable request reservation | Live schema and link creation verified; owner confirmed hearing and speaking with Fo on 2026-11-25 |
| Outbound phone call | Disabled | Official product support exists; recipient ownership, bounded execution and cancellation not verified in this integration |
| Fo-native schedule | Not enabled | General `/mcp` documentation does not establish the `/fo` scheduling/cancellation contract |
| Conditional missed-session text | Supabase Cron evaluates persisted study data, then delegates one check-in | Disabled until deployed browser-closed execution is verified |

## Production account path

`/api/companion/*` requires a Supabase-verified user. Writes require the configured application origin. A separate callback validates a browser-bound HttpOnly state cookie and atomically consumes a user-bound state row. The official MCP SDK handles PKCE and token refresh. OAuth snapshots use AES-256-GCM with the Supabase user ID as authenticated associated data. Credentials and conversation IDs stay on the server; browser history contains only that user's sanitized results.

Database locks serialize connection updates and external actions per user. Unique request keys reserve actions before dispatch. Sending is a compare-and-set transition. Uncertain delivery blocks new sends and is never automatically retried. A lost result can therefore sacrifice delivery in favor of avoiding a duplicate; reconcile it in Fo before any developer-assisted recovery. Do not delete request history to retry.

Live text schemas are checked against the previously supplied authenticated contracts before dispatch. Browser voice discovery is separate and does not prove telephone support. Voice links may be bearer-like secrets: do not share them or place them in logs. External actions requested indirectly by a model cannot be technically sandboxed by text instructions; Ryluno's check-in instructions expressly disallow outside messages, calls, purchases and connected-service changes. They are not a substitute for Wajo's permissions.

Accountability is opt-in and gated off until deployment testing. It uses a 15-minute missed-session grace period, a 24-hour expiry, timezone-aware quiet hours, a rolling frequency cap, and per-session deduplication. Turning it off cancels queued jobs. Stopping polling does not cancel Fo work that was already sent. Fo can suggest recovery plans; the user must apply and confirm any study change in Ryluno.

## Preserved local development path

The original `/api/fo/*` path remains localhost-only, guarded by `FO_DEV_ENABLED=true` and a `FO_DEV_PASSWORD` of at least 32 characters. Its callback is `http://localhost:3000/api/fo/callback`. Tokens are in memory; restart requires reconnecting. Its private `.ryluno-fo` journal preserves local duplicate protection. It is never used as a production shared account.

Existing tests cover mocked SDK authorization/PKCE, strict text schemas, local authorization, signed previews, durable duplicate suppression and asynchronous replies. New tests cover token encryption, timezone policy and embedded PostgreSQL isolation/atomicity. These are not live Wajo delivery tests.

See [deployment instructions](deployment.md) for credentials, callbacks, scheduler setup and blockers.
