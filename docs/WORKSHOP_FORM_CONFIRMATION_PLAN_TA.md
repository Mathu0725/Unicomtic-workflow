# Workshop → Form → Booking confirmation — Implementation plan

தேதி: 31 October 2026  
நிலை: Implementation முடிந்தது; local integration, production build மற்றும் isolated browser flow verify செய்யப்பட்டுள்ளன. Release commit/deployment நிலையை verification report-ல் பார்க்கவும். Production workshop records தானாக மாற்றப்படவில்லை.

## 1. எதிர்பார்க்கும் எளிய flow

**Admin:** Workshop உருவாக்கவும் → எந்த form-ல் காட்ட வேண்டும் என்பதைத் தேர்வு செய்யவும் → Google Maps link மற்றும் email template அமைக்கவும் → “Create & show on selected forms”.

**Student:** Reference + registered email மூலம் workshop form திறக்கவும் → workshop தேர்வு செய்யவும் → submit → thank-you page-ல் booked workshop details பார்க்கவும் → அதே details உடன் confirmation email பெறவும்.

Workshop-ஐ ஒரு முறை உருவாக்கினால் போதும். Form-ல் workshop பெயர், தேதி, இடம் ஆகியவற்றை மீண்டும் manual questions / dropdown options ஆக எழுத வேண்டாம்.

## 2. தற்போதைய code-ல் கண்டவை

| பகுதி | தற்போது இருப்பது | மாற்றம் தேவைப்படுவது |
| --- | --- | --- |
| Workshop creation | `/admin/workshops`-ல் record உருவாகிறது | Create screen-லேயே target forms தேர்வு செய்ய வேண்டும் |
| Form attachment | Workshop details → Attach to draft → Builder → Publish என்ற தனிப் படிகள் | Create முடிந்ததும் தேர்வு செய்த live forms-ல் காட்ட ஒரு தெளிவான action வேண்டும் |
| Public visibility | `workshop_config.enabled`, explicit workshop IDs, hidden IDs, same intake, future date ஆகியவற்றால் கட்டுப்படும் | ஏன் ஒரு workshop தெரியவில்லை என்ற காரணத்தை admin-க்கு காட்ட வேண்டும் |
| Google Maps | `Location link (optional)` field ஏற்கனவே உள்ளது | `Google Maps link` என்று தெளிவாகக் கேட்க வேண்டும்; புதிய workshop publish செய்வதற்கு link தேவை |
| Thank-you page | Message மற்றும் reference மட்டும் | தேர்வு செய்து உறுதிப்படுத்தப்பட்ட workshop, date/time, venue, address, Maps button வேண்டும் |
| Booking email | `workshop_booking` template-ல் workshop/date/venue/address மற்றும் location button ஏற்கனவே உள்ளன | Preview, edit மற்றும் workshop-specific template தேர்வு எளிதாக வேண்டும் |
| Email count | Workshop booking confirmation மற்றும் form receipt தனித்தனியாக queue ஆகலாம் | Workshop RSVP-க்கு ஒரே தெளிவான confirmation policy வேண்டும் |

இந்தக் கண்டுபிடிப்புகள் தற்போதைய local source code அடிப்படையில் உள்ளன. குறிப்பிட்ட live workshop எந்த form-க்கு attach செய்யப்பட்டுள்ளது / publish செய்யப்பட்டுள்ளது என்பது production records-ல் implementation நேரத்தில் read-only ஆய்வால் உறுதி செய்யப்படும்.

முக்கிய code பகுதிகள்:

- `src/components/workshop-editor.tsx`
- `src/app/admin/workshops/page.tsx`
- `src/app/admin/workshops/[id]/page.tsx`
- `src/app/api/admin/workshops/[id]/forms/route.ts`
- `src/lib/workshops/policy.ts`
- `src/lib/admissions/service.ts`
- `src/app/api/forms/[slug]/route.ts`
- `src/components/form-thank-you.tsx`
- `src/lib/workshops/notifications.ts`
- `src/lib/email/template-catalog.ts`

## 3. Workshop உருவாக்கும் screen

