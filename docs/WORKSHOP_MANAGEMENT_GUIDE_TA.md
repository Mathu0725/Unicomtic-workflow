# Workshops — பயன்படுத்தும் வழிமுறை

**Update: 30 October 2026.** Workshop management implementation மற்றும் verification வழிமுறை. எந்த version live-ல் உள்ளது என்பதை GitHub commit / Vercel deployment status மூலம் உறுதி செய்யவும்.

**எளிய flow: Workshop உருவாக்கவும் → Form-ல் attach செய்யவும் → Preview + Publish → அந்த workshop-ன் participants, reminders, Sheet-ஐ தனியாகப் பார்க்கவும்.**

## 1. Workshop உருவாக்குதல் / மாற்றுதல்

1. **Admin → Workshops → Create workshop** திறக்கவும்.
2. Intake, workshop பெயர், தேதி / நேரம், venue, address, **Total seats** கொடுக்கவும். Booking deadline optional.
3. **Confirmation & reminder settings** தேவையென்றால் திறந்து emails அமைக்கவும்.
4. Create செய்த பிறகு அந்த workshop-ஐத் திறக்கவும். **Edit workshop** மூலம் seats, date, venue, deadline மாற்றலாம்.

உதாரணம்: 35 பேர் booked என்றால் capacity-ஐ 50 → 80 மாற்றலாம்; 35-க்குக் கீழே குறைக்க முடியாது. இன்னொரு staff save செய்திருந்தால் stale edit நிராகரிக்கப்படும்; current details-ஐ reload செய்து review செய்யவும்.

**Duplicate workshop** பெயர் / venue போன்ற settings-ஐ copy செய்கிறது. புதிய date கொடுக்க வேண்டும். பழைய bookings, attendance, Sheet connection copy ஆகாது. ஆரம்பித்த session-ஐ புதிய தேதிக்கு மாற்றிப் பயன்படுத்துவதற்குப் பதிலாக duplicate செய்யவும்.

## 2. Built-in Workshop block-ஐ form-ல் சேர்த்தல்

**Forms → Builder → Workshop selection** செல்லவும்:

1. **Show workshop selection on this form** On செய்யவும்.
2. அந்த form-ன் intake-க்குரிய workshops-ஐ tick செய்யவும். இங்கேயே **Create workshop** செய்யலாம்.
3. ஒவ்வொரு attached workshop-க்கும் **Show on this form** On / Off தேர்வு செய்யவும்.
4. Workshop தேர்வு கட்டாயம் என்றால் **Applicant must select a workshop** On செய்யவும்.
5. Display label, help text, workshops இல்லாதபோது காட்டும் message, remaining seats display ஆகியவற்றை அமைக்கலாம்.
6. **Save draft → Preview → Publish** செய்யவும்.

மாற்று வழி: **Workshop → Overview → Attach to a form → Attach to draft**. இது ஏற்கனவே சேமித்துள்ள draft edits-ஐ பாதுகாத்து workshop-ஐ சேர்க்கும். **Open Builder** மூலம் preview செய்து publish செய்த பிறகே applicants-க்கு தெரியும்.

Workshop உருவாக்குவது மற்றும் form-ல் publish செய்வது இரண்டு படிகள். புதிய explicit list-ல் எதுவும் tick செய்யவில்லை என்றால் எந்த workshop-மும் வராது. பழைய “all available workshops” forms முதல் edit வரை compatibility mode-ல் தொடரும்; editor-ல் பட்டியலை review செய்து publish செய்யவும்.

## 3. எந்த switch எதற்காக?

| Control | விளைவு |
| --- | --- |
| Show workshop selection Off | அந்த form-ன் முழு workshop block மறையும்; selection required ஆகாது |
| Show on this form Off | குறிப்பிட்ட workshop அந்த form-ல் மட்டும் மறையும் |
| Workshop checkbox untick | அந்த form attachment-ல் இருந்து நீக்கும் |
| Close new bookings | அந்த workshop-க்கு எந்த form வழியாகவும் புதிய booking ஏற்காது; existing reminders தொடரும் |
| Automatic reminder emails Off | அந்த workshop-ன் scheduled reminders நிற்கும் |
| Send a confirmation Off | புதிய workshop booking confirmation mail நிற்கும் |

Hide / detach செய்வதால் ஏற்கனவே உள்ள booking, attendance, history அழியாது. Full / closed sessions தேர்வு செய்ய முடியாத நிலையில் காட்டப்படும். Required block-க்கு ஒரு bookable session-ம் இல்லையென்றால் publish ஏற்கப்படாது. பின்னர் seats நிரம்பினால் applicant பதில்கள் பாதுகாக்கப்பட்டு availability refresh செய்யலாம்.

