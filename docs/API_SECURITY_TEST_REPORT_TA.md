# API security implementation progress — 2026-11-02

Status: local security regression coverage implemented; production readiness **NO-GO pending remaining gates**. This is not a completed penetration test or live capacity certification.

## Verified this implementation

- `scripts/api-inventory.mjs` generated `.data/security/api-inventory.json`: 71 routes, 107 explicit HTTP method exports. Next-generated HEAD/OPTIONS and platform interception are separate coverage items.
- New actual-handler tests discover all 50 admin route files and invoke their 83 exported GET/POST/PUT/PATCH/DELETE methods. Anonymous and forged-session requests return 401/SESSION_REQUIRED. Signed entrance_staff/examiner/unknown-role requests to routes outside their allowed modules return 403. The test imports real route exports rather than relying on source text matching.
- Additional shared-boundary tests ensure forbidden-role and foreign-origin requests do not invoke privileged handlers.
- New load-metric tests cover traffic-budget rejection, invalid/non-increasing stages, network-error classification, missing/duplicate references, save reconciliation and latency acceptance.
- Full suite passed: **744 tests / 64 files**, 23.47 seconds. After expanding the same admin tests to include per-route forbidden-role requests, the affected suites passed again: **56 tests / 2 files**. TypeScript passed before that final assertion expansion; the final type check is recorded separately in the chat.
- No application handler behavior or database schema changed in this step. Existing user changes were preserved.

## Load runner changes

`scripts/staging-load-test.mjs` now uses bounded configurable stages (default 10,25,50,100,200,300), maximum 1,000 requests per stage / 3,000 overall, a configurable p95 target (default 5 seconds, ceiling 10 seconds), and nearest-rank percentile metrics. Reports separate accepted/errors, reference uniqueness, HTTP status distribution and achieved whole-burst completion throughput. This throughput is not a sustained arrival-rate capacity result.

Correctness or latency failure stops higher stages. Outcomes are saved before the reconciliation request and after reconciliation, preserving partial evidence if the admin count lookup fails. A missing, duplicate or unconfirmed reference cannot pass. The highest passing burst is recorded without labeling it supported active users.

Destination is pinned to the dedicated staging ref `qxxnvkpbhjkdayomkzkf`. `STAGING_ISOLATION_VERIFIED` must equal that ref after independent deployment configuration verification; setting the flag alone does not verify the deployment. Real provider dispatch remains disabled and the empty-database requirement remains enforced. Reruns need a reviewed isolated baseline/reset; the runner does not erase records automatically.

## Current blockers and remaining work

1. Staging-only `SUPABASE_SERVICE_ROLE_KEY` now exists as an exact uppercase, sensitive Production environment variable. Its value has not been decrypted, so validity is not independently confirmed. The authenticated Supabase MCP connection is for another project (`iwipyqxxeqrmirqqwlxd`), not the dedicated staging ref. No production key/data was copied.
2. Team access was granted, but a usable protected HTTP session for this runner has not been established. Earlier automatic review rejected share-link creation due to bearer-link exposure. No retry, share link or protection weakening was performed in this implementation.
3. Current working tree has many pre-existing changes. Intended release scope/commit needs review before deploying the test candidate. No deployment/promotion was performed.
4. The in-process burst limiter is not evidence of deployment-wide abuse protection. Edge/distributed enforcement remains to be verified and implemented if absent.
5. Complete per-object authorization, uploads, webhook/OAuth, injection/export checks, browser journeys, provider delivery, sustained-arrival/mixed-user load, soak, data-growth and recovery tests remain pending as specified in the implementation plan.

Public endpoints are intentionally reachable. These tests establish specified server-side denial boundaries, not that every API is private or the system cannot be hacked.

## Reproduce local checks

```powershell
node scripts/api-inventory.mjs
node scripts/test.mjs tests/integration/api-security-boundaries.test.ts tests/unit/load-test-metrics.test.ts
node node_modules/typescript/bin/tsc --noEmit
node scripts/test.mjs
```

Remote runner configuration after independently resolving staging readiness and access:

```text
STAGING_ISOLATION_VERIFIED=qxxnvkpbhjkdayomkzkf
STAGING_BURST_STAGES=10,25,50,100,200,300
STAGING_P95_LIMIT_MS=5000
```

Use the existing private gitignored staging runner environment for credentials; do not commit secrets. Run `node --env-file=.env.staging.local scripts/staging-load-test.mjs` only after the readiness/access gates pass. These remote stages were not executed in this implementation.

## 2026-11-03 staging credential follow-up

- Read-only Vercel environment listing confirms an exact uppercase `SUPABASE_SERVICE_ROLE_KEY` entry exists for the staging project's Production environment; it is marked sensitive/Secret. The value was not decrypted, so key correctness cannot be independently confirmed from the environment listing.
- Vercel reports a new staging deployment `dpl_96VJozdZnkmJimD6o7LUXUXMERD1` as READY, deployed after that environment entry was created. Deployment source remains commit `43bac089872ff4473dea9a26775e919b42a26d4a`, not the current working tree changes.
- Supabase MCP independently verified staging ref `qxxnvkpbhjkdayomkzkf` is healthy and has `public.platform_state` with RLS enabled. A read-only aggregate query confirms baseline version 0 and zero registrations, students, applications, workshop bookings, and queued jobs.
- Vercel MCP shows no runtime errors, but also no runtime logs for the new deployment; without an HTTP health request this does not verify application readiness or that its server credential works.
- The protected deployment still lacks a runner HTTP session. No remote form was created and no staging load traffic was sent. Prior automatic review rejected a bearer share URL because holders could access staging for up to 23 hours; that mechanism was not retried.
