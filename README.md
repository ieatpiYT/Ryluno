# Ryluno

A technical interview study companion built with Next.js App Router and TypeScript. Today keeps practice first; Practice, Progress, and Settings provide logging, adaptive review, and study planning.

## Implemented

- Practice history, confidence-based reviews, timezone-aware study planning and confirmed rescheduling.
- Device-only mode with validated JSON backup/import.
- Optional Supabase email/password authentication and account storage. A versioned document stores problems, attempts, sessions, availability, preferences and computed review information atomically. RLS-protected views expose individual record types.
- Explicit, one-time browser-data import into an empty account; optimistic revision checks prevent conflicting saves.
- Per-user Fo OAuth with PKCE, browser-bound single-use state, encrypted server-side credentials and durable action reservations.
- Previewed/confirmed Fo text requests, asynchronous reply retrieval, and a labelled demo missed-session check-in. Browser voice requests are guarded by authenticated tool discovery and safe-link validation.
- A Supabase Cron endpoint for missed-session text check-ins, with quiet hours, cancellation, a rolling frequency cap and duplicate suppression. It is disabled by default.

## Verification boundary

This repository is **not yet a shipped, live-verified MVP**. Local unit tests and embedded PostgreSQL tests do not prove hosted Supabase login, Wajo HTTPS callback acceptance, real Fo delivery, browser voice creation, or browser-closed scheduling. Production requires the setup and live checks below.

Official Wajo documentation confirms outbound calls and conversational scheduling exist, but this integration has no verified machine-readable recipient ownership or telephone cancellation contract. Telephone reminders and Fo-native schedules are not enabled. Browser voice is a separate capability. Fo suggestions never automatically change Ryluno commitments.

## Run locally

```sh
npm install
npm run dev -- --hostname localhost --port 3000
```

Without Supabase environment variables, the original device-only workflow remains available. To use accounts, copy `.env.example` to ignored `.env.local` and follow [deployment setup](docs/deployment.md). Never commit credentials.

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
node scripts/check-tracked-secrets.mjs
```

The PostgreSQL tests use PGlite and synthetic users; Fo tests use mocked network responses. Live verification must be recorded separately.

- [Setup and deployment](docs/deployment.md)
- [Fo capabilities and security](docs/fo-integration.md)
- [Demo script](docs/demo.md)
- [Verification checklist](docs/verification.md)
