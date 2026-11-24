begin;
create table public.profiles (
 user_id uuid primary key references auth.users on delete cascade,
 display_name text not null default '', created_at timestamptz not null default now()
);
-- One atomic versioned aggregate prevents partial problem/attempt/session updates.
create table public.study_documents (
 user_id uuid primary key references auth.users on delete cascade,
 data jsonb not null check (data->>'version' = '1'),
 reviews jsonb not null default '[]', revision bigint not null default 1,
 imported_at timestamptz, updated_at timestamptz not null default now()
);
create index study_documents_data on public.study_documents using gin(data);
create table public.accountability_preferences (
 user_id uuid primary key references auth.users on delete cascade,
 enabled boolean not null default false,
 method text not null default 'text' check (method in ('text')),
 timezone text not null default 'UTC', quiet_start integer not null default 21 check (quiet_start between 0 and 23),
 quiet_end integer not null default 9 check (quiet_end between 0 and 23),
 daily_limit integer not null default 1 check (daily_limit between 1 and 2),
 consent_at timestamptz, updated_at timestamptz not null default now()
);
create table public.fo_connections (
 user_id uuid primary key references auth.users on delete cascade,
 encrypted text not null, generation uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now()
);
create table public.fo_oauth_flows (
 state_hash text primary key, user_id uuid not null references auth.users on delete cascade,
 encrypted text not null, expires_at timestamptz not null
);
create table public.fo_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 dedupe_key text not null, kind text not null check (kind in ('text','voice','demo','missed')),
 status text not null default 'queued' check (status in ('queued','sending','working','complete','failed','unknown','approval_required','answered','cancelled')),
 instructions text not null, conversation_id text, result jsonb,
 session_id text, due_at timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,dedupe_key)
);
create index fo_requests_due on public.fo_requests(due_at) where status='queued';
create index fo_requests_owner_time on public.fo_requests(user_id,created_at desc);
create table public.fo_user_locks (
 user_id uuid primary key references auth.users on delete cascade, token uuid not null, expires_at timestamptz not null
);
alter table public.profiles enable row level security;
alter table public.study_documents enable row level security;
alter table public.accountability_preferences enable row level security;
alter table public.fo_connections enable row level security;
alter table public.fo_oauth_flows enable row level security;
alter table public.fo_requests enable row level security;
alter table public.fo_user_locks enable row level security;
create policy own_profile on public.profiles for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_document on public.study_documents for select to authenticated using ((select auth.uid())=user_id);
create policy own_preferences on public.accountability_preferences for select to authenticated using ((select auth.uid())=user_id);
-- Tokens, pending OAuth state, conversations and locks are server-only, with no browser policies.
revoke all on public.fo_connections, public.fo_oauth_flows, public.fo_requests, public.fo_user_locks from anon, authenticated;
revoke insert, update, delete on public.study_documents, public.accountability_preferences from anon, authenticated;
create view public.problems with (security_invoker=true) as select user_id, p->>'id' id, p as data from public.study_documents cross join lateral jsonb_array_elements(data->'problems') p;
create view public.attempts with (security_invoker=true) as select user_id, p->>'id' problem_id, a->>'id' id, a as data from public.study_documents cross join lateral jsonb_array_elements(data->'problems') p cross join lateral jsonb_array_elements(p->'attempts') a;
create view public.study_sessions with (security_invoker=true) as select user_id, s->>'id' id, s as data from public.study_documents cross join lateral jsonb_array_elements(data->'sessions') s;
create view public.adaptive_reviews with (security_invoker=true) as select user_id, r as data from public.study_documents cross join lateral jsonb_array_elements(reviews) r;
create view public.study_preferences with (security_invoker=true) as select user_id, data->'settings' as data from public.study_documents;
create function public.save_workspace(payload jsonb, expected_revision bigint, review_payload jsonb, importing boolean default false) returns bigint
language plpgsql security definer set search_path='' as $$
declare owner uuid := auth.uid(); current_row public.study_documents; next_revision bigint;
begin
 if owner is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 select * into current_row from public.study_documents where user_id=owner for update;
 if coalesce(current_row.revision,0) <> expected_revision then raise exception 'Revision conflict'; end if;
 if importing and (current_row.imported_at is not null or jsonb_array_length(coalesce(current_row.data->'problems','[]'))>0 or jsonb_array_length(coalesce(current_row.data->'sessions','[]'))>0) then raise exception 'Import requires empty account and may run once'; end if;
 next_revision := expected_revision+1;
 insert into public.study_documents(user_id,data,reviews,revision,imported_at) values(owner,payload,review_payload,next_revision,case when importing then now() end)
 on conflict(user_id) do update set data=excluded.data,reviews=excluded.reviews,revision=excluded.revision,updated_at=now(),imported_at=coalesce(study_documents.imported_at,excluded.imported_at);
 insert into public.profiles(user_id) values(owner) on conflict do nothing;
 return next_revision;
end $$;
revoke all on function public.save_workspace(jsonb,bigint,jsonb,boolean) from public, anon;
grant execute on function public.save_workspace(jsonb,bigint,jsonb,boolean) to authenticated;
create function public.acquire_fo_lock(owner uuid, lock_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 insert into public.fo_user_locks values(owner,lock_token,now()+interval '3 minutes')
 on conflict(user_id) do update set token=excluded.token,expires_at=excluded.expires_at where public.fo_user_locks.expires_at<now();
 return found;
end $$;
revoke all on function public.acquire_fo_lock(uuid,uuid) from public, anon, authenticated;
grant execute on function public.acquire_fo_lock(uuid,uuid) to service_role;
grant select on public.study_documents, public.accountability_preferences, public.problems, public.attempts, public.study_sessions, public.adaptive_reviews, public.study_preferences to authenticated;
grant select,insert,update,delete on public.profiles to authenticated;
grant all on public.profiles, public.study_documents, public.accountability_preferences, public.fo_connections, public.fo_oauth_flows, public.fo_requests, public.fo_user_locks to service_role;
commit;
