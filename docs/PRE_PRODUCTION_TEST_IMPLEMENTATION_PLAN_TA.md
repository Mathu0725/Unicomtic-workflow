# Production-ku mun full testing & capacity implementation plan

Date: 2026-11-02. Status: plan ready; remote capacity measurement pending.

## 1. Goal and current evidence

Student registration → candidate verification → application → workshop booking/attendance → examination/marks → eligibility → interview → final results, plus staff administration and background jobs: indha complete workflow-a production-ku mun verify pannanum. Synthetic candidates mattum use pannanum.

Already completed: 62 files / 688 automated tests pass, TypeScript pass, production build and deployment-file checks pass. These results describe the previously tested working tree; release candidate changes require appropriate regression checks again.

| Local development burst | Accepted | Failed |
| --- | --- | --- |
| 300 submissions | 300 | 0 |
| 500 submissions | 311 | 189 |
| 1,000 submissions | 648 | 352 |

300 run p95 = 12.82 seconds. 500/1,000 failures = DATABASE_BUSY / HTTP 503. Idhu local JSON-storage result; live concurrent users capacity-nu use panna koodathu. Full browser and real integration verification innum complete aagala.

## 2. Capacity-ku precise definitions

- **Active concurrent users:** browsing, reading, form fill pannuvanga; realistic think time irukkum.
- **Concurrent submissions:** ore nerathula submit API-ku varra writes. Separate burst measurement.
- **Arrival rate:** second-ku pudhu journeys/submissions start aagura count; sustained traffic measurement.
- **Safe operating capacity:** repeated tests-la agreed latency, error and correctness targets pass pannina load, operational headroom-oda.

Final report-la active users, submission bursts and requests/second-a thanithaniya show pannanum. One burst-la success count-ai maximum supported users-nu label panna koodathu.

## 3. Phase A — Release candidate and isolated staging [P0]

1. Existing uncommitted changes-a review panni intended release scope select pannanum; unrelated work overwrite panna koodathu. Reviewable release commit SHA record pannanum.
2. Adhe release SHA-a separate `unicomtic-workflow-staging` Vercel project-la deploy pannanum. Current old staging SHA results new working tree-ku apply aagathu.
3. Dedicated Supabase staging ref `qxxnvkpbhjkdayomkzkf`-a verify pannanum. Recently authenticated MCP ref `iwipyqxxeqrmirqqwlxd` staging ref illa; adha load-test destination-a assume panna koodathu.
4. Staging-only SUPABASE_SERVICE_ROLE_KEY configure pannanum; secret output/log/source-la expose panna koodathu. Last verified staging environment-la key missing. MCP login indha runtime credential-ku replacement illa.
5. Project URL/ref, storage mode, schema version, initialization flag, authentication and empty synthetic baseline verify pannanum. `/api/health/ready` JSON 200 and admin login pass aaganum. Local-storage fallback disabled; initialization disabled after baseline exists.
6. Protection enabled-a vechu authorized HTTP access establish pannanum. Team OAuth access already verified, aana load runner-ku usable HTTP session innum establish aagala. Share-link creation previous automatic review-la rejected; explicit approval illama retry panna koodathu. Prefer existing authenticated access supported by the platform; bearer-link option needs its specific exposure explained and approved.
7. Vercel/Supabase tier, resource settings, regions, quotas and available monitoring record pannanum. Paid upgrade/new spending approval illama enable panna koodathu. Available test budget/quota-kulla stages bound pannanum.

Exit: correct release SHA + correct staging DB + readiness/auth success + isolated destinations + observability ready.

## 4. Phase B — Full functional and security verification [P0]

| Area | Checks and expected evidence |
| --- | --- |
| Public forms | Required fields, NIC/phone/email validation, bilingual instructions, drafts/publication, inactive/expired forms, confirmation/reference |
| Candidate access | Verification, expiration, logout/session, uploads, wrong candidate denied, forged/expired tokens denied |
| Application | Existing registration link, required education fields, invalid upload rejection, retries without duplicate student/application |
| Workshop | Capacity, campaign rules, booking changes/cancellation where supported, final-seat contention, no overbooking |
| Attendance and student IDs | Correct candidate lookup, sequential unique UT/exam identifiers, repeat attendance idempotency |
| Exams and marks | CSV/XLSX mapping, duplicates, missing IDs, range/negative marks, rejected import no partial unintended write |
| Eligibility/interview/results | Rules, ranks/ties, reviewer permissions, scoring, selected/waiting/rejected transitions using synthetic records |
| Staff/admin | Login/logout, role-by-role allowed/denied routes and APIs, form builder, campaigns, settings, audit logs |
| Email and Sheets | Separate test inbox/sheet only, routing, templates, retry/backoff, duplicate suppression, final delivery/export reconciliation |
| Recovery | Lost acknowledgement, double click, repeated idempotency key, unavailable provider, network interruption, storage failure |
| Security | Unauthenticated/cross-role/cross-candidate reads and writes denied; secret leakage, upload access, unsafe content and input checks |

