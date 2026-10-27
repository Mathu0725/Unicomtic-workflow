# Project review — 26 October 2026

27 October: [worker reliability and Vercel Hobby readiness](PRODUCTION_READINESS_2026-10-27.md) are implemented and validated locally. Actual hosting/scheduler activation, automatic off-machine backups and staff lifecycle work remain pending.

Implementation update: delivery-order item 1 is completed in [Security phase 1](SECURITY_PHASE_1.md). The findings and baseline below describe the original review before that implementation. Worker reliability, staff account lifecycle and course/intake consistency remain pending.

Scope: source review, automated tests, TypeScript, installed dependency audit, and authenticated read-only localhost API checks. Application logic and live admissions data were not changed. No candidate messages, provider writes, deployments or dependency upgrades were performed. Browser UI inspection was unavailable because local browser use is disabled in Work settings; the observations below are code/API findings, not a new visual or mobile accessibility audit.

## Verified baseline

- 234 tests across 31 files passed in 9.57 seconds (`.data/project-review-tests.log`). TypeScript `--noEmit` passed.
- Dashboard, diagnostics, integrations, email allowance, form listing and public intake APIs returned HTTP 200.
- Runtime storage mode is Supabase. Google connection and Drive folder readiness are saved; this review did not request new Google access or test provider writes.
- One registration, zero applications, zero pending/failed/blocked/uncertain jobs were reported. These small current counts do not establish production capacity.
- Email allowance: 500 per rolling 24 hours; two used/reserved, 498 remaining at inspection.
- Worker heartbeat was stale: last seen 2026-10-26 06:15:06 UTC (11:45:06 Sri Lanka).
- A verified Supabase snapshot backup exists from 2026-10-26 04:31 UTC. Automatic off-machine retention and a restore drill were not verified.

## Priority 1: fixes before wider public use

### 1. Upgrade vulnerable dependencies

The installed versions include Next.js 14.2.35, xlsx 0.18.5 and Nodemailer 6.10.1. `npm audit` reports 14 affected dependency entries: three critical, five high and six moderate, including development tooling. These are package advisories, not 14 demonstrated exploits in this application. Several depend on optional features or deployment configuration; applicability needs review during the upgrade.

