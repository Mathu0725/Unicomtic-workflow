# Concurrent submissions audit — 23 October 2026

Target: **100–300 people submitting at the same time**. This audit covers registration, custom application forms, workshop booking, database commits and notification/Sheets dispatch.

**Result:** an isolated local HTTP test accepted **300 of 300 simultaneous registrations in 4.444 seconds**. The 95th-percentile request latency was **4.146 seconds**. No duplicate records or excess workshop bookings were created. This is a measured local result, not a guarantee for an untested hosting environment.

## Problems found and changes made

| Problem | Change |
| --- | --- |
| Applicant responses waited for Gmail/Sheets network calls | Submission responses now wait only for the committed records and jobs. A separate worker dispatches providers. |
| Supabase compare-and-swap conflicts rejected otherwise valid submissions immediately | Pure submission handlers retry on fresh snapshots with bounded, randomized backoff. Exhausted contention returns retryable HTTP 503 with Retry-After. |
| A lost response or repeated click could leave the applicant unsure whether the first submission succeeded | Public forms send a stable retry key. The committed transaction stores a 24-hour receipt; the same key and answers replay the original result. Changed answers cannot reuse that receipt. |
| Dashboard/public reads waited behind the global write queue | Reads use committed snapshots independently. SMTP verification/testing also runs without holding the admissions write lock. |
| One Google Sheet export operation per registration consumed quota rapidly | Workers combine up to 100 same-destination jobs, with an approximately 1 MB batch cap and account-wide pacing. They reconcile reference numbers before writing. |
| Separate workers could compete for the same jobs | Claims, attempt numbers, leases and pacing are committed atomically. Overlapping-worker tests verify one dispatch for a claimed batch. |
| Interrupted workers could leave jobs stuck or accidentally resend email | Expired Sheet leases retry by reference. Uncertain email outcomes require provider review; they are not automatically resent. Provider backoff is preserved. |
| A crashed local process could leave the repository permanently locked | Locks record their owner. A guarded recovery step removes only a dead process's lock. Atomic replacements flush the temporary file and retry transient Windows rename failures. |
| Very large/nested answers could inflate every snapshot and block other submissions | Public submission JSON is limited to 128 KiB before acquiring a transaction. Custom answers reject object payloads and oversized strings/arrays. |
| Worker failures were not apparent in the portal | Email Center now reports a missing/stale worker heartbeat and links to Gmail's sending limits. |

Identity matching and the workshop seat check remain in the same transaction as the registration/application, submission and notification jobs. A rejected booking rolls back its partial student/registration records. Genuine duplicate identities and full workshops still return HTTP 409; they are not silently accepted as new records.

## HTTP load-test results

Tested with an isolated Next.js development server on localhost, fresh private records and build cache. The live portal's data and Google connection were not used. The final test snapshot was 1,364,292 bytes.

| Scenario | Requests | Result | Total burst duration | P95 latency |
| --- | ---: | --- | ---: | ---: |
| Distinct simultaneous registrations | 300 | 300 accepted, 300 unique references | 4.444 s | 4.146 s |
| Overlapping retries of one submission | 50 | 50 successful responses, one record; 49 receipt replays | 0.759 s | 0.734 s |
| Same identity with different retry keys | 20 | 20 expected duplicate rejections | 0.246 s | 0.245 s |
| Competition for 25 workshop seats | 100 | 25 accepted, 75 full-workshop rejections | 1.460 s | 1.412 s |
| Applications linked to existing registrations | 50 | 50 accepted, no extra students/registrations | 1.177 s | 1.134 s |
| Dashboard polling during the registration burst | 30 | 30 successful reads | 1.712 s | 0.141 s |

Final isolated counts: **326 students, 326 registrations, 50 applications, 25 bookings and 1,153 uniquely keyed queued jobs**. All provider attempt counts stayed zero; load tests sent no real email and made no Google API calls.

Machine-readable evidence: [load-test report](validation/concurrency-2026-10-23.json).

## Other validation

- **68 automated tests across 17 files pass**, including HTTP receipt replay, client retry keys, Supabase conflict simulation, Sheet batching and worker failures.
- Four independent Node processes competed for 10 workshop seats: exactly 10 accepted and 50 rejected, with no partial extra students.
- A dead-process file-lock recovery test passes.
- TypeScript checks and the production build pass.
- The local live worker was started with a private CRON_SECRET; its heartbeat was verified. The existing live registration count remained 1, with no load-test applicants added.

The Supabase conflict tests simulate concurrent database updates. They do not replace a load test against a real deployed Supabase project. Bulk provider throughput is tested with mocks, not by sending hundreds of messages to real people.

## Production requirements and remaining limits

### Persistent database and realistic traffic testing

The current local portal uses a JSON snapshot on one persistent disk. Serverless or multiple-host deployments must use the configured Supabase repository and migration `006_durable_platform_state.sql`. A shared network filesystem is not the supported way to run multiple hosts.

The Supabase repository still commits a whole versioned aggregate. Automatic retries protect conflicting writes, but increasing historical record counts increases snapshot transfer, parsing and write cost. This is not an unlimited-throughput database design. Repeat the load test on the actual hosting plan with a representative existing dataset. For much larger sustained volumes, move high-write records to normalized tables with database uniqueness constraints and transactional seat allocation.

Set real production `ADMIN_PASSWORD` and `APP_SECRET`, and keep encrypted tokens/signing secrets backed up. Changing APP_SECRET requires reconnecting Google and re-entering saved SMTP secrets. Production credential requirements are separate from this local concurrency test.

### Keep the worker running

Run the app and a separate worker process:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

In another terminal:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run worker
```

Use a process manager/service for a persistent production server. For serverless hosting, schedule an authenticated POST to `/api/cron/process-queue` every minute and allow a 60-second function duration. Email Center displays worker health. Closing the worker leaves jobs queued until it restarts or the scheduler runs.

### Google provider quotas

Personal Gmail can stop sending above **500 emails per day**. One confirmation plus one admin alert per registration means **300 registrations can request 600 emails**, before workshop confirmations/reminders. To send all of those promptly, configure a sender with adequate capacity. Accepted registrations do not depend on email delivery. [Google sending limits](https://support.google.com/mail/answer/22839).

The portal now enforces a maximum of 500 emails per rolling 24 hours, with a configurable lower cap in Email Center. Durable reservations share that budget across concurrent workers, account aliases and restarts; overflow remains queued without attempts. Provider daily-quota errors pause the sender for at least 24 hours. [Candidate emails and allowance details](CANDIDATE_EMAILS.md).

Sheets has per-minute limits; batching, shared pacing and backoff reduce burst traffic. An API outage or quota error keeps jobs queued/failed with their actual status. “Saved”, “exported to Sheets” and “email accepted” are separate states. [Google Sheets quotas](https://developers.google.com/workspace/sheets/api/limits).

## Reproduce the load test

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run test:load
```

The command always creates its own localhost server on port 3101, data directory and build cache under `.data/load-tests/`. It refuses the normal portal port 3000. It retains its report and test data for review and stops its server when finished. Use Node.js 20 or later.

The test models one burst of submissions against a small, fresh dataset. It does not measure internet latency, distributed-host performance, long-running soak behavior or actual provider delivery capacity.
