-- =============================================================================
-- MentorConnect — Supabase setup v2 (Amazon readiness)
-- =============================================================================
-- Run this in the Supabase SQL editor. It is idempotent: every statement uses
-- IF [NOT] EXISTS / CREATE OR REPLACE / drop-then-create, so it can be re-run
-- on a project that already ran supabase_setup.sql (v1) or on a fresh project
-- once the tables exist (drizzle `db:push` from shared/schema.ts).
--
-- Threat model this file closes (v1 left all of these open):
--   * PII exposure: v1 let ANYONE (anon key) read every mentors column —
--     email, assistant email, LinkedIn, Cal.com links. v2 exposes a
--     `mentors_public` view with directory columns only; full rows are
--     visible to the owning mentor and admins.
--   * Spoofed notifications: v1 let any signed-in user INSERT any notification
--     for any recipient. v2 removes the INSERT policy; notifications are only
--     created by `notify_booking_event()`, which derives recipient + text from
--     the booking itself.
--   * Fake earnings / activity: v1 let any signed-in user INSERT earnings and
--     activity rows for any mentor. v2 routes both through SECURITY DEFINER
--     functions that check the caller is a party.
--   * Anonymous spam: anonymous booking requests stay possible (the product
--     needs them) but are validated (mentor must exist and be available,
--     status must be pending) and rate-limited by triggers.
--   * Privilege escalation: `users.user_type` / `amazon_alias` and mentee
--     verification columns can only be changed by an admin or the service role.
--
-- Roles: anon (public key, no session), authenticated (Supabase session),
-- service_role (Vercel functions only), admin (users.user_type = 'admin').
-- Sections: 1 DDL · 2 helpers · 3 views · 4 RLS · 5 rate limits · 6 storage ·
-- 7 triggers/indexes · 8 first admin · 9 verification.
-- =============================================================================


-- =============================================================================
-- 1. DDL DELTAS (mirrors shared/schema.ts; also in migrations/0001_amazon_readiness.sql)
-- =============================================================================
-- drizzle `text({ enum })` columns are plain text in Postgres, so the enum
-- guarantees below are explicit CHECK constraints. `timestamp({ mode: 'string' })`
-- is `timestamp without time zone`; `varchar()` is unbounded character varying.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS amazon_alias text;
CREATE UNIQUE INDEX IF NOT EXISTS users_amazon_alias_unique ON public.users (amazon_alias);
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_user_type_check;
ALTER TABLE public.users ADD CONSTRAINT users_user_type_check
  CHECK (user_type IN ('mentor', 'mentee', 'admin'));

ALTER TABLE public.mentees ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified';
ALTER TABLE public.mentees ADD COLUMN IF NOT EXISTS verification_reference text;
ALTER TABLE public.mentees DROP CONSTRAINT IF EXISTS mentees_verification_status_check;
ALTER TABLE public.mentees ADD CONSTRAINT mentees_verification_status_check
  CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected'));

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS session_duration_minutes integer;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_session_duration_minutes_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_session_duration_minutes_check
  CHECK (session_duration_minutes IS NULL OR session_duration_minutes BETWEEN 0 AND 600);

CREATE TABLE IF NOT EXISTS public.approved_users (
  id           varchar PRIMARY KEY,
  amazon_alias text NOT NULL UNIQUE,
  email        text,
  role         text NOT NULL DEFAULT 'mentor',
  mentor_id    varchar REFERENCES public.mentors (id),
  is_active    boolean NOT NULL DEFAULT true,
  approved_by  text,
  approved_at  timestamp NOT NULL,
  note         text
);
ALTER TABLE public.approved_users DROP CONSTRAINT IF EXISTS approved_users_role_check;
ALTER TABLE public.approved_users ADD CONSTRAINT approved_users_role_check CHECK (role IN ('mentor', 'admin'));

CREATE TABLE IF NOT EXISTS public.access_requests (
  id           varchar PRIMARY KEY,
  amazon_alias text NOT NULL,
  email        text,
  name         text,
  status       text NOT NULL DEFAULT 'pending',
  requested_at timestamp NOT NULL,
  resolved_at  timestamp,
  resolved_by  text,
  note         text
);
ALTER TABLE public.access_requests DROP CONSTRAINT IF EXISTS access_requests_status_check;
ALTER TABLE public.access_requests ADD CONSTRAINT access_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected'));
-- One open request per alias (the SSO callback upserts on this).
CREATE UNIQUE INDEX IF NOT EXISTS access_requests_pending_alias_unique
  ON public.access_requests (lower(amazon_alias)) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.user_identifiers (
  id            varchar PRIMARY KEY,
  user_id       varchar NOT NULL REFERENCES public.users (id),
  provider      text NOT NULL DEFAULT 'amazon',
  subject       text NOT NULL,
  email         text,
  claims        jsonb,
  created_at    timestamp NOT NULL,
  last_login_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS user_identifiers_provider_subject_unique
  ON public.user_identifiers (provider, lower(subject));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'mentors', 'mentees', 'bookings', 'booking_notes', 'notifications', 'mentor_tasks',
      'mentor_availability', 'mentor_earnings', 'mentor_activity_log', 'approved_users', 'access_requests', 'user_identifiers']
  LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t); END LOOP;
