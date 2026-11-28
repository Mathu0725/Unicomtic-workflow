# Production read-only capacity check

Date: 2026-11-03  
Target: `unicomtic-workflow-khskufyk5-ravithasmathusans-projects.vercel.app`  
Vercel deployment: `dpl_GckqN8A3wFCt5D7KQo5TzFFKNzfi` (`unicomtic-workflow`, target `production`)  
Deployed Git SHA: `43bac089872ff4473dea9a26775e919b42a26d4a`

## Scope

This was a bounded, read-only live check. Each virtual client made one `GET /api/campaigns` request per burst. No registration, application, workshop, email, or database write requests were sent. The test stopped at 300 concurrent requests after latency rose sharply and one client-side fetch failed.

| Concurrent requests | HTTP 200 | Client errors | p50 latency | p95 latency | Maximum |
|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 0 | 1.61 s | 2.04 s | 2.04 s |
| 25 | 25 | 0 | 1.76 s | 2.00 s | 2.46 s |
| 50 | 50 | 0 | 1.56 s | 2.00 s | 2.18 s |
| 100 | 100 | 0 | 1.66 s | 1.98 s | 2.04 s |
| 200 | 200 | 0 | 3.88 s | 10.62 s | 14.78 s |
| 300 | 299 | 1 (`fetch failed`) | 9.46 s | 10.72 s | 11.52 s |

After the test, `GET /api/health/ready` returned `{"success":true,"status":"ready"}`. Vercel runtime error lookup found no runtime errors for `/api/campaigns` in the selected 30-minute window. Supabase counts remained unchanged.

## Other live checks

- Login page loaded.
- Unauthenticated GET requests to `/api/admin/applications`, `/api/admin/audit-logs`, `/api/admin/users`, and `/api/admin/diagnostics` returned `SESSION_REQUIRED`.
- The public campaign endpoint returned campaign/course data. The campaign is marked active but has an end date of `2025-12-31`, which is past the test date.

## Data baseline and cleanup

Before and after the read-only bursts, the production Supabase database reported 0 rows in `students`, `registrations`, `applications`, `workshops`, `custom_forms`, `form_submissions`, and `email_jobs`. The legacy `platform_state` record already contained 5 students and 5 registrations; campaign, course, email-template, and settings rows also existed. These pre-existing records were not changed or cleared. No test data was created, so no cleanup was needed.

## Interpretation and limits

The deployment returned all successful responses through a single 100-request read burst. At 200, p95 reached 10.62 seconds; at 300, p95 was 10.72 seconds and one client request failed. Treat this as evidence that this public read path degrades somewhere in the 100–200 concurrency range and is unstable near 300 for this one-request burst pattern. It does **not** establish supported concurrent human users, sustained capacity, write-path capacity, or database connection limits.

No authenticated end-to-end or write load was run. The production database has no configured `custom_forms` rows, so there is no live published form to exercise. The deployment's Git SHA differs from the local workspace HEAD (`8aee1a3e78e73728fdca2dbff87935a7d04a86ef`), so local test results do not prove this exact deployed build. The existing staging load runner is intentionally isolated and refuses live production URLs.

## Result

Read-only smoke/security checks passed. Production health recovered after the bounded read bursts, and database counts were unchanged. Do not treat this as full production sign-off; review the expired active campaign and establish a safe test form/account before any write-path test.

## Post-promotion check on the current production deployment

Later the same day, the user moved the new build to production. Current deployment: `dpl_5R53NmmAxPLd8B22WGENutQiu6iA`, SHA `ccd157bef1e3414a992621156f4a4876cb3775d1`. The Vercel Production `NEXT_PUBLIC_SUPABASE_URL` resolves to project `iwipyqxxeqrmirqqwlxd`; it matches the active Supabase MCP project. The separate `qxxnvkpbhjkdayomkzkf` dashboard project is named staging and was not used for production-log queries.

This was still a GET-only check of `/api/campaigns`; no test registrations, forms, or other app writes were sent. Browser result pages showed campaign/course JSON at 5, 10, 25, and 50 tab bursts. At 10, two automation waits timed out but later page inspection showed JSON in both. The browser tool's total batch times include automation/navigation overhead and are not reliable per-request latency measurements.

