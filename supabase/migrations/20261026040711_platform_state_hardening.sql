-- All portal access is authorized by the Next.js server, not Supabase Auth users.
-- Keep the canonical snapshot and legacy reporting tables server-only.
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'campaigns','courses','students','registrations','applications',
    'email_accounts','email_templates','email_campaigns','email_jobs','email_events',
    'workshops','workshop_invitees','attendance','exams','marks_imports','exam_results',
    'eligibility_rules','interviews','interview_candidates','interview_evaluations',
    'selection_decisions','sheet_sync_jobs','admin_profiles','audit_logs',
    'system_settings','custom_forms','form_submissions','platform_state'
  ] LOOP
    IF to_regclass(format('public.%I', target)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', target);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.platform_state'::regclass AND conname = 'platform_state_version_valid') THEN
    ALTER TABLE public.platform_state ADD CONSTRAINT platform_state_version_valid CHECK (version >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.platform_state'::regclass AND conname = 'platform_state_data_valid') THEN
    ALTER TABLE public.platform_state ADD CONSTRAINT platform_state_data_valid CHECK (
      jsonb_typeof(data) = 'object'
      AND data ?& ARRAY['students','registrations','campaigns']
      AND jsonb_typeof(data->'students') = 'array'
      AND jsonb_typeof(data->'registrations') = 'array'
      AND jsonb_typeof(data->'campaigns') = 'array'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_platform_state(expected_version bigint, next_data jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF expected_version IS NULL OR expected_version < -1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid repository version';
  END IF;
  IF (jsonb_typeof(next_data) = 'object'
      AND next_data ?& ARRAY['students','registrations','campaigns']
      AND jsonb_typeof(next_data->'students') = 'array'
      AND jsonb_typeof(next_data->'registrations') = 'array'
      AND jsonb_typeof(next_data->'campaigns') = 'array') IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid repository snapshot';
  END IF;
  IF expected_version = -1 THEN
    INSERT INTO public.platform_state(id, version, data)
    VALUES ('admissions', 0, next_data) ON CONFLICT DO NOTHING;
    RETURN FOUND;
  END IF;
  UPDATE public.platform_state
  SET version = version + 1, data = next_data, updated_at = now()
  WHERE id = 'admissions' AND version = expected_version;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON public.platform_state FROM service_role;
GRANT SELECT, INSERT, UPDATE ON public.platform_state TO service_role;
REVOKE ALL ON FUNCTION public.save_platform_state(bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_platform_state(bigint,jsonb) TO service_role;

-- Harden functions created by the legacy migrations as well.
DO $$
BEGIN
  IF to_regprocedure('public.get_current_admin_role()') IS NOT NULL THEN
    ALTER FUNCTION public.get_current_admin_role() SECURITY INVOKER;
    ALTER FUNCTION public.get_current_admin_role() SET search_path = public;
    REVOKE ALL ON FUNCTION public.get_current_admin_role() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_current_admin_role() TO service_role;
  END IF;
  IF to_regprocedure('public.update_custom_form_submission_count()') IS NOT NULL THEN
    ALTER FUNCTION public.update_custom_form_submission_count() SET search_path = public;
    REVOKE ALL ON FUNCTION public.update_custom_form_submission_count() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.update_custom_form_submission_count() TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