Application form-க்கு **Open application + workshop** shortcut பயன்படுத்தினால் முன் registration / secure email link இல்லாமல் application submit செய்யலாம். **Registered applicants + workshop** பழைய registration access flow-ஐப் பயன்படுத்தும். Private tracking / documents access-க்கு இருக்கும் பாதுகாப்பு தொடரும்.

## 4. 10 workshops-ஐ தனித்தனியாகப் பார்ப்பது

Workshops பட்டியலில் ஒவ்வொரு workshop-ஐயும் திறக்கலாம். ஒவ்வொன்றுக்கும் இந்த tabs இருக்கும்:

| Tab | விவரம் |
| --- | --- |
| Overview | Seats, booked, available, attended; edit / duplicate / close; attached forms; change history |
| Participants | பெயர், phone, email, registration / application reference, source form, booking status, email / Sheet status |
| Attendance | அந்த workshop attendance மட்டும்; walk-ins மற்றும் marking history; attendance desk link |
| Reminders & emails | அந்த workshop settings, eligible recipients preview, delivery history |
| Google Sheet | அந்த workshop-க்கான தனி spreadsheet / tab connection, sync status |

**Participants**-ல் name / phone / email / reference search, booking status filter பயன்படுத்தலாம். **Export these … records** தற்போது filter செய்த records-ஐ CSV-ஆக export செய்கிறது.

**Booked participants** மற்றும் **email deliveries** counts வேறு. 35 participants-க்கு இரண்டு reminders அனுப்பினாலும் booked count 35 தான். ஒரே applicant இரண்டு workshops-ல் booked என்றால் அவருக்கு ஒவ்வொரு workshop-ன் reminders தனித்தனியாக வரலாம்.

## 5. Booking cancel / move

**Participants → Cancel / Move → Reason → Confirm** பயன்படுத்தவும்.

- Cancel ஒரு seat-ஐ release செய்கிறது; original booking, reason, staff, timestamp history-ல் இருக்கும்.
- Move அதே intake-ன் open workshop-க்கு மட்டும். Target full / closed என்றால் மாற்றம் ஏற்கப்படாது; original booking தொடரும்.
- வெற்றிகரமான move-ல் old booking cancelled / moved ஆகவும், புதிய linked booking target workshop-லும் இருக்கும். Source form தொடர்பு தொடரும்.
- Attendance அல்லது linked exam result இருந்தால் cancel / move தடுக்கப்படும்; அந்த record-ஐ admissions review செய்ய வேண்டும்.
- Cancelled registration அல்லது inactive intake-க்கு move அனுமதி இல்லை.
- Transfer confirmation target workshop-ன் confirmation setting அடிப்படையில் queue ஆகும். Cancel-க்கு தனியான cancellation email இந்த release-ல் உருவாக்கப்படவில்லை.

Repeated click / request retry மூலம் இரண்டாவது booking அல்லது மீண்டும் seat release உருவாகாது.

## 6. Email templates மற்றும் reminders

### Templates எங்கே மாற்றுவது?

**Email Center → Templates** அல்லது workshop settings-ல் **Edit shared template wording** செல்லவும்.

| Workshop setting / action | தேர்வு செய்யும் template |
| --- | --- |
| Booking confirmation | Workshop booking / Workshop details update |
| Reminder template | Workshop reminder / Workshop details update |
| Manual Date / venue update | Workshop details update |

இந்த templates shared. ஒன்றின் wording-ஐ மாற்றினால் அதை பயன்படுத்தும் workshops-ன் **புதிதாக உருவாகும்** messages-க்கு மாற்றம் பொருந்தும். ஏற்கனவே sent / queued message content தானாக rewrite ஆகாது.

**Form receipt email** form-ன் Email settings-ல் இருக்கும்; **workshop confirmation** workshop settings-ல் இருக்கும். இரண்டும் On என்றால் ஒரே submit-க்கு ஒரு form receipt மற்றும் ஒரு workshop confirmation வரலாம். தேவையானவற்றை அந்தந்த இடத்தில் தேர்வு செய்யவும்.

### Automatic reminder

**Reminders & emails → Edit email settings**:

1. **Automatic reminder emails** On செய்யவும்.
2. **Days before workshop**-ல் உதாரணமாக `3, 1` கொடுக்கவும். 1–90 நாட்கள்; அதிகபட்சம் 10 தனித்தனி values.
3. Template தேர்வு செய்து save செய்யவும்.

Existing queue scheduler due reminders-ஐ process செய்கிறது. Email account connection, sending allowance, backlog, retry காரணமாக delivery தாமதமாகலாம். Bookings close செய்தாலும் இந்த switch On என்றால் booked participants-க்கு reminders தொடரும்.

