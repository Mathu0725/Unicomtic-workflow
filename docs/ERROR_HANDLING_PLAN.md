# Full error-handling implementation plan — Unicom TIC

Date: 23 October 2026. Target traffic: 100–300 concurrent submissions.

**Status: core implementation completed locally.** See [implementation and verification](ERROR_HANDLING_IMPLEMENTATION.md) for delivered behavior, test evidence and remaining deployment/operational gates. The phases below retain the original approved plan.

Goal: user-ku enna nadandhadhu, data save aachaa, aduthu enna seiyanum nu clear-a theriyanum. An unexpected failure must not create duplicate applications, lose accepted records, overbook workshops, expose secrets, or report a false success.

## 1. Existing baseline to retain

- Atomic registration/application/booking/job commits and duplicate identity checks.
- Submission retry keys with 24-hour receipts; bounded Supabase conflict retries.
- Independent notification worker, Sheet batching, pacing and backoff.
- Uncertain email sends require provider review before retry.
- Worker heartbeat, local file-lock recovery and public submission body limits.
- Baseline evidence: **68 tests**, production build and a **300/300 local HTTP submission test**. See [concurrency audit](CONCURRENCY_AUDIT.md).

These protections are regression requirements, not features to replace with a generic catch block.

## 2. Original audit findings

| ID | Finding / evidence | Effect | Priority |
| --- | --- | --- | --- |
| E01 | [Central API wrapper](../src/lib/http.ts) returns `err.message` for unexpected errors | Internal database/provider/file messages can reach users; no common support reference | P0 |
| E02 | Legacy admin routes catch exceptions themselves and return HTTP 500 | Expected validation failures can lose their correct category; logging/status handling is inconsistent | P0 |
| E03 | Shared [API client](../src/components/live-data.tsx) assumes every response is JSON; general requests have no common timeout | Proxy HTML errors, empty responses and network stalls become confusing parsing errors | P0 |
| E04 | [Admin session check](../src/app/admin/layout.tsx) redirects to login on any fetch failure; logout ignores failures | A temporary outage looks like an expired session; logout can appear complete while its server cookie remains | P0 |
| E05 | No root/admin/public-form `error.tsx` or `global-error.tsx` files exist | Unexpected rendering failures lack a designed recovery screen | P1 |
| E06 | Some course/sync/list loads only log to console or retain an empty view | Users cannot distinguish zero records from a failed request | P0 |
| E07 | Provider errors mostly become strings; worker retries most definite failures until the attempt limit | Revoked Google permission or a broken Sheet header can waste retries instead of asking for the required repair | P1 |
| E08 | [Marks commit](../src/app/api/admin/marks-import/commit/route.ts) trusts client `isValid`/score flags and permits unmatched student IDs | Preview data can be changed or stale; invalid rows need server verification before committing | P0 |
| E09 | [Settings save](../src/app/admin/settings/page.tsx) only changes React state and displays success; [staff list](../src/app/admin/users/page.tsx) is hardcoded | Visible success/account state is not proof of a persisted server operation | P0/P1 |
| E10 | No common request IDs, structured error-event contract or operational incident view | A user-visible failure cannot reliably be traced across request, transaction and job attempts | P1 |

P0 = correctness/recovery work before general launch. P1 = consistent product-wide handling and operations. P2 = additional resilience after the P0/P1 gates pass.

## 3. Common error contract

Introduce typed errors and one serializer. Expected errors have stable codes and approved user messages. Unexpected exceptions return a generic message and support ID; the detailed cause stays in protected server logs.

Example:

```json
{
  "success": false,
  "code": "WORKSHOP_FULL",
  "message": "This workshop is full. Please select another workshop.",
  "requestId": "req_550e8400-e29b-41d4-a716-446655440000",
  "retryable": false,
  "action": "refresh_workshops",
  "fieldErrors": {
    "workshopId": ["Please select an available workshop."]
  }
}
```

Contract rules:

