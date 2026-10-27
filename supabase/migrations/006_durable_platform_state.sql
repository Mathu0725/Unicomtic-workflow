-- One authoritative, versioned repository for the existing aggregate-based app.
-- Commits atomically include identities, dedupe checks, bookings and notification jobs.
-- The earlier normalized tables remain available for a later reporting projection.
CREATE TABLE IF NOT EXISTS public.platform_state (
  id text PRIMARY KEY CHECK (id = 'admissions'),
  version bigint NOT NULL DEFAULT 0,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_state FROM anon, authenticated;
GRANT ALL ON public.platform_state TO service_role;
CREATE OR REPLACE FUNCTION public.save_platform_state(expected_version bigint, next_data jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF expected_version = -1 THEN
    INSERT INTO platform_state(id, version, data) VALUES ('admissions', 0, next_data) ON CONFLICT DO NOTHING;
    RETURN FOUND;
  END IF;
  UPDATE platform_state SET version = version + 1, data = next_data, updated_at = now()
  WHERE id = 'admissions' AND version = expected_version;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.save_platform_state(bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_platform_state(bigint,jsonb) TO service_role;

-- Staff sessions are verified by Next.js; sensitive legacy tables are server-only.
-- Remove earlier permissive public/authenticated policies, if those tables exist.
DO $$ DECLARE policy record; BEGIN
  FOR policy IN SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename NOT IN ('campaigns','courses')
    AND tablename IN ('students','registrations','applications','email_accounts','email_templates','email_campaigns','email_jobs','email_events','workshops','workshop_invitees','attendance','exams','marks_imports','exam_results','eligibility_rules','interviews','interview_candidates','interview_evaluations','selection_decisions','sheet_sync_jobs','admin_profiles','audit_logs','system_settings','custom_forms','form_submissions')
    AND roles && ARRAY['public','anon','authenticated']::name[]
  LOOP EXECUTE format('DROP POLICY %I ON %I.%I', policy.policyname, policy.schemaname, policy.tablename); END LOOP;
END $$;
