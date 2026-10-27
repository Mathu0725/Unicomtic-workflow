# SMTP Integration Architecture & Email Service Guide

## 1. Overview
The platform contains a dedicated, modular email gateway (`src/lib/email/smtp-client.ts`) designed to support:
- Multiple outbound SMTP accounts (e.g. Gmail, Google Workspace SMTP Relay, Amazon SES, or custom university mail servers).
- Secure secret management (passwords stored in environment or encrypted in database, masked in all UI responses).
- Real-time connection testing (`verifySmtpConnection`) with test email dispatch directly from the admin UI.
- Connection pooling and TLS encryption.
- Background retry worker with exponential backoff and persistent job statuses (`queued`, `sending`, `sent`, `failed`).
- Pre-flight template variable interpolation and missing variable detection (`src/lib/email/template-engine.ts`).

## 2. Integrating the Existing SMTP Application
When the project owner provides the existing SMTP application source code or repository:

1. **API / Microservice Integration**:
   - If the existing SMTP application exposes an HTTP/REST interface (e.g. `POST /api/send`), update `src/lib/email/smtp-client.ts` to forward queue payloads to that endpoint with the configured authentication token.
2. **Direct SMTP Server Integration**:
   - If the existing application runs as an internal SMTP relay daemon, configure its host (e.g. `localhost` or internal cluster IP) and port in the Admin Email Center (`/admin/email`).
3. **Module / Package Integration**:
   - If provided as an npm library or Node package, import it directly into `src/lib/email/smtp-client.ts` without altering client-facing API interfaces.

## 3. Template Variables
The following variables are supported and validated before dispatch:
- `{{student_name}}`: Candidate full name
- `{{reference_no}}`: Registration reference (e.g. `REG-25-KPD78`)
- `{{application_url}}`: Direct application completion link
- `{{workshop_title}}`: Name of scheduled workshop
- `{{workshop_datetime}}`: Formatted date and time
- `{{venue}}`: Workshop location name
- `{{address}}`: Workshop physical address
- `{{google_maps_url}}`: Direct Google Maps directions link
- `{{student_exam_id}}`: Unique assigned student/exam ID (`TIC-2025-XXXX`)
- `{{district}}`: Student's administrative district
