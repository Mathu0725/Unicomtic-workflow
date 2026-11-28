# Production capacity enhance panna implementation plan

Date: 2026-11-03  
Target: production deployment for `unicomtic-workflow` (`uticx.com`)  
Related result: [Production read-only capacity check](PRODUCTION_READONLY_CAPACITY_CHECK_2026-11-03.md)

## Current result

Munnadi load-test seitha production deployment `dpl_GckqN8A3wFCt5D7KQo5TzFFKNzfi`-la `/api/campaigns` endpoint-ku one-shot read-only concurrency bursts run pannom. 100 concurrent request varaikkum 100% HTTP 200 and p95 sumaar 2 sec. 200-la p95 10.62 sec; 300-la 299 HTTP 200, oru client fetch failure, p95 10.72 sec. Idhu old deployment-oda baseline; pudhiya release-ku indha load profile innum rerun pannala. Adhanala current evidence-la 100 concurrent **read requests** dhaan acceptable baseline; human users capacity-nu idhai interpret panna koodathu.

User preview build-ai production-ku maathiyadhu confirm panninaar. Ippo Vercel production deployment `dpl_5R53NmmAxPLd8B22WGENutQiu6iA` READY; deployed SHA `ccd157bef1e3414a992621156f4a4876cb3775d1`. Production custom domain [`uticx.com`](https://uticx.com) `/api/health/ready`-ku `ready` return seithadhu; `/api/campaigns` read-only smoke request-um success aagi JSON return seithadhu. Idhu smoke check mattum; load test illa.

Production DB pre-test-la normalized `students`, `registrations`, `applications`, `workshops`, `custom_forms`, `form_submissions`, `email_jobs` tables 0 rows. Aana legacy `platform_state`-la 5 students, 5 registrations already irundhana. Ivai existing records; cleanup-la delete panna koodathu. Public campaign active-nu flag irundhaalum end date `2025-12-31`; custom form configured illa. Production deployment SHA `43bac089872ff4473dea9a26775e919b42a26d4a`; local workspace HEAD `8aee1a3e78e73728fdca2dbff87935a7d04a86ef` — rendu same build illa.

## Phase 1 — Test target-ai release code-oda align seithal [P0]

1. Production SHA-oda source, dependency lockfile, Vercel build settings, Node.js runtime-ai record pannanum. Current report irukkira local tests production SHA-ai prove pannaadhu.
2. Node.js 26.x Vercel-la supported; runtime downgrade-ai automatic fix-aa panna vendam. Cold Start Prevention disabled setting-ai current baseline-aa note pannanum.
3. Production setting-ai maathama, Vercel plan allow panninaal mattum Cold Start Prevention OFF/ON A/B test seiyanum. Same deployment, same region, same endpoint, same load stages use panni p50/p95/p99 compare pannanum; cost/plan impact-ai record pannanum.
4. Current active campaign date stale-aa irukku. Campaign owner-oda intended start/end date confirm aagum varaikkum campaign-ai reopen/extend panna koodathu.

**Exit:** testable commit SHA exact-aa pin aagirukkanum; business campaign dates verify aagirukkanum; no production config change without measured reason.

## Phase 2 — Read latency bottleneck-ai measure seithal [P0]

1. `/api/campaigns` trace-la total handler time, Supabase `platform_state` SELECT duration, response bytes, Vercel cold/warm invocation, error/timeout status-ai separately capture pannanum. Logs-la applicant data, secrets, full payloads podakoodathu.
2. Supabase query latency, active connection count/pool mode, rate-limit/throttle, function region (`iad1`), Vercel invocation duration/concurrency metrics-ai same timestamp-la compare pannanum.
3. Current repository code path read request-ku `readDatabase()` panni full `platform_state` snapshot-ai load seigiradhu. Idhu possible bottleneck; measurement varaikkum root cause-nu confirm panna koodathu.
4. Vercel runtime error lookup-la current 30-minute window-la errors illai; production function log records kidaikkavillai. Adhanala observability gap-ai close seithu, next run-la request-level evidence collect pannanum.

**Exit:** request latency breakdown irukkanum; Vercel-vs-Supabase bottleneck identify aagirukkanum; log data sanitized-aa irukkanum.

## Phase 3 — Evidence-based optimization [P1]

Measurement-ai base panni indha order-la evaluate pannanum:

1. Public campaign/course read-ku full admissions snapshot thevaiyaa nu review pannanum; thevai illai-na minimal public read model/query design seiyanum.
2. Cache evaluate pannumbodhu campaign/course update aana invalidate eppadi nu define pannanum. `platform_state` optimistic version/CAS write model irukkiradhaal process-local cache mattum use pannina Vercel instances-kulla stale data varalaam; invalidation/version safety review illama implement panna koodathu.
3. Supabase client create/reuse and HTTP connection reuse-ai profile panni, supported pooling/keep-alive configuration check pannanum. Connection count/latency evidence illama pool values guess panna koodathu.
4. Dashboard polling/background reads workload-ai increase seigiradhaa nu measure pannanum.
5. Fix ovvondrukkum unit/integration regression + same production-like read load baseline rerun. Timeout mattum increase seithu capacity improvement-nu claim panna koodathu.

**Proposed read pass target:** p95 ≤ 2.0 sec at 100 concurrent GET requests; expected HTTP success ≥ 99%; health remains ready. 200-user stage pass aagum varaikkum supported operating ceiling 100-ai thaandi announce panna koodathu.

## Phase 4 — Full user workflow test-kku safe preparation [P0]

1. Admin owner browser-la production login seithu, test account/permissions verify pannanum. Credentials chat, report, shell output-la share panna koodathu.
2. Existing campaign date business owner confirm seyyanum. Production workflow-ku test form create seiyanumna user-approved label `CAPACITY-TEST-<run-id>` use panni, test recipients mattum use pannanum.
3. Google/Sheets/email/queue/cron integrations test time-la enna external actions seyyum nu inspect panni, supported-aana test sink/delivery disable method use pannanum. Real applicant/recipient-ku message anuppa koodathu.
4. Pre-test baseline-la existing 5 legacy students/registrations record pannanum. Unique run ID + synthetic email prefix + created row IDs/reference numbers manifest-la save pannanum. Pre-existing records delete panna koodathu.

**Exit:** dedicated test form, permitted campaign, safe email/Sheets behavior, exact cleanup manifest, recovery snapshot all verify aagirukkanum.

## Phase 5 — Controlled end-to-end test matrum cleanup [P1]

1. Mudhal UI → API → stored row → confirmation journey-ai oru synthetic user-oda seithu, one exact test record identify pannanum.
2. Read stages: 10 → 25 → 50 → 100. Ovvoru stage pass aana piragu mattum next stage; 150/200 stages separate owner decision + service monitoring-oda.
3. Write stages: 1 → 5 → 10 → 25 concurrent submissions; duplicate/idempotency retry separate. Registration, application, workshop seat-race, staff reads-ai thanithaniya test pannanum. Existing campaign validity/workshop capacity assumptions verify aana piragu mattum.
4. Ovvoru write-um HTTP acknowledgement, Supabase commit, reference uniqueness, student count, outbox state ellam reconcile pannanum.
5. Stop rules: health fail; error/timeout >1%; p95 >5 sec sustained 60 sec; Supabase/Vercel rate limit; unexpected mail/Sheet send; existing record mismatch — indha edhu nadandhaalum load stop pannanum.
6. Cleanup test manifest-la irukkira exact run IDs/record IDs mattum delete pannanum. Global truncate, `platform_state`-ai replace pannudhal, blanket delete forbidden. Cleanup-ku mun/post row counts, legacy 5+5 state, foreign-key dependents verify pannanum. Cleanup mudiyavillai-na test data list-ai owner-kitta report panni untouched-aa preserve pannanum.

## Phase 6 — Capacity decision matrum release [P0]

Final report-la deployment SHA, Node version, cold-start setting/plan, user journey type, offered concurrency/arrival rate, endpoint mix, p50/p95/p99, HTTP errors/timeouts, DB timing/connections, accepted writes, no-loss/no-duplicate proof, post-test cleanup counts, test gaps ellam include pannanum.

**Release gate:** public read path 100-user target pass; authenticated critical workflows pass; no expired/incorrect campaign config; no unauthorized API access; test records exact-aa cleanup; existing 5 legacy records preserve; deployment tested SHA = release SHA. Idhil edhuvum missing-na capacity result partial-aa report pannanum; production sign-off kudukka koodathu.

## Innum mudikka vendiyavai

- **Done:** `/api/campaigns` request total duration + Supabase `platform_state` read duration-ai compare panna 5% sanitized structured sample instrumentation production deployment-la irukku. Focused test, TypeScript check, full suite (**64 files / 745 tests**) pass.
- User production-ku maathina deployment `dpl_5R53NmmAxPLd8B22WGENutQiu6iA`, SHA `ccd157bef1e3414a992621156f4a4876cb3775d1`, READY. `/api/health/ready` ready; `/api/campaigns` smoke read success. Pudhiya SHA-ku 100/200/300 concurrency profile innum run pannala; Vercel runtime-la `capacity_sample` log-um innum observe aagala.
- **Pudhiya production read-load rerun (partial):** local Node runner-la 10 concurrent `GET /api/campaigns` stage mudhalil 4 HTTP 200, 6 client `fetch failed`; repeat-la 1 HTTP 200 (4.7 sec), 9 `UND_ERR_CONNECT_TIMEOUT`. Idhu server response code illa; local runner connection establish pannave mudiyala. Single Node request oru murai 1.7 sec-la 200, vera murai 9.1 sec-la 200. Browser-la 5/5, 10/10, 25/25, 50/50 tabs JSON response (10 stage-la 2 automation wait timeout vandhadhu; re-check-la rendu page-um loaded). 25 stage corresponding Supabase log window-la 25 GET, 25 status 200; DB origin average 868 ms, p95 1,087 ms, max 1,096 ms. 50 stage log window-la 27 GET status 200, DB origin p95 913 ms; ellaa 50 browser page-um return aanaalum ella request-um DB log-la match aagala, so 50 backend request count/p95 confirm aagala. 100 stage browser harness 25 tab mattum create pannichu; meedhi 75-ku tool timeout; 100 stage valid-aaga nadakkala. 100 test window-la Supabase log 28 GET status 200, p95 894 ms; idhu 100 request-um app-kku reach aayiduchu-nu prove pannaadhu. Browser batch time tool/navigation overhead-um include seigiradhu; exact server latency-aaga use panna mudiyadhu. 50/100 stage-kku app-specific runtime errors Vercel-la report aagala; 100 stage-kku piragu health ready. Indha run old 300-user result-ai replace pannaadhu; confirmed near-simultaneous backend baseline 25 GET varai mattum.
- Vercel production `NEXT_PUBLIC_SUPABASE_URL` `https://iwipyqxxeqrmirqqwlxd.supabase.co`-nu verify pannom; connected Supabase MCP-la idhe project active-aa irukku. `qxxnvkpbhjkdayomkzkf` URL staging tab-oda project; adhai production data-nu assume pannala. Supabase edge logs-la latest 6-minute window `platform_state` GET 27 requests, origin average 777 ms, p95 1,088 ms, max 1,144 ms; idhu background traffic-um include seigiradhu, so app load-test mattum-nu attribute panna mudiyadhu. Supabase edge logs-la minute cadence-la `save_platform_state` POSTs-um irundhana; idhu background worker/cron-aa nu identify pannanum, test request-nu solla evidence illa. Vercel Observability query endpoint team plan-la enabled illa; request-level function timing evidence kidaikkala.
- Instrumentation change [Draft PR #1](https://github.com/Mathu0725/Unicomtic-workflow/pull/1)-la irukku; adhu innum merge aagala. GitHub `main`/source release alignment-ai follow-up-la seiyanum; illaina next main deployment indha production code-ai replace panna vaaippu irukku.
- Admin owner production browser-la sign-in seithu test workflow enable panna vendum.
- Campaign date, test form, external integration side effects verify panna vendum.
- Pudhiya production SHA source-oda exact-aa irukkiradhaa verify panni, PR #1 merge/release alignment mudikkanum; pinbu Vercel/Supabase latency sample collect pannanum.
- Network-reliable runner-la per-request end-to-end HTTP status/latency capture panni 10→25→50→100 stages repeat pannanum; browser harness/Node runner limit nala 50/100 backend count and endpoint p95 complete-aa verify aagala. Minute-cadence background `save_platform_state` source-um identify pannanum. Accurate per-request measurements varum varaikkum 100-user pass, supported user ceiling, 200/300 stage pending.
- `Cold Start Prevention` ON/OFF comparison (plan support irundhaal), then same load profile repeat pannanum.
- Controlled write-path full journey, exact test-only cleanup, final capacity report.