END $$;


-- =============================================================================
-- 2. HELPER FUNCTIONS
-- =============================================================================
-- SECURITY DEFINER helpers run as the table owner, which (a) sidesteps RLS
-- recursion (a bookings policy that reads mentees whose policy reads bookings
-- would otherwise loop) and (b) lets anon-facing checks read tables anon has no
-- grant on. Each one only answers a yes/no question about the caller.

CREATE OR REPLACE FUNCTION public.current_email()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT lower(nullif(auth.jwt() ->> 'email', ''));
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE auth.uid() IS NOT NULL AND u.id = auth.uid()::text AND u.user_type = 'admin'
  );
$$;

-- True for the service role key (Vercel functions) and for direct DB sessions
-- with no JWT (SQL editor, migrations). Never true for anon/authenticated:
-- PostgREST always sets a JWT role, and its connections start as
-- `authenticator` (session_user is stable inside SECURITY DEFINER code,
-- current_user is not).
CREATE OR REPLACE FUNCTION public.is_service_context()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(auth.role() = 'service_role', false)
      OR (auth.role() IS NULL AND session_user NOT IN ('authenticator', 'anon', 'authenticated'));
$$;

CREATE OR REPLACE FUNCTION public.is_privileged()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.is_admin() OR public.is_service_context();
$$;

-- An admin can link an approved alias to an existing mentors row whose email
-- differs from the Amazon identity email; users.profile_id records that link.
CREATE OR REPLACE FUNCTION public.owns_profile(p_profile_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid()::text AND u.profile_id = p_profile_id);
$$;

CREATE OR REPLACE FUNCTION public.owns_mentor(p_mentor_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = p_mentor_id AND lower(m.email) = public.current_email())
      OR public.owns_profile(p_mentor_id);
$$;

CREATE OR REPLACE FUNCTION public.owns_mentee(p_mentee_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.mentees me WHERE me.id = p_mentee_id AND lower(me.email) = public.current_email());
$$;

-- The calling mentor has (had) a booking with this mentee → may read the mentee profile.
CREATE OR REPLACE FUNCTION public.mentor_has_booking_with(p_mentee_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b JOIN public.mentors m ON m.id = b.mentor_id
    WHERE b.mentee_id = p_mentee_id AND lower(m.email) = public.current_email()
  );
$$;

-- Allow-list gate for creating a mentor profile: an active approved_users row
-- for the caller's email or Amazon alias (or the caller is an admin).
CREATE OR REPLACE FUNCTION public.is_approved_mentor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.approved_users a
    LEFT JOIN public.users u ON u.id = auth.uid()::text
    WHERE a.is_active AND a.role = 'mentor'
      AND (lower(a.email) = public.current_email()
           OR (u.amazon_alias IS NOT NULL AND lower(a.amazon_alias) = lower(u.amazon_alias)))
  );
$$;

-- Used by the anonymous booking INSERT check (anon has no SELECT on mentors/mentees).
CREATE OR REPLACE FUNCTION public.mentor_is_bookable(p_mentor_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = p_mentor_id AND m.is_available);
$$;

CREATE OR REPLACE FUNCTION public.mentee_exists(p_mentee_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.mentees me WHERE me.id = p_mentee_id);
$$;

GRANT EXECUTE ON FUNCTION public.current_email(), public.is_admin(), public.is_service_context(),
  public.is_privileged(), public.owns_profile(text), public.owns_mentor(text), public.owns_mentee(text),
  public.mentor_has_booking_with(text), public.is_approved_mentor(),
  public.mentor_is_bookable(text), public.mentee_exists(text)
  TO anon, authenticated, service_role;


-- =============================================================================
-- 3. VIEWS — public directory and per-booking scheduling links
-- =============================================================================
-- Both views are created with security_invoker = false (the Postgres default;
-- the option itself exists since Postgres 15). A default view runs its query
-- as the view OWNER, so RLS on `mentors` is evaluated for the owner (postgres,
-- who also owns the table and is therefore not subject to RLS) rather than for
-- the caller. That is deliberate: it is the only way an anonymous visitor can
-- see directory rows after we revoke their access to the underlying table.
-- With security_invoker = true the view would be filtered by the caller's
-- policies and the public directory would be empty for anon. Supabase's
-- linter flags such views as "security definer view" — expected here. The
-- exposure is bounded by the column list below; keep it free of contact data.