1. Generate/validate a request ID at the server boundary; return it in the response and `X-Request-ID` header.
2. Normalize field errors to `Record<string, string[]>` and display the first message next to each field.
3. Keep legacy `message`, `errors`, `isDuplicate`, `referenceNo` and `applicationNo` compatibility during migration. Update callers before removing aliases.
4. Use codes rather than matching message text. Tamil/English messages can map from those codes.
5. Actions are a small allowlist: edit fields, track existing record, refresh workshops, sign in, reconnect Google, retry, contact admissions.
6. Set `Cache-Control: no-store` on private/error responses. Do not return stack traces, SQL details, filesystem paths or raw provider bodies.
7. OAuth redirects carry an approved error code and request ID, rather than arbitrary exception text in the query string.

### Status and recovery policy

| Situation | HTTP / code | Retry policy | User action |
| --- | --- | --- | --- |
| Invalid JSON / invalid fields | 400 / `MALFORMED_JSON`, `VALIDATION_FAILED` | No automatic retry | Correct fields |
| Body/upload too large | 413 / `PAYLOAD_TOO_LARGE` | No | Shorten answers/use an allowed file |
| Missing/expired session | 401 / `SESSION_REQUIRED` | No mutation replay after login without checking its result | Sign in, preserve safe return path |
| Wrong login credentials | 401 / `INVALID_CREDENTIALS` | No | Inline login error |
| Role/origin denied | 403 / `FORBIDDEN`, `ORIGIN_REJECTED` | No | Explain access restriction |
| Missing/closed public form or unknown tracking reference | 404 / approved form/reference code | No | Correct link/reference; keep response privacy consistent |
| Duplicate identity/application | 409 / `DUPLICATE_REGISTRATION`, `DUPLICATE_APPLICATION`, `IDENTITY_CONFLICT` | No new-record retry | Track the permitted existing reference/contact admissions |
| Workshop fills while form is open | 409 / `WORKSHOP_FULL` | No automatic seat substitution | Refresh choices; preserve other answers |
| Retry key reused with changed payload | 409 / `IDEMPOTENCY_MISMATCH` | No | Resolve the original attempt; start a new attempt only for changed data |
| Admin edits stale data | 409 / `VERSION_CONFLICT` | Do not silently overwrite | Reload and review changes |
| Service/request rate limit | 429 / `RATE_LIMITED` | Bounded retry only for safe operations; honor Retry-After | Show retry state |
| Transient database contention/outage | 503 / `DATABASE_BUSY`, `DATABASE_UNAVAILABLE` | Bounded retry for idempotent submissions | Retry with the original key |
| Provider needs configuration/consent repair | 502/503 / provider-specific code, `retryable: false` | Pause the affected job lane | Admin repairs connection/configuration |
| Unexpected bug / corrupt state | 500 / `INTERNAL_ERROR`, internal diagnostic classification | No blind mutation retry | Support reference + safe recovery screen |

Keep expected business conflicts separate from infrastructure failures. A 503 alone is not sufficient permission to retry a side effect; the operation must be safe and the error must be marked retryable.

## 4. Implementation phases and order

### Phase A — P0: server error foundation

Files: [http.ts](../src/lib/http.ts), API routes, new `src/lib/errors/{codes,app-error,response}.ts`, new `src/lib/observability/logger.ts`.

- Define validation, authentication, authorization, conflict, dependency, storage and unexpected-error categories.
- Normalize `unknown` exceptions with guarded type checks; retain causes for internal diagnostics.
- Centralize JSON parsing, body limits and schema failures. Extend appropriate limits to admin/bulk endpoints, with separate upload budgets.
- Remove or narrow route-local catch blocks that flatten every error into 500. Raw-body/file endpoints retain purpose-built parsing.
- Return consistent errors from session and cron endpoints too, while retaining their distinct authentication requirements.
- Keep thrown errors and returned 4xx/5xx responses rollback-safe. Never convert a failed mutation into 200 to display a friendly message.
- Validate production configuration without printing secret values. Fail readiness clearly for required database/security configuration.

**Gate:** representative public/admin/auth/cron errors have the correct status/code/request ID; unexpected errors expose no internal details; rejected transactions leave no partial records.

### Phase B — P0: common browser client and recovery states

Files: [live-data.tsx](../src/components/live-data.tsx), [submit.ts](../src/lib/client/submit.ts), public form pages, login, admin layout and list pages. Extract `src/lib/client/api.ts`.

