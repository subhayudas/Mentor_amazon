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
--   Expand-safe for the client that is live today (origin/main a4f3fbd): after this file it keeps
--   working: anonymous get_or_create_mentee + direct bookings insert +
--   notify_booking_event('booking_request'), the client-side confirm that writes scheduled_at /
--   cal_event_uri / status, rating on past sessions, and every other path. The restrictions
--   that would break it live in migrations/0003_restrict_legacy_writes.sql, which runs only
--   AFTER the new client is deployed. Keep the time between this file and 0003 short (the same
--   day): until 0003 the legacy anonymous write paths stay open.
--   It is not purely additive. For the live client it also tightens, without breaking a path it
--   uses:
--     * the `uploads` bucket: 5 MB and image/jpeg, png, webp, gif only (an image/heic or
--       image/avif upload from the live client now fails); no public list API; profiles/<uid>/
--       uploads only into the uploader's own folder;
--     * users rows: profile_id may only name a profile under the caller's own email, is_verified
--       is set by the SSO bridge or an admin (§3a); an Amazon account cannot set a password, and
--       any password one set before is replaced by a random one nobody knows (§3a);
--     * mentors rows: the five featured ids are reserved, and id, email and managed_by_programme
--       are set by an admin (§6);
--     * bookings: parties cannot write cal_status, cal_requested_start, canceled_by or
--       cal_verified_uid; ratings need a confirmed or completed session (§7); status, rating,
--       cal_status and canceled_by CHECKs and a unique Cal.com uid (§5);
--     * get_or_create_mentee no longer returns the profile of an address that has an account to
--       anyone but that account (§9);
--     * activity_events inserts: only into the caller's own feed, with size limits (§3);
--       booking_notes and mentor_tasks get size limits; notification rows are read-only for
--       their recipient except is_read (§13);
--     * mentors_public and mentor_scheduling_links are read-only views (§6).
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
  -- array_append, not `||`: text[] || 'literal' reads the literal as an array and fails with
  -- "malformed array literal" instead of printing the message.
  IF to_regprocedure('public.is_privileged()') IS NULL THEN
    v_problems := array_append(v_problems, 'public.is_privileged() is missing: run supabase_setup_v2.sql first');
  END IF;
  IF to_regclass('public.approved_users') IS NULL THEN
    v_problems := array_append(v_problems, 'public.approved_users is missing: run supabase_setup_v2.sql first');
  END IF;
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'mentors' AND column_name = 'id') IS DISTINCT FROM 'character varying' THEN
    v_problems := array_append(v_problems, 'public.mentors.id must be character varying (the drizzle schema in shared/schema.ts)');
  END IF;
  IF to_regnamespace('extensions') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto' AND extnamespace = 'extensions'::regnamespace) THEN
    v_problems := array_append(v_problems, 'the pgcrypto extension must be installed in schema "extensions" (Supabase default)');
  END IF;
  IF to_regclass('storage.buckets') IS NULL THEN
    v_problems := array_append(v_problems, 'storage.buckets is missing: this file targets a Supabase database');
  END IF;
  IF to_regclass('auth.users') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'encrypted_password') THEN
    v_problems := array_append(v_problems, 'auth.users.encrypted_password is missing: this file targets a Supabase database');
  ELSIF NOT (has_table_privilege('auth.users', 'TRIGGER') AND has_table_privilege('auth.users', 'UPDATE')) THEN
    v_problems := array_append(v_problems, 'the role running this file needs the TRIGGER and UPDATE privileges on auth.users (run it as postgres in the SQL editor)');
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
-- A RESCHEDULED, CANCELLED or REJECTED delivery that matched nothing because it overtook the
-- delivery it follows is parked here (its arguments) and replayed by cal_apply_event (§11) once a
-- booking takes the uid it names.
ALTER TABLE public.cal_webhook_events ADD COLUMN IF NOT EXISTS parked jsonb;
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
-- account (users.profile_id). Same body as supabase_phase2.sql. An own-address row whose id the
-- other table also holds under another address counts for nobody (fails closed): the id cannot say
-- which of the two it names, and guard_profile_id_namespace (§6) stops new collisions (R1-07).
CREATE OR REPLACE FUNCTION public.my_profile_ids()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  select coalesce(array_agg(distinct p.id), '{}'::text[])
  from (
    select m.id::text as id from public.mentors m
      where public.current_email() is not null and lower(m.email) = public.current_email()
        and not exists (select 1 from public.mentees x
                        where x.id = m.id and lower(x.email) is distinct from public.current_email())
    union all
    select me.id::text from public.mentees me
      where public.current_email() is not null and lower(me.email) = public.current_email()
        and not exists (select 1 from public.mentors x
                        where x.id = me.id and lower(x.email) is distinct from public.current_email())
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
-- only post into their own feed, visible only to themselves, with bounded text; the booking
-- trigger in §8 writes its rows past RLS). Same policies as supabase_phase2.sql.
CREATE POLICY "favorites: own rows" ON public.mentee_favorites
  FOR ALL
  USING (mentee_id IN (SELECT id FROM public.mentees WHERE lower(email) = lower(auth.jwt() ->> 'email')))
  WITH CHECK (mentee_id IN (SELECT id FROM public.mentees WHERE lower(email) = lower(auth.jwt() ->> 'email')));
CREATE POLICY "events: append as self" ON public.activity_events
  FOR INSERT
  WITH CHECK ((public.is_admin() OR (actor_id = ANY (public.my_profile_ids()) AND visible_to <@ public.my_profile_ids()))
              AND length(summary) <= 500 AND length(type) <= 64 AND length(coalesce(actor_name, '')) <= 200
              AND pg_column_size(meta) <= 8192);
CREATE POLICY "events: read mine" ON public.activity_events
  FOR SELECT
  USING (visible_to && public.my_profile_ids() OR public.is_admin());