### கேட்க வேண்டிய விவரங்கள்

- Workshop name, intake, date, start/end time.
- Venue, full address, **Google Maps link**.
- Total seats மற்றும் optional booking deadline.
- **Show in forms:** அதே intake-ன் eligible forms பட்டியல்; ஒன்று அல்லது பலவற்றைத் தேர்வு செய்யலாம்.
- **Booking email:** On / Off, template selection, Preview / Edit.

### Save actions

1. **Save workshop only** — record மட்டும் save; எந்த public form-லும் புதிதாகத் தோன்றாது.
2. **Create & show on selected forms** — workshop save செய்து தேர்வு செய்த published forms-ன் built-in workshop block-ல் சேர்க்கும். Block disabled என்றால் இந்த action அதை enable செய்கிறது. Existing attached workshops தொடரும்.

Create வெற்றி பெற்றபின் “Visible in: Workshop booking form” என்று link உடன் காட்ட வேண்டும். வெறும் “Created” message மட்டும் போதாது.

அனைத்து forms-க்கும் workshop-ஐ தானாகச் சேர்க்கக்கூடாது. Admin தேர்வு செய்த forms மட்டுமே update ஆக வேண்டும். Builder-ல் இருக்கும் attach / hide / required / preview வசதிகள் தொடரும்.

### Draft மற்றும் concurrent edits

- Live attach action workshop configuration மட்டும் மாற்றும்; வேறு unpublished questions / email edits publish ஆகக்கூடாது.
- Form version மற்றும் draft version இரண்டையும் server சரிபார்க்க வேண்டும்.
- Pending draft-ல் workshop settings வேறுபட்டிருந்தால் overwrite செய்யாமல் `Review in Builder` காட்ட வேண்டும்.
- Workshop settings conflict இல்லாத draft-க்கு attachment-ஐ merge செய்து, அதன் version/base version-ஐ சரியாக update செய்ய வேண்டும். பிற draft edits பாதுகாக்கப்பட வேண்டும்.
- பல forms update செய்யும் action ஒரே transaction-ல் preflight செய்து commit ஆக வேண்டும். Retry செய்தால் அதே workshop ID பயன்படுத்த வேண்டும்; duplicate workshop உருவாகக்கூடாது.
- Draft/closed form தேர்வானால் `Attached to draft — publish/open form to show students` என்று உண்மையான நிலையை காட்ட வேண்டும். அந்த form-ஐ இந்த action தானாக open செய்யக்கூடாது.

## 4. Form-ல் workshop தெரியாத காரணத்தை காட்டுதல்

Admin workshop card / form settings-ல் கீழ்க்கண்ட நிலைகள் தெளிவாக இருக்க வேண்டும்:

- Visible on published form.
- Saved only in draft.
- Not attached to a form.
- Workshop block disabled / hidden on this form.
- Different intake.
- Workshop already started.
- Booking deadline passed / bookings closed.
- Full — capacity முடிந்ததால் select செய்ய முடியாது.

Existing public rules-ஐப் பயன்படுத்த வேண்டும்: past workshops list-ல் வராது; full / closed workshops தெரிந்தால் disabled status உடன் வர வேண்டும். Same intake, capacity, deadline checks submission நேரத்திலும் server-ல் மீண்டும் நடக்க வேண்டும்.

## 5. Google Maps மற்றும் thank-you page

### Maps field

- புதிய workshop-ஐ live form-ல் காட்டும் action-க்கு Maps link கட்டாயம்.
- Draft / workshop-only save incomplete ஆக இருக்கலாம்; missing fields தெளிவாகக் காட்ட வேண்டும்.
- Google Maps share links, `maps.app.goo.gl`, `maps.google.com`, `google.com/maps` போன்ற supported formats validate செய்ய வேண்டும்; arbitrary unsafe links ஏற்கக்கூடாது.
- Link-ஐ server fetch செய்ய தேவையில்லை. `Open map` மூலம் admin location சரியா எனப் பார்க்கலாம்.
- பழைய map இல்லாத workshops மற்றும் saved bookings அழிக்கப்படக்கூடாது. Admin-க்கு `Add location link` action காட்ட வேண்டும்; பழைய confirmed booking receipt render ஆக வேண்டும்.

