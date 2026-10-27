# Error handling — implementation and verification

23 October 2026 · Unicom TIC · Target: 100–300 simultaneous applicants.

27 October update: [Vercel Hobby preparation, worker leases, key migration and fresh verification](PRODUCTION_READINESS_2026-10-27.md). The current suite passes 287 tests; the original results below remain the dated baseline.

**Implemented locally.** API/browser recovery, validation, worker, storage protection and diagnostics are in the project. See the [approved plan](ERROR_HANDLING_PLAN.md). Deployment and validation against the intended production host/Supabase instance remain release gates.

## Delivered changes

| Area | Behavior |
| --- | --- |
| API | Stable codes, safe messages, request IDs, field errors, recovery actions and explicit retryability. Unknown exceptions/legacy 500 responses do not expose internal messages. No-store responses. Bounded JSON/upload reads happen before write locks; bodyless worker/sync POSTs remain supported. |
| Browser | Handles timeout, caller cancellation, offline, HTML and empty responses. Safe admin mutations are distinguished from submissions that support retry keys. Polling does not overlap and backs off; failed/stale data is visible. |
| Submission recovery | Retains original answers/key while outcome is unknown, including temporary browser reloads. Changed answers cannot start another attempt until resolved. **Resolve pending submission** is available on public forms. HTML with HTTP 200 is not a confirmed save. |
| Sessions/pages | Network failure shows Retry; actual session 401 redirects with a restricted admin return path. Logout must be confirmed. Root/global/admin/custom-form error boundaries, loading/not-found views, visible list failures and draft-storage messages are included. |
| Settings/staff | Real validated, audited Settings persistence and stale-version checks replace the fake Saved state. Policy versions/text history are retained. Staff views show configured authorized accounts and state that invitation/role editing is unavailable. |
| Marks | File type/size/row bounds, malformed CSV rejection, signed expiring preview, and commit-time exam/intake/attendance/student/score/duplicate validation. Client validity flags are not trusted. The UI commits the complete validated file, not just its first 100 preview rows. |
| Lifecycle | Validated campaign/application/attendance/exam/eligibility/interview/final-decision actions and entity relationships. Critical editors check stale state. Superseded offers cannot be blindly resent. |
| Providers/worker | Typed temporary, blocked, permanent and uncertain failures; quota backoff; blocked lanes; malformed-job isolation; expired-lease recovery; worker failure backoff. A failed token refresh is not treated as an uncertain message send. |
| Sheets | Known jobs with changed destinations pause before provider calls. Retry/release controls refuse an obsolete destination. Activity links to each job's actual Sheet. Manual exports accurately report pending, previously exported and repair counts. |
| Storage | Distinguishes busy/unavailable/corrupt/missing/full/permission failures. Failed atomic replacement preserves committed data. Missing initialized snapshots cannot silently reset to empty. Production initialization requires an explicit setup flag. |
| Operations | **Admin → System health** shows heartbeat, queue age/counts, latency and grouped incidents with acknowledgement/recovery. Logs allowlist operational metadata and exclude credentials, raw messages and applicant payloads. Unexpected errors have a fingerprint. A verified local backup command is included. |

Google token exchange, Sheet creation and response-sheet reads finish outside write transactions. Short commits recheck state. Unconfirmed Sheet creation tells the operator to check Drive before creating another.

Drafts and submission retry state expire after 24 hours on the user's device. Confirmed submissions clear drafts where supported. Restoring a draft requires accepting the declaration again. Custom submissions retain the form version and accepted declaration text.

## Verification

| Check | Result |
| --- | --- |
| Automated suite | **100 passed / 23 test files** |
| TypeScript | Passed |
| Production build | Passed using an isolated build directory |
| 300 concurrent registrations | **300 HTTP 200**, distinct references; latest burst 8.771 s, p95 8.251 s |
| Concurrent dashboard reads | 30/30 HTTP 200; p95 106 ms |
| 50 same-key retries | One record, 49 receipt replays |
| Duplicate identity / different keys | 20/20 expected HTTP 409 |
| 100 contenders / 25 seats | 25 accepted, 75 expected HTTP 409 |
| Concurrent linked applications | 50 accepted, no additional canonical students |
| Discarded response | Original receipt recovered without another record |
| Corrupt snapshot | Safe STORAGE_CORRUPT, no reset, successful recovery after restoring the original snapshot |
| Lost database commit acknowledgement | Original receipt resolves COMMIT_UNCONFIRMED; only one database write |
| Failed file replacement | Existing snapshot retained; temporary files/lock cleaned; no false success |
| Private HTTP-test totals | 327 students/registrations, 50 applications, 25 bookings, 1,156 unique queued jobs; **zero real provider calls** |
| Real Google access | Current configured Sheet metadata verified through the portal API: HTTP 200; no Sheet writes or emails |
| Browser | Settings/real staff access loaded; diagnostics showed the worker active after the empty-POST regression was repaired; public registration exposed policy/recovery controls |

