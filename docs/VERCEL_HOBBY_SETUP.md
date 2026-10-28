# Vercel Hobby + Supabase — deployment setup

இந்த project-க்கு Vercel Hobby-ஐ hosting ஆக பயன்படுத்தலாம். Database ஏற்கனவே Supabase-ல் உள்ளது. Gmail/Sheets jobs application save ஆனதும் durable queue-ல் இருக்கும். Supabase Cron ஒவ்வொரு நிமிடமும் queue endpoint-ஐ அழைக்கும்; queue backlog, Gmail daily allowance, provider retry ஆகியவற்றைப் பொறுத்து dispatch நேரம் மாறும். இது instant delivery guarantee அல்ல.

Vercel Hobby native cron ஒரு நாளில் ஒருமுறை மட்டுமே அனுமதிக்கிறது. அதனால் `vercel.json`-ல் minute cron சேர்க்கப்படவில்லை. Supabase Cron பயன்படுத்துகிறோம். Sources: [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Supabase Cron](https://supabase.com/docs/guides/cron).

## Production activation — 2026-10-28

`https://uticx.com`-க்கு Supabase Cron activate செய்யப்பட்டுள்ளது. Applied migration `20261028043408_enable_admissions_queue_extensions` enables `pg_cron` and `pg_net`; the latter is installed in `extensions`. Vault holds the named production origin and worker credential. No secret value is stored in this repository or the cron command.

Job `admissions-notification-queue` invokes the protected queue endpoint every minute. Two consecutive scheduled HTTP responses returned 200. The first run completed at 10:06:28 Sri Lanka time and cleared the six waiting jobs: four emails, including two secure access links, and two spreadsheet exports. Gmail confirmed acceptance; this is not proof of inbox placement. The next run did not resend completed messages. Application access still requires the candidate's private email link; links are created at dispatch and expire 30 minutes later.

For a future domain or worker-secret change, update both Vercel and the named Vault values, check the protected endpoint in read-only mode, then verify cron HTTP responses and worker completion. Do not publish Vault values, outgoing request headers or applicant records in diagnostics.

## 1. Vercel project

1. இந்த source-ஐ private Git repository-ல் வைத்து Vercel-ல் import செய்யுங்கள், அல்லது Vercel CLI மூலம் இந்த folder-ஐ link செய்யுங்கள்.
2. Framework: **Next.js**. Node.js: **24.x**. Build: `npm run build`. Install: `npm ci`.
3. Project-ன் final production domain / `.vercel.app` origin-ஐ தேர்வு செய்யுங்கள். Example: `https://your-portal.vercel.app`. Preview deployment URL பயன்படுத்தாதீர்கள்.
4. Production environment variables-ஐ கீழே உள்ளபடி configure செய்து deploy/redeploy செய்யுங்கள். Preview environment-க்கு live database keys/provider credentials கொடுக்காதீர்கள்; separate staging database பயன்படுத்துங்கள்.

`vercel.json` மற்றும் `.vercelignore` சேர்க்கப்பட்டுள்ளன. `.data`, local env files, node_modules, generated builds CLI upload-ல் சேராது. Filesystem-based admissions storage Vercel-ல் பயன்படுத்தப்படாது. [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

`npm run build` முடிவில் deployment trace preparation + verification தானாக இயங்கும். Local records, backups, secret key மற்றும் env files trace dependency-ல் இருந்தாலும் அவை deployment file list-லிருந்து நீக்கப்பட்டு மீண்டும் verify செய்யப்படும். Original local files delete செய்யப்படாது. இது Windows folder names-ல் parentheses இருந்தாலும் வேலை செய்கிறது.

## 2. Environment variables

Vercel → Project → Settings → Environment Variables → Production:

| Variable | Value / purpose |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Final HTTPS origin, path/query இல்லாமல் |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing project URL from local configuration |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing public project key |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server key; never use `NEXT_PUBLIC_` prefix |
| `ADMIN_EMAIL` | `unicomtic2026@gmail.com` |
| `ADMIN_PASSWORD` | Unique administrator password, at least 12 characters |
| `APP_SECRET` | Stable random signing secret, at least 32 characters |
| `APP_DATA_KEY` | Existing credential encryption key — see next section |
| `CRON_SECRET` | Separate random scheduler secret, at least 32 characters |
| `GOOGLE_CLIENT_ID` | Existing OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Existing OAuth client secret |
| `ALLOW_DATABASE_INITIALIZE` | `false` |
| `ALLOW_LOCAL_STORAGE` | `false` |
| `SEED_DEMO_DATA` | `false` |

Gmail API பயன்படுத்தினால் SMTP variables தேவையில்லை. SMTP provider-ஐ தேர்வு செய்திருந்தால் அதன் configuration-ஐயும் copy செய்யுங்கள். `WORKER_APP_URL` Vercel-ல் தேவையில்லை. `npm run worker` என்பது தனியாக இயங்கும் server/process-க்கு மட்டும்.

Existing database-ஐ initialize/import செய்ய மீண்டும் முயற்சி செய்ய வேண்டாம். Existing records authoritative `platform_state` row-ல் உள்ளன.

### Existing Google connection-ஐ preserve செய்வது

இந்த installation-ன் saved tokens, `.data/secret.key`-ல் இருக்கும் 64-character hexadecimal AES key மூலம் encrypt செய்யப்பட்டுள்ளன. அந்த file-ஐ local editor-ல் திறந்து, அதன் value-ஐ Vercel server variable **`APP_DATA_KEY`**-ல் பாதுகாப்பாக copy செய்யுங்கள். Key-ஐ chat, screenshot, Git அல்லது document-ல் சேர்க்க வேண்டாம். அதன் value-ஐ மீண்டும் hash செய்ய வேண்டாம்.

`APP_SECRET` sessions/links-க்கு; `APP_DATA_KEY` saved Google/SMTP credentials-க்கு. புதிய APP_SECRET set செய்தாலும் existing Google connection-ஐ இந்த data key மூலம் படிக்கலாம். வேறு installation ஏற்கனவே APP_SECRET மூலம் encrypt செய்திருந்தால், அதே APP_SECRET-ஐ preserve செய்யுங்கள்; வேறு raw key-ஐ ஊகித்து set செய்யாதீர்கள்.

Keys configure ஆன environment-ல் `npm run deploy:check` இயக்குங்கள். `SAVED_CREDENTIALS` pass ஆக வேண்டும். இந்த check provider-க்கு email/Sheets write அனுப்பாது. Production env file-ஐ local-ல் வைத்தால் `.env.production.local` போன்ற ignored file மட்டும் பயன்படுத்துங்கள்; local `.env.local` values-ஐ overwrite செய்ய வேண்டியதில்லை.

## 3. Google Cloud Console

OAuth client → Authorized redirect URIs-ல் கீழே உள்ள URI சேர்க்கவும்:

```text
https://your-portal.vercel.app/api/auth/google/callback
```

Actual production origin-ஐ பயன்படுத்துங்கள். Existing localhost callback-ஐ development-க்கு வைத்திருக்கலாம். Google consent app Testing mode-ல் இருந்தால் admissions Gmail-ஐ Test user ஆக வைத்திருக்க வேண்டும்; consent/testing restrictions மற்றும் refresh-token expiry-ஐ கவனிக்கவும். Domain மாற்றினால் callback + NEXT_PUBLIC_APP_URL + Vault origin அனைத்தையும் update செய்யுங்கள். Existing [Google setup guide](GOOGLE_ADMISSIONS_SETUP.md)-யும் பார்க்கவும்.

## 4. Deploy பிறகு read-only verification

Production variables configure ஆன shell-ல்:

```bash
npm run deploy:check -- --remote
npm run db:check
```

`--remote` checks `/api/health/ready` மற்றும் authenticated `/api/cron/process-queue?check=1` மட்டும். Queue dispatch செய்யாது. Redirects follow செய்யாது. எல்லா checks-மும் pass ஆன பிறகு scheduler enable செய்யுங்கள். Function-க்கு Fluid Compute மற்றும் குறைந்தது 120-second duration கிடைப்பதை உறுதி செய்யுங்கள்; இந்த route `maxDuration = 120` export செய்கிறது. [Function limits](https://vercel.com/docs/functions/limitations).

## 5. Supabase Cron setup

1. Supabase Dashboard → Integrations → Cron enable செய்யுங்கள் (`pg_cron`). Database → Extensions-ல் `pg_net` enable செய்யுங்கள்; installation schema `extensions` தேர்வு செய்யுங்கள். Existing extensions-ஐ drop/recreate செய்ய வேண்டாம்.
2. Supabase Vault UI-ல் இரண்டு named secrets உருவாக்குங்கள்:
   - `admissions_app_url`: final HTTPS origin, trailing slash இல்லாமல்.
   - `admissions_cron_secret`: Vercel-ல் set செய்த அதே CRON_SECRET.
3. [schedule-admissions-queue.sql](../scripts/sql/schedule-admissions-queue.sql)-ஐ SQL Editor-ல் project administrator ஆக review செய்து run செய்யுங்கள். இது ஒரே named job-ஐ minute schedule-ல் உருவாக்கும்/update செய்யும். Secret value cron command-ல் embed செய்யப்படாது; Vault-ல் இருந்து request நேரத்தில் படிக்கப்படும்.
4. இது **real queued messages, Sheets exports மற்றும் workshop reminders-ஐ dispatch செய்யும்**. Enable செய்வதற்கு முன் Email Center-ல் pending recipients/jobs-ஐ review செய்யுங்கள்.
5. 2–3 minutes பிறகு portal → System health-ல் worker last seen/completed மற்றும் queue counts பார்க்கவும்.

மேலே உள்ள activation record தற்போதைய production setup-ஐக் குறிப்பிடுகிறது. புதிய environment-க்கு Supabase administrator access மற்றும் deployed URL தேவை. Vault/net/cron schemas-ஐ public Data API exposure-ல் சேர்க்காதீர்கள். Vault decrypted views / outgoing request headers-க்கு client-role grants கொடுக்காதீர்கள். [Vault](https://supabase.com/docs/guides/database/vault), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).

Overlapping cron requests வந்தால் durable lease காரணமாக அடுத்த request `skipped: true` என முடியும். Process இறந்தால் lease 3 minutes-ல் expire ஆகும். ஒவ்வொரு job-க்கும் existing lease/retry rules தொடரும்: uncertain email தானாக resend ஆகாது; Sheets references reconcile செய்யப்படும். A completed worker run means the queue attempt finished; provider failures remain visible on individual jobs.

Portal daily allowance 500 ஆக இருந்தால், ஒரு registration-க்கு student + admin என்று இரண்டு emails அனுப்பும்போது 300 registrations = 600 emails ஆகும். Remaining jobs allowance கிடைக்கும் வரை queue-ல் இருக்கும்; registrations மற்றும் Sheets exports தனியாக save/process ஆகும். Email Center-ல் allowance மற்றும் pending jobs பார்க்கவும்.

### Scheduler failure check

Cron → Job history-ல் SQL success என்பது HTTP request enqueue ஆனதை மட்டும் காட்டலாம். HTTP response status-ஐயும் பார்க்க வேண்டும்:

```sql
select id, status_code, timed_out, created
from net._http_response
order by created desc
limit 20;
```

`401`: Vercel/Vault secrets match ஆகிறதா பார்க்கவும். `503`: deployment configuration / database / safe error code பார்க்கவும். `404` அல்லது redirect: production origin/path சரிபார்க்கவும். Deployment protection HTTP request-ஐ block செய்தால் production access settings-ஐ சரிசெய்யவும். Raw headers/Vault secrets-ஐ logs-ல் காட்ட வேண்டாம். pg_net HTTP response retention default 6 hours; portal-ல் durable worker timestamps மற்றும் safe last failure code இருக்கும்.

Job-ஐ நிறுத்த:

```sql
select cron.unschedule('admissions-notification-queue');
```

## 6. Files, backups மற்றும் capacity

Document / marks uploads இப்போது **4 MB** வரை. Multipart overhead உடன் Vercel-ன் 4.5 MB request limit-க்குள் இருக்க இந்த limit பயன்படுத்தப்படுகிறது. Existing Drive files/records மாற்றப்படவில்லை.

Admissions backup commands:

```bash
npm run backup:supabase
npm run backup:verify -- ".data/backups/<backup-file>.json"
```

JSON + matching `.sha256` file இரண்டையும் encrypted off-machine storage-ல் retain செய்யுங்கள்; credential data key-ஐ தனியாக பாதுகாக்கவும். Vercel filesystem-ல் backups schedule செய்ய வேண்டாம். இந்த phase local verified backup/verification command சேர்க்கிறது; off-machine automatic backup schedule மற்றும் isolated full restore drill இன்னும் configure செய்யப்படவில்லை.

300-user isolated local HTTP test passed. இது Vercel + real Supabase performance guarantee அல்ல. Current repository ஒவ்வொரு mutation-லும் aggregate JSON-ஐ read/write செய்கிறது. Representative historical data உடன் separate staging database/deployed host-ல் burst test செய்து latency/CAS retries பார்த்த பிறகு public intake திறக்க வேண்டும். Live admissions database-ல் load-test data உருவாக்காதீர்கள்.

Production deployment மற்றும் scheduled live dispatch மேலே குறிப்பிட்டபடி verify செய்யப்பட்டுள்ளன. Hosted burst validation இன்னும் செய்யப்படவில்லை; 300-user result isolated local HTTP test-க்கு மட்டுமே பொருந்தும்.