### Submit முடிந்தபின் காட்டுவது

```text
Thank you! Your workshop booking is confirmed.

[Form-க்கு நீங்கள் அமைத்த thank-you message]

Workshop:   தேர்வு செய்த workshop
Date:       நாள் / மாதம் / ஆண்டு
Time:       தொடக்கம் – முடிவு (Sri Lanka time)
Venue:      இடத்தின் பெயர்
Address:    முழு முகவரி
Reference:  மாணவரின் reference

[ Open in Google Maps ]
```

- Thank-you message-ஐ existing Form Builder confirmation setting-லேயே edit செய்யலாம்.
- Booking details **server உறுதிப்படுத்திய booking-லிருந்து** வர வேண்டும்; browser-ல் பழைய selected option-லிருந்து உருவாக்கக்கூடாது.
- Submit API response-ல் optional booking summary சேர்க்கப்படும். Workshop தேர்வு இல்லாத form-க்கு இந்த card வராது.
- Existing `workshop_snapshot`-க்கு end time, address, Maps link போன்ற optional fields சேர்த்து பழைய submissions-ஐ backward-compatible ஆக read செய்ய வேண்டும்.
- Idempotent submit retry-க்கும் அதே booking summary கிடைக்க வேண்டும்; புதிய seat / mail உருவாகக்கூடாது.
- Email queue-ல் இருந்தாலும் thank-you page உடனே திறக்க வேண்டும். Queue accepted என்பதை “Email sent” என்று தவறாகக் காட்டக்கூடாது.
- Mobile-ல் நீளமான address/reference wrap ஆக வேண்டும்; Maps button keyboard மற்றும் touch மூலம் பயன்படுத்த முடியும்.

## 6. Admin அமைக்கும் email template

Existing Email Templates / reusable template editor-ஐ விரிவுபடுத்த வேண்டும்; மூன்றாவது தனி template system உருவாக்க வேண்டாம்.

Workshop editor → **Booking confirmation email**:

1. Send confirmation On / Off.
2. `Use shared workshop template` அல்லது `Choose a saved workshop template`.
3. `Edit template`, `Duplicate as new template`, `Preview with this workshop`.
4. Subject, message மற்றும் Maps button text edit செய்யலாம்.

Shared template edit செய்தால் அதை பயன்படுத்தும் workshops-ன் future messages மாறும் என்பதை காட்ட வேண்டும். Workshop-specific wording வேண்டும் என்றால் existing template-ஐ duplicate செய்து அந்த workshop-க்கு assign செய்யலாம். Form-specific template eligibility-ஐ மீறி வேறு form-ன் template assign ஆகக்கூடாது; workshop-compatible reusable templates மட்டும் பட்டியலிட வேண்டும்.

Existing variables தொடரும்: `{{name}}`, `{{reference}}`, `{{workshop}}`, `{{date}}`, `{{venue}}`, `{{address}}`.

தேவையான கூடுதல் variables: `{{startTime}}`, `{{endTime}}`, `{{mapsUrl}}`. Existing `{{date}}` meaning மாற்றாமல் புதிய variables சேர்க்க வேண்டும். Preview மற்றும் validation இரண்டும் அதே server renderer பயன்படுத்த வேண்டும்.

Email example:

```text
Subject: Your booking is confirmed — {{workshop}}

Dear {{name}},

Thank you for booking your workshop.
Workshop: {{workshop}}
Date and time: {{date}}
Venue: {{venue}}
Address: {{address}}
Reference: {{reference}}

[Open in Google Maps]
```

### Duplicate email தடுப்பு