### இப்போது reminder / date change mail அனுப்புதல்

1. Workshop → **Reminders & emails** திறக்கவும்.
2. **Workshop reminder** அல்லது **Date / venue update** தேர்வு செய்யவும்.
3. **Preview recipients** அழுத்தவும்.
4. பெயர் / phone / email பார்க்கவும்; **Read message** மூலம் ஒவ்வொருவருக்கும் செல்லும் subject / text review செய்யவும்.
5. தேவையான participants மட்டும் tick செய்து **Send to … selected participants** அழுத்தவும்.

அந்த workshop-ன் confirmed, active registrations மட்டும் preview-ல் வருவார்கள். Cancelled / moved bookings சேராது. Preview 15 நிமிடங்கள் valid. Participant email, template அல்லது workshop details மாறினால் மீண்டும் preview செய்ய வேண்டும். Recent mail இருந்தால் warning தெரியும். அதே preview-ஐ retry செய்வது duplicate queue உருவாக்காது; புதிய preview + send ஒரு புதிய message action.

Date / venue மாற்றியதும் ஏற்கனவே queue ஆன பழைய workshop messages dispatch முன் தடுக்கப்படும். Current details-உடன் **Date / venue update** preview செய்து அனுப்பவும்.

**Delivery history**-ல் Pending, sent, failed / blocked / uncertain மற்றும் error / retry details பார்க்கலாம். **Sent** என்பது provider ஏற்றுக்கொண்டது; inbox-ல் வந்தது / வாசிக்கப்பட்டது என்ற உறுதி அல்ல. Uncertain mail-ஐ duplicate ஆக உடனே resend செய்யாமல் Email Center-ல் review செய்யவும்.

## 7. ஒவ்வொரு workshop-க்கும் தனி Google Sheet tab

**Workshop → Google Sheet → Connect Google Sheet**:

1. Connected Google account-க்கு access உள்ள spreadsheet URL / ID கொடுக்கவும்.
2. அந்த workshop-க்கு தனி tab பெயர் கொடுக்கவும். 10 workshops என்றால் அதே spreadsheet-ல் 10 தனி tabs வைத்துக்கொள்ளலாம்.
3. Auto-sync மற்றும் existing bookings sync தேர்வு செய்து save செய்யவும்.

Booking ID மூலம் அதே row update ஆகும். Auto-sync enabled இருந்தால் cancellation, move, date / venue edit, attendance update ஆகியவை queue ஆகும். Google error வந்தாலும் booking database-ல் பாதுகாப்பாக இருக்கும். **Sync all bookings** மூலம் current records-ஐ reconcile செய்யலாம்.

விரிவான வழிமுறை: [Workshop Google Sheets guide](WORKSHOP_GOOGLE_SHEETS_TA.md).

## 8. Verification மற்றும் release நிலை

- Automated suite: **623 tests / 56 files passed**. இதில் புதிய workshop backend / DOM checks 44 உள்ளன.
- 10 workshops-ன் participants, phone numbers, counts, delivery history isolation சோதிக்கப்பட்டது.
- Local transaction test: **300 concurrent submissions → 50 seats-க்கு 50 accepted**; partial applicant records இல்லை.
- Local production HTTP test: **100 concurrent requests → 50 accepted / 50 Full**; create, attach draft, publish, retry, preview, move, cancel flows passed.
- Production build / TypeScript validation passed. Build traces-ல் private files சேரவில்லை.
- Tests-ல் real applicants-க்கு emails அனுப்பவில்லை; production data / Google Sheets எழுதப்படவில்லை.

**வரம்பு:** Local concurrency tests Supabase network latency அல்லது பல Vercel instances-ன் contention-ஐ அளவிடவில்லை. Production-ல் 300 simultaneous applicants performance guarantee என்று எடுத்துக்கொள்ளக்கூடாது. Browser access disabled என்பதால் desktop / mobile / keyboard visual verification இன்னும் நிலுவையில் உள்ளது.

புதிய SQL migration அல்லது environment variable தேவையில்லை. Existing JSONB storage, Google / SMTP connections, protected queue scheduler தொடரும். பழைய records-க்கு optional fields / fallback defaults பயன்படுத்தப்படுகின்றன; bulk data rewrite செய்யப்படவில்லை.

Release-க்கு முன் production backup / counts baseline எடுத்து, code deploy செய்து, ஒரு test workshop + draft form-ல் controls-ஐச் சரிபார்க்க வேண்டும். Public URLs, applicant records, existing Sheet destinations மாறக்கூடாது. Deployment success மற்றும் live checks-ஐ அந்த release-ன் அறிக்கையில் தனியாக பதிவு செய்யவும்.