Implementation: reuse existing automated suites; add targeted tests only for uncovered behavior or confirmed bugs. Browser journeys must cover real UI → API → stored record → rendered confirmation, including mobile and desktop layouts, loading/errors and browser console/network failures. Automated component checks alone are insufficient.

Browser matrix: Chromium plus one other available engine; mobile viewport and desktop. Record unavailable engine coverage explicitly. Use synthetic files with representative permitted sizes.

Integration delivery smoke runs separately at low volume with explicitly designated test accounts. High-volume capacity runs keep real email/Google/Sheets dispatch disabled; queue behavior uses controlled sink/provider simulation, with separate measured provider quota limits.

Exit: core journeys and permissions pass; no unresolved blocker/critical defects; screenshots, request IDs and sanitized evidence saved.

## 5. Phase C — Load runner implementation [P0]

Existing `scripts/staging-load-test.mjs` handles one-off empty-database registration bursts of 100 then 300. Extend it or add a dedicated runner before claiming full capacity coverage:

- CLI/environment parameters for workload, stages, durations, arrival rate, virtual users, think-time range and bounded limits.
- Unique run ID, synthetic identity factory, per-user session/candidate state and stable per-operation idempotency keys.
- Realistic route mix; workload percentages applied to journeys, including authentication costs, rather than unrelated random API calls.
- Request timeout/network-error handling that preserves partial results; bounded retry counts with jitter and separate first-attempt versus recovered success rates. Back off on 429/Retry-After.
- Per-request outcome, endpoint/operation, elapsed time, safe request ID, expected status, retry and commit-reconciliation evidence. No credentials/candidate personal details in reports.
- p50/p95/p99, first-attempt error rate, timeout/429/5xx rates, attempted/completed journeys, achieved arrivals/throughput, in-flight requests and actual test duration.
- Independent arrival-rate scheduling or suitable load engine so slow responses do not silently reduce offered load. Record delayed/dropped iterations and load-generator CPU/memory/network limits.
- Finite stages, failure stop rules, cooldown and test-data manifest. Default destination allowlist remains staging-only, with project/ref checked against deployment configuration independently of runner input.
- Support repeatable baselines. Current empty-database assertion prevents immediate reruns: use verified isolated reset/restore or a fresh approved test dataset; never bulk delete production or unrelated staging records. Keep failure evidence until reviewed.

Runner verification: exercise threshold/percentile computation, classification of expected 409 versus failure 503, timeout reconciliation, stop rules and wrong-host/wrong-ref refusal using deterministic fixtures.

## 6. Phase D — Measured load stages [P0/P1]

Start with low traffic and increase only after the previous stage meets correctness and latency gates. Proposed stages are ceilings, not authorization to exceed resource budget.

| Test | Proposed workload | Duration / repeat |
| --- | --- | --- |
| Smoke and warmup | 1–5 users; all critical endpoints | 2–3 minutes, cold/warm recorded separately |
| Mixed active users | 10 → 25 → 50 → 100 → 200 → 300 → 500 → 1,000 if passing | 2-minute ramp + 5-minute hold per stage; 5–15 s think time |
| Submission bursts | 10 → 25 → 50 → 100 → 200 → 300 → 500 → 1,000 if passing | Each viable boundary stage repeated 3 times on comparable baselines |
| Sustained arrivals | 1 → 2 → 5 → 10 → 20 submissions/s if passing | 5-minute holds; record offered and achieved rate |
| Seat/duplicate race | 100 booking attempts / 25 seats; 50 same-key retries | Correctness-focused burst |
| Spike | From baseline to 2× provisional safe load | Up to 60 s, then 5-minute recovery |
| Soak | Provisional safe mixed workload | 30–60 min after quota review |
| Data growth | Empty/small + expected intake dataset + 2× expected intake | Repeat boundary tests with snapshots/queue/audit growth recorded |

