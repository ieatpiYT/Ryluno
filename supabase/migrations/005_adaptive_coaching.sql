begin;
alter table public.fo_requests drop constraint if exists fo_requests_kind_check;
alter table public.fo_requests add constraint fo_requests_kind_check check (kind in ('text','voice','demo','missed','coaching'));
create table public.conceptual_reviews (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 topic text not null, question text not null, answer text not null, score integer not null check (score between 0 and 3),
 passed boolean not null, source text not null check (source in ('fo-text','browser-voice')), interval_days numeric not null default 1, due_at timestamptz not null default now(), created_at timestamptz not null default now(), unique(user_id, question, created_at)
);
alter table public.fo_requests add column if not exists coaching_topic text;
alter table public.fo_requests add column if not exists coaching_question text;
alter table public.fo_requests add column if not exists coaching_expected text;
alter table public.fo_requests add column if not exists coaching_rubric jsonb;
alter table public.conceptual_reviews enable row level security;
create policy own_conceptual_reviews on public.conceptual_reviews for select to authenticated using ((select auth.uid())=user_id);
grant select on public.conceptual_reviews to authenticated;
grant all on public.conceptual_reviews to service_role;
commit;
