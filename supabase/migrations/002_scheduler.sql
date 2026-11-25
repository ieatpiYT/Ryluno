-- Run after 001_core.sql. This does not schedule or send anything.
-- This index migration needs no extensions. Enable pg_cron and pg_net only
-- before installing the separate scheduler; see docs/deployment.md.
-- The actual schedule is installed separately after the endpoint and Vault secrets exist.
create index if not exists fo_oauth_expiry on public.fo_oauth_flows(expires_at);
create index if not exists accountability_rotation on public.accountability_preferences(updated_at) where enabled;
