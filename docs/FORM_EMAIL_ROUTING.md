# Form email routing and direct applications

## What changed

Open **Email Center → Email Templates → Form routing**. Each form has one applicant confirmation selection, one staff alert selection, separate Off choices, and additional staff recipients. Choose the form's existing custom wording or a centrally edited confirmation template. The **Edit templates** tab holds message wording. Saving routing affects new submissions; it does not resend or rewrite earlier messages.

Registration emails include an application link only when an application form is explicitly selected in routing. That link is added to the registration receipt, not sent as an extra invitation. The target must belong to the same intake and accept responses. An open target uses its public form URL; a restricted target uses a private email link to that specific form. Old public slugs still resolve to the canonical form.

Delivery activity shows the source form and distinguishes **Applicant confirmation**, **Admissions staff alert** and **Secure access link**. Staff who also submit as applicants may receive both a receipt and a staff alert. Staff recipients are normalized and deduplicated. Submission retry keys, intake identity uniqueness and queue job keys prevent repeated confirmations. Repeated secure-link requests for the same recipient, purpose and canonical form reuse pending requests and have a five-minute resend cooldown.

## Application access

In **Builder → Settings → General → Who can apply?**, choose:

- **Open application**: no earlier registration, invitation or email session is needed to submit. The server creates the application and its internal tracking record together and queues only the configured application confirmation and staff alert. Private document upload receipts still bind uploads to the specific form, question and submission. Tracking remains protected by email verification.
- **Registered applicants only**: preserve the existing invitation and secure email session requirements. Workshop RSVP and private status lookup retain their existing access checks.

Existing forms without an explicit mode retain restricted access; newly created application forms start in Open mode. The administrator authorized changing the current production application to Open mode. Publish changes to activate them. Opening and closing dates, response limits, required identity fields, document limits and duplicate checks apply in both modes.

## Conflict handling and release checks

Central routing requires the current published form version and rejects changes while a saved Builder draft exists. Publish or discard that draft and reload routing first. It preserves custom template wording. The Builder links to centralized email settings rather than maintaining a second set of sending controls.

No SQL migration or new OAuth permission is required; optional configuration is stored in the existing private form JSON. Production changes update only the access mode and template routing, with a private configuration backup and version guards. Existing applicant answers and sent-message history are preserved. Production verification uses read-only checks and sends no test emails.

The connected Google permission is `gmail.send`; it does not authorize reading Gmail Sent message bodies. The delivery audit compares the stored outgoing payloads, stable queue keys, provider confirmation IDs and timestamps. It found seven accepted historical email jobs with distinct queue keys, including two requested secure links addressed to different recipients, registration receipts and a staff alert. There was no accepted application-confirmation job at audit time. Recipient data and secrets are excluded from this report.

Integration tests cover open submission, existing registrations without invitation, restricted access, concurrent retries, single confirmation, central settings conflicts, disabled sending, selected follow-up forms, renamed links, resend cooldown and date/limit checks. Document tests cover both open uploads and closed-form rejection. DOM tests verify saving the intended form and retaining edits on failure. Browser access is disabled in Work settings, so visual browser QA is not verified.

Release validation passed 436 tests across 45 files, TypeScript and the production source build. All 90 deployment traces contained zero private files. Production verification does not submit a synthetic applicant, upload a test document or dispatch a test message.
