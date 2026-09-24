-- =============================================================================
-- 0003_restrict_legacy_writes — CONTRACT step of the production-readiness release
-- =============================================================================
-- Run ONLY AFTER the new client is deployed and smoke-tested on production. It removes the
-- write paths the pre-release client (a4f3fbd) used and the new client no longer needs:
--   * anon loses every privilege on bookings, mentees, mentee_favorites, activity_events,
--     booking_reminders, cal_webhook_events and mentor_cal_webhooks
--     (anonymous requests go through POST /api/requests → create_booking_request);
--   * authenticated loses INSERT on bookings (signed-in requests use create_my_booking_request);
--   * get_or_create_mentee is service-role only; notify_booking_event and my_profile_ids are
--     no longer executable by anon;
--   * guard_booking_update switches on its scheduling rules (mc_settings.legacy_booking_writes =
--     'blocked'): parties can no longer write scheduled_at or cal_event_uri, a mentee can no
--     longer move accepted → confirmed by hand, and ratings/feedback need a completed session.
--
-- Prerequisite: migrations/0002_production_readiness.sql. Idempotent; one transaction.
-- Re-run it (after 0002) whenever supabase_setup_v2.sql / supabase_phase2.sql are re-run.
-- Rollback: the inverse statements at the bottom of this file.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.create_booking_request(text,text,text,text)') IS NULL
     OR to_regclass('public.mc_settings') IS NULL
     OR to_regclass('public.mentor_cal_webhooks') IS NULL THEN
    RAISE EXCEPTION '0003 preconditions failed: run migrations/0002_production_readiness.sql first';
  END IF;
END $$;

REVOKE ALL ON public.bookings, public.mentees, public.mentee_favorites, public.activity_events,
  public.booking_reminders, public.cal_webhook_events, public.mentor_cal_webhooks FROM anon;
REVOKE INSERT ON public.bookings FROM authenticated;

REVOKE ALL ON FUNCTION public.get_or_create_mentee(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_mentee(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.notify_booking_event(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_booking_event(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_profile_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_profile_ids() TO authenticated, service_role;

INSERT INTO public.mc_settings (key, value, updated_at) VALUES ('legacy_booking_writes', 'blocked', now())
ON CONFLICT (key) DO UPDATE
SET value = 'blocked',
    updated_at = CASE WHEN public.mc_settings.value = 'blocked' THEN public.mc_settings.updated_at ELSE now() END;

INSERT INTO public.schema_migrations (version, note)
VALUES ('0003_restrict_legacy_writes', 'contract: legacy anonymous/client write paths removed')
ON CONFLICT (version) DO UPDATE SET applied_at = now();

DO $$
BEGIN
  RAISE NOTICE '0003 applied: legacy client writes %, anon INSERT on bookings %, authenticated INSERT on bookings %',
    (SELECT value FROM public.mc_settings WHERE key = 'legacy_booking_writes'),
    has_table_privilege('anon', 'public.bookings', 'INSERT'),
    has_table_privilege('authenticated', 'public.bookings', 'INSERT');
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- ROLLBACK (only to bring back the pre-release client; run as one block)
-- =============================================================================
-- BEGIN;
-- GRANT ALL ON public.bookings, public.mentees, public.mentee_favorites, public.activity_events,
--   public.booking_reminders, public.cal_webhook_events TO anon;
-- GRANT INSERT ON public.bookings TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.get_or_create_mentee(text, text) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.notify_booking_event(text, text) TO anon;
-- GRANT EXECUTE ON FUNCTION public.my_profile_ids() TO anon;
-- UPDATE public.mc_settings SET value = 'allowed', updated_at = now() WHERE key = 'legacy_booking_writes';
-- DELETE FROM public.schema_migrations WHERE version = '0003_restrict_legacy_writes';
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
-- (mentor_cal_webhooks stays closed to anon: it holds secrets and no client ever read it.)
