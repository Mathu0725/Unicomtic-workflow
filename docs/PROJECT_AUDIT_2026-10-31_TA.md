# Unicom TIC — Project-wide audit

Reviewed: 31 October 2026 · Asia/Colombo

Reviewed release: `6f6b7f46386acdbbdf997d3b3973d089585514c8` (`main`, uticx.com).

**முடிவு: 10 reproducible defects கண்டுபிடிக்கப்பட்டன.** Existing automated suite pass ஆனாலும் இந்த cases அந்த suite-ல் cover ஆகவில்லை. இது review மட்டும்; application code, production records, email delivery அல்லது deployment மாற்றப்படவில்லை.

## Scope and evidence

- Project inventory: **38 pages, 71 API route files**. Registration/application, form builder, workshop booking/access, attendance/UT numbers, email/outbox, Sheets, staff authorization, eligibility, interviews, final results, repository and migrations ஆகிய பகுதிகளின் code paths ஆய்வு செய்யப்பட்டன.
- Existing suite: **654 tests / 60 files passed** (`node scripts/test.mjs`).
- TypeScript: **passed** (`node node_modules/typescript/bin/tsc --noEmit`).
- Audit reproduction: **10 checks / 2 files passed**. These checks assert the current faulty behavior; “passed” here confirms the defect, not a fix.
- All finding-related source files were compared with GitHub `main`, normalizing CRLF/LF only: **matched the reviewed release**.
- Production `/api/health` and `/api/health/ready`: **HTTP 200**, `alive` and `ready`.
- Vercel grouped runtime errors, preceding 24 hours: **none reported**. Logical errors can still return successful HTTP responses.
- Synthetic records and mocked Google Sheets only. No real candidate was edited, no email was sent, no production spreadsheet was written.

**Limits:** This was a project-wide source review with targeted execution, not an exhaustive browser interaction on every page or a live penetration/load test. Live Supabase grants/advisors, provider delivery, backup restoration and production 300-user throughput were not revalidated. The deployed build was already READY before this audit; a new build/deployment was unnecessary because application code was unchanged.

## Priority overview

P1 = fix before using the affected workflow with real records. P2 = fix in the next maintenance batch.

| ID | Priority | Confirmed problem | Main impact |
| --- | --- | --- | --- |
| R9 | P1 | Final result edit can target the wrong intake | Another intake's decision changes |
| R2 | P1 | Manual Sheets resync clears columns omitted from export | Saved answers/notes disappear from the Sheet |
| R8 | P1 | Interview editor retains the previous candidate's values | Wrong marks and private notes can be saved |
| R4 | P1 | Configured shortlist tie-break rule is ignored | Wrong candidate receives the last shortlist place |
| R1 | P1 | Failed workshop verification attempts do not persist rate limits | The advertised per-pair/IP protection does not count failures |
| R10 | P1 | New interviews and initial final decisions cannot be created through UI | A fresh intake cannot complete the later stages through the portal |
| R3 | P2 | Multiple form responses share one Sheet upsert key | Separate responses collapse into a single row |
| R5 | P2 | `under_review` applications are treated as unsubmitted | Valid applicants become ineligible |
| R6 | P2 | Returning to an earlier decision prevents a new notification | Result email remains pending with zero jobs queued |
| R7 | P2 | Final-result details read another intake's records | Wrong exam score/course returned by API |

## Findings and reproductions

### R9 — Final-result edit uses the first matching student, not the selected decision

**Location:** `src/app/admin/final-results/page.tsx:53`, and the row handler near line 216.

ஒரே student இரண்டு intakes-ல் இருந்தால், இரண்டாவது row-ல் status மாற்றினாலும் handler-க்கு `studentId` மட்டும் செல்கிறது. `decisions.find(d => d.student_id === studentId)` முதல் intake-ஐ எடுத்துக்கொள்கிறது.

**Reproduced:** old/new intake decisions for one synthetic student → edit the second row to `waiting_list` → outgoing POST contains `campaignId: "old"`.

**Fix:** Pass the selected decision object/ID; submit its exact `campaign_id`, status/version and student. Server must validate the same decision identity. Include a two-intake UI regression test.

### R2 — General Sheet resync overwrites absent columns with empty strings

**Location:** `src/lib/google/sheets-service.ts:180`; narrower export payload in `src/app/api/admin/sheets-sync/route.ts:18`.

