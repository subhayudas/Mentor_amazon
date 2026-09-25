-- =============================================================================
-- MentorConnect — Supabase setup v2 (Amazon readiness)
-- =============================================================================
-- !! RE-RUNNING THIS FILE is safe only if you then re-run, in order:
-- !!   supabase_phase2.sql → migrations/0002_production_readiness.sql
-- !!   → migrations/0003_restrict_legacy_writes.sql (if 0003 had been applied).
-- !! Objects those files redefine are mirrored here in their final form, so a re-run of
-- !! this file never reverts them, but only the full chain restores everything they add.
-- Apply order on a new project: drizzle push (shared/schema.ts) → this file →
-- supabase_phase2.sql → migrations/0002 → deploy → migrations/0003 → (optional) 0004.
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
--     needs them) but go through POST /api/requests (Turnstile, IP limit) and
--     the create_booking_request() RPC (migrations/0002), which validates and
--     rate-limits; migrations/0003 removes the direct anonymous inserts.
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

-- Scheduling columns and the rollout switch read by guard_booking_update() (section 4).
-- migrations/0002 owns them (constraints, defaults); they are declared here too so the
-- mirrored guard never references a missing column. 'allowed' is written only when absent:
-- migrations/0003 flips it to 'blocked' and a re-run of this file keeps that.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cal_status text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cal_requested_start timestamp;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS canceled_by text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cal_verified_uid text;
-- Programme-managed mentors (migrations/0002 §6); the public directory view exposes the flag.
ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS managed_by_programme boolean NOT NULL DEFAULT false;
-- Mentor ids only the programme may create (the five featured mentors, design §3.1: UUIDv5 of
-- https://mentor-amazon.vercel.app/mentor/<slug>). Their public URLs exist before
-- migrations/0004 seeds the rows, so nobody else may take them first (guard_mentor_derived_columns,
-- section 4). Same rows as migrations/0002 §6; RLS on, no policies, no client privileges.
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
CREATE TABLE IF NOT EXISTS public.mc_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mc_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mc_settings FROM anon, authenticated;
INSERT INTO public.mc_settings (key, value) VALUES ('legacy_booking_writes', 'allowed')
ON CONFLICT (key) DO NOTHING;

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
         created_at, managed_by_programme
  FROM public.mentors;
-- Read-only. A single-table view is auto-updatable and runs as its owner, so the write
-- privileges Supabase's default privileges hand out would let anyone edit or delete any
-- mentor through it, past RLS.
REVOKE ALL ON public.mentors_public FROM PUBLIC, anon, authenticated, service_role;
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
REVOKE ALL ON public.mentor_scheduling_links FROM PUBLIC, anon, authenticated, service_role;  -- default privileges would otherwise grant writes
GRANT SELECT ON public.mentor_scheduling_links TO authenticated, service_role;

-- NOTE for client code: an INSERT ... RETURNING (supabase-js `.insert().select()`)
-- also has to pass the table's SELECT policy. Anonymous inserts into bookings /
-- mentees therefore must not ask for the row back; the client generates the id.

-- The v1 "Anyone can view mentors" policy is gone (section 4); revoking the
-- grant as well means a future permissive policy cannot re-expose the table
-- to anon by accident. anon also never needs the tables below directly.
REVOKE ALL ON public.mentors, public.users, public.approved_users, public.access_requests,
  public.user_identifiers, public.notifications, public.mentor_earnings,
  public.mentor_activity_log, public.mentor_tasks, public.booking_notes FROM anon;
-- A recipient marks a notification read; the rest of the row (title, message, recipient,
-- booking) is written by the database only. Same lines as migrations/0002 §13.
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;


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
-- Identical, character for character, to migrations/0002_production_readiness.sql §3a
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

-- ---- An Amazon account has no password (AUTH-02, enforced by the database) ----
-- An account bound to an Amazon alias signs in only through the SSO bridge (admin.generateLink +
-- verifyOtp). Refusing a new encrypted_password here stops such an account from giving itself a
-- password through the Auth API (supabase.auth.updateUser from any session, a recovery link, the
-- dashboard), which would otherwise keep signing in after an admin deactivates the alias. Email
-- accounts are unaffected. The bridge's rotateAuthPassword runs while the users row it links has
-- no amazon_alias yet, so it still works. Identical to migrations/0002 §3a.
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
CREATE TRIGGER auth_users_block_sso_password BEFORE UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.block_sso_password_change();

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
-- a mentor must not be able to type their own score. The row's identity is the
-- programme's: a mentor cannot take a reserved (featured) id, rename their row,
-- move it to another address or mark it programme-managed, and a programme-managed
-- row is edited by admins only. Identical to migrations/0002 §6.
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
-- Identical to migrations/0002 §6.
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

DROP TRIGGER IF EXISTS mentees_guard_verification ON public.mentees;
CREATE TRIGGER mentees_guard_verification BEFORE INSERT OR UPDATE ON public.mentees
  FOR EACH ROW EXECUTE FUNCTION public.guard_mentee_verification_columns();

-- Booking guard: identical, character for character, to migrations/0002_production_readiness.sql §7
-- (the re-run-chain test in tests/integration compares them). Parties cannot re-home a
-- booking or write the scheduler's columns; status transitions are role-bound; once
-- migrations/0003 has run (mc_settings.legacy_booking_writes = 'blocked') scheduled_at /
-- cal_event_uri belong to Cal.com sync and ratings need a completed session.
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

-- ---- Notifications: the only write path ----
-- Recipient, title and message are derived from the booking, so a caller can
-- neither address arbitrary people nor invent content. The event must match
-- the booking's real state, and duplicates within 5 minutes are collapsed.
-- A programme-managed mentor's notices go to every admin (the placeholder
-- address can never receive anything), and no notice is addressed to a
-- reserved .invalid address. Identical to migrations/0002 §9.
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
REVOKE ALL ON FUNCTION public.notify_booking_event(text, text) FROM public;
-- Final state (migrations/0003): not executable by anon. Anonymous requests are announced by
-- create_booking_request() on the server.
GRANT EXECUTE ON FUNCTION public.notify_booking_event(text, text) TO authenticated, service_role;

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

