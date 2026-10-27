# Student reminders

Open **Admin → Student Reminders**, or follow the reminders link from Workshops. Only administrators can review recipients or queue a reminder.

1. Choose an intake and one of the three reminder groups.
2. Select the students to contact. Click **Preview** beside a student, or **Preview email** in the compose section, to review the personalized email in a popup. Close it with the close button or Escape.
3. Edit the subject/message if needed. An active application/workshop RSVP form is linked automatically for the matching intake. An optional action link can replace it; otherwise students can reply to the email for assistance.
4. Click **Queue selected reminders**. Messages use the saved Gmail/SMTP sender and the existing durable email queue.
5. Check **Email delivery activity** for queued, sent, failed, blocked or uncertain messages. Run the notification worker, or use **Email Center → Process pending jobs now** for manual dispatch. Provider acceptance is recorded as sent; it does not prove inbox delivery.

## Groups

- **Application pending:** active, non-cancelled registrations without a submitted/reviewed/approved application. Invited/started applications still need completion.
- **Workshop not booked:** completed applicants without a confirmed booking or workshop attendance in the same intake.
- **Workshop missed:** confirmed bookings with an explicit **Absent** attendance record after the workshop ended. Students who attended, were late/excused, or already booked another upcoming session are excluded. Missing attendance is shown as a review count and is never assumed to mean absent.

Withdrawn/rejected applications and inactive intakes are excluded. Recipients are revalidated when the batch is saved and again when the worker claims the email. Reminders that no longer apply are blocked as superseded and cannot be released/retried through Email Center.

Queued/sending/failed/blocked/uncertain reminders must be reviewed before creating another reminder for the same step. Successfully sent reminders have a 24-hour gap. Preview tokens expire after 15 minutes, and any changed recipient details require a new preview. Subject and message variables are escaped as text in outgoing HTML.

This feature uses the existing canonical platform state and notification outbox. No database schema migration or recurring reminder automation is required. It does not automatically generate daily follow-ups.