Existing headers are retained, but each cell is reconstructed from the incoming row. Missing fields become `""`; existing-cell preservation only applies to workshop exports. Global manual resync sends fewer fields than a form-response export, so it can clear the form's custom answers, NIC and manually maintained notes in the destination Sheet. The portal database still retains its saved response.

**Reproduced:** existing row `[REG-TEST, Audit Student, Keep this answer, Call tomorrow]` → sync only reference/name → outgoing update `[REG-TEST, Audit Student, "", ""]`.

**Fix:** Preserve cells for omitted keys in general exports too, while defining explicit clearing separately. Test form export → global resync → form export and preservation of staff-added columns. Before repairing affected Sheets, compare with stored form responses or a verified backup.

### R8 — Interview marks and confidential notes carry over to the next candidate

**Location:** `src/app/admin/interviews/page.tsx:52`.

`handleOpenEvaluation` loads values only when the selected candidate already has an evaluation. It has no reset path for an unscored candidate. Closing the modal leaves the old component state intact.

**Reproduced:** open candidate A's saved rubric → Cancel → open unscored candidate B → A's confidential notes remain in B's textarea. The same conditional controls scores and recommendation.

**Fix:** Initialize every rubric field for each selection; unscored candidates must start with explicitly defined empty/default values. Keep unsaved drafts scoped to candidate IDs if drafts are desired.

### R4 — Shortlist tie-break selection is ignored

**Location:** `src/lib/eligibility/engine.ts:95`.

UI/API allow `higher_al_results` and `earlier_registration`, but the engine always falls back to alphabetical student name for equal exam scores. With a shortlist capacity, this changes who is included.

**Reproduced:** A Student and Z Student both score 80. Z has higher A/L Z-score and registered earlier. With capacity 1, **both configured tie-break options select A**.

**Fix:** Apply the selected criterion, define missing-value behavior and a deterministic final fallback. Test ties at the final shortlist place. Confirm intended handling of multiple exams/max marks before expanding score aggregation; the current adapter takes the first matching exam's raw score.

### R1 — Workshop verification failures roll back their rate-limit counters

**Location:** `src/app/api/candidate-access/verify-workshop/route.ts:34` and `:48`; transaction commit path `src/lib/data/repository.ts:186`.

`accessBucket` mutates the transaction snapshot. A mismatch then throws `denied()`, so the snapshot is never saved. Invalid attempts therefore do not accumulate toward the 8-per-pair / 600-per-IP limits. The general in-memory submission burst cap is separate and does not provide this durable protection.

**Reproduced:** nine consecutive attempts for a real synthetic reference with the wrong email → **all nine HTTP 401**, persisted `candidateAccessAttempts.length === 0`; the ninth should be limited.

**Fix:** Commit attempt accounting independently of the business rejection, while retaining the actual rejection HTTP status. Simply returning a 4xx response inside the current transaction is insufficient: the repository intentionally avoids saving error responses. Test failed, successful and concurrent attempts, including invalid form targets.

### R10 — Later admissions stages have APIs but no UI path to start them

**Locations:** `src/app/admin/interviews/page.tsx:121`, `src/app/admin/final-results/page.tsx:172`; creation actions exist in their API routes.

With no interview sessions, the Interviews page renders an empty list with no create-session/assign-candidates controls. Final Results only renders decisions already present; it has no initial decision creation action. Eligibility displays its report but offers no transition into those workflows.

**Reproduced:** empty interview dataset → **zero buttons** after loading. Empty final-decision dataset → only the two dispatch buttons, no decision editor. No other frontend caller for `create_session` or `assign_candidates` was found.

**Fix:** Add the missing staff workflow: select intake → create interview session → select/assign candidates → evaluate → create draft final decisions → review → dispatch. Keep human selection/approval explicit and reuse existing APIs. Test starting from an intake without demo records.

### R3 — Two form responses can be merged into one Sheet row

**Locations:** `src/lib/admissions/service.ts:241`, `src/lib/google/sheet-target.ts:9`, `src/lib/google/sheets-service.ts:174`.

Non-application submissions reuse the registration reference. A registration form and a workshop/general form can inherit the same `Registrations` tab. Sheets deduplicates/upserts solely by `referenceNo`, so the later response replaces the earlier row. Within one batch, the last row silently wins. Separate workshop-booking exports use booking IDs and are not affected by this particular collision.

**Reproduced:** two distinct response rows with the same registration reference → `syncedCount: 1`, one appended row containing only the second response.

