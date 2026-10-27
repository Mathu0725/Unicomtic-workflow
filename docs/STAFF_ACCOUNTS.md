# Staff accounts

Open **System Settings → Admin users & roles → Create user**. Enter the staff member's name, email, password and role, then choose **Create staff user**. Share the credentials securely with the intended staff member. The portal does not send an invitation email.

Only the configured Super Admin can create staff accounts. Available roles:

| Role | Access |
| --- | --- |
| Admissions Officer | Admissions modules and settings; cannot create staff users |
| Entrance Desk | Workshops, bookings, attendance and student IDs |
| Examiner | Exams, marks import, eligibility and interviews |

New users sign in at `/login`. Entrance Desk users land on Attendance, examiners on Exams, and admissions officers on the dashboard. A saved return URL is honored only when it belongs to an allowed admin module for that role.

Passwords must contain 12–128 characters. The server stores a unique random salt and a versioned scrypt hash using `N=32768, r=8, p=3`, following the [OWASP scrypt guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). Passwords and password hashes are excluded from account responses and audit entries. Password fields are cleared when the creation form closes or creation succeeds and are never saved as browser drafts.

Accounts persist in the server-only `platform_state.data.staffAccounts` array through the existing durable repository and compare-and-swap contract. Older snapshots without this array hydrate to an empty list; existing admissions records and the server administrator remain intact. No SQL schema migration or Supabase Auth account is required. The `platform_state` table must retain its server-only grants and RLS protection.

`ADMIN_EMAIL` / `ADMIN_PASSWORD` continue to configure the bootstrap Super Admin. Connecting Gmail or Sheets does not create a staff account. Account editing, removal and password reset are separate features; this change implements creation and sign-in.

Verification: `node scripts/test.mjs tests/integration/staff-users.test.ts` checks durable saves, credential redaction, duplicate prevention, concurrent creation, role authorization, sign-in, safe redirects and compatibility with older snapshots. These tests use isolated temporary local storage and never create users in the live project.
