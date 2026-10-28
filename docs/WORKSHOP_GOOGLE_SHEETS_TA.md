# Workshop bookings → தனித்தனி Google Sheet tabs

## பயன்படுத்தும் முறை

1. **Google Integrations**-ல் admissions Google account connect ஆகியிருக்க வேண்டும். அந்த account-க்கு Editor access உள்ள spreadsheet-ஐ பயன்படுத்துங்கள்.
2. **Workshops → Plan workshop** மூலம் session உருவாக்குங்கள். ஏற்கனவே உள்ள workshop-க்கும் இந்த வசதியை பயன்படுத்தலாம்.
3. Workshop card-ல் **Connect Google Sheet** திறக்கவும். Spreadsheet URL / ID உள்ளிட்டு **Check spreadsheet & load tabs** அழுத்தவும். தேவையெனில் **Create a new spreadsheet** மூலம் புதிய file உருவாக்கலாம்.
4. **Workshop tab name**-ல் அந்த workshop-க்கு தனியான பெயர் கொடுக்கவும். Workshop பெயர் + ID அடிப்படையில் ஒரு பெயர் தயாராக இருக்கும்; அதை மாற்றலாம். Existing tabs பட்டியலில் dedicated workshop tab இருந்தால் தேர்வு செய்யலாம்.
5. **Automatically sync new bookings and attendance updates** On வைத்தால் புதிய bookings, attendance, application reference மற்றும் email corrections queue மூலம் sync ஆகும்.
6. **Sync existing bookings when saving** On வைத்தால் ஏற்கனவே book செய்தவர்களும் சேர்க்கப்படுவார்கள். **Save Sheet connection** அழுத்தவும்.
7. **Sync all bookings** மூலம் பின்னர் மீண்டும் export செய்யலாம். அதே booking ID இருந்தால் row update ஆகும்; புதிய duplicate row உருவாக்குவதில்லை.

| Workshop | Spreadsheet | Tab — உதாரணம் |
| --- | --- | --- |
| Workshop A | Admissions spreadsheet | Workshop A - session-id |
| Workshop B | அதே Admissions spreadsheet | Workshop B - session-id |
| Workshop C | வேறு spreadsheet தேர்வு செய்யலாம் | Workshop C - session-id |

ஒரே spreadsheet-ல் பல workshop tabs வைத்துக்கொள்ளலாம். ஒவ்வொரு workshop-க்கும் வேறு spreadsheet பயன்படுத்துவதும் சாத்தியம். இரண்டு workshops ஒரே tab-ஐ பயன்படுத்த அனுமதிக்கப்படாது; disabled workshop-ன் configured tab-மும் reserved ஆக இருக்கும். Form responses பயன்படுத்தும் tab-ஐ workshop-க்கு தேர்வு செய்ய முடியாது.

## Sheet-ல் வரும் விவரங்கள்

- Workshop பெயர், intake, தேதி/நேரம், venue/address.
- Applicant பெயர், initials, email, phone, WhatsApp, NIC, district/province.
- Registration reference; application இருந்தால் application number.
- Booking status மற்றும் booking நேரம்.
- Attendance status, attendance mark செய்த நேரம், Student/Exam ID இருந்தால் அது.
- Booking வந்த form பெயர் மற்றும் form ID.

`referenceNo` (column A), `bookingId`, `workshopId` ஆகியவை sync identity columns. இங்கே `referenceNo` என்பது internal booking ID; applicant-ன் REG number `registrationRef` column-ல் இருக்கும். Identity columns-ஐ rename/change செய்ய வேண்டாம். Contact details உள்ளதால் spreadsheet sharing-ஐ தேவையான staff-க்கு மட்டும் கொடுங்கள். Secure access tokens மற்றும் uploaded documents இந்த export-ல் வராது.

Portal உருவாக்காத additional columns-ல் staff எழுதிய values, existing booking row update செய்யும்போது பாதுகாக்கப்படுகின்றன. Existing tab-ல் வேறு workshop / form records இருந்தால் export நிறுத்தப்பட்டு error காட்டப்படும்; அந்த records overwrite செய்யப்படாது. வரலாற்றில் கைமுறையாக duplicate செய்யப்பட்ட rows தானாக delete செய்யப்படுவதில்லை.

## Sync எப்போது நடக்கும்?

Booking மற்றும் export job ஒரே database transaction-ல் save ஆகின்றன. Google தற்காலிகமாக unavailable ஆனாலும் booking save ஆகும். Existing protected worker பொதுவாக ஒவ்வொரு நிமிடமும் due jobs-ஐ process செய்கிறது; backlog, Google quota மற்றும் retry காரணமாக actual sync தாமதமாகலாம்.

ஒவ்வொரு workshop card-லும் **synced / pending / need attention** count மற்றும் last sync நேரம் இருக்கும். **Export activity** அந்த workshop-ன் Google Sheets jobs-ஐ filter செய்து காட்டும்.

