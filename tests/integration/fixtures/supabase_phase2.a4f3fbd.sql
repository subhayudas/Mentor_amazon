-- MentorConnect — phase 2 tables. Run after supabase_setup_v2.sql.
--
--   mentee_favorites    a mentee's saved mentors
--   activity_events     append-only audit feed (every state change, app + server)
--   booking_reminders   one row per reminder actually sent (cron idempotency)
--   cal_webhook_events  one row per Cal.com webhook delivery processed (idempotency)
--
-- RLS: mentees own their favourites; anyone signed in can append events that
-- name themselves as actor and read the events they are listed in; admins
-- read everything; reminder and webhook tables are service-role only.

-- ---------------------------------------------------------------- favourites
create table if not exists public.mentee_favorites (
  id          uuid primary key default gen_random_uuid(),
  mentee_id   uuid not null references public.mentees(id) on delete cascade,
  mentor_id   uuid not null references public.mentors(id) on delete cascade,
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

-- The ids a signed-in user may act as: their mentor row and/or mentee row.
create or replace function public.my_profile_ids()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id::text), '{}')
  from (
    select id from public.mentors where lower(email) = lower(auth.jwt() ->> 'email')
    union all
    select id from public.mentees where lower(email) = lower(auth.jwt() ->> 'email')
  ) p;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where lower(email) = lower(auth.jwt() ->> 'email') and user_type = 'admin');
$$;

drop policy if exists "events: append as self" on public.activity_events;
create policy "events: append as self" on public.activity_events
  for insert
  with check (actor_id = any (public.my_profile_ids()) or public.is_admin());

drop policy if exists "events: read mine" on public.activity_events;
create policy "events: read mine" on public.activity_events
  for select
  using (visible_to && public.my_profile_ids() or public.is_admin());

-- Append-only: no update/delete policies exist, so RLS denies both for everyone but service role.

-- ---------------------------------------------------------------- reminders (cron)
create table if not exists public.booking_reminders (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  kind        text not null check (kind in ('24h', '1h')),
  sent_at     timestamptz not null default now(),
  channels    text[] not null default '{}',
  unique (booking_id, kind)
);
alter table public.booking_reminders enable row level security;
-- service role only (no policies).

-- ---------------------------------------------------------------- Cal.com webhook idempotency
create table if not exists public.cal_webhook_events (
  id           text primary key,             -- trigger + booking uid (+ updated_at) from the payload
  trigger      text not null,
  booking_uid  text,
  received_at  timestamptz not null default now(),
  outcome      text
);
alter table public.cal_webhook_events enable row level security;
-- service role only (no policies).
