# Unicom TIC — Student Lifecycle Management Platform

**Vercel Hobby deployment:** [Tamil setup guide, environment migration and Supabase Cron](docs/VERCEL_HOBBY_SETUP.md). Includes a read-only `npm run deploy:check`, credential-key preservation, protected scheduler triggers and backup verification.

**Security phase 1:** [upgrade, candidate email verification and validation results](docs/SECURITY_PHASE_1.md). Status, applications and application uploads now require verified candidate access. Public registration still ends at the thank-you screen.

**Supabase database connected:** [verified setup and preserved records](docs/DATABASE_SETUP_2026-10-26.md). Use `npm run db:check` to verify access and `npm run backup:supabase` for a verified admissions snapshot backup. Current app data lives in `platform_state`.

**Personal Gmail + live admissions setup:** [setup guide](docs/GOOGLE_ADMISSIONS_SETUP.md). Includes OAuth, Gmail/SMTP sending, tracked notification jobs, real Google Sheets writes, durable records, duplicate prevention, application counters and workshop bookings. Apply migration 006 before connecting a live Supabase project.

**Concurrent submissions:** [audit and load-test results](docs/CONCURRENCY_AUDIT.md). Run `npm run worker` alongside the app for background notifications and Sheets exports. `npm run test:load` validates 300 overlapping submissions in isolated local storage.

**Error handling:** [full implementation plan](docs/ERROR_HANDLING_PLAN.md), covering confirmed gaps, priorities, recovery flows, provider failures and acceptance tests.

**Implemented error recovery:** [changes, verification and operating guide](docs/ERROR_HANDLING_IMPLEMENTATION.md). Includes safe errors, persisted Settings, marks validation, blocked jobs, diagnostics and verified local backups.

Production-oriented **Student Registration, Application, Workshop, Examination, Interview and Selection Management Platform** for Unicom TIC, built with Next.js (App Router), TypeScript, Tailwind CSS, and Supabase PostgreSQL.

---

## Key Features

1. **Stage 1 — Registration**:
   - Official 25 Sri Lankan districts selection with province mapping.
   - NIC validation (old 9 digits + V/X and new 12 digits format) and Sri Lankan phone number validation.
   - Terms & Conditions versioning acceptance.
   - Unique registration reference generation (e.g. `REG-25-XXXXX`).
   - Duplicate submission prevention.
2. **Stage 2 — Application Invitation**:
   - Configurable **Manual** and **Automatic** invitation modes per campaign.
   - Automated queue and duplicate invitation prevention.
3. **Stage 3 — Formal Application**:
   - Detailed educational background: G.C.E. O/L results, G.C.E. A/L stream & Z-score, emergency contact, statement of purpose.
   - Unique application number generation (e.g. `APP-25-XXXX`).
4. **Stage 4 — District Analytics**:
   - Geographic distribution across all 25 districts and 9 provinces of Sri Lanka.
5. **Stage 5 — Workshop Management**:
   - Multiple workshop creation per intake, venue mapping, Google Maps integration, automated 3-day / 1-day reminder scheduling.
6. **Stage 6 — Entrance Desk Attendance & Student IDs**:
   - Entrance desk rapid lookup by NIC last 4 digits, phone, or name.
   - Masked verification to prevent identity ambiguity.
   - Sequential Unique Student / Examination ID generation (`TIC-2025-XXXX`).
   - Reuses existing valid IDs for the same student within the campaign.
7. **Stage 7 — Examination Management**:
   - Configurable exam papers, max marks, pass mark thresholds, attendance prerequisite toggles.
8. **Stage 8 & 9 — OMR Marks Bulk Import & Google Forms Results**:
   - CSV and Excel file ingestion with column mapping.
   - Pre-commit row validation: detects missing IDs, duplicate rows, negative/out-of-range marks, and unmatched attendees.
   - Safe row-by-row error reporting with line numbers.
9. **Stage 10 — Eligibility Rules Engine & Shortlisting**:
   - Configurable rules: minimum exam score, attendance required, application completed, cohort capacity limit, and tie-breaking.
   - Produces qualified candidate list with ranks and disqualified candidate list with explicit reasons.
10. **Stage 11 — Interview Management**:
    - Panel assignment, candidate slots, and confidential rubric scoring (Communication, Technical, Analytical, Overall, Recommendation).
11. **Stage 12 — Final Selection & Notifications**:
    - Selection statuses: Selected, Waiting List, Unsuccessful.
    - Automated dispatch of admission offers and outcome emails.
12. **Admin Dashboard (18 Modules)**:
    - Complete suite covering Campaigns, Registrations, Applications, District Analytics, Email Center, Workshops, Entrance Desk, Exams, OMR Import, Eligibility, Interviews, Final Results, Google Integrations, Sheets Sync, Users (RBAC), Audit Logs, and System Settings.

---

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons, React Hook Form, Zod 4.
- **Backend & Database**: Supabase PostgreSQL with Row Level Security (RLS), version-controlled migrations, and REST APIs.
- **Background Processing**: Transactional outbox pattern, retry worker with exponential backoff, reminder scheduler.
- **Integrations**: Modular SMTP email gateway, Gmail API drafts, Google Sheets synchronization, Google Maps links.
- **Testing**: Vitest automated unit and integration test suite.

---

## Getting Started

### 1. Install Dependencies
Use Node.js 24 or later. The lockfile includes the official SheetJS 0.20.3 distribution.
```bash
npm ci
```

### 2. Configure Environment
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

### 3. Run Automated Tests
```bash
npm test
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser:
- Student Portal: `http://localhost:3000/`
- Student Registration: `http://localhost:3000/register`
- Formal Application: `http://localhost:3000/apply`
- Student Status Tracker: `http://localhost:3000/status`
- Staff Admin Dashboard: `http://localhost:3000/admin`

### 5. Production Build
```bash
npm run build
npm start
```

# Unicomtic-workflow