Evidence: [HTTP load and fault report](validation/error-handling-concurrency-2026-10-23.json). Earlier baseline: [concurrency audit](CONCURRENCY_AUDIT.md).

These are isolated local development-server measurements on small synthetic data. Development runs varied from 5.891 to 11.160 seconds as the implementation and shared-machine workload changed. These results establish the tested correctness scenarios, not a production latency SLA or real Google throughput. The test runner bounds independent test-file workers to four with a 15-second test allowance, preventing filesystem-heavy tests from timing out while their work is still running.

## Recovery guide

Open [System health](http://localhost:3000/admin/diagnostics) and [Email Center](http://localhost:3000/admin/email).

| Situation | Action |
| --- | --- |
| Unknown submission outcome | Keep original answers and use **Resolve pending submission**, or track the existing reference. |
| Stale worker | Keep the app and `npm run worker` running, or repair the protected scheduler. Compare server/worker CRON_SECRET privately. |
| Google blocked | Reconnect the intended account, grant required scopes, verify the Sheet, then release eligible blocked jobs. |
| Sheet header/access blocked | Check **View job destination**, sharing, tab and referenceNo in column A. Review form override versus global destination. |
| Destination changed | Queue a current export from Responses or Sheets Synchronization. Old exports remain paused rather than silently changing targets. |
| SMTP blocked | Correct account/app password/TLS settings, verify saved SMTP, then release eligible jobs. |
| Permanent recipient rejection | Correct source data/provider policy and review before manually retrying. |
| Email uncertain | Check Gmail Sent/SMTP logs before confirming a retry. No mailbox-reading permission was added. |
| Stale settings/form/evaluation | Reload, review the other edit and apply the intended change again. |
| Marks preview expired/changed | Preview again; correct every invalid row before committing. Failed commits do not save partial marks. |
| Storage corrupt/missing/full/permission failure | Preserve current files, stop mutations and repair/restore storage; do not initialize an empty replacement. |

Saved admission, accepted email and exported Sheet are separate states. Provider acceptance does not prove inbox delivery or reading.

## Backup and release procedure

`npm run backup:local` validates core snapshot metadata, writes a new file and SHA-256 manifest under DATA_DIR/backups, rereads it and verifies the bytes. It never overwrites the live snapshot. A verified backup was created during this work. For Supabase, use the database's real backup/restore procedure; the local command refuses to imply that a local file backs up Supabase.

To restore local storage: stop app/worker; preserve damaged files; verify the chosen backup hash and counts in isolation; restore it to DATA_DIR/platform.json with its permissions and initialized marker; retain the original APP_SECRET or secret.key through a separately protected secret-backup process; check readiness/known references; then restart the worker and review uncertain jobs. Never restore synthetic load-test data into the real portal.

For a deliberately new empty **production** store, temporarily enable ALLOW_DATABASE_INITIALIZE during setup, persist the first state, then disable it. Never use it to resolve missing real records. Development/test fresh stores initialize normally; initialized local stores remain protected.

Remaining deployment/operational gates:

- Run staging checks on the actual host/Supabase instance, representative historical data and intended worker topology. No production deployment was performed here.
- Use persistent disk for explicitly allowed local storage, or Supabase. The aggregate snapshot architecture has a practical size/throughput limit.
- Keep a worker/authenticated scheduler running. Gmail/Sheets quotas can delay jobs even when applications save successfully.
- Admission/login burst controls are process-local. Multi-instance hosting needs a distributed edge policy and trusted proxy headers that accommodate shared-campus bursts.
- Diagnostics retains up to 200 incidents/24 hours and 300 latency samples **per server process**. Configure host log access/retention and external alerts separately if required.
- Targeted automated tests cover browser transport and provider/storage failures. A production root-layout crash was not deliberately injected into the running user portal.

References: [Gmail error handling](https://developers.google.com/workspace/gmail/api/guides/handle-errors), [Sheets quotas/backoff](https://developers.google.com/workspace/sheets/api/limits), [Next.js 14 error boundaries](https://nextjs.org/docs/14/app/building-your-application/routing/error-handling).
