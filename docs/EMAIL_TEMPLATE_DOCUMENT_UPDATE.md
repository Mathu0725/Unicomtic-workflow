# Corrected email templates and optional attachments

The starting wording comes from `Unicom_TIC_Email_Templates (1).docx`. It covers registration and application receipts, application invitations, workshop registration invitations, workshop confirmations and reminders, bilingual interview invitations, and all three final-result messages.

## Set the current intake details

Open **Settings → General & policy → Email dates and form links**. Set the programme name, workshop registration link, interview availability form and deadline, course start date, enrollment document upload form and deadline, Blossom Trust Form deadline, and enrollment document contact address. Admissions contact email and phone come from the existing Admissions contact section.

The old 2025 dates, sample workshop timetable and historical form URLs are not reused. Workshop reminders use each workshop's date, time, address and map. The interview and result messages use the student's UT number, with the application reference as a fallback. Unconfigured workflow values are displayed as instructions to contact admissions or as “To be confirmed by admissions”; fill the settings before sending an intake's invitations or offers.

## Apply the corrected wording

Open **Email Templates → Templates**, choose the system template, and select **Load corrected document wording**, review it, then **Save template**. Existing administrator wording is kept until explicitly saved. Previously queued messages retain their saved wording and files. A form using its own custom confirmation continues to use that form template; choose a system template in Form routing to use its wording and attachments.

The workshop registration invitation is available as a starting template in **Manual Email Center**; it does not automatically email applicants when settings are changed.

## Attach files

In **Manual Email Center**, use **Attachments (optional)** before reviewing recipients. Files appear in the preview and are included in each separate recipient's email and in an explicitly requested test email.

For recurring messages such as admission offers, attach the blank contract or trust forms in that system template's editor and save it. This does not send an email. New notifications using that template include the files; files cannot be added retroactively to messages already queued.

Supported types: PDF, DOCX, XLSX, PNG, JPG/JPEG and TXT. Maximum: 5 files, 2 MB combined per email. Files are stored durably with admissions data, deduplicated for queued recipients, and passed as bytes to SMTP or Gmail MIME composition. No local path or remote attachment URL is accepted.

No real emails are sent by updating the templates or by the automated tests. Live delivery still requires the configured mail account and queue worker.