-- =============================================================================
-- §3a ACCOUNTS: profile links, verification, passwords (mirrored in supabase_setup_v2.sql §4)
-- =============================================================================
-- Identical, character for character, to supabase_setup_v2.sql §4
-- (tests/sql-mirror.test.ts compares them).
CREATE OR REPLACE FUNCTION public.guard_users_role_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.is_privileged() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND (NEW.user_type = 'admin' OR NEW.amazon_alias IS NOT NULL) THEN
    RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'user_type/amazon_alias are set by an admin or the SSO bridge';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.user_type IS DISTINCT FROM OLD.user_type OR NEW.amazon_alias IS DISTINCT FROM OLD.amazon_alias) THEN
    RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'user_type/amazon_alias may only be changed by an admin';
  END IF;
  -- email is the ownership key everywhere (RLS, first-admin bootstrap, SSO
  -- linking); letting a user rewrite it would let them claim someone else's
  -- promotion. Only admins / the service role may change it.
  IF TG_OP = 'UPDATE' AND lower(NEW.email) IS DISTINCT FROM lower(OLD.email) THEN
    RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'email may only be changed by an admin';
  END IF;
  -- profile_id is an ownership key too: owns_profile(), owns_mentor() and my_profile_ids() trust it,
  -- so it opens that profile's full row, its bookings and its Cal.com webhook secret. An account may
  -- point it only at its own kind of row (a mentor at a mentors row, a mentee at a mentees row) under
  -- its own verified email (the onboarding and registration link), or clear it; and never at an id
  -- that any row under another address also carries (ids are one namespace across both tables, so a
  -- self-made row reusing a mentor's public id must not open that mentor). Links to any other row are
  -- made by an admin or the SSO bridge.
  IF NEW.profile_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.profile_id IS DISTINCT FROM OLD.profile_id)
     AND ((NOT EXISTS (SELECT 1 FROM public.mentors m
                       WHERE NEW.user_type = 'mentor' AND m.id = NEW.profile_id AND lower(m.email) = public.current_email())
           AND NOT EXISTS (SELECT 1 FROM public.mentees me
                           WHERE NEW.user_type = 'mentee' AND me.id = NEW.profile_id AND lower(me.email) = public.current_email()))
          OR EXISTS (SELECT 1 FROM public.mentors m
                     WHERE m.id = NEW.profile_id AND lower(m.email) IS DISTINCT FROM public.current_email())
          OR EXISTS (SELECT 1 FROM public.mentees me
                     WHERE me.id = NEW.profile_id AND lower(me.email) IS DISTINCT FROM public.current_email())) THEN
    RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'profile_id may only name your own profile';
  END IF;
  -- is_verified records that the SSO bridge or an admin vouched for the account.
  IF TG_OP = 'INSERT' THEN
    NEW.is_verified := false;
  ELSIF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'is_verified is set by the SSO bridge or an admin';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_guard_role_columns ON public.users;
CREATE TRIGGER users_guard_role_columns BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_users_role_columns();
-- Links made before this guard existed (R2-13). Until then any signed-in account could point its
-- profile_id at any id: another person's mentors or mentees row, or a featured id before 0004
-- seeds it, and the link keeps opening that row after the guard (owns_mentor, my_profile_ids).
-- Every link is cleared unless the guard would accept it today (the account's own kind of row
-- under its own sign-in email, auth.users.email, with no row under another address carrying the
-- id) or the programme demonstrably made it: the account is an admin, or an approved_users row
-- for its alias or sign-in email names that mentor row (what the SSO bridge links). The WARNING
-- names every link cleared; an admin re-links a legitimate one. Identical in
-- supabase_setup_v2.sql §4 and migrations/0002 §3a (tests/sql-mirror.test.ts).
DO $$
DECLARE
  v_cleared text;
BEGIN
  WITH checked AS (
    SELECT u.id, u.email, u.profile_id,
           coalesce(u.user_type = 'admin', false)
           OR EXISTS (SELECT 1 FROM public.approved_users ap
                      WHERE ap.mentor_id = u.profile_id
                        AND (lower(ap.amazon_alias) = lower(u.amazon_alias) OR lower(ap.email) = lower(a.email)))
           OR ((EXISTS (SELECT 1 FROM public.mentors m
                        WHERE u.user_type = 'mentor' AND m.id = u.profile_id AND lower(m.email) = lower(a.email))
                OR EXISTS (SELECT 1 FROM public.mentees me
                           WHERE u.user_type = 'mentee' AND me.id = u.profile_id AND lower(me.email) = lower(a.email)))
               AND NOT EXISTS (SELECT 1 FROM public.mentors m
                               WHERE m.id = u.profile_id AND lower(m.email) IS DISTINCT FROM lower(a.email))
               AND NOT EXISTS (SELECT 1 FROM public.mentees me
                               WHERE me.id = u.profile_id AND lower(me.email) IS DISTINCT FROM lower(a.email))) AS kept
    FROM public.users u LEFT JOIN auth.users a ON a.id::text = u.id
    WHERE u.profile_id IS NOT NULL
  ), cleared AS (
    UPDATE public.users u SET profile_id = NULL
    FROM checked c
    WHERE u.id = c.id AND NOT c.kept
    RETURNING c.email, c.id, c.profile_id
  )
  SELECT string_agg(format('%s (users.id %s) had profile_id %s', cl.email, cl.id, cl.profile_id), '; ' ORDER BY cl.email, cl.id)
    INTO v_cleared
  FROM cleared cl;
  IF v_cleared IS NOT NULL THEN
    RAISE WARNING 'users.profile_id links cleared (the profile_id guard refuses them; they were made before it existed): %', v_cleared
      USING HINT = 'Re-link a legitimate one as an admin. To keep an admin-made link through a re-run of this file, name that mentor row in approved_users.mentor_id for the account''s alias or email.';
  END IF;
END $$;

-- An Amazon account has no password (AUTH-02, enforced by the database; supabase_setup_v2.sql §4).
CREATE OR REPLACE FUNCTION public.block_sso_password_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
     AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.id::text AND u.amazon_alias IS NOT NULL) THEN
    RAISE EXCEPTION 'sso_account_has_no_password' USING ERRCODE = '42501',
      DETAIL = 'an account that signs in with Amazon cannot set a password';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.block_sso_password_change() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS auth_users_block_sso_password ON auth.users;
