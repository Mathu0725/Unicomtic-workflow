# Worker and Vercel readiness — 27 October 2026

The Vercel Hobby deployment configuration, protected scheduler support and local validation are complete. A Vercel project has not yet been created. Hosting, Supabase Cron activation and deployed load validation remain pending.

## Changes

- Authenticated GET and POST queue triggers share one durable three-minute worker lease. Overlapping invocations skip dispatch. Expired leases recover, and an older invocation cannot release another invocation's lease. Workshop reminders retain their deduplication keys.
- Worker completion timestamps and safe failure codes persist in Supabase and appear in System health. Job failures remain visible separately. Existing uncertain-email and Sheets reconciliation rules are preserved.
- `?check=1` verifies database access, provider credential decryption and saved Google client configuration without dispatching jobs. HEAD cannot trigger work. The function explicitly uses Node.js and a 120-second duration limit.
- `APP_DATA_KEY` preserves existing encrypted Google/SMTP credentials independently of a new production session signing secret. This workstation's original raw file key was verified against the real saved credentials without contacting Google.
- `npm run deploy:check` checks production variables and the existing database. `--remote` adds read-only deployed readiness/authentication checks. It never starts dispatch.
- Document and marks uploads use a shared four-MiB file limit with bounded multipart overhead below Vercel's request-body limit. Client and server validations agree; existing Drive files are preserved.
- Deployment ignores and Next tracing exclusions are configured. The build also removes private/non-runtime dependencies from trace manifests and verifies the result. The independent pass is necessary on this Windows workspace because Next's glob matching does not exclude paths containing the workspace's parentheses. Local source records and keys are preserved.
- A backup verification command checks the complete file checksum, matching manifest filename and snapshot structure. The load harness restores the shared generated Next type-reference file after its isolated server stops.

Follow the [Tamil Vercel Hobby setup guide](VERCEL_HOBBY_SETUP.md). The optional [Supabase Cron SQL](../scripts/sql/schedule-admissions-queue.sql) reads its origin and bearer secret from Vault and was not executed. Vercel Hobby's daily native cron is unsuitable for the minute queue schedule; see [official limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Verification

| Check | Result |
| --- | --- |
| Regression suite | **287 tests / 35 files passed** |
| TypeScript | Passed, including after restoring live Next generated references |
| Production build | Passed on Next.js 16.4.3 with Webpack; build trace preparation/check passed |
| Final trace audit | 86 manifests; **zero private dependencies remaining** |
| Configured secret scan | No configured private credential values found in 299 tracked/non-ignored source files at verification |
| Supabase connection / public isolation | Passed; anonymous snapshot read and save denied |
| Existing provider-key migration | Saved credentials decrypt using the existing raw key with a different production signing secret |
| Production HTTP smoke test | 13 read-only checks passed, using a separate local production process |
| Live snapshot preservation | Version and canonical digest unchanged during production-mode smoke checks |
| Admissions backup | Fresh Supabase snapshot and SHA-256 manifest created and verified; 24,501 bytes, version 19 |
| Live provider sends / Sheets writes | None requested for validation |

The production-mode smoke test checked health/readiness, login/registration/status/application pages, logo serving, anonymous status/worker denial, HEAD rejection, authenticated no-dispatch provider-key readiness and 404 responses for private file URLs. Temporary signing/admin/scheduler secrets existed only in that test process. The process was stopped afterward. This establishes local production-mode behavior against the existing Supabase snapshot, not a Vercel deployment.

### 300 concurrent applicants

The [recorded local HTTP report](validation/production-readiness-concurrency-2026-10-27.json) uses isolated storage and synthetic fixtures:

| Scenario | Result |
| --- | --- |
| 300 simultaneous distinct registrations | 300 accepted; 13.147 seconds total; p95 12.633 seconds |
| Dashboard reads during burst | 30/30 succeeded |
| 50 overlapping retries of one submission | One saved registration, 49 replays |
| Same identity with different keys | All 20 rejected as duplicates |
| 100 applicants for 25 workshop seats | 25 accepted; 75 expected capacity conflicts |
| 50 verified applications | All accepted and linked to their registrations |
| Lost response | Original receipt recovered |
| Corrupt local snapshot | Safe error; no automatic reset; restored fixture readable |
| Notification/export queue | 1,156 unique jobs, no real provider calls |

A later 30-user harness check also passed after the generated-file restoration change, and left the live Next type references intact. All load data stays in ignored isolated test directories.

## Deployment work still required

1. Create/link the Vercel project and final HTTPS origin. Configure the production variables and matching OAuth callback. The existing local environment intentionally retains its local URL/development signing-key setup; the production check correctly reports it as not deployment-ready.
2. Preserve the original data encryption key, set a stable production APP_SECRET and a strong administrator password, and verify credentials on the deployed host before activating dispatch.
3. Review the real pending queue, then enable the reviewed Supabase Cron job with matching Vault values. No live worker/scheduler was started by this phase.
4. Validate realistic traffic against a separate deployed staging database. The aggregate repository still rewrites a JSON snapshot for mutations, and local throughput does not establish hosted Supabase capacity.
5. Configure automatic encrypted off-machine backup retention and perform an isolated full restore drill. The new verified local snapshot is not an automated off-machine backup system.

Staff account revocation/reset, course/intake consistency and the other follow-ups in the [project review](PROJECT_REVIEW_2026-10-26.md) are separate pending work.
