# Database setup verified — 26 October 2026

Project: `iwipyqxxeqrmirqqwlxd`.

The portal now uses the actual Supabase repository rather than local JSON storage. All eight migration files were applied and recorded. All 28 application tables have RLS enabled; public and ordinary authenticated table grants are revoked. The security advisor reports **0 errors and 0 warnings**. Its one informational note is the expected server-only snapshot with no client RLS policy.

The existing local snapshot was imported after explicit approval and compared with the cloud copy using a canonical SHA-256 digest. Preserved records include **2 forms, 1 student, 1 registration, 1 form response, 3 notification jobs**, settings and encrypted integration configuration. Repeating the import confirmed a no-op. The original local store was retained, and verified backups were created before import and from Supabase afterward.

## Verification

| Check | Result |
| --- | --- |
| Automated regression suite | 100 passed / 23 files |
| TypeScript | Passed |
| Live SQL contract | Passed; test writes rolled back |
| Anonymous and ordinary authenticated SQL access | Read/write denied |
| Server compare-and-swap and malformed inputs | Expected results |
| Snapshot import | Complete canonical digest matched |
| Repeat import | No duplicate or overwrite |
| Cloud admissions backup | File and SHA-256 manifest verified |
| Homepage, Forms Studio, health endpoint | HTTP 200 |
| Both existing public form APIs | HTTP 200 |

![Verified migrations and preserved records](validation/supabase-database-setup-2026-10-26.jpg)

The runtime source of truth remains `platform_state`. The legacy normalized tables are not a second independently updated copy of admissions data.

Existing API keys were used; no new keys were generated. Credentials are excluded from source control and reports. The temporary setup service was stopped after import. No production-host deployment or bulk email/Sheets dispatch was performed for this setup. See [operations and commands](SUPABASE_SETUP.md) for backups and remaining deployment requirements.
