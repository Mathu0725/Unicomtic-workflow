# Personal Gmail + admissions setup

For a step-by-step Tanglish walkthrough of Google Cloud Console, see [Google Cloud Console setup](GOOGLE_CLOUD_CONSOLE_SETUP_TA.md).

The portal uses one connected Google account for Gmail sending and Google Sheets. Optional Google Drive access saves student documents; see [Drive document uploads](GOOGLE_DRIVE_DOCUMENTS.md) for consent, folder setup and form questions. SMTP is an alternative sender. Google API requests run on the server; refresh tokens and saved SMTP passwords are encrypted.

## 1. Server configuration

Add these values to `.env.local` (or your hosting environment). Do not put secrets in chat or commit this file.

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_SECRET=<a random secret of at least 32 characters>
ADMIN_EMAIL=your-admissions-account@gmail.com
ADMIN_PASSWORD=<a strong administrator password>
GOOGLE_CLIENT_ID=<web OAuth client id>
GOOGLE_CLIENT_SECRET=<web OAuth client secret>
CRON_SECRET=<a separate random worker secret>
SEED_DEMO_DATA=false
```

Generate random secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep APP_SECRET unchanged; changing it invalidates sessions and requires reconnecting Google/re-entering SMTP passwords.

Local development saves records to `.data/platform.json`, with a cross-process lock and atomic file replacement. Back up this directory securely. Existing hardcoded student demos are not added to this repository unless SEED_DEMO_DATA=true is explicitly set. Your form templates, including the bilingual scholarship application, are retained.

For production, configure real NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and execute `supabase/migrations/006_durable_platform_state.sql` in the Supabase SQL Editor. This migration is independent of the earlier normalized tables. It also restricts the earlier permissive policies if those tables exist. The current source of truth is the versioned `platform_state` aggregate, not the earlier individual tables. A compare-and-swap database function atomically commits admissions records, duplicate checks, bookings and notification jobs. The app reports errors rather than silently falling back to demo data when a configured database is unavailable.

The aggregate suits a small admissions portal. It rewrites the aggregate on each mutation; monitor its size and move to normalized transactional tables for a high-volume deployment. Separate server instances reject conflicting writes with HTTP 409 so the client can retry without overwriting another submission.

Serverless hosts require Supabase. A dedicated server with persistent disk can explicitly use ALLOW_LOCAL_STORAGE=true; never use that mode on ephemeral hosting. New local locks record their process owner and recover automatically when that owner is definitely no longer running. For an older empty lock or abandoned recovery guard, stop all app processes and remove only `.data/platform.json.lock` / `.data/platform.json.lock.recovery` before restarting.

## 2. Create the Google OAuth application

1. Open [Google Cloud Console](https://console.cloud.google.com/), create/select a project, and enable **Gmail API** and **Google Sheets API**.
2. In Google Auth Platform, configure app branding/contact information. For a personal Gmail account select **External** audience.
3. While the app is in Testing, add your admissions Gmail as a test user. Request `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.send` and `https://www.googleapis.com/auth/spreadsheets`.
4. Create an **OAuth client ID → Web application**. Add this authorized redirect URI exactly:
   `http://localhost:3000/api/auth/google/callback`
5. For deployment add `https://YOUR-PORTAL-DOMAIN/api/auth/google/callback` and set NEXT_PUBLIC_APP_URL to that origin before rebuilding/restarting.
6. Copy the client ID and secret to the server environment, then restart the app.

Google's [web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) describes offline access and state validation. For External apps in Testing, refresh tokens for Gmail/Sheets scopes generally expire after seven days; move the consent app to Production for ongoing use and complete verification if Google requires it. See [token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

## 3. Connect Gmail and Sheets

Staff sign in to the portal with their configured email and password. Google authorization is available only inside the authenticated **Google Integrations** page and is used for Gmail/Sheets access. Connecting a Google account never creates a staff session or grants that Google account portal access.

1. Sign in using ADMIN_EMAIL and ADMIN_PASSWORD.
2. Open **Google Integrations → Connect Google**. Select your admissions Gmail and grant both permissions.
3. Click **Create admissions spreadsheet** for a new Google spreadsheet with Registrations and Applications tabs, or paste existing spreadsheet URLs/IDs and save.
4. Set the admissions notification recipient. Choose **Connected Gmail account**, then save connections.
5. Open **Email Center** and send a test to your own email. Inspect its job status and provider message ID.

The Sheets API writes actual values. Column A is `referenceNo`; retries update existing references instead of appending duplicate rows. Use a dedicated portal-export tab. Per-form spreadsheet overrides are available in Forms Studio. Disabling a form's auto-sync stops immediate writes for that override; manual sync is still available. A failed API call never marks a submission synced.

A form's enabled separate-sheet setting takes priority over the shared admissions spreadsheet. Google Integrations lists those overrides. Turn the separate-sheet setting off in Builder to inherit the shared spreadsheet. The form's Responses page shows its current destination and provides an Open Sheet link. Use **Sync to Google Sheet** there to copy existing responses after changing destinations; new responses use the current destination automatically. The synced count on that page refers to the current sheet, rather than a previous destination.

See Google's [Sheets append reference](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append) and [Gmail sending guide](https://developers.google.com/workspace/gmail/api/guides/sending).

## 4. Optional SMTP

In **Email Center**, enter the host, port, username, app password, sender name/email and save. The save button selects SMTP as the sender. For Gmail SMTP use smtp.gmail.com, 587, STARTTLS (implicit TLS off). You can use port 465 with implicit TLS on. Enter a Google App Password rather than your Google account password; App Password availability depends on the account's security settings. [Google App Password instructions](https://support.google.com/accounts/answer/185833).