**Fix:** Define whether a tab contains canonical registration records or individual form responses. Give response exports a stable submission/form-specific key or separate destination tabs, keeping registration reference as a separate column. Plan migration for existing Sheet keys rather than blindly re-exporting.

### R5 — Starting application review makes the candidate appear unsubmitted

**Location:** `src/app/api/admin/eligibility/route.ts:37`.

`hasSubmittedApplication` accepts only `submitted` and `approved`. The supported `submitted → under_review` transition is incorrectly treated as an incomplete application.

**Reproduced:** submitted application moved to `under_review`, exam score 90, attendance requirement disabled → ineligible with `Incomplete or unsubmitted formal application`.

**Fix:** Distinguish whether an application was submitted from its current review outcome. At minimum include `under_review`; define rejected/withdrawn policy explicitly and test each supported status.

### R6 — A corrected decision cannot queue the same outcome again

**Location:** `src/app/api/admin/final-results/route.ts:94`.

Notification deduplication uses only decision ID + final status. A previous job remains in outbox even after it was superseded. Returning to that status finds the old key and skips the required new notification.

**Reproduced:** selected → queue offer → unsuccessful (old queued offer becomes `DECISION_SUPERSEDED`) → selected → dispatch → **0 queued**, original job still failed, decision still pending.

**Fix:** Version decision revisions and key notifications by revision. Replays of one revision should deduplicate; an explicitly changed revision should be independently reviewable and sendable. Preserve the audit trail and uncertain-send safeguards.

### R7 — Final-result details are not scoped to the decision intake

**Location:** `src/app/api/admin/final-results/route.ts:14`.

Application, attendance and exam result are selected by student ID alone. The same person can legitimately register in more than one intake.

**Reproduced:** old intake score 40 / old course, new intake score 90 / new course, decision belongs to new intake → GET returns **score 40 and old course**. The notification path also selects attendance by student without intake scoping.

**Fix:** Join through `sd.campaign_id` and scope attendance/exams via their workshop/exam campaign. Use the canonical UT number where intended. Add old/new-intake API and email-payload tests.

## Additional readiness gaps, not demonstrated production incidents

- **100–300 submissions:** records and queue are still stored in one versioned `platform_state` JSON aggregate. Each write reads/serializes/writes that whole aggregate. Existing tests validate conflict/retry behavior, but actual deployed throughput with a representative historical dataset is not established. Run a controlled staging load test before claiming 300-user capacity; inspect p95, 503s, retries, seat totals and provider backlog.
- **Staff access lifecycle:** current Users API offers list/create, with no normal disable/reset/revoke flow. Session authorization uses a signed seven-day role claim without checking the current staff account on each request. Add a supported offboarding/session-revocation design; do not rely on editing the data directly or changing passwords to revoke existing cookies.
- **Operational checks:** validate the real scheduler heartbeat, provider connection, sending allowance, backup restore and live Supabase grants separately. No provider send or production data mutation was used as an audit test.
- **Legacy paths:** `/register`, `/apply` fallback, old reporting schemas and Supabase compatibility facade still exist. Keep routes until link usage is known; remove unused code/tests only after verifying their callers. The compatibility facade tests do not establish live writes to the historical SQL reporting tables.

For database diagnostics, the current [Supabase observability guidance](https://supabase.com/docs/guides/observability) supports checking logs, live statistics and advisors in addition to application tests.

## Suggested repair order

1. **Data and decision integrity:** R9, R2, R8, R4, R7. Add regressions asserting the corrected behavior before fixes.
2. **Access and reliable communication:** R1, R3, R5, R6. Preserve existing duplicate prevention and notification history.
3. **Complete staff workflow:** R10, with clear intake selection and human review before dispatch.
4. **Production capacity and operations:** staging load test, account revocation, scheduler/provider/backup verification.

Reproduction artifacts remain under ignored `.data/` so tests that assert broken behavior do not enter the normal passing test suite:

- `.data/project-audit.test.ts` — seven isolated service/API checks.
- `.data/project-audit-ui.test.tsx` — three rendered UI checks.
- `.data/run-project-audit.mjs` — run with `node .data/run-project-audit.mjs`.
- `.data/project-audit-results.json` — machine-readable execution result.

After each fix, replace the relevant characterization assertion with the desired behavior in the normal regression suite. This report does not claim existing production records have already been affected; it records reproducible failure paths in the deployed source.