- **Auto-sync Off**: புதிய changes தானாக queue ஆகாது; **Sync all bookings** பயன்படுத்தலாம்.
- **Enable connection Off**: புதிய exports நிற்கும்; spreadsheet-ல் ஏற்கனவே உள்ள rows பாதுகாக்கப்படும்.
- **Destination மாற்றினால்**: புதிய settings-க்கு version உருவாகும். பழைய destination jobs நிறுத்தப்படும்; புதிய destination-க்கு existing bookings sync செய்யலாம். பழைய spreadsheet rows delete செய்யப்படாது.
- **Export நடக்கும்போது settings change**: in-flight export முடியும் வரை destination மாற்ற அனுமதிக்கப்படாது.
- **Cancelled booking**: booking record இருந்தால் அதன் status-உடன் row இருக்கும்; manual resync அதை update செய்யும். இந்த feature புதிய cancellation workflow உருவாக்குவதில்லை.

Google Sheets sync மற்றும் applicant/staff email settings தனித்தனியாக இயங்குகின்றன. Email allowance முடிந்ததால் workshop export நிற்காது.

## Error வந்தால்

| நிலை | செய்ய வேண்டியது |
| --- | --- |
| Connect Google first | Google Integrations-ல் account reconnect செய்யவும் |
| Editor access இல்லை | Spreadsheet-ஐ connected account-க்கு Editor access கொடுக்கவும் |
| Another workshop / form uses this tab | Workshop-க்கு வேறு dedicated tab பெயர் கொடுக்கவும் |
| Tab contains other records / ID columns changed | புதிய காலியான tab பயன்படுத்தவும், அல்லது original identity columns-ஐ மீட்டெடுக்கவும் |
| Google quota / temporary outage | Queue retry நேரம் பார்க்கவும்; booking records பாதுகாப்பாக இருக்கும் |
| Settings changed / stale version | Workshop page reload செய்து current destination review செய்யவும் |
| Repair முடிந்தும் பழைய failure | **Sync all bookings** மூலம் current records-ஐ மீண்டும் queue செய்யவும் |
| Spreadsheet creation unconfirmed | Google Drive-ல் file உருவாகியுள்ளதா பார்க்கவும்; இருந்தால் அதன் URL paste செய்யவும் |

## Technical / release notes

இந்த update existing server-only `platform_state` JSONB repository-ல் ஒவ்வொரு workshop-க்கும் optional `google_sheets_config` சேமிக்கிறது. புதிய SQL migration அல்லது environment variable தேவையில்லை. Existing Google OAuth account, encryption key, queue scheduler மற்றும் Sheets API scopes பயன்படுத்தப்படுகின்றன. Existing form Sheets destinations தானாக மாற்றப்படாது.

Queue payload-ல் workshop ID, booking ID, destination version சேமிக்கப்படுகிறது. Worker dispatch முன் current canonical booking/contact/attendance தகவல்களை எடுத்துக்கொள்கிறது; அதனால் delayed jobs பழைய details-ஐ மீண்டும் எழுதுவதில்லை. Existing global Sheets lease மற்றும் batching ஒரே export-ஐ இரண்டு workers ஒரே நேரத்தில் claim செய்வதை கட்டுப்படுத்துகின்றன. Google rows stable booking references மூலம் upsert ஆகின்றன. Sheets writes RAW strings-ஆக அனுப்பப்படுவதால் leading-zero phone/NIC values மற்றும் formula போன்ற answers பாதுகாப்பாக text-ஆக இருக்கும்.

Automated tests mock Google/SMTP transports பயன்படுத்துகின்றன. 300 concurrent bookings + 300 matching export jobs local test-ல் சரிபார்க்கப்பட்டன; இது production throughput guarantee அல்ல. Real workshop spreadsheets tests-க்காக உருவாக்கப்படவோ applicant details Google-க்கு அனுப்பப்படவோ இல்லை. Admin தேர்வு செய்து connection save செய்த பிறகே actual workshop sync இயங்கும்.

Relevant sources: `src/lib/workshops/`, `src/lib/google/sheets-service.ts`, `src/lib/google/job-target.ts`, `src/lib/jobs/outbox.ts`, `src/lib/admissions/service.ts`, `src/components/workshop-sheet-connection.tsx`, `src/app/api/admin/workshops/[id]/sheets/`.

## Verification — 28 October 2026

- Full suite: **547 tests / 52 files passed**; 36 new workshop tests included.
- TypeScript and production source build passed.
- **97 deployment traces; zero private files included.**
- Isolated production HTTP checks passed: plan two workshops, save separate tab connections, reject a shared tab, public form workshop selection, idempotent submission replay, durable bookings/export jobs, sync counts and production UI bundles.
- 300 concurrent bookings and 300 matching export jobs passed the local persistence test.
- Real Google writes / candidate test emails: **0**. Browser visual QA remains unverified because browser access is disabled; DOM interaction tests passed.
- No SQL migration, new environment variable or production settings rewrite is required.