Click **Verify saved SMTP connection**, then send a test notification. Blank password on later saves keeps the encrypted saved password. Switch back to Gmail in Google Integrations whenever needed.

## 5. Plan a workshop and create the form

1. Open **Workshops → Plan workshop**. Select the intake and enter title, venue/address, future start/end, capacity and optional booking deadline/Google Maps URL. Times are entered in the browser's local timezone and saved in UTC.
2. Open **Forms Studio → Create New Form**. Choose Registration, Application or Workshop RSVP; enable **Require workshop selection** if wanted.
3. In **Builder → Workshop choices**, enable booking, choose whether it is mandatory, and choose allowed workshops. Selecting none means all available workshops for the same intake. Save Form.
4. Keep name, email, NIC and phone fields. Existing canonical field IDs work directly; newly designed questions can use Identity mapping in Builder.
5. Share the public form URL. Students select a workshop and submit. Closed/past/deadline-expired workshops are excluded. The server checks capacity before committing a booking; a rejected booking does not leave a partial student/application behind.
6. Dashboard shows actual registration/application totals, today's applications, form response counts and workshop booking totals. Workshops lists booked students. Students can use their registration or application reference on `/status` to view their progress, bookings and notification state.

NIC, normalized email and mobile identify a canonical student. A student can have one registration and one application per intake. Cloning a form does not bypass those rules. Conflicting identities return a useful HTTP 409 instead of being merged. Registration and application forms are separate steps; a direct custom application can create its associated registration. Notification/job keys suppress repeat notifications for accepted submissions.

## 6. Background processing and tracking

Successful submissions acknowledge their saved database transaction immediately; provider calls run independently. Start `npm run worker` alongside the app for continuous dispatch. The worker calls `/api/cron/process-queue` using `CRON_SECRET`, waits for each request to finish, and polls again after two seconds on success and backs off after repeated errors. Keep both app and worker running. The worker secret must be a real private value, not the example placeholder.

For serverless hosting, configure a scheduler to POST **every minute** to `/api/cron/process-queue` with `Authorization: Bearer YOUR_CRON_SECRET`; allow at least 60 seconds for that function. The worker handles saved jobs, retries and 3-day / 1-day workshop reminders. Sheet jobs for the same destination are batched (up to 100 jobs and about 1 MB per batch). Persisted account-wide pacing limits Sheets batches and email sends even when workers overlap. The Email Center reports when the worker has not checked in recently. A stopped worker leaves jobs queued rather than claiming they were sent.

The queue records queued, sending, sent, blocked, failed and uncertain states. Sent means Gmail or SMTP accepted the message; it does **not** prove inbox delivery or opening. Gmail sending uses only gmail.send, not mailbox-reading permission. Provider timeouts/expired email leases are marked uncertain to avoid automatic duplicate sends. Check Gmail Sent/provider logs before manually retrying those jobs. Never clear an uncertain job without reviewing it.

Personal Gmail can block sending above 500 emails per day. With one applicant confirmation and one admin alert per registration, 300 registrations can request 600 emails. Registration acceptance and Sheet export remain independent of this limit; use a sender with sufficient sending capacity for production. See [Google's sending limits](https://support.google.com/mail/answer/22839) and [Sheets quotas](https://developers.google.com/workspace/sheets/api/limits).

## 7. Existing external Google Forms (optional)

In Builder enable Google Form, save its public URL, response spreadsheet URL and tab. **Save Form**, then copy the generated Apps Script, paste it in the Google Form's Apps Script project and add an installable On form submit trigger. The script sends a stable responseId and webhook secret. Google question titles must match the portal question labels or IDs; use a `workshopId` answer carrying the portal workshop UUID when booking from an external form. Using the native portal form is the easiest way to display current capacity automatically.

External Google Forms webhooks require a publicly reachable HTTPS portal; Google cannot send webhooks to your localhost server. Gmail sending and Sheets exports can be tested locally after OAuth setup.

Manual **Sync latest Google Form responses** reads real rows from the configured response spreadsheet. It returns imported/skipped/error counts and row-level correction messages. There are no simulated Google respondents. Avoid editing previously imported raw rows; identity checks still prevent duplicate applications, but corrected records should be handled by admissions staff.

## Validation and operation

`npm test`, `npx tsc --noEmit`, and `npm run build` validate the code. Live OAuth authorization, SMTP delivery and Google API access require your real credentials and consent; automated tests stub external providers so they never email real applicants.

`npm run test:load` starts its own localhost server on port 3101 with a fresh data directory/build cache under `.data/load-tests/`. It tests 300 concurrent registrations, 50 retries, duplicate identities, workshop capacity and concurrent applications without contacting Google or sending emails. It never targets the live portal. See [the concurrency audit](CONCURRENCY_AUDIT.md) for measured results and production limits.

On this Windows machine the global npm shim points to a missing npm-cli.js. The installed Node.js npm works: use `& 'C:\Program Files\nodejs\npm.cmd' run dev` (or `test` / `run build`). With existing dependencies, `node node_modules/next/dist/bin/next dev` also starts the portal.


## Error recovery and first production initialization

See [the implementation and operating guide](ERROR_HANDLING_IMPLEMENTATION.md) for safe error codes, blocked-job repair, diagnostics, backups and validation. For a deliberately new empty production store, temporarily enable ALLOW_DATABASE_INITIALIZE during first setup, persist the state, then disable it. Never enable it to resolve missing existing records. Google Form response-sheet imports support up to 500 rows per operation; marks imports support up to 5,000 rows and 5 MB per file.
