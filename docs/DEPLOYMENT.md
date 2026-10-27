# Deployment and Operations Guide — Unicom TIC Platform

## 1. Hosting Architecture
- **Existing Website**: Unaltered. The existing Unicom TIC website retains its current hosting and domain (e.g. `unicomtic.org`).
- **New Admissions Portal**: Hosted separately on a dedicated subdomain (e.g. `apply.unicomtic.org`) or dedicated cloud cluster.
- **Backend Database**: Supabase PostgreSQL with automated daily backups and point-in-time recovery.

## 2. Environment Variables Checklist
Configure the following in your production environment (Vercel, AWS ECS, or Docker):

| Variable | Description | Example |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | Canonical portal URL | `https://apply.unicomtic.org` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project API URL | `https://xyzproject.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public client Anon key | `eyJhbG...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged key | `eyJhbG...` |
| `SMTP_HOST` | Outgoing SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | Outgoing SMTP port | `587` |
| `SMTP_USER` | SMTP authentication user | `admissions@unicomtic.org` |
| `SMTP_PASS` | SMTP application secret | `your-secure-app-password` |
| `SMTP_FROM_NAME` | Default sender display name | `Unicom TIC Admissions` |
| `SMTP_FROM_EMAIL` | Default sender email | `admissions@unicomtic.org` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service Account for Sheets | `sync@project.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Service Account RSA private key | `"-----BEGIN PRIVATE KEY-----\n..."` |
| `GOOGLE_REGISTRATIONS_SHEET_ID`| Google Sheet ID for registrations| `1A2B3C...` |
| `GOOGLE_APPLICATIONS_SHEET_ID` | Google Sheet ID for applications | `9Z8Y7X...` |
| `CRON_SECRET` | Scheduled background worker key| `your_random_secret_token` |

## 3. Production Deployment Commands

### Standalone Node.js / Docker
```bash
# Build production bundle
npm run build

# Start production server
npm run start
```

### Background Cron Job Setup
Set up a recurring cron (every 15 minutes) calling:
```bash
curl -X POST https://apply.unicomtic.org/api/cron/process-queue \
  -H "Authorization: Bearer your_random_secret_token"
```
This triggers the queue worker to process retryable email dispatches and send workshop reminders.
