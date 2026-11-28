# Supabase egress reduction plan

## Goal and baseline

Reduce unnecessary Supabase data transfer while preserving registrations, workshop seat checks and durable notification delivery. The previous billing cycle used 7.383 GB of the organization's 5 GB uncached quota. Dashboard totals include every project and do not establish how much any one feature contributed. The current repository reads the whole `platform_state` snapshot for many requests; its size grows with stored records.

## Phase 1: reduce idle traffic locally

1. Pause automatic UI polling while a browser tab is hidden; refresh after the user returns and retain manual refresh. Slow dashboard, audit, diagnostics and email polling to 30 seconds. Keep workshop availability refresh and authoritative submission-time capacity checks.
2. Back off the standalone notification worker gradually when it finds no jobs, with a maximum 30-second idle interval. Resume the normal 2-second interval after processing work. Preserve server-side leases, job retry rules and failure backoff. An idle worker can take up to 30 seconds to pick up a newly queued job.
3. Test visibility recovery, polling, scheduler leases, job processing and TypeScript. Build and inspect the diff without sending test submissions to the live database.
4. Optimize the actual deployed scheduler path: Supabase `admissions-notification-queue` invokes `/api/cron/process-queue` every minute. The scheduler now generates due workshop reminders first, then, if there are no queued or sending jobs, records a successful worker heartbeat and returns in the same transaction. Queued jobs and interrupted sending jobs still use normal dispatch and recovery; active worker leases still prevent overlap. The standalone worker backoff above does not change the Supabase cron schedule.

Supabase logs showed the cron and repeated full `platform_state` reads even without users. An ordinary idle run formerly made three snapshot reads (claim, empty outbox, release); the changed path makes one. At a one-minute schedule, this changes the theoretical idle baseline from about 4,320 to 1,440 full snapshot reads per day, excluding retries and other traffic. It is not a measurement of total egress savings: snapshot size, active jobs, other requests and all projects in the organization affect actual usage. One full read per minute remains, and this optimization is local until deployed.

## Phase 2: measure before changing storage

Use the Supabase organization Usage page and project service breakdown across comparable periods. Record database egress, request counts, snapshot size, worker deployment and active tabs. Values are approximate and hourly updated; do not collect applicant data or secrets. Compare trends after this code is deployed; local tests alone cannot establish live savings. Stop live load tests while the organization is close to quota.

## Phase 3: reduce data per request

Inventory endpoints and replace whole-snapshot reads with narrowly scoped, authorized reads in a separately designed migration. Preserve atomic submissions, workshop capacity, duplicate prevention, durable queue leases, authorization, recovery and RLS. Verify migrations on an isolated database with representative synthetic data; compare correctness, query counts, bytes and concurrency before any live cutover. Avoid a process-local cache of mutable admissions data because it can become stale across server instances.

## Release and monitoring

Review all existing unrelated changes before any deployment. Once explicitly deployed, monitor egress and queue lag, verify sign-in, forms, workshop availability and notification delivery, and roll back if behavior regresses. No fixed savings or capacity figure is guaranteed. Prior-cycle egress cannot be undone; the quota is shared across the organization.