-- Resolves or creates a mentee row by email and returns ONLY its id (no profile
-- data leaves the database). Kept for the pre-release client; request creation now
-- happens in create_booking_request() / create_my_booking_request() (migrations/0002),
-- and after migrations/0003 this is callable by the service role only. The profile of
-- an address that has an account is reached only by that account (signed in) or the
-- server: anyone else would attach a request to it, and the mentor would read it.
-- Identical to migrations/0002 §9.
CREATE OR REPLACE FUNCTION public.get_or_create_mentee(p_email text, p_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_email text := trim(coalesce(p_email, '')); v_id text;
BEGIN
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_privileged() AND lower(v_email) IS DISTINCT FROM public.current_email()
     AND (EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = lower(v_email))
          OR EXISTS (SELECT 1 FROM auth.users a WHERE lower(a.email) = lower(v_email))) THEN
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
REVOKE ALL ON FUNCTION public.get_or_create_mentee(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_or_create_mentee(text, text) TO service_role;


-- =============================================================================
-- 6. STORAGE — 'uploads' bucket (public read through object URLs, idempotent)
-- =============================================================================
-- migrations/0002 §12 creates the bucket (public, 5 MB images). A public bucket serves
-- /storage/v1/object/public/uploads/<path> without any policy, so a SELECT policy only
-- opens the list API, which would enumerate every file and the account ids in
-- profiles/<uid>/ paths. Signed-in users see their own objects (an upload reads its row
-- back), admins all. Photos under profiles/ go only into the uploader's own folder; the
-- flat mentors/ and mentees/ folders take random file names. Identical to 0002 §12.
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
-- in ONCE (Amazon SSO creates their users row and an approved_users row with
-- role 'mentor'; email/password signup creates a users row), then you edit the
-- two values below and run this block. It is a no-op while the placeholder
-- email is left in place, so re-running the whole file is safe. (The
-- access_requests update is kept for rows written by the old approval flow.)
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