- Handle JSON, empty and non-JSON responses. Show a safe proxy/service message for HTML gateway errors.
- Add timeout/cancellation support. Abort obsolete navigation requests without showing cancellation as a user failure.
- Treat offline, timeout, validation, authentication and server errors differently.
- Preserve form answers and the original submitted payload/retry key while its outcome is unknown. Resolve via the same idempotent submission; never manufacture a new key because a response was lost.
- Retry only the documented safe paths, with bounded exponential backoff and jitter. Parse both numeric and HTTP-date Retry-After values.
- On validation failure, focus the first invalid field, show a field summary and retain the user's data.
- On real 401 session expiry, redirect to sign-in with an allowlisted internal return path. A session-check network error shows Retry; it does not claim the account is unauthorized.
- Confirm logout success before saying it completed; offer retry on network failure.
- Make polling non-overlapping, stop it on unmount, back off on errors and retain the last successful data with a “could not refresh” indicator.
- Distinguish Loading / Empty / Failed / Stale / Ready states. A failed count query must not become “0 applications”.
- Mark a browser draft as unavailable if storage is disabled/full; keep the in-memory form usable. “Draft could not be saved on this device” is different from “application was not saved”.

**Gate:** offline, gateway HTML, aborted navigation and expired session tests show the right recovery without losing entered answers or creating a second submission.

### Phase C — P0: server validation and truthful success

Files: admin API modules, settings/users pages, marks preview/commit, admissions service, schemas.

- Revalidate marks at commit: exam/campaign membership, student match, finite score, score range and duplicate row policy. Do not trust the preview's `isValid` flag or a client-supplied pass result.
- Detect changed exam configuration between preview and commit. Return row-level corrections; use an explicit all-or-nothing commit policy by default.
- Add schema validation to legacy campaign/course, attendance, exam, eligibility, interview and final-result actions.
- Verify every referenced entity belongs to the selected intake/workshop/exam; avoid undefined lookups becoming generic TypeErrors.
- Validate allowed lifecycle transitions. For example, a rejected result update must not queue an offer email.
- Persist Settings through a validated, audited API before displaying Saved. Until backed by a real operation, disable unsupported controls and explain their availability.
- Replace the hardcoded staff-list presentation with authoritative state or a clear read-only/unavailable presentation. Do not imply that demo entries establish real access.
- Show success only after the required database commit. Notification success requires a separate provider result.

**Gate:** tampered import payloads, unmatched students, invalid transitions and failed settings writes cannot produce a success message or partial side effects.

### Phase D — P1: error boundaries and accessible UI

Create `src/app/error.tsx`, `global-error.tsx`, `not-found.tsx`, `admin/error.tsx`, `form/[slug]/error.tsx` and appropriate loading states.

- Provide a branded safe fallback, Try again, a safe navigation option and support/request reference.
- Keep recovery local to the affected segment where possible. Preserve drafts outside the crashed form component.
- Give root-layout failures a minimal independent fallback. In Next.js 14, `global-error.tsx` needs its own html/body elements.
- Handle async event/fetch failures through the API client; error boundaries do not replace those handlers.
- Use accessible alerts/status announcements, keyboard focus and non-color-only error indicators.

