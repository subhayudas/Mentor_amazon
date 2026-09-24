-- =============================================================================
-- 0002_production_readiness — EXPAND step of the production-readiness release
-- =============================================================================
-- Purpose
--   * Repairs the phase-2 tables whatever state they are in (varchar FKs, missing tables).
--   * Canonical uid-based is_admin(); my_profile_ids() that includes users.profile_id.
--   * id / created_at defaults on the base tables; booking constraints; unique Cal uid.
--   * A booking guard whose Cal/scheduling rules can be tightened by 0003 (rollout switch).
--   * The booking audit trail as a DB trigger (activity_events), with a tightened insert policy.
--   * Server-side request RPCs (anonymous via /api/requests, signed-in via create_my_booking_request),
--     programme-managed mentors (admins are notified), transactional availability.
--   * Cal.com sync: per-mentor webhook secrets and one transactional cal_apply_event RPC.
--   * The `uploads` storage bucket with size and MIME limits.
--
-- Expand / contract
--   This file only ADDS. After it runs, the client that is live today (origin/main a4f3fbd) keeps
--   working unchanged: anonymous get_or_create_mentee + direct bookings insert +
--   notify_booking_event('booking_request'), the client-side confirm that writes scheduled_at /
--   cal_event_uri / status, rating on past sessions, and every other path. The restrictions
--   that would break it live in migrations/0003_restrict_legacy_writes.sql, which runs only
--   AFTER the new client is deployed.
--
-- Prerequisites
--   supabase_setup_v2.sql (and supabase_phase2.sql, although this file repairs or creates the
--   phase-2 tables when that step was skipped or ran from an older copy).
--
-- Apply
--   Paste the whole file into the Supabase SQL editor and run it once. It is one transaction:
--   if any statement fails (every pre-check raises a readable message naming the offending
--   rows), nothing is applied. It is idempotent: re-running it is a no-op, and it MUST be
--   re-run (followed by 0003 if 0003 was applied) after any re-run of supabase_setup_v2.sql or
--   supabase_phase2.sql. It never drops or renames a column or a table.
--
-- Order of the full release: v2 → phase2 → 0002 → deploy the client → 0003 → (optional) 0004.
-- =============================================================================

BEGIN;

-- =============================================================================
-- §0 PRECONDITIONS
-- =============================================================================
DO $$
DECLARE
  v_problems text[] := '{}';
BEGIN
  IF to_regprocedure('public.is_privileged()') IS NULL THEN
    v_problems := v_problems || 'public.is_privileged() is missing: run supabase_setup_v2.sql first';
  END IF;
  IF to_regclass('public.approved_users') IS NULL THEN
    v_problems := v_problems || 'public.approved_users is missing: run supabase_setup_v2.sql first';
  END IF;
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'mentors' AND column_name = 'id') IS DISTINCT FROM 'character varying' THEN
    v_problems := v_problems || 'public.mentors.id must be character varying (the drizzle schema in shared/schema.ts)';
  END IF;
  IF to_regnamespace('extensions') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto' AND extnamespace = 'extensions'::regnamespace) THEN
    v_problems := v_problems || 'the pgcrypto extension must be installed in schema "extensions" (Supabase default)';
  END IF;
  IF to_regclass('storage.buckets') IS NULL THEN
    v_problems := v_problems || 'storage.buckets is missing: this file targets a Supabase database';
  END IF;
  IF cardinality(v_problems) > 0 THEN
    RAISE EXCEPTION '0002 preconditions failed: %', array_to_string(v_problems, '; ');
  END IF;
END $$;


-- =============================================================================
-- §1 LEDGER AND ROLLOUT SWITCH
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  note       text
);
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schema_migrations FROM anon, authenticated;

-- One row per switch. 'legacy_booking_writes' = 'allowed' keeps the pre-release client working
-- (it writes scheduled_at / cal_event_uri / status itself and rates past sessions);
-- migrations/0003 sets it to 'blocked'. Inserted only when absent, so re-running this file
-- after 0003 never re-opens the legacy writes. Read by guard_booking_update() (§7).
CREATE TABLE IF NOT EXISTS public.mc_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mc_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mc_settings FROM anon, authenticated;
INSERT INTO public.mc_settings (key, value) VALUES ('legacy_booking_writes', 'allowed')
ON CONFLICT (key) DO NOTHING;


-- =============================================================================
-- §2 PHASE-2 REPAIR (tables, varchar FKs, policies, Cal delivery columns)
-- =============================================================================
-- Policies that reference the FK columns must go before a column type can change; they are
-- recreated below.
DO $$
BEGIN
  IF to_regclass('public.mentee_favorites') IS NOT NULL THEN
    DROP POLICY IF EXISTS "favorites: own rows" ON public.mentee_favorites;
  END IF;
  IF to_regclass('public.activity_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS "events: append as self" ON public.activity_events;
    DROP POLICY IF EXISTS "events: read mine" ON public.activity_events;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.mentee_favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentee_id   varchar NOT NULL REFERENCES public.mentees (id) ON DELETE CASCADE,
  mentor_id   varchar NOT NULL REFERENCES public.mentors (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mentee_id, mentor_id)
);
CREATE INDEX IF NOT EXISTS mentee_favorites_mentee_idx ON public.mentee_favorites (mentee_id);
ALTER TABLE public.mentee_favorites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.activity_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type    text NOT NULL CHECK (actor_type IN ('mentor', 'mentee', 'admin', 'system')),
  actor_id      text,
  actor_name    text,
  type          text NOT NULL,
  subject_type  text CHECK (subject_type IN ('booking', 'mentor', 'mentee', 'favorite', 'settings')),
  subject_id    text,
  visible_to    text[] NOT NULL DEFAULT '{}',
  summary       text NOT NULL,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_events_created_idx ON public.activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_visible_idx ON public.activity_events USING gin (visible_to);
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.booking_reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  varchar NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('24h', '1h')),
  sent_at     timestamptz NOT NULL DEFAULT now(),
  channels    text[] NOT NULL DEFAULT '{}',
  UNIQUE (booking_id, kind)
);
ALTER TABLE public.booking_reminders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cal_webhook_events (
  id           text PRIMARY KEY,
  trigger      text NOT NULL,
  booking_uid  text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  outcome      text
);
ALTER TABLE public.cal_webhook_events ENABLE ROW LEVEL SECURITY;

-- uuid-typed reference columns (an older supabase_phase2.sql, or a hand-edited project) become
-- varchar; missing FKs are added. Values that reference nothing abort the file with their ids.
DO $$
DECLARE
  r record;
  c record;
  v_orphans text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('mentee_favorites',  'mentee_id',  'mentees',  'mentee_favorites_mentee_id_fkey'),
      ('mentee_favorites',  'mentor_id',  'mentors',  'mentee_favorites_mentor_id_fkey'),
      ('booking_reminders', 'booking_id', 'bookings', 'booking_reminders_booking_id_fkey')
    ) AS t (tbl, col, ref, fk)
  LOOP
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.col) IS DISTINCT FROM 'character varying' THEN
      FOR c IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
        WHERE con.conrelid = format('public.%I', r.tbl)::regclass AND con.contype = 'f' AND a.attname = r.col
      LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.tbl, c.conname);
      END LOOP;
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE varchar USING %I::text', r.tbl, r.col, r.col);
      RAISE NOTICE '0002: public.%.% converted to varchar', r.tbl, r.col;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
      WHERE con.conrelid = format('public.%I', r.tbl)::regclass AND con.contype = 'f'
        AND con.confrelid = format('public.%I', r.ref)::regclass AND a.attname = r.col
    ) THEN
      EXECUTE format(
        'SELECT string_agg(DISTINCT t.%1$I::text, '', '') FROM (SELECT %1$I FROM public.%2$I x
           WHERE x.%1$I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.%3$I y WHERE y.id = x.%1$I) LIMIT 50) t',
        r.col, r.tbl, r.ref) INTO v_orphans;
      IF v_orphans IS NOT NULL THEN
        RAISE EXCEPTION '0002 pre-check failed: public.%.% has values with no row in public.%: %', r.tbl, r.col, r.ref, v_orphans
          USING HINT = 'Delete or fix those rows, then run the file again.';
      END IF;
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I (id) ON DELETE CASCADE',
                     r.tbl, r.fk, r.col, r.ref);
      RAISE NOTICE '0002: added foreign key %', r.fk;
    END IF;
  END LOOP;
END $$;

-- Cal.com delivery log: which mentor's webhook, which booking, payload fingerprint.
ALTER TABLE public.cal_webhook_events ADD COLUMN IF NOT EXISTS mentor_id varchar;
ALTER TABLE public.cal_webhook_events ADD COLUMN IF NOT EXISTS payload_sha256 text;
ALTER TABLE public.cal_webhook_events ADD COLUMN IF NOT EXISTS booking_id varchar;
ALTER TABLE public.cal_webhook_events ADD COLUMN IF NOT EXISTS processed_at timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS cal_webhook_events_mentor_idx ON public.cal_webhook_events (mentor_id, received_at DESC);