DROP VIEW IF EXISTS public.mentors_public;
CREATE VIEW public.mentors_public WITH (security_invoker = false) AS
  SELECT id, name, name_ar, company, company_ar, position, position_ar, timezone, country,
         photo_url, bio, bio_ar, expertise, expertise_ar, industries, industries_ar,
         languages_spoken, mentorship_preference, is_available, average_rating, total_ratings,
         created_at
  FROM public.mentors;
GRANT SELECT ON public.mentors_public TO anon, authenticated, service_role;

-- Mentees see a mentor's Cal.com links only for their own accepted/confirmed/
-- completed bookings. The filter uses the caller's JWT email even though the
-- view runs as owner, so each caller only ever sees their own rows.
DROP VIEW IF EXISTS public.mentor_scheduling_links;
CREATE VIEW public.mentor_scheduling_links WITH (security_invoker = false) AS
  SELECT b.id AS booking_id, m.id AS mentor_id, m.cal_link, m.cal_15min, m.cal_30min, m.cal_60min
  FROM public.bookings b
  JOIN public.mentors m ON m.id = b.mentor_id
  JOIN public.mentees me ON me.id = b.mentee_id
  WHERE b.status IN ('accepted', 'confirmed', 'completed')
    AND public.current_email() IS NOT NULL
    AND lower(me.email) = public.current_email();
GRANT SELECT ON public.mentor_scheduling_links TO authenticated, service_role;
REVOKE ALL ON public.mentor_scheduling_links FROM anon;  -- default privileges would otherwise grant it

-- NOTE for client code: an INSERT ... RETURNING (supabase-js `.insert().select()`)
-- also has to pass the table's SELECT policy. Anonymous inserts into bookings /
-- mentees therefore must not ask for the row back; the client generates the id.

-- The v1 "Anyone can view mentors" policy is gone (section 4); revoking the
-- grant as well means a future permissive policy cannot re-expose the table
-- to anon by accident. anon also never needs the tables below directly.
REVOKE ALL ON public.mentors, public.users, public.approved_users, public.access_requests,
  public.user_identifiers, public.notifications, public.mentor_earnings,
  public.mentor_activity_log, public.mentor_tasks, public.booking_notes FROM anon;


-- =============================================================================
-- 4. ROW LEVEL SECURITY — replaces every v1 policy
-- =============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN (
      'users', 'mentors', 'mentees', 'bookings', 'booking_notes', 'notifications', 'mentor_tasks',
      'mentor_availability', 'mentor_earnings', 'mentor_activity_log', 'approved_users',
      'access_requests', 'user_identifiers')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ---- users: own row or admin; role columns guarded by trigger (section 7) ----
CREATE POLICY users_select ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid()::text OR lower(email) = public.current_email() OR public.is_admin());
CREATE POLICY users_insert ON public.users FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (id = auth.uid()::text AND lower(email) = public.current_email()
              AND user_type = 'mentee' AND amazon_alias IS NULL));
CREATE POLICY users_update ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()::text OR public.is_admin())
  WITH CHECK (id = auth.uid()::text OR public.is_admin());

-- ---- mentors: full rows only for the owner and admins (directory = view) ----
CREATE POLICY mentors_select ON public.mentors FOR SELECT TO authenticated
  USING (lower(email) = public.current_email() OR public.owns_profile(id) OR public.is_admin());
CREATE POLICY mentors_insert ON public.mentors FOR INSERT TO authenticated
  WITH CHECK (lower(email) = public.current_email() AND public.is_approved_mentor());
CREATE POLICY mentors_update ON public.mentors FOR UPDATE TO authenticated
  USING (lower(email) = public.current_email() OR public.owns_profile(id) OR public.is_admin())
  WITH CHECK (lower(email) = public.current_email() OR public.owns_profile(id) OR public.is_admin());
CREATE POLICY mentors_delete ON public.mentors FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---- mentees: owner, admin, or a mentor with a booking; anonymous inserts allowed ----
CREATE POLICY mentees_select ON public.mentees FOR SELECT TO authenticated
  USING (lower(email) = public.current_email() OR public.is_admin() OR public.mentor_has_booking_with(id));
-- Signed-in users can only create a profile for their own email; anonymous
-- booking requesters go through get_or_create_mentee() (section 5) or this insert.
CREATE POLICY mentees_insert ON public.mentees FOR INSERT TO public
  WITH CHECK (nullif(trim(email), '') IS NOT NULL
              AND (auth.role() IS DISTINCT FROM 'authenticated' OR lower(email) = public.current_email() OR public.is_admin()));
CREATE POLICY mentees_update ON public.mentees FOR UPDATE TO authenticated
  USING (lower(email) = public.current_email() OR public.is_admin())
  WITH CHECK (lower(email) = public.current_email() OR public.is_admin());
CREATE POLICY mentees_delete ON public.mentees FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---- bookings: parties or admin; validated anonymous requests ----
CREATE POLICY bookings_select ON public.bookings FOR SELECT TO authenticated
  USING (public.owns_mentor(mentor_id) OR public.owns_mentee(mentee_id) OR public.is_admin());