- Dedicated workshop RSVP form + confirmed booking: default-ஆக **ஒரு workshop confirmation email** மட்டும்.
- Generic form receipt கூட அனுப்ப வேண்டுமெனில் explicit option வேண்டும்; UI-ல் “Student receives 2 emails” என்று முன்பே காட்ட வேண்டும்.
- Workshop confirmation disabled / optional workshop not selected என்ற நிலைக்கு receipt routing தெளிவாக இருக்க வேண்டும்; fallback behavior மறைமுகமாக மாற்றப்படக்கூடாது.
- Registration/application forms-க்கு ஏற்கனவே இருக்கும் receipt தேர்வுகள் தொடரும்; workshop email சேரும்போது மொத்த recipient email count preview-ல் தெரிய வேண்டும்.
- Booking ID அடிப்படையிலான existing unique queue key தொடரும். Double-click / timeout retry duplicate mail உருவாக்கக்கூடாது.
- Template invalid என்றால் booking save ஆக வேண்டும்; email மட்டும் `Needs attention` நிலையில் admin-க்கு தெரிய வேண்டும். Unresolved placeholders மாணவருக்கு அனுப்பக்கூடாது.
- Date/venue/map மாற்றப்பட்டால் பழைய queued details தானாக அனுப்பப்படாமல் existing stale-message check செயல்பட வேண்டும். `Preview updated details → Send update` மூலம் current details அனுப்பலாம்.
- Saved/queued emails-ன் template version பாதுகாக்கப்படும்; template edit பழைய queued message content-ஐ silently மாற்றக்கூடாது.

## 7. Implementation order மற்றும் completion checks

| கட்டம் | வேலை | முடிந்தது என ஏற்க வேண்டிய சோதனை |
| --- | --- | --- |
| 1 | Live attachment state ஆய்வு; visibility reason; create-screen form selector | Admin உருவாக்கிய workshop தேர்வு செய்த published form-ல் தெரிகிறது; வேறு form-ல் வராது |
| 2 | Version-safe create/attach action; existing draft handling | Draft questions பாதுகாக்கப்படுகின்றன; conflict/retry duplicate record உருவாக்காது |
| 3 | Maps validation மற்றும் server booking summary | Submit வெற்றிக்குப் பிறகு booked workshop date/time/venue/address/map thank-you page-ல் சரியாக வருகின்றன |
| 4 | Template selection/edit/preview; single-confirmation routing | Preview மற்றும் queued email ஒரே workshop details காட்டுகின்றன; default RSVP booking-க்கு ஒரு mail மட்டும் |
| 5 | Regression, responsive checks, release | Build/type checks மற்றும் தொடர்புடைய integration tests pass; desktop/mobile flow verify |

கட்டாய edge cases:

- Same intake restriction; hidden/past/full/closed workshop selection rejected.
- கடைசி seat-க்கு இரண்டு simultaneous submissions: ஒருவருக்கு மட்டும் confirmed booking.
- Wrong email/reference மூலம் workshop access கிடைக்காது; verified user-ன் booking மட்டும் return ஆகும்.
- Same request retry: ஒரு booking, ஒரு applicable confirmation queue job.
- Email provider slow/down: booking மற்றும் thank-you page வெற்றி; delivery status மட்டும் pending/retry.
- Google Sheets queue booking ID-ஐ தொடர்ந்து பயன்படுத்தும்; புதிய confirmation changes காரணமாக duplicate rows உருவாகக்கூடாது.
- Template missing/disabled/invalid, Maps missing on legacy records, workshop details changed after queue ஆகிய நிலைகள் handled.
- Keyboard navigation, error focus, mobile layout மற்றும் form gate → selection → submit → thank-you முழு flow.

Release முடிந்தபின்: commit/deployment நிலை verify செய்ய வேண்டும். Live verification-க்கு real மாணவருக்கு test email அனுப்பவோ real seat book செய்யவோ கூடாது; local isolated fixtures மூலம் side effects verify செய்து, public live UI-ஐ read-only ஆகச் சரிபார்க்க வேண்டும்.

இந்த plan முந்தைய `WORKSHOP_FORM_IMPLEMENTATION_PLAN_TA.md`-இன் “attach draft → publish மட்டும்” flow-ஐ விரிவாக்குகிறது. புதிய explicit `Create & show on selected forms` action live workshop configuration-ஐ மட்டும் பாதுகாப்பாக update செய்யும்; existing Builder draft/publish flow தொடர்ந்து கிடைக்கும்.
