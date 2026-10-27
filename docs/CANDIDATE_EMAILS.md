# Candidate email and daily allowance

Open **Communications → Email Center**, or use **Email** beside a registration/application. Choose Registrations or Applications, filter by candidate status and name/email/reference, and select one candidate. Enter a subject and plain-text English/Tamil message, preview it in the popup, then send. The recipient is derived from the saved student record; arbitrary addresses cannot be substituted through the candidate endpoint.

Sending first saves an idempotent outbox job, then attempts only that job. If the connection drops, resolve the original submission before composing another copy. A candidate contact changed before dispatch fails safely and requires a newly reviewed message. Admission staff permissions apply to all directory, queue, dispatch and allowance endpoints.

## Delivery status

- **Sent**: Gmail/SMTP accepted the message; inbox placement and reading are not confirmed. Later bounce notices are not imported automatically.
- **Failed**: permanent rejection, or a connection/configuration issue needing repair.
- **Failed · retry scheduled**: an actual attempt failed temporarily; the reason and retry time appear in activity.
- **Not confirmed · review needed**: the provider outcome is unknown. Check Gmail Sent/SMTP logs before manually retrying, to avoid duplicates.
- **Waiting for daily limit**: saved without consuming a send attempt; resumes when the rolling allowance/provider pause permits it.

Activity filters apply before pagination, including registration/application, delivery status and name/email/reference/subject search. Legacy submission confirmations and reminders retain candidate context where their saved IDs can be resolved. Admin notifications are marked as alternate recipients.

## Sending allowance

The portal defaults to a maximum of **500 messages in a rolling 24-hour window**. An administrator can lower the limit to 1–500 in Email Center. Confirmations, admin alerts, reminders, test messages and candidate messages all pass through the same worker budget. The former direct SMTP test-send route rejects delivery requests; saved-sender tests use the queue.

The durable queue-control ledger reserves allowance in the same database transaction that claims an email. Concurrent workers and restarts share the count. Accepted and uncertain sends count; confirmed rejections release their reservation. Expired worker leases become uncertain rather than being automatically resent. Recent legacy accepted/uncertain sends count too. Lowering a cap, retrying a job or reconnecting the same sender does not clear usage. Gmail aliases and SMTP/Gmail API access for the same account share one allowance.

Mail sent outside this portal also uses the provider's allowance and cannot be counted locally. Gmail/SMTP daily sending-limit errors pause that account for at least 24 hours and retain pending jobs. API request-rate errors retain their ordinary provider backoff. Sheets continue independently. See [Google sending limits](https://support.google.com/mail/answer/22839) and [Gmail API errors](https://developers.google.com/workspace/gmail/api/guides/handle-errors).

A persistent notification worker or protected queue scheduler must remain running for automatic retries and next-day dispatch. An immediate candidate send attempts its selected job even when that background worker is stopped.

## Verification

Tests in `tests/integration/candidate-email.test.ts` and `tests/integration/email-daily-budget.test.ts` use isolated temporary storage and mocked providers. They cover role restrictions, filtering before pagination, escaped content, stale recipients, idempotency, targeted dispatch, concurrent claims, quota persistence/expiry, sender aliases, provider pauses and independent Sheet progress. No real messages are sent by these tests.