-- Until this trigger existed any Amazon session could give itself a password (updateUser). Every
-- Amazon account gets a new random password nobody knows, as the SSO bridge's rotateAuthPassword
-- does when it links a legacy account, so a password set that way stops working too. (A random
-- 256-bit secret: the bcrypt cost adds nothing but time inside this transaction.)
UPDATE auth.users a
SET encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf'))
WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id::text AND u.amazon_alias IS NOT NULL);
CREATE TRIGGER auth_users_block_sso_password BEFORE UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.block_sso_password_change();


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
-- Provenance of the Cal.com uid: the uid the signed webhook last delivered for this booking.
-- cal_event_uri = cal_verified_uid means Cal.com itself vouched for the booking; anything else
-- (NULL, or another uid) was only reported by the mentee's browser (§11). No backfill: before this
-- file no delivery could be verified (per-mentor secrets are new, and the one global secret was
-- never set in production), so every existing uid really was reported by a browser.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cal_verified_uid text;

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
-- Mentor ids only the programme may create (the five featured mentors, design §3.1: UUIDv5 of
-- https://mentor-amazon.vercel.app/mentor/<slug>). Their public URLs exist before
-- migrations/0004 seeds the rows, so nobody else may take them first (guard below). Same rows
-- as supabase_setup_v2.sql §1; RLS on, no policies, no client privileges.
CREATE TABLE IF NOT EXISTS public.reserved_mentor_ids (
  id   varchar PRIMARY KEY,
  note text NOT NULL
);
ALTER TABLE public.reserved_mentor_ids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reserved_mentor_ids FROM PUBLIC, anon, authenticated;
INSERT INTO public.reserved_mentor_ids (id, note) VALUES
  ('738d7465-42c6-5550-be9a-6e7ef35f52bc', 'featured: manav-gupta'),
  ('caf1ee67-267d-591f-9842-5ae649ec2a26', 'featured: bashar-aboudaoud'),
  ('20b28010-7bf8-5b6b-a1cc-d9435478d131', 'featured: nick-ramil'),
  ('ec758eba-8efc-5c32-a3ee-768badd8c9c9', 'featured: levi-lewandowski'),
  ('6afa7b6d-d098-568a-b629-2b04c6edeef1', 'featured: ghita-elidrissi')
ON CONFLICT (id) DO NOTHING;

-- average_rating / total_ratings are derived by recompute_mentor_rating();
-- a mentor must not be able to type their own score. The row's identity is the
-- programme's: a mentor cannot take a reserved (featured) id, rename their row,
-- move it to another address or mark it programme-managed, and a programme-managed
-- row is edited by admins only. Identical to supabase_setup_v2.sql §4.
CREATE OR REPLACE FUNCTION public.guard_mentor_derived_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.is_privileged() OR current_setting('mc.internal_write', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.reserved_mentor_ids r WHERE r.id = NEW.id) THEN
      RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'this mentor id is reserved for the programme';
    END IF;
    IF NEW.managed_by_programme THEN
      RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'managed_by_programme is set by an admin';
    END IF;
    NEW.average_rating := 0;
    NEW.total_ratings := 0;
    RETURN NEW;
  END IF;
  IF OLD.managed_by_programme THEN
    RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'a programme-managed mentor is edited by an admin';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR lower(NEW.email) IS DISTINCT FROM lower(OLD.email)
     OR NEW.managed_by_programme IS DISTINCT FROM OLD.managed_by_programme THEN
    RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'id, email and managed_by_programme are set by an admin';
  END IF;
  IF NEW.average_rating IS DISTINCT FROM OLD.average_rating OR NEW.total_ratings IS DISTINCT FROM OLD.total_ratings THEN
    RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'ratings are computed from mentee feedback';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mentors_guard_derived ON public.mentors;
CREATE TRIGGER mentors_guard_derived BEFORE INSERT OR UPDATE ON public.mentors
  FOR EACH ROW EXECUTE FUNCTION public.guard_mentor_derived_columns();
-- Mentor and mentee ids are one namespace: users.profile_id, my_profile_ids() and
-- activity_events.visible_to name a profile by id alone, without its table. So no writer (the
-- client, anon, an admin, the service role or a trusted RPC) may give a row an id that the other
-- table or the programme's reserved list already holds, and only an admin or the service role
-- renames a mentees row (a mentors row's id is guarded above). Otherwise a mentees row under the
-- caller's own address with a mentor's public id would open that mentor (R1-07).
-- Identical to supabase_setup_v2.sql §4.
CREATE OR REPLACE FUNCTION public.guard_profile_id_namespace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.id IS NOT DISTINCT FROM OLD.id THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'mentees' AND NOT public.is_privileged() THEN
    RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'a mentee profile id is set when it is created';
  END IF;
  -- Two concurrent writers of the same id in different tables would each miss the other's row.
  PERFORM pg_advisory_xact_lock(hashtext('mc_profile_id:' || NEW.id));
  IF TG_TABLE_NAME = 'mentees'
     AND (EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = NEW.id)
          OR EXISTS (SELECT 1 FROM public.reserved_mentor_ids r WHERE r.id = NEW.id)) THEN
    RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'this id belongs to a mentor profile';
  END IF;
  IF TG_TABLE_NAME = 'mentors' AND EXISTS (SELECT 1 FROM public.mentees me WHERE me.id = NEW.id) THEN
    RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'this id belongs to a mentee profile';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mentees_guard_profile_id ON public.mentees;
CREATE TRIGGER mentees_guard_profile_id BEFORE INSERT OR UPDATE OF id ON public.mentees
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_id_namespace();
DROP TRIGGER IF EXISTS mentors_guard_profile_id ON public.mentors;
CREATE TRIGGER mentors_guard_profile_id BEFORE INSERT OR UPDATE OF id ON public.mentors
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_id_namespace();
-- Rows that collided before the guard existed count for nobody in my_profile_ids(); name them so
-- an admin can remove the stray one (tests/integration/rls.test.ts 'profile ids').
DO $$
DECLARE v_ids text;
BEGIN
  SELECT string_agg(m.id, ', ' ORDER BY m.id) INTO v_ids
  FROM public.mentors m JOIN public.mentees me ON me.id = m.id;
  IF v_ids IS NOT NULL THEN
    RAISE WARNING 'mentors and mentees rows share these ids (remove the stray row): %', v_ids;
  END IF;
END $$;
-- The public directory needs the flag: handing a featured profile to the real person
-- (managed_by_programme = false) must switch the client from the programme copy to the row.
-- Same definition as supabase_setup_v2.sql §3, with the column appended (so REPLACE works).
CREATE OR REPLACE VIEW public.mentors_public WITH (security_invoker = false) AS
  SELECT id, name, name_ar, company, company_ar, position, position_ar, timezone, country,
         photo_url, bio, bio_ar, expertise, expertise_ar, industries, industries_ar,
         languages_spoken, mentorship_preference, is_available, average_rating, total_ratings,
         created_at, managed_by_programme
  FROM public.mentors;
-- Read-only views. mentors_public is a single-table view, so it is auto-updatable and runs as
-- its owner: the INSERT/UPDATE/DELETE that Supabase's default privileges grant on every new
-- object let anon edit or delete any mentor through it, past RLS. Only SELECT stays.
REVOKE ALL ON public.mentors_public FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.mentors_public TO anon, authenticated, service_role;
REVOKE ALL ON public.mentor_scheduling_links FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.mentor_scheduling_links TO authenticated, service_role;


-- =============================================================================
-- §7 BOOKING GUARD (mirrored character for character in supabase_setup_v2.sql)
-- =============================================================================
-- Non-privileged callers (the booking's mentor or mentee through PostgREST):
--   * keep every v2 rule (immutable parties, role-bound status transitions, who writes which
--     rating, only the mentor records duration and country);
--   * may never write cal_status, cal_requested_start, canceled_by or cal_verified_uid (the
--     scheduler's columns);
--   * once mc_settings.legacy_booking_writes = 'blocked' (migrations/0003): may not write
--     scheduled_at or cal_event_uri, neither party may move accepted → confirmed (scheduling
--     goes through record_cal_booking_from_embed / the Cal.com webhook), and ratings and
--     feedback can only be left once the booking is completed; before that (legacy writes
--     allowed) they need a confirmed or completed booking.
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
    -- completing is the mentor's call. Once legacy writes are blocked only Cal.com sync (the
    -- webhook and record_cal_booking_from_embed) makes a booking 'confirmed', for either side.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF v_mentor THEN
        IF NOT (
          (OLD.status = 'pending'   AND NEW.status IN ('accepted', 'rejected', 'canceled')) OR
          (OLD.status = 'accepted'  AND NEW.status IN ('completed', 'canceled')) OR
          (v_legacy AND OLD.status = 'accepted' AND NEW.status = 'confirmed') OR
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
       OR NEW.cal_verified_uid IS DISTINCT FROM OLD.cal_verified_uid
       OR (NOT v_legacy AND (NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
                             OR NEW.cal_event_uri IS DISTINCT FROM OLD.cal_event_uri)) THEN
      RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'scheduling columns are written by Cal.com sync only';
    END IF;
    -- Ratings and feedback describe a session that took place. While legacy writes are allowed
    -- the pre-release client rates confirmed sessions whose time has passed, so a confirmed
    -- booking still qualifies then; a pending, accepted, rejected or canceled one never does.
    IF (NEW.mentee_rating IS DISTINCT FROM OLD.mentee_rating OR NEW.mentee_feedback IS DISTINCT FROM OLD.mentee_feedback
        OR NEW.mentor_rating IS DISTINCT FROM OLD.mentor_rating OR NEW.mentor_feedback IS DISTINCT FROM OLD.mentor_feedback) THEN
      IF NOT v_legacy AND OLD.status IS DISTINCT FROM 'completed' THEN
        RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'ratings and feedback can be left once the session is completed';
      END IF;
      IF v_legacy AND coalesce(OLD.status, '') NOT IN ('confirmed', 'completed') THEN
        RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'ratings and feedback need a confirmed or completed session';
      END IF;
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
  -- An address with an account belongs to someone who can sign in. A request made for it by
  -- anyone else (the anonymous path: the server calls this with no session) never attaches to
  -- that person's profile, which the mentor would then read, and never creates one. The outcome
  -- is neutral (/api/requests answers as for a created request, so it is no account oracle) and
  -- the owner is told in their bell, at most once a day.
  IF public.current_email() IS DISTINCT FROM v_email
     AND EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = v_email) THEN
    INSERT INTO public.notifications (id, recipient_email, recipient_type, type, title, message, booking_id, is_read, created_at)
    SELECT gen_random_uuid()::text, v_email, 'mentee', 'booking_request', 'Request not sent: please sign in',
           'A session with ' || v_mentor.name || ' was requested with your email address while signed out, so it was not sent. '
             || 'If it was you, sign in and send the request from your account.',
           NULL, false, v_now
    WHERE v_email NOT LIKE '%.invalid'
      AND NOT EXISTS (SELECT 1 FROM public.notifications n
                      WHERE n.recipient_email = v_email AND n.booking_id IS NULL
                        AND n.title = 'Request not sent: please sign in' AND n.created_at > v_now - interval '1 day');
    RETURN jsonb_build_object('booking_id', NULL, 'outcome', 'sign_in_required');
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


-- The v2 notification writer, redefined here so a project that already ran v2 gets it (a
-- programme-managed mentor's notices go to every admin, never to the .invalid placeholder; the
-- accepted notice points to the dashboard, not to a raw cal.com link). CREATE OR REPLACE keeps
-- the grants: anon keeps EXECUTE until migrations/0003. Identical to supabase_setup_v2.sql §4.
CREATE OR REPLACE FUNCTION public.notify_booking_event(p_booking_id text, p_event text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_b        public.bookings%ROWTYPE;
  v_m        public.mentors%ROWTYPE;
  v_me       public.mentees%ROWTYPE;
  v_is_mentor boolean; v_is_mentee boolean;
  v_to text; v_to_type text; v_type text; v_title text; v_msg text; v_id text;
BEGIN
  IF p_event IS NULL OR p_event NOT IN ('booking_request', 'booking_accepted', 'booking_rejected', 'booking_confirmed',
      'booking_completed', 'booking_canceled', 'feedback_received_by_mentor', 'feedback_received_by_mentee') THEN
    RAISE EXCEPTION 'invalid_event' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_m FROM public.mentors WHERE id = v_b.mentor_id;
  SELECT * INTO v_me FROM public.mentees WHERE id = v_b.mentee_id;
  IF v_m.id IS NULL OR v_me.id IS NULL THEN RAISE EXCEPTION 'booking_parties_missing' USING ERRCODE = 'P0002'; END IF;

  v_is_mentor := public.owns_mentor(v_b.mentor_id);
  v_is_mentee := public.owns_mentee(v_b.mentee_id);
  -- Anonymous (and unrelated signed-in) callers may only announce a request they just created.
  IF NOT public.is_privileged() AND NOT (v_is_mentor OR v_is_mentee) THEN
    IF p_event <> 'booking_request' OR v_b.created_at < timezone('utc', now()) - interval '10 minutes' THEN
      RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF (p_event = 'booking_request'  AND v_b.status <> 'pending')
  OR (p_event = 'booking_accepted' AND v_b.status <> 'accepted')
  OR (p_event = 'booking_rejected' AND v_b.status <> 'rejected')
  OR (p_event = 'booking_confirmed' AND v_b.status <> 'confirmed')
  OR (p_event = 'booking_completed' AND v_b.status <> 'completed')
  OR (p_event = 'booking_canceled' AND v_b.status <> 'canceled')
  OR (p_event = 'feedback_received_by_mentor' AND v_b.mentee_rating IS NULL)
  OR (p_event = 'feedback_received_by_mentee' AND v_b.mentor_rating IS NULL) THEN
    RAISE EXCEPTION 'event_state_mismatch' USING ERRCODE = '22023';
  END IF;

  CASE p_event
    WHEN 'booking_request' THEN
      v_to := v_m.email; v_to_type := 'mentor'; v_type := 'booking_request'; v_title := 'New booking request';
      v_msg := v_me.name || ' has requested a mentorship session with you.' || coalesce(' Goal: ' || v_b.goal, '');
    WHEN 'booking_accepted' THEN
      -- Scheduling happens only through the tagged embed on the dashboard (design D4): a raw
      -- cal.com link would book without metadata[mc_booking] and bypass the embed confirm.
      v_to := v_me.email; v_to_type := 'mentee'; v_type := 'booking_accepted'; v_title := 'Booking request accepted';
      v_msg := v_m.name || ' has accepted your mentorship request.'
            || CASE WHEN v_m.managed_by_programme THEN ' The programme team will email you to arrange a time.'
                    WHEN coalesce(v_m.cal_link, '') <> '' THEN ' Choose a time from your MentorConnect dashboard.'
                    ELSE '' END;
    WHEN 'booking_rejected' THEN
      v_to := v_me.email; v_to_type := 'mentee'; v_type := 'booking_rejected'; v_title := 'Booking request declined';
      v_msg := v_m.name || ' was unable to accept your mentorship request at this time.';
    WHEN 'booking_confirmed' THEN
      v_to := v_m.email; v_to_type := 'mentor'; v_type := 'booking_confirmed'; v_title := 'Session scheduled';
      v_msg := v_me.name || ' has scheduled a session with you' || coalesce(' for ' || to_char(v_b.scheduled_at, 'YYYY-MM-DD HH24:MI') || ' UTC', '') || '.';
    WHEN 'booking_completed' THEN
      v_to := v_me.email; v_to_type := 'mentee'; v_type := 'booking_completed'; v_title := 'Session completed';
      v_msg := 'Your session with ' || v_m.name || ' has been marked completed. You can now leave feedback.';
    WHEN 'booking_canceled' THEN
      IF v_b.canceled_by = 'admin' AND NOT (v_is_mentor OR v_is_mentee) THEN
        -- The programme team canceled (R1-68): both parties are told, and neither is named as the
        -- one who canceled. The mentor's notice is written here (a programme-managed mentor has no
        -- inbox of their own: the admins acted themselves); the mentee's follows below.
        v_to := lower(v_m.email);
        IF NOT v_m.managed_by_programme AND nullif(trim(coalesce(v_to, '')), '') IS NOT NULL AND v_to NOT LIKE '%.invalid'
           AND NOT EXISTS (SELECT 1 FROM public.notifications n
                           WHERE n.booking_id = v_b.id AND n.type = 'booking_canceled' AND n.recipient_email = v_to
                             AND n.created_at > timezone('utc', now()) - interval '5 minutes') THEN
          INSERT INTO public.notifications (id, recipient_email, recipient_type, type, title, message, booking_id, is_read, created_at)
          VALUES (gen_random_uuid()::text, v_to, 'mentor', 'booking_canceled', 'Session canceled',
                  'The programme team has canceled your session with ' || v_me.name || '.', v_b.id, false, timezone('utc', now()));
        END IF;
        v_to := v_me.email; v_to_type := 'mentee';
        v_msg := 'The programme team has canceled your session with ' || v_m.name || '.';
      -- Otherwise the other party is told: the mentee when the mentor canceled.
      ELSIF v_is_mentor OR (NOT v_is_mentee AND v_b.canceled_by = 'mentor') THEN
        v_to := v_me.email; v_to_type := 'mentee'; v_msg := v_m.name || ' has canceled your session.';
      ELSE
        v_to := v_m.email; v_to_type := 'mentor'; v_msg := v_me.name || ' has canceled the session.';
      END IF;
      v_type := 'booking_canceled'; v_title := 'Session canceled';
    WHEN 'feedback_received_by_mentor' THEN
      v_to := v_m.email; v_to_type := 'mentor'; v_type := 'feedback_received'; v_title := 'New feedback received';
      v_msg := v_me.name || ' has left you feedback and rated your session ' || v_b.mentee_rating || '/5 stars.'
            || coalesce(' Their feedback: "' || nullif(v_b.mentee_feedback, '') || '"', '');
    WHEN 'feedback_received_by_mentee' THEN
      v_to := v_me.email; v_to_type := 'mentee'; v_type := 'feedback_received'; v_title := 'New feedback from your mentor';
      v_msg := v_m.name || ' has left you feedback and rated your session ' || v_b.mentor_rating || '/5 stars.'
            || coalesce(' Their feedback: "' || nullif(v_b.mentor_feedback, '') || '"', '');
  END CASE;

  IF v_to_type = 'mentor' AND v_m.managed_by_programme THEN
    -- Every admin answers for a programme-managed mentor (as for the request itself).
    WITH sent AS (
      INSERT INTO public.notifications (id, recipient_email, recipient_type, type, title, message, booking_id, is_read, created_at)
      SELECT gen_random_uuid()::text, lower(u.email), 'mentor', v_type,
             v_title || ' for ' || v_m.name || ' (programme-managed)', v_msg, v_b.id, false, timezone('utc', now())
      FROM public.users u
      WHERE u.user_type = 'admin' AND nullif(trim(u.email), '') IS NOT NULL AND lower(u.email) NOT LIKE '%.invalid'
        AND NOT EXISTS (SELECT 1 FROM public.notifications n
                        WHERE n.booking_id = v_b.id AND n.type = v_type AND n.recipient_email = lower(u.email)
                          AND n.created_at > timezone('utc', now()) - interval '5 minutes')
      RETURNING id)
    SELECT min(id) INTO v_id FROM sent;
    RETURN v_id;
  END IF;

  v_to := lower(v_to);  -- session emails are lowercase; the bell filters by equality
  IF nullif(trim(coalesce(v_to, '')), '') IS NULL OR v_to LIKE '%.invalid' THEN
    RETURN NULL;
  END IF;
  SELECT id INTO v_id FROM public.notifications
  WHERE booking_id = v_b.id AND type = v_type AND recipient_email = v_to
    AND created_at > timezone('utc', now()) - interval '5 minutes' LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  v_id := gen_random_uuid()::text;
  INSERT INTO public.notifications (id, recipient_email, recipient_type, type, title, message, booking_id, is_read, created_at)
  VALUES (v_id, v_to, v_to_type, v_type, v_title, v_msg, v_b.id, false, timezone('utc', now()));
  RETURN v_id;
END $$;

-- The v2 mentee lookup of the pre-release client, redefined for the same reason: the profile of
-- an address that has an account is reached only by that account or the server (grants kept, see
-- above). Identical to supabase_setup_v2.sql §5.
CREATE OR REPLACE FUNCTION public.get_or_create_mentee(p_email text, p_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_email text := trim(coalesce(p_email, '')); v_id text;
BEGIN
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_privileged() AND lower(v_email) IS DISTINCT FROM public.current_email()
     AND EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = lower(v_email)) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501', DETAIL = 'sign_in_required';
  END IF;
  SELECT id INTO v_id FROM public.mentees WHERE lower(email) = lower(v_email) LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  v_id := gen_random_uuid()::text;
  INSERT INTO public.mentees (id, name, email, user_type, timezone, languages_spoken, areas_exploring, verification_status, created_at)
  VALUES (v_id, left(coalesce(nullif(trim(p_name), ''), split_part(v_email, '@', 1)), 120), v_email, 'individual', 'UTC',
          ARRAY['English'], ARRAY['Career Development'], 'unverified', timezone('utc', now()));
  RETURN v_id;
END $$;


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

-- Cal.com uids a booking moved away from (a reschedule, a correction, a rejected or released time).
-- A late delivery about one of them is stale: it never moves the booking back (cal_apply_event),
-- and the embed cannot record one again (record_cal_booking_from_embed). Written only by those
-- SECURITY DEFINER functions: RLS on, no policies, no client privileges.
CREATE TABLE IF NOT EXISTS public.booking_cal_superseded_uids (
  booking_id    varchar NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  uid           text NOT NULL,
  superseded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, uid)
);
ALTER TABLE public.booking_cal_superseded_uids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_cal_superseded_uids FROM PUBLIC, anon, authenticated;

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
-- The signed delivery is authoritative: it records the uid it vouched for (cal_verified_uid),
-- and it corrects a uid, start or status that only the mentee's browser reported through
-- record_cal_booking_from_embed (found through metadata.mc_booking, cross-checked as usual).
-- Deliveries can overtake each other (RESCHEDULED B→C before A→B, CANCELLED(B) before the
-- reschedule to B, REJECTED(A) before REQUESTED(A)): a cancellation, rejection or reschedule that
-- matches nothing is parked on its cal_webhook_events row and replayed once a booking of that
-- mentor holds the uid it names (7 days). Parked rows end as 'replayed' or 'replay_failed'.
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
  v_unverified boolean;  -- the booking's Cal.com uid came only from the browser (or is missing)
  v_outcome   text;
  v_changed   boolean := false;
  v_notify    text;   -- 'cancelled' | 'moved' | 'time_declined' | 'time_confirmed' | 'time_waiting'
  v_when      text;
  v_replaying boolean := coalesce(current_setting('mc.cal_replay_depth', true), '') <> '';
  v_uid_now   text;
  v_parked    public.cal_webhook_events%ROWTYPE;
  v_replays   int := 0;
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
    -- M (a hint from the booker): our booking id, only for this mentor and an attendee who is the
    -- booking's mentee. It never moves a booking whose uid Cal.com already verified onto another
    -- uid; a uid only the browser reported is corrected here, by a reschedule too.
    IF v_b.id IS NULL AND p_mc_booking IS NOT NULL
       AND v_trigger IN ('BOOKING_CREATED', 'BOOKING_REQUESTED', 'BOOKING_RESCHEDULED') THEN
      SELECT b.* INTO v_b FROM public.bookings b
      JOIN public.mentees me ON me.id = b.mentee_id
      WHERE b.id = p_mc_booking AND b.mentor_id = v_mentor.id AND lower(me.email) = ANY (v_emails)
      FOR UPDATE OF b;
      IF v_b.id IS NOT NULL AND v_b.cal_event_uri IS NOT NULL AND v_b.cal_event_uri <> p_uid
         AND v_b.cal_verified_uid IS NOT DISTINCT FROM v_b.cal_event_uri THEN
        v_b := NULL;
      END IF;
    END IF;
    IF v_b.id IS NULL AND v_trigger IN ('BOOKING_CREATED', 'BOOKING_REQUESTED') THEN
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
    -- A delivery about a uid this booking already moved away from (it arrived late, after a
    -- reschedule or a rejected time) changes nothing.
    IF EXISTS (SELECT 1 FROM public.booking_cal_superseded_uids s WHERE s.booking_id = v_b.id AND s.uid = p_uid) THEN
      v_outcome := 'stale_state';
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
    v_unverified := v_b.cal_event_uri IS NULL OR v_b.cal_verified_uid IS DISTINCT FROM v_b.cal_event_uri;

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
          v_outcome := 'confirmed'; v_changed := true; v_notify := 'time_confirmed';
        END IF;
      ELSIF v_b.status = 'canceled' AND v_b.canceled_by = 'cal' AND p_reschedule_uid IS NOT NULL
            AND v_b.cal_event_uri = p_reschedule_uid AND v_b.canceled_at >= v_now - interval '7 days' THEN
        -- CANCELLED(old uid) arrived before RESCHEDULED(new uid): bring the session back.
        IF v_status = 'PENDING' THEN
          UPDATE public.bookings
          SET status = 'accepted', cal_status = 'requested', cal_requested_start = v_start, scheduled_at = NULL,
              cal_event_uri = p_uid, canceled_at = NULL, canceled_by = NULL
          WHERE id = v_b.id;
          v_notify := 'time_waiting';   -- both were told it was cancelled; it waits for the mentor now
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
        ELSIF v_b.status = 'confirmed' AND v_b.cal_event_uri = p_uid AND NOT v_unverified THEN
          v_outcome := 'no_change';   -- the request arrived after its confirmation
        ELSIF v_b.status = 'confirmed' AND v_unverified THEN
          -- Only the browser said this time was confirmed; Cal.com says it still waits for the
          -- mentor: back to a requested time.
          UPDATE public.bookings
          SET status = 'accepted', cal_status = 'requested', cal_requested_start = v_start, scheduled_at = NULL,
              cal_event_uri = p_uid
          WHERE id = v_b.id;
          DELETE FROM public.booking_reminders WHERE booking_id = v_b.id;
          v_outcome := 'requested'; v_changed := true;
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
          -- The mentor confirmed on Cal.com a time the mentee picked earlier: the mentee is waiting.
          IF v_b.cal_status = 'requested' THEN v_notify := 'time_confirmed'; END IF;
        ELSIF v_b.status = 'confirmed' AND v_b.cal_event_uri = p_uid THEN
          IF v_b.scheduled_at IS DISTINCT FROM v_start THEN
            UPDATE public.bookings SET scheduled_at = v_start WHERE id = v_b.id;
            DELETE FROM public.booking_reminders WHERE booking_id = v_b.id;
            v_outcome := 'rescheduled'; v_changed := true; v_notify := 'moved';
          ELSE
            v_outcome := 'no_change';
          END IF;
        ELSIF v_b.status = 'confirmed' AND v_unverified THEN
          -- The browser reported another uid (or none) for this session: Cal.com's uid and start win.
          UPDATE public.bookings
          SET cal_event_uri = p_uid, scheduled_at = v_start, cal_status = 'accepted', cal_requested_start = NULL
          WHERE id = v_b.id;
          IF v_b.scheduled_at IS DISTINCT FROM v_start THEN
            DELETE FROM public.booking_reminders WHERE booking_id = v_b.id;
            v_outcome := 'rescheduled'; v_notify := 'moved';
          ELSE
            v_outcome := 'confirmed';
          END IF;
          v_changed := true;
        ELSE
          v_outcome := 'stale_state';
        END IF;
      END IF;
    END IF;
  END apply;

  -- The uid this delivery moved the booking away from, if any, is superseded.
  IF v_b.id IS NOT NULL AND v_b.cal_event_uri IS NOT NULL THEN
    INSERT INTO public.booking_cal_superseded_uids (booking_id, uid)
    SELECT b.id, v_b.cal_event_uri FROM public.bookings b
    WHERE b.id = v_b.id AND b.cal_event_uri IS DISTINCT FROM v_b.cal_event_uri
    ON CONFLICT DO NOTHING;
  END IF;

  -- Provenance: this signed delivery vouches for the booking's Cal.com uid, or for its having none
  -- (a rejected or released time). record_cal_booking_from_embed never overwrites a verified uid.
  IF v_b.id IS NOT NULL AND v_outcome IN ('confirmed', 'requested', 'rejected', 'canceled', 'cal_booking_released',
                                          'rescheduled', 'reschedule_requested', 'rescheduled_revived', 'no_change') THEN
    UPDATE public.bookings
    SET cal_verified_uid = CASE WHEN cal_event_uri = p_uid THEN p_uid END
    WHERE id = v_b.id AND cal_verified_uid IS DISTINCT FROM (CASE WHEN cal_event_uri = p_uid THEN p_uid END);
  END IF;

  -- Notifications to the parties (programme-managed placeholder addresses skipped): both for a
  -- cancellation, a move or a revived session that waits for the mentor, the mentee alone for a
  -- declined or a confirmed pick. A party whose title is NULL is not told.
  IF v_notify IS NOT NULL THEN
    SELECT * INTO v_mentee FROM public.mentees WHERE id = v_b.mentee_id;
    v_when := to_char(v_start, 'YYYY-MM-DD HH24:MI') || ' UTC';
    INSERT INTO public.notifications (id, recipient_email, recipient_type, type, title, message, booking_id, is_read, created_at)
    SELECT gen_random_uuid()::text, lower(r.email), r.kind, r.ntype, r.title, r.message, v_b.id, false, v_now
    FROM (VALUES
      ('mentor', v_mentor.email,
       CASE v_notify WHEN 'cancelled' THEN 'booking_canceled' WHEN 'time_waiting' THEN 'booking_accepted' ELSE 'booking_confirmed' END,
       CASE v_notify WHEN 'cancelled' THEN 'Session cancelled on Cal.com' WHEN 'moved' THEN 'Session moved'
                     WHEN 'time_waiting' THEN 'New time to confirm' END,
       CASE v_notify
         WHEN 'cancelled' THEN 'Your session with ' || coalesce(v_mentee.name, 'your mentee') || ' was cancelled on Cal.com.'
                               || coalesce(' Reason: ' || v_reason, '')
         WHEN 'moved' THEN 'Your session with ' || coalesce(v_mentee.name, 'your mentee') || ' moved to ' || v_when || '.'
         WHEN 'time_waiting' THEN 'Your session with ' || coalesce(v_mentee.name, 'your mentee') || ' was not cancelled: it moved to '
                                  || v_when || ' and waits for you to confirm it on Cal.com.' END),
      ('mentee', v_mentee.email,
       CASE v_notify WHEN 'cancelled' THEN 'booking_canceled' WHEN 'moved' THEN 'booking_confirmed'
                     WHEN 'time_confirmed' THEN 'booking_confirmed' ELSE 'booking_accepted' END,
       CASE v_notify WHEN 'cancelled' THEN 'Session cancelled on Cal.com' WHEN 'moved' THEN 'Session moved'
                     WHEN 'time_declined' THEN 'Choose another time' WHEN 'time_confirmed' THEN 'Session confirmed'
                     WHEN 'time_waiting' THEN 'New time waiting for confirmation' END,
       CASE v_notify
         WHEN 'cancelled' THEN 'Your session with ' || v_mentor.name || ' was cancelled on Cal.com.'
                               || coalesce(' Reason: ' || v_reason, '')
         WHEN 'moved' THEN 'Your session with ' || v_mentor.name || ' moved to ' || v_when || '.'
         WHEN 'time_declined' THEN v_mentor.name || ' could not confirm the time you picked on Cal.com. Please choose another time.'
         WHEN 'time_confirmed' THEN v_mentor.name || ' confirmed your session for ' || v_when || '.'
         WHEN 'time_waiting' THEN 'Your session with ' || v_mentor.name || ' was not cancelled: it moved to ' || v_when
                                  || ' and waits for ' || v_mentor.name || ' to confirm it on Cal.com.' END)
    ) AS r (kind, email, ntype, title, message)
    WHERE r.title IS NOT NULL
      AND nullif(trim(coalesce(r.email, '')), '') IS NOT NULL
      AND lower(r.email) NOT LIKE '%.invalid';
  END IF;

  UPDATE public.cal_webhook_events
  SET outcome = v_outcome, booking_id = v_b.id, mentor_id = coalesce(p_mentor_id, v_mentor.id), processed_at = now(),
      -- A cancellation, rejection or reschedule that matched nothing may have overtaken the delivery
      -- it follows: park its arguments for the replay below.
      parked = CASE WHEN v_outcome = 'unmatched' AND NOT v_replaying AND coalesce(p_mentor_id, v_mentor.id) IS NOT NULL
                         AND (v_trigger IN ('BOOKING_CANCELLED', 'BOOKING_REJECTED') OR p_reschedule_uid IS NOT NULL)
                    THEN jsonb_build_object('mentor_id', p_mentor_id, 'reschedule_uid', p_reschedule_uid,
                                            'start', p_start, 'end', p_end, 'status', p_status,
                                            'emails', to_jsonb(coalesce(p_attendee_emails, '{}'::text[])),
                                            'mc_booking', p_mc_booking, 'organizer', p_organizer_username,
                                            'reason', p_reason) END
  WHERE id = p_delivery_id;
  IF p_mentor_id IS NOT NULL AND NOT v_replaying THEN
    UPDATE public.mentor_cal_webhooks
    SET last_delivery_at = now(), last_trigger = v_trigger, last_outcome = v_outcome,
        deliveries_total = deliveries_total + 1
    WHERE mentor_id = p_mentor_id;
  END IF;

  -- Replay of parked deliveries: once this booking holds a uid that a parked CANCELLED or REJECTED
  -- names, or that a parked reschedule moved away from, those deliveries are applied in arrival
  -- order, each as its own delivery '<id>:replay' through the same transition table, and the parked
  -- row becomes 'replayed' ('replay_failed' if applying it raised; the delivery at hand still
  -- stands). A replay can give the booking a new uid, so the lookup repeats, at most 5 times.
  IF v_b.id IS NOT NULL AND NOT v_replaying THEN
    PERFORM set_config('mc.cal_replay_depth', '1', true);
    LOOP
      SELECT b.cal_event_uri INTO v_uid_now FROM public.bookings b WHERE b.id = v_b.id;
      EXIT WHEN v_uid_now IS NULL OR v_replays >= 5;
      UPDATE public.cal_webhook_events e
      SET outcome = 'replayed', processed_at = now()
      WHERE e.id = (SELECT p.id FROM public.cal_webhook_events p
                    WHERE p.outcome = 'unmatched' AND p.parked IS NOT NULL AND p.mentor_id = v_b.mentor_id
                      AND p.received_at > now() - interval '7 days'
                      AND ((p.trigger IN ('BOOKING_CANCELLED', 'BOOKING_REJECTED') AND p.booking_uid = v_uid_now)
                           OR p.parked ->> 'reschedule_uid' = v_uid_now)
                    ORDER BY p.received_at, p.id
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED)
      RETURNING e.* INTO v_parked;
      EXIT WHEN v_parked.id IS NULL;
      v_replays := v_replays + 1;
      BEGIN
        PERFORM public.cal_apply_event(v_parked.id || ':replay', v_parked.parked ->> 'mentor_id', v_parked.trigger,
          v_parked.booking_uid, v_parked.parked ->> 'reschedule_uid', (v_parked.parked ->> 'start')::timestamptz,
          (v_parked.parked ->> 'end')::timestamptz, v_parked.parked ->> 'status',
          ARRAY(SELECT jsonb_array_elements_text(coalesce(v_parked.parked -> 'emails', '[]'::jsonb))),
          v_parked.parked ->> 'mc_booking', v_parked.parked ->> 'organizer', v_parked.parked ->> 'reason',
          v_parked.payload_sha256);
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.cal_webhook_events SET outcome = 'replay_failed', processed_at = now() WHERE id = v_parked.id;
        RAISE WARNING 'cal_apply_event: replaying % failed: %', v_parked.id, SQLERRM;
      END;
    END LOOP;
    PERFORM set_config('mc.cal_replay_depth', '', true);
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
-- What the browser reports is provisional: once the signed webhook has verified the booking's
-- uid (cal_verified_uid), this function never changes it, and a later delivery corrects any
-- uid, start or status recorded here (cal_apply_event).
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
  -- The uid and start come from the mentee's browser (the Cal.com embed event), not from Cal.com.
  -- A booking made a moment ago starts in the future, so a start in the past or beyond a year is
  -- refused. The Cal.com webhook, verified by HMAC, stays the authority for later changes.
  IF v_start < v_now - interval '1 hour' OR v_start > v_now + interval '366 days' THEN
    RAISE EXCEPTION 'invalid_state' USING ERRCODE = '22023', DETAIL = 'start outside the bookable window';
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
  -- A uid this booking already moved away from (a stale success event replayed by the browser).
  IF EXISTS (SELECT 1 FROM public.booking_cal_superseded_uids s WHERE s.booking_id = v_b.id AND s.uid = p_uid) THEN
    RETURN jsonb_build_object('outcome', 'already_recorded', 'booking_id', v_b.id);
  END IF;
  -- Cal.com's signed webhook already delivered this booking (or the one being rescheduled): its
  -- record stands, and a reschedule reaches it through the webhook too.
  IF v_b.status IN ('accepted', 'confirmed') AND v_b.cal_event_uri IS NOT NULL
     AND v_b.cal_verified_uid = v_b.cal_event_uri
     AND (p_uid = v_b.cal_event_uri OR p_reschedule_uid = v_b.cal_event_uri) THEN
    RETURN jsonb_build_object('outcome', 'already_recorded', 'booking_id', v_b.id);
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
  -- A reschedule through the embed supersedes the uid it replaced.
  IF p_reschedule_uid IS NOT NULL AND p_reschedule_uid IS DISTINCT FROM p_uid
     AND v_outcome IN ('rescheduled', 'reschedule_requested', 'requested', 'confirmed')
     AND p_reschedule_uid IS NOT DISTINCT FROM v_b.cal_event_uri THEN
    INSERT INTO public.booking_cal_superseded_uids (booking_id, uid) VALUES (v_b.id, p_reschedule_uid)
    ON CONFLICT DO NOTHING;
  END IF;

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

-- Policies (identical to supabase_setup_v2.sql §6): the bucket is public, so object URLs need no
-- policy and a SELECT policy would only open the list API (every file name, and the account ids in
-- profiles/<uid>/ paths). Signed-in users list their own objects, admins all; profiles/ uploads
-- go only into the uploader's own folder. The live client's flat mentors/ and mentees/ uploads
-- (random file names) and its public URLs keep working.
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view uploaded files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;
CREATE POLICY "Authenticated users can upload files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uploads'
              AND (split_part(name, '/', 1) <> 'profiles' OR split_part(name, '/', 2) = auth.uid()::text));