Reference: [Next.js 14 error handling](https://nextjs.org/docs/14/app/building-your-application/routing/error-handling).

**Gate:** deliberately failed page renders recover without blank screens; admin navigation remains usable where the segment hierarchy permits it; no production stack trace is shown.

### Phase E — P1: Google, SMTP and worker failure classification

Files: Google OAuth/Sheets services, SMTP client, outbox/types, worker script, Email Center and Integrations UI.

Classify provider failures before applying retry policy:

| Failure | Proposed handling |
| --- | --- |
| Revoked/expired Google authorization, missing required scopes | Block affected Google jobs; show Reconnect Google; preserve saved submissions |
| Consent/test-user/account authorization issue | Show specific setup guidance; never relax portal authorization to hide the error |
| Invalid Sheet ID, missing access, invalid export header/tab | Mark configuration blocked; link the effective Sheet/form destination and required repair |
| Temporary 429/5xx/unavailability | Bounded jittered backoff; honor provider Retry-After; retain attempts/next retry |
| SMTP authentication/TLS configuration error | Block sender until repaired; preserve certificate validation |
| Invalid/rejected recipient | Fail that job with a safe correction reason; do not repeatedly retry a permanent rejection |
| Email timeout/socket interruption after sending may have started | Mark uncertain; require Sent/provider-log review before manual retry |
| Sheet timeout/partial export sequence | Re-read references and reconcile before retry; no claim of whole-job success before required writes finish |
| One malformed job in a batch | Isolate invalid job data; continue valid jobs when safe; do not repeatedly poison the whole queue |
| Worker secret rejected / worker repeatedly offline | Back off and surface an operational incident; avoid an endless rapid authentication-error loop |

- Add a typed `blocked` job state if needed; migrate status handling across hydration, counts, tracking and retry controls together.
- After a successful reconnect/configuration repair, explicitly release eligible blocked jobs. Preserve stable job identity and uncertain-email safeguards.
- Track job/request correlation IDs, attempts, next retry, safe failure code and repair action.
- Keep accepted registrations independent of provider availability. Avoid ETA promises when quotas/outages make completion time unknown.
- Retain provider pacing and batching. Google recommends exponential backoff for quota failures. [Sheets quota guidance](https://developers.google.com/workspace/sheets/api/limits).

**Gate:** simulated revoked access, 429, permanent rejection, timeout and worker crash all produce their intended state/action; retry does not create duplicate application records or blindly resend uncertain email.

### Phase F — P1: storage and transaction recovery

Files: repository, Supabase adapter, admissions/booking services and operational documentation.

- Distinguish contention/timeouts from unavailable database, permission/configuration failures, malformed snapshots, disk-full and failed file replacement.
- Never silently reset corrupt/unavailable real data to empty or demo records.
- Keep transaction callbacks that are retried free of external side effects. Move remaining OAuth/Sheet-creation/import network preparation outside write locks where feasible, then commit their results safely.
- Keep local lock ownership/recovery and atomic replacement behavior; test failed cleanup and active-lock cases without deleting another process's lock.
- Add bounded database request deadlines. When commit outcome is unknown, resolve using the original receipt/key rather than assuming it failed.
- Document backup verification/restore and a maintenance response for unrecoverable state. Do not overwrite live data automatically.
- Test fresh state, migrated legacy snapshots and realistically larger historical datasets. A retry layer does not remove the aggregate repository's capacity limit.

**Gate:** failures before commit roll back; acknowledged records survive process restart; corruption is reported safely; unknown commit outcomes can be resolved without a second accepted application.

### Phase G — P1/P2: diagnostics and operational monitoring

- Emit structured events with request ID, route, action, status, duration, error code, retry attempt and job ID.
- Redact authorization/cookies, passwords, tokens, OAuth codes, webhook secrets, raw form bodies, NICs, addresses and contact details. Prefer internal entity IDs over personal data.
- Keep detailed diagnostic access restricted. Define configurable log retention and test the redaction rules.
- Add a small liveness endpoint and bounded/cached database readiness checks. Provider outages should show degraded integrations while admissions can still accept durable submissions.
- Show authenticated diagnostics: worker heartbeat, oldest queued job age, blocked/failed/uncertain counts, recent database contention and submission latency.
- Group repeated incidents and define acknowledgement/recovery state. Start with in-app status and structured logs; add external alerting only when a destination is configured.
- Add an abuse/rate-limit policy that preserves legitimate 300-person bursts, including shared campus IPs. Return 429 and safe retry guidance rather than applying a naive one-user-per-IP rule.

**Gate:** an operator can trace a reported failure and identify the required repair without seeing secrets or applicant payloads; health checks themselves send no email or Sheet writes.

## 5. Module coverage checklist

| Surface | Required error/recovery coverage |
| --- | --- |
| Public registration/application/custom form | Field errors, stale/closed forms, duplicate identity, full workshop, offline/timeout, uncertain save outcome, draft failure |
| Tracking/confirmation | Invalid/missing reference, privacy-safe not-found, unavailable status, notification failure distinct from saved application |
| Forms Studio/builder/responses | Invalid schema, slug conflict, stale edits, deleted fields, save failure, effective Sheet destination, import row errors |
| Dashboard/district analytics | Failed vs zero counts, stale data indication, retry/backoff, bounded polling |
| Campaigns/courses | Missing intake/course, inactive intake, invalid dates, duplicate identifiers, stale updates |
| Registrations/applications admin | Unknown record, conflicting identity, invalid transitions, unauthorized action, duplicate manual notification |
| Workshops | Invalid dates/deadline/capacity, closed/full session, stale capacity, concurrent booking rollback |
| Attendance/student IDs | Wrong workshop/intake, missing student, duplicate check-in/ID, concurrent assignment, scan/lookup failure |
| Exams/marks import | Corrupt/unsupported/oversized file, parsing/column errors, invalid scores, unknown student, stale preview, atomic commit failure |
| Eligibility/shortlisting | Invalid criteria, wrong campaign, missing source records, invalid numeric values, evaluation failure; never publish a partial report as complete |
| Interviews | Invalid rubric scores, missing candidate/panel, conflicting slot, duplicate evaluation, stale edits |
| Final results | Invalid status transition, duplicate decision, failed commit, notification uncertainty, auditability |
| Gmail/SMTP/Google/Sheets | Consent/configuration errors, quota/outage, blocked jobs, uncertain email, target mismatch, safe repair/retry |
| Staff accounts/roles | Accurate authoritative state, permission denial, unavailable management operation, session expiry |
| Settings | Validated real persistence, policy-version conflict, failed save, no false success |
| Audit logs | Failed load distinct from empty history, restricted diagnostics, pagination/retention, secret redaction |

## 6. Failure-test matrix

| Test group | Required cases |
| --- | --- |
| Contract | All error categories, request IDs, legacy field compatibility, generic unknown exception, no secret leakage |
| Browser transport | Offline, timeout, HTML 502, empty body, aborted request, stale polling response, Retry-After date/seconds |
| Session | Real 401, wrong login credentials, forbidden role, transient session fetch failure, failed logout |
| Forms | Inline validation, preserved answers, changed workshop availability, duplicate reference recovery, same-key replay and changed-payload rejection |
| Storage | CAS conflicts, timeout before/after commit, disk/rename failure, malformed snapshot, active/dead lock, process restart |
| Providers | OAuth revoked/missing scopes, Sheet permission/header error, rate limit, SMTP auth/recipient error, unknown email-send outcome |
| Worker | Stop/restart during claims, expired leases, overlapping workers, poisoned batch row, exhausted retries, repaired blocked jobs |
| Admin mutations | Tampered marks payload, stale preview, invalid entity links/transitions, actual Settings persistence, unsupported action |
| Page rendering | Public/admin/root boundary fallbacks, keyboard recovery, draft retention |
| Concurrency | Repeat the isolated 300-user HTTP scenario with fault injection and dashboard polling; keep records/bookings/job keys consistent |

Fault tests use isolated data and mocked providers. Live checks use only explicitly chosen test records/recipients; no bulk email is sent as a load-test side effect.

## 7. Rollout and definition of done

Implementation order: **A → B → C → D/E/F → G**. D/E/F can be developed independently once the shared contract is stable. Complete the module checklist while migrating each route/page.

1. Land error types/serializer/client adapters with backward compatibility.
2. Migrate public admissions/auth, then high-impact admin mutations, then remaining screens/provider operations.
3. Validate newly introduced job states against existing snapshots and UI counters before deployment.
4. Run regression tests, targeted browser recovery checks, TypeScript checks, production build and isolated fault/load tests.
5. Validate staging with the intended database, representative stored records and worker settings. Review error logs for redaction.
6. Deploy in stages with verified backups and a compatible rollback path. Observe error rates, latency and queue age after release.

Done means:

- Every failure surface has a safe visible message and an appropriate next action.
- No false Saved/Sent/Synced states; no silent fallback to empty/demo data.
- No duplicate accepted application or overbooking caused by timeout, replay or worker overlap.
- No unsafe automatic retry of a non-idempotent admin action or uncertain email.
- No secrets/raw applicant records in public errors or routine logs.
- Real authentication failures are distinguished from network outages.
- Existing concurrency guarantees still pass, including a 300-user regression run.
- Remaining provider/hosting limits are documented rather than represented as unlimited capacity.