Initial mixed journey assumption: 60% public browsing/form reads, 20% registration, 10% verified application/booking, 10% staff dashboard/lookup. Replace with expected admissions-day usage when known; report the assumption and actual operation counts. Include a write-heavy registration-opening scenario separately.

Run independently of builds/other load generators. Match production resource settings, code, schema and deployment region as closely as possible. Include realistic user-region network latency; generator-location limits must be stated.

## 7. Proposed acceptance targets and automatic stop rules

These are initial engineering targets, not measured guarantees or user-provided SLAs. Final release report must state any adjusted target explicitly.

| Metric | Proposed pass target |
| --- | --- |
| Read API p95 / p99 | ≤ 2 s / ≤ 5 s |
| Submission acknowledgement p95 / p99 | ≤ 5 s / ≤ 10 s |
| Browser primary-content load | p75 ≤ 3 s on the recorded test device/network |
| Unexpected first-attempt failures | < 1% per measured hold and endpoint class |
| Accepted-save reconciliation | 100%; no lost accepted writes, duplicate identities/references or overbooked seats |
| Recovery | Read/write latency returns to target within 5 min of spike ending |
| Test notification/export queue | No loss/duplicates; bounded backlog; age/clearance time measured against a declared provider/worker budget |

Expected validation/duplicate/full-seat 4xx responses count as scenario success only when the test deliberately triggered them; report them separately. 429 responses are visible capacity rejections, not successful admissions. Delivery completion is separate from an accepted submission.

Stop the current stage and stop escalation on any correctness/security violation, unavailable readiness, budget/quota threshold, or unexpected failures > 5% / submission p95 > 10 s over a rolling 60 s window. Preserve pending/partial outcomes and reconcile them before retries. No endless failing bursts.

## 8. Phase E — Diagnose, fix, remeasure [P1]

Correlate route/request metrics with Vercel function duration/errors/concurrency and available Supabase CPU, connection/lock/conflict metrics, snapshot sizes and worker queue age. Record monitoring gaps if the current plan does not expose a metric.

Local evidence suggests transaction queue deadlines/full snapshot writes are a bottleneck; remote bottleneck remains unmeasured. Investigate database contention, compare-and-swap retries, whole-state serialization, dashboard polling, payload size and provider/worker throttling with traces before choosing fixes.

Possible evidence-driven work: reduce repeated full-state work, improve reads/polling, batch safe background operations, bound retry pressure, or move high-contention admissions data to granular transactional rows. Schema/RLS/migration changes require a separate reviewed design, applicable Supabase/Postgres guidance, staging verification and rollback procedure. Do not merely increase timeouts and claim capacity improved.

For each fix: reproduce → focused regression check → affected browser story → same-load comparison on same release settings → rerun release gates. Keep before/after reports.

## 9. Phase F — Release decision and operating limit [P0]

Final report must provide:

1. Tested release SHA, schema, plan/resource settings, regions, generator details and workload assumptions.
2. Highest repeated passing active-user stage, write-burst size and sustained arrival rate separately.
3. First failing stage, latency/error/throughput curves and confirmed or suspected bottleneck with evidence.
4. Provisional operating ceiling: choose a tested lower stage providing approximately 30% headroom below the repeated passing boundary; verify that ceiling with soak/recovery tests. If capacity never fails within the test budget, report a lower bound only.
5. Browser coverage, integration delivery evidence, correctness reconciliation, remaining defects and untested limitations.
6. Go/no-go decision. Go only when critical stories, security, data integrity and target workload pass; otherwise no-go with concrete fixes.
7. Before launch: verified staging backup/restore exercise, deployment rollback procedure, candidate-facing retry/recovery behavior and monitoring alerts. No production destructive restore drill.

Production deploy/promote is outside this test-plan creation step. Prepare a concrete release result for review; test completion alone must not auto-publish the project.

## 10. Implementation order and deliverables

| Priority | Work | Deliverable |
| --- | --- | --- |
| P0-1 | Release scope + staging credentials/access | Verified isolated release candidate |
| P0-2 | Functional/browser/security matrix | Pass/fail evidence and defect list |
| P0-3 | Parameterized load runner + result reconciliation | Repeatable bounded test harness |
| P0-4 | Ramp/burst/sustained measurements | Actual capacity report and failure boundary |
| P1-1 | Bottleneck fixes + same-load comparison | Verified improvement evidence |
| P1-2 | Soak, data growth, recovery, integration delivery | Operating limit and recovery report |
| P0-5 | Final regression + release checklist | Production go/no-go recommendation |

