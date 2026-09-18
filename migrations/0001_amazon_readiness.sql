-- =============================================================================
-- 0001_amazon_readiness — DDL delta for the Amazon-readiness release
-- =============================================================================
-- Mirrors shared/schema.ts (the drizzle schema is the source of truth) and is
-- the exact section-1 DDL from supabase_setup_v2.sql, which also applies it.
-- Apply ONE of the two, not both (both are idempotent, so a double run is
-- harmless). No policies, functions or triggers live here — those are in
-- supabase_setup_v2.sql only.
--
-- Contents:
--   users.amazon_alias (unique)            users.user_type CHECK incl. 'admin'
--   mentees.verification_status (+CHECK)   mentees.verification_reference
--   bookings.session_duration_minutes      bookings.country
--   tables approved_users, access_requests, user_identifiers
--
-- Type mapping: drizzle varchar() = character varying (no length);
-- timestamp({ mode: 'string' }) = timestamp without time zone;
-- text({ enum }) = text + CHECK constraint (drizzle does not emit the CHECK).
-- =============================================================================

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
