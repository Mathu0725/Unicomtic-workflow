# Supabase database setup

The local portal is connected to Supabase project `iwipyqxxeqrmirqqwlxd`. See the [26 October 2026 verification record](DATABASE_SETUP_2026-10-26.md).

## Runtime storage

`public.platform_state`, row `admissions`, is the authoritative repository for every current portal module. Forms, responses, students, registrations, applications, workshops, marks, interviews, settings, encrypted integration configuration, submission receipts and notification jobs commit together through `save_platform_state`.

The function checks the version to prevent one request from overwriting another. The server handles conflicts and submission retry receipts. An uncertain acknowledgement is resolved using the original submission key.

The normalized tables from migrations 001–005 are legacy schema with their original default templates. They are not populated automatically from the runtime aggregate. Look in `platform_state` or use the portal to check current admissions data; an empty legacy `registrations` table does not mean current registrations were lost.

## Migrations and access

All eight files in `supabase/migrations/` have been applied and recorded in `supabase_migrations.schema_migrations`:

- 001–005: original normalized schema, policies, templates and form support.
- 006: authoritative versioned repository and atomic save function.
- 20261026040711: snapshot validation, restricted grants and function hardening.
- 20261026043245: removal of the two obsolete unrestricted staff-write policies.

All 28 application tables have RLS enabled. `anon` and `authenticated` have no table grants. The save function is callable only by the server's `service_role`; it uses `SECURITY INVOKER` and an empty search path. The canonical table grants only SELECT, INSERT and UPDATE to that role. Staff permissions are checked by Next.js.

Supabase's informational **RLS Enabled No Policy** note for `platform_state` is expected: browser access is denied and the server key bypasses RLS. Do not add a public policy just to remove this note.

For a new project, review and apply the migration files in order through an authenticated migration workflow. Never rerun the original policy migrations over an existing installation. Create a new migration with the Supabase CLI for future changes.

## App configuration

The ignored `.env.local` contains the real URL and existing project keys:

```env
NEXT_PUBLIC_SUPABASE_URL=https://iwipyqxxeqrmirqqwlxd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<existing publishable key>
SUPABASE_SERVICE_ROLE_KEY=<existing server secret key>
```

Only the publishable key is suitable for browser code. Keep the server key out of `NEXT_PUBLIC_` variables and source control. The existing environment variable names accept the new key formats.

## Verify, import and back up

```bash
npm run db:check
npm run backup:supabase
```

`db:check` verifies the server connection, rejects an invalid repository version and checks that the project's public API key cannot read the snapshot or invoke its save function. It prints only counts, version and a canonical SHA-256 digest.

`backup:supabase` backs up the current **admissions snapshot**, rereads the file and verifies its SHA-256 manifest under `.data/backups/`. It does not back up Supabase Auth, Storage or every database table. Use the database backup procedure for those.

For a deliberate first import from local storage, stop the app and worker, configure the destination environment, then run:

```bash
npm run db:import:local -- --project-ref iwipyqxxeqrmirqqwlxd
```

The importer locks the local snapshot, verifies a backup, initializes only a missing cloud repository and compares the complete cloud copy using canonical JSON hashing. An identical repeated import does nothing. Different existing cloud data is refused; it is never overwritten. Keep the app stopped if the result is unconfirmed.

The original `.data/platform.json` remains as the pre-cutover source and is no longer the live store. Preserve `.data/secret.key` securely: this development installation still uses it for sessions and decrypting existing integration credentials. Copying only the JSON snapshot to another host is insufficient. A production deployment must configure compatible secrets and verify decryption before starting workers.

On this Windows installation, use `C:\Program Files\nodejs\npm.cmd` if the global npm launcher fails. Direct commands also work: `node scripts/database-check.mjs`, `node scripts/backup-supabase.mjs` and `node node_modules/next/dist/bin/next dev`.

## SQL verification and deployment

`scripts/sql/verify-platform-state.sql` checks service-role writes, version conflicts, malformed snapshots and denial of anonymous/ordinary authenticated access. Test writes are rolled back. Run it in the authenticated SQL Editor. First-initialization/update semantics are tested only when the repository is empty; existing admissions snapshots are never replaced.

The aggregate rewrites one JSON document on each mutation. Monitor its size and contention as history grows. Normalizing runtime storage is a separate architecture change. Production-host checks, live Supabase burst testing and continuous worker/scheduler operation remain deployment tasks.