CREATE POLICY "Users can view their own files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'uploads' AND (owner_id = auth.uid()::text OR public.is_admin()));
CREATE POLICY "Users can update their own files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'uploads' AND (owner_id = auth.uid()::text OR public.is_admin()));
CREATE POLICY "Users can delete their own files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'uploads' AND (owner_id = auth.uid()::text OR public.is_admin()));


-- =============================================================================
-- §13 SIZE LIMITS, READ-ONLY NOTIFICATIONS
-- =============================================================================
-- (The featured-mentor seed is migrations/0004_seed_featured_mentors.sql, run separately.)
-- Free text the parties write is bounded far above what anyone types (the forms set no limit),
-- so a signed-in user cannot store megabytes per row. A limit that existing rows already exceed
-- applies to new writes only (NOT VALID) and is reported. activity_events inserts are bounded by
-- their policy (§3).
DO $$
DECLARE
  r record;
  v_over bigint;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('booking_notes', 'booking_notes_content_length', 'length(content) <= 10000'),
      ('mentor_tasks', 'mentor_tasks_title_length', 'length(title) <= 500'),
      ('mentor_tasks', 'mentor_tasks_description_length', 'length(description) <= 10000')
    ) AS t (tbl, con, expr)
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.con);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID', r.tbl, r.con, r.expr);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE NOT (%s)', r.tbl, r.expr) INTO v_over;
    IF v_over = 0 THEN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', r.tbl, r.con);
    ELSE
      RAISE WARNING '0002: % rows of public.% break "%"; the limit applies to new writes only', v_over, r.tbl, r.expr;
    END IF;
  END LOOP;
END $$;

-- A recipient marks a notification read; the rest of the row (title, message, recipient, booking)
-- is written by the database only. Same lines as supabase_setup_v2.sql §3.
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;


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
  v_squatted text;
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
  -- A featured id taken before this file reserved it (any approved mentor could insert a mentors
  -- row, any signed-in user a mentees row, with one): migrations/0004 refuses to seed until an
  -- admin deletes that row (R2-17).
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '0004_seed_featured_mentors') THEN
    SELECT string_agg(x.line, ', ' ORDER BY x.id) INTO v_squatted
    FROM (SELECT m.id, format('%s (mentors row, %s)', m.id, m.email) AS line
          FROM public.mentors m JOIN public.reserved_mentor_ids r ON r.id = m.id
          UNION ALL
          SELECT me.id, format('%s (mentees row, %s)', me.id, me.email)
          FROM public.mentees me JOIN public.reserved_mentor_ids r ON r.id = me.id) x;
    IF v_squatted IS NOT NULL THEN
      RAISE WARNING '0002: rows already hold a reserved featured-mentor id (delete them before migrations/0004): %', v_squatted
        USING HINT = 'They were created before 0002 reserved the ids. Delete each named row from public.mentors or public.mentees.';
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