CREATE POLICY bookings_insert ON public.bookings FOR INSERT TO public
  WITH CHECK (status = 'pending' AND public.mentor_is_bookable(mentor_id) AND public.mentee_exists(mentee_id)
              AND completed_at IS NULL AND session_duration_minutes IS NULL AND country IS NULL
              AND mentee_rating IS NULL AND mentor_rating IS NULL
              AND mentee_feedback IS NULL AND mentor_feedback IS NULL);
CREATE POLICY bookings_update ON public.bookings FOR UPDATE TO authenticated
  USING (public.owns_mentor(mentor_id) OR public.owns_mentee(mentee_id) OR public.is_admin())
  WITH CHECK (public.owns_mentor(mentor_id) OR public.owns_mentee(mentee_id) OR public.is_admin());
CREATE POLICY bookings_delete ON public.bookings FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---- booking_notes: v1 semantics + admin ----
CREATE POLICY booking_notes_select ON public.booking_notes FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id
         AND (public.owns_mentor(b.mentor_id) OR public.owns_mentee(b.mentee_id))));
CREATE POLICY booking_notes_insert ON public.booking_notes FOR INSERT TO authenticated
  WITH CHECK (lower(author_email) = public.current_email() AND EXISTS (SELECT 1 FROM public.bookings b
              WHERE b.id = booking_id AND (public.owns_mentor(b.mentor_id) OR public.owns_mentee(b.mentee_id))));
CREATE POLICY booking_notes_update ON public.booking_notes FOR UPDATE TO authenticated
  USING (lower(author_email) = public.current_email() OR public.is_admin());
CREATE POLICY booking_notes_delete ON public.booking_notes FOR DELETE TO authenticated
  USING (lower(author_email) = public.current_email() OR public.is_admin());

-- ---- notifications: read/mark own; NO insert policy (see notify_booking_event) ----
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
  USING (lower(recipient_email) = public.current_email() OR public.is_admin());
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
  USING (lower(recipient_email) = public.current_email())
  WITH CHECK (lower(recipient_email) = public.current_email());

-- ---- mentor_tasks / mentor_availability: v1 + admin ----
CREATE POLICY mentor_tasks_all ON public.mentor_tasks FOR ALL TO authenticated
  USING (public.owns_mentor(mentor_id) OR public.is_admin())
  WITH CHECK (public.owns_mentor(mentor_id) OR public.is_admin());
CREATE POLICY mentor_availability_select ON public.mentor_availability FOR SELECT TO public
  USING (true);
CREATE POLICY mentor_availability_write ON public.mentor_availability FOR ALL TO authenticated
  USING (public.owns_mentor(mentor_id) OR public.is_admin())
  WITH CHECK (public.owns_mentor(mentor_id) OR public.is_admin());

-- ---- mentor_earnings: read own/admin; writes only via record_mentor_earning() ----
-- The Amazon deployment reports volunteer hours, not earnings; the table and
-- function are kept for schema compatibility only.
CREATE POLICY mentor_earnings_select ON public.mentor_earnings FOR SELECT TO authenticated
  USING (public.owns_mentor(mentor_id) OR public.is_admin());

-- ---- mentor_activity_log: read own/admin; writes only via log_mentor_activity() ----
CREATE POLICY mentor_activity_log_select ON public.mentor_activity_log FOR SELECT TO authenticated
  USING (public.owns_mentor(mentor_id) OR public.is_admin());

-- ---- approved_users: admin manages; a person can see their own allow-list row ----
CREATE POLICY approved_users_select ON public.approved_users FOR SELECT TO authenticated
  USING (public.is_admin() OR lower(email) = public.current_email()
         OR lower(amazon_alias) = lower((SELECT u.amazon_alias FROM public.users u WHERE u.id = auth.uid()::text)));
CREATE POLICY approved_users_insert ON public.approved_users FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY approved_users_update ON public.approved_users FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY approved_users_delete ON public.approved_users FOR DELETE TO authenticated USING (public.is_admin());

-- ---- access_requests: created by the SSO callback (service role) only ----
CREATE POLICY access_requests_select ON public.access_requests FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY access_requests_update ON public.access_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY access_requests_delete ON public.access_requests FOR DELETE TO authenticated USING (public.is_admin());

-- ---- user_identifiers: read own or admin; no client writes ----
CREATE POLICY user_identifiers_select ON public.user_identifiers FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR public.is_admin());

-- ---- Column guards (BEFORE triggers; policies cannot compare OLD and NEW) ----
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
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_guard_role_columns ON public.users;
CREATE TRIGGER users_guard_role_columns BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_users_role_columns();

