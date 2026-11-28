# UT Number + workshop exam matching — implementation plan

## Current system

- Entrance desk already finds students by NIC last four digits and records workshop attendance.
- It currently generates a `TIC-year-sequence` exam ID in attendance. Marks import matches that attendance ID.
- Production records live in the versioned `platform_state` JSON document in Supabase. The old `students` SQL table is not the application's live write path; adding a column there alone would not update the portal.

## Staff workflow

1. Choose a workshop and search NIC last four, full NIC, name, phone, registration reference, or UT suffix (three or four digits). Show **all matches**. A suffix alone must never auto-select a student.
2. Verify name and masked contact/NIC. Enter the full assigned UT number, for example `UT011000`, and save it on the canonical student record. The same UT number must not belong to two students. Re-saving the same number is harmless.
3. Mark attendance. Display and retain the student's UT number for that workshop. Existing `TIC-...` records remain readable during transition.
4. During marks preview and commit, match the **full UT number** to an eligible workshop attendee in the exam's intake. Reject unknown, duplicate, ambiguous, or wrong-intake IDs. Never import marks by a three/four-digit suffix alone.

## Safety and migration

- New UT assignments use `UT` followed by six digits, case-normalized. Require staff access and record who changed an ID. Do not let a UT number be reassigned after marks exist without a separate audited correction process.
- Keep historical `TIC-...` marks readable. A student with no UT assignment can continue through the old path until staff issue one. When old marks exist, only an administrator may explicitly reconcile their IDs to the verified UT number; scores are unchanged and the previous IDs are recorded in the audit log.
- Use the repository's compare-and-swap transaction for concurrent assignments. Add tests for collisions, ambiguous suffixes, repeat saves, and marks matching.

## Rollout checks

- Verify sample students, workshop attendance, marks preview, and committed result in staging before production use.
- Back up production state before any bulk UT backfill. Existing student records do not need an immediate bulk migration because `ut_number` is optional.

## Current implementation status

- Implemented: canonical student UT field, entrance search by NIC last four and UT last three/four, staff assignment with uniqueness and audit, attendance reuse, exact full-ID marks validation, UT on participant/Sheet rows, and explicit admin-only reconciliation of old mark IDs.
- Verified locally: UT assignment/search/marks tests, full suite and production build.
- Before live rollout: deploy and run an authenticated check with a real workshop record. Students who already have marks under a `TIC-...` ID are deliberately blocked from ordinary UT assignment; an administrator can use the explicit audited reconciliation option after verifying their identity.