-- =============================================================================
-- §3 HELPERS (canonical definitions; supabase_phase2.sql no longer defines is_admin)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE auth.uid() IS NOT NULL AND u.id = auth.uid()::text AND u.user_type = 'admin'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- Mentor and mentee rows under the caller's email, plus the profile an admin linked to the
-- account (users.profile_id). Same body as supabase_phase2.sql.
CREATE OR REPLACE FUNCTION public.my_profile_ids()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
REVOKE ALL ON FUNCTION public.my_profile_ids() FROM PUBLIC;
-- anon keeps EXECUTE until 0003 revokes it (the activity policies below are evaluated for any
-- role that still has table privileges); it only ever returns '{}' for anon.
GRANT EXECUTE ON FUNCTION public.my_profile_ids() TO anon, authenticated, service_role;

-- Phase-2 policies (favourites unchanged; the events insert policy is tightened: a user can
-- only post into their own feed, visible only to themselves).
CREATE POLICY "favorites: own rows" ON public.mentee_favorites
  FOR ALL
  USING (mentee_id IN (SELECT id FROM public.mentees WHERE lower(email) = lower(auth.jwt() ->> 'email')))
  WITH CHECK (mentee_id IN (SELECT id FROM public.mentees WHERE lower(email) = lower(auth.jwt() ->> 'email')));
CREATE POLICY "events: append as self" ON public.activity_events
  FOR INSERT
  WITH CHECK (public.is_admin() OR (actor_id = ANY (public.my_profile_ids()) AND visible_to <@ public.my_profile_ids()));
CREATE POLICY "events: read mine" ON public.activity_events
  FOR SELECT
  USING (visible_to && public.my_profile_ids() OR public.is_admin());


-- =============================================================================
-- §4 DEFAULTS (server-side writers no longer have to invent ids and timestamps)
-- =============================================================================
ALTER TABLE public.bookings
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN created_at SET DEFAULT timezone('utc', now());
ALTER TABLE public.notifications
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN created_at SET DEFAULT timezone('utc', now());
ALTER TABLE public.mentees
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN created_at SET DEFAULT timezone('utc', now());
ALTER TABLE public.mentor_activity_log
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN created_at SET DEFAULT timezone('utc', now());
ALTER TABLE public.booking_notes
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN created_at SET DEFAULT timezone('utc', now());
ALTER TABLE public.mentor_tasks
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN created_at SET DEFAULT timezone('utc', now());
ALTER TABLE public.mentor_availability
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN created_at SET DEFAULT timezone('utc', now());
ALTER TABLE public.mentors
  ALTER COLUMN created_at SET DEFAULT timezone('utc', now()),
  ALTER COLUMN updated_at SET DEFAULT timezone('utc', now());


-- =============================================================================
-- §5 BOOKINGS: Cal columns, integrity constraints, unique Cal uid
-- =============================================================================
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cal_status text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cal_requested_start timestamp;  -- UTC wall-clock, like the other columns
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS canceled_by text;

-- Pre-checks: stop with the offending values rather than half-apply.
DO $$
DECLARE
  v text;
BEGIN
  SELECT string_agg(format('%s (%s rows)', d.cal_event_uri, d.n), ', ') INTO v
  FROM (SELECT cal_event_uri, count(*) AS n FROM public.bookings
        WHERE cal_event_uri IS NOT NULL GROUP BY 1 HAVING count(*) > 1 ORDER BY 1 LIMIT 50) d;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION '0002 pre-check failed: duplicate bookings.cal_event_uri values: %', v
      USING HINT = 'Keep one booking per Cal.com uid (set cal_event_uri = NULL on the others), then run the file again.';
  END IF;

  SELECT string_agg(format('%s (%s rows)', d.status, d.n), ', ') INTO v
  FROM (SELECT status, count(*) AS n FROM public.bookings
        WHERE status IS NULL OR status NOT IN ('pending', 'accepted', 'rejected', 'confirmed', 'completed', 'canceled')
        GROUP BY 1 ORDER BY 1) d;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION '0002 pre-check failed: bookings.status values outside the six statuses: %', v;
  END IF;

  SELECT string_agg(format('%s (mentee_rating=%s, mentor_rating=%s)', id, mentee_rating, mentor_rating), ', ') INTO v
  FROM (SELECT id, mentee_rating, mentor_rating FROM public.bookings
        WHERE mentee_rating NOT BETWEEN 1 AND 5 OR mentor_rating NOT BETWEEN 1 AND 5 ORDER BY id LIMIT 50) d;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION '0002 pre-check failed: bookings with a rating outside 1..5: %', v;
  END IF;

  SELECT string_agg(format('%s (cal_status=%s, canceled_by=%s)', id, cal_status, canceled_by), ', ') INTO v
  FROM (SELECT id, cal_status, canceled_by FROM public.bookings
        WHERE cal_status NOT IN ('requested', 'accepted', 'rejected', 'cancelled')
           OR canceled_by NOT IN ('mentor', 'mentee', 'admin', 'cal') ORDER BY id LIMIT 50) d;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION '0002 pre-check failed: bookings with an unknown cal_status or canceled_by: %', v;
  END IF;
END $$;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'confirmed', 'completed', 'canceled')) NOT VALID;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_status_check;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_mentee_rating_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_mentee_rating_check
  CHECK (mentee_rating IS NULL OR mentee_rating BETWEEN 1 AND 5) NOT VALID;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_mentee_rating_check;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_mentor_rating_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_mentor_rating_check
  CHECK (mentor_rating IS NULL OR mentor_rating BETWEEN 1 AND 5) NOT VALID;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_mentor_rating_check;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_cal_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_cal_status_check
  CHECK (cal_status IS NULL OR cal_status IN ('requested', 'accepted', 'rejected', 'cancelled')) NOT VALID;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_cal_status_check;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_canceled_by_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_canceled_by_check
  CHECK (canceled_by IS NULL OR canceled_by IN ('mentor', 'mentee', 'admin', 'cal')) NOT VALID;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_canceled_by_check;

-- One booking per Cal.com booking uid (a reschedule moves the uid on the same row).
CREATE UNIQUE INDEX IF NOT EXISTS bookings_cal_event_uri_unique ON public.bookings (cal_event_uri)
  WHERE cal_event_uri IS NOT NULL;


-- =============================================================================
-- §6 MENTORS: programme-managed rows (the featured five, migrations/0004)
-- =============================================================================
ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS managed_by_programme boolean NOT NULL DEFAULT false;


