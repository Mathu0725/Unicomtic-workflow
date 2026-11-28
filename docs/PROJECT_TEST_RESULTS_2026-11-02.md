# Project verification — 2 November 2026

Tested the current working tree, including its existing uncommitted changes. No application source changes were made for this assessment.

## Automated checks

- All 62 test files passed: **688 tests**, 32.59 seconds.
- TypeScript check passed.
- Next.js production Webpack build passed; all 39 static pages generated.
- Deployment preparation and verification passed: 113 traces, zero private files retained after preparation. Preparation removed 5,345 private/non-runtime file references. Build emitted Webpack cache snapshot warnings but completed successfully.
- The installed `npm` launcher is broken (missing its global npm-cli.js). Checks used Node directly against the existing installed project tools.

## Concurrent registration bursts

These are HTTP requests against an isolated Next.js **development server with local JSON storage**, on this computer. Each run starts with separate test data. They do not measure Vercel, real Supabase, active browser sessions, or sustained traffic.

| Overlapping submissions | HTTP 200 | HTTP 503 | Whole burst | Median response | 95th percentile |
| --- | --- | --- | --- | --- | --- |
| 300 | 300 | 0 | 14.457 s | 7.441 s | 12.820 s |
| 500 | 311 | 189 | 37.702 s | 34.453 s | 37.340 s |
| 1,000 | 648 | 352 | 42.364 s | 32.686 s | 41.737 s |

The 300-request run overlapped the production build; the subsequent 1,000 and 500 runs were separate. These single-run samples vary with host conditions and do not establish an exact maximum or guarantee. The largest fully successful burst tested in this assessment was 300. Even that burst has substantial waiting time; a successful response is not automatically an acceptable user experience. The 500 and 1,000 bursts failed the harness acceptance criterion and stopped before the remaining scenarios.

The failing bursts logged `DATABASE_BUSY` and a roughly 30-second application wait. Inspection of `src/lib/data/repository.ts` shows transactions queued through a shared promise chain, full snapshot serialization for writes, and a default transaction deadline of 30,000 ms. This is consistent with queued writes exhausting their deadline. Increasing a timeout alone would not establish greater throughput.

## Functional concurrency checks passed in the 300-request run

- 300 distinct registrations returned distinct reference numbers.
- 50 overlapping retries produced one registration reference, with 49 replay responses.
- A discarded acknowledgement was recovered using the same idempotency key.
- 20 duplicate identity attempts returned the expected HTTP 409.
- 100 contenders for 25 workshop seats produced exactly 25 accepted bookings and 75 expected HTTP 409 responses.
- 50 verified applications linked successfully to registrations.
- All 30 concurrent dashboard reads returned HTTP 200.
- Simulated corrupt storage returned a safe error without resetting records; restoring the snapshot recovered reads.
- Final snapshot: 327 registrations, 327 students, 50 applications, 25 workshop bookings, 1,156 unique queued jobs. No actual email/Google provider calls.

## Remote and browser verification remain incomplete

The separate staging runner stopped on its first health request: HTTP 302 without JSON. No remote load burst or synthetic form creation was reached. The local staging runner configuration has no temporary share URL. Vercel deployment metadata reports staging READY at commit `43bac089872ff4473dea9a26775e919b42a26d4a`, which does not include this working tree's uncommitted changes. READY is a deployment state, not proof of application/database health.

The connected protected-URL fetch also failed: deployment not found or connection lacks project/team access. No local Vercel CLI was available for an authenticated fallback. Enable the connection's staging project/team access or supply an authorized temporary staging share URL through the existing private runner configuration, then verify readiness and database isolation before running the remote bursts. Previous staging setup notes also identify a missing staging service-role key; its current status was not verified here.

A browser attempt to open the isolated local login page returned `ERR_CONNECTION_RESET`; browser rendering and interactive end-to-end flows were not verified. Existing automated UI/component checks passed, but they do not replace browser testing. Live email delivery, Google Sheets writes, and sustained/soak capacity were not tested.

## Evidence

- 300: `../.data/load-tests/run-5f3Io3/report.json`
- 500: `../.data/load-tests/run-XaHZXA/report.json`
- 1,000: `../.data/load-tests/run-lSXyw7/report.json`
- Remote preflight: `../.data/load-tests/staging-2026-11-02T11-28-28-203Z-58a0525e.json`

Practical conclusion: automated checks and the local 300-request correctness test pass; 500+ simultaneous local submissions are not reliably handled in these runs. A live user-capacity number requires authenticated staging testing against the intended deployed code, real database, representative workload, and agreed response-time/error targets.

## Follow-up access/configuration check

Read-only Vercel inspection confirmed staging belongs to `team_OtNL8Opqrj5PwvppM4aTMUQD` and has SSO protection enabled. The complete environment listing returned ten entries and `hiddenProductionEnvCount: 0`; `SUPABASE_SERVICE_ROLE_KEY` is absent. No environment values were decrypted or changed. This is an additional blocker before database-backed testing.

Automatic approval review rejected temporary share-link creation because a bearer URL would allow its holders to access protected staging for up to 23 hours. No share link was created. A team authorization request was initiated instead; Vercel requires the user to review/approve its one-time link (expires after ten minutes). No team permissions have been reported as granted, and no remote load test has run.

After the user approved team authorization, `list_teams` successfully returned the staging owner team. A fresh team-scoped environment listing again confirmed `SUPABASE_SERVICE_ROLE_KEY` is missing (ten keys, zero hidden production keys). Team connection access is now verified. This approval does not authorize a bearer share link; none was requested again or created. Remote load testing remains pending staging database credential configuration and an authorized HTTP access path.
