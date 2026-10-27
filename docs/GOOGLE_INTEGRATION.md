# Google Services Integration Guide

> Current personal Gmail setup: see [Google admissions setup](GOOGLE_ADMISSIONS_SETUP.md). The portal now uses connected-user OAuth for Gmail and Sheets. The service-account instructions below describe the earlier design and are not used by the current Sheets service.

## 1. Google Sheets Integration
The platform maintains two separate Google Spreadsheets to keep records synchronized with Google Workspace:
1. **Registrations Spreadsheet**: Appends new verified student registrations with contact details, districts, and reference numbers.
2. **Applications Spreadsheet**: Appends completed educational profiles with O/L, A/L results, stream, and statement of purpose.

### Setup Instructions
1. In Google Cloud Console, create a Service Account: `unicom-sheets-sync@your-project.iam.gserviceaccount.com`.
2. Generate and download a JSON Private Key.
3. Share both target Google Spreadsheets with the Service Account email with **Editor** permissions.
4. Copy the Spreadsheet IDs from their URLs (`https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit`).
5. Configure in `.env.local` or `.env.production`:
   ```env
   GOOGLE_SERVICE_ACCOUNT_EMAIL=unicom-sheets-sync@your-project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
   GOOGLE_REGISTRATIONS_SHEET_ID=[YOUR_REGISTRATIONS_SHEET_ID]
   GOOGLE_APPLICATIONS_SHEET_ID=[YOUR_APPLICATIONS_SHEET_ID]
   ```

## 2. Gmail Drafts Integration
The platform allows staff to generate drafts in their personal/staff Gmail accounts for pre-flight manual inspection:
- Scope: `https://www.googleapis.com/auth/gmail.compose`
- Endpoint: `/api/admin/email` (`action: "create_gmail_draft"`)

## 3. Google Maps Integration
- Workshop locations store physical addresses and validated Google Maps URLs.
- Included automatically in candidate confirmation emails and attendance tickets.
