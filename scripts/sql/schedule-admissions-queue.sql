-- Optional operational setup AFTER deploying the final production URL.
-- Run once as the project administrator in Supabase SQL Editor.
-- First enable pg_cron and pg_net (extensions schema) in the Dashboard.
-- In Vault UI create admissions_app_url (HTTPS origin, no trailing slash)
-- and admissions_cron_secret (the same CRON_SECRET configured in Vercel).
-- Never paste secret values into this file or the cron command.
-- This is not an admissions schema migration and was not run automatically.
begin;
do $check$
declare
    app_url text;
    cron_secret text;
begin
    if not exists (select 1 from pg_extension where extname = 'pg_cron')
        or not exists (select 1 from pg_extension where extname = 'pg_net') then
        raise exception 'Enable pg_cron and pg_net before scheduling admissions.';
    end if;
    select decrypted_secret into app_url from vault.decrypted_secrets where name = 'admissions_app_url';
    select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'admissions_cron_secret';
    if app_url is null or app_url !~ '^https://[A-Za-z0-9.-]+$'
        or app_url ~* '^https://(localhost|127\.|0\.)' then
        raise exception 'Set the final HTTPS origin in Vault admissions_app_url (no trailing slash).';
    end if;
    if cron_secret is null or length(cron_secret) < 32 then
        raise exception 'Set the matching CRON_SECRET in Vault admissions_cron_secret (32+ characters).';
    end if;
end;
$check$;

-- Repeating cron.schedule with this name updates the owner's existing job.
select cron.schedule(
    'admissions-notification-queue',
    '* * * * *',
    $job$
    select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'admissions_app_url') || '/api/cron/process-queue',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'admissions_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 110000
    );
    $job$
);
commit;

-- Verify the job exists without reading its request headers or Vault values.
select jobid, jobname, schedule, active from cron.job where jobname = 'admissions-notification-queue';
