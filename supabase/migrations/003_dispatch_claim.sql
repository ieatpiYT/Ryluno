begin;
alter table public.fo_requests add column source_revision bigint;
-- Claim and cancellation are transactional. Study edits after this boundary cannot
-- recall already dispatched work, but stale queued events never send.
create function public.claim_fo_request(owner uuid, request_id uuid) returns setof public.fo_requests
language plpgsql security definer set search_path='' as $$
declare item public.fo_requests; doc public.study_documents; prefs public.accountability_preferences; local_hour integer; recent_count integer;
begin
 select * into item from public.fo_requests where user_id=owner and id=request_id for update;
 if not found or item.status <> 'queued' then return; end if;
 if item.kind='missed' then
  select * into doc from public.study_documents where user_id=owner for share;
  select * into prefs from public.accountability_preferences where user_id=owner for share;
  if doc.user_id is null or prefs.user_id is null or not prefs.enabled or prefs.consent_at is null or item.source_revision is distinct from doc.revision then
   update public.fo_requests set status='cancelled',updated_at=now() where id=request_id;
   return;
  end if;
  local_hour := extract(hour from now() at time zone prefs.timezone);
  if prefs.quiet_start=prefs.quiet_end or
    (prefs.quiet_start<prefs.quiet_end and local_hour>=prefs.quiet_start and local_hour<prefs.quiet_end) or
    (prefs.quiet_start>prefs.quiet_end and (local_hour>=prefs.quiet_start or local_hour<prefs.quiet_end)) then
   update public.fo_requests set status='cancelled',updated_at=now() where id=request_id;
   return;
  end if;
  if not exists(select 1 from jsonb_array_elements(doc.data->'sessions') s where s->>'id'=item.session_id and s->>'status'='scheduled' and (s->>'end')::timestamptz<=now()-interval '15 minutes' and (s->>'end')::timestamptz>now()-interval '24 hours') then
   update public.fo_requests set status='cancelled',updated_at=now() where id=request_id;
   return;
  end if;
  select count(*) into recent_count from public.fo_requests where user_id=owner and id<>request_id and created_at>now()-interval '24 hours' and status<>'cancelled';
  if recent_count>=prefs.daily_limit then
   update public.fo_requests set status='cancelled',updated_at=now() where id=request_id;
   return;
  end if;
 end if;
 return query update public.fo_requests set status='sending',updated_at=now() where id=request_id and user_id=owner and status='queued' returning *;
end $$;
revoke all on function public.claim_fo_request(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_fo_request(uuid,uuid) to service_role;
commit;