-- =============================================================================
-- §7 BOOKING GUARD (mirrored character for character in supabase_setup_v2.sql)
-- =============================================================================
-- Non-privileged callers (the booking's mentor or mentee through PostgREST):
--   * keep every v2 rule (immutable parties, role-bound status transitions, who writes which
--     rating, only the mentor records duration and country);
--   * may never write cal_status, cal_requested_start or canceled_by (the scheduler's columns);
--   * once mc_settings.legacy_booking_writes = 'blocked' (migrations/0003): may not write
--     scheduled_at or cal_event_uri, a mentee may not move accepted → confirmed (scheduling
--     goes through record_cal_booking_from_embed / the Cal.com webhook), and ratings and
--     feedback can only be left once the booking is completed.
-- Admins, the service role and trusted RPCs (mc.internal_write = 'on', never settable through
-- PostgREST) skip the checks. A client cancel is stamped with canceled_by; a completed session
-- without a country takes the mentor's.
CREATE OR REPLACE FUNCTION public.guard_booking_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_mentor boolean;
  v_mentee boolean;
  v_legacy boolean;
BEGIN
  IF NOT (public.is_privileged() OR coalesce(current_setting('mc.internal_write', true), '') = 'on') THEN
    v_mentor := public.owns_mentor(OLD.mentor_id);
    v_mentee := public.owns_mentee(OLD.mentee_id);
    v_legacy := coalesce((SELECT s.value = 'allowed' FROM public.mc_settings s WHERE s.key = 'legacy_booking_writes'), false);
    IF NEW.mentor_id IS DISTINCT FROM OLD.mentor_id OR NEW.mentee_id IS DISTINCT FROM OLD.mentee_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'booking parties are immutable';
    END IF;
    -- A self-booking (the caller owns both the mentor and the mentee profile) can only be
    -- canceled: it never becomes a session and never carries a rating or feedback, so nobody
    -- can rate themselves into the public average_rating.
    IF v_mentor AND v_mentee
       AND ((NEW.status IS DISTINCT FROM OLD.status AND NEW.status IS DISTINCT FROM 'canceled')
            OR NEW.mentee_rating IS DISTINCT FROM OLD.mentee_rating OR NEW.mentee_feedback IS DISTINCT FROM OLD.mentee_feedback
            OR NEW.mentor_rating IS DISTINCT FROM OLD.mentor_rating OR NEW.mentor_feedback IS DISTINCT FROM OLD.mentor_feedback) THEN
      RAISE EXCEPTION 'forbidden_self_booking' USING ERRCODE = '42501', DETAIL = 'a booking with yourself can only be canceled';
    END IF;
    IF NOT v_mentor
       AND (NEW.session_duration_minutes IS DISTINCT FROM OLD.session_duration_minutes
            OR NEW.country IS DISTINCT FROM OLD.country) THEN
      RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'only the mentor records session duration and country';
    END IF;
    -- Status transitions are role-bound. A mentee may only cancel (and, while legacy writes
    -- are allowed, confirm an accepted request after scheduling); accepting, rejecting and
    -- completing is the mentor's call.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF v_mentor THEN
        IF NOT (
          (OLD.status = 'pending'   AND NEW.status IN ('accepted', 'rejected', 'canceled')) OR
          (OLD.status = 'accepted'  AND NEW.status IN ('confirmed', 'completed', 'canceled')) OR
          (OLD.status = 'confirmed' AND NEW.status IN ('completed', 'canceled'))
        ) THEN
          RAISE EXCEPTION 'forbidden_status_transition' USING ERRCODE = '42501',
            DETAIL = format('mentor may not move a booking from %s to %s', OLD.status, NEW.status);
        END IF;
      ELSE
        IF NOT (
          (OLD.status IN ('pending', 'accepted', 'confirmed') AND NEW.status = 'canceled') OR
          (v_legacy AND OLD.status = 'accepted' AND NEW.status = 'confirmed')
        ) THEN
          RAISE EXCEPTION 'forbidden_status_transition' USING ERRCODE = '42501',
            DETAIL = format('mentee may not move a booking from %s to %s', OLD.status, NEW.status);
        END IF;
      END IF;
    END IF;
    -- Each side rates the other; nobody edits the rating written about them.
    IF v_mentor AND NOT v_mentee
       AND (NEW.mentee_rating IS DISTINCT FROM OLD.mentee_rating OR NEW.mentee_feedback IS DISTINCT FROM OLD.mentee_feedback) THEN
      RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'only the mentee writes mentee_rating/mentee_feedback';
    END IF;
    IF v_mentee AND NOT v_mentor
       AND (NEW.mentor_rating IS DISTINCT FROM OLD.mentor_rating OR NEW.mentor_feedback IS DISTINCT FROM OLD.mentor_feedback) THEN
      RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'only the mentor writes mentor_rating/mentor_feedback';
    END IF;
    -- Scheduling columns belong to Cal.com sync (webhook and record_cal_booking_from_embed).
    IF NEW.cal_status IS DISTINCT FROM OLD.cal_status
       OR NEW.cal_requested_start IS DISTINCT FROM OLD.cal_requested_start
       OR NEW.canceled_by IS DISTINCT FROM OLD.canceled_by
       OR (NOT v_legacy AND (NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
                             OR NEW.cal_event_uri IS DISTINCT FROM OLD.cal_event_uri)) THEN
      RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'scheduling columns are written by Cal.com sync only';
    END IF;
    -- Ratings and feedback describe a session that took place.
    IF NOT v_legacy AND OLD.status IS DISTINCT FROM 'completed'
       AND (NEW.mentee_rating IS DISTINCT FROM OLD.mentee_rating OR NEW.mentee_feedback IS DISTINCT FROM OLD.mentee_feedback
            OR NEW.mentor_rating IS DISTINCT FROM OLD.mentor_rating OR NEW.mentor_feedback IS DISTINCT FROM OLD.mentor_feedback) THEN
      RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'ratings and feedback can be left once the session is completed';
    END IF;
  END IF;
  IF NEW.status = 'canceled' AND OLD.status IS DISTINCT FROM 'canceled' AND NEW.canceled_by IS NULL
     AND NOT public.is_service_context() THEN
    NEW.canceled_by := CASE
      WHEN public.owns_mentor(OLD.mentor_id) THEN 'mentor'
      WHEN public.owns_mentee(OLD.mentee_id) THEN 'mentee'
      WHEN public.is_admin() THEN 'admin'
    END;
  END IF;
  IF NEW.status = 'completed' AND nullif(trim(coalesce(NEW.country, '')), '') IS NULL THEN
    SELECT m.country INTO NEW.country FROM public.mentors m WHERE m.id = NEW.mentor_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bookings_guard_update ON public.bookings;
CREATE TRIGGER bookings_guard_update BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_update();
REVOKE ALL ON FUNCTION public.guard_booking_update() FROM PUBLIC, anon, authenticated, service_role;


-- =============================================================================
-- §8 BOOKING AUDIT TRAIL (the single writer of booking lifecycle rows in activity_events)
-- =============================================================================
-- At most one activity_events row per booking row change. meta carries everything the feed
-- needs to render a localized line; summary is the English fallback.
CREATE OR REPLACE FUNCTION public.bookings_activity_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cal         boolean := coalesce(current_setting('mc.change_source', true), '') = 'cal';
  v_type        text;
  v_from        text;
  v_actor_type  text := 'system';
  v_actor_id    text;
  v_actor_name  text;
  v_mentor_name text;
  v_mentee_name text;
  v_parties     text;
  v_when        text;
  v_summary     text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_type := 'request_sent';
  ELSE
    v_from := OLD.status;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_type := CASE
        WHEN OLD.status = 'pending' AND NEW.status = 'accepted' THEN 'request_accepted'
        WHEN OLD.status = 'pending' AND NEW.status = 'rejected' THEN 'request_declined'
        WHEN OLD.status = 'accepted' AND NEW.status = 'confirmed' THEN 'booking_confirmed'
        WHEN OLD.status = 'canceled' AND NEW.status = 'confirmed' THEN 'booking_rescheduled'
        WHEN NEW.status = 'completed' THEN 'session_completed'
        WHEN NEW.status = 'canceled' THEN 'booking_canceled'
      END;
    ELSIF NEW.status = 'confirmed' AND NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
      v_type := 'booking_rescheduled';
    END IF;
    IF v_type IS NULL AND NEW.cal_status IS DISTINCT FROM OLD.cal_status THEN
      v_type := CASE NEW.cal_status WHEN 'requested' THEN 'booking_time_requested' WHEN 'rejected' THEN 'booking_time_declined' END;
    END IF;
    IF v_type IS NULL AND OLD.mentee_rating IS NULL AND NEW.mentee_rating IS NOT NULL THEN
      v_type := 'feedback_left';
    END IF;
  END IF;
  IF v_type IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT m.name INTO v_mentor_name FROM public.mentors m WHERE m.id = NEW.mentor_id;
  SELECT me.name INTO v_mentee_name FROM public.mentees me WHERE me.id = NEW.mentee_id;

  IF v_cal THEN
    v_actor_type := 'system';
  ELSIF public.owns_mentor(NEW.mentor_id) THEN
    v_actor_type := 'mentor'; v_actor_id := NEW.mentor_id; v_actor_name := v_mentor_name;
  ELSIF public.owns_mentee(NEW.mentee_id) THEN
    v_actor_type := 'mentee'; v_actor_id := NEW.mentee_id; v_actor_name := v_mentee_name;
  ELSIF public.is_admin() THEN
    v_actor_type := 'admin'; v_actor_id := auth.uid()::text;
  END IF;

  v_parties := coalesce(v_mentor_name, 'the mentor') || ' and ' || coalesce(v_mentee_name, 'the mentee');
  v_when := to_char(NEW.scheduled_at, 'YYYY-MM-DD HH24:MI') || ' UTC';
  v_summary := CASE v_type
    WHEN 'request_sent' THEN coalesce(v_mentee_name, 'A mentee') || ' requested a session with ' || coalesce(v_mentor_name, 'a mentor')
    WHEN 'request_accepted' THEN coalesce(v_mentor_name, 'The mentor') || ' accepted the request from ' || coalesce(v_mentee_name, 'a mentee')
    WHEN 'request_declined' THEN coalesce(v_mentor_name, 'The mentor') || ' declined the request from ' || coalesce(v_mentee_name, 'a mentee')
    WHEN 'booking_confirmed' THEN 'Session between ' || v_parties || ' confirmed' || coalesce(' for ' || v_when, '')
    WHEN 'booking_rescheduled' THEN 'Session between ' || v_parties || ' moved' || coalesce(' to ' || v_when, '')
    WHEN 'session_completed' THEN 'Session between ' || v_parties || ' completed'
                                  || coalesce(' (' || NEW.session_duration_minutes || ' min)', '')
    WHEN 'booking_canceled' THEN 'Session between ' || v_parties || ' cancelled' || CASE WHEN v_cal THEN ' on Cal.com' ELSE '' END
    WHEN 'booking_time_requested' THEN coalesce(v_mentee_name, 'The mentee') || ' picked a time on Cal.com; waiting for '
                                       || coalesce(v_mentor_name, 'the mentor') || ' to confirm'
    WHEN 'booking_time_declined' THEN coalesce(v_mentor_name, 'The mentor') || ' declined the time picked on Cal.com'
    WHEN 'feedback_left' THEN coalesce(v_mentee_name, 'The mentee') || ' left feedback (' || NEW.mentee_rating || '/5)'
  END;

  INSERT INTO public.activity_events (id, actor_type, actor_id, actor_name, type, subject_type, subject_id,
                                      visible_to, summary, meta, created_at)
  VALUES (gen_random_uuid(), v_actor_type, v_actor_id, v_actor_name, v_type, 'booking', NEW.id,
          ARRAY[NEW.mentor_id, NEW.mentee_id]::text[], v_summary,
          jsonb_build_object(
            'source', 'db_trigger',
            'change_source', CASE WHEN v_cal THEN 'cal' WHEN v_actor_type = 'admin' THEN 'admin' ELSE 'app' END,
            'booking_id', NEW.id,
            'mentor_id', NEW.mentor_id,
            'mentee_id', NEW.mentee_id,
            'mentor_name', v_mentor_name,
            'mentee_name', v_mentee_name,
            'from_status', v_from,
            'to_status', NEW.status,
            'scheduled_at', to_char(NEW.scheduled_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'duration_minutes', NEW.session_duration_minutes,
            'requested_start', to_char(NEW.cal_requested_start, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'rating', NEW.mentee_rating),
          now());
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS bookings_activity_events ON public.bookings;
CREATE TRIGGER bookings_activity_events AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_activity_events();
REVOKE ALL ON FUNCTION public.bookings_activity_events() FROM PUBLIC, anon, authenticated, service_role;


-- =============================================================================
-- §9 BOOKING REQUESTS (the only request paths once 0003 revokes direct inserts)
-- =============================================================================
-- Core, callable only through the two wrappers below. Validates, resolves or creates the
-- mentee, dedupes a pending request, rate-limits (privileged callers bypass the triggers,
-- so the limits are explicit here), inserts, and notifies: the mentor, or every admin when the
-- mentor is programme-managed (their placeholder address can never receive anything).
CREATE OR REPLACE FUNCTION public._create_booking_request(p_mentor_id text, p_email text, p_name text, p_goal text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email       text := lower(trim(coalesce(p_email, '')));
  v_name        text := nullif(trim(coalesce(p_name, '')), '');
  v_goal        text := trim(coalesce(p_goal, ''));
  v_now         timestamp := timezone('utc', now());
  v_mentor      public.mentors%ROWTYPE;
  v_mentee_id   text;
  v_mentee_name text;
  v_booking_id  text;
BEGIN
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF v_name IS NULL THEN
    v_name := left(split_part(v_email, '@', 1), 120);
  END IF;
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF length(v_goal) < 20 OR length(v_goal) > 1000 THEN
    RAISE EXCEPTION 'invalid_goal' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_mentor FROM public.mentors WHERE id = p_mentor_id;
  IF NOT FOUND OR NOT v_mentor.is_available THEN
    RAISE EXCEPTION 'mentor_unavailable' USING ERRCODE = '42501';
  END IF;
  -- Nobody requests a session with themselves: not under the mentor's own address, not under
  -- an identity an admin linked to this mentor profile, and not while signed in as the mentor.
  -- (guard_booking_update also refuses to complete or rate a self-booking.)
  IF lower(coalesce(v_mentor.email, '')) = v_email
     OR public.owns_mentor(p_mentor_id)
     OR EXISTS (SELECT 1 FROM public.users u WHERE u.profile_id = p_mentor_id AND lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501', DETAIL = 'self_request';
  END IF;

  -- One request at a time per requester: serialises mentee creation, the pending dedupe and
  -- the per-mentee limit across concurrent submissions.
  PERFORM pg_advisory_xact_lock(hashtext('mc_booking_request:' || v_email));

  SELECT me.id, me.name INTO v_mentee_id, v_mentee_name
  FROM public.mentees me WHERE lower(me.email) = v_email ORDER BY me.created_at LIMIT 1;
  IF v_mentee_id IS NULL THEN
    v_mentee_id := gen_random_uuid()::text;
    v_mentee_name := v_name;
    BEGIN
      INSERT INTO public.mentees (id, name, email, user_type, timezone, languages_spoken, areas_exploring,
                                  verification_status, created_at)
      VALUES (v_mentee_id, v_name, v_email, 'individual', 'UTC', ARRAY['English'], ARRAY['Career Development'],
              'unverified', v_now);
    EXCEPTION WHEN unique_violation THEN
      -- Registered a moment ago through another path (mentee registration).
      SELECT me.id, me.name INTO v_mentee_id, v_mentee_name
      FROM public.mentees me WHERE lower(me.email) = v_email ORDER BY me.created_at LIMIT 1;
    END;
  END IF;

  SELECT b.id INTO v_booking_id FROM public.bookings b
  WHERE b.mentor_id = p_mentor_id AND b.mentee_id = v_mentee_id AND b.status = 'pending'
    AND b.created_at > v_now - interval '7 days'
  ORDER BY b.created_at DESC LIMIT 1;
  IF v_booking_id IS NOT NULL THEN
    RETURN jsonb_build_object('booking_id', v_booking_id, 'outcome', 'already_pending');
  END IF;

  IF (SELECT count(*) FROM public.bookings b WHERE b.mentee_id = v_mentee_id AND b.created_at > v_now - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001', DETAIL = 'max 5 booking requests per mentee per hour';
  END IF;
  IF (SELECT count(*) FROM public.bookings b WHERE b.mentor_id = p_mentor_id AND b.created_at > v_now - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001', DETAIL = 'max 20 booking requests per mentor per hour';
  END IF;

  v_booking_id := gen_random_uuid()::text;
  INSERT INTO public.bookings (id, mentor_id, mentee_id, status, goal, clicked_at, created_at)
  VALUES (v_booking_id, p_mentor_id, v_mentee_id, 'pending', v_goal, v_now, v_now);

  IF v_mentor.managed_by_programme THEN
    INSERT INTO public.notifications (id, recipient_email, recipient_type, type, title, message, booking_id, is_read, created_at)
    SELECT gen_random_uuid()::text, lower(u.email), 'mentor', 'booking_request',
           'New request for ' || v_mentor.name || ' (programme-managed)',
           coalesce(v_mentee_name, v_name) || ' has requested a mentorship session with ' || v_mentor.name
             || '. Goal: ' || v_goal,
           v_booking_id, false, v_now
    FROM public.users u
    WHERE u.user_type = 'admin' AND nullif(trim(u.email), '') IS NOT NULL AND lower(u.email) NOT LIKE '%.invalid';
  ELSE
    PERFORM public.notify_booking_event(v_booking_id, 'booking_request');
  END IF;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'outcome', 'created');
END $$;
REVOKE ALL ON FUNCTION public._create_booking_request(text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;

-- Anonymous requests: only /api/requests (service role, after Turnstile) may call this.
CREATE OR REPLACE FUNCTION public.create_booking_request(p_mentor_id text, p_email text, p_name text, p_goal text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_service_context() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  RETURN public._create_booking_request(p_mentor_id, p_email, p_name, p_goal);
END $$;
REVOKE ALL ON FUNCTION public.create_booking_request(text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_request(text, text, text, text) TO service_role;

-- Signed-in requests: always under the caller's own JWT email (there is no email parameter).
CREATE OR REPLACE FUNCTION public.create_my_booking_request(p_mentor_id text, p_goal text, p_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text := public.current_email();
  v_name  text := nullif(trim(coalesce(p_name, '')), '');
BEGIN
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501', DETAIL = 'sign in first';
  END IF;
  IF v_name IS NULL THEN
    SELECT me.name INTO v_name FROM public.mentees me WHERE lower(me.email) = v_email ORDER BY me.created_at LIMIT 1;
  END IF;
  RETURN public._create_booking_request(p_mentor_id, v_email, v_name, p_goal);
END $$;
REVOKE ALL ON FUNCTION public.create_my_booking_request(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_my_booking_request(text, text, text) TO authenticated;


-- =============================================================================
-- §10 AVAILABILITY (replace all slots in one transaction)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_my_availability(p_mentor_id text, p_slots jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_slot jsonb;
  v_now  timestamp := timezone('utc', now());
  v_rows jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = p_mentor_id) THEN
    IF public.is_privileged() THEN
      RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.owns_mentor(p_mentor_id) OR public.is_privileged()) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) > 28 THEN
    RAISE EXCEPTION 'invalid_slot' USING ERRCODE = '22023', DETAIL = 'slots must be an array of at most 28 items';
  END IF;
  FOR v_slot IN SELECT s FROM jsonb_array_elements(p_slots) AS t (s) LOOP
    IF jsonb_typeof(v_slot) <> 'object'
       OR coalesce(v_slot ->> 'day_of_week', '') !~ '^[0-6]$'
       OR coalesce(v_slot ->> 'start_time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR coalesce(v_slot ->> 'end_time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (v_slot ->> 'start_time') >= (v_slot ->> 'end_time')
       OR (v_slot ? 'is_active' AND jsonb_typeof(v_slot -> 'is_active') <> 'boolean') THEN
      RAISE EXCEPTION 'invalid_slot' USING ERRCODE = '22023', DETAIL = v_slot::text;
    END IF;
  END LOOP;

  DELETE FROM public.mentor_availability WHERE mentor_id = p_mentor_id;
  INSERT INTO public.mentor_availability (id, mentor_id, day_of_week, start_time, end_time, is_active, created_at)
  SELECT gen_random_uuid()::text, p_mentor_id, (t.s ->> 'day_of_week')::int, t.s ->> 'start_time', t.s ->> 'end_time',
         coalesce((t.s ->> 'is_active')::boolean, true), v_now
  FROM jsonb_array_elements(p_slots) WITH ORDINALITY AS t (s, n)
  ORDER BY t.n;

  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.day_of_week, a.start_time), '[]'::jsonb) INTO v_rows
  FROM public.mentor_availability a WHERE a.mentor_id = p_mentor_id;
  RETURN v_rows;
END $$;
REVOKE ALL ON FUNCTION public.set_my_availability(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_my_availability(text, jsonb) TO authenticated;


-- =============================================================================
-- §11 CAL.COM SYNC
-- =============================================================================
-- Per-mentor webhook secret. Readable only through the owner's RPC; the webhook handler reads
-- it with the service role. RLS on with no policies; no grants to anon or authenticated.
CREATE TABLE IF NOT EXISTS public.mentor_cal_webhooks (
  mentor_id            varchar PRIMARY KEY REFERENCES public.mentors (id) ON DELETE CASCADE,
  secret               text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  previous_secret      text,
  previous_valid_until timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  rotated_at           timestamptz,
  last_delivery_at     timestamptz,
  last_trigger         text,
  last_outcome         text,
  deliveries_total     int NOT NULL DEFAULT 0
);
ALTER TABLE public.mentor_cal_webhooks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mentor_cal_webhooks FROM anon, authenticated;

-- The owning mentor's webhook settings (created on first read). Admins never see a secret.
CREATE OR REPLACE FUNCTION public.get_my_cal_webhook(p_mentor_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  w public.mentor_cal_webhooks%ROWTYPE;
BEGIN
  IF p_mentor_id IS NULL OR NOT public.owns_mentor(p_mentor_id) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.mentor_cal_webhooks (mentor_id) VALUES (p_mentor_id) ON CONFLICT (mentor_id) DO NOTHING;
  SELECT * INTO w FROM public.mentor_cal_webhooks WHERE mentor_id = p_mentor_id;
  RETURN jsonb_build_object(
    'mentor_id', w.mentor_id, 'secret', w.secret, 'created_at', w.created_at, 'rotated_at', w.rotated_at,
    'previous_valid_until', w.previous_valid_until, 'last_delivery_at', w.last_delivery_at,
    'last_trigger', w.last_trigger, 'last_outcome', w.last_outcome, 'deliveries_total', w.deliveries_total);
END $$;
REVOKE ALL ON FUNCTION public.get_my_cal_webhook(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_cal_webhook(text) TO authenticated;

-- New secret; the previous one keeps verifying for 24 hours. The owner gets the new secret
-- back, an admin gets null (they can rotate a leaked secret but never read one).
CREATE OR REPLACE FUNCTION public.rotate_cal_webhook_secret(p_mentor_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_owner boolean := p_mentor_id IS NOT NULL AND public.owns_mentor(p_mentor_id);
  w public.mentor_cal_webhooks%ROWTYPE;
BEGIN
  IF NOT (v_owner OR public.is_admin()) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = p_mentor_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.mentor_cal_webhooks (mentor_id) VALUES (p_mentor_id) ON CONFLICT (mentor_id) DO NOTHING;
  UPDATE public.mentor_cal_webhooks
  SET previous_secret = secret,
      previous_valid_until = now() + interval '24 hours',
      secret = encode(extensions.gen_random_bytes(32), 'hex'),
      rotated_at = now()
  WHERE mentor_id = p_mentor_id
  RETURNING * INTO w;
  RETURN jsonb_build_object(
    'secret', CASE WHEN v_owner THEN w.secret END,
    'rotated_at', w.rotated_at,
    'previous_valid_until', w.previous_valid_until);
END $$;
REVOKE ALL ON FUNCTION public.rotate_cal_webhook_secret(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rotate_cal_webhook_secret(text) TO authenticated;

-- Admin overview: one entry per mentor, never a secret. configured = at least one signed
-- delivery (a Cal.com "Ping test" counts) has arrived on the mentor's own webhook.
CREATE OR REPLACE FUNCTION public.cal_webhook_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_privileged() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'mentor_id', m.id,
             'mentor_name', m.name,
             'configured', coalesce(w.deliveries_total, 0) > 0,
             'last_delivery_at', w.last_delivery_at,
             'last_trigger', w.last_trigger,
             'last_outcome', w.last_outcome,
             'deliveries_total', coalesce(w.deliveries_total, 0),
             'rotated_at', w.rotated_at) ORDER BY m.name, m.id), '[]'::jsonb)
    FROM public.mentors m
    LEFT JOIN public.mentor_cal_webhooks w ON w.mentor_id = m.id);
END $$;
REVOKE ALL ON FUNCTION public.cal_webhook_status() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cal_webhook_status() TO authenticated;

-- Deliveries that change no booking (PING, unsupported trigger, unreadable payload): logged
-- once per delivery id; the mentor's panel shows the latest one.
CREATE OR REPLACE FUNCTION public.cal_record_delivery(p_delivery_id text, p_mentor_id text, p_trigger text,
                                                      p_outcome text, p_payload_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_service_context() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_delivery_id IS NULL OR p_outcome IS NULL
     OR p_outcome NOT IN ('ping', 'ignored', 'unrecognised_payload', 'invalid_payload') THEN
    RAISE EXCEPTION 'invalid_state' USING ERRCODE = '22023', DETAIL = 'unsupported outcome for cal_record_delivery';
  END IF;
  INSERT INTO public.cal_webhook_events (id, trigger, booking_uid, mentor_id, payload_sha256, outcome, received_at, processed_at)
  VALUES (p_delivery_id, upper(coalesce(p_trigger, '')), NULL, p_mentor_id, p_payload_sha256, p_outcome, now(), now())
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'duplicate');
  END IF;
  IF p_mentor_id IS NOT NULL THEN
    UPDATE public.mentor_cal_webhooks
    SET last_delivery_at = now(), last_trigger = upper(coalesce(p_trigger, '')), last_outcome = p_outcome,
        deliveries_total = deliveries_total + 1
    WHERE mentor_id = p_mentor_id;
  END IF;
  RETURN jsonb_build_object('outcome', p_outcome);
END $$;
REVOKE ALL ON FUNCTION public.cal_record_delivery(text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cal_record_delivery(text, text, text, text, text) TO service_role;

-- One Cal.com booking event, applied in a single transaction (design §3.3): delivery row first
-- (replays answer 'duplicate'), mentor resolution, organizer check, exact matching under a row
-- lock, the transition table, reminders reset, notifications, last-delivery fields. Bookings
-- are never inserted here. Activity rows come from the bookings_activity_events trigger.
CREATE OR REPLACE FUNCTION public.cal_apply_event(
  p_delivery_id text, p_mentor_id text, p_trigger text, p_uid text, p_reschedule_uid text,
  p_start timestamptz, p_end timestamptz, p_status text, p_attendee_emails text[], p_mc_booking text,
  p_organizer_username text, p_reason text, p_payload_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_trigger   text := upper(coalesce(p_trigger, ''));
  v_status    text;
  v_start     timestamp := p_start AT TIME ZONE 'UTC';
  v_now       timestamp := timezone('utc', now());
  v_emails    text[];
  v_org       text := nullif(lower(trim(coalesce(p_organizer_username, ''))), '');
  v_reason    text := left(nullif(trim(coalesce(p_reason, '')), ''), 500);
  v_mentor    public.mentors%ROWTYPE;
  v_mentee    public.mentees%ROWTYPE;
  v_b         public.bookings%ROWTYPE;
  v_cal_user  text;
  v_n         int;
  v_resched   boolean;
  v_outcome   text;
  v_changed   boolean := false;
  v_notify    text;   -- 'cancelled' | 'moved' | 'time_declined'
BEGIN
  IF NOT public.is_service_context() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_delivery_id IS NULL THEN
    RAISE EXCEPTION 'invalid_state' USING ERRCODE = '22023', DETAIL = 'delivery id required';
  END IF;
  PERFORM set_config('mc.change_source', 'cal', true);

  INSERT INTO public.cal_webhook_events (id, trigger, booking_uid, mentor_id, payload_sha256, outcome, received_at)
  VALUES (p_delivery_id, v_trigger, p_uid, p_mentor_id, p_payload_sha256, 'processing', now())
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN
    PERFORM set_config('mc.change_source', '', true);
    RETURN jsonb_build_object('outcome', 'duplicate', 'booking_id', NULL, 'changed', false);
  END IF;

  v_status := coalesce(upper(nullif(trim(coalesce(p_status, '')), '')),
                       CASE WHEN v_trigger = 'BOOKING_REQUESTED' THEN 'PENDING' ELSE 'ACCEPTED' END);
  IF v_status = 'AWAITING_HOST' THEN v_status := 'PENDING'; END IF;
  v_emails := ARRAY(SELECT DISTINCT lower(trim(e)) FROM unnest(coalesce(p_attendee_emails, '{}'::text[])) AS e
                    WHERE nullif(trim(e), '') IS NOT NULL);
  v_resched := v_trigger = 'BOOKING_RESCHEDULED' OR p_reschedule_uid IS NOT NULL;

  <<apply>>
  BEGIN
    IF p_uid IS NULL OR v_trigger NOT IN ('BOOKING_CREATED', 'BOOKING_REQUESTED', 'BOOKING_RESCHEDULED',
                                          'BOOKING_CANCELLED', 'BOOKING_REJECTED') THEN
      v_outcome := 'invalid_payload';
      EXIT apply;
    END IF;

    -- Mentor: the verified ?mentor= path, else (global path) the metadata booking after its
    -- attendee cross-check, else exactly one mentor whose personal Cal.com username matches.
    IF p_mentor_id IS NOT NULL THEN
      SELECT * INTO v_mentor FROM public.mentors WHERE id = p_mentor_id;
    ELSIF p_mc_booking IS NOT NULL THEN
      SELECT m.* INTO v_mentor
      FROM public.bookings b
      JOIN public.mentees me ON me.id = b.mentee_id
      JOIN public.mentors m ON m.id = b.mentor_id
      WHERE b.id = p_mc_booking AND lower(me.email) = ANY (v_emails);
    END IF;
    IF v_mentor.id IS NULL AND p_mentor_id IS NULL AND v_org IS NOT NULL THEN
      SELECT count(*) INTO v_n FROM public.mentors m
      WHERE split_part(regexp_replace(lower(trim(m.cal_link)), '^(https?://)?((www|app)\.)?cal\.com/', ''), '/', 1) = v_org
        AND lower(trim(m.cal_link)) NOT LIKE 'team/%';
      IF v_n = 1 THEN
        SELECT m.* INTO v_mentor FROM public.mentors m
        WHERE split_part(regexp_replace(lower(trim(m.cal_link)), '^(https?://)?((www|app)\.)?cal\.com/', ''), '/', 1) = v_org
          AND lower(trim(m.cal_link)) NOT LIKE 'team/%';
      END IF;
    END IF;
    IF v_mentor.id IS NULL THEN
      v_outcome := 'unmatched';
      EXIT apply;
    END IF;

    -- Organizer check: a personal link must belong to the organizer of this Cal.com booking.
    v_cal_user := nullif(split_part(regexp_replace(lower(trim(coalesce(v_mentor.cal_link, ''))),
                                                   '^(https?://)?((www|app)\.)?cal\.com/', ''), '/', 1), '');
    IF v_cal_user IS NOT NULL AND v_cal_user <> 'team' AND v_org IS NOT NULL AND v_org <> v_cal_user THEN
      v_outcome := 'organizer_mismatch';
      EXIT apply;
    END IF;

    -- Matching, always within this mentor's bookings and under a row lock.
    IF p_reschedule_uid IS NOT NULL THEN                                   -- R
      SELECT * INTO v_b FROM public.bookings b
      WHERE b.mentor_id = v_mentor.id AND b.cal_event_uri IN (p_reschedule_uid, p_uid)
      ORDER BY (b.cal_event_uri = p_uid) DESC
      LIMIT 1 FOR UPDATE;
    END IF;
    IF v_b.id IS NULL THEN                                                 -- U
      SELECT * INTO v_b FROM public.bookings b
      WHERE b.mentor_id = v_mentor.id AND b.cal_event_uri = p_uid FOR UPDATE;
    END IF;
    IF v_b.id IS NULL AND v_trigger IN ('BOOKING_CREATED', 'BOOKING_REQUESTED') THEN
      IF p_mc_booking IS NOT NULL THEN                                     -- M (a hint from the booker)
        SELECT b.* INTO v_b FROM public.bookings b
        JOIN public.mentees me ON me.id = b.mentee_id
        WHERE b.id = p_mc_booking AND b.mentor_id = v_mentor.id AND lower(me.email) = ANY (v_emails)
        FOR UPDATE OF b;
        IF v_b.id IS NOT NULL AND v_b.cal_event_uri IS NOT NULL AND v_b.cal_event_uri <> p_uid THEN
          v_b := NULL;
        END IF;
      END IF;
      IF v_b.id IS NULL THEN                                               -- E (unique email match)
        SELECT count(*) INTO v_n FROM public.bookings b
        JOIN public.mentees me ON me.id = b.mentee_id
        WHERE b.mentor_id = v_mentor.id AND b.status = 'accepted' AND b.cal_event_uri IS NULL
          AND lower(me.email) = ANY (v_emails);
        IF v_n > 1 THEN
          v_outcome := 'ambiguous';
          EXIT apply;
        ELSIF v_n = 1 THEN
          SELECT b.* INTO v_b FROM public.bookings b
          JOIN public.mentees me ON me.id = b.mentee_id
          WHERE b.mentor_id = v_mentor.id AND b.status = 'accepted' AND b.cal_event_uri IS NULL
            AND lower(me.email) = ANY (v_emails)
          FOR UPDATE OF b;
        END IF;
      END IF;
      IF v_b.id IS NULL THEN
        -- A concurrent embed confirmation may have recorded this uid since the lookups above.
        SELECT * INTO v_b FROM public.bookings b
        WHERE b.mentor_id = v_mentor.id AND b.cal_event_uri = p_uid FOR UPDATE;
      END IF;
    END IF;
    IF v_b.id IS NULL THEN
      v_outcome := CASE WHEN v_trigger IN ('BOOKING_CREATED', 'BOOKING_REQUESTED') AND NOT v_resched
                        THEN 'unmatched_direct_booking' ELSE 'unmatched' END;
      EXIT apply;
    END IF;

    -- The new uid must not already belong to a different booking (unique index).
    IF v_trigger NOT IN ('BOOKING_CANCELLED', 'BOOKING_REJECTED')
       AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.cal_event_uri = p_uid AND b.id <> v_b.id) THEN
      v_outcome := 'ambiguous';
      EXIT apply;
    END IF;
    IF v_start IS NULL AND v_trigger NOT IN ('BOOKING_CANCELLED', 'BOOKING_REJECTED') THEN
      v_outcome := 'invalid_payload';
      EXIT apply;
    END IF;

    -- Transition table.
    IF v_trigger = 'BOOKING_CANCELLED' THEN
      IF v_b.status = 'confirmed' THEN
        UPDATE public.bookings
        SET status = 'canceled', canceled_at = v_now, canceled_by = 'cal', cal_status = 'cancelled'
        WHERE id = v_b.id;
        DELETE FROM public.booking_reminders WHERE booking_id = v_b.id;
        v_outcome := 'canceled'; v_changed := true; v_notify := 'cancelled';
      ELSIF v_b.status = 'accepted' THEN
        UPDATE public.bookings
        SET cal_event_uri = NULL, cal_status = 'cancelled', cal_requested_start = NULL
        WHERE id = v_b.id;
        v_outcome := 'cal_booking_released'; v_changed := true;
      ELSIF v_b.status = 'canceled' THEN
        v_outcome := 'no_change';
      ELSE
        v_outcome := 'stale_state';
      END IF;

    ELSIF v_trigger = 'BOOKING_REJECTED' THEN
      IF v_b.status = 'accepted' AND v_b.cal_status = 'requested' THEN
        UPDATE public.bookings
        SET cal_status = 'rejected', cal_event_uri = NULL, cal_requested_start = NULL
        WHERE id = v_b.id;
        v_outcome := 'rejected'; v_changed := true; v_notify := 'time_declined';
      ELSE
        v_outcome := 'stale_state';
      END IF;

    ELSIF v_resched THEN
      IF v_b.status = 'confirmed' THEN
        IF v_status = 'PENDING' THEN
          UPDATE public.bookings
          SET status = 'accepted', cal_status = 'requested', cal_requested_start = v_start,
              scheduled_at = NULL, cal_event_uri = p_uid
          WHERE id = v_b.id;
          DELETE FROM public.booking_reminders WHERE booking_id = v_b.id;
          v_outcome := 'reschedule_requested'; v_changed := true;
        ELSIF v_b.cal_event_uri = p_uid AND v_b.scheduled_at IS NOT DISTINCT FROM v_start THEN
          v_outcome := 'no_change';
        ELSE
          UPDATE public.bookings
          SET scheduled_at = v_start, cal_event_uri = p_uid, cal_status = 'accepted', cal_requested_start = NULL
          WHERE id = v_b.id;
          DELETE FROM public.booking_reminders WHERE booking_id = v_b.id;
          v_outcome := 'rescheduled'; v_changed := true; v_notify := 'moved';
        END IF;
      ELSIF v_b.status = 'accepted' AND v_b.cal_status = 'requested' THEN
        IF v_status = 'PENDING' THEN
          IF v_b.cal_event_uri = p_uid AND v_b.cal_requested_start IS NOT DISTINCT FROM v_start THEN
            v_outcome := 'no_change';
          ELSE
            UPDATE public.bookings SET cal_event_uri = p_uid, cal_requested_start = v_start WHERE id = v_b.id;
            v_outcome := 'requested'; v_changed := true;
          END IF;
        ELSE
          UPDATE public.bookings
          SET status = 'confirmed', scheduled_at = v_start, cal_event_uri = p_uid, cal_status = 'accepted',
              cal_requested_start = NULL, responded_at = coalesce(responded_at, v_now)
          WHERE id = v_b.id;
          PERFORM public.notify_booking_event(v_b.id, 'booking_confirmed');
          v_outcome := 'confirmed'; v_changed := true;
        END IF;
      ELSIF v_b.status = 'canceled' AND v_b.canceled_by = 'cal' AND p_reschedule_uid IS NOT NULL
            AND v_b.cal_event_uri = p_reschedule_uid AND v_b.canceled_at >= v_now - interval '7 days' THEN
        -- CANCELLED(old uid) arrived before RESCHEDULED(new uid): bring the session back.
        IF v_status = 'PENDING' THEN
          UPDATE public.bookings
          SET status = 'accepted', cal_status = 'requested', cal_requested_start = v_start, scheduled_at = NULL,
              cal_event_uri = p_uid, canceled_at = NULL, canceled_by = NULL
          WHERE id = v_b.id;
        ELSE
          UPDATE public.bookings
          SET status = 'confirmed', scheduled_at = v_start, cal_event_uri = p_uid, cal_status = 'accepted',
              cal_requested_start = NULL, canceled_at = NULL, canceled_by = NULL
          WHERE id = v_b.id;
          v_notify := 'moved';
        END IF;
        DELETE FROM public.booking_reminders WHERE booking_id = v_b.id;
        v_outcome := 'rescheduled_revived'; v_changed := true;
      ELSE
        v_outcome := 'stale_state';
      END IF;

    ELSE  -- BOOKING_CREATED / BOOKING_REQUESTED
      IF v_status = 'PENDING' THEN
        IF v_b.status = 'accepted' THEN
          IF v_b.cal_status = 'requested' AND v_b.cal_event_uri = p_uid
             AND v_b.cal_requested_start IS NOT DISTINCT FROM v_start THEN
            v_outcome := 'no_change';
          ELSE
            UPDATE public.bookings
            SET cal_event_uri = p_uid, cal_status = 'requested', cal_requested_start = v_start
            WHERE id = v_b.id;
            v_outcome := 'requested'; v_changed := true;
          END IF;
        ELSIF v_b.status = 'confirmed' AND v_b.cal_event_uri = p_uid THEN
          v_outcome := 'no_change';   -- the request arrived after its confirmation
        ELSE
          v_outcome := 'stale_state';
        END IF;
      ELSE
        IF v_b.status = 'accepted' THEN
          UPDATE public.bookings
          SET status = 'confirmed', scheduled_at = v_start, cal_event_uri = p_uid, cal_status = 'accepted',
              cal_requested_start = NULL, responded_at = coalesce(responded_at, v_now)
          WHERE id = v_b.id;
          PERFORM public.notify_booking_event(v_b.id, 'booking_confirmed');
          v_outcome := 'confirmed'; v_changed := true;
        ELSIF v_b.status = 'confirmed' AND v_b.cal_event_uri = p_uid THEN
          IF v_b.scheduled_at IS DISTINCT FROM v_start THEN
            UPDATE public.bookings SET scheduled_at = v_start WHERE id = v_b.id;
            DELETE FROM public.booking_reminders WHERE booking_id = v_b.id;
            v_outcome := 'rescheduled'; v_changed := true; v_notify := 'moved';
          ELSE
            v_outcome := 'no_change';
          END IF;
        ELSE
          v_outcome := 'stale_state';
        END IF;
      END IF;
    END IF;
  END apply;

  -- Neutral notifications to both parties (programme-managed placeholder addresses skipped).
  IF v_notify IS NOT NULL THEN
    SELECT * INTO v_mentee FROM public.mentees WHERE id = v_b.mentee_id;
    INSERT INTO public.notifications (id, recipient_email, recipient_type, type, title, message, booking_id, is_read, created_at)
    SELECT gen_random_uuid()::text, lower(r.email), r.kind, r.ntype, r.title, r.message, v_b.id, false, v_now
    FROM (VALUES
      ('mentor', v_mentor.email,
       CASE v_notify WHEN 'cancelled' THEN 'booking_canceled' ELSE 'booking_confirmed' END,
       CASE v_notify WHEN 'cancelled' THEN 'Session cancelled on Cal.com' ELSE 'Session moved' END,
       CASE v_notify
         WHEN 'cancelled' THEN 'Your session with ' || coalesce(v_mentee.name, 'your mentee') || ' was cancelled on Cal.com.'
                               || coalesce(' Reason: ' || v_reason, '')
         ELSE 'Your session with ' || coalesce(v_mentee.name, 'your mentee') || ' moved to '
              || to_char(v_start, 'YYYY-MM-DD HH24:MI') || ' UTC.' END),
      ('mentee', v_mentee.email,
       CASE v_notify WHEN 'cancelled' THEN 'booking_canceled' WHEN 'moved' THEN 'booking_confirmed' ELSE 'booking_accepted' END,
       CASE v_notify WHEN 'cancelled' THEN 'Session cancelled on Cal.com' WHEN 'moved' THEN 'Session moved'
                     ELSE 'Choose another time' END,
       CASE v_notify
         WHEN 'cancelled' THEN 'Your session with ' || v_mentor.name || ' was cancelled on Cal.com.'
                               || coalesce(' Reason: ' || v_reason, '')
         WHEN 'moved' THEN 'Your session with ' || v_mentor.name || ' moved to ' || to_char(v_start, 'YYYY-MM-DD HH24:MI') || ' UTC.'
         ELSE v_mentor.name || ' could not confirm the time you picked on Cal.com. Please choose another time.' END)
    ) AS r (kind, email, ntype, title, message)
    WHERE nullif(trim(coalesce(r.email, '')), '') IS NOT NULL
      AND lower(r.email) NOT LIKE '%.invalid'
      AND (v_notify <> 'time_declined' OR r.kind = 'mentee');
  END IF;

  UPDATE public.cal_webhook_events
  SET outcome = v_outcome, booking_id = v_b.id, mentor_id = coalesce(p_mentor_id, v_mentor.id), processed_at = now()
  WHERE id = p_delivery_id;
  IF p_mentor_id IS NOT NULL THEN
    UPDATE public.mentor_cal_webhooks
    SET last_delivery_at = now(), last_trigger = v_trigger, last_outcome = v_outcome,
        deliveries_total = deliveries_total + 1
    WHERE mentor_id = p_mentor_id;
  END IF;
  PERFORM set_config('mc.change_source', '', true);
  RETURN jsonb_build_object('outcome', v_outcome, 'booking_id', v_b.id, 'changed', v_changed);
END $$;
REVOKE ALL ON FUNCTION public.cal_apply_event(text, text, text, text, text, timestamptz, timestamptz, text, text[], text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cal_apply_event(text, text, text, text, text, timestamptz, timestamptz, text, text[], text, text, text, text)
  TO service_role;

-- The mentee's embed reports a Cal.com booking for their accepted request. Respects
-- requires-confirmation (PENDING) and reschedules through the embed. Races with the webhook
-- resolve on the row lock: whichever runs second finds the state already recorded.
CREATE OR REPLACE FUNCTION public.record_cal_booking_from_embed(p_booking_id text, p_uid text, p_start timestamptz,
                                                                p_status text, p_reschedule_uid text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_status  text := upper(coalesce(nullif(trim(coalesce(p_status, '')), ''), 'ACCEPTED'));
  v_start   timestamp := p_start AT TIME ZONE 'UTC';
  v_now     timestamp := timezone('utc', now());
  v_b       public.bookings%ROWTYPE;
  v_m       public.mentors%ROWTYPE;
  v_me      public.mentees%ROWTYPE;
  v_outcome text;
  v_moved   boolean := false;
BEGIN
  IF p_uid IS NULL OR p_uid !~ '^[A-Za-z0-9_-]{6,128}$'
     OR (p_reschedule_uid IS NOT NULL AND p_reschedule_uid !~ '^[A-Za-z0-9_-]{6,128}$') THEN
    RAISE EXCEPTION 'invalid_uid' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'AWAITING_HOST' THEN v_status := 'PENDING'; END IF;
  IF v_status NOT IN ('ACCEPTED', 'PENDING') OR v_start IS NULL THEN
    RAISE EXCEPTION 'invalid_state' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.owns_mentee(v_b.mentee_id) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings b WHERE b.cal_event_uri = p_uid AND b.id <> v_b.id) THEN
    RAISE EXCEPTION 'uid_in_use' USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('mc.internal_write', 'on', true);
  IF p_reschedule_uid IS NOT NULL AND p_reschedule_uid IS NOT DISTINCT FROM v_b.cal_event_uri THEN
    IF v_b.status = 'confirmed' THEN
      IF v_status = 'PENDING' THEN
        UPDATE public.bookings
        SET status = 'accepted', cal_status = 'requested', cal_requested_start = v_start, scheduled_at = NULL,
            cal_event_uri = p_uid
        WHERE id = v_b.id;
        v_outcome := 'reschedule_requested';
      ELSE
        UPDATE public.bookings
        SET scheduled_at = v_start, cal_event_uri = p_uid, cal_status = 'accepted', cal_requested_start = NULL
        WHERE id = v_b.id;
        v_outcome := 'rescheduled'; v_moved := true;
      END IF;
      DELETE FROM public.booking_reminders WHERE booking_id = v_b.id;
    ELSIF v_b.status = 'accepted' AND v_b.cal_status = 'requested' THEN
      IF v_status = 'PENDING' THEN
        UPDATE public.bookings SET cal_event_uri = p_uid, cal_requested_start = v_start WHERE id = v_b.id;
        v_outcome := 'requested';
      ELSE
        UPDATE public.bookings
        SET status = 'confirmed', scheduled_at = v_start, cal_event_uri = p_uid, cal_status = 'accepted',
            cal_requested_start = NULL, responded_at = coalesce(responded_at, v_now)
        WHERE id = v_b.id;
        PERFORM public.notify_booking_event(v_b.id, 'booking_confirmed');
        v_outcome := 'confirmed';
      END IF;
    ELSE
      RAISE EXCEPTION 'invalid_state' USING ERRCODE = '22023';
    END IF;
  ELSIF v_b.status = 'confirmed' AND v_b.cal_event_uri = p_uid THEN
    v_outcome := 'already_recorded';
  ELSIF v_b.status = 'accepted' AND (v_b.cal_event_uri IS NULL OR v_b.cal_event_uri = p_uid) THEN
    IF v_status = 'PENDING' THEN
      IF v_b.cal_status = 'requested' AND v_b.cal_event_uri = p_uid AND v_b.cal_requested_start IS NOT DISTINCT FROM v_start THEN
        v_outcome := 'already_recorded';
      ELSE
        UPDATE public.bookings
        SET cal_event_uri = p_uid, cal_status = 'requested', cal_requested_start = v_start
        WHERE id = v_b.id;
        v_outcome := 'requested';
      END IF;
    ELSE
      UPDATE public.bookings
      SET status = 'confirmed', scheduled_at = v_start, cal_event_uri = p_uid, cal_status = 'accepted',
          cal_requested_start = NULL, responded_at = coalesce(responded_at, v_now)
      WHERE id = v_b.id;
      PERFORM public.notify_booking_event(v_b.id, 'booking_confirmed');
      v_outcome := 'confirmed';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_state' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('mc.internal_write', 'off', true);

  IF v_moved THEN
    SELECT * INTO v_m FROM public.mentors WHERE id = v_b.mentor_id;
    SELECT * INTO v_me FROM public.mentees WHERE id = v_b.mentee_id;
    INSERT INTO public.notifications (id, recipient_email, recipient_type, type, title, message, booking_id, is_read, created_at)
    SELECT gen_random_uuid()::text, lower(r.email), r.kind, 'booking_confirmed', 'Session moved', r.message, v_b.id, false, v_now
    FROM (VALUES
      ('mentor', v_m.email, 'Your session with ' || coalesce(v_me.name, 'your mentee') || ' moved to '
                            || to_char(v_start, 'YYYY-MM-DD HH24:MI') || ' UTC.'),
      ('mentee', v_me.email, 'Your session with ' || v_m.name || ' moved to ' || to_char(v_start, 'YYYY-MM-DD HH24:MI') || ' UTC.')
    ) AS r (kind, email, message)
    WHERE nullif(trim(coalesce(r.email, '')), '') IS NOT NULL AND lower(r.email) NOT LIKE '%.invalid';
  END IF;
  RETURN jsonb_build_object('outcome', v_outcome, 'booking_id', v_b.id);
END $$;
REVOKE ALL ON FUNCTION public.record_cal_booking_from_embed(text, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_cal_booking_from_embed(text, text, timestamptz, text, text) TO authenticated;


-- =============================================================================
-- §12 STORAGE: the `uploads` bucket (public read; 5 MB images)
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('uploads', 'uploads', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;


-- =============================================================================
-- §13 (the featured-mentor seed is migrations/0004_seed_featured_mentors.sql, run separately)
-- =============================================================================


-- =============================================================================
-- §14 HYGIENE, LEDGER, SUMMARY
-- =============================================================================
-- Rating recompute is called by signed-in clients (feedback) and the rating trigger only.
REVOKE ALL ON FUNCTION public.recompute_mentor_rating(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_mentor_rating(text) TO authenticated, service_role;
-- Mentor-only write paths: never callable without a session.
REVOKE ALL ON FUNCTION public.log_mentor_activity(text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_mentor_earning(text, text, numeric, text) FROM PUBLIC, anon;

INSERT INTO public.schema_migrations (version, note)
VALUES ('0002_production_readiness', 'expand: phase-2 repair, booking RPCs, Cal sync, activity trigger, storage bucket')
ON CONFLICT (version) DO UPDATE SET applied_at = now();

DO $$
DECLARE
  v_admins_without_auth text;
BEGIN
  -- is_admin() is uid-based: an admin whose users.id is not their auth user id loses admin rights.
  IF to_regclass('auth.users') IS NOT NULL THEN
    SELECT string_agg(u.email, ', ') INTO v_admins_without_auth
    FROM public.users u
    WHERE u.user_type = 'admin' AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id::text = u.id);
    IF v_admins_without_auth IS NOT NULL THEN
      RAISE WARNING '0002: admin rows whose id is not an auth user id (they are not admins until fixed): %', v_admins_without_auth;
    END IF;
  END IF;
  RAISE NOTICE '0002 applied: % mentors (% programme-managed), % bookings, legacy client writes %',
    (SELECT count(*) FROM public.mentors),
    (SELECT count(*) FROM public.mentors WHERE managed_by_programme),
    (SELECT count(*) FROM public.bookings),
    (SELECT value FROM public.mc_settings WHERE key = 'legacy_booking_writes');
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES (run by hand after the file; expected results in comments)
-- =============================================================================
-- select version, applied_at from public.schema_migrations order by 1;               -- 0002 listed
-- select key, value from public.mc_settings;                                          -- legacy_booking_writes = allowed (blocked after 0003)
-- select pg_get_functiondef('public.is_admin()'::regprocedure);                       -- u.id = auth.uid()::text, pg_temp
-- select to_regclass('public.mentee_favorites'), to_regclass('public.activity_events'),
--        to_regclass('public.booking_reminders'), to_regclass('public.cal_webhook_events'),
--        to_regclass('public.mentor_cal_webhooks');                                    -- all five non-null
-- select table_name, column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name in ('mentee_favorites', 'booking_reminders')
--    and column_name in ('mentee_id', 'mentor_id', 'booking_id');                     -- character varying
-- select conname from pg_constraint where conrelid = 'public.bookings'::regclass order by 1;  -- *_check constraints present
-- select indexname from pg_indexes where indexname = 'bookings_cal_event_uri_unique'; -- 1 row
-- select proname, proconfig from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
--    and not exists (select 1 from unnest(proconfig) c where c like 'search_path=%pg_temp%');  -- 0 rows
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'uploads';