| Browser batch | JSON pages observed | Supabase `platform_state` GETs seen in corresponding window | Supabase status / origin p95 | Interpretation |
|---:|---:|---:|---:|---|
| 5 | 5/5 | Not separately queried | — | Read-only smoke burst passed |
| 10 | 10/10 after re-check | Node runner separately failed to establish 9/10 connections | — | Local Node connection timeouts are not app HTTP errors |
| 25 | 25/25 | 25 | 25 × HTTP 200; p95 1,087 ms | Confirmed 25 successful DB-backed reads |
| 50 | 50/50 | 27 | 27 × HTTP 200; p95 913 ms | All browser pages showed JSON, but only 27 DB requests were observed; backend request count is unresolved |
| 100 | 25 tabs were created; 25 showed JSON; 75 tab operations timed out | 28 | 28 × HTTP 200; p95 894 ms | Harness did not generate/confirm 100 requests; invalid as a 100-concurrency test |

The Supabase log windows also contained regular `POST /rpc/save_platform_state` calls, about twice per minute. These appear to be background activity; their source was not identified. They were not issued by this GET-only test. No Vercel runtime error clusters were reported for the sampled interval, and `/api/health/ready` returned ready after the last batch. Vercel runtime logs had no matching `capacity_sample` events, and the team's Observability Plus query was unavailable, so Vercel-side per-request timing could not be correlated.

**Current conclusion:** 25 near-simultaneous DB-backed public reads are confirmed successful with Supabase origin p95 about 1.09 seconds. The 50-browser-page batch is encouraging but its server-side request count is incomplete; the 100 stage did not run successfully because the browser harness limited tab creation. This does not establish a 100-user pass or human-user capacity. Do not advance to 200/300 or announce a supported user ceiling until a network-reliable runner records every request's HTTP status and end-to-end latency.

## Additional check on `uticx.com`

The production custom domain was tested directly because the deployment-specific Vercel hostname redirects unauthenticated browser sessions to Vercel login. One browser batch attempted 10 concurrent `GET /api/campaigns` navigations: 9 tabs displayed campaign/course JSON; one tab remained blank after the browser harness failed to navigate it. Supabase logs for the surrounding 30-second window showed 10 `GET /rest/v1/platform_state` requests, all HTTP 200, with origin p95 888 ms and max 898 ms. The log window also includes the single direct smoke request immediately before the batch, so it cannot prove every one of the 10 attempted tabs reached Supabase.

`GET /api/health/ready` returned `{"success":true,"status":"ready"}`. Unauthenticated `GET /api/admin/applications` returned `SESSION_REQUIRED` and “Please sign in.” The repository's intended test runner completed 64 files / 745 tests, and TypeScript typecheck passed. These are local workspace checks, not proof that the exact deployed SHA was tested. The direct global npm launcher is broken in this Windows environment, so the repository test runner was invoked through Node directly.

Vercel's production runtime error lookup for the last 30 minutes found no runtime errors.

**Updated interpretation:** the current production endpoint is healthy in the 9 browser requests that completed in this batch, and the correlated Supabase GETs returned 200. This remains a small, one-request browser burst with incomplete tab execution and no reliable end-to-end latency measurement. It does not establish a 10-user capacity guarantee; use a network-reliable load runner before increasing concurrency.

## Submission-volume assessment

The user clarified that the expected 3,000 registrations/applications arrive over a month, rather than all at once. That averages about 100 per day, 4.2 per hour, or one every 14 minutes if evenly distributed (if 3,000 of each type, double those averages). Supabase's aggregate-only production snapshot query returned 47,446 bytes with 5 students, 5 registrations, 1 application, 7 form submissions, and 41 outbox jobs at the check time. No personal fields were queried.

The isolated local load harness then passed a 300-registration simultaneous POST burst (300/300 HTTP 200, p95 9.04 s), 50 concurrent verified applications (50/50 HTTP 200, p95 2.30 s), 50 idempotent retries, duplicate identity rejection (20/20 HTTP 409), and a 100-contender/25-seat workshop test (25 accepted, 75 correctly rejected). Dashboard reads during the registration burst were 30/30 HTTP 200. It also confirmed response-loss retry recovery and safe handling of a corrupted local snapshot. The run used an isolated local file database, fake records, and no real email or Google calls; its timings do not predict Supabase production latency.

**Assessment:** 3,000 total submissions spread across a month is a low average rate and is likely manageable, but production write capacity is not yet proven. The application currently reads and compare-and-swap writes one whole `platform_state` JSON document per transaction, so sudden deadline-day bursts can contend and latency can grow as the record accumulates. Before making a firm promise, run the same write burst against a disposable Supabase branch or test project and monitor request p95/error rate, database load, and duplicate/seat-capacity correctness. Do not use real production submissions as test records.
