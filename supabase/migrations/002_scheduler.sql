-- Run after 001_core.sql. This does not schedule or send anything.
-- Enable pg_cron and pg_net in the Supabase dashboard first; see docs/deployment.md.
-- The actual schedule is installed separately after the endpoint and Vault secrets exist.
create index if not exists fo_oauth_expiry on public.fo_oauth_flows(expires_at);
create index if not exists accountability_rotation on public.accountability_preferences(updated_at) where enabled;