Next.js 14 is unsupported according to the [official support policy](https://nextjs.org/support-policy). The maintainers also list a [Windows-hosted remote code execution advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) covering the installed version range. This workspace currently runs on Windows. Upgrade to a supported, currently patched release and validate routing, API handlers, cookies, Google OAuth, uploads and the worker. The [14 October security release](https://nextjs.org/blog/nextjs-security-update-october-14-2026) documents additional current fixes; use the release current at implementation time.

The marks importer reads arbitrary uploaded Excel files with xlsx 0.18.5 (`src/lib/omr/marks-importer.ts`). The vendor's [prototype pollution advisory](https://cdn.sheetjs.com/advisories/CVE-2023-30533) covers that version. Select a maintained/patched import dependency or a verified vendor release; an ordinary npm patch within the current version range is insufficient. Retain file-size/row limits and add malformed-workbook regression cases. Avoid an unreviewed `npm audit fix --force` across this app.

Evidence: `.data/project-review-audit.json`, `package-lock.json`, `src/lib/omr/marks-importer.ts`.

### 2. Verify ownership for public status and application actions

`src/app/api/status/route.ts` accepts either a registration reference or NIC without authenticating the candidate. Its response includes name, district, admission stages/results, interview status, workshop venue and notification subjects. Masking NIC/phone leaves the rest of that response accessible to someone who knows the identifier. The shared limiter does not apply to this GET route (`src/lib/http.ts:49`).

`src/app/api/applications/route.ts:11` also associates a new application using only the supplied registration reference. A leaked reference therefore needs stronger protection than treating it as ownership proof.

Use a short-lived signed invitation/access link or verified email OTP, scope it to the candidate and permitted action, and limit attempts with shared storage. Keep the public shared-form experience as form → thank-you, as requested. No general student account dashboard is necessary to secure these endpoints. Do not expose detailed results through a bare NIC lookup.

### 3. Keep the mail/Sheets worker running reliably

The queue is currently empty, but its heartbeat is stale. New saved jobs can wait indefinitely without a background worker/scheduler. Set up a persistent service or the protected queue endpoint scheduler, verify recovery after a process restart, and alert the administrator when the heartbeat or oldest queued job crosses a threshold. Starting it during this review would potentially dispatch real messages, so it was not started.

Evidence: `/api/admin/diagnostics`, `scripts/notification-worker.mjs`, `src/app/api/cron/process-queue/route.ts`.

### 4. Align the single course and intake information

The live APIs still show three active courses. The active registration form offers Software Engineering, Cybersecurity and Data Science despite the decision to offer one course. The registration title says 2027, while its scholarship badge/intake/application titles and academic-year configuration still refer to 2025 or 2025/2026.

Use one canonical course and intake display configuration. Remove the redundant course selector for new applicants and show the chosen course clearly. Preserve existing records and references rather than deleting courses with historical links. Confirm the intended intake year before applying the content change.

Evidence: `/api/campaigns`, `/api/admin/forms`, `src/lib/data/store.ts`, public registration form.

### 5. Complete staff account management

Staff creation exists, but there are no disable, password-reset or session-revocation operations in the account API. Sessions embed the role and remain valid for seven days; `getSession` only verifies the signature/expiry and does not consult current account state. Removing or changing a database account later would not by itself invalidate an already issued cookie.

Add disable/re-enable, secure reset/forced password change and session revocation. Verify active account/session version on protected operations; invalidate sessions on credential/role changes. Add administrator MFA when preparing for production. Keep creation/role management restricted to Super Admin.

Evidence: `src/app/api/admin/users/route.ts`, `src/lib/security/staff-accounts.ts`, `src/lib/security/session.ts:11`.

## Priority 2: improvements to daily admissions work

| Enhancement | Concrete result |
| --- | --- |
| Unified candidate profile | One page with registration, application, workshop booking/attendance, documents, email history, internal notes and an action timeline. A staff member can identify the next action without opening several modules. |
| Actionable dashboard | Add missing-next-step counts and links using the existing reminder eligibility rules: registered without application, applied without booking, booked without attendance. Preserve manual recipient preview/send. |
| Document review | Add pending/accepted/reupload-needed statuses, reviewer notes and a secure replacement-request flow for student documents. Current upload storage alone does not provide this review workflow. |
| Better lists | Server-side pagination, debounced search and saved filters for registrations/applications; expose current filter context in CSV exports. These endpoints currently return all matched records. |
| Delivery feedback | Import trustworthy bounce/failure feedback and mark invalid addresses for correction. Current Sent status means provider acceptance and does not detect later bounces or prove inbox delivery. |

## Priority 3: reliability as usage grows

1. **Automated verified backups and restore drills.** Retain encrypted backups off the application machine, record the last successful backup, define retention and exercise a restore into an isolated environment. Existing backup scripts are a useful starting point; this review did not establish an automatic schedule.
2. **Database scalability.** The current Supabase repository reads/writes a whole aggregate via `save_platform_state` (`src/lib/data/repository.ts:88`). Split high-write admissions records/jobs into normalized tables with uniqueness constraints and transactional booking capacity when scaling. First run realistic deployed tests against representative historical data; existing local concurrency tests do not establish hosted capacity.
3. **Durable monitoring.** Diagnostic failures and latency samples are process-local (`src/lib/observability/logger.ts:6`) and disappear on restart. Keep redacted centralized logs, worker/provider alerts and a meaningful health summary. Preserve request references without logging applicant answers or secrets.
4. **Automated browser/CI coverage.** Add reproducible registration → thank-you, admin login/role, email correction, document upload, quota and workshop-capacity flows. Include mobile widths, keyboard navigation and the email/preview dialogs. No browser E2E or CI configuration was found in the reviewed workspace.

## Suggested delivery order

1. Dependency/security upgrade and public ownership verification.
2. Persistent worker, automated backup/restore checks and staff session management.
3. Single-course/intake consistency.
4. Unified candidate profile and missing-next-step dashboard.
5. Document review, list performance and broader browser automation.

The current tests, durable outbox, duplicate checks and error recovery provide useful foundations. Passing tests are evidence for their covered behavior; they do not replace dependency patching, access-control review or production traffic testing.
