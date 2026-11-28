# Unicom TIC — audit fixes

31 October 2026. The ten reproducible findings in [the audit](PROJECT_AUDIT_2026-10-31_TA.md) have code fixes and regression coverage.

| Audit ID | Repair |
| --- | --- |
| R1 | Workshop access failures commit the reference/email and IP attempt counters before the error response. Concurrent invalid attempts share the limit. |
| R2 | Sheet updates preserve existing cells for columns omitted from a narrower export. An explicit empty or null value still clears the requested cell. |
| R3 | Every form response exports with a stable `SUB-<submission ID>` Sheet key. Its public registration/application reference remains in `responseReference`. Unsent legacy response jobs receive the new key when claimed. |
| R4 | A/L Z-score and registration timestamp rules now resolve equal exam scores; missing values sort last and exact ties have a stable fallback. |
| R5 | Submitted, under-review and approved applications count as submitted for eligibility. |
| R6 | Each changed final decision has a new revision and notification key. Superseded queued jobs cannot send or be retried. |
| R7 | Final-result details and notification UT numbers are scoped to the decision's intake. |
| R8 | Interview rubric fields reset for each unscored candidate; the editor uses an accessible dialog. |
| R9 | A result edit sends the selected decision ID, revision and intake, including when a student belongs to multiple intakes. |
| R10 | Staff can select an intake, create an interview session, assign candidates with 30-minute slots, score them, create pending final-decision drafts and explicitly review email dispatch. |

## Existing Sheet rows

Older form-response exports may remain under registration/application references in a shared Sheet tab. The portal cannot safely infer which response last overwrote such a row or whether staff edited it. New exports append distinct `SUB-` rows. **Do not bulk-delete old rows automatically.** Compare each historical row with the portal's stored form response and any Sheet version history; archive or clean up verified obsolete rows after the comparison. The portal keeps the original public reference separately so staff can search it.

## Verification

- Full automated suite: 683 tests passed (`node scripts/test.mjs`). An earlier parallel run had one storage-contention failure in the four-process concurrency test; after stopping the isolated QA server, that test and the full suite both passed.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passed.
- Production build: `node node_modules/next/dist/bin/next build --webpack` passed.
- Isolated browser flow: created an interview session, assigned two synthetic candidates at 09:00/09:30, saved one rubric, confirmed the next candidate's scores and notes were empty, then created a pending final decision. The isolated outbox held two queued invitations and sent none.

Production delivery, real Google Sheets and 100–300-user load are separate operational checks. Historical Sheet data needs the comparison above before any cleanup.
