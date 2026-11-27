-- Keep idle scheduled queue checks inside Postgres. The application still owns
-- reminder creation and delivery; any runnable work falls back to that path.
CREATE OR REPLACE FUNCTION public.try_idle_queue_worker_tick()
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  current_data jsonb;
  control jsonb;
  now_at timestamptz := clock_timestamp();
  now_ms bigint;
  has_pending_jobs boolean;
  has_due_reminders boolean;
BEGIN
  now_ms := floor(extract(epoch FROM now_at) * 1000)::bigint;
  SELECT data INTO current_data FROM public.platform_state
  WHERE id = 'admissions' FOR UPDATE;
  IF NOT FOUND OR jsonb_typeof(current_data) <> 'object' THEN RETURN 'unsupported'; END IF;

  control := CASE WHEN jsonb_typeof(current_data->'queueControl') = 'object'
    THEN current_data->'queueControl' ELSE '{}'::jsonb END;
  IF (control->'worker_lease'->>'expires_at') ~ '^[0-9]+$'
     AND (control->'worker_lease'->>'expires_at')::numeric > now_ms THEN
    RETURN 'already_running';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(current_data->'outbox') = 'array' THEN current_data->'outbox' ELSE '[]'::jsonb END
    ) AS job(value) WHERE job.value->>'status' IN ('queued', 'sending')
  ) INTO has_pending_jobs;
  IF has_pending_jobs THEN RETURN 'needs_processing'; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(current_data->'workshops') = 'array' THEN current_data->'workshops' ELSE '[]'::jsonb END
    ) AS workshop(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(workshop.value#>'{reminder_schedule,days_before}') = 'array'
        THEN workshop.value#>'{reminder_schedule,days_before}' ELSE '[]'::jsonb END
    ) AS reminder(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(current_data->'workshopBookings') = 'array'
        THEN current_data->'workshopBookings' ELSE '[]'::jsonb END
    ) AS booking(value)
    WHERE workshop.value->>'reminders_enabled' IS DISTINCT FROM 'false'
      AND pg_input_is_valid(workshop.value->>'start_time', 'timestamp with time zone')
      AND booking.value->>'workshop_id' = workshop.value->>'id'
      AND booking.value->>'status' = 'confirmed'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(current_data->'students') = 'array' THEN current_data->'students' ELSE '[]'::jsonb END
        ) AS student(value) WHERE student.value->>'id' = booking.value->>'student_id'
      )
      AND (reminder.value #>> '{}') ~ '^[1-9][0-9]*$'
      AND (reminder.value #>> '{}')::numeric BETWEEN 1 AND 90
      AND extract(epoch FROM ((workshop.value->>'start_time')::timestamptz - now_at)) / 3600.0
        <= (reminder.value #>> '{}')::numeric * 24
      AND extract(epoch FROM ((workshop.value->>'start_time')::timestamptz - now_at)) / 3600.0
        > ((reminder.value #>> '{}')::numeric - 1) * 24
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(current_data->'outbox') = 'array' THEN current_data->'outbox' ELSE '[]'::jsonb END
        ) AS existing_job(value)
        WHERE existing_job.value->>'key' = format(
          'reminder:%s:%s:%s', booking.value->>'id', reminder.value #>> '{}', workshop.value->>'start_time'
        )
      )
  ) INTO has_due_reminders;
  IF has_due_reminders THEN RETURN 'needs_processing'; END IF;

  control := (control - 'worker_lease' - 'last_worker_error') || jsonb_build_object(
    'last_worker_at', now_ms, 'last_worker_completed_at', now_ms
  );
  UPDATE public.platform_state
  SET version = version + 1, data = jsonb_set(current_data, '{queueControl}', control, true), updated_at = now_at
  WHERE id = 'admissions';
  RETURN 'idle';
END;
$$;
REVOKE ALL ON FUNCTION public.try_idle_queue_worker_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_idle_queue_worker_tick() TO service_role;
NOTIFY pgrst, 'reload schema';