CREATE OR REPLACE FUNCTION public.guard_mentee_verification_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Nobody self-verifies: organisations always queue for review, individuals stay unverified.
    IF NOT public.is_privileged() THEN
      NEW.verification_status := CASE WHEN NEW.user_type = 'organization' THEN 'pending' ELSE 'unverified' END;
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.verification_status IS DISTINCT FROM OLD.verification_status
      OR NEW.verification_reference IS DISTINCT FROM OLD.verification_reference)
     AND NOT public.is_privileged() THEN
    RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'verification fields may only be changed by an admin';
  END IF;
  RETURN NEW;
END $$;
-- average_rating / total_ratings are derived by recompute_mentor_rating();
-- a mentor must not be able to type their own score.
CREATE OR REPLACE FUNCTION public.guard_mentor_derived_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.is_privileged() OR current_setting('mc.internal_write', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.average_rating := 0;
    NEW.total_ratings := 0;
    RETURN NEW;
  END IF;
  IF NEW.average_rating IS DISTINCT FROM OLD.average_rating OR NEW.total_ratings IS DISTINCT FROM OLD.total_ratings THEN
    RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'ratings are computed from mentee feedback';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mentors_guard_derived ON public.mentors;
CREATE TRIGGER mentors_guard_derived BEFORE INSERT OR UPDATE ON public.mentors
  FOR EACH ROW EXECUTE FUNCTION public.guard_mentor_derived_columns();

DROP TRIGGER IF EXISTS mentees_guard_verification ON public.mentees;
CREATE TRIGGER mentees_guard_verification BEFORE INSERT OR UPDATE ON public.mentees
  FOR EACH ROW EXECUTE FUNCTION public.guard_mentee_verification_columns();

-- Mentees cannot alter reporting fields or re-home a booking; country defaults
-- to the mentor's country when a session is completed without one.
CREATE OR REPLACE FUNCTION public.guard_booking_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_privileged() THEN
    IF NEW.mentor_id IS DISTINCT FROM OLD.mentor_id OR NEW.mentee_id IS DISTINCT FROM OLD.mentee_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'booking parties are immutable';
    END IF;
    IF NOT public.owns_mentor(OLD.mentor_id)
       AND (NEW.session_duration_minutes IS DISTINCT FROM OLD.session_duration_minutes
            OR NEW.country IS DISTINCT FROM OLD.country) THEN
      RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'only the mentor records session duration and country';
    END IF;
    -- Status transitions are role-bound. A mentee may only cancel (or confirm
    -- an accepted request after scheduling); accepting/rejecting/completing is
    -- the mentor's call. Without this a mentee could self-accept a request and
    -- read the mentor's Cal.com links through mentor_scheduling_links.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF public.owns_mentor(OLD.mentor_id) THEN
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
          (OLD.status = 'accepted' AND NEW.status = 'confirmed')
        ) THEN
          RAISE EXCEPTION 'forbidden_status_transition' USING ERRCODE = '42501',
            DETAIL = format('mentee may not move a booking from %s to %s', OLD.status, NEW.status);
        END IF;
      END IF;
    END IF;
    -- Each side rates the other; nobody edits the rating written about them.
    IF public.owns_mentor(OLD.mentor_id) AND NOT public.owns_mentee(OLD.mentee_id)
       AND (NEW.mentee_rating IS DISTINCT FROM OLD.mentee_rating OR NEW.mentee_feedback IS DISTINCT FROM OLD.mentee_feedback) THEN
      RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'only the mentee writes mentee_rating/mentee_feedback';
    END IF;
    IF public.owns_mentee(OLD.mentee_id) AND NOT public.owns_mentor(OLD.mentor_id)
       AND (NEW.mentor_rating IS DISTINCT FROM OLD.mentor_rating OR NEW.mentor_feedback IS DISTINCT FROM OLD.mentor_feedback) THEN
      RAISE EXCEPTION 'forbidden_column_change' USING ERRCODE = '42501', DETAIL = 'only the mentor writes mentor_rating/mentor_feedback';
    END IF;
  END IF;
  IF NEW.status = 'completed' AND nullif(trim(coalesce(NEW.country, '')), '') IS NULL THEN
    SELECT m.country INTO NEW.country FROM public.mentors m WHERE m.id = NEW.mentor_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bookings_guard_update ON public.bookings;
CREATE TRIGGER bookings_guard_update BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_update();

