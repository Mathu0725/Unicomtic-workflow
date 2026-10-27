-- Run against the configured project in SQL Editor or psql. All test writes roll back.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE sample jsonb := '{"students":[],"registrations":[],"campaigns":[]}';
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_state) THEN
    -- Check CAS against a guaranteed stale version; never touch real admissions.
    IF public.save_platform_state(-1, sample) THEN RAISE EXCEPTION 'Initialization overwrote existing data'; END IF;
  ELSE
    IF NOT public.save_platform_state(-1, sample) THEN RAISE EXCEPTION 'First initialization failed'; END IF;
    IF public.save_platform_state(-1, sample) THEN RAISE EXCEPTION 'Repeated initialization succeeded'; END IF;
    IF public.save_platform_state(999, sample) THEN RAISE EXCEPTION 'Stale write succeeded'; END IF;
    IF NOT public.save_platform_state(0, sample) THEN RAISE EXCEPTION 'Valid version update failed'; END IF;
    IF (SELECT version FROM public.platform_state WHERE id='admissions') <> 1 THEN RAISE EXCEPTION 'Version increment failed'; END IF;
  END IF;
  BEGIN
    PERFORM public.save_platform_state(-2, sample);
    RAISE EXCEPTION 'Invalid version was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.save_platform_state(-1, '{"students":null,"registrations":[],"campaigns":[]}');
    RAISE EXCEPTION 'Invalid snapshot was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM data FROM public.platform_state;
    RAISE EXCEPTION 'Anonymous snapshot access was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.save_platform_state(-1, '{"students":[],"registrations":[],"campaigns":[]}');
    RAISE EXCEPTION 'Anonymous write access was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM data FROM public.platform_state;
    RAISE EXCEPTION 'Ordinary signed-in snapshot access was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.save_platform_state(-1, '{"students":[],"registrations":[],"campaigns":[]}');
    RAISE EXCEPTION 'Ordinary signed-in write access was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT jsonb_build_object(
  'sql_checks', 'passed; all test writes rolled back',
  'tables_without_rls', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity),
  'public_or_signed_in_table_grants', (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')),
  'anonymous_save_permission', has_function_privilege('anon','public.save_platform_state(bigint,jsonb)','EXECUTE'),
  'signed_in_save_permission', has_function_privilege('authenticated','public.save_platform_state(bigint,jsonb)','EXECUTE'),
  'server_save_permission', has_function_privilege('service_role','public.save_platform_state(bigint,jsonb)','EXECUTE'),
  'admissions_rows', (SELECT count(*) FROM public.platform_state)
) AS verification_result;
