begin;
-- RLS does not protect TRUNCATE. Limit browser roles to the exact supported operations.
revoke all on public.study_documents, public.accountability_preferences from anon, authenticated;
grant select on public.study_documents, public.accountability_preferences to authenticated;
revoke truncate, references, trigger on public.profiles from anon, authenticated;

create function public.set_accountability_preferences(owner uuid, active boolean, zone text, quiet_from integer, quiet_until integer, maximum integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Invalid timezone'; end if;
 insert into public.accountability_preferences(user_id,enabled,timezone,quiet_start,quiet_end,daily_limit,consent_at)
 values(owner,active,zone,quiet_from,quiet_until,maximum,case when active then now() end)
 on conflict(user_id) do update set enabled=excluded.enabled, timezone=excluded.timezone,
 quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,daily_limit=excluded.daily_limit,
 consent_at=excluded.consent_at,updated_at=now();
 if not active then
  update public.fo_requests set status='cancelled',updated_at=now() where user_id=owner and status='queued';
 end if;
end $$;

create function public.disconnect_fo(owner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from public.fo_connections where user_id=owner;
 delete from public.fo_oauth_flows where user_id=owner;
 update public.accountability_preferences set enabled=false,consent_at=null,updated_at=now() where user_id=owner;
 update public.fo_requests set status='cancelled',updated_at=now() where user_id=owner and status='queued';
end $$;
revoke all on function public.set_accountability_preferences(uuid,boolean,text,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.disconnect_fo(uuid) from public,anon,authenticated;
grant execute on function public.set_accountability_preferences(uuid,boolean,text,integer,integer,integer) to service_role;
grant execute on function public.disconnect_fo(uuid) to service_role;
commit;