-- ---- Notifications: the only write path ----
-- Recipient, title and message are derived from the booking, so a caller can
-- neither address arbitrary people nor invent content. The event must match
-- the booking's real state, and duplicates within 5 minutes are collapsed.
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
      v_to := v_me.email; v_to_type := 'mentee'; v_type := 'booking_accepted'; v_title := 'Booking request accepted';
      v_msg := v_m.name || ' has accepted your mentorship request.'
            || CASE WHEN coalesce(v_m.cal_link, '') <> '' THEN ' Schedule your session: https://cal.com/' || v_m.cal_link ELSE '' END;
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
      IF v_is_mentor THEN
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

  v_to := lower(v_to);  -- session emails are lowercase; the bell filters by equality
  SELECT id INTO v_id FROM public.notifications
  WHERE booking_id = v_b.id AND type = v_type AND recipient_email = v_to
    AND created_at > timezone('utc', now()) - interval '5 minutes' LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  v_id := gen_random_uuid()::text;
  INSERT INTO public.notifications (id, recipient_email, recipient_type, type, title, message, booking_id, is_read, created_at)
  VALUES (v_id, v_to, v_to_type, v_type, v_title, v_msg, v_b.id, false, timezone('utc', now()));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.notify_booking_event(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.notify_booking_event(text, text) TO anon, authenticated, service_role;

-- ---- Activity log: the only write path (plus the booking trigger below) ----
CREATE OR REPLACE FUNCTION public.log_mentor_activity(
  p_mentor_id text, p_activity_type text, p_title text,
  p_description text DEFAULT NULL, p_booking_id text DEFAULT NULL, p_mentee_id text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id text; v_party boolean;
BEGIN
  IF p_activity_type NOT IN ('booking_received', 'booking_confirmed', 'booking_completed', 'booking_canceled',
      'task_created', 'task_completed', 'rating_received') THEN
    RAISE EXCEPTION 'invalid_activity_type' USING ERRCODE = '22023';
  END IF;
  IF nullif(trim(coalesce(p_title, '')), '') IS NULL OR length(p_title) > 200 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = '22023';
  END IF;
  IF p_booking_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = p_booking_id AND b.mentor_id = p_mentor_id) THEN
    RAISE EXCEPTION 'booking_mentor_mismatch' USING ERRCODE = '22023';
  END IF;
  -- Only the mentor (or admin / service role) writes to the mentor's own feed.
  -- Booking-driven entries are produced by the bookings_activity_log trigger,
  -- so the counterpart never needs (and never gets) to write free text here.
  v_party := false;
  IF NOT (public.is_privileged() OR public.owns_mentor(p_mentor_id)) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  v_id := gen_random_uuid()::text;
  INSERT INTO public.mentor_activity_log (id, mentor_id, mentee_id, booking_id, activity_type, title, description, created_at)
  VALUES (v_id, p_mentor_id, p_mentee_id, p_booking_id, p_activity_type, left(p_title, 200), left(p_description, 2000), timezone('utc', now()));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.log_mentor_activity(text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_mentor_activity(text, text, text, text, text, text) TO authenticated, service_role;

-- Booking lifecycle → activity feed, written by the database so the feed is
-- complete even when the client forgets to log.
CREATE OR REPLACE FUNCTION public.bookings_log_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_name text; v_type text; v_title text;
BEGIN
  SELECT name INTO v_name FROM public.mentees WHERE id = NEW.mentee_id;
  v_name := coalesce(v_name, 'A mentee');
  IF TG_OP = 'INSERT' THEN
    v_type := 'booking_received'; v_title := 'New booking request from ' || v_name;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('confirmed', 'completed', 'canceled') THEN
    v_type := 'booking_' || NEW.status;
    v_title := CASE NEW.status WHEN 'confirmed' THEN 'Session scheduled with ' || v_name
                               WHEN 'completed' THEN 'Session completed with ' || v_name
                               ELSE 'Session with ' || v_name || ' canceled' END;
  ELSIF OLD.mentee_rating IS NULL AND NEW.mentee_rating IS NOT NULL THEN
    v_type := 'rating_received'; v_title := v_name || ' rated the session ' || NEW.mentee_rating || '/5';
  ELSE
    RETURN NEW;
  END IF;
  INSERT INTO public.mentor_activity_log (id, mentor_id, mentee_id, booking_id, activity_type, title, description, created_at)
  VALUES (gen_random_uuid()::text, NEW.mentor_id, NEW.mentee_id, NEW.id, v_type, v_title, NULL, timezone('utc', now()));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bookings_activity_log ON public.bookings;
CREATE TRIGGER bookings_activity_log AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_log_activity();

-- ---- Mentor rating: recomputed server-side (a mentee cannot update mentors) ----
CREATE OR REPLACE FUNCTION public.recompute_mentor_rating(p_mentor_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Transaction-local flag lets guard_mentor_derived_columns() tell this
  -- trusted recompute apart from a mentor typing their own score.
  PERFORM set_config('mc.internal_write', 'on', true);
  UPDATE public.mentors m SET
    average_rating = coalesce((SELECT round(avg(mentee_rating)::numeric, 2) FROM public.bookings b WHERE b.mentor_id = m.id AND b.mentee_rating IS NOT NULL), 0),
    total_ratings  = (SELECT count(*) FROM public.bookings b WHERE b.mentor_id = m.id AND b.mentee_rating IS NOT NULL)
  WHERE m.id = p_mentor_id;
  PERFORM set_config('mc.internal_write', 'off', true);
END $$;
GRANT EXECUTE ON FUNCTION public.recompute_mentor_rating(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bookings_recompute_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.mentee_rating IS DISTINCT FROM OLD.mentee_rating THEN PERFORM public.recompute_mentor_rating(NEW.mentor_id); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bookings_rating_recompute ON public.bookings;
CREATE TRIGGER bookings_rating_recompute AFTER UPDATE OF mentee_rating ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_recompute_rating();

-- ---- Earnings: kept for schema compatibility; unused by the Amazon deployment ----
CREATE OR REPLACE FUNCTION public.record_mentor_earning(p_mentor_id text, p_booking_id text, p_amount numeric, p_currency text DEFAULT 'USD')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id text := gen_random_uuid()::text;
BEGIN
  IF NOT public.is_privileged() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.mentor_earnings (id, mentor_id, booking_id, amount, currency, earned_at, payout_month, payout_status)
  VALUES (v_id, p_mentor_id, p_booking_id, p_amount, coalesce(p_currency, 'USD'), timezone('utc', now()), to_char(now(), 'YYYY-MM'), 'pending');
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.record_mentor_earning(text, text, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_mentor_earning(text, text, numeric, text) TO authenticated, service_role;


-- =============================================================================
-- 5. RATE LIMITING + anonymous mentee resolution
-- =============================================================================
-- Triggers are SECURITY DEFINER so they can count rows anon cannot read. They
-- also stamp created_at server-side: a client cannot back/forward-date a row
-- to dodge the window (or the 10-minute notify window above). Admin/service
-- callers are exempt so seeding and backfills are unaffected.
CREATE OR REPLACE FUNCTION public.check_booking_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.is_privileged() THEN RETURN NEW; END IF;
  NEW.created_at := timezone('utc', now());
  IF (SELECT count(*) FROM public.bookings b WHERE b.mentee_id = NEW.mentee_id
      AND b.created_at > timezone('utc', now()) - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001', DETAIL = 'max 5 booking requests per mentee per hour';
  END IF;
  IF (SELECT count(*) FROM public.bookings b WHERE b.mentor_id = NEW.mentor_id
      AND b.created_at > timezone('utc', now()) - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001', DETAIL = 'max 20 booking requests per mentor per hour';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bookings_rate_limit ON public.bookings;
CREATE TRIGGER bookings_rate_limit BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.check_booking_rate_limit();

-- mentees.email is unique, so this mostly guards delete/re-create churn; the
-- effective anonymous-spam guard is the bookings limit plus Supabase API limits.
CREATE OR REPLACE FUNCTION public.check_mentee_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.is_privileged() THEN RETURN NEW; END IF;
  NEW.created_at := timezone('utc', now());
  IF (SELECT count(*) FROM public.mentees me WHERE lower(me.email) = lower(NEW.email)
      AND me.created_at > timezone('utc', now()) - interval '1 day') >= 3 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001', DETAIL = 'max 3 mentee profiles per email per day';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mentees_rate_limit ON public.mentees;
CREATE TRIGGER mentees_rate_limit BEFORE INSERT ON public.mentees
  FOR EACH ROW EXECUTE FUNCTION public.check_mentee_rate_limit();

-- A returning anonymous requester (or a mentor recording a session with a new
-- mentee) cannot SELECT the mentee row, so a plain insert would hit the unique
-- email constraint. This resolves or creates the row and returns ONLY its id
-- (no profile data leaves the database). Inserts still pass the trigger above.
CREATE OR REPLACE FUNCTION public.get_or_create_mentee(p_email text, p_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_email text := trim(coalesce(p_email, '')); v_id text;
BEGIN
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_id FROM public.mentees WHERE lower(email) = lower(v_email) LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  v_id := gen_random_uuid()::text;
  INSERT INTO public.mentees (id, name, email, user_type, timezone, languages_spoken, areas_exploring, verification_status, created_at)
  VALUES (v_id, left(coalesce(nullif(trim(p_name), ''), split_part(v_email, '@', 1)), 120), v_email, 'individual', 'UTC',
          ARRAY['English'], ARRAY['Career Development'], 'unverified', timezone('utc', now()));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.get_or_create_mentee(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_or_create_mentee(text, text) TO anon, authenticated, service_role;


-- =============================================================================
-- 6. STORAGE — 'uploads' bucket (v1 semantics, idempotent)
-- =============================================================================
-- Create the bucket in Dashboard → Storage if it does not exist (public read).
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view uploaded files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;
CREATE POLICY "Authenticated users can upload files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uploads');
CREATE POLICY "Anyone can view uploaded files" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'uploads');
CREATE POLICY "Users can update their own files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'uploads' AND (owner_id = auth.uid()::text OR public.is_admin()));
CREATE POLICY "Users can delete their own files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'uploads' AND (owner_id = auth.uid()::text OR public.is_admin()));


-- =============================================================================
-- 7. updated_at TRIGGERS + INDEXES
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = timezone('utc', now()); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS update_mentors_updated_at ON public.mentors;
CREATE TRIGGER update_mentors_updated_at BEFORE UPDATE ON public.mentors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_mentor_tasks_updated_at ON public.mentor_tasks;
CREATE TRIGGER update_mentor_tasks_updated_at BEFORE UPDATE ON public.mentor_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- v1 indexes (kept) ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mentors_email ON public.mentors (email);
CREATE INDEX IF NOT EXISTS idx_mentors_is_available ON public.mentors (is_available);
CREATE INDEX IF NOT EXISTS idx_mentors_created_at ON public.mentors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentees_email ON public.mentees (email);
CREATE INDEX IF NOT EXISTS idx_bookings_mentor_id ON public.bookings (mentor_id);
CREATE INDEX IF NOT EXISTS idx_bookings_mentee_id ON public.bookings (mentee_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_email ON public.notifications (recipient_email);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications (is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at DESC);
-- v2 indexes: ownership predicates, rate-limit windows, admin lists ----------
CREATE INDEX IF NOT EXISTS idx_mentors_email_lower ON public.mentors (lower(email));
CREATE INDEX IF NOT EXISTS idx_mentees_email_lower ON public.mentees (lower(email));
CREATE INDEX IF NOT EXISTS idx_mentees_created_at ON public.mentees (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentees_verification_status ON public.mentees (verification_status);
CREATE INDEX IF NOT EXISTS idx_bookings_mentee_created ON public.bookings (mentee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_mentor_created ON public.bookings (mentor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_country ON public.bookings (country);
CREATE INDEX IF NOT EXISTS idx_users_amazon_alias_lower ON public.users (lower(amazon_alias));
CREATE INDEX IF NOT EXISTS idx_approved_users_alias_lower ON public.approved_users (lower(amazon_alias));
CREATE INDEX IF NOT EXISTS idx_approved_users_email_lower ON public.approved_users (lower(email));
CREATE INDEX IF NOT EXISTS idx_access_requests_status_requested ON public.access_requests (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_identifiers_user_id ON public.user_identifiers (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_booking_type ON public.notifications (booking_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentor_activity_log_mentor ON public.mentor_activity_log (mentor_id, created_at DESC);


-- =============================================================================
-- 8. FIRST ADMIN
-- =============================================================================
-- Nobody can promote themselves (users trigger). To bootstrap, the person signs
-- in ONCE (Amazon SSO lands them on /request-access and creates an
-- access_requests row; email/password signup creates a users row), then you
-- edit the two values below and run this block. It is a no-op while the
-- placeholder email is left in place, so re-running the whole file is safe.
DO $$
DECLARE
  v_email text := 'admin@example.com';   -- <-- the admin's sign-in email
  v_alias text := 'adminalias';          -- <-- their Amazon alias (lowercase)
BEGIN
  IF v_email = 'admin@example.com' THEN
    RAISE NOTICE 'FIRST ADMIN: placeholder left in place, skipping';
    RETURN;
  END IF;
  UPDATE public.users SET user_type = 'admin', amazon_alias = coalesce(amazon_alias, v_alias)
  WHERE lower(email) = lower(v_email);
  IF NOT FOUND THEN
    RAISE NOTICE 'FIRST ADMIN: no users row for % yet — they must sign in once first; allow-list row still written', v_email;
  END IF;
  INSERT INTO public.approved_users (id, amazon_alias, email, role, is_active, approved_by, approved_at, note)
  VALUES (gen_random_uuid()::text, lower(v_alias), lower(v_email), 'admin', true, 'bootstrap', timezone('utc', now()), 'first admin')
  ON CONFLICT (amazon_alias) DO UPDATE SET role = 'admin', is_active = true, email = EXCLUDED.email;
  UPDATE public.access_requests SET status = 'approved', resolved_at = timezone('utc', now()), resolved_by = 'bootstrap'
  WHERE lower(amazon_alias) = lower(v_alias) AND status = 'pending';
END $$;


-- =============================================================================
-- 9. VERIFICATION QUERIES (run by hand; all should look as described)
-- =============================================================================
-- Policies per table (expect: no table without at least a SELECT policy except
-- access_requests/user_identifiers/notifications having no INSERT policy):
--   SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 3;
-- RLS enabled everywhere:
--   SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';
-- anon must NOT be able to read mentors but CAN read the view:
--   SET ROLE anon; SELECT count(*) FROM public.mentors;            -- expect: permission denied
--   SELECT count(*) FROM public.mentors_public; RESET ROLE;        -- expect: all mentors
-- View column list contains no contact data:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'mentors_public';
-- Triggers present:
--   SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE NOT tgisinternal ORDER BY 2, 1;
-- Functions are SECURITY DEFINER with a pinned search_path:
--   SELECT proname, prosecdef, proconfig FROM pg_proc WHERE pronamespace = 'public'::regnamespace ORDER BY 1;
-- Admins:
--   SELECT id, email, amazon_alias FROM public.users WHERE user_type = 'admin';
-- Setup v2 complete.
