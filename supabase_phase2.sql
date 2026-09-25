-- MentorConnect — phase 2 tables.
--
-- APPLY ORDER: supabase_setup_v2.sql → THIS FILE → migrations/0002_production_readiness.sql
--              → migrations/0003_restrict_legacy_writes.sql (after the new client is deployed).
-- Re-running this file is safe; re-run migrations/0002 (and 0003 if it was applied) afterwards.
-- migrations/0002 also repairs a database where an older copy of this file was run (uuid id
-- columns, missing FKs) and creates these tables if they are missing.
--
--   mentee_favorites    a mentee's saved mentors
--   activity_events     append-only audit feed (booking lifecycle rows come from a DB trigger)
--   booking_reminders   one row per reminder actually sent (cron idempotency)
--   cal_webhook_events  one row per Cal.com webhook delivery processed (idempotency)
--
-- Ids of the base tables (mentors, mentees, bookings) are `character varying`, so every
-- column that references them is varchar too (an older copy said uuid, which cannot
-- reference a varchar key).
--
-- RLS: mentees own their favourites; a signed-in user can append an event only as
-- themselves and only visible to themselves; users read the events they are listed in;
-- admins read everything; reminder and webhook tables are service-role only.
-- is_admin() is NOT defined here: the uid-based version in supabase_setup_v2.sql is canonical.

-- ---------------------------------------------------------------- favourites
create table if not exists public.mentee_favorites (
  id          uuid primary key default gen_random_uuid(),
  mentee_id   varchar not null references public.mentees(id) on delete cascade,
  mentor_id   varchar not null references public.mentors(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (mentee_id, mentor_id)
);
create index if not exists mentee_favorites_mentee_idx on public.mentee_favorites (mentee_id);

alter table public.mentee_favorites enable row level security;

drop policy if exists "favorites: own rows" on public.mentee_favorites;
create policy "favorites: own rows" on public.mentee_favorites
  for all
  using (mentee_id in (select id from public.mentees where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (mentee_id in (select id from public.mentees where lower(email) = lower(auth.jwt() ->> 'email')));

-- ---------------------------------------------------------------- activity feed
create table if not exists public.activity_events (
  id            uuid primary key default gen_random_uuid(),
  actor_type    text not null check (actor_type in ('mentor', 'mentee', 'admin', 'system')),
  actor_id      text,
  actor_name    text,
  type          text not null,
  subject_type  text check (subject_type in ('booking', 'mentor', 'mentee', 'favorite', 'settings')),
  subject_id    text,
  visible_to    text[] not null default '{}',
  summary       text not null,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists activity_events_created_idx on public.activity_events (created_at desc);
create index if not exists activity_events_visible_idx on public.activity_events using gin (visible_to);

alter table public.activity_events enable row level security;

-- The ids a signed-in user may act as: mentor and/or mentee rows under their email, plus the
-- profile an admin linked to their account (users.profile_id). Same body as migrations/0002.
create or replace function public.my_profile_ids()
returns text[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct p.id), '{}'::text[])
  from (
    select m.id::text as id from public.mentors m
      where public.current_email() is not null and lower(m.email) = public.current_email()
    union all
    select me.id::text from public.mentees me
      where public.current_email() is not null and lower(me.email) = public.current_email()
    union all
    select u.profile_id::text from public.users u
      where auth.uid() is not null and u.id = auth.uid()::text and u.profile_id is not null
  ) p;
$$;
revoke all on function public.my_profile_ids() from public;
grant execute on function public.my_profile_ids() to authenticated, service_role;

-- A user may only post into their own feed, with bounded text; booking lifecycle rows are
-- written by the bookings_activity_events trigger (migrations/0002), which bypasses this policy.
-- Same policy as migrations/0002 §3.
drop policy if exists "events: append as self" on public.activity_events;
create policy "events: append as self" on public.activity_events
  for insert
  with check ((public.is_admin() or (actor_id = any (public.my_profile_ids()) and visible_to <@ public.my_profile_ids()))
              and length(summary) <= 500 and length(type) <= 64 and length(coalesce(actor_name, '')) <= 200
              and pg_column_size(meta) <= 8192);

drop policy if exists "events: read mine" on public.activity_events;
create policy "events: read mine" on public.activity_events
  for select
  using (visible_to && public.my_profile_ids() or public.is_admin());

-- Append-only: no update/delete policies exist, so RLS denies both for everyone but service role.

-- ---------------------------------------------------------------- reminders (cron)
create table if not exists public.booking_reminders (
  id          uuid primary key default gen_random_uuid(),
  booking_id  varchar not null references public.bookings(id) on delete cascade,
  kind        text not null check (kind in ('24h', '1h')),
  sent_at     timestamptz not null default now(),
  channels    text[] not null default '{}',
  unique (booking_id, kind)
);
alter table public.booking_reminders enable row level security;
-- service role only (no policies).

-- ---------------------------------------------------------------- Cal.com webhook idempotency
create table if not exists public.cal_webhook_events (
  id           text primary key,             -- delivery id built by api/webhooks/cal.ts
  trigger      text not null,
  booking_uid  text,
  received_at  timestamptz not null default now(),
  outcome      text
);
alter table public.cal_webhook_events enable row level security;
-- service role only (no policies). migrations/0002 adds mentor_id, payload_sha256, booking_id, processed_at.
