-- Run only after creating the two Vault secrets documented in docs/deployment.md.
-- Uses Supabase Cron, not Vercel Cron: compatible with Vercel Hobby cadence limits.
-- Re-running replaces this named schedule instead of creating duplicates.
do $$ begin
 perform cron.unschedule(jobid) from cron.job where jobname in ('ryluno-accountability','ryluno-expired-oauth-cleanup');
end $$;
select cron.schedule('ryluno-accountability','*/5 * * * *',$job$
 select net.http_get(
  url := (select decrypted_secret from vault.decrypted_secrets where name='ryluno_app_origin') || '/api/cron/accountability',
  headers := jsonb_build_object('Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='ryluno_cron_secret')),
  timeout_milliseconds := 60000
 );
$job$);
select cron.schedule('ryluno-expired-oauth-cleanup','17 * * * *',$job$
 delete from public.fo_oauth_flows where expires_at < now() - interval '1 hour';
$job$);
