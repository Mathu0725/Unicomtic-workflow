# Vercel + Supabase staging capacity test

Status 2026-11-03: this staging-only plan remains the safe route for write-path load testing. A separate bounded read-only test was run against the production deployment; see `PRODUCTION_READONLY_CAPACITY_CHECK_2026-11-03.md`. No production write load was sent. Production's legacy `platform_state` already has 5 students and 5 registrations, so never clear that state as test cleanup. The dedicated staging project previously used for this plan may have been deleted by the user; verify it exists before resuming.

Implementation update (2026-11-02): the runner now requires `STAGING_ISOLATION_VERIFIED=qxxnvkpbhjkdayomkzkf` after independent deployment/ref verification, pins that dedicated ref, and defaults to bounded stages `10,25,50,100,200,300`. Optional `STAGING_BURST_STAGES` overrides the increasing stages within the request budget; `STAGING_P95_LIMIT_MS` defaults to 5000. Any correctness or p95 failure stops escalation. The earlier 100/300 description below documents the original runner. Share-link creation previously failed automatic approval review and must not be retried without resolving that authorization; prefer an already authorized HTTP access path. See `API_SECURITY_TEST_REPORT_TA.md` for current coverage and blockers.

Status on 2026-11-02: the isolated remote test runner is ready in `scripts/staging-load-test.mjs`. The remote test has **not** run. A separate $0/month Supabase project (`qxxnvkpbhjkdayomkzkf`) and protected Vercel project (`unicomtic-workflow-staging`) are active. The staging database has the hardened `platform_state` schema and an empty snapshot generated from the reviewed code; production records were not copied. The staging deployment uses commit `43bac089872ff4473dea9a26775e919b42a26d4a`. Its Production environment still needs the staging-only `SUPABASE_SERVICE_ROLE_KEY` before the health check and load test can proceed.

## Isolation requirements

- Use a new Supabase project and a separate Vercel project named `unicomtic-workflow-staging`. Check that both projects are on a free tier before creating them; do not accept a paid upgrade for this test.
- Deploy the same reviewed Git commit as production. Do not deploy the local working tree: it contains unrelated uncommitted changes.
- Never copy production `platform_state`, applicant records, Google OAuth tokens, SMTP credentials, Sheet IDs, or Cron/Vault settings into staging.
- Give staging its own administrator email/password, `APP_SECRET`, `CRON_SECRET`, Supabase URL and keys. Set `SEED_DEMO_DATA=false`, `ALLOW_LOCAL_STORAGE=false`, and `NEXT_PUBLIC_APP_URL` to its staging `.vercel.app` origin. Keep Google/SMTP/Sheets unset and do not schedule the queue worker.
- Install the canonical `platform_state` schema/function plus its hardening migration on staging, and verify service-role access and anon/authenticated denial. New Supabase projects may not expose tables to the Data API automatically; confirm the app's service role can use `platform_state` and `save_platform_state` before load testing.
- Permit first-time database initialization only until the initial staging snapshot has been committed. Then set `ALLOW_DATABASE_INITIALIZE=false` and redeploy. Verify `/api/health/ready` and the administrator dashboard before the burst.

## Run

Confirm in Vercel that the staging project's `NEXT_PUBLIC_SUPABASE_URL` contains the *staging* project ref. Keep Vercel Deployment Protection enabled. Create a temporary share URL for the staging deployment and set it as `STAGING_SHARE_URL` so the runner can obtain the access cookie. Put only the runner's URL/ref/admin credentials and share URL in a gitignored `.env.staging.local` file. Node 24 can load it without printing values:

```powershell
node --env-file=.env.staging.local scripts/staging-load-test.mjs
```

Required variable names are `STAGING_BASE_URL`, `STAGING_SUPABASE_PROJECT_REF`, `STAGING_ADMIN_EMAIL`, and `STAGING_ADMIN_PASSWORD`; `STAGING_SHARE_URL` is required when deployment protection is enabled. `STAGING_BASE_URL` must be the same staging deployment origin as the share URL. The script rejects production domains, requires Supabase storage, no Google/SMTP/Sheets destinations, an empty registration database and queue, and disables email automation on its synthetic form. It submits 100 then 300 distinct registrations with `example.com` addresses. Any failure in the 100-person burst stops the test before the 300-person burst. No production records, real messages, or Sheet writes are involved.

The report is written under `.data/load-tests/staging-*.json` with HTTP status counts, elapsed time, p50/p95/p99 latency, unique references, and recorded response counts. A 200 response means the transaction committed; compare the report's recorded counts to the accepted count. A timeout can have committed despite an unreadable response, so inspect the staging form's response count before any retry. Keep the report and synthetic staging project for diagnosis until the result has been reviewed.