Planned artifacts: runner configuration and implementation, targeted browser/runner tests, sanitized `.data/load-tests/<run-id>/` reports, and `docs/PRE_PRODUCTION_TEST_REPORT_TA.md` with tested operating limits. No live concurrent-user claim until these measurements are complete.

## 11. API exposure and authorized attack simulations [P0 release gate]

User requested API protection and attempted hacking checks. Scope: this application's reviewed code and local/isolated staging using synthetic accounts/data. No production attack traffic, third-party targets, credential theft, destructive exploitation or unrestricted denial-of-service testing. All probes are bounded, logged and reconciled. Production public registration APIs must remain reachable for their intended use; URL hiding, CORS or client-side checks are not substitutes for server authorization.

### API inventory and permission matrix

Enumerate every exported API method, including public forms, admin, candidate, uploads/downloads, Google OAuth/callback/webhook, health and cron. For each method document required caller/role, permitted fields, rate limit, body/file limit and side effects. Test anonymous, candidate A/B, entrance staff, examiner and administrator. Public responses must contain only deliberately public fields; draft forms, internal configuration, other candidates' data and provider credentials must not leak.

### Attack simulation matrix

| Category | Bounded test | Pass evidence |
| --- | --- | --- |
| Authentication bypass | Missing/forged/expired staff and candidate cookies; tampered token fields; logged-out access | Denial before private data read or mutation |
| Object-level authorization / IDOR | Swap candidate, registration, application, workshop, upload and response identifiers using synthetic users A/B | A cannot read/change B; legitimate scoped access still works |
| Role escalation | Entrance staff/examiner requests to admin settings/users/export/actions; attempted role/status injection | Server denies forbidden operations; no mutation |
| Secret exposure | Public JSON, HTML/client assets, error responses, source maps, build output and logs review | No service-role/SMTP/OAuth/client secrets, session tokens, private file paths or candidate data |
| CSRF and CORS | Foreign/null/missing Origin cases, cookie behavior, simple-form requests, credentialed cross-origin requests | Untrusted browser requests cannot trigger privileged state changes |
| Login/OTP/verification abuse | Small controlled attempt sequence, resend/enumeration checks, expiry/replay | Consistent safe errors; enforced limits; no unlimited guessing/sending |
| Distributed abuse controls | Verify limiter behavior across instances, forwarded-IP trust and shared-campus users | Documented deployment-wide protection and bounded rejection behavior without normal-user lockout |
| Injection and unsafe rendering | Harmless marker payloads for SQL/filter, HTML/script, rich text and CSV formula injection | Markers treated safely; no execution, query expansion or unsafe exported spreadsheet formula |
| Mass assignment | Extra fields for role, campaign, identity, marks, selection, ownership and integrations | Protected fields cannot be overwritten through unrelated public input |
| Files | Oversize/type mismatch/path traversal filename, unauthorized download and file replacement | Size/type/access checks; no executable/public private-file exposure |
| Webhook/OAuth/cron | Missing/invalid signature/secret, replay, tampered state, foreign return URL, wrong method | Forged calls denied; no queued work or provider dispatch |
| Resource exhaustion | Finite oversize/deep JSON, bounded pagination/export, interrupted body, bounded request burst | Controlled 4xx/429; no data loss or prolonged service failure |
| Replay and race | Same/different idempotency keys, repeated verification, final-seat race | No privilege bypass, duplicate transaction or overbooking |
| Dependency/build hygiene | Locked-dependency audit, relevant advisories and runtime applicability; deployment trace review | No unresolved exploitable critical/high release defect; exceptions explicitly documented |

### Initial evidence and required follow-up

On 2026-11-02, selected existing candidate-access, Google-connection-auth, staff-users and audit-regressions suites passed: **84 tests / 4 files**. This verifies those test cases only, not complete penetration resistance.

Source inspection confirms signed staff cookies, candidate protection on `/api/status`, origin checks for mutations, request body limits and cron bearer authorization. It also shows the current burst limiter is an in-process Map, with a source comment explicitly requiring an edge limit for distributed deployments. Treat distributed rate-limit coverage as an unresolved release verification item; configuration and actual deployment behavior must be checked before deciding whether implementation changes are needed.

Deliver `docs/API_SECURITY_TEST_REPORT_TA.md` with endpoint/method coverage, expected/actual responses, sanitized reproduction evidence, severity, affected release SHA, fixes and retest status. Critical/high confirmed vulnerabilities block production. Do not claim 'unhackable' or 'all APIs private'; report the precise protections and remaining limits.
