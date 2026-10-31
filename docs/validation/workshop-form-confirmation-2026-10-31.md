# Workshop form and confirmation verification

Story: Admin creates a workshop and selects forms → server publishes only its workshop settings → a student verifies reference/email, books a workshop → the thank-you page and one selected-template email contain the confirmed date, venue and Maps link.

## Verified

- Create and attach is transactional and idempotent. Unrelated draft edits remain unpublished; conflicting workshop drafts return 409. Closed forms remain closed and receive draft attachments.
- New workshops require explicit form attachment, including on forms that used the legacy automatic list. Legacy bookings remain readable.
- Maps share links are validated when entered/changed and required to publish a new workshop. Builder publication applies the same requirement.
- Thank-you API returns a server booking snapshot including end time, address and Maps URL. Retry returns the same summary without another booking or email.
- Reusable workshop templates support edit, duplicate, subject, body, button wording, versioned queue content and a server preview. They are excluded from incompatible general form campaigns.
- RSVP defaults to one booking confirmation. Additional receipt is an explicit Builder option; when workshop confirmation is disabled, normal form receipt settings apply.
- Invalid templates block only the affected email. The booking remains saved, and automatic reminder planning continues.
- Existing capacity/concurrency tests include 300 applicants competing for 50 seats.

## Browser and data evidence

An isolated local fixture was used with synthetic QA records and no mail provider connection. Production records were inspected read-only. An initial local production build retained its compiled production database URL; no mutations were made through it. It was stopped and replaced by a separately compiled development build using the isolated fixture.

| Boundary | Evidence |
| --- | --- |
| Admin → API | Workshop create/attach returned `live: true`; public QA form listed the created workshop |
| Admin template UI | Duplicated shared confirmation; saved custom subject and “Find the venue” Maps button text |
| Gate → form | `POST /api/candidate-access/verify-workshop` returned 200; full form then displayed |
| Form → booking | `POST /api/forms/workshop-qa` returned 200 |
| Data → confirmation | Exactly 1 booking, 1 submission and 1 email job; custom subject and Maps button were present |
| Mobile UI | 390px viewport; document width 390px, no horizontal overflow; date/time, address, reference and Maps button visible |

The QA email remained **queued**. No real email was sent and no production seat was booked. Browser native date entry was not fully automated; create/attach was exercised through the actual local API, followed by browser template editing, verification, selection, submission and thank-you rendering.

Screenshot: `docs/validation/workshop-confirmation-mobile-2026-10-31.png` (local QA artifact, intentionally excluded from Git).

## Live observation before release

The `Test` workshop had a start time of 31 October 2026 at 09:00 Sri Lanka time and was already marked started/completed. The future workshop dated 2 November was attached to the published workshop selection form. New visibility messages explain started, hidden, draft, full and closed states.

## Release checks

- Automated suite: **654 tests passed across 60 files**. Production webpack build and TypeScript checks passed; `git diff --check` passed.
- Deployment verification must match the release commit and `uticx.com` production alias.
- No migration, SQL schema change, new dependency or production record rewrite is needed. All persisted fields added by this release are optional for existing records.
